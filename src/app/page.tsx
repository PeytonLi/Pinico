import { getOrCreateProfile } from '@/lib/profile';

// PHASE 0 PLACEHOLDER — owned by Track A (§4/A1), replace wholesale.
// Exists only to prove the Auth0 round trip and the profiles upsert.
// Must use <a>, not <Link>: /auth/* is handled by the proxy, not the router.
export default async function Home() {
  const profile = await getOrCreateProfile();

  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold">Pinico</h1>
        <p className="text-sm opacity-60">
          Autonomous standup &amp; AI blocker-to-Jira engine
        </p>
      </div>

      {profile ? (
        <div className="flex flex-col gap-3">
          <p>
            Signed in as <strong>{profile.full_name ?? profile.email}</strong>
          </p>
          <p className="font-mono text-xs opacity-60">profile {profile.id}</p>
          <div className="flex gap-4 text-sm">
            <a className="underline" href="/dashboard">
              Dashboard
            </a>
            <a className="underline" href="/auth/logout">
              Log out
            </a>
          </div>
        </div>
      ) : (
        <a
          className="w-fit rounded bg-foreground px-4 py-2 text-sm text-background"
          href="/auth/login"
        >
          Log in
        </a>
      )}
    </main>
  );
}
