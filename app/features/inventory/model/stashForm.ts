export interface StashFormValues {
  name: string;
  maxWeight: number | string | null;
}

export interface StashCreateInput {
  name: string;
}

export interface StashPatchInput {
  name?: string;
  maxWeight?: number | null;
}

/** A new stash has no size input: the server always creates 8×200. */
export function stashCreateInput(values: { name: string }): StashCreateInput {
  return { name: values.name.trim() };
}

/**
 * The patch contains only fields that differ from the stored stash. An empty
 * weight input means "no limit" and is sent as null, never zero.
 */
export function stashPatchInput(
  values: StashFormValues,
  current: { name: string; maxWeight: number | null },
): StashPatchInput {
  const patch: StashPatchInput = {};
  const name = values.name.trim();
  if (name && name !== current.name) patch.name = name;
  const maxWeight = values.maxWeight === '' || values.maxWeight == null ? null : Number(values.maxWeight);
  if (maxWeight !== current.maxWeight) patch.maxWeight = maxWeight;
  return patch;
}
