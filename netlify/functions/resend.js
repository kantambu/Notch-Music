// POST /.netlify/functions/resend   body: { email }
// "I lost my key": if this email has a paid checkout in Stripe, email the key again.
// Always answers the same way so the endpoint cannot be used to test whether an address bought.
const L = require('../lib/license');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: L.cors(event) };
  if (event.httpMethod !== 'POST') return L.json(event, 405, { ok: false });
  const neutral = { ok: true, message: 'If that email has a Notch Music purchase, your key is on its way. Check spam if it does not arrive in a few minutes.' };
  try {
    const email = L.normEmail((JSON.parse(event.body || '{}')).email);
    if (!email || !email.includes('@')) return L.json(event, 400, { ok: false, error: 'Enter the email you paid with.' });
    if (await L.hasPaid(email)) await L.sendKeyEmail(email, L.keyFor(email)).catch(() => {});
    return L.json(event, 200, neutral);
  } catch (e) {
    return L.json(event, 200, neutral);
  }
};
