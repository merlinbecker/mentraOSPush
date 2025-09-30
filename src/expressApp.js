const express = require('express');
const crypto = require('node:crypto');

const sessionStore = require('./services/sessionStore');
const { sendReferenceCard } = require('./services/mentraClient');
const { createCardFromEvent } = require('./utils/githubFormatter');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function captureRawBody(req, _res, buf) {
  if (buf && buf.length) {
    req.rawBody = Buffer.from(buf);
  } else {
    req.rawBody = Buffer.alloc(0);
  }
}

function getPublicBaseUrl(req) {
  const forwardedHost = req.get('x-forwarded-host');
  const forwardedProto = req.get('x-forwarded-proto');
  if (forwardedHost) {
    const proto = forwardedProto || 'https';
    return `${proto}://${forwardedHost}`;
  }
  const host = req.get('host') || 'localhost';
  const protocol = forwardedProto || req.protocol || 'https';
  return `${protocol}://${host}`;
}

function createManifest(publicUrl, registerPath = '/api/sessions') {
  return {
    name: 'GitHub Push Relay',
    description: 'Relays GitHub webhook events to mentraOS G1 glasses as reference cards.',
    version: '1.0.0',
    author: 'mentraOS GitHub Integration',
    documentation: 'https://docs.github.com/en/webhooks/about-webhooks',
    supportUrl: `${publicUrl}/api/dashboard`,
    endpoints: {
      registerSession: `${publicUrl}${registerPath}`,
      deleteSession: `${publicUrl}/api/sessions/{identifier}`,
      githubWebhook: `${publicUrl}/api/github/{identifier}`,
      dashboard: `${publicUrl}/api/dashboard`,
      status: `${publicUrl}/api/status`,
    },
    capabilities: {
      referenceCards: true,
      webhooks: true,
      dashboard: true,
    },
    authentication: {
      methods: ['apiKey', 'accessToken'],
      required: true,
    },
    configuration: {
      environmentVariables: [
        'MENTRA_BASE_URL',
        'MENTRA_API_KEY',
        'MENTRA_ACCESS_TOKEN',
        'GITHUB_WEBHOOK_SECRET',
        'MENTRA_REFERENCE_CARD_PATH'
      ],
    },
  };
}

function buildSessionData(payload, { allowMentraFields = false } = {}) {
  const identifier = allowMentraFields ? (payload.sessionId || payload.identifier) : payload.identifier;
  if (!identifier) {
    throw new HttpError(400, allowMentraFields ? 'sessionId or identifier is required' : 'identifier and deviceId are required');
  }

  let deviceId = allowMentraFields ? (payload.userId || payload.deviceId) : payload.deviceId;
  if (!deviceId) {
    if (allowMentraFields) {
      deviceId = 'unknown';
    } else {
      throw new HttpError(400, 'identifier and deviceId are required');
    }
  }

  const sessionData = {
    identifier,
    deviceId,
    ownerId: payload.ownerId || (allowMentraFields ? deviceId : payload.ownerId),
    baseUrl: payload.baseUrl || process.env.MENTRA_BASE_URL,
    pushUrl: payload.pushUrl,
    accessToken: payload.accessToken || process.env.MENTRA_ACCESS_TOKEN,
    apiKey: payload.apiKey || process.env.MENTRA_API_KEY,
    referenceCardPath: payload.referenceCardPath,
  };

  if (allowMentraFields) {
    sessionData.type = payload.type;
    sessionData.timestamp = payload.timestamp;
    sessionData.augmentOSWebsocketUrl = payload.augmentOSWebsocketUrl;
  }

  if (!sessionData.pushUrl && !sessionData.baseUrl) {
    throw new HttpError(400, 'Either pushUrl or baseUrl must be provided');
  }

  if (!sessionData.accessToken && !sessionData.apiKey) {
    throw new HttpError(400, 'Either accessToken or apiKey must be provided for mentraOS authentication');
  }

  return sessionData;
}

function verifySignature(secret, signatureHeader, payloadBuffer) {
  if (!secret) {
    return true;
  }
  if (!signatureHeader) {
    return false;
  }
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadBuffer);
  const expected = `sha256=${hmac.digest('hex')}`;
  const expectedBuffer = Buffer.from(expected, 'utf-8');
  const providedBuffer = Buffer.from(signatureHeader, 'utf-8');
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function createDashboardHtml() {
  const picoCdn = 'https://unpkg.com/@picocss/pico@2.0.6/css/pico.min.css';
  const alpineCdn = 'https://cdn.jsdelivr.net/npm/alpinejs@3.13.5/dist/cdn.min.js';

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>mentraOS GitHub Gateway</title>
  <link rel="stylesheet" href="${picoCdn}" />
  <script defer src="${alpineCdn}"></script>
</head>
<body>
  <main class="container" x-data="dashboard()" x-init="load()">
    <section>
      <h1>mentraOS GitHub Gateway</h1>
      <p>This dashboard shows the currently connected G1 glasses sessions and the latest webhook deliveries.</p>
      <button @click="load" class="contrast">Refresh</button>
    </section>
    <section>
      <h2>Connected Glasses <span x-text="sessions.length"></span></h2>
      <div x-show="sessions.length === 0">No active sessions.</div>
      <table role="grid" x-show="sessions.length > 0">
        <thead>
          <tr>
            <th>Identifier</th>
            <th>Device ID</th>
            <th>Owner</th>
            <th>Connected</th>
            <th>Last Activity</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <template x-for="session in sessions" :key="session.identifier">
            <tr>
              <td x-text="session.identifier"></td>
              <td x-text="session.deviceId"></td>
              <td x-text="session.ownerId || '—'"></td>
              <td x-text="formatDate(session.connectedAt)"></td>
              <td x-text="formatDate(session.lastActivityAt)"></td>
              <td>
                <button
                  @click="sendTestMessage(session.identifier)"
                  :disabled="session.testLoading"
                  class="secondary outline"
                  style="font-size: 0.8rem; padding: 0.25rem 0.5rem;"
                >
                  <span x-show="!session.testLoading">🧪 Test</span>
                  <span x-show="session.testLoading">⏳</span>
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </section>
    <section>
      <h2>Recent Pushes</h2>
      <div x-show="recentPushes.length === 0">No webhook deliveries received.</div>
      <template x-for="entry in recentPushes" :key="entry.timestamp">
        <article class="grid">
          <header>
            <strong x-text="entry.title"></strong>
            <p x-text="entry.event"></p>
          </header>
          <p x-text="entry.summary"></p>
          <footer>
            <small x-text="formatDate(entry.timestamp)"></small>
          </footer>
        </article>
      </template>
    </section>
  </main>
  <script>
    function dashboard() {
      return {
        sessions: [],
        recentPushes: [],
        async load() {
          try {
            const response = await fetch('./status');

            if (!response.ok) {
              console.error('Failed to load status:', response.status, response.statusText);
              return;
            }

            const data = await response.json();
            this.sessions = data.sessions || [];
            this.recentPushes = data.recentPushes || [];

            this.sessions.forEach(session => {
              session.testLoading = false;
            });
          } catch (error) {
            console.error('Error loading dashboard data:', error);
          }
        },
        async sendTestMessage(identifier) {
          try {
            const session = this.sessions.find(s => s.identifier === identifier);
            if (session) {
              session.testLoading = true;
            }

            const response = await fetch('./test-message/' + encodeURIComponent(identifier), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              }
            });

            const result = await response.json();

            if (response.ok && result.success) {
              this.showNotification('Test message sent successfully!', 'success');
              setTimeout(() => this.load(), 1000);
            } else {
              this.showNotification('Failed to send test message: ' + (result.error || 'Unknown error'), 'error');
            }
          } catch (error) {
            console.error('Error sending test message:', error);
            this.showNotification('Error: ' + error.message, 'error');
          } finally {
            const session = this.sessions.find(s => s.identifier === identifier);
            if (session) {
              session.testLoading = false;
            }
          }
        },
        showNotification(message, type) {
          type = type || 'info';
          const style = type === 'success' ? 'color: green' :
                       type === 'error' ? 'color: red' : 'color: blue';
          console.log('%c' + message, style);

          if (window.Notification && Notification.permission === 'granted') {
            new Notification('mentraOS Gateway', { body: message });
          }
        },
        formatDate(value) {
          if (!value) return '—';
          try {
            return new Date(value).toLocaleString();
          } catch (error) {
            return value;
          }
        },
      };
    }
  </script>
</body>
</html>`;
}

function registerSession(req, res, { allowMentraFields = false, message = 'Session registered' } = {}) {
  const payload = req.body || {};
  console.log('🔵 Session registration request received');
  console.log('📄 Registration payload:', JSON.stringify(payload, null, 2));

  let sessionData;
  try {
    sessionData = buildSessionData(payload, { allowMentraFields });
  } catch (error) {
    if (error instanceof HttpError) {
      console.warn('❌ Session registration failed:', error.message);
      return res.status(error.status).json({ message: error.message });
    }
    console.error('💥 Unexpected error during session registration:', error);
    return res.status(500).json({ message: 'Invalid session payload', details: error.message });
  }

  console.log('🔧 Final session data:', {
    identifier: sessionData.identifier,
    deviceId: sessionData.deviceId,
    ownerId: sessionData.ownerId,
    baseUrl: sessionData.baseUrl,
    pushUrl: sessionData.pushUrl,
    hasAccessToken: !!sessionData.accessToken,
    hasApiKey: !!sessionData.apiKey,
    referenceCardPath: sessionData.referenceCardPath,
  });

  const stored = sessionStore.registerSession(sessionData);
  console.log(`✅ Registered mentraOS session ${stored.identifier} (${stored.deviceId})`);

  const { accessToken: _token, apiKey: _apiKey, ...publicSession } = stored;
  const baseUrl = getPublicBaseUrl(req);
  const webhookEndpoint = `${baseUrl}/api/github/${encodeURIComponent(stored.identifier)}`;
  console.log('🔗 Generated webhook endpoint:', webhookEndpoint);

  return res.status(201).json({
    message,
    session: publicSession,
    webhookEndpoint,
  });
}

const app = express();
app.set('trust proxy', true);
app.use(express.json({ verify: captureRawBody }));
app.use(express.urlencoded({ extended: true, verify: captureRawBody }));

app.get('/api/status', (_req, res) => {
  res.json({
    sessions: sessionStore.listSessions(),
    recentPushes: sessionStore.getRecentPushes(3),
  });
});

app.get('/api/dashboard', (_req, res) => {
  res.type('html').send(createDashboardHtml());
});

app.get('/api/manifest', (req, res) => {
  const baseUrl = getPublicBaseUrl(req);
  console.log('📱 Manifest request received from:', req.get('user-agent') || 'unknown');
  console.log('🌐 Public URL:', baseUrl);
  res.json(createManifest(baseUrl));
});

app.post('/api/sessions', (req, res) => registerSession(req, res));

app.delete('/api/sessions/:identifier', (req, res) => {
  const identifier = req.params.identifier;
  if (!identifier) {
    return res.status(400).json({ message: 'Identifier missing' });
  }

  const session = sessionStore.removeSession(identifier);
  if (!session) {
    return res.status(404).json({ message: 'Session not found' });
  }

  console.log(`🧹 Removed session ${identifier}`);
  res.json({ message: 'Session removed', session });
});

app.get('/api/webhook', (req, res) => {
  const baseUrl = getPublicBaseUrl(req);
  console.log('📱 Manifest request via webhook alias from:', req.get('user-agent') || 'unknown');
  console.log('🌐 Public URL:', baseUrl);
  res.json(createManifest(baseUrl, '/api/webhook'));
});

app.post('/api/webhook', (req, res) => registerSession(req, res, { allowMentraFields: true, message: 'Session registered via webhook endpoint' }));

app.post('/api/test-message/:identifier', async (req, res) => {
  const identifier = req.params.identifier;
  if (!identifier) {
    console.warn('❌ Missing identifier in test-message route');
    return res.status(400).json({ success: false, error: 'Identifier required' });
  }

  const session = sessionStore.getSession(identifier);
  if (!session) {
    console.warn(`❌ No active session found for identifier: ${identifier}`);
    return res.status(404).json({ success: false, error: 'No active session found' });
  }

  const testCard = {
    title: '🧪 Test Message',
    body: [
      'Test message sent from mentraOS Dashboard.',
      `Session: ${identifier}`,
      `Time: ${new Date().toLocaleString('de-DE')}`,
      'This is a test to verify your GitHub integration is working correctly.'
    ].join('\n'),
    durationSeconds: 10,
  };

  console.log(`🧪 Sending test message to ${identifier}`);
  try {
    const result = await sendReferenceCard(session, testCard);
    if (result.success) {
      console.log(`✅ Test message sent successfully to ${identifier}`);
      return res.json({ success: true, message: 'Test message sent successfully', card: testCard });
    }

    console.error(`❌ Failed to send test message: ${result.error}`);
    return res.status(500).json({ success: false, error: result.error });
  } catch (error) {
    console.error('💥 Error sending test message:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/github/:identifier', async (req, res) => {
  const identifier = req.params.identifier;
  console.log(`🎯 GitHub webhook received for identifier: ${identifier}`);

  if (!identifier) {
    return res.status(400).json({ message: 'Identifier missing in route' });
  }

  const session = sessionStore.getSession(identifier);
  if (!session) {
    console.warn(`❌ No active session found for identifier: ${identifier}`);
    return res.status(404).json({ message: 'No active session for identifier' });
  }

  console.log(`✅ Found session for ${identifier}: deviceId=${session.deviceId}, ownerId=${session.ownerId}`);

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const signatureHeader = req.get('x-hub-signature-256');
  const event = req.get('x-github-event') || 'push';
  const contentType = req.get('content-type') || '';

  console.log(`📋 GitHub event: ${event}, has signature: ${!!signatureHeader}, has secret: ${!!secret}`);
  console.log(`📄 Content-Type: ${contentType}`);

  const payloadBuffer = req.rawBody || Buffer.alloc(0);

  if (!verifySignature(secret, signatureHeader, payloadBuffer)) {
    console.warn('❌ Invalid webhook signature');
    return res.status(401).json({ message: 'Invalid webhook signature' });
  }

  let payload;
  try {
    if (contentType.includes('application/json')) {
      payload = req.body;
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const bodyString = payloadBuffer.toString('utf-8');
      const urlParams = new URLSearchParams(bodyString);
      const payloadString = urlParams.get('payload');
      if (!payloadString) {
        throw new Error('No payload field in form data');
      }
      payload = JSON.parse(payloadString);
    } else {
      payload = JSON.parse(payloadBuffer.toString('utf-8'));
    }
    console.log('✅ Payload parsed successfully');
  } catch (error) {
    console.error('❌ Failed to parse payload:', error);
    console.error('Raw body preview:', payloadBuffer.toString('utf-8').substring(0, 200));
    return res.status(400).json({ message: 'Invalid payload', details: error.message });
  }

  const card = createCardFromEvent(event, payload);
  console.log(`🃏 Created card: ${card.title}`);

  const summary = {
    event,
    title: card.title,
    summary: card.body.split('\n')[0],
  };

  try {
    console.log(`📤 Sending card to mentraOS for session: ${identifier}`);
    const result = await sendReferenceCard(session, card);

    if (result.success) {
      sessionStore.recordPush(identifier, summary);
      console.log(`✅ Successfully delivered ${event} webhook to ${identifier}`);
      return res.status(202).json({ message: 'Accepted', card });
    }

    console.error(`💥 Failed to deliver card to ${identifier}: ${result.error}`);
    return res.status(502).json({
      message: 'Failed to deliver to mentraOS',
      details: result.error,
      status: result.status,
    });
  } catch (error) {
    console.error(`💥 Exception delivering card to ${identifier}:`, error);
    return res.status(502).json({ message: 'Failed to deliver to mentraOS', details: error.message });
  }
});

app.use((err, _req, res, _next) => {
  console.error('💥 Unexpected error in express pipeline:', err);
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message });
  }
  res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;
