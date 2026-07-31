import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getOrCreateProfile } from '@/lib/profile';

export async function POST() {
  // Require auth — subscriptions are per-user
  const profile = await getOrCreateProfile();
  if (!profile) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const stripe = new Stripe(secretKey);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'https://pinico.vercel.app';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: profile.email,
      metadata: { user_id: profile.id },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Pinico Pro',
              description: 'AI voice agent for standup. $99/mo base + $0.15/min beyond included minutes.',
            },
            unit_amount: 9900,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[checkout] session creation failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
