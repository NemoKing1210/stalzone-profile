import { CHAT_PIN_LIMIT } from '@profile/shared/contracts';
import { readChatPins } from '@profile/core';

import { useDb } from '../../../utils/db';

export default defineEventHandler(() => ({ pins: readChatPins(useDb()), limit: CHAT_PIN_LIMIT }));
