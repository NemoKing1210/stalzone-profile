import { listSourceReads } from '@profile/core';
import { useDb } from '../../utils/db';

export default defineEventHandler(() => listSourceReads(useDb()));
