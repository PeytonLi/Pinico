import type { Profile } from '@/lib/types';

export function DashboardHeader({ profile }: { profile: Profile }) {
  return (
    <header className="flex items-center justify-between border-b border-foreground/10 px-6 py-4">
      <a href="/" className="text-sm font-semibold tracking-tight">
        Pinico
      </a>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-foreground/50">
          {profile.full_name ?? profile.email}
        </span>
        <a
          href="/auth/logout"
          className="text-foreground/50 hover:text-foreground transition"
        >
          Log out
        </a>
      </div>
    </header>
  );
}
