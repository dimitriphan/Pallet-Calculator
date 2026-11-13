export interface Repository<T extends { id: string }> {
  list(): T[];
  /**
   * Saves (adds or replaces) an item. Returns false when the change could not be written to
   * the browser's storage; callers that must not report a save that did not happen check it.
   */
  save(item: T): boolean;
  /** Removes an item. Returns false when the removal could not be written. */
  remove(id: string): boolean;
  /** Re-reads the stored items (e.g. after another tab changed them); list() then returns them. */
  refresh?(): void;
}

/** Non-persistent repository, used when browser storage is unavailable. `onFirstWrite` fires once. */
export function createMemoryRepository<T extends { id: string }>(
  seed: T[] = [],
  onFirstWrite?: () => void,
): Repository<T> {
  let items = [...seed];
  let warned = false;
  const warn = () => {
    if (warned) return;
    warned = true;
    onFirstWrite?.();
  };
  return {
    list: () => [...items],
    save(item) {
      warn();
      items = items.some((i) => i.id === item.id)
        ? items.map((i) => (i.id === item.id ? item : i))
        : [...items, item];
      return true;
    },
    remove(id) {
      warn();
      items = items.filter((i) => i.id !== id);
      return true;
    },
  };
}
