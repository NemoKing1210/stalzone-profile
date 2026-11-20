<script setup lang="ts">
import { changelog } from '../model/changelog';
import { categoryCounts, filterChangelog, groupEntriesByDate, kindsInUse, populatedEntries } from '../model/filter';
import type { CategoryKind, ChangelogEntry } from '../model/parse';
import ChangelogInline from './ChangelogInline.vue';

const { t, locale } = useI18n();
useHead(() => ({ title: `${t('changelog.title')} // ${t('common.appName')}` }));

const query = ref('');
const activeKinds = ref<CategoryKind[]>([]);

const kinds = computed(() => kindsInUse(changelog.entries));
const counts = computed(() => categoryCounts(changelog.entries));
const totalItems = computed(() => Object.values(counts.value).reduce((sum, count) => sum + (count ?? 0), 0));
const totalEntries = computed(() => populatedEntries(changelog.entries).length);
const summary = computed(() => t('changelog.summary', { entries: totalEntries.value, changes: totalItems.value }));
const hasFilters = computed(() => query.value.trim() !== '' || activeKinds.value.length > 0);
const filtered = computed(() => filterChangelog(changelog.entries, { query: query.value, kinds: activeKinds.value }));

const intlLocale = computed(() => (locale.value === 'ru' ? 'ru-RU' : 'en-US'));

const KIND_COLOR: Record<CategoryKind, string> = {
  added: 'var(--sz-success)',
  changed: 'var(--sz-info)',
  removed: 'var(--sz-danger)',
  fixed: 'var(--sz-warning)',
  security: 'var(--sz-rank-veteran)',
  deprecated: 'var(--sz-text-dim)',
  limitations: 'var(--sz-text-muted)',
  other: 'var(--sz-accent)',
};

interface DateParts {
  day: string;
  month: string;
  full: string;
}

/** Split a date into the big day and the month/year line used by the timeline gutter. */
function dateParts(date: string): DateParts {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return { day: '', month: date, full: date };
  const format = (options: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat(intlLocale.value, { ...options, timeZone: 'UTC' }).format(parsed);
  return {
    day: format({ day: '2-digit' }),
    month: format({ month: 'short', year: 'numeric' }),
    full: format({ day: '2-digit', month: 'short', year: 'numeric' }),
  };
}

const timeline = computed(() =>
  groupEntriesByDate(filtered.value).map((group) => ({
    date: group.date,
    parts: group.date ? dateParts(group.date) : null,
    entries: group.entries,
  })),
);

function kindLabel(kind: CategoryKind): string {
  return t(`changelog.kinds.${kind}`);
}

function toggleKind(kind: CategoryKind): void {
  activeKinds.value = activeKinds.value.includes(kind)
    ? activeKinds.value.filter((entry) => entry !== kind)
    : [...activeKinds.value, kind];
}

function resetFilters(): void {
  query.value = '';
  activeKinds.value = [];
}

function entryItemCount(entry: ChangelogEntry): number {
  return entry.sections.reduce((sum, section) => sum + section.items.length, 0);
}
</script>

<template>
  <section class="space-y-3">
    <header class="border border-[var(--sz-border)] border-t-2 border-t-[var(--sz-accent)] bg-[var(--sz-surface)]">
      <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-4 py-3.5 sm:px-5">
        <div class="min-w-0 max-w-3xl">
          <h1>{{ t('changelog.title') }}</h1>
          <p class="mt-1.5 text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">
            {{ t('changelog.subtitle') }}
          </p>
        </div>
        <p
          class="shrink-0 border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2.5 py-1.5 text-[12px] text-[var(--sz-text-muted)]"
        >
          {{ summary }}
        </p>
      </div>
    </header>

    <div
      class="flex flex-wrap items-center gap-x-2 gap-y-2 border border-[var(--sz-border)] bg-[var(--sz-surface)] px-3 py-2 lg:sticky lg:top-0 lg:z-20"
    >
      <div role="group" :aria-label="t('changelog.filters')" class="flex flex-wrap gap-1.5">
        <button
          v-for="kind in kinds"
          :key="kind"
          type="button"
          class="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap border px-2 py-1 text-[11px] leading-none transition-colors sm:min-h-8"
          :class="
            activeKinds.includes(kind)
              ? 'border-[var(--sz-accent)] bg-[var(--sz-surface-alt)] text-[var(--sz-text)]'
              : 'border-[var(--sz-border)] text-[var(--sz-text-muted)] hover:border-[var(--sz-border-strong)] hover:text-[var(--sz-text)]'
          "
          :aria-pressed="activeKinds.includes(kind)"
          @click="toggleKind(kind)"
        >
          <span class="h-2 w-2 shrink-0" :style="{ background: KIND_COLOR[kind] }" />
          {{ kindLabel(kind) }}
          <span class="tabular-nums text-[var(--sz-text-dim)]">{{ counts[kind] ?? 0 }}</span>
        </button>
      </div>

      <UInput
        v-model="query"
        icon="i-lucide-search"
        size="xs"
        class="w-full sm:ml-auto sm:w-64"
        :placeholder="t('changelog.search')"
        :aria-label="t('changelog.search')"
      />
      <UButton
        v-if="hasFilters"
        icon="i-lucide-x"
        size="xs"
        color="neutral"
        variant="ghost"
        :label="t('common.reset')"
        @click="resetFilters"
      />
      <span class="text-[11px] tabular-nums text-[var(--sz-text-muted)]" role="status">
        {{ hasFilters ? t('changelog.results', { shown: filtered.length, total: totalEntries }) : '' }}
      </span>
    </div>

    <div
      v-if="!timeline.length"
      class="border border-dashed border-[var(--sz-border)] bg-[var(--sz-surface)] px-4 py-10 text-center"
    >
      <UIcon name="i-lucide-search-x" class="mx-auto mb-2 size-5 text-[var(--sz-text-dim)]" />
      <p class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('changelog.empty') }}</p>
    </div>

    <ol v-else class="max-w-5xl" :aria-label="t('changelog.title')">
      <li v-for="(group, groupIndex) in timeline" :key="group.date ?? 'unreleased'" class="flex">
        <div class="hidden w-28 shrink-0 pr-4 pt-0.5 text-right sm:block">
          <template v-if="group.parts">
            <time :datetime="group.date!" class="block font-display text-[26px] leading-none text-[var(--sz-text)]">
              {{ group.parts.day }}
            </time>
            <span class="mt-1 block sz-caps text-[var(--sz-text-muted)]">{{ group.parts.month }}</span>
          </template>
          <span v-else class="sz-caps inline-flex items-center gap-1.5 text-[var(--sz-accent)]">
            <span class="size-1.5 shrink-0 bg-[var(--sz-accent)]" />
            {{ t('changelog.unreleased') }}
          </span>
        </div>

        <div class="relative w-6 shrink-0" aria-hidden="true">
          <span
            v-if="groupIndex > 0"
            class="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-[var(--sz-border-strong)]"
          />
          <span
            v-if="groupIndex < timeline.length - 1"
            class="absolute bottom-0 left-1/2 top-3 w-px -translate-x-1/2 bg-[var(--sz-border-strong)]"
          />
          <span
            class="absolute left-1/2 top-3 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border"
            :class="
              group.date
                ? 'border-[var(--sz-border-strong)] bg-[var(--sz-bg)]'
                : 'border-[var(--sz-accent)] bg-[var(--sz-accent)]'
            "
          />
        </div>

        <div class="min-w-0 flex-1 pb-6">
          <div class="mb-2 flex items-center gap-2 sm:hidden">
            <time v-if="group.parts" :datetime="group.date!" class="sz-caps text-[var(--sz-accent)]">
              {{ group.parts.full }}
            </time>
            <span v-else class="sz-caps text-[var(--sz-accent)]">{{ t('changelog.unreleased') }}</span>
            <span class="h-px flex-1 bg-[var(--sz-border)]" />
          </div>

          <div class="space-y-2.5">
            <article
              v-for="entry in group.entries"
              :id="entry.id"
              :key="entry.id"
              class="scroll-mt-14 border bg-[var(--sz-surface)]"
              :class="entry.date ? 'border-[var(--sz-border)]' : 'border-[var(--sz-accent)]'"
            >
              <header
                class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--sz-border)] bg-[var(--sz-surface-header)] px-3 py-2"
              >
                <h2 class="min-w-0 flex-1 text-[15px] leading-tight [overflow-wrap:break-word]">
                  {{ entry.date ? entry.title : t('changelog.unreleased') }}
                </h2>
                <span class="shrink-0 text-[11px] tabular-nums text-[var(--sz-text-muted)]">
                  {{ t('changelog.itemCount', { count: entryItemCount(entry) }) }}
                </span>
              </header>

              <div class="space-y-3.5 p-3">
                <section
                  v-for="(section, index) in entry.sections"
                  :key="`${section.kind}-${index}`"
                  class="border-l-2 pl-2.5"
                  :style="{ borderColor: KIND_COLOR[section.kind] }"
                >
                  <h3 class="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--sz-text-muted)]">
                    <span class="size-1.5 shrink-0" :style="{ background: KIND_COLOR[section.kind] }" />
                    <span class="min-w-0">{{ kindLabel(section.kind) }}</span>
                    <span class="ml-auto tabular-nums text-[var(--sz-text-dim)]">{{ section.items.length }}</span>
                  </h3>
                  <ul class="space-y-1">
                    <li
                      v-for="(item, itemIndex) in section.items"
                      :key="itemIndex"
                      class="-mx-1.5 flex min-w-0 gap-2 px-1.5 py-0.5 text-[13px] leading-relaxed text-[var(--sz-text)] transition-colors hover:bg-[var(--sz-surface-alt)] [overflow-wrap:anywhere]"
                    >
                      <span
                        class="mt-[0.62em] size-1 shrink-0"
                        :style="{ background: KIND_COLOR[section.kind] }"
                        aria-hidden="true"
                      />
                      <ChangelogInline :tokens="item.tokens" />
                    </li>
                  </ul>
                </section>
              </div>

              <footer
                v-if="entry.notes.length"
                class="space-y-1 border-t border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-3 py-2"
              >
                <p
                  v-for="(note, index) in entry.notes"
                  :key="index"
                  class="flex min-w-0 gap-2 text-[12px] italic leading-relaxed text-[var(--sz-text-muted)] [overflow-wrap:anywhere]"
                >
                  <UIcon name="i-lucide-info" class="mt-0.5 size-3.5 shrink-0 text-[var(--sz-text-dim)]" />
                  <ChangelogInline :tokens="note.tokens" />
                </p>
              </footer>
            </article>
          </div>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
/* Display heads keep their own wrapping guarantees, whatever the global sheet holds. */
h1,
h2 {
  overflow-wrap: break-word;
  min-width: 0;
  text-wrap: balance;
}
</style>
