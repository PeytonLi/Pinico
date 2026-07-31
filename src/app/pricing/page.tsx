import { redirect } from 'next/navigation';
import { getOrCreateProfile } from '@/lib/profile';
import { CheckoutButton } from '@/components/checkout-button';

export default async function PricingPage() {
  const profile = await getOrCreateProfile();
  if (!profile) redirect('/auth/login');

  // Already subscribed — skip the paywall
  if (profile.stripe_subscription_status === 'active') {
    redirect('/dashboard');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <LockIcon />
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold">Subscribe to continue</h1>
      <p className="mt-2 max-w-sm text-sm text-foreground/50 leading-relaxed">
        Pinico Pro gives you an AI voice agent that attends standup, answers questions, and creates Jira tickets — so your team never waits on you.
      </p>

      {/* Pricing card */}
      <div className="mt-8 w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="font-display text-2xl font-bold text-primary">
          $99<span className="text-lg font-normal text-foreground/40">/mo</span>
        </p>
        <p className="mt-1 text-sm text-foreground/50">
          + $0.15/min beyond base &middot; No seat licenses &middot; Cancel anytime
        </p>
        <CheckoutButton />
      </div>

      <p className="mt-8 text-xs text-foreground/20">
        Signed in as {profile.email}
      </p>
    </main>
  );
}

function LockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
