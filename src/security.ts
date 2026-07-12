// The public page ships zero client JS, so no script-src is needed at all:
// default-src 'none' blocks scripts outright. frame-ancestors is 'self'
// (not 'none') because the admin live preview iframes the public page.
export const PUBLIC_CSP =
  "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'";

// Admin pages load their own JS and CSS from /admin/* and call /api/admin/*.
export const ADMIN_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; " +
  "frame-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'";
