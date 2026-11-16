<script setup lang="ts">
import type { ContentEditTarget, ContentKind } from '~/types/dossier';

const { t } = useI18n();
useHead(() => ({ title: `${t('notes.pageTitle')} — ${t('common.appName')}` }));

interface Note {
  title?: string;
  text?: string;
  slug?: string | null;
  position?: number;
  [key: string]: unknown;
}

const { payload } = useDossier();
const filters = useFilters('notes', { q: '' });
const notes = computed(() => (payload.value?.notes ?? []) as Note[]);
const editTarget = ref<ContentEditTarget | null>(null);
const editOpen = computed({
  get: () => editTarget.value !== null,
  set: (value: boolean) => {
    if (!value) editTarget.value = null;
  },
});

function startEdit(note: Note): void {
  const kind: ContentKind = 'notes';
  editTarget.value = {
    kind,
    slug: note.slug ?? null,
    title: note.title ?? null,
    lead: null,
    payload: note,
    position: note.position ?? 0,
  };
}

const filtered = computed(() => {
  const query = filters.q.trim().toLowerCase();
  if (!query) return notes.value;
  return notes.value.filter((note) =>
    [note.title, note.text]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
});
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{{ t('notes.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">
          {{ t('notes.summary', { shown: filtered.length, total: notes.length }) }}
        </p>
      </div>
    </div>

    <UInput
      v-model="filters.q"
      icon="i-lucide-search"
      size="xs"
      :placeholder="t('notes.search')"
      class="w-full sm:w-80"
    />

    <div v-if="filtered.length" class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <DossierPane v-for="note in filtered" :key="note.title" :title="note.title ?? ''" dense>
        <template #actions>
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('notes.editAria', { title: note.title ?? '' })"
            @click="startEdit(note)"
          />
        </template>
        <p class="whitespace-pre-line text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">{{ note.text }}</p>
      </DossierPane>
    </div>
    <UEmpty
      v-else
      icon="i-lucide-notebook-pen"
      :title="t('common.empty')"
      :description="notes.length ? t('filters.noMatch') : t('notes.emptyDescription')"
    />

    <EditContentBlock v-model:open="editOpen" :target="editTarget" />
  </section>
</template>
