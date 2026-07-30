/**
 * Google Calendar integration. Owned by Track A (dashboard).
 *
 * Plain fetch over adding `googleapis` dep. Tokens stored in
 * calendar_tokens table, upserted on user_id.
 */

import { getDb } from './supabase';

// ---- Types ----

export type CalendarEvent = {
  event_id: string;
  title: string;
  start_time: string;   // ISO 8601
  end_time?: string;
  meeting_url?: string; // Google Meet / Zoom link
  notes?: string;       // user's saved notes from calendar_notes
  auto_dispatch?: boolean;
  dispatched?: boolean;
  notes_updated_at?: string;
};

type GoogleToken = {
  access_token: string;
  refresh_token?: string;
  expires_at: string;
};

// ---- OAuth helpers ----

export function getAuthUrl(): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not set');

  const redirectUri = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/api/calendar/callback`;
  const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.events.readonly');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<GoogleToken> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not set');

  const redirectUri = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/api/calendar/callback`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
  };
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not set');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

// ---- Token storage ----

async function getStoredToken(userId: string): Promise<string | null> {
  const { data, error } = await getDb()
    .from('calendar_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;

  // Refresh if expired or close to expiring (within 5 min)
  const expiresAt = new Date(data.expires_at).getTime();
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    if (!data.refresh_token) return null;
    try {
      const newToken = await refreshAccessToken(data.refresh_token);
      const { error: updErr } = await getDb()
        .from('calendar_tokens')
        .update({
          access_token: newToken,
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
      if (updErr) console.error('Failed to store refreshed token', updErr);
      return newToken;
    } catch {
      // Refresh failed, return stale token as last resort
      return data.access_token;
    }
  }

  return data.access_token;
}

export async function storeTokens(
  userId: string,
  tokens: GoogleToken,
): Promise<void> {
  const { error } = await getDb()
    .from('calendar_tokens')
    .upsert(
      {
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
}

// ---- Calendar API ----

export async function getTodayEvents(userId: string): Promise<CalendarEvent[]> {
  const token = await getStoredToken(userId);
  if (!token) return [];

  // Today, local timezone
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '20',
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];

  const data = await res.json();
  const events: CalendarEvent[] = (data.items ?? []).map((e: Record<string, unknown>) => {
    const conference = (e.conferenceData as Record<string, unknown> | undefined);
    const entryPoints = (conference?.entryPoints as Array<Record<string, unknown>>) ?? [];
    const meetEntry = entryPoints.find((ep) => ep.entryPointType === 'video');
    const meetingUrl =
      typeof meetEntry?.uri === 'string' ? meetEntry.uri
      : typeof e.hangoutLink === 'string' ? e.hangoutLink
      : undefined;

    return {
      event_id: e.id as string,
      title: (e.summary as string) ?? '(Untitled)',
      start_time: (e.start as Record<string, string>)?.dateTime ?? (e.start as Record<string, string>)?.date ?? '',
      end_time: (e.end as Record<string, string>)?.dateTime ?? (e.end as Record<string, string>)?.date,
      meeting_url: meetingUrl,
    };
  });

  // Merge in saved notes from calendar_notes
  const { data: notes } = await getDb()
    .from('calendar_notes')
    .select('event_id, notes, auto_dispatch, dispatched, updated_at')
    .eq('user_id', userId);

  if (notes) {
    const noteMap = new Map(notes.map((n: Record<string, unknown>) => [n.event_id as string, n]));
    for (const event of events) {
      const n = noteMap.get(event.event_id);
      if (n) {
        event.notes = (n.notes as string) ?? undefined;
        event.auto_dispatch = (n.auto_dispatch as boolean) ?? false;
        event.dispatched = (n.dispatched as boolean) ?? false;
        event.notes_updated_at = n.updated_at as string | undefined;
      }
    }
  }

  return events;
}
