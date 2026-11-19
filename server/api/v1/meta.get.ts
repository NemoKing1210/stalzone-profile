import { buildMetaSection } from '@profile/core';
import { useDb } from '../../utils/db';

export default defineEventHandler(() => buildMetaSection(useDb()));
