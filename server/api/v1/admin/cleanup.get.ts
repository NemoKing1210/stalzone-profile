import { cleanupCounts } from '@profile/core';
import { useDb } from '../../../utils/db';

export default defineEventHandler(() => cleanupCounts(useDb()));
