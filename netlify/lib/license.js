// Shared helpers for the Notch Music license functions.
// No npm dependencies: Node 18+ on Netlify has fetch and crypto built in.
const crypto = require('crypto');

// The app's private address is NOT in this repo on purpose — set APP_URL in Netlify.
const APP_URL = process.env.APP_URL || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  'https://tinnitusfitness.com,https://www.tinnitusfitness.com,https://notch-music.netlify.app')
  .split(',').map(s => s.trim()).filter(Boolean);

function normEmail(e) { return String(e || '').trim().toLowerCase(); }

// Deterministic key: same email -> same key. Nothing to store.
// Format: NM-XXXX-XXXX-XXXX using an unambiguous alphabet (no 0/O/1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function keyFor(email) {
  const secret = process.env.LICENSE_SECRET;
  if (!secret) throw new Error('LICENSE_SECRET is not set');
  const mac = crypto.createHmac('sha256', secret).update(normEmail(email)).digest();
  let out = '';
  for (let i = 0; i < 12; i++) out += ALPHABET[mac[i] % 32];
  return `NM-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

function normKey(k) {
  const raw = String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = raw.startsWith('NM') ? raw.slice(2) : raw;
  if (body.length !== 12) return null;
  return `NM-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

function keysMatch(a, b) {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

// --- Stripe REST (no SDK) ---
async function stripe(path, params) {
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) throw new Error('STRIPE_SECRET_KEY is not set');
  const url = new URL('https://api.stripe.com/v1' + path);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url, { headers: { Authorization: 'Basic ' + Buffer.from(sk + ':').toString('base64') } });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error && j.error.message || 'Stripe error');
  return j;
}

async function paidSession(sessionId) {
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sessionId || '')) return null;
  const s = await stripe('/checkout/sessions/' + sessionId);
  if (s.payment_status !== 'paid') return null;
  return { email: normEmail(s.customer_details && s.customer_details.email), name: s.customer_details && s.customer_details.name || '' };
}

// Has this email ever completed a paid checkout? (used by "resend my key")
async function hasPaid(email) {
  const e = normEmail(email);
  if (!e) return false;
  // Look up customers by email, then their paid sessions.
  const c = await stripe('/customers/search', { query: `email:'${e.replace(/'/g, "\\'")}'`, limit: '10' });
  for (const cust of c.data || []) {
    const ss = await stripe('/checkout/sessions', { customer: cust.id, limit: '20' });
    if ((ss.data || []).some(s => s.payment_status === 'paid')) return true;
  }
  // Payment Links can complete without creating a Customer object; fall back to sessions by email.
  const ss = await stripe('/checkout/sessions', { customer_details: `{"email":"${e}"}`, limit: '20' }).catch(() => ({ data: [] }));
  return (ss.data || []).some(s => s.payment_status === 'paid');
}

// --- Email via Resend (optional; skipped when RESEND_API_KEY is unset) ---
async function sendKeyEmail(email, key) {
  const api = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!api || !from) return { sent: false, reason: 'email not configured' };
  const html = `
  <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:auto;color:#1a2430;line-height:1.55">
    <h2 style="font-weight:600;margin:0 0 12px">Your Notch Music key</h2>
    <p>Thank you for your purchase. Here is everything you need to open Notch Music on any device:</p>
    <p style="margin:18px 0"><b>Your app link</b><br><a href="${APP_URL}">${APP_URL}</a></p>
    <p style="margin:18px 0"><b>Your key</b><br>
      <span style="font-family:Consolas,Menlo,monospace;font-size:1.25rem;letter-spacing:.08em;background:#f2f0e9;padding:8px 12px;border-radius:6px;display:inline-block">${key}</span></p>
    <p>Open the link, enter the email you paid with (<b>${email}</b>) and this key once. The app remembers you on that device; on a new device, enter the same pair again.</p>
    <p style="color:#6b7a88;font-size:.9rem">Please keep this email. Notch Music is a one-time purchase — no subscription, no renewals. It is an optional practice within the Tinnitus Mental Fitness Model, not a medical treatment or cure.</p>
  </div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + api, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject: 'Your Notch Music key and app link', html }),
  });
  return { sent: r.ok };
}

function cors(event) {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  };
}

function json(event, status, body) {
  return { statusCode: status, headers: cors(event), body: JSON.stringify(body) };
}

module.exports = { APP_URL, normEmail, keyFor, normKey, keysMatch, paidSession, hasPaid, sendKeyEmail, cors, json };
