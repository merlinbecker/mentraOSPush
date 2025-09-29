const { app } = require('@azure/functions');
const sessionStore = require('../services/sessionStore');

app.http('registerSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sessions',
  handler: async (request, context) => {
    try {
      context.log('🔵 Session registration request received');
      const payload = await request.json();
      context.log('📄 Registration payload:', JSON.stringify(payload, null, 2));
      
      const { identifier, deviceId, ownerId, baseUrl, pushUrl, accessToken, apiKey, referenceCardPath } = payload;

      if (!identifier || !deviceId) {
        context.log('❌ Missing required fields: identifier or deviceId');
        return {
          status: 400,
          jsonBody: { message: 'identifier and deviceId are required' },
        };
      }

      // Use environment variables as defaults if not provided in payload
      const sessionData = {
        identifier,
        deviceId,
        ownerId,
        baseUrl: baseUrl || process.env.MENTRA_BASE_URL,
        pushUrl,
        accessToken: accessToken || process.env.MENTRA_ACCESS_TOKEN,
        apiKey: apiKey || process.env.MENTRA_API_KEY,
        referenceCardPath,
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

      context.log(`✅ Registered mentraOS session ${identifier} (${deviceId})`);

      const { accessToken: _ignoredToken, apiKey: _ignoredKey, ...publicSession } = stored;
      
      const webhookEndpoint = `${new URL(request.url).origin}/api/github/${encodeURIComponent(identifier)}`;
      context.log('🔗 Generated webhook endpoint:', webhookEndpoint);

      return {
        status: 201,
        jsonBody: {
          message: 'Session registered',
          session: publicSession,
          webhookEndpoint: webhookEndpoint,
        },
      };
    } catch (error) {
      context.error('💥 Failed to register session', error);
      return {
        status: 400,
        jsonBody: { message: 'Invalid session payload', details: error.message },
      };
    }
  },
});
