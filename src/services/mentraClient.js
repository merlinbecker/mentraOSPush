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

  // Format according to mentraOS API specification
  const mentraCard = {
    layout: 'ReferenceCard',
    data: {
      title: card.title || 'Notification',
      body: card.body || '',
      durationSeconds: Math.min(Math.max(card.durationSeconds || 15, 5), 60),
    }
  };

  console.log('🚀 Sending Reference Card to mentraOS:', JSON.stringify(mentraCard, null, 2));
  console.log('📍 Target URL:', url);
  console.log('🔑 Auth headers:', session.accessToken ? 'Bearer token' : session.apiKey ? 'API Key' : 'None');

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(mentraCard),
  });

  console.log('📥 mentraOS Response Status:', response.status, response.statusText);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('❌ mentraOS Error Response:', text);
    const error = new Error(`Failed to deliver card to mentraOS (${response.status}): ${text}`);
    error.status = response.status;
    error.body = text;
    return { success: false, error: error.message, status: response.status };
  }

  try {
    const result = await response.json();
    console.log('✅ mentraOS Success Response:', result);
    return { success: true, result };
  } catch (error) {
    console.log('✅ mentraOS request successful (no JSON response)');
    return { success: true };
  }
}

module.exports = {
  sendReferenceCard,
};
