<script setup lang="ts">
import type { ContainerPayload } from '~/composables/useDossier';
import type { OwnedEditTarget } from '~/types/dossier';

const { t } = useI18n();
useHead(() => ({ title: `${t('containers.pageTitle')} — ${t('common.appName')}` }));

const { payload } = useDossier();
const { g2 } = useFormat();
const containers = computed(() => payload.value?.containers ?? []);
const details = computed(() => payload.value?.details ?? {});

const selected = ref<ContainerPayload | null>(null);
const slideOpen = ref(false);
const editTarget = ref<OwnedEditTarget | null>(null);
const fillTarget = ref<ContainerPayload | null>(null);
const artifactTarget = ref<{ name: string; level: number } | null>(null);

const editOpen = computed({
  get: () => editTarget.value !== null,
  set: (value: boolean) => {
    if (!value) editTarget.value = null;
  },
});
const fillOpen = computed({
  get: () => fillTarget.value !== null,
  set: (value: boolean) => {
    if (!value) fillTarget.value = null;
  },
});
const artifactOpen = computed({
  get: () => artifactTarget.value !== null,
  set: (value: boolean) => {
    if (!value) artifactTarget.value = null;
  },
});
const artifactCard = computed(() =>
  artifactTarget.value ? findDetailsCard(details.value, 'art', artifactTarget.value.name) : null,
);

function selectContainer(container: ContainerPayload): void {
  selected.value = container;
  if (import.meta.client && window.matchMedia('(max-width: 1023px)').matches) slideOpen.value = true;
}

function openArtifact(name: string, level: number): void {
  artifactTarget.value = { name, level };
}

function startEdit(container: ContainerPayload): void {
  if (container.ownedId == null) return;
  editTarget.value = {
    ownedId: container.ownedId,
    name: container.name,
    kind: 'container',
    level: 0,
    qty: container.qty ?? 1,
    quality: container.quality ?? null,
    skin: container.skin ?? null,
    note: container.note ?? null,
    role: null,
    slot: null,
  };
}

function startFill(container: ContainerPayload): void {
  if (container.ownedId == null) return;
  fillTarget.value = container;
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="min-w-0 break-words">{{ t('containers.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">
          {{ t('containers.summary', { count: containers.length }) }}
        </p>
      </div>
    </div>

    <div v-if="containers.length" class="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <DossierPane :label="t('containers.listTitle')" dense flush>
        <template #header>
          <span class="sz-caps truncate text-[var(--sz-text-muted)]">{{ t('containers.listTitle') }}</span>
        </template>
        <nav class="divide-y divide-[var(--sz-border)]">
          <button
            v-for="container in containers"
            :key="container.name"
            type="button"
            class="relative flex w-full flex-col gap-1 px-2.5 py-2 text-left transition-colors hover:bg-[var(--sz-surface-alt)] active:bg-[var(--sz-surface-alt)]"
            :class="selected?.name === container.name ? 'bg-[color-mix(in_srgb,var(--sz-accent)_7%,transparent)]' : ''"
            :aria-pressed="selected?.name === container.name"
            @click="selectContainer(container)"
          >
            <span
              v-if="selected?.name === container.name"
              class="absolute inset-y-0 left-0 w-0.5 bg-[var(--sz-accent)]"
            />
            <span class="flex items-center gap-2">
              <RarityName :name="container.name" :rank="container.rank" class="flex-1" />
              <RankBadge :rank="container.rank" />
            </span>
            <span class="flex flex-wrap items-baseline gap-x-2 text-[11px] text-[var(--sz-text-muted)]">
              <span>{{ container.type ?? t('containers.typeFallback') }}</span>
              <span v-if="container.weight != null" class="tabular-nums">
                {{ t('containers.weightValue', { value: g2(container.weight) }) }}
              </span>
              <span class="ml-auto tabular-nums">
                {{ container.artifacts.length }} / {{ container.slots ?? '—' }}
              </span>
            </span>
          </button>
        </nav>
      </DossierPane>

      <DossierPane :title="selected?.name ?? t('containers.detailTitle')" dense>
        <template v-if="selected?.ownedId" #actions>
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="xs"
            :label="t('common.edit')"
            @click="startEdit(selected)"
          />
          <UButton
            icon="i-lucide-gem"
            color="neutral"
            variant="ghost"
            size="xs"
            :label="t('containers.fill')"
            @click="startFill(selected)"
          />
        </template>

        <ContainerDetail :container="selected" @artifact="openArtifact" />
      </DossierPane>
    </div>

    <UEmpty
      v-else
      icon="i-lucide-backpack"
      :title="t('common.empty')"
      :description="t('containers.emptyDescription')"
    />

    <USlideover v-model:open="slideOpen" :title="selected?.name ?? t('containers.detailTitle')">
      <template #body>
        <div class="space-y-3">
          <ContainerDetail :container="selected" @artifact="openArtifact" />
          <div v-if="selected?.ownedId" class="flex flex-wrap gap-2 border-t border-[var(--sz-border)] pt-3">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="outline"
              size="xs"
              :label="t('common.edit')"
              @click="startEdit(selected)"
            />
            <UButton
              icon="i-lucide-gem"
              color="neutral"
              variant="outline"
              size="xs"
              :label="t('containers.fill')"
              @click="startFill(selected)"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <KeyHint :keys="['Esc']" :label="t('common.close')" />
      </template>
    </USlideover>

    <UModal
      v-model:open="artifactOpen"
      :title="t('items.artifactCardTitle')"
      :description="artifactTarget?.name"
      scrollable
    >
      <template #body>
        <ItemCard
          v-if="artifactTarget"
          :name="artifactTarget.name"
          kind="artifact"
          :data="{ name: artifactTarget.name, lvl: artifactTarget.level }"
          :card="artifactCard"
          :level="artifactTarget.level"
        />
      </template>
      <template #footer>
        <KeyHint :keys="['Esc']" :label="t('common.close')" />
      </template>
    </UModal>

    <EditOwnedModal v-model:open="editOpen" :target="editTarget" />
    <ContainerFillEditor v-model:open="fillOpen" :container="fillTarget" />
  </section>
</template>
