import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_VERSION, type ImportPayload, type LinkUpdate, type ProfileInput } from './validation.js';

export type DB = InstanceType<typeof Database>;

export interface Profile {
  name: string;
  title: string;
  theme: string;
}

export interface LinkRow {
  id: number;
  kind: 'link' | 'divider';
  label: string;
  url: string | null;
  icon: string | null;
  position: number;
  enabled: 0 | 1;
  click_count: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profile (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  name        TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  theme       TEXT NOT NULL DEFAULT 'auto',
  updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL DEFAULT 'link' CHECK (kind IN ('link', 'divider')),
  label       TEXT    NOT NULL,
  url         TEXT,
  icon        TEXT,
  position    INTEGER NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  click_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_links_position ON links(position);
`;

export function openDb(dataDir: string): DB {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, 'linkhub.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  seedIfEmpty(db);
  return db;
}

function seedIfEmpty(db: DB): void {
  const hasProfile = db.prepare('SELECT 1 FROM profile WHERE id = 1').get();
  if (hasProfile) return;
  const seed = db.transaction(() => {
    db.prepare(
      "INSERT INTO profile (id, name, title, theme, updated_at) VALUES (1, 'Qasim Mahmood', 'Senior SDET', 'auto', ?)"
    ).run(new Date().toISOString());
    const insert = db.prepare(
      'INSERT INTO links (kind, label, url, icon, position, enabled) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insert.run('link', 'GitHub', 'https://github.com/qasimmahmood95', 'github', 1, 1);
    insert.run('link', 'Personal site', 'https://qasimmahmood.org', 'globe', 2, 1);
    insert.run('link', 'Email me', 'mailto:qasimm999@gmail.com', 'mail', 3, 1);
    insert.run('link', 'LinkedIn [TODO: URL]', 'https://www.linkedin.com/in/todo', 'linkedin', 4, 0);
  });
  seed();
}

export type MoveResult = 'moved' | 'noop' | 'not-found';

export interface Repo {
  ping(): void;
  getProfile(): Profile;
  updateProfile(input: ProfileInput): void;
  listLinks(): LinkRow[];
  listEnabledLinks(): LinkRow[];
  getLink(id: number): LinkRow | undefined;
  createLink(input: { kind: string; label: string; url: string | null; icon: string | null; enabled: 0 | 1 }): number;
  updateLink(id: number, patch: LinkUpdate): boolean;
  deleteLink(id: number): boolean;
  moveLink(id: number, direction: 'up' | 'down'): MoveResult;
  /** Atomically counts a click and returns the target URL, or null when the
   *  link is missing, disabled, a divider, or a mailto (rendered directly). */
  recordClick(id: number): string | null;
  exportConfig(): object;
  importConfig(payload: ImportPayload): void;
}

export function createRepo(db: DB): Repo {
  return {
    ping() {
      db.prepare('SELECT 1').get();
    },

    getProfile(): Profile {
      return db.prepare('SELECT name, title, theme FROM profile WHERE id = 1').get() as Profile;
    },

    updateProfile(input: ProfileInput): void {
      db.prepare('UPDATE profile SET name = ?, title = ?, theme = ?, updated_at = ? WHERE id = 1').run(
        input.name,
        input.title,
        input.theme,
        new Date().toISOString()
      );
    },

    listLinks(): LinkRow[] {
      return db.prepare('SELECT * FROM links ORDER BY position').all() as LinkRow[];
    },

    listEnabledLinks(): LinkRow[] {
      return db.prepare('SELECT * FROM links WHERE enabled = 1 ORDER BY position').all() as LinkRow[];
    },

    getLink(id: number): LinkRow | undefined {
      return db.prepare('SELECT * FROM links WHERE id = ?').get(id) as LinkRow | undefined;
    },

    createLink(input): number {
      const result = db
        .prepare(
          'INSERT INTO links (kind, label, url, icon, position, enabled) ' +
            'VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM links), ?)'
        )
        .run(input.kind, input.label, input.url, input.icon, input.enabled);
      return Number(result.lastInsertRowid);
    },

    updateLink(id: number, patch: LinkUpdate): boolean {
      const fields: string[] = [];
      const values: unknown[] = [];
      if (patch.label !== undefined) {
        fields.push('label = ?');
        values.push(patch.label);
      }
      if (patch.url !== undefined) {
        fields.push('url = ?');
        values.push(patch.url);
      }
      if (patch.icon !== undefined) {
        fields.push('icon = ?');
        values.push(patch.icon);
      }
      if (patch.enabled !== undefined) {
        fields.push('enabled = ?');
        values.push(patch.enabled);
      }
      if (fields.length === 0) return false;
      const result = db.prepare(`UPDATE links SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
      return result.changes > 0;
    },

    deleteLink(id: number): boolean {
      return db.prepare('DELETE FROM links WHERE id = ?').run(id).changes > 0;
    },

    moveLink(id: number, direction: 'up' | 'down'): MoveResult {
      const move = db.transaction((): MoveResult => {
        const current = db.prepare('SELECT id, position FROM links WHERE id = ?').get(id) as
          | { id: number; position: number }
          | undefined;
        if (!current) return 'not-found';
        const neighbour = (
          direction === 'up'
            ? db.prepare('SELECT id, position FROM links WHERE position < ? ORDER BY position DESC LIMIT 1')
            : db.prepare('SELECT id, position FROM links WHERE position > ? ORDER BY position ASC LIMIT 1')
        ).get(current.position) as { id: number; position: number } | undefined;
        if (!neighbour) return 'noop';
        const setPosition = db.prepare('UPDATE links SET position = ? WHERE id = ?');
        setPosition.run(neighbour.position, current.id);
        setPosition.run(current.position, neighbour.id);
        return 'moved';
      });
      return move();
    },

    recordClick(id: number): string | null {
      const row = db
        .prepare(
          "UPDATE links SET click_count = click_count + 1 " +
            "WHERE id = ? AND kind = 'link' AND enabled = 1 AND url IS NOT NULL " +
            "AND lower(url) NOT LIKE 'mailto:%' RETURNING url"
        )
        .get(id) as { url: string } | undefined;
      return row?.url ?? null;
    },

    exportConfig(): object {
      const profile = this.getProfile();
      const links = this.listLinks().map((l) => ({
        kind: l.kind,
        label: l.label,
        url: l.url,
        icon: l.icon,
        enabled: l.enabled === 1,
        click_count: l.click_count,
      }));
      return {
        schema_version: SCHEMA_VERSION,
        exported_at: new Date().toISOString(),
        profile,
        links,
      };
    },

    importConfig(payload: ImportPayload): void {
      const run = db.transaction(() => {
        db.prepare('UPDATE profile SET name = ?, title = ?, theme = ?, updated_at = ? WHERE id = 1').run(
          payload.profile.name,
          payload.profile.title,
          payload.profile.theme,
          new Date().toISOString()
        );
        db.prepare('DELETE FROM links').run();
        const insert = db.prepare(
          'INSERT INTO links (kind, label, url, icon, position, enabled, click_count) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        payload.links.forEach((link, i) => {
          insert.run(link.kind, link.label, link.url, link.icon, i + 1, link.enabled, link.click_count);
        });
      });
      run();
    },
  };
}
