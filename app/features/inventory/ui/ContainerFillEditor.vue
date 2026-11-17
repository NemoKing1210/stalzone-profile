<script setup lang="ts">
import { ContainerFillSchema } from '@dossier/shared/contracts';
import type { FillTarget } from '~/shared/types/dossier';
import type { WriteResult } from '~/shared/composables/useWrite';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ container: FillTarget | null }>();
const emit = defineEmits<{ saved: [] }>();

const { write, busy } = useWrite();
const { t } = useI18n();

interface ArtifactRowForm {
  name: string;
  level: number;
  quality: string | null | undefined;
}

const form = reactive({
  artifacts: [] as ArtifactRowForm[],
  asOf: null as string | null | undefined,
  dryRun: false,
});

const lastResult = ref<WriteResult | null>(null);

const { data: artifacts } = useFetch<{ name: string }[]>('/api/v1/items', {
  query: { kind: 'artifact', limit: 200 },
  key: 'artifact-items',
  default: () => [],
});
const artifactItems = computed(() => (artifacts.value ?? []).map((artifact) => artifact.name));

watch(open, (value) => {
  if (value) reset();
});
watch(
  () => props.container,
  () => {
    if (open.value) reset();
  },
);

function reset(): void {
  const container = props.container;
  if (!container) return;
  form.artifacts = container.artifacts.map((artifact) => ({
    name: artifact.name,
    level: artifact.lvl,
    quality: null,
  }));
  form.asOf = container.artifactsAsOf;
  form.dryRun = false;
  lastResult.value = null;
}

function addRow(): void {
  form.artifacts.push({ name: artifactItems.value[0] ?? '', level: 0, quality: null });
}

function removeRow(index: number): void {
  form.artifacts.splice(index, 1);
}

async function submit(): Promise<void> {
  const container = props.container;
  if (!container?.ownedId) return;

  const result = await write<WriteResult>(`/api/v1/containers/${container.ownedId}/fill`, {
    method: 'PUT',
    body: {
      artifacts: form.artifacts.map((artifact) => ({
        name: artifact.name,
        level: artifact.level,
        quality: artifact.quality ?? null,
      })),
      asOf: form.asOf ?? null,
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
    :title="t('forms.fillTitle')"
    :description="props.container?.name"
    scrollable
  >
    <template #body>
      <UForm :schema="ContainerFillSchema" :state="form" class="space-y-4" @submit="submit">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('forms.fillReplacesTitle')"
          :description="t('forms.fillReplacesText')"
        />

        <div class="space-y-3">
          <div
            v-for="(row, index) in form.artifacts"
            :key="index"
            class="grid items-end gap-2 rounded-md border border-default p-3 sm:grid-cols-[1fr_7rem_9rem_auto]"
          >
            <UFormField :label="t('forms.artifactN', { index: index + 1 })" :name="`artifacts.${index}.name`">
              <USelectMenu v-model="row.name" :items="artifactItems" searchable class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.level')" :name="`artifacts.${index}.level`">
              <UInputNumber v-model="row.level" :min="0" :max="15" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.quality')" :name="`artifacts.${index}.quality`">
              <UInput v-model.nullable="row.quality" :placeholder="t('forms.notSpecified')" class="w-full" />
            </UFormField>
            <UButton
              type="button"
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              :aria-label="t('forms.removeArtifact', { index: index + 1 })"
              @click="removeRow(index)"
            />
          </div>
        </div>

        <UButton
          type="button"
          color="neutral"
          variant="outline"
          icon="i-lucide-plus"
          :label="t('forms.addArtifact')"
          @click="addRow"
        />

        <UFormField :label="t('forms.snapshotDate')" name="asOf">
          <UInput v-model.nullable="form.asOf" placeholder="2026-11-15T12:00:00.000Z" class="w-full" />
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

        <div class="flex justify-end gap-2">
          <UButton type="button" color="neutral" variant="ghost" :label="t('common.cancel')" @click="open = false" />
          <UButton type="submit" :loading="busy" :label="form.dryRun ? t('common.check') : t('common.save')" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
