import { listSources, setupState } from '@dossier/core';
import { useDb } from '../../utils/db';
import { sourceJson } from '../../utils/serialize';

export default defineEventHandler(() => {
  const db = useDb();
  const config = useRuntimeConfig();
  return {
    ...setupState(db),
    profileApiConfigured: Boolean(config.stalzoneClientId && config.stalzoneClientSecret),
    sources: listSources(db).map(sourceJson),
  };
});
