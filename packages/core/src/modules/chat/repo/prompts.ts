import type { Db } from '../../../platform/db/index.js';

export interface ChatPromptRow {
  id: number;
  kind: 'system' | 'skill';
  name: string;
  body: string;
  version: number;
  enabled: number;
  created_at: string;
}

export function listActivePrompts(db: Db): ChatPromptRow[] {
  return db
    .prepare(
      `SELECT p.* FROM chat_prompt_active a
       JOIN chat_prompt p ON p.id = a.prompt_id
       ORDER BY p.kind = 'system' DESC, p.name`,
    )
    .all() as ChatPromptRow[];
}

export function listPromptVersions(db: Db, kind: string, name: string): ChatPromptRow[] {
  return db
    .prepare(`SELECT * FROM chat_prompt WHERE kind = ? AND name = ? ORDER BY version DESC`)
    .all(kind, name) as ChatPromptRow[];
}

export function getPromptVersion(db: Db, kind: string, name: string, version: number): ChatPromptRow | null {
  return (
    (db.prepare(`SELECT * FROM chat_prompt WHERE kind = ? AND name = ? AND version = ?`).get(kind, name, version) as
      | ChatPromptRow
      | undefined) ?? null
  );
}

/** Appends a version and makes it active; the caller holds the transaction. */
export function insertPromptVersion(
  db: Db,
  input: { kind: 'system' | 'skill'; name: string; body: string; enabled: boolean },
): number {
  const now = new Date().toISOString();
  const last = db
    .prepare(`SELECT MAX(version) AS version FROM chat_prompt WHERE kind = ? AND name = ?`)
    .get(input.kind, input.name) as { version: number | null };
  const version = (last.version ?? 0) + 1;
  const info = db
    .prepare(
      `INSERT INTO chat_prompt (kind, name, body, version, enabled, created_at)
       VALUES (@kind, @name, @body, @version, @enabled, @created_at)`,
    )
    .run({
      kind: input.kind,
      name: input.name,
      body: input.body,
      version,
      enabled: input.enabled ? 1 : 0,
      created_at: now,
    });
  const id = Number(info.lastInsertRowid);
  db.prepare(
    `INSERT INTO chat_prompt_active (kind, name, prompt_id, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(kind, name) DO UPDATE SET prompt_id = excluded.prompt_id, updated_at = excluded.updated_at`,
  ).run(input.kind, input.name, id, now);
  return id;
}

/** Points a name at an existing version. */
export function activatePrompt(db: Db, promptId: number): void {
  const row = db.prepare(`SELECT kind, name FROM chat_prompt WHERE id = ?`).get(promptId) as
    | { kind: string; name: string }
    | undefined;
  if (!row) return;
  db.prepare(
    `INSERT INTO chat_prompt_active (kind, name, prompt_id, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(kind, name) DO UPDATE SET prompt_id = excluded.prompt_id, updated_at = excluded.updated_at`,
  ).run(row.kind, row.name, promptId, new Date().toISOString());
}
