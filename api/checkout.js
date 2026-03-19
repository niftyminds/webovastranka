export const config = { runtime: 'edge' };

const STRIPE_API = 'https://api.stripe.com/v1';

// Map service slugs → env var names for price IDs
const PRICE_MAP = {
  cmo:        process.env.STRIPE_PRICE_CMO,
  konzultace: process.env.STRIPE_PRICE_KONZULTACE,
  skoleni:    process.env.STRIPE_PRICE_SKOLENI,
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return new Response(JSON.stringify({ error: 'Stripe není nakonfigurován.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Neplatný požadavek.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { service } = body;
  const priceId = PRICE_MAP[service];

  if (!priceId) {
    return new Response(JSON.stringify({ error: 'Neznámá služba.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Determine base URL for success/cancel redirects
  const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/$/, '') || '';

  const params = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: `${origin}/?payment=success`,
    cancel_url:  `${origin}/?payment=canceled#cenik`,
  });

  const stripeRes = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!stripeRes.ok) {
    const err = await stripeRes.json();
    return new Response(JSON.stringify({ error: err.error?.message || 'Chyba při vytváření platby.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = await stripeRes.json();

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
