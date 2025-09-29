const { app } = require('@azure/functions');
const crypto = require('node:crypto');
const sessionStore = require('../services/sessionStore');
const { sendReferenceCard } = require('../services/mentraClient');
const { createCardFromEvent } = require('../utils/githubFormatter');

function verifySignature(secret, signatureHeader, payloadBuffer) {
  if (!secret) {
    return true;
  }
  if (!signatureHeader) {
    return false;
  }
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadBuffer);
  const expected = `sha256=${hmac.digest('hex')}`;
  const expectedBuffer = Buffer.from(expected, 'utf-8');
  const providedBuffer = Buffer.from(signatureHeader, 'utf-8');
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

app.http('githubWebhook', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'github/{identifier}',
  handler: async (request, context) => {
    const identifier = request.params.identifier;
    context.log(`🎯 GitHub webhook received for identifier: ${identifier}`);
    
    if (!identifier) {
      context.log('❌ Identifier missing in route');
      return { status: 400, jsonBody: { message: 'Identifier missing in route' } };
    }

    const session = sessionStore.getSession(identifier);
    if (!session) {
      context.log(`❌ No active session found for identifier: ${identifier}`);
      return { status: 404, jsonBody: { message: 'No active session for identifier' } };
    }
    
    context.log(`✅ Found session for ${identifier}: deviceId=${session.deviceId}, ownerId=${session.ownerId}`);

    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    const signatureHeader = request.headers.get('x-hub-signature-256');
    const event = request.headers.get('x-github-event') || 'push';
    const contentType = request.headers.get('content-type') || '';
    
    context.log(`📋 GitHub event: ${event}, has signature: ${!!signatureHeader}, has secret: ${!!secret}`);
    context.log(`📄 Content-Type: ${contentType}`);

    // Read the raw body for signature verification
    const payloadBuffer = Buffer.from(await request.arrayBuffer());

    // Verify signature with raw payload
    if (!verifySignature(secret, signatureHeader, payloadBuffer)) {
      context.log('❌ Invalid webhook signature');
      return { status: 401, jsonBody: { message: 'Invalid webhook signature' } };
    }

    let payload;
    try {
      // GitHub can send webhooks either as JSON or form-encoded
      if (contentType.includes('application/json')) {
        // Standard JSON payload
        payload = JSON.parse(payloadBuffer.toString('utf-8'));
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        // Form-encoded payload (GitHub's default)
        const bodyString = payloadBuffer.toString('utf-8');
        const urlParams = new URLSearchParams(bodyString);
        const payloadString = urlParams.get('payload');
        if (!payloadString) {
          throw new Error('No payload field in form data');
        }
        payload = JSON.parse(payloadString);
      } else {
        // Fallback: try to parse raw body as JSON
        payload = JSON.parse(payloadBuffer.toString('utf-8'));
      }
      
      context.log('✅ Payload parsed successfully');
    } catch (error) {
      context.error('❌ Failed to parse payload:', error);
      context.error('Raw body preview:', payloadBuffer.toString('utf-8').substring(0, 200));
      return { status: 400, jsonBody: { message: 'Invalid payload', details: error.message } };
    }

    const card = createCardFromEvent(event, payload);
    context.log(`🃏 Created card: ${card.title}`);
    const summary = {
      event,
      title: card.title,
      summary: card.body.split('\n')[0],
    };

    try {
      context.log(`📤 Sending card to mentraOS for session: ${identifier}`);
      const result = await sendReferenceCard(session, card);
      
      if (result.success) {
        sessionStore.recordPush(identifier, summary);
        context.log(`✅ Successfully delivered ${event} webhook to ${identifier}`);
        return {
          status: 202,
          jsonBody: { message: 'Accepted', card },
        };
      } else {
        context.error(`💥 Failed to deliver card to ${identifier}: ${result.error}`);
        return {
          status: 502,
          jsonBody: { message: 'Failed to deliver to mentraOS', details: result.error, status: result.status },
        };
      }
    } catch (error) {
      context.error(`💥 Exception delivering card to ${identifier}:`, error);
      return {
        status: 502,
        jsonBody: { message: 'Failed to deliver to mentraOS', details: error.message },
      };
    }
  },
});
