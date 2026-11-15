<script setup lang="ts">
import { ContainerFillSchema } from '@dossier/shared/schemas';
import type { ContainerPayload } from '~/composables/useDossier';
import type { WriteResult } from '~/composables/useWrite';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ container: ContainerPayload | null }>();
const emit = defineEmits<{ saved: [] }>();

const { write, busy } = useWrite();

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
    title="Наполнение контейнера"
    :description="props.container?.name"
    scrollable
  >
    <template #body>
      <UForm :schema="ContainerFillSchema" :state="form" class="space-y-4" @submit="submit">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Наполнение заменяется целиком"
          description="Существующий список артефактов будет заменён новым. Откат доступен в настройках."
        />

        <div class="space-y-3">
          <div
            v-for="(row, index) in form.artifacts"
            :key="index"
            class="grid items-end gap-2 rounded-md border border-default p-3 sm:grid-cols-[1fr_7rem_9rem_auto]"
          >
            <UFormField :label="`Артефакт ${index + 1}`" :name="`artifacts.${index}.name`">
              <USelectMenu v-model="row.name" :items="artifactItems" searchable class="w-full" />
            </UFormField>
            <UFormField label="Уровень" :name="`artifacts.${index}.level`">
              <UInputNumber v-model="row.level" :min="0" :max="15" class="w-full" />
            </UFormField>
            <UFormField label="Качество" :name="`artifacts.${index}.quality`">
              <UInput v-model.nullable="row.quality" placeholder="не указано" class="w-full" />
            </UFormField>
            <UButton
              type="button"
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              :aria-label="`Убрать артефакт ${index + 1}`"
              @click="removeRow(index)"
            />
          </div>
        </div>

        <UButton type="button" color="neutral" variant="outline" icon="i-lucide-plus" label="Добавить артефакт" @click="addRow" />

        <UFormField label="Дата снимка" name="asOf">
          <UInput v-model.nullable="form.asOf" placeholder="2026-11-15T12:00:00.000Z" class="w-full" />
        </UFormField>

        <UFormField name="dryRun">
          <USwitch v-model="form.dryRun" label="Пробный прогон: показать изменения без записи" />
        </UFormField>

        <UAlert
          v-if="lastResult"
          :color="lastResult.dryRun ? 'info' : 'success'"
          variant="subtle"
          icon="i-lucide-list-checks"
          :title="lastResult.dryRun ? 'Пробный прогон' : 'Изменение записано'"
          :description="lastResult.diff.human"
        />

        <div class="flex justify-end gap-2">
          <UButton type="button" color="neutral" variant="ghost" label="Отмена" @click="open = false" />
          <UButton type="submit" :loading="busy" :label="form.dryRun ? 'Проверить' : 'Сохранить'" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
