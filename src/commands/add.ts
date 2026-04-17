import path from "node:path";
import os from "node:os";
import { stat, readFile, readdir, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { loadBundle, BundleError } from "../core/bundle.js";
import { ManifestError, type D0Manifest } from "../core/manifest.js";
import { writeNamedShim } from "../core/named-cli.js";
import { fetchBundleMeta, RegistryError } from "../core/registry-client.js";
import { installBundleFromPath, ensureD0Dirs } from "../core/storage.js";
import type { D0Config } from "../core/config.js";

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".cache",
  ".turbo",
  ".vercel",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
]);

const MARKDOWN_EXTS = [".md", ".mdx", ".markdown"];

async function collectDocs(root: string, base = root): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith(".") && ent.name !== ".") continue;
    if (IGNORE_DIRS.has(ent.name)) continue;
    const full = path.join(root, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await collectDocs(full, base)));
    } else if (ent.isFile()) {
      const lower = ent.name.toLowerCase();
      if (MARKDOWN_EXTS.some((ext) => lower.endsWith(ext))) out.push(full);
    }
  }
  return out;
}

function slugFor(root: string, file: string): string {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  return rel.replace(/\.(md|mdx|markdown)$/i, "").replace(/\/index$/i, "");
}

function normalizeBundleName(raw: string): string {
  const name = raw.trim();
  if (name.includes("/") && name.startsWith("@")) return name;
  const slug = name.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const safe = slug || "docs";
  return `@local/${safe}`;
}

async function inferName(folder: string, explicit: string | undefined): Promise<string> {
  if (explicit?.trim()) return normalizeBundleName(explicit.trim());
  try {
    const pkg = JSON.parse(await readFile(path.join(folder, "package.json"), "utf8")) as { name?: unknown };
    if (typeof pkg.name === "string" && pkg.name.trim()) {
      return normalizeBundleName(pkg.name.trim());
    }
  } catch {
    /* no package.json */
  }
  return normalizeBundleName(path.basename(path.resolve(folder)));
}

async function inferVersion(folder: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(path.join(folder, "package.json"), "utf8")) as { version?: unknown };
    if (typeof pkg.version === "string" && /^\d+\.\d+\.\d+/.test(pkg.version.trim())) return pkg.version.trim();
  } catch {
    /* ignore */
  }
  return "0.1.0";
}

async function buildSyntheticBundle(
  sourceDir: string,
  name: string,
  version: string,
): Promise<{ bundleDir: string; manifest: D0Manifest; pageCount: number; cleanup: () => Promise<void> }> {
  const mdFiles = await collectDocs(sourceDir);
  if (mdFiles.length === 0) {
    throw new Error(`no markdown files found under ${sourceDir}`);
  }
  const tmp = await (
    await import("node:fs/promises")
  ).mkdtemp(path.join(os.tmpdir(), "d0-add-"));
  const pagesDir = path.join(tmp, "pages");
  await mkdir(pagesDir, { recursive: true });
  const structure: Record<string, string> = {};
  for (const file of mdFiles) {
    const slug = slugFor(sourceDir, file);
    const relFromOut = path.join("pages", path.relative(sourceDir, file)).replace(/\\/g, "/");
    const dest = path.join(tmp, relFromOut);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(file, dest);
    structure[slug] = relFromOut;
  }
  const manifest: D0Manifest = { name, version, structure };
  await writeFile(path.join(tmp, "d0.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return {
    bundleDir: tmp,
    manifest,
    pageCount: mdFiles.length,
    cleanup: () => rm(tmp, { recursive: true, force: true }).catch(() => undefined),
  };
}

async function installExistingBundleDir(abs: string): Promise<void> {
  let loaded;
  try {
    loaded = await loadBundle(abs);
  } catch (e) {
    if (e instanceof ManifestError || e instanceof BundleError) {
      console.error(`doc0 add: ${e.message}`);
    } else {
      console.error(`doc0 add: ${e instanceof Error ? e.message : String(e)}`);
    }
    process.exitCode = 1;
    return;
  }
  await installBundleFromPath(abs, loaded.manifest);
  if (loaded.manifest.bin) await writeNamedShim(loaded.manifest);
  console.log(`Installed ${loaded.manifest.name}@${loaded.manifest.version}`);
}

async function installFolder(abs: string, explicitName: string | undefined): Promise<void> {
  const name = await inferName(abs, explicitName);
  const version = await inferVersion(abs);
  let built;
  try {
    built = await buildSyntheticBundle(abs, name, version);
  } catch (e) {
    console.error(`doc0 add: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
    return;
  }
  try {
    await installBundleFromPath(built.bundleDir, built.manifest);
    console.log(`Installed ${built.manifest.name}@${built.manifest.version} (${built.pageCount} pages)`);
    console.log(`Source: ${abs}`);
    console.log(`Use with MCP: find_docs(\"${built.manifest.name}\") or read_docs(\"${built.manifest.name}\")`);
  } finally {
    await built.cleanup();
  }
}

export async function cmdAdd(
  bundleArg: string | undefined,
  opts: { local?: string; name?: string },
  _config: D0Config,
): Promise<void> {
  await ensureD0Dirs();

  if (opts.local) {
    const abs = path.resolve(opts.local);
    const st = await stat(abs).catch(() => null);
    if (!st?.isDirectory()) {
      console.error(`doc0 add: not a directory: ${abs}`);
      process.exitCode = 1;
      return;
    }
    await installExistingBundleDir(abs);
    return;
  }

  const arg = bundleArg?.trim();
  if (!arg) {
    console.error("Usage: doc0 add <path-to-docs-folder>   or   doc0 add <@scope/name> (registry not live yet)");
    process.exitCode = 1;
    return;
  }

  const looksLikePath =
    arg.startsWith(".") ||
    arg.startsWith("/") ||
    arg.startsWith("~") ||
    /^[a-zA-Z]:[\\/]/.test(arg) ||
    arg.includes(path.sep);

  if (looksLikePath || !arg.startsWith("@")) {
    const abs = path.resolve(arg.replace(/^~/, os.homedir()));
    const st = await stat(abs).catch(() => null);
    if (st?.isDirectory()) {
      const hasManifest = await stat(path.join(abs, "d0.json")).catch(() => null);
      if (hasManifest?.isFile()) {
        await installExistingBundleDir(abs);
        return;
      }
      await installFolder(abs, opts.name);
      return;
    }
  }

  try {
    const meta = await fetchBundleMeta(arg);
    console.error(`Would install ${meta.name}@${meta.version} from ${meta.tarballUrl}`);
  } catch (e) {
    if (e instanceof RegistryError) {
      console.error(`doc0 add: ${e.message}`);
    } else {
      console.error(`doc0 add: ${e instanceof Error ? e.message : String(e)}`);
    }
    process.exitCode = 1;
  }
}
