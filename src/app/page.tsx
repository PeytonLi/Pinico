import { getOrCreateProfile } from '@/lib/profile';

export default async function Home() {
  const profile = await getOrCreateProfile();

  return (
    <main className="flex flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
          <span className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            Pinico
          </span>
        </h1>
        <p className="mt-2 text-lg font-medium text-foreground/40">by Peyton Li</p>
        <p className="mt-6 max-w-xl text-lg text-foreground/70 leading-relaxed">
          The average 10-person engineering team burns over $60K a year on
          standups. Pinico sends an AI bot instead — spoken blockers become
          Jira tickets in real time.
        </p>

        <div className="mt-10">
          {profile ? (
            <a
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition hover:bg-foreground/90"
            >
              Go to Dashboard
            </a>
          ) : (
            <a
              href="/auth/login"
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition hover:bg-foreground/90"
            >
              Log in to get started
            </a>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-foreground/10 px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-semibold">How it works</h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            <Step
              icon={<ClipboardIcon />}
              step="1"
              title="Submit your async update"
              body="Share what you're working on and any blockers before the standup. The bot brings your context into the meeting."
            />
            <Step
              icon={<BotIcon />}
              step="2"
              title="Bot joins your standup"
              body="Paste a Meet or Zoom link. Pinico's bot joins, listens, and transcribes in real time."
            />
            <Step
              icon={<TicketIcon />}
              step="3"
              title="Blockers become Jira tickets"
              body="The moment someone says they're blocked, a Jira ticket is created and a link lands in the meeting chat."
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-foreground/10 px-6 py-16">
        <p className="text-center text-sm text-foreground/50">
          $99 base + $0.15/min &middot; No seat licenses &middot; Cancel anytime
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-foreground/10 px-6 py-8 text-center text-xs text-foreground/30">
        Pinico &mdash; Autonomous standup &amp; AI blocker-to-Jira engine
      </footer>
    </main>
  );
}

function Step({
  icon,
  step,
  title,
  body,
}: {
  icon: React.ReactNode;
  step: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5 text-foreground/70">
        {icon}
      </div>
      <p className="mt-4 text-xs font-medium text-foreground/30">Step {step}</p>
      <h3 className="mt-1 font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-foreground/60 leading-relaxed">{body}</p>
    </div>
  );
}

// Inline SVGs — no lucide-react on the server, and this keeps the landing
// page fully server-renderable without a client bundle for icons.
function ClipboardIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 14h6" />
      <path d="M9 18h6" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 17v2" />
      <path d="M13 11v2" />
    </svg>
  );
}
