import { document, html, type Raw } from '../html.js';
import { iconSvg, isIconName } from '../icons.js';
import { isMailto } from '../validation.js';
import type { LinkRow, Profile } from '../db.js';

export interface PublicPageOptions {
  /** Validated theme override used by the admin live preview. */
  theme?: string;
  hasAvatar: boolean;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 2);
  return words.map((w) => (w[0] ?? '').toUpperCase()).join('') || '?';
}

function linkHref(link: LinkRow): string {
  // mailto renders as a direct href: in-app webviews handle 302-to-mailto
  // unreliably, so email links skip the redirect (and the click counter).
  if (link.url !== null && isMailto(link.url)) return link.url;
  return `/r/${link.id}`;
}

interface Section {
  heading: string | null;
  items: LinkRow[];
}

export function renderPublicPage(profile: Profile, links: LinkRow[], opts: PublicPageOptions): string {
  const theme = opts.theme ?? profile.theme;

  const sections: Section[] = [{ heading: null, items: [] }];
  for (const link of links) {
    if (link.kind === 'divider') {
      sections.push({ heading: link.label, items: [] });
    } else {
      sections[sections.length - 1]?.items.push(link);
    }
  }

  const body: Raw[] = sections
    .filter((s) => s.heading !== null || s.items.length > 0)
    .map((section) =>
      html`${section.heading !== null ? html`<h2 class="section-heading">${section.heading}</h2>` : null}
      ${section.items.length > 0
        ? html`<ul class="links">
            ${section.items.map(
              (link) =>
                html`<li>
                  <a class="btn" href="${linkHref(link)}"
                    >${link.icon !== null && isIconName(link.icon) ? iconSvg(link.icon) : null}<span
                      >${link.label}</span
                    ></a
                  >
                </li>`
            )}
          </ul>`
        : null}`
    );

  return document(html`<html lang="en-GB" data-theme="${theme}">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="description" content="${profile.title !== '' ? profile.title : profile.name}" />
      <title>${profile.name}</title>
      <link rel="stylesheet" href="/styles.css" />
    </head>
    <body>
      <main class="wrap">
        <header class="profile">
          ${opts.hasAvatar
            ? html`<img class="avatar" src="/avatar" alt="" width="96" height="96" />`
            : html`<div class="avatar-fallback" aria-hidden="true">${initials(profile.name)}</div>`}
          <h1>${profile.name}</h1>
          ${profile.title !== '' ? html`<p class="title">${profile.title}</p>` : null}
        </header>
        ${body}
      </main>
    </body>
  </html>`);
}
