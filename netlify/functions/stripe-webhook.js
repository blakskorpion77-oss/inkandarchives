// ─────────────────────────────────────────────────────────────
// Ink & Archives — Stripe Webhook Handler
// File: netlify/functions/stripe-webhook.js
//
// HOW TO USE:
// 1. In Stripe Dashboard → Webhooks → Add endpoint:
//    URL: https://inkandarchives.com/.netlify/functions/stripe-webhook
//    Events: checkout.session.completed
// 2. Copy the Webhook Signing Secret and add to Netlify env vars:
//    STRIPE_WEBHOOK_SECRET = whsec_xxxx
// 3. Add your email service API key (Mailgun/SendGrid):
//    MAILGUN_API_KEY = your_key
//    MAILGUN_DOMAIN = inkandarchives.com
// ─────────────────────────────────────────────────────────────

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;

  try {
    // Verify the webhook signature
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`
    };
  }

  // ── Handle checkout.session.completed ─────────────────────
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;

    // Get customer email
    const customerEmail = session.customer_details?.email;
    const bookIds = session.metadata?.bookIds || '';
    const bundles = session.metadata?.bundles || '';

    console.log(`Payment completed for: ${customerEmail}`);
    console.log(`Books: ${bookIds}`);
    console.log(`Bundles: ${bundles}`);

    // ── Send download email ────────────────────────────────
    // Option 1: Mailgun (recommended)
    if (process.env.MAILGUN_API_KEY && customerEmail) {
      await sendDownloadEmail(customerEmail, bookIds, bundles, session.id);
    }

    // ── Log the sale ───────────────────────────────────────
    // You can store this in a database (Supabase, Airtable, etc.)
    // Since you already use Supabase for ClientTech, you could add it there
    // Example:
    // await logSale(customerEmail, bookIds, bundles, session.amount_total);

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true, type: stripeEvent.type })
  };
};

// ── Send download email via Mailgun ──────────────────────────
async function sendDownloadEmail(email, bookIds, bundles, sessionId) {
  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || 'inkandarchives.com';

  // Build download links (Project Gutenberg for public domain books)
  const downloadSection = buildDownloadLinks(bookIds, bundles);

  const emailBody = `
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: Georgia, serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; }
  .header { background: #1a2035; padding: 30px; text-align: center; }
  .header h1 { color: #c9a84c; margin: 0; font-size: 24px; }
  .header p { color: #aaa; margin: 5px 0 0; font-size: 12px; }
  .content { padding: 30px; }
  .book-item { border: 1px solid #eee; border-radius: 8px; padding: 15px; margin: 10px 0; }
  .btn { background: #e8621a; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; display: inline-block; margin: 5px 0; }
  .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #888; }
</style>
</head>
<body>
  <div class="header">
    <h1>INK & ARCHIVES</h1>
    <p>Your downloads are ready</p>
  </div>
  <div class="content">
    <p>Thank you for your purchase! Your public domain books are ready to download.</p>
    <p><strong>Order ID:</strong> ${sessionId}</p>
    ${downloadSection}
    <p style="margin-top:20px;color:#888;font-size:13px">
      All books are public domain works published before 1928. 
      Files are in ePub and PDF format, compatible with all e-readers.
    </p>
  </div>
  <div class="footer">
    <p>Ink & Archives — inkandarchives.com</p>
    <p>Questions? Reply to this email.</p>
  </div>
</body>
</html>
  `;

  try {
    const formData = new URLSearchParams();
    formData.append('from', `Ink & Archives <orders@${MAILGUN_DOMAIN}>`);
    formData.append('to', email);
    formData.append('subject', 'Your Ink & Archives Downloads Are Ready');
    formData.append('html', emailBody);

    const response = await fetch(
      `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      }
    );

    if (response.ok) {
      console.log('Download email sent to:', email);
    } else {
      console.error('Email failed:', await response.text());
    }
  } catch (err) {
    console.error('Email error:', err.message);
  }
}

// ── Build download links from Project Gutenberg ──────────────
function buildDownloadLinks(bookIds, bundles) {
  let html = '';

  // For bundles
  if (bundles) {
    const bundleNames = {
      classics:   'Complete Classics Bundle (20 Books)',
      allaccess:  'ALL ACCESS PASS (All 1,255 Books)',
      gothic:     'Gothic & Horror Pack (15 Books)',
      philosophy: 'Ancient Philosophy Bundle'
    };
    bundles.split(',').filter(Boolean).forEach(key => {
      html += `
        <div class="book-item">
          <strong style="color:#c9a84c">&#127981; ${bundleNames[key] || key}</strong>
          <p style="font-size:13px;margin:8px 0">Download all books from Project Gutenberg:</p>
          <a class="btn" href="https://www.gutenberg.org" target="_blank">Browse on Project Gutenberg</a>
          <a class="btn" style="background:#c9a84c;color:#1a1a1a" href="https://librivox.org" target="_blank">&#127911; Listen on LibriVox</a>
        </div>`;
    });
  }

  // For individual books - link to Project Gutenberg search
  if (bookIds) {
    // In a real implementation, you'd have a mapping of bookId -> Gutenberg ID
    // For now we link to the search
    html += `
      <div class="book-item">
        <strong>Your Books</strong>
        <p style="font-size:13px;margin:8px 0">Download your books from Project Gutenberg (free, legal, no DRM):</p>
        <a class="btn" href="https://www.gutenberg.org/ebooks/search/" target="_blank">&#128218; Download from Project Gutenberg</a>
        <a class="btn" style="background:#1a2035;color:#fff" href="https://librivox.org/search" target="_blank">&#127911; Listen on LibriVox</a>
      </div>`;
  }

  return html || '<p>Your download links will be emailed within 24 hours.</p>';
}
