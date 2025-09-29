const { app } = require('@azure/functions');
const sessionStore = require('../services/sessionStore');

app.http('registerSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sessions',
  handler: async (request, context) => {
    try {
      const payload = await request.json();
      const { identifier, deviceId, ownerId, baseUrl, pushUrl, accessToken, apiKey, referenceCardPath } = payload;

      if (!identifier || !deviceId) {
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
        return {
          status: 400,
          jsonBody: { message: 'Either pushUrl or baseUrl must be provided' },
        };
      }

      if (!sessionData.accessToken && !sessionData.apiKey) {
        return {
          status: 400,
          jsonBody: { message: 'Either accessToken or apiKey must be provided for mentraOS authentication' },
        };
      }

      const stored = sessionStore.registerSession(sessionData);

      context.log(`Registered mentraOS session ${identifier} (${deviceId})`);

      const { accessToken: _ignoredToken, apiKey: _ignoredKey, ...publicSession } = stored;

      return {
        status: 201,
        jsonBody: {
          message: 'Session registered',
          session: publicSession,
          webhookEndpoint: `${new URL(request.url).origin}/api/github/${encodeURIComponent(identifier)}`,
        },
      };
    } catch (error) {
      context.error('Failed to register session', error);
      return {
        status: 400,
        jsonBody: { message: 'Invalid session payload', details: error.message },
      };
    }
  },
});
