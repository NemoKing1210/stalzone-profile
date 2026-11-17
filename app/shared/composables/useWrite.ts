import type { WriteDiff, WriteResult } from '@dossier/shared/contracts';

export type { WriteDiff, WriteResult };

interface WriteOptions {
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
}

interface ApiErrorData {
  error?: { code?: string; message?: string; details?: { suggestions?: string[] } };
}

/** Single write path for the edit forms: toast, diff and payload refresh in one place. */
export function useWrite() {
  const toast = useToast();
  const { refresh } = useDossier();
  const { t } = useI18n();
  const { message: apiMessage } = useApiError();
  const busy = ref(false);

  async function write<T = WriteResult>(url: string, options: WriteOptions): Promise<T | null> {
    busy.value = true;
    try {
      const result = await $fetch<T>(url, {
        method: options.method,
        body: options.body,
      });

      const writeResult = result as unknown as WriteResult;
      if (writeResult?.dryRun) {
        toast.add({
          title: t('common.dryRunTitle'),
          description: writeResult.diff.human,
          color: 'info',
          icon: 'i-lucide-eye',
        });
      } else {
        toast.add({
          title: t('common.changeWritten'),
          description: writeResult?.diff?.human,
          color: 'success',
          icon: 'i-lucide-check',
        });
        await refresh();
      }
      return result;
    } catch (error) {
      const data = (error as { data?: ApiErrorData }).data;
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
    } finally {
      busy.value = false;
    }
  }

  return { write, busy };
}
