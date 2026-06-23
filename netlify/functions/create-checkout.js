// ─────────────────────────────────────────────────────────────
// Ink & Archives — Stripe Checkout Function
// File: netlify/functions/create-checkout.js
//
// HOW TO USE:
// 1. npm install stripe  (in your project root)
// 2. In Netlify dashboard → Site Settings → Environment Variables, add:
//    STRIPE_SECRET_KEY = sk_live_xxxx   (your Stripe secret key)
// 3. Deploy to Netlify
// 4. This function will be available at:
//    https://inkandarchives.com/.netlify/functions/create-checkout
// ─────────────────────────────────────────────────────────────

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Your site URL - update this
const SITE_URL = 'https://inkandarchives.com';

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { type, items } = body;

    // ── SINGLE BOOK or CART CHECKOUT ───────────────────────
    if (type === 'cart' && items && items.length > 0) {

      // Build line items from cart
      const lineItems = items.map(item => {
        if (item.isBundle) {
          // Bundle item
          return {
            price_data: {
              currency: 'usd',
              product_data: {
                name: item.name,
                description: getBundleDescription(item.bundleKey),
                images: ['https://inkandarchives.com/logo.png'],
                metadata: {
                  type: 'bundle',
                  bundleKey: item.bundleKey
                }
              },
              unit_amount: item.price, // already in cents
            },
            quantity: 1,
          };
        } else {
          // Single book
          const priceInCents = item.price || 149;
          return {
            price_data: {
              currency: 'usd',
              product_data: {
                name: item.title,
                description: `by ${item.author} (${item.year}) — Public Domain Digital Edition`,
                images: [`https://covers.openlibrary.org/b/isbn/${item.isbn}-M.jpg`],
                metadata: {
                  bookId: item.id,
                  author: item.author,
                  year: String(item.year)
                }
              },
              unit_amount: priceInCents,
            },
            quantity: 1,
          };
        }
      });

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${SITE_URL}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE_URL}?checkout=cancelled`,
        billing_address_collection: 'auto',
        custom_text: {
          submit: {
            message: 'All books are public domain digital editions. Download links sent by email after purchase.'
          }
        },
        metadata: {
          bookIds: items.filter(i => !i.isBundle).map(i => i.id).join(','),
          bundles: items.filter(i => i.isBundle).map(i => i.bundleKey).join(',')
        }
      });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: session.url, sessionId: session.id })
      };

    }

    // ── SINGLE BOOK QUICK BUY ──────────────────────────────
    if (type === 'book' && body.book) {
      const book = body.book;
      const priceInCents = book.price || 149;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: book.title,
              description: `by ${book.author} (${book.year}) — Public Domain Digital Edition (ePub + PDF)`,
              images: [`https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg`],
            },
            unit_amount: priceInCents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${SITE_URL}?checkout=success&book=${encodeURIComponent(book.id)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE_URL}?checkout=cancelled`,
        metadata: {
          bookId: book.id,
          bookTitle: book.title,
          bookAuthor: book.author
        }
      });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: session.url, sessionId: session.id })
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid request. Send type: "book" or "cart" with items.' })
    };

  } catch (err) {
    console.error('Stripe error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

// Bundle descriptions
function getBundleDescription(key) {
  const descs = {
    classics:    'Complete Classics Bundle — 20 classic novels by Austen, Dickens, Hardy and more. ePub + PDF.',
    allaccess:   'ALL ACCESS PASS — All 1,255 public domain books. Every genre. ePub + PDF formats.',
    gothic:      'Gothic & Horror Pack — 15 Gothic classics by Poe, Stoker, Shelley and more. ePub + PDF.',
    philosophy:  'Ancient Philosophy Bundle — Plato, Aristotle, Marcus Aurelius, Seneca and more. ePub + PDF.'
  };
  return descs[key] || 'Ink & Archives Bundle — Public Domain Digital Edition';
}
