/** Keeps the most recent `limit` items, oldest first. */
export class ReplayBuffer<T> {
  private readonly items: T[] = [];

  private start = 0;

  public constructor(private readonly limit: number) {}

  public push(item: T): void {
    if (this.items.length < this.limit) {
      this.items.push(item);

      return;
    }

    this.items[this.start] = item;
    this.start = (this.start + 1) % this.limit;
  }

  public clear(): void {
    this.items.length = 0;
    this.start = 0;
  }

  public toArray(): T[] {
    return [...this.items.slice(this.start), ...this.items.slice(0, this.start)];
  }

  public get size(): number {
    return this.items.length;
  }
}
