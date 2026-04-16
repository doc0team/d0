import type { Keybindings } from "../core/config.js";

export function matchesKey(ch: string, key: string, bindings: Keybindings, field: keyof Keybindings): boolean {
  const want = bindings[field];
  if (!want) return false;
  if (want.length === 1) return ch === want;
  return ch === want || key === want;
}
