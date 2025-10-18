// Load environment variables from .env file
require('dotenv').config();

const { TpaServer } = require('@mentra/sdk');
const crypto = require('node:crypto');

// GitHub Event Formatter - inline für minimalen Code
function formatCommit(commit) {
  const id = commit.id ? commit.id.substring(0, 7) : 'unknown';
  const message = commit.message ? commit.message.split('\n')[0] : 'No message';
  const author = commit.author && commit.author.name ? commit.author.name : 'unknown';
  return `#${id} · ${message} (${author})`;
}

function createCardFromEvent(event, payload) {
  const repo = payload.repository?.full_name || payload.repository?.name || 'repository';
  const sender = payload.sender?.login || 'unknown';
  
  switch (event) {
    case 'push':
      const pusher = payload.pusher?.name || sender;
      const branch = payload.ref?.replace('refs/heads/', '') || 'unknown';
      const commitCount = payload.commits?.length || 0;
      const commits = (payload.commits || []).slice(0, 3).map(formatCommit);
      
      return {
        title: `${repo} · ${branch}`,
        body: [
          `${pusher} pushed ${commitCount} commit${commitCount === 1 ? '' : 's'}`,
          ...commits,
          payload.compare ? `Compare: ${payload.compare}` : ''
        ].filter(Boolean).join('\n'),
        durationSeconds: 15,
      };
      
    case 'pull_request':
      const pr = payload.pull_request || {};
      return {
        title: `PR #${payload.number} · ${pr.title || 'Pull Request'}`,
        body: [
          `${repo} ${payload.action} by ${sender}`,
          `State: ${pr.state}`,
          pr.html_url || ''
        ].filter(Boolean).join('\n'),
        durationSeconds: 15,
      };
      
    case 'issues':
      const issue = payload.issue || {};
      return {
        title: `Issue #${issue.number} · ${issue.title || 'Issue'}`,
        body: [
          `${repo} ${payload.action} by ${sender}`,
          issue.html_url || ''
        ].filter(Boolean).join('\n'),
        durationSeconds: 15,
      };
      
    default:
      return {
        title: `GitHub ${event}`,
        body: [
          `Repository: ${repo}`,
          `Action: ${payload.action || 'received'}`,
          `Sender: ${sender}`
        ].join('\n'),
        durationSeconds: 10,
      };
  }
}

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
 * GitHubMentraOSApp - Minimale Express App mit MentraOS SDK
 * Empfängt GitHub Webhooks und sendet sie als Reference Cards an die Brille
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

    // Store für aktive Sessions
    this.activeSessions = new Map();
    
    // WORKAROUND: Suppress SDK errors for unknown message types
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
   * MentraOS Session Handler - wird aufgerufen wenn sich eine Brille verbindet
   */
  async onSession(session, sessionId, userId) {
    this.logger.info(`🔵 New MentraOS session: ${sessionId} for user ${userId}`);

    // Session speichern
    this.activeSessions.set(sessionId, {
      session,
      sessionId,
      userId,
      connectedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    });

    // Welcome Message
    await this.sendWelcomeMessage(session, sessionId, userId);

        // Event Handlers
    session.events.onDisconnected(() => {
      this.logger.info(`🔴 Session ${sessionId} disconnected`);
      // Remove from our session store
      this.activeSessions.delete(sessionId);
    });

    // Note: onUserInteraction may not be available in this SDK version
    // Comment out for now to avoid errors
    // session.events.onUserInteraction(() => {
    //   const stored = this.activeSessions.get(sessionId);
    //   if (stored) {
    //     stored.lastActivity = new Date().toISOString();
    //   }
    // });
  }

  /**
   * Welcome Message an neue Session
   */
  async sendWelcomeMessage(session, sessionId, userId) {
    try {
      await session.layouts.showReferenceCard("Verbunden mit PushProxy!",
        `Session: ${sessionId} , User: ${userId}`,{
          durationMs: 10000
        });
      this.logger.info(`✅ Welcome message sent to ${sessionId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send welcome message: ${error.message}`);
    }
  }

  /**
   * GitHub Webhook verarbeiten
   */
  async handleGitHubWebhook(sessionId, event, payload, signature) {
    this.logger.info(`🎯 GitHub webhook received: ${event} for session ${sessionId}`);

    // Session finden
    const storedSession = this.activeSessions.get(sessionId);
    if (!storedSession) {
      throw new Error(`No active session found for ${sessionId}`);
    }

    // Signature verifizieren (nur wenn signature übergeben wurde)
    if (signature && !this.verifyGitHubSignature(payload, signature)) {
      throw new Error('Invalid GitHub webhook signature');
    }

    // Card erstellen
    const card = createCardFromEvent(event, JSON.parse(payload));
    this.logger.info(`🃏 Created card: ${card.title}`);

    // Card an Brille senden
    try {
      await storedSession.session.layouts.showReferenceCard(
        card.title,
        card.body,
        {
          durationMs: Math.min(Math.max(card.durationSeconds || 15, 5), 60) * 1000
        }
      );

      // Aktivität updaten
      storedSession.lastActivity = new Date().toISOString();
      
      this.logger.info(`✅ Reference card sent to ${sessionId}: ${card.title}`);
      return { success: true, card };
    } catch (error) {
      this.logger.error(`❌ Failed to send reference card: ${error.message}`);
      throw error;
    }
  }

  /**
   * GitHub Webhook zu allen aktiven Sessions broadcasten
   */
  async handleGitHubWebhookBroadcast(event, payload, signature) {
    this.logger.info(`🎯 GitHub webhook broadcast: ${event} to ${this.activeSessions.size} sessions`);

    // Signature verifizieren (nur wenn signature übergeben wurde)
    if (signature && !this.verifyGitHubSignature(payload, signature)) {
      throw new Error('Invalid GitHub webhook signature');
    }

    // Keine aktiven Sessions
    if (this.activeSessions.size === 0) {
      throw new Error('No active sessions to notify');
    }

    // Card erstellen
    const card = createCardFromEvent(event, JSON.parse(payload));
    this.logger.info(`🃏 Broadcasting card: ${card.title}`);

    // An alle Sessions senden
    const results = [];
    for (const [sessionId, storedSession] of this.activeSessions) {
      try {
        await storedSession.session.layouts.showReferenceCard(
          card.title,
          card.body,
          {
            durationMs: Math.min(Math.max(card.durationSeconds || 15, 5), 60) * 1000
          }
        );

        // Aktivität updaten
        storedSession.lastActivity = new Date().toISOString();
        
        results.push({ sessionId, success: true });
        this.logger.info(`✅ Card sent to session ${sessionId}`);
      } catch (error) {
        results.push({ sessionId, success: false, error: error.message });
        this.logger.error(`❌ Failed to send card to session ${sessionId}: ${error.message}`);
      }
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.info(`📊 Broadcast complete: ${successCount}/${results.length} sessions notified`);

    return {
      sessionsNotified: successCount,
      totalSessions: results.length,
      results,
      card
    };
  }

  /**
   * GitHub Signature verifizieren
   */
  verifyGitHubSignature(payload, signature) {
    this.logger.info(`🔐 Verifying GitHub signature...`);
    this.logger.info(`   Payload type: ${typeof payload}, isBuffer: ${Buffer.isBuffer(payload)}`);
    this.logger.info(`   Payload constructor: ${payload?.constructor?.name || 'unknown'}`);
    this.logger.info(`   Signature received: ${signature ? signature.substring(0, 20) + '...' : 'null'}`);
    this.logger.info(`   Secret configured: ${GITHUB_WEBHOOK_SECRET ? '✅ Yes' : '❌ No'}`);

    if (!GITHUB_WEBHOOK_SECRET) {
      this.logger.warn('⚠️ No GitHub webhook secret configured, skipping signature verification');
      return true; // Skip verification if no secret
    }

    if (!signature) {
      this.logger.error('❌ No signature provided');
      return false;
    }

    // Convert payload to Buffer, handling different input types
    let payloadBuffer;
    if (Buffer.isBuffer(payload)) {
      payloadBuffer = payload;
      this.logger.info(`   Payload is already a Buffer (${payload.length} bytes)`);
    } else if (typeof payload === 'string') {
      payloadBuffer = Buffer.from(payload, 'utf8');
      this.logger.info(`   Converted string to Buffer (${payloadBuffer.length} bytes)`);
    } else if (typeof payload === 'object') {
      // Object (JSON already parsed) - convert back to string
      const payloadString = JSON.stringify(payload);
      payloadBuffer = Buffer.from(payloadString, 'utf8');
      this.logger.info(`   Converted object to Buffer (${payloadBuffer.length} bytes)`);
    } else {
      this.logger.error(`❌ Unsupported payload type: ${typeof payload}`);
      return false;
    }
    
    const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET);
    hmac.update(payloadBuffer);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;

    this.logger.info(`   Expected signature: ${expectedSignature.substring(0, 20)}...`);
    this.logger.info(`   Received signature: ${signature.substring(0, 20)}...`);

    try {
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8')
      );
      
      this.logger.info(`   Signature valid: ${isValid ? '✅' : '❌'}`);
      return isValid;
    } catch (error) {
      this.logger.error(`   Signature comparison error: ${error.message}`);
      return false;
    }
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

      // Signatur verifizieren wenn von GitHub empfangen
      if (signature && !this.verifyGitHubSignature(payload, signature)) {
        this.logger.error('❌ Invalid GitHub webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      try {
        // Webhook OHNE Signatur weiterleiten (wird bereits verifiziert)
        const result = await this.handleGitHubWebhookBroadcast(event, payloadString, null);
        
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

      // Signatur verifizieren wenn von GitHub empfangen
      if (signature && !this.verifyGitHubSignature(payload, signature)) {
        this.logger.error('❌ Invalid GitHub webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      try {
        // Webhook OHNE Signatur weiterleiten (wird bereits verifiziert)
        const result = await this.handleGitHubWebhook(sessionId, event, payloadString, null);
        
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
      const sessions = Array.from(this.activeSessions.values()).map(s => ({
        sessionId: s.sessionId,
        userId: s.userId,
        connectedAt: s.connectedAt,
        lastActivity: s.lastActivity
      }));

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
      const storedSession = this.activeSessions.get(sessionId);

      if (!storedSession) {
        return res.status(404).json({ error: 'Session not found' });
      }

      try {
        await storedSession.session.layouts.showReferenceCard(
          '🧪 Test Message',
          `Test erfolgreich!\n\nSession: ${sessionId}\nZeit: ${new Date().toLocaleString('de-DE')}`,
          {
            durationMs: 10000
          }
        );

        res.json({ success: true, message: 'Test message sent' });
      } catch (error) {
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