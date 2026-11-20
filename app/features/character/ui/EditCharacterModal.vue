<script setup lang="ts">
import { factionSelectItems } from '~/shared/lib/factions';
import { MODAL_WIDTH } from '~/shared/lib/modalWidth';
import type { ProfileCharacter } from '~/shared/types/profile';
import type { WriteResult } from '@profile/shared/contracts';
import { isNumericStatField, STAT_FIELDS, type StatField } from '../model/characterStatsForm';
import {
  canSubmitCharacterForm,
  characterFormChanged,
  characterFormFrom,
  characterFormIssues,
  characterFormMessage,
  clampCounter,
  COUNTER_MAX,
  TEXT_MAX,
  toCharacterPatch,
  type CharacterFormField,
  type CharacterFormState,
} from '../model/characterPatchForm';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ character: ProfileCharacter }>();
const emit = defineEmits<{ saved: [] }>();

const { write, busy } = useWrite();
const { t } = useI18n();
const { dec, num } = useFormat();

const REGIONS = ['ru', 'eu', 'na', 'sea', 'global'] as const;

const form = reactive<CharacterFormState>(characterFormFrom(props.character));
const baseline = ref<CharacterFormState>(characterFormFrom(props.character));
const lastResult = ref<WriteResult | null>(null);

const factionItems = computed(() => factionSelectItems(t));
const selectedFaction = computed(() => factionItems.value.find((item) => item.value === form.faction) ?? null);
const regionItems = computed(() =>
  REGIONS.map((region) => ({ label: t(`forms.regions.${region}`), value: region })),
);

const issues = computed(() => characterFormIssues(form, baseline.value));
const changed = computed(() => characterFormChanged(form, baseline.value));
const submitEnabled = computed(() => canSubmitCharacterForm(form, baseline.value));

/** Message key for the field, or `undefined` when the field is fine. */
function errorFor(field: CharacterFormField): string | undefined {
  const issue = issues.value.find((entry) => entry.field === field);
  if (!issue) return undefined;
  const message = characterFormMessage(issue);
  return t(message.key, message.params ?? {});
}

function statText(field: StatField): string {
  const value = form.stats[field];
  return value == null ? '' : String(value);
}

function setStatNumber(field: StatField, value: number | null | undefined): void {
  form.stats[field] = clampCounter(value);
}

function setStatText(field: StatField, value: string | number): void {
  form.stats[field] = String(value);
}

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
  const next = characterFormFrom(props.character);
  Object.assign(form, next);
  baseline.value = characterFormFrom(props.character);
  lastResult.value = null;
}

async function submit(): Promise<void> {
  if (!submitEnabled.value) return;
  const result = await write<WriteResult>('/api/v1/character', {
    method: 'PATCH',
    body: { ...toCharacterPatch(form), dryRun: form.dryRun },
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
    :ui="{ content: MODAL_WIDTH.form }"
    scrollable
  >
    <template #body>
      <UForm id="character-form" :state="form" class="space-y-4" @submit.prevent="submit">
        <div class="space-y-3">
          <p class="sz-caps text-[var(--sz-text-muted)]">{{ t('forms.sectionProfile') }}</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField :label="t('forms.nick')" name="nick" required :error="errorFor('nick')">
              <UInput v-model="form.nick" maxlength="64" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.region')" name="region" :error="errorFor('region')">
              <USelect v-model="form.region" :items="regionItems" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.faction')" name="faction" :error="errorFor('faction')">
              <USelect
                v-model="form.faction"
                :items="factionItems"
                :placeholder="t('forms.chooseFaction')"
                class="w-full"
              >
                <template #leading>
                  <img
                    v-if="selectedFaction?.emblem"
                    :src="selectedFaction.emblem"
                    :alt="selectedFaction.label"
                    width="18"
                    height="18"
                    class="size-[18px] shrink-0 object-contain">
                </template>
                <template #item-leading="{ item }">
                  <img
                    v-if="item.emblem"
                    :src="item.emblem"
                    alt=""
                    width="18"
                    height="18"
                    class="size-[18px] shrink-0 object-contain">
                </template>
              </USelect>
            </UFormField>
            <UFormField :label="t('forms.alliance')" name="alliance" :error="errorFor('alliance')">
              <UInput v-model="form.alliance" :maxlength="TEXT_MAX" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.clanName')" name="clanName" :error="errorFor('clanName')">
              <UInput v-model="form.clanName" :maxlength="TEXT_MAX" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.clanRank')" name="clanRank" :error="errorFor('clanRank')">
              <UInput v-model="form.clanRank" :maxlength="TEXT_MAX" class="w-full" />
            </UFormField>
          </div>
        </div>

        <div class="space-y-3 border-t border-[var(--sz-border)] pt-3">
          <p class="sz-caps text-[var(--sz-text-muted)]">{{ t('forms.stats') }}</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <template v-for="field in STAT_FIELDS" :key="field">
              <UFormField
                :label="t(`forms.stat.${field}`)"
                :name="`stats.${field}`"
                :error="errorFor(`stats.${field}`)"
              >
                <UInputNumber
                  v-if="isNumericStatField(field)"
                  :model-value="typeof form.stats[field] === 'number' ? form.stats[field] : null"
                  :min="0"
                  :max="COUNTER_MAX"
                  :step="1"
                  :step-snapping="false"
                  class="w-full"
                  @update:model-value="(value) => setStatNumber(field, value)"
                />
                <UInput
                  v-else-if="field === 'reg-tim'"
                  type="date"
                  :model-value="statText(field)"
                  class="w-full"
                  @update:model-value="(value) => setStatText(field, value)"
                />
                <UInput
                  v-else-if="field === 'pla-tim'"
                  :model-value="statText(field)"
                  placeholder="PT123H"
                  class="w-full"
                  @update:model-value="(value) => setStatText(field, value)"
                />
                <UInput
                  v-else
                  :model-value="statText(field)"
                  maxlength="500"
                  class="w-full"
                  @update:model-value="(value) => setStatText(field, value)"
                />
              </UFormField>
            </template>
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
            <UFormField :label="t('forms.money')" name="money" :error="errorFor('money')">
              <UInputNumber
                v-model="form.money"
                :min="0"
                :max="COUNTER_MAX"
                :step="1000"
                :step-snapping="false"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('forms.maxMoney')" name="maxMoney" :error="errorFor('maxMoney')">
              <UInputNumber
                v-model="form.maxMoney"
                :min="0"
                :max="COUNTER_MAX"
                :step="1000"
                :step-snapping="false"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>

        <div class="space-y-3 border-t border-[var(--sz-border)] pt-3">
          <p class="sz-caps text-[var(--sz-text-muted)]">{{ t('forms.sectionNotes') }}</p>
        </div>

        <UAlert
          v-if="!changed"
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          :title="t('forms.noChanges')"
        />

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
        <UButton
          type="submit"
          form="character-form"
          :loading="busy"
          :disabled="!submitEnabled || busy"
          :label="form.dryRun ? t('common.check') : t('common.save')"
        />
      </div>
    </template>
  </UModal>
</template>
