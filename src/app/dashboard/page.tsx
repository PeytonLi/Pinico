import { getOrCreateProfile } from '@/lib/profile';
import { getDb } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { AsyncUpdateForm } from '@/components/async-update-form';
import { MeetingPanel } from '@/components/meeting-panel';
import { DashboardHeader } from '@/components/dashboard-header';

export default async function DashboardPage() {
  const profile = await getOrCreateProfile();
  if (!profile) redirect('/auth/login');

  const { data: ctx } = await getDb()
    .from('agent_context')
    .select('updated_at')
    .eq('user_id', profile.id)
    .maybeSingle();

  return (
    <div className="flex flex-col min-h-screen">
      <DashboardHeader profile={profile} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-8">
        {/* Agent context status card */}
        <a
          href="/context"
          className="group flex items-center justify-between rounded-2xl border border-border bg-surface p-5 transition-all duration-300 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
              <MicIcon />
            </div>
            <div>
              <p className="font-display font-semibold text-sm">
                Set Agent Voice Context
              </p>
              <p className="text-xs text-foreground/40 mt-0.5">
                {ctx?.updated_at
                  ? `Context set ${timeAgo(new Date(ctx.updated_at))} ago`
                  : "No context set — your agent won't know what to say"}
              </p>
            </div>
          </div>
          <span className="text-foreground/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-300 text-lg">
            &rarr;
          </span>
        </a>

        <AsyncUpdateForm profileId={profile.id} />
        <MeetingPanel profileId={profile.id} />
      </main>
    </div>
  );
}

function timeAgo(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function MicIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
