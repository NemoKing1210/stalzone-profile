import { cleanupCounts } from '@dossier/core/services/writes';
import { useDb } from '../../../utils/db';

export default defineEventHandler(() => cleanupCounts(useDb()));
