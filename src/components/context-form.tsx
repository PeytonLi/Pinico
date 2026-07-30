'use client';

import { useState, useEffect } from 'react';
import type { ContextRequest } from '@/lib/types';

export function ContextForm({ userId }: { userId: string }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<ContextRequest>({
    current_work: '',
    active_blockers: '',
    recent_wins: '',
    communication_style: 'Direct and professional',
    delegation_instructions: '',
    topics_to_track: '',
    questions_for_team: '',
    meeting_goal: '',
  });

  void userId;

  useEffect(() => {
    fetch('/api/context')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.current_work) {
          setForm({
            current_work: data.current_work ?? '',
            active_blockers: data.active_blockers ?? '',
            recent_wins: data.recent_wins ?? '',
            communication_style: data.communication_style ?? 'Direct and professional',
            delegation_instructions: data.delegation_instructions ?? '',
            topics_to_track: data.topics_to_track ?? '',
            questions_for_team: data.questions_for_team ?? '',
            meeting_goal: data.meeting_goal ?? '',
          });
        }
      })
      .catch(() => {});
  }, []);

  const update = (field: keyof ContextRequest, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? 'Failed to save');
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
          <CheckIcon />
        </div>
        <h3 className="font-display text-lg font-bold text-emerald-600 dark:text-emerald-400">
          Your voice agent is ready
        </h3>
        <p className="text-sm text-foreground/50 max-w-sm leading-relaxed">
          Dispatch a bot from the dashboard and your agent will represent you
          in standup with a real voice.
        </p>
        <button
          onClick={() => setSaved(false)}
          className="mt-2 text-sm text-foreground/30 underline hover:text-foreground/60 transition-colors"
        >
          Edit context
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <Field label="Current Work" required>
        <textarea
          value={form.current_work}
          onChange={(e) => update('current_work', e.target.value)}
          placeholder="I'm building the payments integration for Pinico"
          required
          rows={2}
        />
      </Field>

      <Field label="Active Blockers">
        <textarea
          value={form.active_blockers}
          onChange={(e) => update('active_blockers', e.target.value)}
          placeholder="Blocked on Auth0 staging webhook returning 500"
          rows={2}
        />
      </Field>

      <Field label="Recent Wins">
        <textarea
          value={form.recent_wins}
          onChange={(e) => update('recent_wins', e.target.value)}
          placeholder="Shipped the dashboard yesterday"
          rows={2}
        />
      </Field>

      <Field label="Communication Style">
        <input
          type="text"
          value={form.communication_style}
          onChange={(e) => update('communication_style', e.target.value)}
          placeholder="Direct and professional"
        />
      </Field>

      <Field label="Delegation Instructions">
        <textarea
          value={form.delegation_instructions}
          onChange={(e) => update('delegation_instructions', e.target.value)}
          placeholder="If asked about the API, point them to the OpenAPI spec"
          rows={2}
        />
      </Field>

      <Field label="Topics to Track">
        <input
          type="text"
          value={form.topics_to_track}
          onChange={(e) => update('topics_to_track', e.target.value)}
          placeholder="Auth0, staging, webhook, payments"
        />
      </Field>

      <Field label="Questions for the Team">
        <textarea
          value={form.questions_for_team}
          onChange={(e) => update('questions_for_team', e.target.value)}
          placeholder="Ask DevOps: when will staging be fixed?"
          rows={2}
        />
      </Field>

      <Field label="Meeting Goal">
        <input
          type="text"
          value={form.meeting_goal}
          onChange={(e) => update('meeting_goal', e.target.value)}
          placeholder="Get an ETA on the staging fix"
        />
      </Field>

      <button
        type="submit"
        disabled={saving || !form.current_work.trim()}
        className="mt-2 w-full rounded-xl bg-foreground px-6 py-3.5 text-sm font-semibold text-background transition-all duration-200 hover:bg-foreground/90 hover:shadow-md hover:shadow-foreground/10 disabled:opacity-30"
      >
        {saving ? 'Saving...' : 'Save Context'}
      </button>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-foreground/50">
        {label}
        {required && <span className="ml-0.5 text-accent">*</span>}
      </span>
      {children}
    </label>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-emerald-500"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
