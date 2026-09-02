// POST /.netlify/functions/verify   body: { email, key }
// Called by the app's unlock screen. Returns { ok: true } when the pair is valid.
// Purely computational (HMAC) — no Stripe call, so it is fast and cannot be rate-limited by Stripe.
const L = require('../lib/license');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: L.cors(event) };
  if (event.httpMethod !== 'POST') return L.json(event, 405, { ok: false });
  try {
    const body = JSON.parse(event.body || '{}');
    const email = L.normEmail(body.email);
    const key = L.normKey(body.key);
    if (!email || !key) return L.json(event, 400, { ok: false, error: 'Enter the email you paid with and your key.' });
    const ok = L.keysMatch(key, L.keyFor(email));
    return L.json(event, ok ? 200 : 401, ok ? { ok: true } : { ok: false, error: 'That email and key don\'t match. Check for typos, or use "Send my key again."' });
  } catch (e) {
    return L.json(event, 500, { ok: false, error: 'Could not verify right now. Please try again in a moment.' });
  }
};
