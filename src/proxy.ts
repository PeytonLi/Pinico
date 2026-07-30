import { auth0 } from './lib/auth0';

// Next.js 16 replaces middleware.ts with proxy.ts. The broad matcher is
// required — it is what mounts the /auth/* routes and refreshes rolling
// sessions. Do not narrow it to /auth.
export async function proxy(request: Request) {
  return await auth0.middleware(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
};
