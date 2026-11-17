import { defaultSetupRegion, setupState, listSourceReads } from '@profile/core';
import { useDb } from '../../utils/db';

export default defineEventHandler(() => {
  const db = useDb();
  const config = useRuntimeConfig();
  return {
    ...setupState(db),
    defaultRegion: defaultSetupRegion(String(config.realm)),
    profileApiConfigured: Boolean(config.stalzoneClientId && config.stalzoneClientSecret),
    sources: listSourceReads(db),
  };
});
