import { exportLegacyJson } from '@dossier/core';
import { useDb } from '../../../utils/db';

export default defineEventHandler((event) => {
  setHeader(event, 'content-disposition', 'attachment; filename="dossier.json"');
  return exportLegacyJson(useDb());
});
