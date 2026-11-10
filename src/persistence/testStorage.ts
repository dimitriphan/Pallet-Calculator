/** In-memory Storage fake for tests. Set `failReads` / `failWrites` to simulate broken storage. */
export class FakeStorage implements Storage {
  private data = new Map<string, string>();
  failReads = false;
  failWrites = false;
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    if (this.failReads) throw new Error('read blocked');
    return this.data.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('quota exceeded');
    this.data.set(key, value);
  }
}
