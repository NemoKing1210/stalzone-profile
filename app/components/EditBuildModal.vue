<script setup lang="ts">
import { BuildInputSchema } from '@dossier/shared/schemas';
import type { BuildPayload } from '~/composables/useDossier';
import type { WriteResult } from '~/composables/useWrite';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ build: BuildPayload | null; containerOptions: string[] }>();
const emit = defineEmits<{ saved: []; deleted: [] }>();

const { write, busy } = useWrite();
const { t } = useI18n();

interface BuildRowForm {
  name: string | null | undefined;
  quality: string | null | undefined;
  rank: string | null | undefined;
  price: number | null;
  lots: number | null;
  eff: string | null | undefined;
  bonus: string | null | undefined;
  minus: string | null | undefined;
  why: string | null | undefined;
}

const form = reactive({
  slug: '',
  title: '',
  short: null as string | null | undefined,
  tag: null as string | null | undefined,
  goal: null as string | null | undefined,
  container: undefined as string | undefined,
  slots: null as number | null,
  eff: null as number | null,
  budget: null as number | null,
  total: null as number | null,
  verdict: null as string | null | undefined,
  dryRun: false,
  metrics: [] as { l: string; v: string; s?: string | null }[],
  rows: [] as BuildRowForm[],
});

const lastResult = ref<WriteResult | null>(null);
const confirmOpen = ref(false);

watch(open, (value) => {
  if (value) reset();
});
watch(
  () => props.build,
  () => {
    if (open.value) reset();
  },
);

function emptyRow(): BuildRowForm {
  return {
    name: '',
    quality: null,
    rank: null,
    price: null,
    lots: null,
    eff: null,
    bonus: null,
    minus: null,
    why: null,
  };
}

function reset(): void {
  const build = props.build;
  if (!build) return;
  form.slug = build.id;
  form.title = build.title;
  form.short = build.short;
  form.tag = build.tag;
  form.goal = build.goal;
  form.container = build.container ?? undefined;
  form.slots = build.slots;
  form.eff = build.eff;
  form.budget = build.budget;
  form.total = build.total;
  form.verdict = build.verdict;
  form.metrics = build.metrics.map((metric) => ({ ...metric }));
  form.rows = build.rows.map((row) => ({
    name: row.name,
    quality: row.q,
    rank: row.rank,
    price: row.price,
    lots: row.lots,
    eff: row.eff,
    bonus: row.bonus,
    minus: row.minus,
    why: row.why,
  }));
  form.dryRun = false;
  lastResult.value = null;
}

function addRow(): void {
  form.rows.push(emptyRow());
}

function removeRow(index: number): void {
  form.rows.splice(index, 1);
}

async function submit(): Promise<void> {
  const result = await write<WriteResult>('/api/v1/builds', {
    method: 'POST',
    body: {
      slug: form.slug,
      title: form.title,
      short: form.short ?? null,
      tag: form.tag ?? null,
      goal: form.goal ?? null,
      container: form.container ?? null,
      slots: form.slots,
      eff: form.eff,
      budget: form.budget,
      total: form.total,
      verdict: form.verdict ?? null,
      metrics: form.metrics,
      dryRun: form.dryRun,
      rows: form.rows.map((row) => ({
        name: row.name ?? null,
        quality: row.quality ?? null,
        rank: row.rank ?? null,
        price: row.price,
        lots: row.lots,
        eff: row.eff ?? null,
        bonus: row.bonus ?? null,
        minus: row.minus ?? null,
        why: row.why ?? null,
      })),
    },
  });
  if (!result) return;

  lastResult.value = result;
  if (!result.dryRun) {
    open.value = false;
    emit('saved');
  }
}

async function remove(): Promise<void> {
  const build = props.build;
  if (!build) return;

  const result = await write<WriteResult>(`/api/v1/builds/${build.id}`, {
    method: 'DELETE',
    body: { dryRun: false },
  });
  if (!result) return;

  confirmOpen.value = false;
  open.value = false;
  emit('deleted');
}
</script>

<template>
  <UModal v-model:open="open" :title="t('forms.editBuildTitle')" :description="props.build?.title" scrollable>
    <template #body>
      <UForm :schema="BuildInputSchema" :state="form" class="space-y-4" @submit="submit">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField :label="t('forms.slug')" name="slug" :hint="t('forms.slugHint')">
            <UInput v-model="form.slug" disabled class="w-full" />
          </UFormField>
          <UFormField :label="t('forms.title')" name="title">
            <UInput v-model="form.title" class="w-full" />
          </UFormField>
          <UFormField :label="t('forms.short')" name="short">
            <UInput v-model.nullable="form.short" class="w-full" />
          </UFormField>
          <UFormField :label="t('forms.tag')" name="tag">
            <UInput v-model.nullable="form.tag" :placeholder="t('forms.tagPlaceholder')" class="w-full" />
          </UFormField>
        </div>

        <UFormField :label="t('forms.goal')" name="goal">
          <UTextarea v-model.nullable="form.goal" :rows="2" class="w-full" />
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <UFormField :label="t('forms.container')" name="container">
            <USelectMenu
              v-model="form.container"
              :items="props.containerOptions"
              searchable
              clearable
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('forms.slots')" name="slots">
            <UInputNumber v-model="form.slots" :min="0" class="w-full" />
          </UFormField>
          <UFormField :label="t('forms.efficiencyPercent')" name="eff">
            <UInputNumber v-model="form.eff" :min="0" class="w-full" />
          </UFormField>
          <UFormField :label="t('forms.budget')" name="budget">
            <UInputNumber v-model="form.budget" :min="0" class="w-full" />
          </UFormField>
          <UFormField :label="t('forms.total')" name="total">
            <UInputNumber v-model="form.total" :min="0" class="w-full" />
          </UFormField>
        </div>

        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium">{{ t('forms.composition') }}</p>
            <UButton
              type="button"
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              :label="t('forms.addRow')"
              @click="addRow"
            />
          </div>

          <div
            v-for="(row, index) in form.rows"
            :key="index"
            class="grid gap-2 rounded-md border border-default p-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <UFormField :label="t('forms.item')" :name="`rows.${index}.name`">
              <UInput v-model.nullable="row.name" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.quality')" :name="`rows.${index}.quality`">
              <UInput v-model.nullable="row.quality" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.rank')" :name="`rows.${index}.rank`">
              <UInput v-model.nullable="row.rank" class="w-full" />
            </UFormField>
            <div class="flex items-end gap-2">
              <UFormField :label="t('forms.price')" :name="`rows.${index}.price`" class="flex-1">
                <UInputNumber v-model="row.price" :min="0" class="w-full" />
              </UFormField>
              <UButton
                type="button"
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                :aria-label="t('forms.removeRow', { index: index + 1 })"
                @click="removeRow(index)"
              />
            </div>
            <UFormField :label="t('forms.lots')" :name="`rows.${index}.lots`">
              <UInputNumber v-model="row.lots" :min="0" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.effect')" :name="`rows.${index}.eff`">
              <UInput v-model.nullable="row.eff" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.plus')" :name="`rows.${index}.bonus`">
              <UInput v-model.nullable="row.bonus" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.minus')" :name="`rows.${index}.minus`">
              <UInput v-model.nullable="row.minus" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.why')" :name="`rows.${index}.why`" class="sm:col-span-2 lg:col-span-4">
              <UInput v-model.nullable="row.why" class="w-full" />
            </UFormField>
          </div>
        </div>

        <UFormField :label="t('forms.verdict')" name="verdict">
          <UTextarea v-model.nullable="form.verdict" :rows="2" class="w-full" />
        </UFormField>

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

        <div class="flex flex-wrap items-center justify-between gap-2">
          <UButton
            type="button"
            color="error"
            variant="soft"
            icon="i-lucide-trash-2"
            :label="t('forms.deleteBuild')"
            @click="confirmOpen = true"
          />
          <div class="flex gap-2">
            <UButton type="button" color="neutral" variant="ghost" :label="t('common.cancel')" @click="open = false" />
            <UButton type="submit" :loading="busy" :label="form.dryRun ? t('common.check') : t('common.save')" />
          </div>
        </div>
      </UForm>
    </template>
  </UModal>

  <ConfirmActionModal
    v-model:open="confirmOpen"
    :title="t('forms.deleteBuild')"
    :description="t('forms.deleteBuildConfirm', { title: props.build?.title ?? '' })"
    :confirm-label="t('common.delete')"
    :loading="busy"
    @confirm="remove"
  />
</template>
