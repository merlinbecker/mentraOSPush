const { app } = require('@azure/functions');
const sessionStore = require('../services/sessionStore');

app.http('statusApi', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'status',
  handler: async () => {
    return {
      status: 200,
      jsonBody: {
        sessions: sessionStore.listSessions(),
        recentPushes: sessionStore.getRecentPushes(3),
      },
    };
  },
});
