import { buildPayload } from '@dossier/core';
import { useDb } from '../../utils/db';

export default defineEventHandler(() => buildPayload(useDb()));
