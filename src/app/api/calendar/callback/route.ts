import { getOrCreateProfile } from '@/lib/profile';
import { exchangeCode, storeTokens } from '@/lib/google';

function html(msg: string, ok: boolean) {
  return new Response(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;text-align:center"><h1 style="color:${ok ? '#16a34a' : '#dc2626'}">${ok ? '✓ Connected' : '✗ Error'}</h1><p style="color:#666">${msg}</p><p><a href="/dashboard">Back to Dashboard</a></p></body></html>`,
    { headers: { 'Content-Type': 'text/html' } },
  );
}

export async function GET(request: Request) {
  const profile = await getOrCreateProfile();
  if (!profile) return html('Not logged in. Please log in first.', false);

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) return html(`Google returned: ${error}`, false);
  if (!code) return html('No authorization code received from Google.', false);

  try {
    const tokens = await exchangeCode(code);
    await storeTokens(profile.id, tokens);
    return html('Google Calendar connected successfully!', true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Calendar callback error:', msg);
    return html(`Token exchange failed: ${msg}`, false);
  }
}
