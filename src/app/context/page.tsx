import { getOrCreateProfile } from '@/lib/profile';
import { redirect } from 'next/navigation';
import { ContextForm } from '@/components/context-form';
import { DashboardHeader } from '@/components/dashboard-header';

export default async function ContextPage() {
  const profile = await getOrCreateProfile();
  if (!profile) redirect('/auth/login');

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader profile={profile} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Agent Voice Context
          </h1>
          <p className="mt-1 text-sm text-foreground/40">
            Tell your agent what to know and how to represent you in standup.
          </p>
        </div>
        <ContextForm userId={profile.id} />
      </main>
    </div>
  );
}
