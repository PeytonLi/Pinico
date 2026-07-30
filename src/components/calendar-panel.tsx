'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CalendarEvent } from '@/lib/google';

export function CalendarPanel({ profileId }: { profileId: string }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Check URL params for calendar connection status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar') === 'connected') {
      setSuccessMsg('Calendar connected!');
      window.history.replaceState({}, '', '/dashboard');
      setTimeout(() => setSuccessMsg(null), 4000);
    } else if (params.get('calendar') === 'error') {
      setError('Calendar connection failed. Try again.');
      window.history.replaceState({}, '', '/dashboard');
      setTimeout(() => setError(null), 6000);
    }
  }, []);

  void profileId;

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/calendar/events');
      if (res.status === 401) {
        setConnected(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setConnected(data.connected !== false);
        setEvents(data.events ?? []);
      } else {
        setConnected(false);
      }
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  async function handleSave(
    event: CalendarEvent,
    notes: string,
    autoDispatch: boolean,
  ) {
    setSaving((prev) => new Set(prev).add(event.event_id));
    try {
      const res = await fetch('/api/calendar/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: event.event_id,
          meeting_title: event.title,
          meeting_url: event.meeting_url ?? null,
          start_time: event.start_time,
          end_time: event.end_time ?? null,
          notes,
          auto_dispatch: autoDispatch,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSuccessMsg('Notes saved!');
      setTimeout(() => setSuccessMsg(null), 2000);
      // Refresh events to show updated state
      fetchEvents();
    } catch {
      setError('Failed to save notes.');
      setTimeout(() => setError(null), 3000);
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(event.event_id);
        return next;
      });
    }
  }

  // Format time
  function fmtTime(iso: string) {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  // Not connected state
  if (connected === false) {
    return (
      <section>
        <h2 className="font-display text-lg font-semibold mb-4">Calendar</h2>
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <CalendarIcon />
          <p className="mt-3 font-display font-semibold text-sm">Connect Google Calendar</p>
          <p className="mt-1 text-xs text-foreground/40 max-w-xs mx-auto leading-relaxed">
            See today&apos;s meetings and leave notes for your agent before each one.
          </p>
          <a
            href="/api/calendar/auth"
            className="inline-flex items-center gap-2 mt-4 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20"
          >
            <GoogleIcon />
            Connect Calendar
          </a>
        </div>
      </section>
    );
  }

  // Loading state
  if (loading) {
    return (
      <section>
        <h2 className="font-display text-lg font-semibold mb-4">Calendar</h2>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-3 animate-pulse">
            <div className="h-10 w-10 rounded-xl bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Connected state
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-semibold">Today&apos;s meetings</h2>
        <span className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Synced
        </span>
      </div>

      {/* Success / error toasts */}
      {successMsg && (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
          {successMsg}
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </div>
      )}

      {events.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-5 text-center">
          <p className="text-sm text-foreground/40">No meetings scheduled today.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((event) => (
            <CalendarEventCard
              key={event.event_id}
              event={event}
              saving={saving.has(event.event_id)}
              onSave={handleSave}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CalendarEventCard({
  event,
  saving,
  onSave,
}: {
  event: CalendarEvent;
  saving: boolean;
  onSave: (event: CalendarEvent, notes: string, autoDispatch: boolean) => void;
}) {
  const [notes, setNotes] = useState(event.notes ?? '');
  const [autoDispatch, setAutoDispatch] = useState(event.auto_dispatch ?? false);
  const [expanded, setExpanded] = useState(!!event.notes);
  const hasNotes = (event.notes ?? '').trim().length > 0;

  // Sync state when event data changes (e.g. after save + refetch)
  useEffect(() => {
    setNotes(event.notes ?? '');
    setAutoDispatch(event.auto_dispatch ?? false);
  }, [event.notes, event.auto_dispatch]);

  const isDirty = notes !== (event.notes ?? '') || autoDispatch !== (event.auto_dispatch ?? false);

  return (
    <div className="rounded-2xl border border-border bg-surface transition-all duration-200 hover:border-primary/20">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-4 p-4 text-left"
      >
        {/* Time column */}
        <div className="flex-shrink-0 w-16 text-center">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">
            {fmtTime(event.start_time)}
          </p>
          {event.end_time && (
            <p className="text-[10px] text-foreground/30 mt-0.5">
              {fmtTime(event.end_time)}
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="h-10 w-px bg-border flex-shrink-0" />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate">{event.title}</p>
            {hasNotes && (
              <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-emerald-400" title="Notes saved" />
            )}
            {event.dispatched && (
              <span className="flex-shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                LIVE
              </span>
            )}
          </div>
          {event.meeting_url && (
            <p className="text-xs text-foreground/30 truncate mt-0.5">
              {event.meeting_url}
            </p>
          )}
        </div>

        {/* Expand chevron */}
        <span className={`text-foreground/20 text-sm transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {/* Expanded — notes + actions */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 flex flex-col gap-3">
          <textarea
            className="w-full rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm placeholder:text-foreground/20 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-colors resize-y min-h-[80px]"
            placeholder="Add notes for your agent... (what to say, what to track, any blockers)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {/* Auto-dispatch toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoDispatch}
              onChange={(e) => setAutoDispatch(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
            />
            <span className="text-xs text-foreground/50">
              Auto-dispatch agent when meeting starts
            </span>
          </label>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              disabled={saving || !isDirty}
              onClick={() => onSave(event, notes, autoDispatch)}
              className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-primary/90 disabled:opacity-30"
            >
              {saving ? 'Saving...' : 'Save Notes'}
            </button>
            {event.meeting_url && (
              <a
                href={event.meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-border px-3.5 py-1.5 text-xs font-semibold text-foreground/50 hover:text-foreground hover:border-foreground/20 transition-all duration-200"
              >
                Join Meeting ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function CalendarIcon() {
  return (
    <svg className="mx-auto" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" className="text-primary/60" />
      <line x1="16" x2="16" y1="2" y2="6" className="text-foreground/30" />
      <line x1="8" x2="8" y1="2" y2="6" className="text-foreground/30" />
      <line x1="3" x2="21" y1="10" y2="10" className="text-foreground/30" />
      <rect width="4" height="2" x="6" y="14" rx="0.5" className="text-primary/70" />
      <rect width="4" height="2" x="12" y="14" rx="0.5" className="text-primary/70" />
      <rect width="4" height="2" x="6" y="18" rx="0.5" className="text-foreground/20" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
