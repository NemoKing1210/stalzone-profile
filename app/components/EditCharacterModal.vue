<script setup lang="ts">
import { CharacterPatchSchema } from '@dossier/shared/schemas';
import type { DossierCharacter } from '~/composables/useDossier';
import type { WriteResult } from '~/composables/useWrite';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ character: DossierCharacter }>();
const emit = defineEmits<{ saved: [] }>();

const { write, busy } = useWrite();
const { t } = useI18n();

/**
 * Current STALZONE factions (ex-STALCRAFT: X). The 10.07.2024 patch renamed
 * Долг → Рубеж, Свобода → Заря, Монолит → Шёпот; Сталкеры and Бандиты are the base
 * factions. Anything else (legacy or event factions) can still be typed and saved.
 */
const FACTIONS = ['Сталкеры', 'Бандиты', 'Заря', 'Рубеж', 'Завет', 'Наёмники', 'Шёпот'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const form = reactive({
  nick: '',
  /** `undefined` is what USelectMenu produces when its value is cleared. */
  faction: undefined as string | undefined,
  alliance: null as string | null | undefined,
  clan: null as string | null | undefined,
  arrived: null as string | null | undefined,
  hours: null as number | null,
  kd: null as number | null,
  accuracy: null as number | null,
  headshot: null as number | null,
  achievements: null as number | null,
  achievementPoints: null as number | null,
  money: null as number | null,
  maxMoney: null as number | null,
  stash: null as string | null | undefined,
  playstyle: null as string | null | undefined,
  dryRun: false,
});

const lastResult = ref<WriteResult | null>(null);

/** Keep the current value selectable even when it is not in the curated list. */
const factionItems = computed(() => {
  const current = form.faction?.trim();
  return current && !FACTIONS.includes(current) ? [current, ...FACTIONS] : FACTIONS;
});

/** The date input only understands ISO; other stored text is shown as a hint and kept until replaced. */
const arrivedIso = computed(() =>
  typeof form.arrived === 'string' && ISO_DATE.test(form.arrived) ? form.arrived : '',
);
const arrivedRaw = computed(() =>
  typeof form.arrived === 'string' && form.arrived.trim() && !ISO_DATE.test(form.arrived) ? form.arrived : null,
);

function setArrived(value: string | number): void {
  const text = String(value ?? '').trim();
  form.arrived = text || null;
}

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
  form.faction = character.faction ?? undefined;
  form.alliance = character.alliance ?? null;
  form.clan = character.clan ?? null;
  form.arrived = character.arrived ?? null;
  form.hours = character.hours ?? null;
  form.kd = character.kd ?? null;
  form.accuracy = character.accuracy ?? null;
  form.headshot = character.headshot ?? null;
  form.achievements = character.achievements ?? null;
  form.achievementPoints = character.achievementPoints ?? null;
  form.money = character.money ?? null;
  form.maxMoney = character.maxMoney ?? null;
  form.stash = character.stash ?? null;
  form.playstyle = character.playstyle ?? null;
  form.dryRun = false;
  lastResult.value = null;
}

async function submit(): Promise<void> {
  const result = await write<WriteResult>('/api/v1/character', {
    method: 'PATCH',
    body: {
      ...(form.nick ? { nick: form.nick } : {}),
      faction: form.faction ?? null,
      alliance: form.alliance ?? null,
      clan: form.clan ?? null,
      arrived: form.arrived ?? null,
      hours: form.hours,
      kd: form.kd,
      accuracy: form.accuracy,
      headshot: form.headshot,
      achievements: form.achievements,
      achievementPoints: form.achievementPoints,
      money: form.money,
      maxMoney: form.maxMoney,
      stash: form.stash ?? null,
      playstyle: form.playstyle ?? null,
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
            <UFormField :label="t('forms.clan')" name="clan">
              <UInput v-model.nullable="form.clan" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.arrived')" name="arrived">
              <template #hint>
                <span v-if="arrivedRaw" class="normal-case tracking-normal">
                  {{ t('forms.arrivedStored', { value: arrivedRaw }) }}
                </span>
              </template>
              <UInput :model-value="arrivedIso" type="date" class="w-full" @update:model-value="setArrived" />
            </UFormField>
          </div>
        </div>

        <div class="space-y-3 border-t border-[var(--sz-border)] pt-3">
          <p class="sz-caps text-[var(--sz-text-muted)]">{{ t('forms.sectionProgress') }}</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField :label="t('forms.hours')" name="hours">
              <UInputNumber v-model="form.hours" :min="0" :max="1_000_000" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.achievements')" name="achievements">
              <UInputNumber v-model="form.achievements" :min="0" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.achievementPoints')" name="achievementPoints">
              <UInputNumber v-model="form.achievementPoints" :min="0" class="w-full" />
            </UFormField>
          </div>
        </div>

        <div class="space-y-3 border-t border-[var(--sz-border)] pt-3">
          <p class="sz-caps text-[var(--sz-text-muted)]">{{ t('forms.sectionCombat') }}</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField :label="t('overview.stats.kd')" name="kd">
              <UInputNumber v-model="form.kd" :step="0.01" :min="0" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.accuracyPercent')" name="accuracy">
              <UInputNumber v-model="form.accuracy" :min="0" :max="100" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.headshotPercent')" name="headshot">
              <UInputNumber v-model="form.headshot" :min="0" :max="100" class="w-full" />
            </UFormField>
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
