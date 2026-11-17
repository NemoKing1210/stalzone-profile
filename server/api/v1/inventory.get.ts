import { inventoryRead } from '@profile/core';
import { useDb } from '../../utils/db';

export default defineEventHandler(() => inventoryRead(useDb()));
