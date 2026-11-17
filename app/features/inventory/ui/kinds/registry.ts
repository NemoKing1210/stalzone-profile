import type { Component } from 'vue';

import AddOwnedAction from './AddOwnedAction.vue';
import ArmorCard from './ArmorCard.vue';
import ArtifactCard from './ArtifactCard.vue';
import ContainerActions from './ContainerActions.vue';
import ContainerCard from './ContainerCard.vue';
import ContainerDetailPanel from './ContainerDetailPanel.vue';
import ItemDetail from './ItemDetail.vue';
import LocationCell from './LocationCell.vue';
import RankCell from './RankCell.vue';
import WeaponCard from './WeaponCard.vue';

export interface InventoryUi {
  card: Component;
  detail: Component;
  detailKind?: 'weapon' | 'armor' | 'artifact';
  actions: Component;
  /** Column keys rendered by a component instead of a plain-text cell. */
  cells?: Record<string, Component>;
}

/** Binds a kind's pure config to its components; the screen never branches on the kind key. */
export const INVENTORY_UI: Record<'weapon' | 'armor' | 'artifact' | 'container', InventoryUi> = {
  weapon: {
    card: WeaponCard,
    detail: ItemDetail,
    detailKind: 'weapon',
    actions: AddOwnedAction,
    cells: { rank: RankCell, location: LocationCell },
  },
  armor: {
    card: ArmorCard,
    detail: ItemDetail,
    detailKind: 'armor',
    actions: AddOwnedAction,
    cells: { rank: RankCell, location: LocationCell },
  },
  artifact: {
    card: ArtifactCard,
    detail: ItemDetail,
    detailKind: 'artifact',
    actions: AddOwnedAction,
    cells: { rank: RankCell, location: LocationCell },
  },
  container: {
    card: ContainerCard,
    detail: ContainerDetailPanel,
    actions: ContainerActions,
    cells: { rank: RankCell, location: LocationCell },
  },
};
