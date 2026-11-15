<script setup lang="ts">
import { ContentBlockInputSchema } from '@dossier/shared/schemas';
import type { ContentEditTarget } from '~/types/dossier';
import type { WriteResult } from '~/composables/useWrite';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ target: ContentEditTarget | null }>();
const emit = defineEmits<{ saved: [] }>();

const { write, busy } = useWrite();

const form = reactive({
  kind: 'notes' as ContentEditTarget['kind'],
  slug: null as string | null,
  title: null as string | null | undefined,
  lead: null as string | null | undefined,
  position: 0,
  payload: null as unknown,
  dryRun: false,
});

const payloadText = ref('');
const jsonError = ref<string | null>(null);
const lastResult = ref<WriteResult | null>(null);

watch(open, (value) => {
  if (value) reset();
});
watch(
  () => props.target,
  () => {
    if (open.value) reset();
  },
);

function reset(): void {
  const target = props.target;
  if (!target) return;
  form.kind = target.kind;
  form.slug = target.slug;
  form.title = target.title;
  form.lead = target.lead;
  form.position = target.position ?? 0;
  form.payload = target.payload;
  payloadText.value = JSON.stringify(target.payload ?? null, null, 2);
  form.dryRun = false;
  jsonError.value = null;
  lastResult.value = null;
}

async function submit(): Promise<void> {
  let payload: unknown;
  try {
    payload = JSON.parse(payloadText.value);
    jsonError.value = null;
  } catch {
    jsonError.value = 'Поле содержит некорректный JSON. Исправьте его перед сохранением.';
    return;
  }

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = { ...(payload as Record<string, unknown>) };
    delete record.slug;
    delete record.position;
    if (form.kind === 'notes') {
      if (form.title) record.title = form.title;
    }
    if (form.kind === 'recs') {
      if (form.title) record.title = form.title;
      if (form.lead) record.lead = form.lead;
      if (form.slug) record.id = form.slug;
    }
    payload = record;
  }
  form.payload = payload;

  const result = await write<WriteResult>(`/api/v1/content/${form.kind}`, {
    method: 'PUT',
    body: {
      slug: form.slug,
      title: form.title ?? null,
      lead: form.lead ?? null,
      payload,
      position: form.position,
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
  <UModal v-model:open="open" title="Редактировать блок" :description="props.target?.title ?? props.target?.kind" scrollable>
    <template #body>
      <UForm :schema="ContentBlockInputSchema" :state="form" class="space-y-4" @submit="submit">
        <div v-if="form.slug" class="rounded-md bg-elevated/60 px-3 py-2 text-sm">
          <span class="text-muted">Ключ:</span> <code>{{ form.kind }}/{{ form.slug }}</code>
        </div>

        <div v-if="form.kind !== 'earnings'" class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Заголовок" name="title">
            <UInput v-model.nullable="form.title" class="w-full" />
          </UFormField>
          <UFormField label="Подзаголовок" name="lead">
            <UInput v-model.nullable="form.lead" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="JSON" name="payload">
          <UTextarea v-model="payloadText" :rows="16" class="w-full font-mono text-xs" spellcheck="false" />
        </UFormField>

        <UAlert
          v-if="jsonError"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Ошибка JSON"
          :description="jsonError"
        />

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
