import { readLoggingSettings } from '@profile/core';
import { useDb } from '../../../utils/db';

export default defineEventHandler(() => readLoggingSettings(useDb()));
