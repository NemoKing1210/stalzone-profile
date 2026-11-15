import { z } from 'zod';
import { ItemKindSchema } from '@dossier/shared';
import { getCharacter, listOwned } from '@dossier/core';
import { useDb } from '../../utils/db';
import { validationError } from '../../utils/errors';
import { ownedJson } from '../../utils/serialize';

const QuerySchema = z.object({
  kind: ItemKindSchema.optional(),
});

export default defineEventHandler((event) => {
  const parsed = QuerySchema.safeParse(getQuery(event));
  if (!parsed.success) return validationError(event, parsed.error);

  const db = useDb();
  const character = getCharacter(db);
  if (!character) return [];

  return listOwned(db, character.id, parsed.data.kind).map((row) => ownedJson(row));
});
