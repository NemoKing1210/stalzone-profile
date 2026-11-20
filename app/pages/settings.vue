<script setup lang="ts">
import { CleanupPanel } from '~/features/cleanup';
import { EventLog } from '~/features/events';
import { SettingsPage } from '~/features/settings';

const TAB_IDS = ['appearance', 'sources', 'assistant', 'data', 'journal', 'cleanup', 'logging'] as const;
const route = useRoute();
const router = useRouter();
const requested = typeof route.query.tab === 'string' ? route.query.tab : '';
const activeTab = ref<string>((TAB_IDS as readonly string[]).includes(requested) ? requested : 'appearance');

watch(activeTab, (value) => {
  router.replace({ query: { ...route.query, tab: value } });
});
</script>

<template>
  <SettingsPage v-model:tab="activeTab">
    <template #journal>
      <EventLog />
    </template>
    <template #cleanup>
      <CleanupPanel />
    </template>
  </SettingsPage>
</template>
