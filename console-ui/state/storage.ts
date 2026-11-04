export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** `localStorage`, or `null` where reading it throws (blocked site data, a sandboxed frame) or it does not exist. */
export const browserStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export const readJson = (storage: StorageLike | null, key: string): unknown => {
  try {
    const raw = storage?.getItem(key);

    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
};

/** Returns whether the value was stored; a full quota or blocked storage leaves it in memory only. */
export const writeJson = (storage: StorageLike | null, key: string, value: unknown): boolean => {
  try {
    if (!storage) return false;

    storage.setItem(key, JSON.stringify(value));

    return true;
  } catch {
    return false;
  }
};
