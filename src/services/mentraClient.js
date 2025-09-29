const { URL } = require('node:url');

const DEFAULT_CARD_PATH = '/api/v1/reference-cards';

function resolvePushUrl(session) {
  if (session.pushUrl) {
    return session.pushUrl;
  }
  if (!session.baseUrl) {
    throw new Error('Session does not include a pushUrl or baseUrl');
  }
  const url = new URL(session.referenceCardPath || process.env.MENTRA_REFERENCE_CARD_PATH || DEFAULT_CARD_PATH, session.baseUrl);
  return url.toString();
}

async function sendReferenceCard(session, card) {
  const url = resolvePushUrl(session);
  const headers = {
    'Content-Type': 'application/json',
  };
  if (session.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  } else if (session.apiKey) {
    headers['X-API-Key'] = session.apiKey;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...card,
      durationSeconds: Math.min(Math.max(card.durationSeconds || 15, 5), 60),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`Failed to deliver card to mentraOS (${response.status})`);
    error.status = response.status;
    error.body = text;
    throw error;
  }

  try {
    return await response.json();
  } catch (error) {
    return {};
  }
}

module.exports = {
  sendReferenceCard,
};
