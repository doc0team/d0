import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import { configPath, loadConfig, DEFAULT_COMMUNITY_REGISTRY_URL } from "../core/config.js";

/**
 * `doc0 config path` — print the resolved config path and whether it exists.
 * Useful for piping into editors: `$(doc0 config path)`.
 */
export async function cmdConfigPath(opts: { json?: boolean }): Promise<void> {
  const p = configPath();
  const exists = existsSync(p);
  if (opts.json) {
    console.log(JSON.stringify({ path: p, exists }, null, 2));
    return;
  }
  console.log(p);
}

/**
 * `doc0 config show` — dump the effective config (merged defaults + file + env overrides).
 * This is what the rest of the CLI actually sees, not just what's on disk.
 */
export async function cmdConfigShow(opts: { json?: boolean }): Promise<void> {
  const p = configPath();
  const exists = existsSync(p);
  const config = await loadConfig();

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          path: p,
          exists,
          config,
          defaultRegistryUrl: DEFAULT_COMMUNITY_REGISTRY_URL,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`path       : ${p}`);
  console.log(`exists     : ${exists ? "yes" : "no (using defaults)"}`);
  console.log(`theme      : ${config.theme}`);
  console.log(`output fmt : ${config.outputFormat}`);
  console.log(`registryUrl: ${config.registryUrl ?? "(disabled)"}`);
  const bundles = config.defaultBundles.length === 0 ? "(none)" : config.defaultBundles.join(", ");
  console.log(`default    : ${bundles}`);
  console.log("keybindings:");
  for (const [key, value] of Object.entries(config.keybindings)) {
    console.log(`  ${key.padEnd(12, " ")} ${value}`);
  }
}

/**
 * `doc0 config edit` — open `~/.d0rc` in `$VISUAL` / `$EDITOR`, falling back to a
 * platform-appropriate default. Creates the file with a commented template if missing.
 */
export async function cmdConfigEdit(opts: { editor?: string; print?: boolean }): Promise<void> {
  const p = configPath();

  if (!existsSync(p)) {
    await writeFile(p, defaultConfigTemplate(), "utf8");
    console.log(`doc0 config edit: created ${p}`);
  }

  if (opts.print) {
    console.log(p);
    return;
  }

  const editor = resolveEditor(opts.editor);
  const result = await runEditor(editor, p);
  if (result.code !== 0) {
    console.error(
      `doc0 config edit: editor "${editor}" exited with code ${result.code}. ` +
        `Override with --editor <cmd> or set $VISUAL / $EDITOR.`,
    );
    process.exitCode = result.code || 1;
  }
}

function resolveEditor(override: string | undefined): string {
  if (override && override.trim().length > 0) return override;
  const v = process.env.VISUAL;
  if (v && v.trim().length > 0) return v;
  const e = process.env.EDITOR;
  if (e && e.trim().length > 0) return e;
  return os.platform() === "win32" ? "notepad.exe" : "vi";
}

function runEditor(editor: string, filePath: string): Promise<{ code: number }> {
  return new Promise((resolve) => {
    // Many editor env vars legitimately contain args (e.g. `code --wait`, `emacsclient -nw`).
    // Split on whitespace so `EDITOR="code --wait"` works out of the box.
    const parts = editor.split(/\s+/).filter(Boolean);
    const cmd = parts[0]!;
    const args = [...parts.slice(1), filePath];
    const child = spawn(cmd, args, { stdio: "inherit", shell: os.platform() === "win32" });
    child.on("close", (code) => resolve({ code: code ?? 0 }));
    child.on("error", (err) => {
      console.error(`doc0 config edit: failed to launch "${editor}": ${err.message}`);
      resolve({ code: 1 });
    });
  });
}

function defaultConfigTemplate(): string {
  // YAML so comments survive edits. `loadConfig` accepts JSON or YAML.
  return `# doc0 config — YAML or JSON. See https://github.com/doc0team/d0 for the full schema.

# theme: dark | light
theme: dark

# outputFormat: auto | json | raw | rich
outputFormat: auto

# Community registry (single JSON file on GitHub). Unset or "off" to disable.
# Default: ${DEFAULT_COMMUNITY_REGISTRY_URL}
# registryUrl: ${DEFAULT_COMMUNITY_REGISTRY_URL}

# Bundles to load by default into the TUI's jump menu.
defaultBundles: []

keybindings:
  scroll_down: j
  scroll_up: k
  search: /
  back: h
  forward: l
  quit: q
  top: g
  bottom: G
`;
}
