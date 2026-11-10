export interface Repository<T extends { id: string }> {
  list(): T[];
  save(item: T): void;
  remove(id: string): void;
}

/** Non-persistent repository, used when browser storage is unavailable. */
export function createMemoryRepository<T extends { id: string }>(seed: T[] = []): Repository<T> {
  let items = [...seed];
  return {
    list: () => [...items],
    save(item) {
      items = items.some((i) => i.id === item.id)
        ? items.map((i) => (i.id === item.id ? item : i))
        : [...items, item];
    },
    remove(id) {
      items = items.filter((i) => i.id !== id);
    },
  };
}
