<script setup lang="ts">
const { t } = useI18n();
useHead(() => ({ title: `${t('overview.pageTitle')} — ${t('common.appName')}` }));

const { payload } = useDossier();
const { fmtMoney, dec, num, formatDate } = useFormat();

const character = computed(() => payload.value?.character ?? {});
const hasCharacter = computed(() => Object.keys(character.value).length > 0);
const metaInfo = computed(() => payload.value?.meta ?? {});
const editOpen = ref(false);

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

const career = computed(() => {
  const list = payload.value?.career ?? [];
  return list
    .filter((entry): entry is [string, number] => Array.isArray(entry) && entry.length >= 2)
    .map(([label, value]) => ({ label, value }));
});
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-sm text-muted">{{ t('overview.kicker') }}</p>
        <h1 class="text-3xl font-semibold">{{ character.nick ?? 'STALZONE' }}</h1>
        <p class="text-sm text-muted">
          {{ character.faction ?? t('overview.factionMissing') }}
          <span v-if="character.clan"> · {{ character.clan }}</span>
          <span v-if="character.realm"> · {{ character.realm }}</span>
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          v-if="hasCharacter"
          icon="i-lucide-pencil"
          color="neutral"
          variant="outline"
          :label="t('overview.editProfile')"
          @click="editOpen = true"
        />
        <UBadge color="neutral" variant="subtle" icon="i-lucide-shield-check">{{ t('overview.ownerOnly') }}</UBadge>
      </div>
    </div>

    <template v-if="hasCharacter">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <NuxtLink v-for="card in counts" :key="card.to" :to="card.to" class="block">
          <UCard class="h-full transition hover:border-primary/40">
            <div class="flex items-center justify-between">
              <UIcon :name="card.icon" class="size-5 text-primary" />
              <span class="text-2xl font-semibold tabular-nums">{{ card.value }}</span>
            </div>
            <p class="mt-2 text-sm text-muted">{{ card.label }}</p>
          </UCard>
        </NuxtLink>
      </div>

      <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-user-round" class="size-5 text-primary" />
              <h2 class="font-medium">{{ t('overview.character') }}</h2>
            </div>
          </template>
          <dl class="grid gap-3 sm:grid-cols-2">
            <div v-for="stat in stats" :key="stat.label" class="rounded-md bg-elevated/60 p-3">
              <dt class="text-xs text-muted">{{ stat.label }}</dt>
              <dd class="font-medium tabular-nums">{{ stat.value }}</dd>
            </div>
          </dl>
          <p v-if="character.stash || character.playstyle" class="mt-3 text-sm text-muted">
            <span v-if="character.stash">{{ t('overview.stash', { value: character.stash }) }}</span>
            <span v-if="character.playstyle"> {{ t('overview.playstyle', { value: character.playstyle }) }}</span>
          </p>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-chart-no-axes-column" class="size-5 text-primary" />
              <h2 class="font-medium">{{ t('overview.career') }}</h2>
            </div>
          </template>
          <dl v-if="career.length" class="grid grid-cols-1 gap-x-4 gap-y-1 text-sm">
            <div v-for="entry in career" :key="entry.label" class="flex justify-between gap-3 border-b border-default py-1">
              <dt class="text-muted">{{ entry.label }}</dt>
              <dd class="tabular-nums">{{ num(entry.value) }}</dd>
            </div>
          </dl>
          <p v-else class="text-sm text-muted">{{ t('overview.careerEmpty') }}</p>
        </UCard>
      </div>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-info" class="size-5 text-primary" />
            <h2 class="font-medium">{{ t('overview.about') }}</h2>
          </div>
        </template>
        <p class="text-sm text-muted">
          {{ t('overview.aboutSnapshot', { date: formatDate(payload?.freshness.dataUpdated) }) }}
          <span v-if="metaInfo.source"> {{ t('overview.aboutSources', { sources: metaInfo.source }) }}</span>
          {{ t('overview.aboutNote') }}
        </p>
      </UCard>
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
