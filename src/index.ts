#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig } from "./core/config.js";
import { cmdAdd } from "./commands/add.js";
import { cmdRemove } from "./commands/remove.js";
import { cmdUpdate } from "./commands/update.js";
import { cmdLsGlobal, cmdLsBundle, cmdLsUrl } from "./commands/ls.js";
import { cmdRead, cmdReadUrl } from "./commands/read.js";
import { cmdSearch, cmdSearchUrl } from "./commands/search.js";
import { cmdBrowse, cmdBrowseUrl, cmdBrowseUrlHome } from "./commands/browse.js";
import { cmdInit } from "./commands/init.js";
import { cmdBuild } from "./commands/build.js";
import { cmdImport } from "./commands/import.js";
import { cmdMcp } from "./commands/mcp.js";
import { cmdMcpInstall } from "./commands/mcp-install.js";
import { cmdBrowseOpenTui } from "./commands/opentui.js";
import { cmdIngestBundle, cmdIngestUrl } from "./commands/ingest.js";
import { cmdDoctor } from "./commands/doctor.js";
import { cmdSuggest } from "./commands/suggest.js";
import { cmdRegistrySync, cmdRegistryStatus } from "./commands/registry.js";
import { cmdConfigEdit, cmdConfigPath, cmdConfigShow } from "./commands/config.js";
import { isUrlLike } from "./core/web-docs.js";

const GLOBAL = new Set([
  "add",
  "remove",
  "update",
  "init",
  "build",
  "import",
  "mcp",
  "ls",
  "read",
  "search",
  "browse",
  "browse-opentui",
  "ingest",
  "doctor",
  "suggest",
  "registry",
  "config",
  "help",
  "-h",
  "--help",
  "-V",
  "--version",
  "completion",
]);

function splitFlags(argv: string[]): {
  rest: string[];
  json?: boolean;
  raw?: boolean;
  external?: boolean;
  ink?: boolean;
} {
  const rest: string[] = [];
  let json: boolean | undefined;
  let raw: boolean | undefined;
  let external: boolean | undefined;
  let ink: boolean | undefined;
  for (const a of argv) {
    if (a === "--json") json = true;
    else if (a === "--raw") raw = true;
    else if (a === "--external") external = true;
    else if (a === "--ink") ink = true;
    else rest.push(a);
  }
  return { rest, json, raw, external, ink };
}

async function runBundleCommand(
  pkg: string,
  argv: string[],
  config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> {
  if (isUrlLike(pkg)) {
    const { rest, json, raw, external, ink } = splitFlags(argv);
    const [sub, ...tail] = rest;
    // Bare `doc0 <url>` mirrors `doc0 <bundle>`: open the Ink TUI.
    // Non-TTY stdio falls back inside cmdBrowseUrl with a helpful message.
    if (!sub || sub.startsWith("-")) {
      await cmdBrowseUrl(pkg, { external, ink }, config);
      return;
    }
    if (sub === "browse") {
      await cmdBrowseUrl(pkg, { external, ink }, config);
      return;
    }
    if (sub === "ls") {
      await cmdLsUrl(pkg, { json, raw, external }, config);
      return;
    }
    if (sub === "read") {
      await cmdReadUrl(pkg, { json, raw }, config);
      return;
    }
    if (sub === "search") {
      await cmdSearchUrl(pkg, tail, { json, raw, external }, config);
      return;
    }
    console.error(`Unknown URL command: ${sub}`);
    process.exitCode = 1;
    return;
  }

  const { rest, json, raw, ink, external } = splitFlags(argv);
  const [sub, ...tail] = rest;
  if (!sub || sub.startsWith("-")) {
    await cmdBrowse(pkg, config, { ink, external });
    return;
  }
  if (sub === "browse") {
    await cmdBrowse(pkg, config, { ink, external });
    return;
  }
  if (sub === "ls") {
    await cmdLsBundle(pkg, { json, raw }, config);
    return;
  }
  if (sub === "read") {
    const slug = tail[0];
    await cmdRead(pkg, slug, { json, raw }, config);
    return;
  }
  if (sub === "search") {
    await cmdSearch(pkg, tail, { json, raw }, config);
    return;
  }
  console.error(`Unknown command: ${sub}`);
  process.exitCode = 1;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const config = await loadConfig();

  if (argv.length && !argv[0]!.startsWith("-") && !GLOBAL.has(argv[0]!)) {
    const [pkg, ...rest] = argv;
    await runBundleCommand(pkg!, rest, config);
    return;
  }

  const program = new Command();
  program
    .name("doc0")
    .description("Terminal-native documentation - browse docs in the CLI; same commands for humans and agents.")
    .version("0.1.0")
    .option("--json", "force JSON output where applicable")
    .option("--raw", "force raw markdown output for read");

  program
    .command("add")
    .argument(
      "[target]",
      "path to a docs folder (auto-detects .md/.mdx), existing bundle dir with d0.json, or registry name",
    )
    .option("--local <path>", "install from a local bundle directory (strict: requires d0.json)")
    .option("--name <scoped>", "override the inferred bundle name when adding a raw docs folder")
    .action(async (target: string | undefined, opts: { local?: string; name?: string }) => {
      await cmdAdd(target, opts, config);
    });

  program
    .command("remove")
    .argument("<bundle>", "bundle name or bin alias")
    .action(async (name: string) => {
      await cmdRemove(name);
    });

  program
    .command("update")
    .description("self-update the doc0 CLI to the latest version on npm")
    .option("--check", "only report the latest version; don't install")
    .option("--json", "JSON output")
    .action(async (opts: { check?: boolean; json?: boolean }) => {
      await cmdUpdate(opts);
    });

  program
    .command("ls")
    .description("list installed bundles")
    .argument("[url]", "optionally discover pages from docs URL")
    .option("--json", "JSON output")
    .option("--raw", "ignored for ls")
    .option(
      "--external",
      "with a docs URL: include off-site links from llms.txt (default: same origin only)",
    )
    .action(async (url: string | undefined, opts: { json?: boolean; raw?: boolean; external?: boolean }) => {
      if (url && isUrlLike(url)) {
        await cmdLsUrl(url, { json: opts.json, raw: opts.raw, external: opts.external }, config);
        return;
      }
      await cmdLsGlobal({ json: opts.json, raw: opts.raw }, config);
    });

  program
    .command("read")
    .argument("<url>", "read docs page URL as markdown")
    .option("--json", "JSON output")
    .option("--raw", "raw markdown output")
    .action(async (url: string, opts: { json?: boolean; raw?: boolean }) => {
      await cmdReadUrl(url, { json: opts.json, raw: opts.raw }, config);
    });

  program
    .command("search")
    .argument("<url>", "docs site/page URL")
    .argument("<query...>", "search query")
    .option("--json", "JSON output")
    .option("--raw", "ignored for search")
    .option("--external", "include off-site URLs from llms.txt when building the page set (default: same origin only)")
    .action(async (url: string, query: string[], opts: { json?: boolean; raw?: boolean; external?: boolean }) => {
      await cmdSearchUrl(url, query, { json: opts.json, raw: opts.raw, external: opts.external }, config);
    });

  program
    .command("browse")
    .description(
      "interactive Ink/React TUI - installed bundle, registry id (URL-backed docs), or docs URL",
    )
    .argument("[target]", "bundle name, registry id, or docs URL (https://…)")
    .option("--external", "with a URL: include off-site links when discovering pages")
    .option("--ink", "no-op (kept for CLI compatibility; browse always uses Ink)")
    .action(async (target: string | undefined, opts: { external?: boolean; ink?: boolean }) => {
      const t = target?.trim();
      if (!t) {
        await cmdBrowseUrlHome(opts, config);
        return;
      }
      if (isUrlLike(t)) await cmdBrowseUrl(t, opts, config);
      else await cmdBrowse(t, config, opts);
    });

  program
    .command("browse-opentui")
    .description("experimental secondary TUI powered by OpenTUI (requires Bun)")
    .action(async () => {
      await cmdBrowseOpenTui();
    });

  program
    .command("init")
    .argument("[dir]", "directory to create bundle in", ".")
    .requiredOption("--name <scoped>", 'scoped bundle name, e.g. "@acme/docs"')
    .action(async (dir: string, opts: { name?: string }) => {
      await cmdInit(dir, opts);
    });

  program
    .command("build")
    .argument("[dir]", "bundle root", ".")
    .action(async (dir: string) => {
      await cmdBuild(dir);
    });

  program
    .command("import")
    .argument("<source>", "markdown directory or single .md file")
    .requiredOption("--name <scoped>", 'bundle name, e.g. "@acme/imported"')
    .option("--out <dir>", "output directory for new bundle", "./imported-bundle")
    .action(async (source: string, opts: { name?: string; out?: string }) => {
      await cmdImport(source, opts);
    });

  const mcpCmd = program.command("mcp").description("Model Context Protocol — stdio server or Cursor setup");
  mcpCmd
    .command("install")
    .description("add doc0 as an MCP server to a supported client (Cursor today; more soon)")
    .option("--cursor", "install into Cursor (writes mcp.json)")
    .option("--claude-code", "install into Claude Code (coming soon)")
    .option("--windsurf", "install into Windsurf (coming soon)")
    .option("--list", "print the list of supported/planned clients and exit")
    .option("--project", "for Cursor: write ./.cursor/mcp.json in the current directory instead of ~/.cursor/mcp.json")
    .option("--dry-run", "print merged config without writing")
    .option("--yes", "replace an existing mcpServers.d0 entry without prompting")
    .action(
      async (opts: {
        cursor?: boolean;
        claudeCode?: boolean;
        windsurf?: boolean;
        list?: boolean;
        project?: boolean;
        dryRun?: boolean;
        yes?: boolean;
      }) => {
        const flagged = [
          opts.cursor ? "cursor" : null,
          opts.claudeCode ? "claude-code" : null,
          opts.windsurf ? "windsurf" : null,
        ].filter((c): c is "cursor" | "claude-code" | "windsurf" => c !== null);
        if (flagged.length > 1) {
          console.error(
            `doc0 mcp install: pass only one client flag at a time (got: ${flagged.map((f) => `--${f}`).join(", ")}).`,
          );
          process.exitCode = 1;
          return;
        }
        await cmdMcpInstall({
          client: flagged[0],
          list: opts.list,
          project: opts.project,
          dryRun: opts.dryRun,
          yes: opts.yes,
        });
      },
    );
  mcpCmd
    .option(
      "--installed-only",
      "expose only installed bundles + user-added registry entries (no built-in URL docs)",
    )
    .action(async (opts: { installedOnly?: boolean }) => {
      await cmdMcp({ installedOnly: opts.installedOnly });
    });

  const ingest = program.command("ingest").description("ingest docs into local structured store (~/.d0/docs-store)");
  ingest
    .command("url")
    .argument("<url>", "docs site/page URL")
    .option("--external", "include off-site URLs from llms.txt when discovering pages")
    .option(
      "--max-pages <n>",
      "max pages to fetch after discovery (0 = all discovered; default from D0_INGEST_MAX_PAGES or 50_000)",
      (v) => Number(v),
      50_000,
    )
    .option("--json", "JSON output")
    .action(async (url: string, opts: { external?: boolean; maxPages?: number; json?: boolean }) => {
      await cmdIngestUrl(url, opts, config);
    });
  ingest
    .command("bundle")
    .argument("<bundle>", "installed bundle name")
    .option("--json", "JSON output")
    .action(async (bundle: string, opts: { json?: boolean }) => {
      await cmdIngestBundle(bundle, opts, config);
    });

  program
    .command("doctor")
    .description("verify every registry entry: bundles exist, URLs expose llms.txt/llms-full.txt/sitemap")
    .option("--json", "JSON output")
    .action(async (opts: { json?: boolean }) => {
      await cmdDoctor(opts);
    });

  program
    .command("suggest")
    .description("scan ./package.json dependencies and report which ones have doc0 registry coverage")
    .argument("[dir]", "project directory containing package.json", ".")
    .option("--json", "JSON output")
    .action(async (dir: string, opts: { json?: boolean }) => {
      await cmdSuggest(dir, opts);
    });

  const registryCmd = program
    .command("registry")
    .description("community registry (single JSON file on GitHub; set registryUrl in ~/.d0rc)");
  registryCmd
    .command("sync")
    .description("force-refresh the community registry cache (~/.d0/community-registry.json)")
    .option("--json", "JSON output")
    .action(async (opts: { json?: boolean }) => {
      await cmdRegistrySync(opts, config);
    });
  registryCmd
    .command("status")
    .description("show configured registryUrl and the current cache state")
    .option("--json", "JSON output")
    .action(async (opts: { json?: boolean }) => {
      await cmdRegistryStatus(opts, config);
    });

  const configCmd = program
    .command("config")
    .description("inspect or edit ~/.d0rc (theme, keybindings, registryUrl, …)");
  configCmd
    .command("path")
    .description("print the path to ~/.d0rc and whether it exists")
    .option("--json", "JSON output")
    .action(async (opts: { json?: boolean }) => {
      await cmdConfigPath(opts);
    });
  configCmd
    .command("show")
    .description("print the effective config (file + env overrides, defaults filled in)")
    .option("--json", "JSON output")
    .action(async (opts: { json?: boolean }) => {
      await cmdConfigShow(opts);
    });
  configCmd
    .command("edit")
    .description("open ~/.d0rc in $VISUAL/$EDITOR (creates it from a template if missing)")
    .option("--editor <cmd>", "override $VISUAL/$EDITOR for this invocation")
    .option("--print", "create the file if missing, then just print the path (skip launching the editor)")
    .action(async (opts: { editor?: string; print?: boolean }) => {
      await cmdConfigEdit(opts);
    });

  await program.parseAsync(argv, { from: "user" });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
