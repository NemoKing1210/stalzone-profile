import { cleanupCounts } from '@dossier/core';
import { useDb } from '../../../utils/db';

export default defineEventHandler(() => cleanupCounts(useDb()));
