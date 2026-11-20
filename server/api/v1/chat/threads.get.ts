import { chatThreads } from '@profile/mcp';
import { useDb } from '../../../utils/db';

export default defineEventHandler(() => chatThreads(useDb()));
