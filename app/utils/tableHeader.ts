import { h } from 'vue';
import { UButton } from '#components';

interface SortableColumn {
  getIsSorted: () => false | 'asc' | 'desc';
  getToggleSortingHandler: () => ((event: Event) => void) | undefined;
}

/** Header button for a UTable column with `enableSorting: true`. */
export function sortableHeader(label: string) {
  return ({ column }: { column: SortableColumn }) => {
    const sorted = column.getIsSorted();
    return h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      size: 'sm',
      class: '-mx-2.5',
      label,
      icon:
        sorted === 'asc'
          ? 'i-lucide-arrow-up'
          : sorted === 'desc'
            ? 'i-lucide-arrow-down'
            : 'i-lucide-chevrons-up-down',
      onClick: column.getToggleSortingHandler(),
    });
  };
}
