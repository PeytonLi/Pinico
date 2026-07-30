'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DispatchResponse, MeetingState } from '@/lib/types';

const JIRA_HOST = process.env.NEXT_PUBLIC_JIRA_HOST_NAME ?? 'your-domain.atlassian.net';

export function MeetingPanel({ profileId }: { profileId: string }) {
  const [meetingUrl, setMeetingUrl] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [meetingState, setMeetingState] = useState<MeetingState | null>(null);
  const [newTicketKeys, setNewTicketKeys] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  void profileId;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/meetings/${id}`);
        if (!res.ok) return;
        const state: MeetingState = await res.json();
        setMeetingState((prev) => {
          const prevCount = prev?.tickets.length ?? 0;
          const newCount = state.tickets.length;
          if (newCount > prevCount) {
            const newKeys = new Set<string>();
            state.tickets.slice(prevCount).forEach((t) => newKeys.add(t.jira_ticket_key));
            setNewTicketKeys(newKeys);
            setTimeout(() => setNewTicketKeys(new Set()), 2000);
          }
          return state;
        });
        if (state.status === 'completed') stopPolling();
      } catch {
        // swallow polling errors
      }
    }, 2000);
  }, [stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  async function handleDispatch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!meetingUrl.trim()) {
      setError('Please paste a meeting link.');
      return;
    }
    setDispatching(true);
    try {
      const res = await fetch('/api/bot/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meeting_url: meetingUrl.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Dispatch failed' }));
        setError(err.error ?? 'Dispatch failed');
        return;
      }
      const data: DispatchResponse = await res.json();
      setMeetingId(data.meeting_id);
      setMeetingState({ status: 'in_call', duration_minutes: 0, tickets: [] });
      startPolling(data.meeting_id);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setDispatching(false);
    }
  }

  const statusColor =
    meetingState?.status === 'in_call'
      ? 'bg-emerald-400'
      : meetingState?.status === 'completed'
        ? 'bg-foreground/20'
        : 'bg-amber-400';

  return (
    <section>
      <h2 className="font-display text-lg font-semibold mb-4">Live meeting</h2>

      {!meetingId && (
        <form onSubmit={handleDispatch} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground/60">
              Meeting link
            </span>
            <input
              type="url"
              className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm placeholder:text-foreground/20 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
              placeholder="Paste Google Meet or Zoom link..."
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={dispatching}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20 disabled:opacity-40"
            >
              {dispatching ? 'Dispatching...' : 'Dispatch Bot'}
            </button>
            {error && <span className="text-sm text-red-500 font-medium">{error}</span>}
          </div>
        </form>
      )}

      {meetingState && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${statusColor} ${
                meetingState.status === 'in_call' ? 'animate-pulse' : ''
              }`}
            />
            <span className="text-sm font-semibold capitalize">
              {meetingState.status.replace('_', ' ')}
            </span>
            <span className="text-sm text-foreground/30">
              &middot; {meetingState.duration_minutes} min
            </span>
            {meetingState.status === 'in_call' && (
              <span className="text-[11px] text-foreground/20 ml-auto tracking-wide">
                Polling 2s
              </span>
            )}
          </div>

          {meetingState.tickets.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {meetingState.tickets.map((ticket) => {
                const isNew = newTicketKeys.has(ticket.jira_ticket_key);
                return (
                  <a
                    key={ticket.jira_ticket_key}
                    href={`https://${JIRA_HOST}/browse/${ticket.jira_ticket_key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block rounded-xl border p-4 transition-all duration-500 ${
                      isNew
                        ? 'border-primary/40 bg-primary/[0.04] animate-slide-up shadow-sm shadow-primary/10'
                        : 'border-border hover:border-primary/20 hover:bg-primary/[0.02]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold font-display tracking-tight">
                        {ticket.jira_ticket_key}
                      </span>
                      <PriorityBadge priority={ticket.priority} />
                    </div>
                    <p className="mt-1.5 text-sm text-foreground/60 leading-relaxed">
                      {ticket.summary}
                    </p>
                  </a>
                );
              })}
            </div>
          )}

          {meetingState.tickets.length === 0 && meetingState.status === 'in_call' && (
            <p className="mt-4 text-sm text-foreground/20 italic">
              Listening for blockers...
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    Highest: 'text-red-400 border-red-400/20 bg-red-400/5',
    High: 'text-orange-400 border-orange-400/20 bg-orange-400/5',
    Medium: 'text-amber-400 border-amber-400/20 bg-amber-400/5',
    Low: 'text-foreground/40 border-border bg-muted',
  };
  const color = colors[priority] ?? 'text-foreground/40 border-border bg-muted';

  return (
    <span
      className={`inline-block rounded-lg border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${color}`}
    >
      {priority}
    </span>
  );
}
