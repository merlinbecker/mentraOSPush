const { app } = require('@azure/functions');
const sessionStore = require('../services/sessionStore');

app.http('endSession', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'sessions/{identifier}',
  handler: async (request, context) => {
    const identifier = request.params.identifier;
    if (!identifier) {
      return { status: 400, jsonBody: { message: 'Identifier missing' } };
    }

    const session = sessionStore.removeSession(identifier);
    if (!session) {
      return { status: 404, jsonBody: { message: 'Session not found' } };
    }

    context.log(`Removed session ${identifier}`);
    return {
      status: 200,
      jsonBody: { message: 'Session removed', session },
    };
  },
});
