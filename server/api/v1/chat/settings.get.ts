import { chatSettingsRead } from '@profile/core';
import { useDb } from '../../../utils/db';

export default defineEventHandler(() => chatSettingsRead(useDb()));
