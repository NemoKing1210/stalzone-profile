<script setup lang="ts">
const { t } = useI18n();
useHead(() => ({ title: `${t('overview.pageTitle')} — ${t('common.appName')}` }));

const { payload, meta } = useDossier();
const { fmtMoney, dec, num, formatDate, formatAge } = useFormat();

const character = computed(() => payload.value?.character ?? {});
const hasCharacter = computed(() => Object.keys(character.value).length > 0);
const metaInfo = computed(() => payload.value?.meta ?? {});
const catalogMeta = computed(() => meta.value?.catalogMeta ?? {});
const editOpen = ref(false);

const catalogUpdated = computed(() =>
  typeof catalogMeta.value.updated === 'string' ? catalogMeta.value.updated : null,
);
const catalogSource = computed(() =>
  typeof catalogMeta.value.source === 'string' ? catalogMeta.value.source : null,
);

const counts = computed(() => [
  { label: t('nav.weapons'), value: payload.value?.weapons.length ?? 0, icon: 'i-lucide-crosshair', to: '/weapons' },
  { label: t('nav.armor'), value: payload.value?.armor.length ?? 0, icon: 'i-lucide-shield', to: '/armor' },
  {
    label: t('nav.containers'),
    value: payload.value?.containers.length ?? 0,
    icon: 'i-lucide-backpack',
    to: '/containers',
  },
  { label: t('nav.artifacts'), value: payload.value?.artifacts.length ?? 0, icon: 'i-lucide-gem', to: '/artifacts' },
  { label: t('nav.builds'), value: payload.value?.builds.items.length ?? 0, icon: 'i-lucide-layers', to: '/builds' },
]);

const stats = computed(() => [
  { label: t('overview.stats.hours'), value: character.value.hours == null ? '—' : num(character.value.hours) },
  { label: t('overview.stats.kd'), value: dec(character.value.kd) },
  {
    label: t('overview.stats.accuracy'),
    value: character.value.accuracy == null ? '—' : `${character.value.accuracy}%`,
  },
  {
    label: t('overview.stats.headshot'),
    value: character.value.headshot == null ? '—' : `${character.value.headshot}%`,
  },
  {
    label: t('overview.stats.achievements'),
    value:
      character.value.achievements == null
        ? '—'
        : `${num(character.value.achievements)} · ${t('overview.points', {
            count: num(character.value.achievementPoints ?? 0),
          })}`,
  },
  { label: t('overview.stats.money'), value: character.value.money == null ? '—' : fmtMoney(character.value.money) },
  {
    label: t('overview.stats.maxMoney'),
    value: character.value.maxMoney == null ? '—' : fmtMoney(character.value.maxMoney),
  },
  { label: t('overview.stats.inZoneSince'), value: formatDate(character.value.arrived) },
]);

const dataState = computed(() => [
  { label: t('settings.dossierUpdated'), value: formatDate(payload.value?.freshness.dataUpdated) },
  { label: t('settings.prices'), value: formatAge(payload.value?.freshness.pricesAgeMin) },
  { label: t('settings.catalogUpdated'), value: formatDate(catalogUpdated.value) },
  { label: t('settings.catalogSource'), value: catalogSource.value },
]);

const career = computed(() => {
  const list = payload.value?.career ?? [];
  return list
    .filter((entry): entry is [string, number] => Array.isArray(entry) && entry.length >= 2)
    .map(([label, value]) => ({ label, value }));
});
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="sz-caps text-[11px] text-[var(--sz-text-dim)]">{{ t('overview.kicker') }}</p>
        <h1>{{ character.nick ?? 'STALZONE' }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">
          {{ character.faction ?? t('overview.factionMissing') }}
          <span v-if="character.clan"> · {{ character.clan }}</span>
          <span v-if="character.realm"> · {{ character.realm }}</span>
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="inline-flex items-center gap-1.5 border border-[var(--sz-border)] px-1.5 py-1 text-[11px] uppercase tracking-[0.12em] text-[var(--sz-text-muted)]"
        >
          <UIcon name="i-lucide-shield-check" class="size-3.5" />
          {{ t('overview.ownerOnly') }}
        </span>
      </div>
    </div>

    <template v-if="hasCharacter">
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <DossierPane class="order-1 min-w-0" :title="t('overview.character')" dense>
          <div class="flex gap-3">
            <div
              class="flex h-[112px] w-[86px] shrink-0 items-center justify-center border border-[var(--sz-border)] bg-[var(--sz-surface-alt)]"
              aria-hidden="true"
            >
              <UIcon name="i-lucide-user-round" class="size-9 text-[var(--sz-text-dim)]" />
            </div>
            <div class="min-w-0 flex-1 space-y-1">
              <p class="font-display text-[15px] uppercase tracking-[0.06em]">{{ character.nick ?? 'STALZONE' }}</p>
              <p class="text-[12.5px] text-[var(--sz-text-muted)]">
                {{ character.faction ?? t('overview.factionMissing') }}
                <span v-if="character.clan"> · {{ character.clan }}</span>
              </p>
              <p v-if="character.playstyle" class="text-[11px] text-[var(--sz-text-muted)]">
                {{ t('overview.playstyle', { value: character.playstyle }) }}
              </p>
              <UButton
                v-if="hasCharacter"
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="xs"
                :label="t('overview.editProfile')"
                @click="editOpen = true"
              />
            </div>
          </div>

          <div class="mt-3 divide-y divide-[var(--sz-border)] border-t border-[var(--sz-border)]">
            <StatRow v-for="stat in stats" :key="stat.label" :label="stat.label" :value="stat.value" />
          </div>

          <p v-if="character.stash" class="mt-2 text-[12.5px] text-[var(--sz-text-muted)]">
            {{ t('overview.stash', { value: character.stash }) }}
          </p>
        </DossierPane>

        <div class="order-2 min-w-0 space-y-4 lg:order-3">
          <DossierPane :title="t('overview.sections')" dense>
            <NuxtLink
              v-for="card in counts"
              :key="card.to"
              :to="card.to"
              class="flex items-center gap-2 border-b border-[var(--sz-border)] px-1 py-2 text-[12.5px] last:border-b-0 hover:bg-[var(--sz-surface-alt)]"
            >
              <UIcon :name="card.icon" class="size-4 text-[var(--sz-text-dim)]" />
              <span class="flex-1">{{ card.label }}</span>
              <span class="tabular-nums text-[var(--sz-text-muted)]">{{ card.value }}</span>
              <UIcon name="i-lucide-chevron-right" class="size-3.5 text-[var(--sz-text-dim)]" />
            </NuxtLink>
          </DossierPane>

          <DossierPane :title="t('overview.dataState')" dense>
            <div class="divide-y divide-[var(--sz-border)]">
              <StatRow v-for="entry in dataState" :key="entry.label" :label="entry.label" :value="entry.value" />
            </div>
            <p class="mt-2 text-[11px] leading-relaxed text-[var(--sz-text-dim)]">
              {{ t('overview.aboutSnapshot', { date: formatDate(payload?.freshness.dataUpdated) }) }}
              <span v-if="metaInfo.source"> {{ t('overview.aboutSources', { sources: metaInfo.source }) }}</span>
              {{ t('overview.aboutNote') }}
            </p>
          </DossierPane>
        </div>

        <DossierPane class="order-3 min-w-0 lg:order-2" :title="t('overview.career')" dense>
          <div v-if="career.length" class="divide-y divide-[var(--sz-border)]">
            <div
              v-for="entry in career"
              :key="entry.label"
              class="flex justify-between gap-3 py-1.5 text-[12.5px]"
            >
              <span class="min-w-0 break-words text-[var(--sz-text-muted)]">{{ entry.label }}</span>
              <span class="shrink-0 tabular-nums">{{ num(entry.value) }}</span>
            </div>
          </div>
          <p v-else class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('overview.careerEmpty') }}</p>
        </DossierPane>
      </div>
    </template>

    <UEmpty
      v-else
      icon="i-lucide-folder-open"
      :title="t('overview.emptyTitle')"
      :description="t('overview.emptyDescription')"
    />

    <EditCharacterModal v-model:open="editOpen" :character="character" />
  </section>
</template>
