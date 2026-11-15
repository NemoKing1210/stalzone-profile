import { useDb } from '../utils/db';

export default defineNitroPlugin(() => {
  useDb();
});
