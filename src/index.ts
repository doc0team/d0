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
import { cmdPublish } from "./commands/publish.js";
import { cmdImport } from "./commands/import.js";
import { cmdMcp } from "./commands/mcp.js";
import { cmdMcpInstall } from "./commands/mcp-install.js";
import { cmdBrowseOpenTui } from "./commands/opentui.js";
import { cmdRegistrySync } from "./commands/registry.js";
import { cmdIngestBundle, cmdIngestRegistryCache, cmdIngestUrl } from "./commands/ingest.js";
import { cmdIndexBuildUrl } from "./commands/index-remote.js";
import { isUrlLike } from "./core/web-docs.js";

const GLOBAL = new Set([
  "add",
  "remove",
  "update",
  "init",
  "build",
  "publish",
  "import",
  "mcp",
  "ls",
  "read",
  "search",
  "browse",
  "browse-opentui",
  "registry",
  "ingest",
  "index",
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
    if (!sub || sub.startsWith("-")) {
      await cmdReadUrl(pkg, { json, raw }, config);
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

  const { rest, json, raw, ink } = splitFlags(argv);
  const [sub, ...tail] = rest;
  if (!sub || sub.startsWith("-")) {
    await cmdBrowse(pkg, config, { ink });
    return;
  }
  if (sub === "browse") {
    await cmdBrowse(pkg, config, { ink });
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
    .name("d0")
    .description("Terminal-native documentation — browse docs in the CLI; same commands for humans and agents.")
    .version("0.1.0")
    .option("--json", "force JSON output where applicable")
    .option("--raw", "force raw markdown output for read");

  program
    .command("add")
    .argument("[bundle]", "registry bundle name (@scope/name) when registry is available")
    .option("--local <path>", "install from a local bundle directory")
    .action(async (bundle: string | undefined, opts: { local?: string }) => {
      await cmdAdd(bundle, opts, config);
    });

  program
    .command("remove")
    .argument("<bundle>", "bundle name or bin alias")
    .action(async (name: string) => {
      await cmdRemove(name);
    });

  program
    .command("update")
    .argument("[bundle]", "optional bundle name")
    .action(async (name: string | undefined) => {
      await cmdUpdate(name, config);
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
    .description("interactive Ink/React TUI for installed bundles or live docs URLs")
    .argument("[target]", "bundle name or docs URL (https://…)")
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
    .command("publish")
    .argument("[dir]", "bundle root", ".")
    .action(async (dir: string) => {
      await cmdPublish(dir);
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
    .description("add d0 to Cursor MCP config (merge into mcp.json)")
    .option("--project", "write .cursor/mcp.json in the current directory instead of ~/.cursor/mcp.json")
    .option("--dry-run", "print merged JSON without writing")
    .option("--yes", "replace an existing mcpServers.d0 entry without prompting")
    .action(async (opts: { project?: boolean; dryRun?: boolean; yes?: boolean }) => {
      await cmdMcpInstall({ project: opts.project, dryRun: opts.dryRun, yes: opts.yes });
    });
  mcpCmd.action(async () => {
    await cmdMcp();
  });

  program
    .command("registry")
    .description("registry operations")
    .command("sync")
    .description("refresh global docs registry metadata cache")
    .action(async () => {
      await cmdRegistrySync(config);
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
  ingest
    .command("registry-cache")
    .description("ingest entries from ~/.d0/cache/global-docs-registry.json (not implemented)")
    .option("--json", "JSON output")
    .action(async (opts: { json?: boolean }) => {
      await cmdIngestRegistryCache(opts, config);
    });

  const indexCmd = program.command("index").description("pre-built remote search indexes (CDN-style) for fast MCP search");
  indexCmd
    .command("build-url")
    .description("crawl discovery URLs, build a MiniSearch JSON payload (d0-remote-search-index-v1)")
    .argument("<url>", "docs base URL")
    .requiredOption("--out <file>", "output path for the JSON index file")
    .option("--max-pages <n>", "max pages to include", (v) => Number(v), 500)
    .option("--doc-id <id>", "registry doc id (e.g. stripe)", "")
    .option("--revision <rev>", "revision string for cache busting", "")
    .option("--external", "include off-site URLs from llms.txt when discovering pages")
    .action(
      async (
        url: string,
        opts: { out: string; maxPages?: number; external?: boolean; docId?: string; revision?: string },
      ) => {
        await cmdIndexBuildUrl(url, {
          out: opts.out,
          maxPages: opts.maxPages,
          external: opts.external,
          docId: opts.docId || undefined,
          revision: opts.revision || undefined,
        });
      },
    );

  await program.parseAsync(argv, { from: "user" });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
