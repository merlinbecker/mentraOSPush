const { app } = require('@azure/functions');

app.http('mentraManifest', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manifest',
  handler: async (request, context) => {
    const origin = new URL(request.url).origin;
    const forwardedHost = request.headers.get('x-forwarded-host');
    const publicUrl = forwardedHost ? `https://${forwardedHost}` : origin;
    
    context.log('📱 Manifest request received from:', request.headers.get('user-agent') || 'unknown');
    context.log('🌐 Origin URL:', origin);
    context.log('🌐 Public URL:', publicUrl);
    
    const manifest = {
      name: 'GitHub Push Relay',
      description: 'Relays GitHub webhook events to mentraOS G1 glasses as reference cards.',
      version: '1.0.0',
      author: 'mentraOS GitHub Integration',
      documentation: 'https://docs.github.com/en/webhooks/about-webhooks',
      supportUrl: `${publicUrl}/api/dashboard`,
      endpoints: {
        registerSession: `${publicUrl}/api/sessions`,
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

    context.log('✅ Returning manifest with endpoints:', JSON.stringify(manifest.endpoints, null, 2));
    return {
      status: 200,
      jsonBody: manifest,
    };
  },
});
