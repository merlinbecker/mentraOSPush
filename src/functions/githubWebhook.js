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
    const identifier = request.params.get('identifier');
    if (!identifier) {
      return { status: 400, jsonBody: { message: 'Identifier missing in route' } };
    }

    const session = sessionStore.getSession(identifier);
    if (!session) {
      return { status: 404, jsonBody: { message: 'No active session for identifier' } };
    }

    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    const signatureHeader = request.headers.get('x-hub-signature-256');
    const event = request.headers.get('x-github-event') || 'push';

    const payloadBuffer = Buffer.from(await request.arrayBuffer());

    if (!verifySignature(secret, signatureHeader, payloadBuffer)) {
      return { status: 401, jsonBody: { message: 'Invalid webhook signature' } };
    }

    let payload;
    try {
      payload = JSON.parse(payloadBuffer.toString('utf-8'));
    } catch (error) {
      return { status: 400, jsonBody: { message: 'Invalid JSON payload', details: error.message } };
    }

    const card = createCardFromEvent(event, payload);
    const summary = {
      event,
      title: card.title,
      summary: card.body.split('\n')[0],
    };

    try {
      await sendReferenceCard(session, card);
      sessionStore.recordPush(identifier, summary);
      context.log(`Delivered ${event} webhook to ${identifier}`);
      return {
        status: 202,
        jsonBody: { message: 'Accepted', card },
      };
    } catch (error) {
      context.error('Failed to deliver card', error);
      return {
        status: 502,
        jsonBody: { message: 'Failed to deliver to mentraOS', details: error.message, response: error.body },
      };
    }
  },
});
