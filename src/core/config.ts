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

export interface D0Config {
  theme: Theme;
  outputFormat: OutputFormat;
  keybindings: Keybindings;
  defaultBundles: string[];
  registryUrl: string;
  /** Origin for `searchIndexPath` on registry entries (static JSON on your CDN, e.g. Vercel). */
  registryIndexBaseUrl: string;
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
  registryUrl: "https://registry.d0.dev",
  registryIndexBaseUrl: "https://reg.document0.com",
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

export async function loadConfig(): Promise<D0Config> {
  const p = configPath();
  if (!existsSync(p)) return { ...defaultConfig, keybindings: { ...defaultKeybindings } };
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
    return { ...defaultConfig, keybindings: { ...defaultKeybindings } };
  }
  if (!isRecord(data)) return { ...defaultConfig, keybindings: { ...defaultKeybindings } };

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

  const registryUrl =
    typeof data.registryUrl === "string" && data.registryUrl.trim()
      ? data.registryUrl.trim()
      : defaultConfig.registryUrl;

  const registryIndexBaseUrl =
    typeof data.registryIndexBaseUrl === "string" && data.registryIndexBaseUrl.trim()
      ? data.registryIndexBaseUrl.trim().replace(/\/+$/, "")
      : defaultConfig.registryIndexBaseUrl;

  return {
    theme,
    outputFormat,
    keybindings,
    defaultBundles,
    registryUrl,
    registryIndexBaseUrl,
  };
}
