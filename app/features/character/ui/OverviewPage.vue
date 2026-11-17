<script setup lang="ts">
import { ProfilePane, StatRow } from '~/shared/ui';
import { clampPercent } from '~/shared/lib/clampPercent';
import { factionLabel } from '~/shared/lib/factions';

import EditCharacterModal from './EditCharacterModal.vue';

const { t } = useI18n();
useHead(() => ({ title: `${t('overview.pageTitle')} // ${t('common.appName')}` }));

const { payload, meta } = useProfile();
const { fmtMoney, dec, num, formatDate, formatAge } = useFormat();

const character = computed(() => payload.value?.character ?? {});
const factionName = computed(() => factionLabel(t, character.value.faction));
const hasCharacter = computed(() => Object.keys(character.value).length > 0);
const metaInfo = computed(() => payload.value?.meta ?? {});
const catalogMeta = computed(() => meta.value?.catalogMeta ?? null);
const editOpen = ref(false);

const catalogUpdated = computed(() => catalogMeta.value?.updated ?? null);
const catalogSource = computed(() => catalogMeta.value?.source ?? null);

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
]);

/** Four headline numbers. Percentages get a 0–100 bar; no other value has a real maximum. */
const kpis = computed(() => [
  {
    key: 'hours',
    label: t('overview.stats.hours'),
    value: character.value.hours == null ? '—' : num(character.value.hours),
    missing: character.value.hours == null,
    bar: null as number | null,
  },
  {
    key: 'kd',
    label: t('overview.stats.kd'),
    value: dec(character.value.kd),
    missing: character.value.kd == null,
    bar: null as number | null,
  },
  {
    key: 'accuracy',
    label: t('overview.stats.accuracy'),
    value: character.value.accuracy == null ? '—' : `${character.value.accuracy}%`,
    missing: character.value.accuracy == null,
    bar: character.value.accuracy == null ? null : clampPercent(character.value.accuracy, 100),
  },
  {
    key: 'headshot',
    label: t('overview.stats.headshot'),
    value: character.value.headshot == null ? '—' : `${character.value.headshot}%`,
    missing: character.value.headshot == null,
    bar: character.value.headshot == null ? null : clampPercent(character.value.headshot, 100),
  },
]);

const detailStats = computed(() => [
  {
    label: t('overview.stats.achievements'),
    value:
      character.value.achievements == null
        ? null
        : character.value.achievementPoints == null
          ? `${num(character.value.achievements)}`
          : `${num(character.value.achievements)} · ${t('overview.points', {
              count: num(character.value.achievementPoints),
            })}`,
    tone: 'neutral' as const,
  },
  {
    label: t('overview.stats.money'),
    value: character.value.money == null ? null : fmtMoney(character.value.money),
    tone: 'money' as const,
  },
  {
    label: t('overview.stats.maxMoney'),
    value: character.value.maxMoney == null ? null : fmtMoney(character.value.maxMoney),
    tone: 'money' as const,
  },
  {
    label: t('overview.stats.inZoneSince'),
    value: formatDate(character.value.arrived),
    tone: 'neutral' as const,
  },
]);

/** Same thresholds as FreshnessBadge; the age column carries the colour, the label stays put. */
const pricesTone = computed(() => {
  const age = payload.value?.freshness.pricesAgeMin;
  if (age == null) return 'neutral' as const;
  if (age < 180) return 'success' as const;
  if (age < 60 * 24) return 'warning' as const;
  return 'danger' as const;
});

const dataState = computed(() => [
  {
    label: t('settings.profileUpdated'),
    value: formatDate(payload.value?.freshness.dataUpdated),
    tone: 'neutral' as const,
  },
  { label: t('settings.prices'), value: formatAge(payload.value?.freshness.pricesAgeMin), tone: pricesTone.value },
  { label: t('settings.catalogUpdated'), value: formatDate(catalogUpdated.value), tone: 'neutral' as const },
  { label: t('settings.catalogSource'), value: catalogSource.value, tone: 'neutral' as const },
]);
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{{ character.nick ?? 'STALZONE' }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">
          {{ factionName ?? t('overview.factionMissing') }}
          <span v-if="character.clanName"> · {{ character.clanName }}</span>
          <span v-if="character.clanRank"> · {{ character.clanRank }}</span>
          <span v-if="character.region"> · {{ character.region }}</span>
        </p>
      </div>
    </div>

    <template v-if="hasCharacter">
      <div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ProfilePane class="order-1 min-w-0" :title="t('overview.character')" dense>
          <div class="min-w-0 space-y-1.5">
            <p class="font-display text-[15px] uppercase tracking-[0.06em]">{{ character.nick ?? 'STALZONE' }}</p>
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="xs"
              :label="t('overview.editProfile')"
              @click="editOpen = true"
            />
          </div>

          <p class="sz-caps mt-3 border-t border-[var(--sz-border)] pt-2 text-[var(--sz-text-muted)]">
            {{ t('overview.keyStats') }}
          </p>
          <div class="mt-1.5 grid grid-cols-2 gap-px bg-[var(--sz-border)]">
            <div v-for="kpi in kpis" :key="kpi.key" data-testid="kpi" class="min-w-0 bg-[var(--sz-surface)] px-2 py-1.5">
              <p class="sz-caps leading-tight text-[var(--sz-text-muted)]">{{ kpi.label }}</p>
              <p
                class="mt-1 font-display text-[21px] leading-none tabular-nums"
                :class="kpi.missing ? 'text-[var(--sz-text-dim)]' : 'text-[var(--sz-text)]'"
              >
                {{ kpi.value }}
              </p>
              <div v-if="kpi.bar != null" class="mt-1.5 h-[2px] w-full bg-ink-950" aria-hidden="true">
                <div class="h-full bg-[var(--sz-accent)]" :style="{ width: `${kpi.bar}%` }" />
              </div>
            </div>
          </div>

          <div class="mt-2 divide-y divide-[var(--sz-border)]">
            <StatRow
              v-for="stat in detailStats"
              :key="stat.label"
              :label="stat.label"
              :value="stat.value"
              :tone="stat.tone"
            />
          </div>
        </ProfilePane>

        <div class="order-2 min-w-0 space-y-4">
          <ProfilePane :title="t('overview.sections')" dense flush>
            <div class="grid grid-cols-2 gap-px bg-[var(--sz-border)]">
              <NuxtLink
                v-for="card in counts"
                :key="card.to"
                :to="card.to"
                :aria-label="t('overview.sectionAria', { label: card.label, count: card.value })"
                class="group relative flex min-h-[88px] flex-col justify-between bg-[var(--sz-surface)] p-2.5 transition-colors hover:bg-[var(--sz-surface-alt)]"
              >
                <div class="flex items-start justify-between gap-2">
                  <UIcon
                    :name="card.icon"
                    class="size-4 text-[var(--sz-text-dim)] transition-colors group-hover:text-[var(--sz-accent)]"
                  />
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="size-3.5 text-[var(--sz-text-dim)] transition-colors group-hover:text-[var(--sz-accent)]"
                  />
                </div>
                <p class="font-display text-[22px] leading-none tabular-nums">{{ card.value }}</p>
                <p class="sz-caps text-[var(--sz-text-muted)]">{{ card.label }}</p>
              </NuxtLink>
            </div>
          </ProfilePane>

          <ProfilePane :title="t('overview.dataState')" dense>
            <div class="divide-y divide-[var(--sz-border)]">
              <StatRow
                v-for="entry in dataState"
                :key="entry.label"
                :label="entry.label"
                :value="entry.value"
                :tone="entry.tone"
              />
            </div>
            <p class="mt-2 text-[11px] leading-relaxed text-[var(--sz-text-dim)]">
              {{ t('overview.aboutSnapshot', { date: formatDate(payload?.freshness.dataUpdated) }) }}
              <span v-if="metaInfo.source"> {{ t('overview.aboutSources', { sources: metaInfo.source }) }}</span>
              {{ t('overview.aboutNote') }}
            </p>
          </ProfilePane>
        </div>
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
