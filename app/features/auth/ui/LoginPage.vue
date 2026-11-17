<script setup lang="ts">
const route = useRoute();
const state = reactive({ password: '' });
const pending = ref(false);
const error = ref<string | null>(null);
const { t } = useI18n();
const { message: apiMessage } = useApiError();

useHead(() => ({ title: `${t('auth.pageTitle')} — ${t('common.appName')}` }));

function nextPath(): string {
  const raw = route.query.next;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) return value;
  return '/';
}

async function submit(): Promise<void> {
  if (pending.value) return;
  pending.value = true;
  error.value = null;
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { password: state.password } });
    await navigateTo(nextPath(), { external: true });
  } catch (err: unknown) {
    const data = (err as { data?: { error?: { code?: string; message?: string } } })?.data?.error;
    error.value = apiMessage(data?.code, data?.message || t('auth.error'));
  } finally {
    pending.value = false;
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
