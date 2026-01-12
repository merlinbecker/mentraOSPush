/**
 * SessionManager - Manages MentraOS session lifecycle
 * 
 * Responsibilities:
 * - Track active sessions
 * - Send welcome messages to new sessions
 * - Handle session disconnection
 * - Send reference cards to sessions
 */
class SessionManager {
  constructor(logger) {
    this.logger = logger;
    this.activeSessions = new Map();
  }

  /**
   * Register a new session
   */
  async registerSession(session, sessionId, userId) {
    this.logger.info(`🔵 New MentraOS session: ${sessionId} for user ${userId}`);

    this.activeSessions.set(sessionId, {
      session,
      sessionId,
      userId,
      connectedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    });

    await this.sendWelcomeMessage(session, sessionId, userId);
    this.setupSessionEventHandlers(session, sessionId);
  }

  /**
   * Setup event handlers for a session
   */
  setupSessionEventHandlers(session, sessionId) {
    session.events.onDisconnected(() => {
      this.logger.info(`🔴 Session ${sessionId} disconnected`);
      this.activeSessions.delete(sessionId);
    });
  }

  /**
   * Send welcome message to a new session
   */
  async sendWelcomeMessage(session, sessionId, userId) {
    try {
      await session.layouts.showReferenceCard(
        "Verbunden mit PushProxy!",
        `Session: ${sessionId} , User: ${userId}`,
        { durationMs: 10000 }
      );
      this.logger.info(`✅ Welcome message sent to ${sessionId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send welcome message: ${error.message}`);
    }
  }

  /**
   * Send a reference card to a specific session
   */
  async sendCardToSession(sessionId, card) {
    const storedSession = this.activeSessions.get(sessionId);
    if (!storedSession) {
      throw new Error(`No active session found for ${sessionId}`);
    }

    await storedSession.session.layouts.showReferenceCard(
      card.title,
      card.body,
      {
        durationMs: Math.min(Math.max(card.durationSeconds || 15, 5), 60) * 1000
      }
    );

    storedSession.lastActivity = new Date().toISOString();
    this.logger.info(`✅ Reference card sent to ${sessionId}: ${card.title}`);
  }

  /**
   * Broadcast a reference card to all active sessions
   */
  async broadcastCard(card) {
    if (this.activeSessions.size === 0) {
      throw new Error('No active sessions to notify');
    }

    this.logger.info(`🃏 Broadcasting card: ${card.title}`);

    const results = [];
    for (const [sessionId, storedSession] of this.activeSessions) {
      try {
        await storedSession.session.layouts.showReferenceCard(
          card.title,
          card.body,
          {
            durationMs: Math.min(Math.max(card.durationSeconds || 15, 5), 60) * 1000
          }
        );

        storedSession.lastActivity = new Date().toISOString();
        results.push({ sessionId, success: true });
        this.logger.info(`✅ Card sent to session ${sessionId}`);
      } catch (error) {
        results.push({ sessionId, success: false, error: error.message });
        this.logger.error(`❌ Failed to send card to session ${sessionId}: ${error.message}`);
      }
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.info(`📊 Broadcast complete: ${successCount}/${results.length} sessions notified`);

    return {
      sessionsNotified: successCount,
      totalSessions: results.length,
      results
    };
  }

  /**
   * Get session by ID
   */
  getSession(sessionId) {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getAllSessions() {
    return Array.from(this.activeSessions.values()).map(s => ({
      sessionId: s.sessionId,
      userId: s.userId,
      connectedAt: s.connectedAt,
      lastActivity: s.lastActivity
    }));
  }

  /**
   * Get number of active sessions
   */
  getSessionCount() {
    return this.activeSessions.size;
  }
}

module.exports = SessionManager;
