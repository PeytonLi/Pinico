import { getOrCreateProfile } from '@/lib/profile';

export default async function Home() {
  const profile = await getOrCreateProfile();

  return (
    <main className="flex flex-col relative overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        {/* Dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
          style={{
            backgroundImage:
              'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        {/* Gradient blobs */}
        <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-primary/8 dark:bg-primary/15 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] h-[400px] w-[400px] rounded-full bg-accent/8 dark:bg-accent/10 blur-[100px]" />
      </div>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 pt-28 pb-20 text-center relative">
        {/* Voice visualization — waveform bars */}
        <div className="flex items-end gap-1.5 mb-10 h-12 opacity-60 dark:opacity-80">
          {[1.2, 0.8, 1.5, 0.6, 1.3, 0.7, 1.1, 1.4, 0.5, 1.0, 1.6, 0.7, 1.2, 0.9, 1.3, 0.6].map(
            (scale, i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-primary animate-waveform"
                style={{
                  animationDelay: `${i * 0.08}s`,
                  height: `${14 * scale}px`,
                }}
              />
            ),
          )}
        </div>

        {/* Orb */}
        <div className="relative mb-8">
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary via-secondary to-accent opacity-40 dark:opacity-60 blur-xl animate-pulse-glow" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-accent animate-pulse-glow" style={{ animationDelay: '0.3s' }} />
          </div>
        </div>

        {/* Title */}
        <h1
          className="max-w-4xl font-display text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl opacity-0 animate-fade-in-up"
        >
          <span className="block text-7xl sm:text-8xl lg:text-9xl bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent mb-3">
            Pinico
          </span>
          <span className="block text-xl sm:text-2xl font-medium text-foreground/40 stagger-2 animate-fade-in-up opacity-0">
            by Peyton Li
          </span>
        </h1>

        <p
          className="mt-8 max-w-2xl text-lg sm:text-xl text-foreground/60 leading-relaxed stagger-3 animate-fade-in-up opacity-0"
        >
          Your AI{' '}
          <span className="font-semibold text-foreground/80">
            Stand-in
          </span>{' '}
          for Standup. Pinico sends a voice agent that knows your context,
          speaks on your behalf, and flags blockers — so your team never waits
          on you.
        </p>

        {/* CTA */}
        <div className="mt-10 stagger-4 animate-fade-in-up opacity-0">
          {profile ? (
            <a
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-foreground px-7 py-3.5 text-sm font-semibold text-background transition-all duration-300 hover:bg-foreground/90 hover:scale-[1.02] hover:shadow-lg hover:shadow-foreground/10"
            >
              Go to Dashboard
              <span className="text-lg leading-none">&rarr;</span>
            </a>
          ) : (
            <a
              href="/auth/login"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-primary/90 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/25"
            >
              Get Started
              <span className="text-lg leading-none">&rarr;</span>
            </a>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border px-6 py-28">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            How it works
          </h2>
          <p className="mt-3 text-center text-foreground/40 text-sm">
            Three steps to having an AI represent you
          </p>

          <div className="mt-16 grid gap-6 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div
                key={step.step}
                className="group relative flex flex-col items-center rounded-2xl border border-border bg-surface p-8 text-center transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1"
              >
                {/* Step number glow */}
                <div className="absolute top-0 right-0 pt-4 pr-5">
                  <span className="font-display text-5xl font-bold text-primary/8 dark:text-primary/15 group-hover:text-primary/15 dark:group-hover:text-primary/25 transition-colors duration-300">
                    {step.step}
                  </span>
                </div>
                <div className="relative z-10 mt-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
                  {step.icon}
                </div>
                <h3 className="mt-5 font-display font-semibold text-lg">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-foreground/50 leading-relaxed">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-border px-6 py-16">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="font-display text-2xl font-bold text-primary">
            $99<span className="text-lg font-normal text-foreground/40">/mo</span>
          </p>
          <p className="mt-1 text-sm text-foreground/50">
            + $0.15/min beyond base &middot; No seat licenses &middot; Cancel anytime
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-10 text-center">
        <p className="font-display text-sm font-semibold tracking-tight">
          Pinico
        </p>
        <p className="mt-1 text-xs text-foreground/30">
          Your AI voice agent for standup &middot; Built by Peyton Li
        </p>
      </footer>
    </main>
  );
}

/* ---- Step data ---- */
const STEPS = [
  {
    step: '1',
    title: 'Set your context',
    body: 'Tell your agent what you\'re working on, your blockers, and how to represent you in the meeting.',
    icon: <ClipboardIcon />,
  },
  {
    step: '2',
    title: 'Agent joins & speaks',
    body: 'Paste a Meet or Zoom link. Your voice agent joins, listens, and speaks with a real voice on your behalf.',
    icon: <MicIcon />,
  },
  {
    step: '3',
    title: 'Blockers → tickets',
    body: 'When a blocker is discussed, your agent creates a Jira ticket instantly and drops the link in chat.',
    icon: <TicketIcon />,
  },
];

/* ---- Inline SVGs (server-compatible, no client bundle) ---- */
function ClipboardIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 14h6" /><path d="M9 18h6" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
function TicketIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" />
    </svg>
  );
}
