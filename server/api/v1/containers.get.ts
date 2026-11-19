import { buildContainersSection } from '@profile/core';
import { useDb } from '../../utils/db';

export default defineEventHandler(() => buildContainersSection(useDb()));
