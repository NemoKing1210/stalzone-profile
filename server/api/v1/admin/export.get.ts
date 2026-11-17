import { exportProfileJson } from '@profile/core';
import { useDb } from '../../../utils/db';

export default defineEventHandler((event) => {
  setHeader(event, 'content-disposition', 'attachment; filename="profile.json"');
  return exportProfileJson(useDb());
});
