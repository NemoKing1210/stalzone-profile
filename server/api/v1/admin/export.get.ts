import { exportLegacyJson } from '@dossier/core';
import { useDb } from '../../../utils/db';

export default defineEventHandler(() => exportLegacyJson(useDb()));
