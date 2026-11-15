<script setup lang="ts">
definePageMeta({ layout: false });

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
  <div class="relative flex min-h-screen items-center justify-center bg-default p-4">
    <div class="absolute right-4 top-4">
      <LocaleSwitcher />
    </div>
    <UCard class="w-full max-w-sm">
      <template #header>
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-shield-check" class="size-6 text-primary" />
          <div>
            <h1 class="text-lg font-semibold">Stalzone Profile</h1>
            <p class="text-sm text-muted">{{ t('auth.subtitle') }}</p>
          </div>
        </div>
      </template>

      <UForm :state="state" class="space-y-4" @submit.prevent="submit">
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

      <template #footer>
        <p class="text-xs text-muted">
          {{ t('auth.footerBefore') }}<code>NUXT_PASSWORD_HASH</code>{{ t('auth.footerAfter') }}
        </p>
      </template>
    </UCard>
  </div>
</template>
