import type { Component } from 'vue';

import AddOwnedAction from './AddOwnedAction.vue';
import ArmorCard from './ArmorCard.vue';
import ArtifactCard from './ArtifactCard.vue';
import ContainerActions from './ContainerActions.vue';
import ContainerCard from './ContainerCard.vue';
import DeviceCard from './DeviceCard.vue';
import LocationCell from './LocationCell.vue';
import RankCell from './RankCell.vue';
import WeaponCard from './WeaponCard.vue';
import WeaponTargetSettings from './WeaponTargetSettings.vue';
import WeaponChartPanel from '../WeaponChartPanel.vue';

export interface InventoryUi {
  card: Component;
  /** Present only for kinds whose rows can be added as owned instances. */
  actions?: Component;
  /** A page-level settings strip above the toolbar (the weapons target HP). */
  settings?: Component;
  /** A third view besides grid and list (the weapons damage-falloff chart). */
  chart?: Component;
  /** Column keys rendered by a component instead of a plain-text cell. */
  cells?: Record<string, Component>;
}

/** Binds a kind's pure config to its components; the screen never branches on the kind key. */
export const INVENTORY_UI: Record<'weapon' | 'armor' | 'artifact' | 'container' | 'device', InventoryUi> = {
  weapon: {
    card: WeaponCard,
    actions: AddOwnedAction,
    settings: WeaponTargetSettings,
    chart: WeaponChartPanel,
    cells: { rank: RankCell, location: LocationCell },
  },
  armor: {
    card: ArmorCard,
    actions: AddOwnedAction,
    cells: { rank: RankCell, location: LocationCell },
  },
  artifact: {
    card: ArtifactCard,
    actions: AddOwnedAction,
    cells: { rank: RankCell, location: LocationCell },
  },
  container: {
    card: ContainerCard,
    actions: ContainerActions,
    cells: { rank: RankCell, location: LocationCell },
  },
  device: {
    card: DeviceCard,
    cells: { rank: RankCell },
  },
};
