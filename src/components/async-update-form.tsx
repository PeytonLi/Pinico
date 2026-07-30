'use client';

import { useCallback, useEffect, useState } from 'react';

type TeamUpdate = {
  id: string;
  full_name: string | null;
  email: string;
  status_text: string;
  blockers_text: string | null;
  created_at: string;
};

export function AsyncUpdateForm({ profileId }: { profileId: string }) {
  const [statusText, setStatusText] = useState('');
  const [blockersText, setBlockersText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [updates, setUpdates] = useState<TeamUpdate[]>([]);
  const [loadingUpdates, setLoadingUpdates] = useState(true);

  const fetchUpdates = useCallback(async () => {
    try {
      const res = await fetch('/api/updates');
      if (res.ok) {
        const data = await res.json();
        setUpdates(data.updates ?? []);
      }
    } catch {
      // stub returns 404 until backend ships GET; that's fine
    } finally {
      setLoadingUpdates(false);
    }
  }, []);

  useEffect(() => {
    fetchUpdates();
  }, [fetchUpdates]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (!statusText.trim()) {
      setFeedback({ ok: false, msg: 'Please describe what you\'re working on.' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status_text: statusText.trim(),
          blockers_text: blockersText.trim() || undefined,
        }),
      });
      if (res.ok) {
        setStatusText('');
        setBlockersText('');
        setFeedback({ ok: true, msg: 'Update submitted.' });
        fetchUpdates();
      } else {
        const err = await res.json().catch(() => ({ error: 'Something went wrong' }));
        setFeedback({ ok: false, msg: err.error ?? 'Something went wrong' });
      }
    } catch {
      setFeedback({ ok: false, msg: 'Network error. Try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Async update</h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-foreground/10 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground/70">
            What are you working on?
          </span>
          <textarea
            className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2 text-sm placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            rows={3}
            placeholder="e.g. Finishing the billing integration PR..."
            value={statusText}
            onChange={(e) => setStatusText(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground/70">
            Any blockers?{' '}
            <span className="font-normal text-foreground/40">(optional)</span>
          </span>
          <textarea
            className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2 text-sm placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            rows={2}
            placeholder="e.g. Waiting on DevOps to grant staging access..."
            value={blockersText}
            onChange={(e) => setBlockersText(e.target.value)}
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:bg-foreground/90 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit update'}
          </button>
          {feedback && (
            <span
              className={`text-sm ${
                feedback.ok ? 'text-emerald-500' : 'text-red-500'
              }`}
            >
              {feedback.msg}
            </span>
          )}
        </div>
      </form>

      {/* Team updates */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-foreground/50 uppercase tracking-wider mb-3">
          Today&apos;s updates
        </h3>
        {loadingUpdates ? (
          <p className="text-sm text-foreground/30">Loading...</p>
        ) : updates.length === 0 ? (
          <p className="text-sm text-foreground/30">
            No updates yet today. Be the first!
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {updates.map((u) => (
              <div
                key={u.id}
                className="rounded-lg border border-foreground/5 bg-foreground/[0.02] p-4"
              >
                <p className="text-xs font-medium text-foreground/40">
                  {u.full_name ?? u.email}
                </p>
                <p className="mt-1 text-sm">{u.status_text}</p>
                {u.blockers_text && (
                  <p className="mt-1.5 text-sm text-amber-500/80">
                    ⚠ {u.blockers_text}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
