const { app } = require('@azure/functions');
const sessionStore = require('../services/sessionStore');

// Alias für den Manifest-Endpunkt - die Brille erwartet /api/webhook
app.http('webhookAlias', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'webhook',
  handler: async (request, context) => {
    const method = request.method;
    context.log(`🔄 Webhook alias called with ${method} method`);
    
    // Handle POST requests for session registration
    if (method === 'POST') {
      try {
        context.log('📝 Processing session registration via webhook endpoint');
        const payload = await request.json();
        context.log('📄 Registration payload:', JSON.stringify(payload, null, 2));
        
        // Support both legacy format (identifier/deviceId) and mentraOS format (sessionId/userId)
        const sessionId = payload.sessionId || payload.identifier;
        const userId = payload.userId || payload.deviceId;
        const { ownerId, baseUrl, pushUrl, accessToken, apiKey, referenceCardPath, type, timestamp, augmentOSWebsocketUrl } = payload;

        if (!sessionId) {
          context.log('❌ Missing required field: sessionId or identifier');
          return {
            status: 400,
            jsonBody: { message: 'sessionId or identifier is required' },
          };
        }

        // Use environment variables as defaults if not provided in payload
        const sessionData = {
          identifier: sessionId,
          deviceId: userId || 'unknown',
          ownerId: ownerId || userId,
          baseUrl: baseUrl || process.env.MENTRA_BASE_URL,
          pushUrl,
          accessToken: accessToken || process.env.MENTRA_ACCESS_TOKEN,
          apiKey: apiKey || process.env.MENTRA_API_KEY,
          referenceCardPath,
          // Store mentraOS specific fields
          type,
          timestamp,
          augmentOSWebsocketUrl,
        };

        // Validate that we have either baseUrl/pushUrl and credentials
        if (!sessionData.pushUrl && !sessionData.baseUrl) {
          context.log('❌ Missing URL configuration: no pushUrl or baseUrl provided');
          return {
            status: 400,
            jsonBody: { message: 'Either pushUrl or baseUrl must be provided' },
          };
        }

        if (!sessionData.accessToken && !sessionData.apiKey) {
          context.log('❌ Missing authentication: no accessToken or apiKey provided');
          return {
            status: 400,
            jsonBody: { message: 'Either accessToken or apiKey must be provided for mentraOS authentication' },
          };
        }

        context.log('🔧 Final session data:', { 
          identifier: sessionData.identifier,
          deviceId: sessionData.deviceId,
          ownerId: sessionData.ownerId,
          baseUrl: sessionData.baseUrl,
          pushUrl: sessionData.pushUrl,
          hasAccessToken: !!sessionData.accessToken,
          hasApiKey: !!sessionData.apiKey,
          referenceCardPath: sessionData.referenceCardPath
        });

        const stored = sessionStore.registerSession(sessionData);
        context.log(`✅ Registered mentraOS session ${sessionId} (${userId || 'unknown'}) via webhook`);

        const { accessToken: _ignoredToken, apiKey: _ignoredKey, ...publicSession } = stored;
        
        // Get the public URL for webhook endpoint
        const forwardedHost = request.headers.get('x-forwarded-host');
        const publicUrl = forwardedHost ? `https://${forwardedHost}` : process.env.MENTRA_BASE_URL || 'https://solid-umbrella-xv56xqq7pvfpwwg-7071.app.github.dev/';
        const webhookEndpoint = `${publicUrl}/api/github/${encodeURIComponent(sessionId)}`;
        context.log('🔗 Generated webhook endpoint:', webhookEndpoint);

        return {
          status: 201,
          jsonBody: {
            message: 'Session registered via webhook endpoint',
            session: publicSession,
            webhookEndpoint: webhookEndpoint,
          },
        };
      } catch (error) {
        context.error('💥 Failed to register session via webhook', error);
        return {
          status: 400,
          jsonBody: { message: 'Invalid session payload', details: error.message },
        };
      }
    }
    
    // Handle GET requests for manifest
    // Import the manifest logic
    const { URL } = require('node:url');
    
    const origin = new URL(request.url).origin;
    const forwardedHost = request.headers.get('x-forwarded-host');
    const publicUrl = forwardedHost ? `https://${forwardedHost}` : origin;
    
    context.log('📱 Manifest request via webhook alias from:', request.headers.get('user-agent') || 'unknown');
    context.log('🌐 Public URL:', publicUrl);
    
    const manifest = {
      name: 'GitHub Push Relay',
      description: 'Relays GitHub webhook events to mentraOS G1 glasses as reference cards.',
      version: '1.0.0',
      author: 'mentraOS GitHub Integration',
      documentation: 'https://docs.github.com/en/webhooks/about-webhooks',
      supportUrl: `${publicUrl}/api/dashboard`,
      endpoints: {
        registerSession: `${publicUrl}/api/webhook`,
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

    context.log('✅ Returning manifest via webhook alias');
    return {
      status: 200,
      jsonBody: manifest,
    };
  },
});