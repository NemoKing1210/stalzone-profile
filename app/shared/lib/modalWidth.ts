/**
 * One place for modal widths. Nuxt UI defaults every modal to `sm:max-w-lg` (512 px),
 * which is too narrow for item details and too wide for a yes/no confirmation.
 */
export const MODAL_WIDTH = {
  /** Confirmation, one-line warning, destructive prompt. */
  narrow: 'sm:max-w-md',
  /** A single form column or a short preview. */
  form: 'sm:max-w-2xl lg:max-w-3xl',
  /** Two-column item forms and the stash manager. */
  wide: 'sm:max-w-4xl lg:max-w-5xl',
  /** Item details, logs and card-heavy bodies. */
  reader: 'sm:max-w-5xl lg:max-w-6xl',
} as const;
