const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

/** A string that has already been escaped or is known-safe markup. */
export class Raw {
  constructor(readonly value: string) {}
}

export function raw(value: string): Raw {
  return new Raw(value);
}

type Piece = string | number | Raw | null | undefined | false | Piece[];

function render(piece: Piece): string {
  if (piece == null || piece === false) return '';
  if (piece instanceof Raw) return piece.value;
  if (Array.isArray(piece)) return piece.map(render).join('');
  if (typeof piece === 'number') return String(piece);
  return escapeHtml(piece);
}

/**
 * Tagged template that escapes every interpolated value unless it is Raw.
 * Nested html`` results are Raw, so composition never double-escapes.
 */
export function html(strings: TemplateStringsArray, ...values: Piece[]): Raw {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i] ?? '';
    if (i < values.length) out += render(values[i]);
  }
  return new Raw(out);
}

export function document(body: Raw): string {
  return '<!doctype html>\n' + body.value;
}
