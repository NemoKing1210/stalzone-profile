import { buildPayload } from '@dossier/core';
import { useDb } from '../../../utils/db';
import { apiError } from '../../../utils/errors';

export default defineEventHandler((event) => {
  const slug = getRouterParam(event, 'slug');
  const builds = buildPayload(useDb()).builds;
  const build = builds.items.find((item: { id: string }) => item.id === slug);
  if (!build) return apiError(event, 404, 'BUILD_NOT_FOUND', 'Build not found');
  return build;
});
