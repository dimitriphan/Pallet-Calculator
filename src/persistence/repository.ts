export interface Repository<T extends { id: string }> {
  list(): T[];
  save(item: T): void;
  remove(id: string): void;
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
    },
    remove(id) {
      warn();
      items = items.filter((i) => i.id !== id);
    },
  };
}
