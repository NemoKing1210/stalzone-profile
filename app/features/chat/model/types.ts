/** One item a tool result or a reference names, as the cards and the modal read it. */
export interface ChatItemView {
  name: string;
  rank: string | null;
  kind: string | null;
  category: string | null;
  icon: string | null;
  /** The catalog row behind the card; both pinning and the item target need it. */
  itemId: number | null;
  /** The owned instance behind the card; null for a catalog row. */
  instanceId: number | null;
  level: number | null;
  qty: number | null;
  virtual: boolean;
  /** Where the instance sits, or the storage name the tool reported. */
  location: string | null;
  weight: number | null;
}
