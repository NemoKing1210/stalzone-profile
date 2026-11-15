<script setup lang="ts">
definePageMeta({ layout: false });

const route = useRoute();
const state = reactive({ password: '' });
const pending = ref(false);
const error = ref<string | null>(null);

useHead({ title: 'Вход — STALZONE Dossier' });

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
    const message = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
    error.value = message ?? 'Не удалось войти. Проверьте пароль и попробуйте ещё раз.';
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-default p-4">
    <UCard class="w-full max-w-sm">
      <template #header>
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-shield-check" class="size-6 text-primary" />
          <div>
            <h1 class="text-lg font-semibold">STALZONE Dossier</h1>
            <p class="text-sm text-muted">Личное досье. Вход по паролю.</p>
          </div>
        </div>
      </template>

      <UForm :state="state" class="space-y-4" @submit.prevent="submit">
        <UFormField label="Пароль" name="password">
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

        <UButton type="submit" block :loading="pending" :disabled="!state.password">Войти</UButton>
      </UForm>

      <template #footer>
        <p class="text-xs text-muted">
          Доступ только для владельца. Пароль задаётся переменной <code>NUXT_PASSWORD_HASH</code> на сервере.
        </p>
      </template>
    </UCard>
  </div>
</template>
