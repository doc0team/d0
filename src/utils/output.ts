import type { D0Config } from "../core/config.js";

export type EffectiveOutput = "json" | "raw" | "rich";

export function isStdoutTty(): boolean {
  return Boolean(process.stdout.isTTY);
}

export function resolveOutputMode(
  config: D0Config,
  opts: { json?: boolean; raw?: boolean },
): EffectiveOutput {
  if (opts.json) return "json";
  if (opts.raw) return "raw";
  if (config.outputFormat === "json") return "json";
  if (config.outputFormat === "raw") return "raw";
  if (config.outputFormat === "rich") return "rich";
  if (config.outputFormat === "auto") {
    return isStdoutTty() ? "rich" : "json";
  }
  return "rich";
}

export function resolveReadOutput(
  config: D0Config,
  opts: { json?: boolean; raw?: boolean },
): "json" | "raw" | "rich" {
  if (opts.json) return "json";
  if (opts.raw) return "raw";
  if (config.outputFormat === "json") return "json";
  if (config.outputFormat === "raw") return "raw";
  if (config.outputFormat === "rich") return "rich";
  if (config.outputFormat === "auto") {
    return isStdoutTty() ? "rich" : "raw";
  }
  return "rich";
}
