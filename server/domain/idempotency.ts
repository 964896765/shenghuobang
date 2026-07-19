export class IdempotencyRegistry<T> {
  private readonly values = new Map<string, T>();

  run(key: string, create: () => T): { value: T; created: boolean } {
    const existing = this.values.get(key);
    if (existing !== undefined) return { value: existing, created: false };
    const value = create();
    this.values.set(key, value);
    return { value, created: true };
  }
}
