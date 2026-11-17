import { listSourceReads } from '@dossier/core';
import { useDb } from '../../utils/db';

export default defineEventHandler(() => listSourceReads(useDb()));
