// GET /.netlify/functions/activate?session_id=cs_...
// Called by success.html right after Stripe redirects the buyer back.
// Confirms the checkout session is paid, derives the buyer's key, emails it (if email is configured),
// and returns { email, key, appUrl } for the page to display.
const L = require('../lib/license');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: L.cors(event) };
  try {
    if (!L.APP_URL) return L.json(event, 500, { ok: false, error: 'The site is not fully configured yet (APP_URL). Your purchase is safe — please contact us for your key.' });
    const sid = (event.queryStringParameters || {}).session_id;
    const s = await L.paidSession(sid);
    if (!s || !s.email) return L.json(event, 404, { ok: false, error: 'We could not find a completed payment for this link.' });
    const key = L.keyFor(s.email);
    const mail = await L.sendKeyEmail(s.email, key).catch(() => ({ sent: false }));
    return L.json(event, 200, { ok: true, email: s.email, name: s.name, key, appUrl: L.APP_URL, emailed: !!mail.sent });
  } catch (e) {
    return L.json(event, 500, { ok: false, error: 'Something went wrong confirming your payment. Your purchase is safe — please contact us and we will send your key.' });
  }
};
