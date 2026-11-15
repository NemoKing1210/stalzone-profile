<script setup lang="ts">
const props = defineProps<{
  name: string;
  kind: 'weapon' | 'armor' | 'artifact' | 'container';
  data?: unknown;
  card?: unknown;
  level?: number | null;
}>();

const { t } = useI18n();
const { formatDate } = useFormat();

const data = computed(() => (props.data ?? null) as Record<string, unknown> | null);
const card = computed(() => (props.card ?? null) as Record<string, unknown> | null);

const KIND_KEYS: Record<string, string> = {
  weapon: 'items.kind.weapon',
  armor: 'items.kind.armor',
  artifact: 'items.kind.artifact',
  container: 'items.kind.container',
};

const CARD_LABEL_KEYS: Record<string, string> = {
  type: 'items.fields.type',
  slot: 'items.fields.slot',
  caliber: 'items.fields.caliber',
  rank: 'items.fields.rank',
  weight: 'items.fields.weight',
  mag: 'items.fields.mag',
  rof: 'items.fields.rof',
  dps15: 'items.fields.dps15',
  ttk15: 'items.fields.ttk15',
  damage15: 'items.fields.damage15',
  reload: 'items.fields.reload',
  reloadTac: 'items.fields.reloadTac',
  spread: 'items.fields.spread',
  hipSpread: 'items.fields.hipSpread',
  recoil: 'items.fields.recoil',
  ergonomics: 'items.fields.ergonomics',
  draw: 'items.fields.draw',
  aim: 'items.fields.aim',
  platePen: 'items.fields.platePen',
  pierce: 'items.fields.pierce',
  bleeding: 'items.fields.bleeding',
  stopping: 'items.fields.stopping',
  cls: 'items.fields.cls',
  prot: 'items.fields.prot',
  dur: 'items.fields.dur',
  mods: 'items.fields.mods',
  mods3: 'items.fields.mods3',
  curve: 'items.fields.curve',
  p0: 'items.fields.p0',
  p15: 'items.fields.p15',
  hasCurve: 'items.fields.hasCurve',
  pCur: 'items.fields.pCur',
  curLvl: 'items.fields.curLvl',
  effects: 'items.fields.effects',
  stats: 'items.fields.stats',
  slots: 'items.fields.slots',
  slotEq: 'items.fields.slotEq',
  eff: 'items.fields.eff',
  shield: 'items.fields.shield',
  bonus: 'items.fields.bonus',
  artifacts: 'items.fields.artifacts',
  asOf: 'items.fields.asOf',
};

const entries = computed(() =>
  Object.entries(card.value ?? {}).filter(
    ([key, value]) => value != null && !['kind', 'name', 'icon', 'artifacts', 'asOf'].includes(key),
  ),
);

const image = computed(() => {
  const icon = data.value?.icon ?? card.value?.icon;
  return typeof icon === 'string' ? icon : null;
});

const rank = computed(() => {
  const value = data.value?.rank ?? card.value?.rank;
  return typeof value === 'string' ? value : null;
});

const quality = computed(() => {
  const value = data.value?.q;
  return typeof value === 'string' ? value : null;
});

const weaponDmg = computed(() => data.value?.dmg ?? data.value?.dmg15 ?? null);
const weaponDps = computed(() => data.value?.dps ?? data.value?.dps15 ?? null);
const weaponTtk = computed(() => data.value?.ttk ?? data.value?.ttk15 ?? null);

const armorValue = computed(() => data.value?.armor ?? data.value?.armor15 ?? null);

const cardBullet15 = computed(() => {
  const prot = card.value?.prot;
  if (!prot || typeof prot !== 'object') return null;
  const value = (prot as Record<string, unknown>).bullet15;
  return typeof value === 'number' ? value : null;
});

const containerArtifacts = computed(() => {
  const fill = data.value?.artifacts ?? card.value?.artifacts;
  return Array.isArray(fill) ? (fill as { name: string; lvl: number }[]) : [];
});

const containerAsOf = computed(() => {
  const value = data.value?.artifactsAsOf ?? card.value?.asOf;
  return typeof value === 'string' ? value : null;
});

const effectsText = computed(() => {
  const value = data.value?.effects ?? card.value?.effects;
  return typeof value === 'string' && value ? value : null;
});

function label(key: string): string {
  const map = CARD_LABEL_KEYS[key];
  return map ? t(map) : key;
}

function display(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no');
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        typeof entry === 'object' && entry
          ? Object.entries(entry)
              .map(([key, val]) => `${key}: ${String(val)}`)
              .join(', ')
          : String(entry),
      )
      .join(' · ');
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${key}: ${String(val)}`)
      .join(', ');
  }
  return String(value);
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-start gap-4">
      <img
        v-if="image"
        :src="image"
        :alt="props.name"
        class="size-16 rounded-lg bg-elevated object-contain p-1"
        loading="lazy"
      >
      <div v-else class="flex size-16 items-center justify-center rounded-lg bg-elevated">
        <UIcon name="i-lucide-package" class="size-7 text-muted" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-lg font-semibold">{{ props.name }}</p>
        <p class="text-sm text-muted">
          {{ t(KIND_KEYS[props.kind] ?? 'items.kind.container') }}
          <span v-if="props.level != null">{{ t('items.level', { level: props.level }) }}</span>
        </p>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <RankBadge v-if="rank" :rank="rank" />
          <UBadge v-if="quality" color="neutral" variant="subtle">{{ quality }}</UBadge>
        </div>
      </div>
    </div>

    <dl v-if="props.kind === 'weapon' && data" class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      <div class="rounded-md bg-elevated/60 p-2">
        <dt class="text-xs text-muted">{{ t('items.damage') }}{{ data.dmg == null && data.dmg15 != null ? ' +15' : '' }}</dt>
        <dd class="font-medium tabular-nums">{{ weaponDmg ?? '—' }}</dd>
      </div>
      <div class="rounded-md bg-elevated/60 p-2">
        <dt class="text-xs text-muted">{{ t('items.dps') }}{{ data.dps == null && data.dps15 != null ? ' +15' : '' }}</dt>
        <dd class="font-medium tabular-nums">{{ weaponDps ?? '—' }}</dd>
      </div>
      <div class="rounded-md bg-elevated/60 p-2">
        <dt class="text-xs text-muted">{{ t('items.ttk') }}{{ data.ttk == null && data.ttk15 != null ? ' +15' : '' }}</dt>
        <dd class="font-medium tabular-nums">{{ weaponTtk ?? '—' }}</dd>
      </div>
      <div class="rounded-md bg-elevated/60 p-2">
        <dt class="text-xs text-muted">{{ t('items.magazine') }}</dt>
        <dd class="font-medium tabular-nums">{{ data.mag ?? '—' }}</dd>
      </div>
    </dl>

    <dl v-else-if="props.kind === 'armor' && data" class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
      <div class="rounded-md bg-elevated/60 p-2">
        <dt class="text-xs text-muted">{{ t('items.bulletProtection') }}</dt>
        <dd class="font-medium tabular-nums">{{ armorValue ?? '—' }}</dd>
      </div>
      <div class="rounded-md bg-elevated/60 p-2">
        <dt class="text-xs text-muted">{{ t('items.plus15') }}</dt>
        <dd class="font-medium tabular-nums">{{ data.armor15 ?? cardBullet15 ?? '—' }}</dd>
      </div>
      <div class="rounded-md bg-elevated/60 p-2">
        <dt class="text-xs text-muted">{{ t('items.fields.weight') }}</dt>
        <dd class="font-medium tabular-nums">
          {{ t('items.weightValue', { value: data.weight ?? card?.weight ?? '—' }) }}
        </dd>
      </div>
    </dl>

    <p v-if="props.kind === 'artifact' && effectsText" class="rounded-md bg-elevated/60 p-3 text-sm">
      {{ effectsText }}
    </p>

    <div v-if="props.kind === 'container' && (data || card)" class="space-y-2 text-sm">
      <p class="text-muted">
        {{ data?.type ?? card?.type ?? t('items.kind.container') }}
        · {{ t('items.slotsValue', { slots: data?.slots ?? card?.slots ?? '—', eff: data?.eff ?? card?.eff ?? '—' }) }}
        <span v-if="data?.prot ?? card?.prot"> · {{ t('items.protectionValue', { value: data?.prot ?? card?.prot }) }}</span>
        <span v-if="data?.shield ?? card?.shield"> · {{ t('items.shieldValue', { value: data?.shield ?? card?.shield }) }}</span>
      </p>
      <p v-if="data?.bonus ?? card?.bonus" class="text-muted">
        {{ t('items.bonusValue', { value: data?.bonus ?? card?.bonus }) }}
      </p>
      <ul class="flex flex-wrap gap-1">
        <li v-for="(artifact, index) in containerArtifacts" :key="`${artifact.name}-${index}`">
          <UBadge color="neutral" variant="subtle">{{ artifact.name }} · {{ artifact.lvl }}</UBadge>
        </li>
      </ul>
      <p v-if="containerAsOf" class="text-xs text-muted">
        {{ t('items.fillAsOf', { date: formatDate(containerAsOf) }) }}
      </p>
    </div>

    <div v-if="entries.length" class="space-y-1">
      <p class="text-sm font-medium">{{ t('items.cardTitle') }}</p>
      <dl class="divide-y divide-default rounded-md border border-default text-sm">
        <div v-for="[key, value] in entries" :key="key" class="grid grid-cols-3 gap-2 px-3 py-1.5">
          <dt class="text-muted">{{ label(key) }}</dt>
          <dd class="col-span-2 break-words">{{ display(value) }}</dd>
        </div>
      </dl>
    </div>
    <UAlert
      v-else
      color="neutral"
      variant="subtle"
      :title="t('items.notFoundTitle')"
      :description="t('items.notFoundDescription')"
    />

    <details v-if="card" class="text-xs text-muted">
      <summary class="cursor-pointer">{{ t('items.rawData') }}</summary>
      <pre class="mt-2 max-h-64 overflow-auto rounded-md bg-elevated p-2">{{ JSON.stringify(card, null, 2) }}</pre>
    </details>
  </div>
</template>
