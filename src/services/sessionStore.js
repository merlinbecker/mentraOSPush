class SessionStore {
  constructor() {
    this.sessions = new Map();
    this.pushLog = [];
  }

  registerSession(session) {
    if (!session || !session.identifier) {
      throw new Error('Session payload must include an identifier');
    }

    const stored = {
      ...session,
      connectedAt: new Date().toISOString(),
      lastActivityAt: null,
      pushHistory: [],
    };
    this.sessions.set(session.identifier, stored);
    return stored;
  }

  updateActivity(identifier) {
    const existing = this.sessions.get(identifier);
    if (existing) {
      existing.lastActivityAt = new Date().toISOString();
    }
    return existing;
  }

  removeSession(identifier) {
    const session = this.sessions.get(identifier);
    if (session) {
      this.sessions.delete(identifier);
      const { accessToken, apiKey, ...publicSession } = session;
      return publicSession;
    }
    return null;
  }

  getSession(identifier) {
    return this.sessions.get(identifier) || null;
  }

  listSessions() {
    return Array.from(this.sessions.values()).map(({ accessToken, apiKey, ...rest }) => rest);
  }

  recordPush(identifier, pushSummary) {
    const timestamp = new Date().toISOString();
    const entry = {
      identifier,
      timestamp,
      ...pushSummary,
    };
    this.pushLog.push(entry);
    if (this.pushLog.length > 100) {
      this.pushLog.splice(0, this.pushLog.length - 100);
    }

    const session = this.sessions.get(identifier);
    if (session) {
      session.lastActivityAt = timestamp;
      session.pushHistory.unshift(entry);
      session.pushHistory = session.pushHistory.slice(0, 10);
    }
    return entry;
  }

  getRecentPushes(limit = 3) {
    const items = this.pushLog.slice(-limit);
    return items.reverse();
  }
}

module.exports = new SessionStore();
