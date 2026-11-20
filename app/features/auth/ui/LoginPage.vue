<script setup lang="ts">
import { useMutation } from '@pinia/colada';
import { $fetch as request } from 'ofetch';

const route = useRoute();
const state = reactive({ password: '' });
const error = ref<string | null>(null);
const login = useMutation({
  mutation: (password: string) =>
    request('/api/auth/login', { method: 'POST', body: { password } }),
});
const pending = computed(() => login.isLoading.value);
const { t } = useI18n();
const { message: apiMessage } = useApiError();

useHead(() => ({ title: `${t('auth.pageTitle')} // ${t('common.appName')}` }));

function nextPath(): string {
  const raw = route.query.next;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) return value;
  return '/';
}

async function submit(): Promise<void> {
  if (login.isLoading.value) return;
  error.value = null;
  try {
    await login.mutateAsync(state.password);
    await navigateTo(nextPath(), { external: true });
  } catch (err: unknown) {
    const data =
      err && typeof err === 'object' && 'data' in err
        ? (err as { data?: { error?: { code?: string; message?: string } } }).data
        : undefined;
    error.value = apiMessage(data?.error?.code, data?.error?.message || t('auth.error'));
  }
}
</script>

<template>
  <div class="sz-atmosphere flex min-h-screen items-center justify-center p-4">
    <div class="absolute right-4 top-4">
      <LocaleSwitcher />
    </div>

    <div class="w-full max-w-[360px] border border-[var(--sz-border)] bg-[var(--sz-surface)] p-6">
      <h1 class="min-w-0 break-words font-brand text-[28px] leading-none tracking-[0.12em] text-[var(--sz-text)]">
        {{ t('common.brandLeft') }} <span class="text-[var(--sz-accent)]">//</span> {{ t('common.brandRight') }}
      </h1>
      <p class="mt-1 text-[12px] text-[var(--sz-text-muted)]">{{ t('auth.subtitle') }}</p>

      <UForm :state="state" class="mt-5 space-y-4" @submit.prevent="submit">
        <UFormField :label="t('auth.password')" name="password">
          <UInput
            v-model="state.password"
            type="password"
            autocomplete="current-password"
            autofocus
            class="w-full"
            placeholder="••••••••"
          />
        </UFormField>

        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />

        <UButton type="submit" block :loading="pending" :disabled="!state.password">{{ t('auth.signIn') }}</UButton>
      </UForm>
    </div>
  </div>
</template>

<style scoped>
/* Display heads keep their own wrapping guarantees, whatever the global sheet holds. */
h1 {
  overflow-wrap: break-word;
  min-width: 0;
  text-wrap: balance;
}
</style>
