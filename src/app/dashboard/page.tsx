import { getOrCreateProfile } from '@/lib/profile';
import { redirect } from 'next/navigation';
import { AsyncUpdateForm } from '@/components/async-update-form';
import { MeetingPanel } from '@/components/meeting-panel';
import { DashboardHeader } from '@/components/dashboard-header';

export default async function DashboardPage() {
  const profile = await getOrCreateProfile();
  if (!profile) redirect('/auth/login');

  return (
    <div className="flex flex-col min-h-screen">
      <DashboardHeader profile={profile} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-8">
        <AsyncUpdateForm profileId={profile.id} />
        <MeetingPanel profileId={profile.id} />
      </main>
    </div>
  );
}
