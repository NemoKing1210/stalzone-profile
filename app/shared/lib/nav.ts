import type { ProfilePayload } from '~/shared/types/profile';

export interface NavCounts {
  weapons: number | null;
  armor: number | null;
  containers: number | null;
  artifacts: number | null;
}

/**
 * Owned counts for the menu badges, from the same payload lists the pages render.
 * `null` means the payload is not available yet, so the badge shows nothing rather
 * than a misleading zero.
 */
export function navCounts(payload: ProfilePayload | null | undefined): NavCounts {
  if (!payload) return { weapons: null, armor: null, containers: null, artifacts: null };
  return {
    weapons: payload.weapons.length,
    armor: payload.armor.length,
    containers: payload.containers.length,
    artifacts: payload.artifacts.length,
  };
}
