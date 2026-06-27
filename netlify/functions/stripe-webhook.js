// ─────────────────────────────────────────────────────────────
// Ink & Archives — Stripe Webhook + Zoho SMTP Email
// Fires on: checkout.session.completed
// Sends: order confirmation to customer + owner notification
// ─────────────────────────────────────────────────────────────

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');

// Zoho SMTP transporter
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST || 'smtppro.zoho.eu',
    port: parseInt(process.env.ZOHO_SMTP_PORT || '465'),
    secure: true,
    auth: {
      user: process.env.ZOHO_SMTP_USER,
      pass: process.env.ZOHO_SMTP_PASS
    }
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const customerEmail = session.customer_details?.email;
    const customerName = session.customer_details?.name || 'Valued Reader';
    const amount = (session.amount_total / 100).toFixed(2);
    const currency = (session.currency || 'usd').toUpperCase();
    const sessionId = session.id;
    const ownerEmail = process.env.OWNER_EMAIL || 'hello@inkandarchives.com';

    console.log(`Payment completed: ${customerEmail} — ${currency} ${amount}`);

    const transporter = createTransporter();

    // ── Customer confirmation email ──────────────────────────
    const customerHTML = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body{font-family:Georgia,serif;background:#fdfbf7;margin:0;padding:0}
  .wrap{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
  .head{background:#1a2035;padding:32px 24px;text-align:center}
  .head h1{color:#c9a84c;font-size:26px;margin:0 0 4px;letter-spacing:1px}
  .head p{color:#8a9ab5;font-size:12px;margin:0;letter-spacing:2px;text-transform:uppercase}
  .body{padding:32px 28px}
  .body h2{color:#1a2035;font-size:20px;margin:0 0 16px}
  .body p{font-family:Arial,sans-serif;font-size:14px;color:#444;line-height:1.6;margin:0 0 14px}
  .order-box{background:#faf7f2;border:1px solid #e0d8c8;border-radius:8px;padding:18px 20px;margin:20px 0}
  .order-box p{margin:6px 0;font-family:Arial,sans-serif;font-size:13px;color:#555}
  .order-box strong{color:#1a2035}
  .download-btn{display:block;background:#e8621a;color:#fff;text-decoration:none;text-align:center;padding:14px 24px;border-radius:8px;font-family:Arial,sans-serif;font-weight:700;font-size:15px;margin:24px 0}
  .divider{border:none;border-top:1px solid #eee;margin:24px 0}
  .step{display:flex;gap:12px;align-items:flex-start;margin-bottom:14px}
  .step-num{background:#1a2035;color:#c9a84c;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;font-family:Arial,sans-serif;line-height:28px;text-align:center}
  .step-text{font-family:Arial,sans-serif;font-size:13px;color:#555;line-height:1.5;padding-top:4px}
  .footer{background:#1a2035;padding:20px;text-align:center}
  .footer p{color:#8a9ab5;font-family:Arial,sans-serif;font-size:11px;margin:4px 0}
  .footer a{color:#c9a84c}
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <h1>INK &amp; ARCHIVES</h1>
    <p>Order Confirmation</p>
  </div>
  <div class="body">
    <h2>Thank you, ${customerName}! &#128214;</h2>
    <p>Your order has been confirmed and your books are ready to download. We hope you enjoy every page.</p>

    <div class="order-box">
      <p><strong>Order ID:</strong> ${sessionId}</p>
      <p><strong>Amount Paid:</strong> ${currency} $${amount}</p>
      <p><strong>Email:</strong> ${customerEmail}</p>
      <p><strong>Format:</strong> ePub + PDF (compatible with all e-readers)</p>
    </div>

    <a href="https://www.gutenberg.org" class="download-btn">&#11015; Download Your Books from Project Gutenberg</a>

    <hr class="divider">

    <p><strong>How to download your books:</strong></p>
    <div class="step">
      <div class="step-num">1</div>
      <div class="step-text">Click the download button above to go to Project Gutenberg — the world's largest library of free public domain books.</div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div class="step-text">Search for your book title or author. All books in Ink &amp; Archives are public domain classics available in ePub and PDF format.</div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div class="step-text">Click "Download this ebook" and choose your preferred format — ePub for Kobo/Apple Books, PDF for any device, or Mobi for Kindle.</div>
    </div>
    <div class="step">
      <div class="step-num">4</div>
      <div class="step-text">Transfer to your e-reader via USB or email the file to your Kindle address. Enjoy your reading!</div>
    </div>

    <hr class="divider">
    <p style="font-size:12px;color:#888">Questions? Reply to this email or contact us at <a href="mailto:hello@inkandarchives.com" style="color:#e8621a">hello@inkandarchives.com</a></p>
  </div>
  <div class="footer">
    <p>Ink &amp; Archives &mdash; inkandarchives.com</p>
    <p>All books are public domain works published before 1928.</p>
    <p><a href="https://inkandarchives.com">Visit our store</a></p>
  </div>
</div>
</body>
</html>`;

    // ── Owner notification email ─────────────────────────────
    const ownerHTML = `
<!DOCTYPE html>
<html>
<head>
<style>
  body{font-family:Arial,sans-serif;background:#f5f5f5;padding:20px}
  .wrap{max-width:500px;margin:0 auto;background:#fff;border-radius:10px;padding:24px;box-shadow:0 2px 10px rgba(0,0,0,.1)}
  h2{color:#1a2035;margin:0 0 16px}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;font-size:14px}
  .label{color:#888}
  .value{color:#1a2035;font-weight:700}
  .amount{font-size:24px;color:#e8621a;font-weight:700;text-align:center;margin:16px 0}
</style>
</head>
<body>
<div class="wrap">
  <h2>&#128200; New Sale — Ink &amp; Archives</h2>
  <div class="amount">${currency} $${amount}</div>
  <div class="row"><span class="label">Customer</span><span class="value">${customerName}</span></div>
  <div class="row"><span class="label">Email</span><span class="value">${customerEmail}</span></div>
  <div class="row"><span class="label">Amount</span><span class="value">${currency} $${amount}</span></div>
  <div class="row"><span class="label">Order ID</span><span class="value">${sessionId}</span></div>
  <div class="row"><span class="label">Time</span><span class="value">${new Date().toUTCString()}</span></div>
  <p style="margin-top:16px;font-size:12px;color:#888">Login to <a href="https://dashboard.stripe.com">Stripe Dashboard</a> to view full order details.</p>
</div>
</body>
</html>`;

    try {
      // Send to customer
      await transporter.sendMail({
        from: `"Ink & Archives" <${process.env.ZOHO_SMTP_USER}>`,
        to: customerEmail,
        subject: `Your Ink & Archives Order is Confirmed — Download Ready`,
        html: customerHTML
      });
      console.log('Customer email sent to:', customerEmail);

      // Send to owner
      await transporter.sendMail({
        from: `"Ink & Archives Orders" <${process.env.ZOHO_SMTP_USER}>`,
        to: ownerEmail,
        subject: `New Sale: ${currency} $${amount} from ${customerName}`,
        html: ownerHTML
      });
      console.log('Owner notification sent to:', ownerEmail);

    } catch (emailErr) {
      console.error('Email send error:', emailErr.message);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true })
  };
};
