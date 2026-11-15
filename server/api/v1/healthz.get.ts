import { useDb } from '../../utils/db';
import { apiError } from '../../utils/errors';

export default defineEventHandler((event) => {
  try {
    useDb().prepare('SELECT 1 AS ok').get();
  } catch (error) {
    return apiError(event, 503, 'DB_UNAVAILABLE', 'База данных недоступна', String(error));
  }
  return { ok: true, db: 'ok', time: new Date().toISOString() };
});
