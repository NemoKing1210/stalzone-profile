<script setup lang="ts">
import { CharacterPatchSchema } from '@dossier/shared/schemas';
import type { DossierCharacter } from '~/composables/useDossier';
import type { WriteResult } from '~/composables/useWrite';
import { STAT_FIELDS, toCharacterStatsPatch, type StatField } from '~/utils/characterStatsForm';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ character: DossierCharacter }>();
const emit = defineEmits<{ saved: [] }>();

const { write, busy } = useWrite();
const { t } = useI18n();
const { dec, num } = useFormat();

/**
 * Current STALZONE factions (ex-STALCRAFT: X). The 10.07.2024 patch renamed
 * Долг → Рубеж, Свобода → Заря, Монолит → Шёпот; Сталкеры and Бандиты are the base
 * factions. Anything else (legacy or event factions) can still be typed and saved.
 */
const FACTIONS = ['Сталкеры', 'Бандиты', 'Заря', 'Рубеж', 'Завет', 'Наёмники', 'Шёпот'];
const REGIONS = ['ru', 'eu', 'na', 'sea', 'global'];

function emptyStats(): Record<StatField, string | number | null> {
  return Object.fromEntries(STAT_FIELDS.map((field) => [field, null])) as Record<StatField, string | number | null>;
}

const form = reactive({
  nick: '',
  region: 'ru',
  /** `undefined` is what USelectMenu produces when its value is cleared. */
  faction: undefined as string | undefined,
  alliance: null as string | null | undefined,
  clanName: null as string | null | undefined,
  clanRank: null as string | null | undefined,
  money: null as number | null,
  maxMoney: null as number | null,
  stash: null as string | null | undefined,
  playstyle: null as string | null | undefined,
  stats: emptyStats(),
  dryRun: false,
});

const lastResult = ref<WriteResult | null>(null);

/** Keep the current value selectable even when it is not in the curated list. */
const factionItems = computed(() => {
  const current = form.faction?.trim();
  return current && !FACTIONS.includes(current) ? [current, ...FACTIONS] : FACTIONS;
});

const regionItems = computed(() => REGIONS.map((region) => ({ label: t(`forms.regions.${region}`), value: region })));

const derived = computed(() => [
  { label: t('overview.stats.kd'), value: dec(props.character.kd) },
  { label: t('overview.stats.accuracy'), value: props.character.accuracy == null ? '—' : `${props.character.accuracy}%` },
  { label: t('overview.stats.headshot'), value: props.character.headshot == null ? '—' : `${props.character.headshot}%` },
  { label: t('overview.stats.hours'), value: props.character.hours == null ? '—' : num(props.character.hours) },
]);

watch(open, (value) => {
  if (value) reset();
});
watch(
  () => props.character,
  () => {
    if (open.value) reset();
  },
);

function reset(): void {
  const character = props.character;
  form.nick = character.nick ?? '';
  form.region = character.region ?? 'ru';
  form.faction = character.faction ?? undefined;
  form.alliance = character.alliance ?? null;
  form.clanName = character.clanName ?? null;
  form.clanRank = character.clanRank ?? null;
  form.money = character.money ?? null;
  form.maxMoney = character.maxMoney ?? null;
  form.stash = character.stash ?? null;
  form.playstyle = character.playstyle ?? null;
  form.stats = emptyStats();
  for (const field of STAT_FIELDS) form.stats[field] = character.stats?.[field] ?? null;
  form.dryRun = false;
  lastResult.value = null;
}

async function submit(): Promise<void> {
  const result = await write<WriteResult>('/api/v1/character', {
    method: 'PATCH',
    body: {
      ...(form.nick ? { nick: form.nick } : {}),
      region: form.region,
      faction: form.faction ?? null,
      alliance: form.alliance ?? null,
      clanName: form.clanName ?? null,
      clanRank: form.clanRank ?? null,
      money: form.money,
      maxMoney: form.maxMoney,
      stash: form.stash ?? null,
      playstyle: form.playstyle ?? null,
      stats: toCharacterStatsPatch(form.stats),
      dryRun: form.dryRun,
    },
  });
  if (!result) return;

  lastResult.value = result;
  if (!result.dryRun) {
    open.value = false;
    emit('saved');
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('forms.characterTitle')"
    :description="t('forms.characterDescription')"
    scrollable
  >
    <template #body>
      <UForm id="character-form" :schema="CharacterPatchSchema" :state="form" class="space-y-4" @submit="submit">
        <div class="space-y-3">
          <p class="sz-caps text-[var(--sz-text-muted)]">{{ t('forms.sectionProfile') }}</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField :label="t('forms.nick')" name="nick">
              <UInput v-model="form.nick" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.region')" name="region">
              <USelect v-model="form.region" :items="regionItems" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.faction')" name="faction">
              <USelectMenu
                v-model="form.faction"
                :items="factionItems"
                searchable
                clearable
                create-item
                :placeholder="t('forms.chooseFaction')"
                class="w-full"
              >
                <template #create-item-label="{ item }">
                  {{ t('forms.createFaction', { value: item }) }}
                </template>
              </USelectMenu>
            </UFormField>
            <UFormField :label="t('forms.alliance')" name="alliance">
              <UInput v-model.nullable="form.alliance" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.clanName')" name="clanName">
              <UInput v-model.nullable="form.clanName" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.clanRank')" name="clanRank">
              <UInput v-model.nullable="form.clanRank" class="w-full" />
            </UFormField>
          </div>
        </div>

        <div class="space-y-3 border-t border-[var(--sz-border)] pt-3">
          <p class="sz-caps text-[var(--sz-text-muted)]">{{ t('forms.stats') }}</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField v-for="field in STAT_FIELDS" :key="field" :label="t(`forms.stat.${field}`)" :name="`stats.${field}`">
              <UInput v-model="form.stats[field]" class="w-full" />
            </UFormField>
          </div>
        </div>

        <div class="space-y-3 border-t border-[var(--sz-border)] pt-3">
          <p class="sz-caps text-[var(--sz-text-muted)]">{{ t('forms.derived') }}</p>
          <div class="grid grid-cols-2 gap-px bg-[var(--sz-border)]">
            <div v-for="entry in derived" :key="entry.label" class="bg-[var(--sz-surface)] px-2 py-1.5">
              <p class="sz-caps leading-tight text-[var(--sz-text-muted)]">{{ entry.label }}</p>
              <p class="mt-1 font-display text-[17px] leading-none tabular-nums">{{ entry.value }}</p>
            </div>
          </div>
        </div>

        <div class="space-y-3 border-t border-[var(--sz-border)] pt-3">
          <p class="sz-caps text-[var(--sz-text-muted)]">{{ t('forms.sectionMoney') }}</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField :label="t('forms.money')" name="money">
              <UInputNumber v-model="form.money" :min="0" :step="1000" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.maxMoney')" name="maxMoney">
              <UInputNumber v-model="form.maxMoney" :min="0" :step="1000" class="w-full" />
            </UFormField>
          </div>
        </div>

        <div class="space-y-3 border-t border-[var(--sz-border)] pt-3">
          <p class="sz-caps text-[var(--sz-text-muted)]">{{ t('forms.sectionNotes') }}</p>
          <UFormField :label="t('forms.stash')" name="stash">
            <UInput v-model.nullable="form.stash" class="w-full" />
          </UFormField>
          <UFormField :label="t('forms.playstyle')" name="playstyle">
            <UTextarea v-model.nullable="form.playstyle" :rows="2" class="w-full" />
          </UFormField>
        </div>

        <UFormField name="dryRun">
          <USwitch v-model="form.dryRun" :label="t('common.dryRun')" />
        </UFormField>

        <UAlert
          v-if="lastResult"
          :color="lastResult.dryRun ? 'info' : 'success'"
          variant="subtle"
          icon="i-lucide-list-checks"
          :title="lastResult.dryRun ? t('common.dryRunTitle') : t('common.changeWritten')"
          :description="lastResult.diff.human"
        />
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <UButton type="button" color="neutral" variant="ghost" :label="t('common.reset')" @click="reset" />
        <UButton type="button" color="neutral" variant="ghost" :label="t('common.cancel')" @click="open = false" />
        <UButton type="submit" form="character-form" :loading="busy" :label="form.dryRun ? t('common.check') : t('common.save')" />
      </div>
    </template>
  </UModal>
</template>
