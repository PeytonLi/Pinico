import type { Profile } from '@/lib/types';

export function DashboardHeader({ profile }: { profile: Profile }) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-surface/60 backdrop-blur-sm px-6 py-4 sticky top-0 z-10">
      <a
        href="/"
        className="font-display text-lg font-bold tracking-tight hover:text-primary transition-colors"
      >
        Pinico
      </a>
      <div className="flex items-center gap-5 text-sm">
        <a
          href="/dashboard"
          className="text-foreground/40 hover:text-foreground transition-colors"
        >
          Dashboard
        </a>
        <span className="text-foreground/40 hidden sm:inline">
          {profile.full_name ?? profile.email}
        </span>
        <a
          href="/auth/logout"
          className="text-foreground/40 hover:text-foreground transition-colors"
        >
          Log out
        </a>
      </div>
    </header>
  );
}
