# Notch Music — license key setup

How a purchase works once this is wired up:

1. Buyer pays on the Stripe Payment Link.
2. Stripe redirects to `https://notch-music.netlify.app/success?session_id={CHECKOUT_SESSION_ID}`.
3. `success.html` calls the `activate` function, which confirms the session is paid with Stripe, derives the buyer's key from their email, emails the key + app link (if email is configured), and shows both on the page.
4. "Open Notch Music" opens the app with the pair in the URL hash, so it unlocks without retyping. The app stores the pair in the browser; on a new device the buyer enters email + key once.
5. "Lost your key? Send it again" on the app's unlock screen calls `resend`, which checks Stripe for a paid purchase under that email and re-sends.

Keys are deterministic (HMAC of the email with `LICENSE_SECRET`), so nothing is stored anywhere and the same email always gets the same key. The purchaser list is Stripe → Customers (export CSV; duplicates show as repeated emails).

## 1. Netlify environment variables (Site → Site configuration → Environment variables)

| Variable | Required | Value |
|---|---|---|
| `STRIPE_SECRET_KEY` | yes | A Stripe **restricted** key (Developers → API keys → Create restricted key) with **Read** on *Checkout Sessions* and *Customers*. Live mode. |
| `LICENSE_SECRET` | yes | A long random string (40+ chars). Changing it later changes every buyer's key — set once, keep forever. |
| `RESEND_API_KEY` | optional | From resend.com (free tier). Without it, keys are only shown on the success page. |
| `MAIL_FROM` | optional | e.g. `Notch Music <notch@tinnitusfitness.com>` — the domain must be verified in Resend. |
| `APP_URL` | yes | The app's private page address. Kept out of this repo deliberately. |
| `ALLOWED_ORIGINS` | optional | Defaults to tinnitusfitness.com, www.tinnitusfitness.com, notch-music.netlify.app. |

After adding variables, trigger a redeploy (Deploys → Trigger deploy).

## 2. Stripe Payment Link

Payment Links → the $49.95 link → Edit → **After payment** → choose "Don't show confirmation page" and set the redirect URL to:

```
https://notch-music.netlify.app/success?session_id={CHECKOUT_SESSION_ID}
```

(Type `{CHECKOUT_SESSION_ID}` literally — Stripe fills it in.) Save.

## 3. Test before gating the app

1. With the variables set, open `https://notch-music.netlify.app/.netlify/functions/verify` — a 405 JSON response means the function is deployed.
2. Make a real purchase with your own card. You should land on the success page with a key, and (if email is configured) get the email. Refund it in Stripe afterwards.
3. Open the app link from the success page — it should unlock without asking. Open the app in a private window, enter email + key — it should unlock. Enter a wrong key — it should refuse.
4. Only then replace the app page in the **Tinnitusfitness** repo with the gated version (kept outside this public repo).

## Files

- `public/index.html` — the site
- `public/success.html` — post-payment page
- `netlify/functions/activate.js`, `verify.js`, `resend.js` — the three endpoints
- `netlify/lib/license.js` — shared logic (keys, Stripe REST, email)
- `netlify.toml` — publish dir + functions dir
