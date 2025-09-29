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

      const stored = sessionStore.registerSession({
        identifier,
        deviceId,
        ownerId,
        baseUrl,
        pushUrl,
        accessToken,
        apiKey,
        referenceCardPath,
      });

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
