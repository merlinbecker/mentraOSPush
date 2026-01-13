// Load environment variables from .env file
require('dotenv').config();

const { TpaServer } = require('@mentra/sdk');
const SessionManager = require('./src/SessionManager');
const WebhookHandler = require('./src/WebhookHandler');

// Load configuration from environment variables
const PACKAGE_NAME = process.env.PACKAGE_NAME || "com.mentraos.github-webhook-relay";
const PORT = parseInt(process.env.PORT || "3000");
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY;
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

if (!MENTRAOS_API_KEY) {
  console.error("❌ MENTRAOS_API_KEY environment variable is required");
  process.exit(1);
}

/**
 * GitHubMentraOSApp - Express App with MentraOS SDK
 * Receives GitHub Webhooks and sends them as Reference Cards to smart glasses
 */
class GitHubMentraOSApp extends TpaServer {
  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
      publicDir: './public',
      healthCheck: true,
      tpaInstructions: 'GitHub Webhook Relay für MentraOS G1 Brillen'
    });

    // Dependency Injection: Initialize managers
    this.sessionManager = new SessionManager(this.logger);
    this.webhookHandler = new WebhookHandler(this.sessionManager, this.logger, GITHUB_WEBHOOK_SECRET);
    
    this.setupSDKErrorWorkaround();
    
    console.log(`🔧 Initializing GitHub MentraOS App`);
    console.log(`📱 Package: ${PACKAGE_NAME}`);
    console.log(`🌐 Port: ${PORT}`);
    console.log(`🔑 API Key: ${MENTRAOS_API_KEY ? '✅' : '❌'}`);
    console.log(`🔒 Webhook Secret: ${GITHUB_WEBHOOK_SECRET ? '✅' : '⚠️ Optional'}`);
  }

  /**
   * WORKAROUND: Setup error handler to suppress known SDK issues
   * 
   * Issue: MentraOS SDK throws "Unrecognized message type: capabilities_update"
   * Cause: Platform sends new message types that SDK doesn't support yet
   * Impact: Harmless - doesn't affect functionality
   * Status: SDK is up-to-date (checked 2025-10-17), but still occurs
   * 
   * This workaround intercepts and suppresses these specific errors to
   * prevent log pollution while maintaining visibility of real errors.
   * 
   * TODO: Remove this workaround when SDK supports capabilities_update
   */
  setupSDKErrorWorkaround() {
    const originalConsoleError = console.error.bind(console);
    
    console.error = (...args) => {
      const message = args.join(' ');
      
      // Suppress known harmless SDK errors
      if (message.includes('Unrecognized message type: capabilities_update')) {
        // Silently ignore - this is a known SDK limitation
        console.log('🔇 [SDK Workaround] Suppressed: capabilities_update message (harmless)');
        return;
      }
      
      // Pass through all other errors
      originalConsoleError(...args);
    };
    
    console.log('⚠️  SDK Error Workaround active: Suppressing "capabilities_update" errors');
  }

  /**
   * MentraOS Session Handler - called when glasses connect
   */
  async onSession(session, sessionId, userId) {
    await this.sessionManager.registerSession(session, sessionId, userId);
  }

  /**
   * Express App Setup
   */
  setupCustomRoutes() {
    const app = this.getExpressApp();
    const express = require('express');

    // Body parser configuration for GitHub webhooks
    // We need to support both JSON and URL-encoded payloads
    // AND preserve raw body for signature verification
    
    app.use('/github', express.json({
      verify: (req, res, buf, encoding) => {
        // Save raw body for signature verification
        req.rawBody = buf;
      }
    }));
    
    app.use('/github', express.urlencoded({ 
      extended: false,
      verify: (req, res, buf, encoding) => {
        // Save raw body for signature verification
        req.rawBody = buf;
      }
    }));

    // GitHub Webhook Endpoint - Broadcast zu allen aktiven Sessions
    app.post('/github', async (req, res) => {
      const event = req.get('x-github-event') || 'push';
      const signature = req.get('x-hub-signature-256');
      const contentType = req.get('content-type') || '';
      
      this.logger.info(`📨 GitHub webhook received:`);
      this.logger.info(`   Event: ${event}`);
      this.logger.info(`   Content-Type: ${contentType}`);
      this.logger.info(`   Signature header: ${signature ? 'present' : 'missing'}`);

      let payload, payloadString;

      // Handle different content types
      if (contentType.includes('application/x-www-form-urlencoded')) {
        // URL-encoded: payload is in req.body.payload field
        this.logger.info(`   Format: URL-encoded`);
        payloadString = req.body.payload;
        payload = req.rawBody || Buffer.from(payloadString, 'utf8');
        this.logger.info(`   Payload extracted from form field`);
      } else {
        // JSON: payload is req.body (already parsed)
        this.logger.info(`   Format: JSON`);
        payload = req.rawBody || Buffer.from(JSON.stringify(req.body), 'utf8');
        payloadString = JSON.stringify(req.body);
      }

      this.logger.info(`   Body type: ${typeof payload}, isBuffer: ${Buffer.isBuffer(payload)}`);
      this.logger.info(`   Payload string length: ${payloadString ? payloadString.length : 'null'}`);

      // Verify signature if provided
      if (signature && !this.webhookHandler.verifySignature(payload, signature)) {
        this.logger.error('❌ Invalid GitHub webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      try {
        const result = await this.webhookHandler.broadcastWebhook(event, payloadString, null);
        
        this.logger.info(`✅ Webhook broadcast successful: ${result.sessionsNotified}/${result.totalSessions} sessions`);
        
        res.status(200).json({
          message: 'Webhook broadcast successful',
          event,
          sessionsNotified: result.sessionsNotified,
          results: result.results
        });
      } catch (error) {
        this.logger.error(`💥 Webhook broadcast error: ${error.message}`);
        
        if (error.message.includes('No active sessions')) {
          res.status(200).json({ error: 'No active sessions to notify', event });
        } else {
          res.status(500).json({ error: error.message });
        }
      }
    });

    // GitHub Webhook Endpoint - Legacy für spezifische Session (optional)
    app.post('/github/:sessionId', async (req, res) => {
      const { sessionId } = req.params;
      const event = req.get('x-github-event') || 'push';
      const signature = req.get('x-hub-signature-256');
      const contentType = req.get('content-type') || '';

      this.logger.info(`📨 GitHub webhook received for session ${sessionId}:`);
      this.logger.info(`   Event: ${event}`);
      this.logger.info(`   Content-Type: ${contentType}`);
      this.logger.info(`   Signature header: ${signature ? 'present' : 'missing'}`);

      let payload, payloadString;

      // Handle different content types
      if (contentType.includes('application/x-www-form-urlencoded')) {
        // URL-encoded: payload is in req.body.payload field
        this.logger.info(`   Format: URL-encoded`);
        payloadString = req.body.payload;
        payload = req.rawBody || Buffer.from(payloadString, 'utf8');
      } else {
        // JSON: payload is req.body (already parsed)
        this.logger.info(`   Format: JSON`);
        payload = req.rawBody || Buffer.from(JSON.stringify(req.body), 'utf8');
        payloadString = JSON.stringify(req.body);
      }

      this.logger.info(`   Body type: ${typeof payload}, isBuffer: ${Buffer.isBuffer(payload)}`);

      // Verify signature if provided
      if (signature && !this.webhookHandler.verifySignature(payload, signature)) {
        this.logger.error('❌ Invalid GitHub webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      try {
        const result = await this.webhookHandler.processWebhookForSession(sessionId, event, payloadString, null);
        
        this.logger.info(`✅ Webhook processed successfully for session ${sessionId}`);
        
        res.status(200).json({
          message: 'Webhook processed successfully',
          sessionId,
          event,
          success: true,
          card: result.card
        });
      } catch (error) {
        this.logger.error(`💥 Webhook error: ${error.message}`);
        
        if (error.message.includes('No active session')) {
          res.status(404).json({ error: 'Session not found', sessionId });
        } else {
          res.status(500).json({ error: error.message });
        }
      }
    });

    // Status Endpoint
    app.get('/status', (req, res) => {
      const sessions = this.sessionManager.getAllSessions();

      res.json({
        status: 'running',
        package: PACKAGE_NAME,
        port: PORT,
        activeSessions: sessions.length,
        sessions
      });
    });

    // Dashboard UI
    app.get('/dashboard', (req, res) => {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const html = `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub MentraOS Relay Dashboard</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: #0366d6; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .card { background: #f6f8fa; border: 1px solid #d1d9e0; border-radius: 6px; padding: 16px; margin-bottom: 16px; }
        .session { background: white; border-left: 4px solid #28a745; }
        .status { display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
        .status.active { background: #d4edda; color: #155724; }
        .btn { background: #0366d6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
        .btn:hover { background: #0256cc; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
        pre { background: #f6f8fa; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔗 GitHub MentraOS Relay</h1>
        <p>Package: <strong>${PACKAGE_NAME}</strong></p>
        <p>Server läuft auf Port <strong>${PORT}</strong></p>
    </div>

    <div class="grid">
        <div class="card">
            <h2>📊 Server Status</h2>
            <p><span class="status active">🟢 Online</span></p>
            <p><strong>Aktive Sessions:</strong> <span id="sessionCount">-</span></p>
            <button class="btn" onclick="loadStatus()">🔄 Aktualisieren</button>
        </div>

        <div class="card">
            <h2>🔗 MentraOS Setup</h2>
            <p><strong>Webhook URL für Console:</strong></p>
            <pre>${baseUrl}/webhook</pre>
            <p><strong>Package Name:</strong></p>
            <pre>${PACKAGE_NAME}</pre>
        </div>
    </div>

    <div class="card">
        <h2>👥 Aktive Sessions</h2>
        <div id="sessions">
            <p>Lade Sessions...</p>
        </div>
    </div>

    <div class="card">
        <h2>📖 Verwendung</h2>
        <ol>
            <li>In <a href="https://console.mentra.glass" target="_blank">MentraOS Console</a> neue App erstellen</li>
            <li>Package Name: <code>${PACKAGE_NAME}</code></li>
            <li>Webhook URL: <code>${baseUrl}/webhook</code></li>
            <li>App auf G1 Brille installieren</li>
            <li>GitHub Repository → Settings → Webhooks</li>
            <li><strong>Empfohlen:</strong> URL: <code>${baseUrl}/github</code> (sendet an alle Brillen)</li>
            <li>Alternativ: <code>${baseUrl}/github/[SESSION_ID]</code> (spezifische Brille)</li>
        </ol>
    </div>

    <script>
        const baseUrl = window.location.origin;
        
        async function loadStatus() {
            try {
                const response = await fetch('/status');
                const data = await response.json();
                
                document.getElementById('sessionCount').textContent = data.activeSessions;
                
                const sessionsDiv = document.getElementById('sessions');
                if (data.sessions.length === 0) {
                    sessionsDiv.innerHTML = '<p>Keine aktiven Sessions. Verbinde deine G1 Brille!</p>';
                } else {
                    sessionsDiv.innerHTML = data.sessions.map(session => \`
                        <div class="session card">
                            <h3>👤 \${session.userId}</h3>
                            <p><strong>Session ID:</strong> <code>\${session.sessionId}</code></p>
                            <p><strong>Verbunden:</strong> \${new Date(session.connectedAt).toLocaleString('de-DE')}</p>
                            <p><strong>Letzte Aktivität:</strong> \${session.lastActivity ? new Date(session.lastActivity).toLocaleString('de-DE') : 'Nie'}</p>
                            <p><strong>GitHub Webhook URL:</strong></p>
                            <pre>\${baseUrl}/github/\${session.sessionId}</pre>
                            <button class="btn" onclick="testSession('\${session.sessionId}')">🧪 Test Message</button>
                        </div>
                    \`).join('');
                }
            } catch (error) {
                console.error('Fehler beim Laden:', error);
            }
        }

        async function testSession(sessionId) {
            try {
                const response = await fetch(\`/test/\${sessionId}\`, { method: 'POST' });
                const result = await response.json();
                
                if (result.success) {
                    alert('✅ Test Message gesendet!');
                } else {
                    alert('❌ Fehler: ' + result.error);
                }
            } catch (error) {
                alert('❌ Fehler: ' + error.message);
            }
        }

        // Auto-refresh alle 5 Sekunden
        loadStatus();
        setInterval(loadStatus, 5000);
    </script>
</body>
</html>`;
      res.send(html);
    });

    // Test Message Endpoint
    app.post('/test/:sessionId', async (req, res) => {
      const { sessionId } = req.params;

      try {
        await this.sessionManager.sendTestMessage(sessionId);
        res.json({ success: true, message: 'Test message sent' });
      } catch (error) {
        if (error.message.includes('No active session')) {
          return res.status(404).json({ error: 'Session not found' });
        }
        res.status(500).json({ error: error.message });
      }
    });

    this.logger.info('✅ Custom routes setup complete');
  }

  /**
   * Server starten
   */
  async start() {
    try {
      // Custom routes setup
      this.setupCustomRoutes();
      
      // TpaServer starten
      await super.start();
      
      console.log(`🚀 GitHub MentraOS App running!`);
      console.log(`📍 GitHub Webhook (Broadcast): http://localhost:${PORT}/github`);
      console.log(`📍 GitHub Webhook (Per Session): http://localhost:${PORT}/github/{sessionId}`);
      console.log(`🖥️ Dashboard: http://localhost:${PORT}/dashboard`);
      console.log(`📊 Status API: http://localhost:${PORT}/status`);
      console.log(`🔗 MentraOS Webhook: http://localhost:${PORT}/webhook`);
      console.log(`❤️ Health Check: http://localhost:${PORT}/health`);
      
      return this;
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      throw error;
    }
  }
}

// Server starten wenn direkt ausgeführt
if (require.main === module) {
  const app = new GitHubMentraOSApp();
  
  app.start().catch(err => {
    console.error("💥 Failed to start GitHub MentraOS App:", err);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down GitHub MentraOS App...');
    
    // WORKAROUND: SDK throws error on stop() - session.disconnect is not a function
    try {
      app.stop();
    } catch (err) {
      if (err.message && err.message.includes('session.disconnect is not a function')) {
        console.log('🔇 [SDK Workaround] Suppressed shutdown error (SDK bug)');
      } else {
        console.error('❌ Error during shutdown:', err);
      }
    }
    
    process.exit(0);
  });

  // WORKAROUND: Handle uncaught SDK errors
  // These handlers catch errors that escape the SDK's internal error handling
  // and prevent them from crashing the application or polluting logs
  
  process.on('uncaughtException', (err) => {
    // WORKAROUND: Suppress known SDK error - capabilities_update
    if (err.message && err.message.includes('Unrecognized message type')) {
      console.log(`🔇 [SDK Workaround] Suppressed uncaught exception: ${err.message}`);
      return;
    }
    
    // WORKAROUND: Suppress SDK shutdown error - session.disconnect is not a function
    if (err.message && err.message.includes('session.disconnect is not a function')) {
      console.log('🔇 [SDK Workaround] Suppressed shutdown error (SDK bug)');
      process.exit(0);
      return;
    }
    
    // Log other uncaught exceptions (real errors)
    console.error('💥 Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    // WORKAROUND: Suppress known SDK error - capabilities_update
    if (reason && reason.message && reason.message.includes('Unrecognized message type')) {
      console.log(`🔇 [SDK Workaround] Suppressed unhandled rejection: ${reason.message}`);
      return;
    }
    
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  });
}

module.exports = GitHubMentraOSApp;