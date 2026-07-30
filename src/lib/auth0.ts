import { Auth0Client } from '@auth0/nextjs-auth0/server';

// Reads AUTH0_DOMAIN / AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET / AUTH0_SECRET
// / APP_BASE_URL from the environment. Routes (/auth/login, /auth/logout,
// /auth/callback) are mounted by the proxy in src/proxy.ts — there is no
// route handler to write.
export const auth0 = new Auth0Client();
