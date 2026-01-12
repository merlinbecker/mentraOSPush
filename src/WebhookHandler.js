const crypto = require('node:crypto');
const GitHubEventFormatter = require('./GitHubEventFormatter');

/**
 * WebhookHandler - Handles GitHub webhook processing
 * 
 * Responsibilities:
 * - Verify GitHub webhook signatures
 * - Process webhook payloads
 * - Coordinate with SessionManager to send cards
 */
class WebhookHandler {
  constructor(sessionManager, logger, webhookSecret) {
    this.sessionManager = sessionManager;
    this.logger = logger;
    this.webhookSecret = webhookSecret;
  }

  /**
   * Verify GitHub webhook signature
   */
  verifySignature(payload, signature) {
    this.logger.info(`🔐 Verifying GitHub signature...`);
    this.logger.info(`   Payload type: ${typeof payload}, isBuffer: ${Buffer.isBuffer(payload)}`);
    this.logger.info(`   Signature received: ${signature ? signature.substring(0, 20) + '...' : 'null'}`);
    this.logger.info(`   Secret configured: ${this.webhookSecret ? '✅ Yes' : '❌ No'}`);

    if (!this.webhookSecret) {
      this.logger.warn('⚠️ No GitHub webhook secret configured, skipping signature verification');
      return true;
    }

    if (!signature) {
      this.logger.error('❌ No signature provided');
      return false;
    }

    const payloadBuffer = this.convertToBuffer(payload);
    if (!payloadBuffer) {
      return false;
    }
    
    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    hmac.update(payloadBuffer);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;

    this.logger.info(`   Expected signature: ${expectedSignature.substring(0, 20)}...`);
    this.logger.info(`   Received signature: ${signature.substring(0, 20)}...`);

    try {
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8')
      );
      
      this.logger.info(`   Signature valid: ${isValid ? '✅' : '❌'}`);
      return isValid;
    } catch (error) {
      this.logger.error(`   Signature comparison error: ${error.message}`);
      return false;
    }
  }

  /**
   * Convert payload to Buffer for signature verification
   */
  convertToBuffer(payload) {
    if (Buffer.isBuffer(payload)) {
      this.logger.info(`   Payload is already a Buffer (${payload.length} bytes)`);
      return payload;
    }
    
    if (typeof payload === 'string') {
      const buffer = Buffer.from(payload, 'utf8');
      this.logger.info(`   Converted string to Buffer (${buffer.length} bytes)`);
      return buffer;
    }
    
    if (typeof payload === 'object') {
      const payloadString = JSON.stringify(payload);
      const buffer = Buffer.from(payloadString, 'utf8');
      this.logger.info(`   Converted object to Buffer (${buffer.length} bytes)`);
      return buffer;
    }
    
    this.logger.error(`❌ Unsupported payload type: ${typeof payload}`);
    return null;
  }

  /**
   * Process webhook for a specific session
   */
  async processWebhookForSession(sessionId, event, payloadString, signature) {
    this.logger.info(`🎯 GitHub webhook received: ${event} for session ${sessionId}`);

    if (signature && !this.verifySignature(payloadString, signature)) {
      throw new Error('Invalid GitHub webhook signature');
    }

    let payload;
    try {
      payload = JSON.parse(payloadString);
    } catch (error) {
      this.logger.error(`❌ Invalid JSON payload: ${error.message}`);
      throw new Error('Invalid JSON payload');
    }

    const card = GitHubEventFormatter.createCardFromEvent(event, payload);
    this.logger.info(`🃏 Created card: ${card.title}`);

    await this.sessionManager.sendCardToSession(sessionId, card);
    
    return { success: true, card };
  }

  /**
   * Broadcast webhook to all active sessions
   */
  async broadcastWebhook(event, payloadString, signature) {
    this.logger.info(`🎯 GitHub webhook broadcast: ${event} to ${this.sessionManager.getSessionCount()} sessions`);

    if (signature && !this.verifySignature(payloadString, signature)) {
      throw new Error('Invalid GitHub webhook signature');
    }

    let payload;
    try {
      payload = JSON.parse(payloadString);
    } catch (error) {
      this.logger.error(`❌ Invalid JSON payload: ${error.message}`);
      throw new Error('Invalid JSON payload');
    }

    const card = GitHubEventFormatter.createCardFromEvent(event, payload);

    const result = await this.sessionManager.broadcastCard(card);
    
    return {
      ...result,
      card
    };
  }
}

module.exports = WebhookHandler;
