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
  const [previousTicketCount, setPreviousTicketCount] = useState(0);
  const [newTicketKeys, setNewTicketKeys] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Only store profileId for dispatch — not needed right now since API
  // validates auth via cookies, but kept for potential future use.
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
            // New tickets appeared — flag them for animation
            const newKeys = new Set<string>();
            state.tickets.slice(prevCount).forEach((t) => newKeys.add(t.jira_ticket_key));
            setNewTicketKeys(newKeys);
            // Clear the highlight after animation
            setTimeout(() => setNewTicketKeys(new Set()), 2000);
          }
          return state;
        });

        if (state.status === 'completed') {
          stopPolling();
        }
      } catch {
        // swallow polling errors — stub might not respond yet
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
      setPreviousTicketCount(0);
      startPolling(data.meeting_id);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setDispatching(false);
    }
  }

  const statusColor =
    meetingState?.status === 'in_call'
      ? 'bg-emerald-500'
      : meetingState?.status === 'completed'
        ? 'bg-foreground/30'
        : 'bg-amber-500';

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Live meeting</h2>

      {/* Dispatch form */}
      {!meetingId && (
        <form onSubmit={handleDispatch} className="flex flex-col gap-3 rounded-xl border border-foreground/10 p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground/70">
              Meeting link
            </span>
            <input
              type="url"
              className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2 text-sm placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              placeholder="Paste Google Meet or Zoom link..."
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={dispatching}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {dispatching ? 'Dispatching...' : 'Dispatch Bot'}
            </button>
            {error && <span className="text-sm text-red-500">{error}</span>}
          </div>
        </form>
      )}

      {/* Live status */}
      {meetingState && (
        <div className="rounded-xl border border-foreground/10 p-5">
          <div className="flex items-center gap-3">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusColor} ${meetingState.status === 'in_call' ? 'animate-pulse' : ''}`} />
            <span className="text-sm font-medium capitalize">
              {meetingState.status.replace('_', ' ')}
            </span>
            <span className="text-sm text-foreground/40">
              &middot; {meetingState.duration_minutes} min
            </span>
            {meetingState.status === 'in_call' && (
              <span className="text-xs text-foreground/30 ml-auto">Polling every 2s</span>
            )}
          </div>

          {/* Ticket cards */}
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
                    className={`block rounded-lg border p-3 transition-all duration-500 ${
                      isNew
                        ? 'border-indigo-500/40 bg-indigo-500/5 animate-slide-up'
                        : 'border-foreground/10 bg-foreground/[0.02] hover:border-foreground/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {ticket.jira_ticket_key}
                      </span>
                      <PriorityBadge priority={ticket.priority} />
                    </div>
                    <p className="mt-1 text-sm text-foreground/70">
                      {ticket.summary}
                    </p>
                  </a>
                );
              })}
            </div>
          )}

          {meetingState.tickets.length === 0 && meetingState.status === 'in_call' && (
            <p className="mt-4 text-sm text-foreground/30">
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
    Highest: 'text-red-500 border-red-500/20 bg-red-500/5',
    High: 'text-orange-500 border-orange-500/20 bg-orange-500/5',
    Medium: 'text-amber-500 border-amber-500/20 bg-amber-500/5',
    Low: 'text-foreground/50 border-foreground/10 bg-foreground/5',
  };
  const color =
    colors[priority] ?? 'text-foreground/50 border-foreground/10 bg-foreground/5';

  return (
    <span
      className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${color}`}
    >
      {priority}
    </span>
  );
}
