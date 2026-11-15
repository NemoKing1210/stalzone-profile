<script setup lang="ts">
useHead({ title: 'Настройки — STALZONE Dossier' });

const { payload, meta } = useDossier();
const { formatAge, formatDate } = useFormat();

const SOURCE_LABELS: Record<string, string> = {
  exbo_base: 'База EXBO',
  wiki: 'stalzone.wiki',
  scpmodel: 'Аукцион (scpmodel)',
  profile: 'Профиль игрока',
  motifs: 'Облики',
  local: 'Локальные данные',
};

const sources = computed(() => payload.value?.freshness.sources ?? []);
const catalogMeta = computed(() => meta.value?.catalogMeta ?? {});
const metaInfo = computed(() => payload.value?.meta ?? {});
const catalogUpdated = computed(() =>
  typeof catalogMeta.value.updated === 'string' ? catalogMeta.value.updated : null,
);
const catalogSource = computed(() =>
  typeof catalogMeta.value.source === 'string' ? catalogMeta.value.source : null,
);
const profileFetched = computed(() =>
  typeof metaInfo.value.statsFetched === 'string' ? metaInfo.value.statsFetched : null,
);

const sourceColumns = [
  { accessorKey: 'id', header: 'Источник' },
  { accessorKey: 'status', header: 'Статус' },
  { accessorKey: 'lastOkAt', header: 'Последний успех' },
  { accessorKey: 'lastTryAt', header: 'Последняя попытка' },
  { accessorKey: 'lastError', header: 'Ошибка' },
];

const statusColor: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  ok: 'success',
  stale: 'warning',
  error: 'error',
  idle: 'neutral',
};

function sourceLabel(id: string): string {
  return SOURCE_LABELS[id] ?? id;
}

function statusLabel(status: string): string {
  if (status === 'ok') return 'ок';
  if (status === 'stale') return 'устарело';
  if (status === 'error') return 'ошибка';
  return 'не запускался';
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Настройки</h1>
        <p class="text-sm text-muted">Состояние источников, выгрузка и обслуживание базы</p>
      </div>
      <FreshnessBadge
        :data-updated="payload?.freshness.dataUpdated"
        :prices-age-min="payload?.freshness.pricesAgeMin"
      />
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-cloud-download" class="size-5 text-primary" />
            <h2 class="font-medium">Источники данных</h2>
          </div>
          <div class="flex flex-wrap gap-1">
            <UTooltip
              v-for="source in sources"
              :key="source.id"
              text="Ручная синхронизация подключается вместе с адаптерами источников"
            >
              <UButton
                :label="sourceLabel(source.id)"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="outline"
                size="xs"
                disabled
              />
            </UTooltip>
          </div>
        </div>
      </template>

      <UTable v-if="sources.length" :data="sources" :columns="sourceColumns">
        <template #id-cell="{ row }">
          <span class="font-medium">{{ sourceLabel(row.original.id) }}</span>
          <span class="block text-xs text-muted">{{ row.original.id }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="statusColor[row.original.status] ?? 'neutral'" variant="subtle">
            {{ statusLabel(row.original.status) }}
          </UBadge>
        </template>
        <template #lastOkAt-cell="{ row }">
          {{ formatDate(row.original.lastOkAt) }}
        </template>
        <template #lastTryAt-cell="{ row }">
          {{ formatDate(row.original.lastTryAt) }}
        </template>
        <template #lastError-cell="{ row }">
          <span class="text-xs text-error">{{ row.original.lastError ?? '—' }}</span>
        </template>
      </UTable>
      <div v-else class="p-4">
        <UEmpty
          icon="i-lucide-cloud-off"
          title="Источники не зарегистрированы"
          description="Выполните миграции и импорт, чтобы создать записи источников."
        />
      </div>
    </UCard>

    <div class="grid gap-4 lg:grid-cols-2">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-file-down" class="size-5 text-primary" />
            <h2 class="font-medium">Выгрузка досье</h2>
          </div>
        </template>
        <p class="text-sm text-muted">
          JSON в формате исходного досье: персонаж, снаряжение, каталог, карточки, сборки и рекомендации.
        </p>
        <div class="mt-3">
          <UButton
            to="/api/v1/admin/export"
            external
            icon="i-lucide-download"
            color="neutral"
            variant="outline"
            label="Скачать JSON"
          />
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-database-backup" class="size-5 text-primary" />
            <h2 class="font-medium">Резервные копии</h2>
          </div>
        </template>
        <p class="text-sm text-muted">
          SQLite хранится в одном файле. Резервная копия снимается командой <code>npm run backup</code> без остановки
          сервера; хранится 14 дней. Восстановление — по RUNBOOK на копии базы.
        </p>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-info" class="size-5 text-primary" />
            <h2 class="font-medium">Данные</h2>
          </div>
        </template>
        <dl class="space-y-2 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-muted">Досье обновлено</dt>
            <dd>{{ formatDate(payload?.freshness.dataUpdated) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted">Цены</dt>
            <dd>{{ formatAge(payload?.freshness.pricesAgeMin) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted">Каталог обновлён</dt>
            <dd>{{ formatDate(catalogUpdated) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted">Источник каталога</dt>
            <dd class="text-right">{{ catalogSource ?? '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted">Снимок профиля</dt>
            <dd>{{ formatDate(profileFetched) }}</dd>
          </div>
        </dl>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-lock" class="size-5 text-primary" />
            <h2 class="font-medium">Доступ</h2>
          </div>
        </template>
        <p class="text-sm text-muted">
          Сайт закрыт паролем: сессия хранится в HttpOnly-cookie, изменения принимаются только с этого домена.
          Пароль задаётся в <code>NUXT_PASSWORD_HASH</code> (scrypt) или <code>NUXT_PASSWORD</code> для локальной
          разработки. Секреты не хранятся в репозитории.
        </p>
      </UCard>
    </div>
  </section>
</template>
