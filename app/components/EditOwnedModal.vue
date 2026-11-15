<script setup lang="ts">
import { OwnedPatchSchema } from '@dossier/shared/schemas';
import type { OwnedEditTarget } from '~/types/dossier';
import type { WriteResult } from '~/composables/useWrite';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ target: OwnedEditTarget | null }>();
const emit = defineEmits<{ saved: []; deleted: [] }>();

const { write, busy } = useWrite();

const form = reactive({
  level: 0,
  qty: 1,
  quality: null as string | null | undefined,
  skin: undefined as string | undefined,
  note: null as string | null | undefined,
  role: null as string | null | undefined,
  slot: null as string | null | undefined,
  dryRun: false,
});

const lastResult = ref<WriteResult | null>(null);
const confirmOpen = ref(false);

const { data: motifs } = useFetch<{ name: string }[]>('/api/v1/items', {
  query: { kind: 'motif', limit: 200 },
  key: 'motif-items',
  default: () => [],
});
const skinItems = computed(() => (motifs.value ?? []).map((motif) => motif.name));

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
  form.level = target.level;
  form.qty = target.qty;
  form.quality = target.quality;
  form.skin = target.skin ?? undefined;
  form.note = target.note;
  form.role = target.role;
  form.slot = target.slot;
  form.dryRun = false;
  lastResult.value = null;
}

async function submit(): Promise<void> {
  const target = props.target;
  if (!target) return;

  const result = await write<WriteResult>(`/api/v1/owned/${target.ownedId}`, {
    method: 'PATCH',
    body: {
      level: form.level,
      qty: form.qty,
      quality: form.quality ?? null,
      skin: form.skin ?? null,
      note: form.note ?? null,
      role: form.role ?? null,
      slot: form.slot ?? null,
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

async function remove(): Promise<void> {
  const target = props.target;
  if (!target) return;

  const result = await write<WriteResult>(`/api/v1/owned/${target.ownedId}`, {
    method: 'DELETE',
    body: { qty: form.qty, dryRun: false },
  });
  if (!result) return;

  confirmOpen.value = false;
  open.value = false;
  emit('deleted');
}
</script>

<template>
  <UModal v-model:open="open" title="Редактировать предмет" :description="props.target?.name" scrollable>
    <template #body>
      <UForm :schema="OwnedPatchSchema" :state="form" class="space-y-4" @submit="submit">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Уровень заточки" name="level">
            <UInputNumber v-model="form.level" :min="0" :max="15" class="w-full" />
          </UFormField>
          <UFormField label="Количество" name="qty">
            <UInputNumber v-model="form.qty" :min="1" :max="99" class="w-full" />
          </UFormField>
          <UFormField label="Качество" name="quality">
            <UInput v-model.nullable="form.quality" placeholder="например, Редкий 141%" class="w-full" />
          </UFormField>
          <UFormField label="Облик" name="skin">
            <USelectMenu
              v-model="form.skin"
              :items="skinItems"
              searchable
              clearable
              placeholder="Без облика"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Роль" name="role">
            <UInput v-model.nullable="form.role" placeholder="универсал, ПвЕ" class="w-full" />
          </UFormField>
          <UFormField label="Слот" name="slot">
            <UInput v-model.nullable="form.slot" placeholder="основное или вторичное" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Заметка" name="note">
          <UTextarea v-model.nullable="form.note" :rows="2" class="w-full" />
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

        <div class="flex flex-wrap items-center justify-between gap-2">
          <UButton
            type="button"
            color="error"
            variant="soft"
            icon="i-lucide-trash-2"
            label="Удалить"
            @click="confirmOpen = true"
          />
          <div class="flex gap-2">
            <UButton type="button" color="neutral" variant="ghost" label="Отмена" @click="open = false" />
            <UButton type="submit" :loading="busy" :label="form.dryRun ? 'Проверить' : 'Сохранить'" />
          </div>
        </div>
      </UForm>
    </template>
  </UModal>

  <ConfirmActionModal
    v-model:open="confirmOpen"
    title="Удалить предмет"
    :description="`Удалить «${props.target?.name ?? ''}» и всё количество (${form.qty} шт.)? Действие можно откатить в настройках.`"
    confirm-label="Удалить"
    :loading="busy"
    @confirm="remove"
  />
</template>
