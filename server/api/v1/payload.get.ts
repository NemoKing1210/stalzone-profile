import { buildPayload } from '@profile/core';
import { useDb } from '../../utils/db';

export default defineEventHandler(() => buildPayload(useDb()));
