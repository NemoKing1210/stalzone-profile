import { buildCharacterSection } from '@profile/core';
import { useDb } from '../../utils/db';

export default defineEventHandler(() => buildCharacterSection(useDb()));
