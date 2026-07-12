import { isIconName, type IconName } from './icons.js';
import { isThemeChoice } from './themes.js';

/** Raised for any bad client input; mapped to HTTP 400 by the API error handler. */
export class ValidationError extends Error {}

export const SCHEMA_VERSION = 1;

// The scheme allowlist is what makes the redirect endpoint safe: nothing
// outside this set can ever reach the database, so /r/:id can never emit
// a javascript:, data:, file: (etc.) Location header.
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asTrimmedString(value: unknown, what: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string') throw new ValidationError(`${what} must be a string`);
  const s = value.trim();
  if (!allowEmpty && s === '') throw new ValidationError(`${what} must not be empty`);
  if (s.length > max) throw new ValidationError(`${what} must be at most ${max} characters`);
  return s;
}

export function isMailto(url: string): boolean {
  return /^mailto:/i.test(url);
}

export function validateUrl(value: unknown): string {
  const s = asTrimmedString(value, 'url', 2048);
  // new URL() silently strips embedded tabs/newlines, so check the raw string too.
  if (/[\u0000-\u001f\u007f]/.test(s)) {
    throw new ValidationError('url must not contain control characters');
  }
  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    throw new ValidationError('url must be an absolute URL');
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new ValidationError('url scheme must be http, https or mailto');
  }
  return s;
}

export interface LinkInput {
  kind: 'link' | 'divider';
  label: string;
  url: string | null;
  icon: IconName | null;
  enabled: 0 | 1;
}

function validateEnabled(value: unknown): 0 | 1 {
  if (typeof value !== 'boolean' && value !== 0 && value !== 1) {
    throw new ValidationError('enabled must be a boolean');
  }
  return value === true || value === 1 ? 1 : 0;
}

export function validateNewLink(body: unknown): LinkInput {
  const o = asObject(body, 'link');
  const kind = o.kind ?? 'link';
  if (kind !== 'link' && kind !== 'divider') {
    throw new ValidationError("kind must be 'link' or 'divider'");
  }
  const label = asTrimmedString(o.label, 'label', 120);
  let url: string | null = null;
  let icon: IconName | null = null;
  if (kind === 'link') {
    url = validateUrl(o.url);
    if (o.icon != null && o.icon !== '') {
      if (!isIconName(o.icon)) throw new ValidationError('icon must be one of the built-in set');
      icon = o.icon;
    }
  } else {
    if (o.url != null && o.url !== '') throw new ValidationError('a divider cannot have a url');
    if (o.icon != null && o.icon !== '') throw new ValidationError('a divider cannot have an icon');
  }
  const enabled = validateEnabled(o.enabled ?? true);
  return { kind, label, url, icon, enabled };
}

export interface LinkUpdate {
  label?: string;
  url?: string;
  icon?: IconName | null;
  enabled?: 0 | 1;
}

export function validateLinkUpdate(body: unknown, kind: 'link' | 'divider'): LinkUpdate {
  const o = asObject(body, 'link');
  if ('kind' in o && o.kind !== kind) throw new ValidationError('kind cannot be changed');
  const out: LinkUpdate = {};
  if ('label' in o) out.label = asTrimmedString(o.label, 'label', 120);
  if ('url' in o) {
    if (kind === 'divider') {
      if (o.url != null && o.url !== '') throw new ValidationError('a divider cannot have a url');
    } else {
      out.url = validateUrl(o.url);
    }
  }
  if ('icon' in o) {
    if (o.icon == null || o.icon === '') {
      out.icon = null;
    } else if (kind === 'divider') {
      throw new ValidationError('a divider cannot have an icon');
    } else if (!isIconName(o.icon)) {
      throw new ValidationError('icon must be one of the built-in set');
    } else {
      out.icon = o.icon;
    }
  }
  if ('enabled' in o) out.enabled = validateEnabled(o.enabled);
  if (Object.keys(out).length === 0) throw new ValidationError('no editable fields supplied');
  return out;
}

export interface ProfileInput {
  name: string;
  title: string;
  theme: string;
}

export function validateProfile(body: unknown): ProfileInput {
  const o = asObject(body, 'profile');
  const name = asTrimmedString(o.name, 'name', 80);
  const title = asTrimmedString(o.title ?? '', 'title', 160, true);
  const theme = o.theme ?? 'auto';
  if (!isThemeChoice(theme)) {
    throw new ValidationError('theme must be one of the built-in themes or auto');
  }
  return { name, title, theme };
}

export interface ImportPayload {
  profile: ProfileInput;
  links: (LinkInput & { click_count: number })[];
}

/**
 * Import runs every row through the same validators as the write APIs, so a
 * restored backup cannot bypass write-time guarantees (scheme allowlist, icon
 * enum, kind rules, single profile object).
 */
export function validateImport(body: unknown): ImportPayload {
  const o = asObject(body, 'import payload');
  if (o.schema_version !== SCHEMA_VERSION) {
    throw new ValidationError(`unsupported schema_version (expected ${SCHEMA_VERSION})`);
  }
  const profile = validateProfile(o.profile);
  if (!Array.isArray(o.links)) throw new ValidationError('links must be an array');
  if (o.links.length > 500) throw new ValidationError('too many links (maximum 500)');
  const links = o.links.map((entry, i) => {
    try {
      const link = validateNewLink(entry);
      const cc = asObject(entry, 'link').click_count ?? 0;
      if (typeof cc !== 'number' || !Number.isInteger(cc) || cc < 0 || cc > 1_000_000_000) {
        throw new ValidationError('click_count must be a non-negative integer');
      }
      return { ...link, click_count: cc };
    } catch (err) {
      if (err instanceof ValidationError) throw new ValidationError(`links[${i}]: ${err.message}`);
      throw err;
    }
  });
  return { profile, links };
}
