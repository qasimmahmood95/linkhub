import { themeCss } from './themes.js';

// The complete public stylesheet: theme variable sets + a small, typography-led
// base. Served as one cacheable file; total public page weight stays well
// under the 30KB budget.
const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;background:var(--bg);color:var(--text);line-height:1.5;min-height:100vh}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.wrap{max-width:37.5rem;margin:0 auto;padding:3rem 1rem 4rem}
.profile{text-align:center;margin-bottom:2rem}
.avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;border:1px solid var(--border)}
.avatar-fallback{width:96px;height:96px;border-radius:50%;background:var(--surface);border:1px solid var(--border);display:inline-flex;align-items:center;justify-content:center;font-size:2rem;font-weight:600;color:var(--text-muted)}
.profile h1{font-size:1.375rem;margin:1rem 0 .25rem;letter-spacing:-.01em}
.profile .title{margin:0;color:var(--text-muted)}
.links{list-style:none;padding:0;margin:0;display:grid;gap:.75rem}
.section-heading{font-size:.8125rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);margin:1.75rem 0 .75rem;text-align:center}
.section-heading:first-child{margin-top:0}
.btn{position:relative;display:flex;align-items:center;justify-content:center;min-height:3rem;padding:.75rem 3rem;background:var(--surface);border:1px solid var(--border);border-radius:.75rem;color:var(--text);text-decoration:none;font-weight:500;overflow-wrap:anywhere;transition:background-color .15s ease}
.btn:hover{background:var(--surface-hover)}
.btn:active{transform:scale(.99)}
.btn svg{position:absolute;left:1rem;top:50%;translate:0 -50%;color:var(--text-muted)}
@media (max-width:22.5em){.wrap{padding:2rem .75rem 3rem}.btn{padding:.75rem 2.5rem}.btn svg{left:.75rem}}
`;

export const publicCss: string = themeCss() + BASE_CSS;
