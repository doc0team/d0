import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";
import YAML from "yaml";

export interface Keybindings {
  scroll_down: string;
  scroll_up: string;
  search: string;
  back: string;
  forward: string;
  quit: string;
  top: string;
  bottom: string;
}

export type Theme = "dark" | "light";
export type OutputFormat = "auto" | "json" | "raw" | "rich";

/**
 * Community registry: a single JSON file on GitHub (array or `{ entries: [...] }`) that d0
 * fetches once a day and merges above the built-ins. PRs to the repo are the curation UI.
 * Override with `registryUrl` in ~/.d0rc or `D0_REGISTRY_URL`. Set either to `false` / `""`
 * / `"off"` to disable entirely.
 */
export const DEFAULT_COMMUNITY_REGISTRY_URL =
  "https://raw.githubusercontent.com/doc0team/d0-registry/main/registry.json";

const DISABLE_TOKENS = new Set(["", "false", "off", "disabled", "null", "none", "0"]);

function isDisableToken(raw: string): boolean {
  return DISABLE_TOKENS.has(raw.trim().toLowerCase());
}

export interface D0Config {
  theme: Theme;
  outputFormat: OutputFormat;
  keybindings: Keybindings;
  defaultBundles: string[];
  /**
   * Optional HTTPS URL to a community `registry.json` (array or `{ entries: [...] }`).
   * When set, doc0 fetches it once a day and merges entries below user/installed but above built-ins.
   * Unset = no community registry is ever contacted.
   */
  registryUrl?: string;
}

const defaultKeybindings: Keybindings = {
  scroll_down: "j",
  scroll_up: "k",
  search: "/",
  back: "h",
  forward: "l",
  quit: "q",
  top: "g",
  bottom: "G",
};

export const defaultConfig: D0Config = {
  theme: "dark",
  outputFormat: "auto",
  keybindings: { ...defaultKeybindings },
  defaultBundles: [],
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mergeKeybindings(partial?: Partial<Keybindings>): Keybindings {
  return { ...defaultKeybindings, ...partial };
}

export function configPath(): string {
  return path.join(os.homedir(), ".d0rc");
}

function emptyConfig(): D0Config {
  const registryUrl = resolveRegistryUrl(undefined);
  return {
    ...defaultConfig,
    keybindings: { ...defaultKeybindings },
    ...(registryUrl ? { registryUrl } : {}),
  };
}

export async function loadConfig(): Promise<D0Config> {
  const p = configPath();
  if (!existsSync(p)) {
    return emptyConfig();
  }
  const raw = await readFile(p, "utf8");
  let data: unknown;
  try {
    if (p.endsWith(".yaml") || p.endsWith(".yml")) {
      data = YAML.parse(raw);
    } else {
      try {
        data = JSON.parse(raw);
      } catch {
        data = YAML.parse(raw);
      }
    }
  } catch {
    return emptyConfig();
  }
  if (!isRecord(data)) {
    return emptyConfig();
  }

  const theme = data.theme === "light" ? "light" : "dark";
  const outputFormat =
    data.outputFormat === "json" ||
    data.outputFormat === "raw" ||
    data.outputFormat === "rich" ||
    data.outputFormat === "auto"
      ? data.outputFormat
      : "auto";

  let keybindings = defaultKeybindings;
  if (isRecord(data.keybindings)) {
    keybindings = mergeKeybindings({
      scroll_down: typeof data.keybindings.scroll_down === "string" ? data.keybindings.scroll_down : undefined,
      scroll_up: typeof data.keybindings.scroll_up === "string" ? data.keybindings.scroll_up : undefined,
      search: typeof data.keybindings.search === "string" ? data.keybindings.search : undefined,
      back: typeof data.keybindings.back === "string" ? data.keybindings.back : undefined,
      forward: typeof data.keybindings.forward === "string" ? data.keybindings.forward : undefined,
      quit: typeof data.keybindings.quit === "string" ? data.keybindings.quit : undefined,
      top: typeof data.keybindings.top === "string" ? data.keybindings.top : undefined,
      bottom: typeof data.keybindings.bottom === "string" ? data.keybindings.bottom : undefined,
    });
  }

  const defaultBundles = Array.isArray(data.defaultBundles)
    ? data.defaultBundles.filter((x): x is string => typeof x === "string")
    : [];

  const registryUrl = resolveRegistryUrl(data.registryUrl);

  return {
    theme,
    outputFormat,
    keybindings,
    defaultBundles,
    ...(registryUrl ? { registryUrl } : {}),
  };
}

/**
 * Resolve the effective community registry URL, with precedence:
 *   1. `D0_REGISTRY_URL` env var (including disable tokens → no URL)
 *   2. `registryUrl` in ~/.d0rc (string URL, or `false` / `null` / disable token → no URL)
 *   3. `DEFAULT_COMMUNITY_REGISTRY_URL`
 * Returns `undefined` when explicitly disabled, otherwise a validated `https?://` URL.
 */
function resolveRegistryUrl(configValue: unknown): string | undefined {
  const envRaw = process.env.D0_REGISTRY_URL;
  if (envRaw !== undefined) {
    const env = envRaw.trim();
    if (isDisableToken(env)) return undefined;
    if (/^https?:\/\//i.test(env)) return env;
  }
  if (configValue === false || configValue === null) return undefined;
  if (typeof configValue === "string") {
    const s = configValue.trim();
    if (isDisableToken(s)) return undefined;
    if (/^https?:\/\//i.test(s)) return s;
  }
  return DEFAULT_COMMUNITY_REGISTRY_URL;
}
