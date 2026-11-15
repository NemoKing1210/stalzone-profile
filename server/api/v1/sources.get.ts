import { listSources } from '@dossier/core';
import { useDb } from '../../utils/db';
import { sourceJson } from '../../utils/serialize';

export default defineEventHandler(() => listSources(useDb()).map(sourceJson));
