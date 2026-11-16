<script setup lang="ts">
const props = defineProps<{ active: 'weapons' | 'armor' }>();

const { t } = useI18n();
const { payload } = useDossier();
const { fmtMoney, num } = useFormat();

const character = computed(() => payload.value?.character ?? {});

const stats = computed(() => [
  { label: t('overview.stats.hours'), value: character.value.hours == null ? '—' : num(character.value.hours) },
  { label: t('overview.stats.money'), value: character.value.money == null ? '—' : fmtMoney(character.value.money) },
]);

const sections = computed(() => [
  { id: 'weapons', label: t('nav.weapons'), icon: 'i-lucide-crosshair', to: '/weapons', count: payload.value?.weapons.length ?? 0 },
  { id: 'armor', label: t('nav.armor'), icon: 'i-lucide-shield', to: '/armor', count: payload.value?.armor.length ?? 0 },
  { id: 'containers', label: t('nav.containers'), icon: 'i-lucide-backpack', to: '/containers', count: payload.value?.containers.length ?? 0 },
  { id: 'artifacts', label: t('nav.artifacts'), icon: 'i-lucide-gem', to: '/artifacts', count: payload.value?.artifacts.length ?? 0 },
  { id: 'builds', label: t('nav.builds'), icon: 'i-lucide-layers', to: '/builds', count: payload.value?.builds.items.length ?? 0 },
]);
</script>

<template>
  <div class="space-y-4">
    <DossierPane :title="t('overview.character')" dense>
      <div class="space-y-1">
        <p class="font-display text-[15px] uppercase tracking-[0.06em]">{{ character.nick ?? 'STALZONE' }}</p>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">
          {{ character.faction ?? t('overview.factionMissing') }}
          <span v-if="character.clan"> · {{ character.clan }}</span>
        </p>
        <p v-if="character.playstyle" class="text-[11px] text-[var(--sz-text-muted)]">
          {{ t('overview.playstyle', { value: character.playstyle }) }}
        </p>
      </div>
      <div class="mt-2 divide-y divide-[var(--sz-border)] border-t border-[var(--sz-border)]">
        <StatRow v-for="stat in stats" :key="stat.label" :label="stat.label" :value="stat.value" />
      </div>
    </DossierPane>

    <DossierPane :title="t('overview.sections')" dense>
      <nav class="-m-2">
        <NuxtLink
          v-for="section in sections"
          :key="section.id"
          :to="section.to"
          class="relative flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-[0.12em]"
          :class="
            section.id === props.active
              ? 'bg-[color-mix(in_srgb,var(--sz-accent)_7%,transparent)] text-[var(--sz-text)]'
              : 'text-[var(--sz-text-muted)] hover:bg-[var(--sz-surface-alt)] active:bg-[var(--sz-surface-alt)] hover:text-[var(--sz-text)]'
          "
          :aria-current="section.id === props.active ? 'page' : undefined"
        >
          <span
            v-if="section.id === props.active"
            class="absolute inset-y-0 left-0 w-0.5 bg-[var(--sz-accent)]"
          />
          <UIcon :name="section.icon" class="size-3.5" />
          <span class="flex-1">{{ section.label }}</span>
          <span class="tabular-nums">{{ section.count }}</span>
        </NuxtLink>
      </nav>
    </DossierPane>
  </div>
</template>
