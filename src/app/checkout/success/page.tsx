import Link from 'next/link';

export default function CheckoutSuccessPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
        <CheckIcon />
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold">You&apos;re subscribed!</h1>
      <p className="mt-2 max-w-sm text-sm text-foreground/50 leading-relaxed">
        Welcome to Pinico Pro. Your AI voice agent is ready. Head to the dashboard to set your context and dispatch your first bot.
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
