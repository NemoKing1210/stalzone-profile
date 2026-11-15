export interface WriteDiff {
  before: unknown;
  after: unknown;
  human: string;
}

export interface WriteResult {
  dryRun: boolean;
  diff: WriteDiff;
  eventId?: number;
}

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
          title: 'Пробный прогон',
          description: writeResult.diff.human,
          color: 'info',
          icon: 'i-lucide-eye',
        });
      } else {
        toast.add({
          title: 'Сохранено',
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
      const message = data?.error?.message ?? 'Не удалось сохранить изменения';
      toast.add({
        title: 'Не сохранено',
        description: suggestions?.length ? `${message}. Похожие: ${suggestions.join(', ')}` : message,
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
