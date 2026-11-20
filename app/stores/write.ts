import { useMutation } from '@pinia/colada';
import { defineStore } from 'pinia';
import type { WriteResult } from '@profile/shared/contracts';

import { useProfileStore } from './profile';

interface WriteOptions {
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  silent?: boolean;
  reconcile?: 'await' | 'none';
}

interface WriteVariables {
  url: string;
  options: WriteOptions;
}

interface ApiErrorData {
  error?: { code?: string; message?: string; details?: { suggestions?: string[] } };
}

export interface WriteErrorInfo {
  code?: string;
  message?: string;
}

/**
 * The one write path for the app. Screens call `useWrite()`, which is this store:
 * one Pinia Colada mutation, one toast policy and one profile invalidation rule.
 */
export const useWriteStore = defineStore('write', () => {
  const toast = useToast();
  const { t } = useI18n();
  const { message: apiMessage } = useApiError();
  const profile = useProfileStore();
  const lastError = ref<WriteErrorInfo | null>(null);

  const mutation = useMutation({
    mutation: ({ url, options }: WriteVariables) =>
      $fetch<WriteResult>(url, {
        method: options.method,
        body: options.body,
      }),
  });

  async function write<T = WriteResult>(url: string, options: WriteOptions): Promise<T | null> {
    lastError.value = null;
    try {
      const result = await mutation.mutateAsync({ url, options });
      const writeResult = result as unknown as WriteResult;
      if (writeResult?.dryRun) {
        toast.add({
          title: t('common.dryRunTitle'),
          description: writeResult.diff.human,
          color: 'info',
          icon: 'i-lucide-eye',
        });
      } else {
        if (!options.silent) {
          toast.add({
            title: t('common.changeWritten'),
            description: writeResult?.diff?.human,
            color: 'success',
            icon: 'i-lucide-check',
          });
        }
        if (options.reconcile !== 'none') await profile.invalidate();
      }
      return result as T;
    } catch (error) {
      const data = (error as { data?: ApiErrorData }).data;
      lastError.value = { code: data?.error?.code, message: data?.error?.message };
      const suggestions = data?.error?.details?.suggestions;
      const message = apiMessage(data?.error?.code, data?.error?.message);
      toast.add({
        title: t('common.notSaved'),
        description: suggestions?.length
          ? `${message} ${t('common.similar', { list: suggestions.join(', ') })}`
          : message,
        color: 'error',
        icon: 'i-lucide-triangle-alert',
      });
      return null;
    }
  }

  return { write, busy: computed(() => mutation.isLoading.value), lastError };
});
