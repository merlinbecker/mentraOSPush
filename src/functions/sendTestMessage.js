const { app } = require('@azure/functions');
const sessionStore = require('../services/sessionStore');
const mentraClient = require('../services/mentraClient');

app.http('sendTestMessage', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'test-message/{identifier}',
  handler: async (request, context) => {
    const identifier = request.params.identifier;
    
    if (!identifier) {
      context.log('❌ Missing identifier in route');
      return { status: 400, jsonBody: { error: 'Identifier required' } };
    }

    const session = sessionStore.getSession(identifier);
    if (!session) {
      context.log(`❌ No active session found for identifier: ${identifier}`);
      return { status: 404, jsonBody: { error: 'No active session found' } };
    }

    // Create test reference card with same layout as GitHub events
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

    context.log(`🧪 Sending test message to ${identifier}`);
    context.log(`📝 Test card: ${testCard.title}`);

    try {
      const result = await mentraClient.sendReferenceCard(session, testCard);
      
      if (result.success) {
        context.log(`✅ Test message sent successfully to ${identifier}`);
        return { 
          status: 200, 
          jsonBody: { 
            success: true, 
            message: 'Test message sent successfully',
            card: testCard
          } 
        };
      } else {
        context.error(`❌ Failed to send test message: ${result.error}`);
        return { 
          status: 500, 
          jsonBody: { 
            success: false, 
            error: result.error 
          } 
        };
      }
    } catch (error) {
      context.error('💥 Error sending test message:', error);
      return { 
        status: 500, 
        jsonBody: { 
          success: false, 
          error: error.message 
        } 
      };
    }
  },
});