<script setup lang="ts">
import type { ContainerPayload } from '~/composables/useDossier';
import type { OwnedEditTarget } from '~/types/dossier';

useHead({ title: 'Контейнеры — STALZONE Dossier' });

interface Selection {
  kind: 'container' | 'artifact';
  name: string;
  data: unknown;
  level: number | null;
}

const { payload } = useDossier();
const { g1, g2, num, formatDate } = useFormat();
const containers = computed(() => payload.value?.containers ?? []);
const details = computed(() => payload.value?.details ?? {});

const selected = ref<Selection | null>(null);
const editTarget = ref<OwnedEditTarget | null>(null);
const fillTarget = ref<ContainerPayload | null>(null);
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
const modalOpen = computed({
  get: () => selected.value !== null,
  set: (value: boolean) => {
    if (!value) selected.value = null;
  },
});
const selectedCard = computed(() =>
  selected.value
    ? findDetailsCard(details.value, selected.value.kind === 'container' ? 'c' : 'art', selected.value.name)
    : null,
);

function openContainer(container: ContainerPayload): void {
  selected.value = { kind: 'container', name: container.name, data: container, level: null };
}

function openArtifact(name: string, level: number): void {
  selected.value = { kind: 'artifact', name, data: { name, lvl: level }, level };
}

function slotEquivalent(container: ContainerPayload): string {
  if (container.slots == null || container.eff == null) return '—';
  return g2((container.slots * container.eff) / 100);
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
        <h1 class="text-2xl font-semibold">Контейнеры</h1>
        <p class="text-sm text-muted">{{ containers.length }} шт. · слоты, эффективность и текущее наполнение</p>
      </div>
      <FreshnessBadge
        :data-updated="payload?.freshness.dataUpdated"
        :prices-age-min="payload?.freshness.pricesAgeMin"
      />
    </div>

    <div v-if="containers.length" class="grid gap-4 lg:grid-cols-2">
      <UCard v-for="container in containers" :key="container.name">
        <template #header>
          <div class="flex items-start gap-3">
            <img
              v-if="container.icon"
              :src="container.icon"
              :alt="container.name"
              class="size-12 rounded-md bg-elevated object-contain p-1"
              loading="lazy"
            >
            <div v-else class="flex size-12 items-center justify-center rounded-md bg-elevated">
              <UIcon name="i-lucide-backpack" class="size-6 text-muted" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="font-medium">{{ container.name }}</p>
              <p class="text-xs text-muted">{{ container.type ?? 'контейнер' }}</p>
              <div class="mt-1 flex flex-wrap gap-1">
                <RankBadge :rank="container.rank" />
                <UBadge v-if="container.bonus" color="neutral" variant="subtle">{{ container.bonus }}</UBadge>
              </div>
            </div>
            <UButton
              icon="i-lucide-panel-right-open"
              color="neutral"
              variant="ghost"
              label="Карточка"
              @click="openContainer(container)"
            />
          </div>
          <div v-if="container.ownedId" class="mt-2 flex flex-wrap gap-1">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="outline"
              size="xs"
              label="Изменить"
              @click="startEdit(container)"
            />
            <UButton
              icon="i-lucide-gem"
              color="neutral"
              variant="outline"
              size="xs"
              label="Наполнение"
              @click="startFill(container)"
            />
          </div>
        </template>

        <div class="space-y-4">
          <dl class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div class="rounded-md bg-elevated/60 p-2">
              <dt class="text-xs text-muted">Слоты</dt>
              <dd class="font-medium tabular-nums">{{ container.slots ?? '—' }}</dd>
            </div>
            <div class="rounded-md bg-elevated/60 p-2">
              <dt class="text-xs text-muted">Эффективность</dt>
              <dd class="font-medium tabular-nums">{{ container.eff == null ? '—' : `${g1(container.eff)}%` }}</dd>
            </div>
            <div class="rounded-md bg-elevated/60 p-2">
              <dt class="text-xs text-muted">Эквивалент</dt>
              <dd class="font-medium tabular-nums">{{ slotEquivalent(container) }}</dd>
            </div>
            <div class="rounded-md bg-elevated/60 p-2">
              <dt class="text-xs text-muted">Вес</dt>
              <dd class="font-medium tabular-nums">{{ container.weight == null ? '—' : `${g2(container.weight)} кг` }}</dd>
            </div>
          </dl>

          <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span><span class="text-muted">Защита:</span> {{ container.prot ?? '—' }}</span>
            <span><span class="text-muted">Щит:</span> {{ container.shield ?? '—' }}</span>
          </div>

          <div>
            <p class="mb-2 text-sm font-medium">Наполнение</p>
            <ul v-if="container.artifacts.length" class="flex flex-wrap gap-1">
              <li v-for="(artifact, index) in container.artifacts" :key="`${artifact.name}-${index}`">
                <button type="button" @click="openArtifact(artifact.name, artifact.lvl)">
                  <UBadge color="neutral" variant="subtle" class="cursor-pointer hover:text-primary">
                    {{ artifact.name }} · +{{ artifact.lvl }}
                  </UBadge>
                </button>
              </li>
            </ul>
            <p v-else class="text-sm text-muted">нет данных о наполнении</p>
            <p v-if="container.artifactsAsOf" class="mt-2 text-xs text-muted">
              Наполнение на {{ formatDate(container.artifactsAsOf) }}
            </p>
          </div>

          <p v-if="container.slots != null && container.eff != null" class="text-xs text-muted">
            {{ num(container.slots) }} слота × {{ g1(container.eff) }}% = {{ slotEquivalent(container) }} эффекта
          </p>
        </div>
      </UCard>
    </div>
    <UEmpty
      v-else
      icon="i-lucide-backpack"
      title="Пусто"
      description="В досье пока нет контейнеров. Добавьте их через API или MCP."
    />

    <UModal v-model:open="modalOpen" title="Карточка предмета" :description="selected?.name" scrollable>
      <template #body>
        <ItemCard
          v-if="selected"
          :name="selected.name"
          :kind="selected.kind"
          :data="selected.data"
          :card="selectedCard"
          :level="selected.level"
        />
      </template>
    </UModal>

    <EditOwnedModal v-model:open="editOpen" :target="editTarget" />
    <ContainerFillEditor v-model:open="fillOpen" :container="fillTarget" />
  </section>
</template>
