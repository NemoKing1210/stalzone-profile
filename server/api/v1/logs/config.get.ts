import { clientLogConfig } from '@profile/core';
import { useDb } from '../../../utils/db';

export default defineEventHandler(() => clientLogConfig(useDb()));
