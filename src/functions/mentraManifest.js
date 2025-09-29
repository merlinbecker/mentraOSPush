const { app } = require('@azure/functions');

app.http('mentraManifest', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manifest',
  handler: async (request) => {
    const origin = new URL(request.url).origin;
    return {
      status: 200,
      jsonBody: {
        name: 'GitHub Push Relay',
        description: 'Relays GitHub webhook events to mentraOS G1 glasses as reference cards.',
        documentation: 'https://docs.github.com/en/webhooks/about-webhooks',
        endpoints: {
          registerSession: `${origin}/api/sessions`,
          deleteSession: `${origin}/api/sessions/{identifier}`,
          githubWebhook: `${origin}/api/github/{identifier}`,
          dashboard: `${origin}/api/dashboard`,
        },
        capabilities: {
          referenceCards: true,
        },
      },
    };
  },
});
