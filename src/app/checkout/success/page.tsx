import { redirect } from 'next/navigation';
import Link from 'next/link';
import Stripe from 'stripe';
import { getOrCreateProfile } from '@/lib/profile';
import { getDb } from '@/lib/supabase';

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const profile = await getOrCreateProfile();

  // Verify the Stripe session and store subscription on profile
  let verified = false;
  if (session_id && profile) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const session = await stripe.checkout.sessions.retrieve(session_id);

      if (session.payment_status === 'paid' || session.payment_status === 'unpaid') {
        // Store subscription info on profile
        await getDb()
          .from('profiles')
          .update({
            stripe_subscription_status: session.payment_status === 'paid' ? 'active' : 'unpaid',
            stripe_customer_id: session.customer as string,
          })
          .eq('id', profile.id);

        verified = true;
      }
    } catch (err) {
      console.error('[checkout] session verification failed:', err);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${verified ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
        {verified ? <CheckIcon /> : <ClockIcon />}
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold">
        {verified ? "You're subscribed!" : 'Processing your subscription...'}
      </h1>
      <p className="mt-2 max-w-sm text-sm text-foreground/50 leading-relaxed">
        {verified
          ? 'Welcome to Pinico Pro. Your AI voice agent is ready.'
          : "We're confirming your payment. This usually takes a few seconds."}
      </p>
      <Link
        href="/dashboard"
        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20"
      >
        Go to Dashboard &rarr;
      </Link>
      <p className="mt-6 text-xs text-foreground/20">
        Test mode — no real charge. Use card 4242 4242 4242 4242 to test.
      </p>
    </main>
  );
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 dark:text-emerald-400">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 dark:text-amber-400">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
