export const config = { runtime: 'edge' };

const ECOMAIL_API = 'https://api2.ecomailapp.cz';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const apiKey = process.env.ECOMAIL_API_KEY;
  const listId = process.env.ECOMAIL_LIST_ID;
  const notifyEmail = process.env.NOTIFY_EMAIL;

  if (!apiKey || !listId) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { name, email, message } = body;

  if (!name || !email || !message) {
    return new Response(JSON.stringify({ error: 'Vyplňte prosím všechna pole.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headers = {
    'key': apiKey,
    'Content-Type': 'application/json',
  };

  // 1) Přidat kontakt do Ecomail listu
  const [firstName, ...rest] = name.trim().split(' ');
  const lastName = rest.join(' ') || '';

  const subscribeRes = await fetch(`${ECOMAIL_API}/lists/${listId}/subscribe`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      subscriber_data: {
        email,
        name: firstName,
        surname: lastName,
      },
      resubscribe: false,
      trigger_autoresponders: true,
    }),
  });

  if (!subscribeRes.ok) {
    const err = await subscribeRes.text();
    console.error('Ecomail subscribe error:', err);
    // Pokračujeme i přes chybu subscribu — kontakt třeba už existuje
  }

  // 2) Poslat notifikační email (pokud je nastavena NOTIFY_EMAIL)
  if (notifyEmail) {
    await fetch(`${ECOMAIL_API}/transactional/send-message`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: {
          subject: `Nová zpráva z webu od ${name}`,
          from_name: 'Web formulář',
          from_email: notifyEmail,
          reply_to: email,
          to: [{ email: notifyEmail }],
          html: `
            <h2>Nová zpráva z kontaktního formuláře</h2>
            <p><strong>Jméno:</strong> ${name}</p>
            <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
            <p><strong>Zpráva:</strong></p>
            <p>${message.replace(/\n/g, '<br>')}</p>
          `,
          text: `Jméno: ${name}\nEmail: ${email}\nZpráva:\n${message}`,
        },
      }),
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
