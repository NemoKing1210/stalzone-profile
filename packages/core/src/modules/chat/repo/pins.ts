import type { ChatPinTarget } from '@profile/shared/contracts';

import type { Db } from '../../../platform/db/index.js';

export interface ChatPinRow {
  id: number;
  item_id: number;
  instance_id: number | null;
  sort_order: number;
  created_at: string;
}

export function listChatPinRows(db: Db): ChatPinRow[] {
  return db.prepare(`SELECT * FROM chat_pin ORDER BY sort_order, id`).all() as ChatPinRow[];
}

/** The shelf is replaced as a whole; the service validates every target before this runs. */
export function replaceChatPinRows(db: Db, targets: readonly ChatPinTarget[]): void {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO chat_pin (item_id, instance_id, sort_order, created_at) VALUES (?, ?, ?, ?)`,
  );
  db.transaction(() => {
    db.prepare(`DELETE FROM chat_pin`).run();
    targets.forEach((target, index) => insert.run(target.itemId, target.instanceId ?? null, index, now));
  })();
}
