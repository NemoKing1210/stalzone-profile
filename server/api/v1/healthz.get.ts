import { getLogger } from '@profile/core';
import { useDb } from '../../utils/db';
import { apiError } from '../../utils/errors';

export default defineEventHandler((event) => {
  try {
    const db = useDb();
    db.prepare('SELECT 1 AS ok').get();
    return { ok: true, db: 'ok', time: new Date().toISOString() };
  } catch (error) {
    // The route is public: log the cause, never return paths or SQL to the caller.
    try {
      getLogger(useDb(), 'app').error('health check failed', {}, error);
    } catch {
      /* the database itself is unavailable */
    }
    return apiError(event, 503, 'DB_UNAVAILABLE', 'Database unavailable');
  }
});
