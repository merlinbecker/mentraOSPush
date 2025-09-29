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
        version: '1.0.0',
        author: 'mentraOS GitHub Integration',
        documentation: 'https://docs.github.com/en/webhooks/about-webhooks',
        supportUrl: `${origin}/api/dashboard`,
        endpoints: {
          registerSession: `${origin}/api/sessions`,
          deleteSession: `${origin}/api/sessions/{identifier}`,
          githubWebhook: `${origin}/api/github/{identifier}`,
          dashboard: `${origin}/api/dashboard`,
          status: `${origin}/api/status`,
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
      },
    };
  },
});
