<script setup lang="ts">
import { useProfileData } from '~/stores/profile-data';
import { ProfilePane } from '~/shared/ui';
import { TAB_STRIP_UI } from '~/shared/lib/tabStrip';

import {
  GUIDE_API,
  GUIDE_CLI,
  GUIDE_MCP,
  GUIDE_PRINCIPLES,
  GUIDE_READ_FLOW,
  GUIDE_SECTIONS,
  GUIDE_SITE,
  GUIDE_SOURCES,
  GUIDE_WRITE_FLOW,
  type GuideApiGroup,
  type GuideApiMethod,
  type GuideCliGroup,
} from '../model/guide';

const { t } = useI18n();
useHead(() => ({ title: `${t('guide.title')} // ${t('common.appName')}` }));

const { payload } = useProfileData();
const { formatDate, num } = useFormat();

/** One section at a time; the strip replaces the old jump links and long scroll. */
const activeTab = ref('site');
const tabItems = computed(() =>
  GUIDE_SECTIONS.map((section) => ({ label: t(section.titleKey), icon: section.icon, value: section.id })),
);

/** Static counts describe the reference; the live strip describes this profile. */
const heroStats = computed(() => [
  { key: 'pages', label: t('guide.stats.pages'), value: GUIDE_SITE.length },
  { key: 'endpoints', label: t('guide.stats.endpoints'), value: GUIDE_API.length },
  { key: 'tools', label: t('guide.stats.tools'), value: GUIDE_MCP.length },
  { key: 'sources', label: t('guide.stats.sources'), value: GUIDE_SOURCES.length },
]);

const catalogItems = computed(() => {
  const items = payload.value?.catalog.meta.items;
  return typeof items === 'number' ? items : null;
});

const liveStats = computed(() => {
  const data = payload.value;
  const owned = data
    ? data.weapons.length + data.armor.length + data.containers.length + data.artifacts.length
    : null;
  return [
    { key: 'owned', label: t('guide.live.owned'), value: owned == null ? '—' : num(owned) },
    { key: 'catalog', label: t('guide.live.catalog'), value: catalogItems.value == null ? '—' : num(catalogItems.value) },
    {
      key: 'updated',
      label: t('guide.live.updated'),
      value: formatDate(data?.freshness.dataUpdated),
    },
  ];
});

const API_GROUPS: { id: GuideApiGroup; color: string }[] = [
  { id: 'auth', color: 'var(--sz-text-dim)' },
  { id: 'read', color: 'var(--sz-info)' },
  { id: 'write', color: 'var(--sz-accent)' },
  { id: 'admin', color: 'var(--sz-warning)' },
];

const apiGroups = computed(() =>
  API_GROUPS.map((group) => ({
    ...group,
    endpoints: GUIDE_API.filter((endpoint) => endpoint.group === group.id),
  })),
);

const mcpGroups = computed(() => [
  { id: 'read', titleKey: 'guide.mcp.readTitle', tools: GUIDE_MCP.filter((tool) => tool.access === 'read') },
  { id: 'write', titleKey: 'guide.mcp.writeTitle', tools: GUIDE_MCP.filter((tool) => tool.access === 'write') },
]);

const MCP_POLICY_KEYS = [
  'guide.mcp.policy.dryRun',
  'guide.mcp.policy.confirm',
  'guide.mcp.policy.rate',
  'guide.mcp.policy.rebuild',
] as const;

const CLI_GROUPS: GuideCliGroup[] = ['dev', 'data', 'mcp', 'quality'];
const cliGroups = computed(() =>
  CLI_GROUPS.map((id) => ({ id, commands: GUIDE_CLI.filter((command) => command.group === id) })),
);

const SOURCE_STATUSES = ['ok', 'stale', 'error', 'idle'] as const;
const STATUS_COLOR: Record<(typeof SOURCE_STATUSES)[number], string> = {
  ok: 'var(--sz-success)',
  stale: 'var(--sz-warning)',
  error: 'var(--sz-danger)',
  idle: 'var(--sz-text-dim)',
};

const METHOD_CLASS: Record<GuideApiMethod, string> = {
  GET: 'border-[var(--sz-info)] text-[var(--sz-info)]',
  POST: 'border-[var(--sz-accent)] text-[var(--sz-accent)]',
  PUT: 'border-[var(--sz-accent)] text-[var(--sz-accent)]',
  PATCH: 'border-[var(--sz-accent)] text-[var(--sz-accent)]',
  DELETE: 'border-[var(--sz-danger)] text-[var(--sz-danger-text)]',
};

function sectionKey(sectionId: string, part: 'hintKey' | 'introKey'): string {
  return GUIDE_SECTIONS.find((section) => section.id === sectionId)?.[part] ?? '';
}

function sectionHint(sectionId: string, count?: number): string {
  const key = sectionKey(sectionId, 'hintKey');
  return count == null ? t(key) : t(key, { count });
}

function sectionIntro(sectionId: string): string {
  return t(sectionKey(sectionId, 'introKey'));
}

function flowArrow(index: number, length: number): boolean {
  return index < length - 1;
}
</script>

<template>
  <section class="space-y-4">
    <header class="border border-[var(--sz-border)] bg-[var(--sz-surface)]">
      <div class="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
        <div class="min-w-0 max-w-3xl">
          <h1>{{ t('guide.title') }}</h1>
          <p class="mt-2 text-[13px] leading-relaxed text-[var(--sz-text-muted)]">{{ t('guide.subtitle') }}</p>
          <p class="mt-2 text-[12px] leading-relaxed text-[var(--sz-text-dim)]">{{ t('guide.lead') }}</p>
        </div>

        <dl class="grid w-full grid-cols-2 gap-px border border-[var(--sz-border)] bg-[var(--sz-border)] sm:w-auto sm:min-w-[22rem]">
          <div v-for="stat in heroStats" :key="stat.key" class="bg-[var(--sz-surface-alt)] px-3.5 py-3.5">
            <dt class="sz-caps text-[var(--sz-text-muted)]">{{ stat.label }}</dt>
            <dd class="font-display text-[26px] leading-none tabular-nums text-[var(--sz-accent)]">{{ stat.value }}</dd>
          </div>
        </dl>
      </div>
    </header>

    <ProfilePane :title="t('guide.live.title')" dense>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <div v-for="stat in liveStats" :key="stat.key" class="min-w-0">
          <dt class="sz-caps text-[var(--sz-text-muted)]">{{ stat.label }}</dt>
          <dd
            class="mt-0.5 truncate text-[14px] tabular-nums"
            :class="stat.value === '—' ? 'text-[var(--sz-text-dim)]' : 'text-[var(--sz-text)]'"
          >
            {{ stat.value }}
          </dd>
        </div>
      </dl>
    </ProfilePane>

    <h2 class="sr-only">{{ t('guide.tabs.label') }}</h2>

    <UTabs
      v-model="activeTab"
      :items="tabItems"
      variant="link"
      :ui="TAB_STRIP_UI"
    >
      <template #content="{ item }">
        <ProfilePane
          v-if="item.value === 'site'"
          :title="t('guide.sections.site.title')"
          :hint="sectionHint('site')"
        >
          <p class="mb-3 text-[12px] leading-relaxed text-[var(--sz-text-muted)]">{{ sectionIntro('site') }}</p>
          <div class="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
        <article
          v-for="page in GUIDE_SITE"
          :key="page.id"
          class="flex min-w-0 flex-col border border-[var(--sz-border)] bg-[var(--sz-surface-alt)]"
        >
          <header class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--sz-border)] bg-[var(--sz-surface-header)] px-2.5 py-1.5">
            <UIcon :name="page.icon" class="size-4 shrink-0 text-[var(--sz-accent)]" />
            <h3 class="sz-caps text-[var(--sz-text)]">{{ t(page.titleKey) }}</h3>
            <code class="ml-auto border border-[var(--sz-border)] px-1 py-0.5 font-mono text-[11px] text-[var(--sz-text-muted)]">
              {{ page.route }}
            </code>
            <span
              v-if="page.kind === 'system'"
              class="border border-[var(--sz-border-strong)] px-1 py-0.5 text-[11px] leading-none text-[var(--sz-text-dim)]"
            >
              {{ t('guide.site.badge.system') }}
            </span>
          </header>

          <div class="flex flex-1 flex-col gap-2 p-2.5">
            <p class="text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">{{ t(page.summaryKey) }}</p>
            <ul class="space-y-1">
              <li
                v-for="capability in page.capabilityKeys"
                :key="capability"
                class="flex min-w-0 gap-1.5 text-[12px] leading-snug text-[var(--sz-text)]"
              >
                <UIcon name="i-lucide-check" class="mt-0.5 size-3 shrink-0 text-[var(--sz-accent)]" />
                <span class="[overflow-wrap:anywhere]">{{ t(capability) }}</span>
              </li>
            </ul>
            <NuxtLink
              :to="page.route"
              class="mt-auto inline-flex items-center gap-1 self-start whitespace-nowrap border border-[var(--sz-border)] px-1.5 py-1 text-[11px] leading-none text-[var(--sz-text-muted)] hover:border-[var(--sz-border-strong)] hover:bg-[var(--sz-surface)] hover:text-[var(--sz-text)]"
            >
              {{ t('guide.site.open') }}
              <UIcon name="i-lucide-arrow-up-right" class="size-3" />
            </NuxtLink>
          </div>
        </article>
      </div>
        </ProfilePane>

        <ProfilePane
          v-if="item.value === 'flow'"
          :title="t('guide.sections.flow.title')"
          :hint="sectionHint('flow')"
        >
          <p class="mb-3 text-[12px] leading-relaxed text-[var(--sz-text-muted)]">{{ sectionIntro('flow') }}</p>
          <div class="space-y-4">
        <section>
          <h3 class="mb-2 flex items-center gap-2 text-[12.5px] font-medium text-[var(--sz-text-muted)]">
            <span class="h-2 w-2 shrink-0" :style="{ background: 'var(--sz-info)' }" />
            {{ t('guide.flow.readTitle') }}
          </h3>
          <ol class="flex flex-col gap-1.5 xl:flex-row xl:items-stretch">
            <li
              v-for="(step, index) in GUIDE_READ_FLOW"
              :key="step.id"
              class="flex min-w-0 flex-1 flex-col gap-1.5 xl:flex-row xl:items-center"
            >
              <article class="flex h-full min-w-0 flex-1 flex-col border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] p-2.5">
                <div class="flex items-center gap-1.5">
                  <span class="font-display text-[15px] leading-none tabular-nums text-[var(--sz-accent)]">
                    {{ index + 1 }}
                  </span>
                  <UIcon :name="step.icon" class="size-4 shrink-0 text-[var(--sz-text-muted)]" />
                  <h4 class="min-w-0 text-[12.5px] font-medium text-[var(--sz-text)]">
                    {{ t(step.titleKey) }}
                  </h4>
                </div>
                <p class="mt-1.5 text-[12px] leading-relaxed text-[var(--sz-text-muted)]">{{ t(step.textKey) }}</p>
                <div class="mt-2 flex flex-wrap gap-1">
                  <code
                    v-for="chip in step.chips"
                    :key="chip"
                    class="border border-[var(--sz-border)] px-1 py-0.5 font-mono text-[11px] text-[var(--sz-text-dim)]"
                  >
                    {{ chip }}
                  </code>
                </div>
              </article>
              <UIcon
                v-if="flowArrow(index, GUIDE_READ_FLOW.length)"
                name="i-lucide-arrow-right"
                class="size-4 shrink-0 self-center text-[var(--sz-text-dim)] max-xl:rotate-90"
                :aria-label="t('guide.flow.arrow')"
              />
            </li>
          </ol>
        </section>

        <section>
          <h3 class="mb-2 flex items-center gap-2 text-[12.5px] font-medium text-[var(--sz-text-muted)]">
            <span class="h-2 w-2 shrink-0" :style="{ background: 'var(--sz-accent)' }" />
            {{ t('guide.flow.writeTitle') }}
          </h3>
          <ol class="flex flex-col gap-1.5 xl:flex-row xl:items-stretch">
            <li
              v-for="(step, index) in GUIDE_WRITE_FLOW"
              :key="step.id"
              class="flex min-w-0 flex-1 flex-col gap-1.5 xl:flex-row xl:items-center"
            >
              <article class="flex h-full min-w-0 flex-1 flex-col border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] p-2.5">
                <div class="flex items-center gap-1.5">
                  <span class="font-display text-[15px] leading-none tabular-nums text-[var(--sz-accent)]">
                    {{ index + 1 }}
                  </span>
                  <UIcon :name="step.icon" class="size-4 shrink-0 text-[var(--sz-text-muted)]" />
                  <h4 class="min-w-0 text-[12.5px] font-medium text-[var(--sz-text)]">
                    {{ t(step.titleKey) }}
                  </h4>
                </div>
                <p class="mt-1.5 text-[12px] leading-relaxed text-[var(--sz-text-muted)]">{{ t(step.textKey) }}</p>
                <div class="mt-2 flex flex-wrap gap-1">
                  <code
                    v-for="chip in step.chips"
                    :key="chip"
                    class="border border-[var(--sz-border)] px-1 py-0.5 font-mono text-[11px] text-[var(--sz-text-dim)]"
                  >
                    {{ chip }}
                  </code>
                </div>
              </article>
              <UIcon
                v-if="flowArrow(index, GUIDE_WRITE_FLOW.length)"
                name="i-lucide-arrow-right"
                class="size-4 shrink-0 self-center text-[var(--sz-text-dim)] max-xl:rotate-90"
                :aria-label="t('guide.flow.arrow')"
              />
            </li>
          </ol>
        </section>

        <div class="border-l-2 border-[var(--sz-accent)] bg-[var(--sz-surface-alt)] px-3 py-2">
          <p class="text-[12px] text-[var(--sz-text-muted)]">{{ t('guide.flow.layersTitle') }}</p>
          <p class="mt-1 font-mono text-[12px] leading-relaxed text-[var(--sz-text)]">
            {{ t('guide.flow.layersText') }}
          </p>
        </div>
      </div>
        </ProfilePane>

        <ProfilePane
          v-if="item.value === 'api'"
          :title="t('guide.sections.api.title')"
          :hint="sectionHint('api', GUIDE_API.length)"
        >
          <p class="mb-3 text-[12px] leading-relaxed text-[var(--sz-text-muted)]">{{ sectionIntro('api') }}</p>
          <p class="mb-3 text-[12px] leading-relaxed text-[var(--sz-text-muted)]">{{ t('guide.api.note') }}</p>
      <div class="space-y-3">
        <section v-for="group in apiGroups" :key="group.id">
          <h3 class="mb-1.5 flex items-center gap-2 text-[12.5px] font-medium text-[var(--sz-text-muted)]">
            <span class="h-2 w-2 shrink-0" :style="{ background: group.color }" />
            {{ t(`guide.api.groups.${group.id}`) }}
            <span class="ml-auto tabular-nums text-[var(--sz-text-dim)]">{{ group.endpoints.length }}</span>
          </h3>
          <ul class="border border-[var(--sz-border)]">
            <li
              v-for="endpoint in group.endpoints"
              :key="`${endpoint.method} ${endpoint.path}`"
              class="grid gap-x-3 gap-y-1 border-b border-[var(--sz-border)] px-2 py-1.5 last:border-b-0 sm:grid-cols-[4.5rem_minmax(0,18rem)_minmax(0,1fr)] sm:items-baseline"
            >
              <span
                class="inline-flex w-fit border px-1 py-0.5 font-mono text-[11px] leading-none"
                :class="METHOD_CLASS[endpoint.method]"
              >
                {{ endpoint.method }}
              </span>
              <code class="min-w-0 font-mono text-[11.5px] text-[var(--sz-text)] [overflow-wrap:anywhere]">
                {{ endpoint.path }}
              </code>
              <span class="min-w-0 text-[12px] leading-snug text-[var(--sz-text-muted)]">
                {{ t(endpoint.descriptionKey) }}
                <span
                  v-if="endpoint.publicAccess"
                  class="ml-1 inline-block border border-[var(--sz-border-strong)] px-1 text-[11px] leading-[1.4] text-[var(--sz-text-dim)]"
                >
                  {{ t('guide.api.public') }}
                </span>
              </span>
            </li>
          </ul>
        </section>
      </div>
        </ProfilePane>

        <ProfilePane
          v-if="item.value === 'mcp'"
          :title="t('guide.sections.mcp.title')"
          :hint="sectionHint('mcp', GUIDE_MCP.length)"
        >
          <p class="mb-3 text-[12px] leading-relaxed text-[var(--sz-text-muted)]">{{ sectionIntro('mcp') }}</p>
          <div class="grid gap-3 lg:grid-cols-2">
        <section v-for="group in mcpGroups" :key="group.id">
          <h3 class="mb-1.5 flex items-center gap-2 text-[12.5px] font-medium text-[var(--sz-text-muted)]">
            <span
              class="h-2 w-2 shrink-0"
              :style="{ background: group.id === 'read' ? 'var(--sz-info)' : 'var(--sz-accent)' }"
            />
            {{ t(group.titleKey) }}
            <span class="ml-auto tabular-nums text-[var(--sz-text-dim)]">{{ group.tools.length }}</span>
          </h3>
          <ul class="border border-[var(--sz-border)]">
            <li
              v-for="tool in group.tools"
              :key="tool.name"
              class="flex flex-col gap-0.5 border-b border-[var(--sz-border)] px-2 py-1.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-2"
            >
              <code class="shrink-0 font-mono text-[11.5px] text-[var(--sz-text)] sm:w-40">{{ tool.name }}</code>
              <span class="min-w-0 text-[12px] leading-snug text-[var(--sz-text-muted)]">{{ t(tool.descriptionKey) }}</span>
            </li>
          </ul>
        </section>
      </div>

      <div class="mt-3 border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] p-2.5">
        <h3 class="mb-1.5 flex items-center gap-2 text-[12.5px] font-medium text-[var(--sz-text-muted)]">
          <UIcon name="i-lucide-shield-check" class="size-4 text-[var(--sz-accent)]" />
          {{ t('guide.mcp.policyTitle') }}
        </h3>
        <ul class="space-y-1">
          <li
            v-for="policyKey in MCP_POLICY_KEYS"
            :key="policyKey"
            class="flex min-w-0 gap-2 text-[12px] leading-relaxed text-[var(--sz-text-muted)]"
          >
            <span class="mt-[0.6em] h-px w-2.5 shrink-0 bg-[var(--sz-border-strong)]" />
            <span class="[overflow-wrap:anywhere]">{{ t(policyKey) }}</span>
          </li>
        </ul>
      </div>
        </ProfilePane>

        <ProfilePane
          v-if="item.value === 'cli'"
          :title="t('guide.sections.cli.title')"
          :hint="sectionHint('cli')"
        >
          <p class="mb-3 text-[12px] leading-relaxed text-[var(--sz-text-muted)]">{{ sectionIntro('cli') }}</p>
          <div class="space-y-3">
        <section v-for="group in cliGroups" :key="group.id">
          <h3 class="mb-1.5 text-[12.5px] font-medium text-[var(--sz-text-muted)]">{{ t(`guide.cli.groups.${group.id}`) }}</h3>
          <ul class="border border-[var(--sz-border)]">
            <li
              v-for="command in group.commands"
              :key="command.display"
              class="grid gap-x-3 gap-y-0.5 border-b border-[var(--sz-border)] px-2 py-1.5 last:border-b-0 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] sm:items-baseline"
            >
              <code class="min-w-0 font-mono text-[11.5px] text-[var(--sz-text)] [overflow-wrap:anywhere]">
                {{ command.display }}
              </code>
              <span class="min-w-0 text-[12px] leading-snug text-[var(--sz-text-muted)]">
                {{ t(command.descriptionKey) }}
                <span
                  v-if="command.danger"
                  class="ml-1 inline-block border border-[var(--sz-danger)] px-1 text-[11px] leading-[1.4] text-[var(--sz-danger-text)]"
                >
                  {{ t('guide.cli.danger') }}
                </span>
              </span>
            </li>
          </ul>
        </section>
      </div>
      <p class="mt-2 text-[12px] leading-relaxed text-[var(--sz-text-dim)]">{{ t('guide.cli.note') }}</p>
        </ProfilePane>

        <ProfilePane
          v-if="item.value === 'sources'"
          :title="t('guide.sections.sources.title')"
          :hint="sectionHint('sources')"
        >
          <p class="mb-3 text-[12px] leading-relaxed text-[var(--sz-text-muted)]">{{ sectionIntro('sources') }}</p>
          <div
            class="hidden gap-x-3 border border-[var(--sz-border)] bg-[var(--sz-surface-header)] px-2 py-1 sm:grid sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,15rem)]"
          >
        <span class="sz-caps text-[var(--sz-text-muted)]">{{ t('guide.sources.columns.source') }}</span>
        <span class="sz-caps text-[var(--sz-text-muted)]">{{ t('guide.sources.columns.updates') }}</span>
        <span class="sz-caps text-[var(--sz-text-muted)]">{{ t('guide.sources.columns.trigger') }}</span>
      </div>
      <ul class="border border-t-0 border-[var(--sz-border)] sm:border-t">
        <li
          v-for="source in GUIDE_SOURCES"
          :key="source.id"
          class="grid gap-x-3 gap-y-1 border-b border-[var(--sz-border)] px-2 py-2 last:border-b-0 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,15rem)]"
        >
          <div class="flex min-w-0 flex-wrap items-center gap-1.5">
            <span class="sz-caps text-[var(--sz-text)]">{{ t(`sources.${source.id}`) }}</span>
            <span
              v-if="source.optIn"
              class="border border-[var(--sz-warning)] px-1 text-[11px] leading-[1.4] text-[var(--sz-warning-text)]"
            >
              {{ t('guide.sources.optIn') }}
            </span>
            <code class="font-mono text-[11px] text-[var(--sz-text-dim)]">{{ source.id }}</code>
          </div>
          <span class="min-w-0 text-[12px] leading-snug text-[var(--sz-text)]">{{ t(source.updatesKey) }}</span>
          <span class="min-w-0 text-[12px] leading-snug text-[var(--sz-text-muted)]">{{ t(source.triggerKey) }}</span>
        </li>
      </ul>

      <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          v-for="status in SOURCE_STATUSES"
          :key="status"
          class="inline-flex items-center gap-1.5 text-[11px] text-[var(--sz-text-muted)]"
        >
          <span class="h-2 w-2 shrink-0" :style="{ background: STATUS_COLOR[status] }" />
          {{ t(`sources.status.${status}`) }}
        </span>
      </div>
      <p class="mt-2 text-[12px] leading-relaxed text-[var(--sz-text-muted)]">{{ t('guide.sources.note') }}</p>
        </ProfilePane>

        <ProfilePane
          v-if="item.value === 'principles'"
          :title="t('guide.sections.principles.title')"
          :hint="sectionHint('principles')"
        >
          <p class="mb-3 text-[12px] leading-relaxed text-[var(--sz-text-muted)]">{{ sectionIntro('principles') }}</p>
          <div class="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
        <article
          v-for="principle in GUIDE_PRINCIPLES"
          :key="principle.id"
          class="flex min-w-0 gap-2 border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] p-2.5"
        >
          <UIcon :name="principle.icon" class="mt-0.5 size-4 shrink-0 text-[var(--sz-accent)]" />
          <div class="min-w-0">
            <h3 class="text-[12.5px] font-medium text-[var(--sz-text)]">
              {{ t(principle.titleKey) }}
            </h3>
            <p class="mt-1 text-[12px] leading-relaxed text-[var(--sz-text-muted)]">{{ t(principle.textKey) }}</p>
          </div>
        </article>
      </div>

      <div class="mt-3 border border-dashed border-[var(--sz-border-strong)] bg-[var(--sz-surface)] px-3 py-2.5">
        <p class="flex items-center gap-2 text-[12px] text-[var(--sz-accent)]">
          <UIcon name="i-lucide-file-check-2" class="size-4" />
          {{ t('guide.keep.title') }}
        </p>
        <p class="mt-1 text-[12px] leading-relaxed text-[var(--sz-text-muted)]">{{ t('guide.keep.text') }}</p>
      </div>
        </ProfilePane>
      </template>
    </UTabs>
  </section>
</template>
