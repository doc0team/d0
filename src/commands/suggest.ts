import path from "node:path";
import { readFile } from "node:fs/promises";
import { listDocsRegistryEntries, type DocsRegistryEntry } from "../core/registry-client.js";

type DepEntry = { name: string; version: string; kind: "dep" | "devDep" | "peerDep" };

async function readProjectDeps(dir: string): Promise<DepEntry[] | { error: string }> {
  const pkgPath = path.resolve(dir, "package.json");
  let raw: string;
  try {
    raw = await readFile(pkgPath, "utf8");
  } catch {
    return { error: `no package.json at ${pkgPath}` };
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { error: `invalid JSON in ${pkgPath}` };
  }
  const deps: DepEntry[] = [];
  const push = (kind: DepEntry["kind"], bucket: unknown) => {
    if (!bucket || typeof bucket !== "object") return;
    for (const [name, version] of Object.entries(bucket as Record<string, unknown>)) {
      if (typeof version === "string") deps.push({ name, version, kind });
    }
  };
  push("dep", data.dependencies);
  push("devDep", data.devDependencies);
  push("peerDep", data.peerDependencies);
  return deps;
}

/** Strip a scope so we can match `stripe-js` against a registry entry named `stripe`. */
function baseOf(depName: string): string {
  const withoutScope = depName.startsWith("@") ? depName.split("/").slice(1).join("/") : depName;
  return withoutScope.toLowerCase();
}

function matchEntry(entries: DocsRegistryEntry[], dep: DepEntry): DocsRegistryEntry | null {
  const candidates = [
    dep.name.toLowerCase(),
    baseOf(dep.name),
    baseOf(dep.name).replace(/-js$|-node$|-sdk$|\.js$/, ""),
  ].filter((c, i, arr) => c && arr.indexOf(c) === i);
  for (const entry of entries) {
    const haystack = [entry.id.toLowerCase(), ...(entry.aliases ?? []).map((a) => a.toLowerCase())];
    if (candidates.some((c) => haystack.includes(c))) return entry;
  }
  for (const entry of entries) {
    const id = entry.id.toLowerCase();
    for (const c of candidates) {
      if (c.length < 5) continue;
      if (id === c || id.includes(c) || c.includes(id)) return entry;
    }
  }
  return null;
}

export async function cmdScan(dir: string, opts: { json?: boolean }): Promise<void> {
  const deps = await readProjectDeps(dir);
  if ("error" in deps) {
    if (opts.json) console.log(JSON.stringify({ error: deps.error }));
    else console.error(`doc0 scan: ${deps.error}`);
    process.exitCode = 1;
    return;
  }

  const entries = await listDocsRegistryEntries();
  const matches: Array<{ dep: DepEntry; entry: DocsRegistryEntry }> = [];
  const unmatched: DepEntry[] = [];
  for (const dep of deps) {
    const entry = matchEntry(entries, dep);
    if (entry) matches.push({ dep, entry });
    else unmatched.push(dep);
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          scanned: deps.length,
          matches: matches.map((m) => ({
            dep: m.dep.name,
            dep_version: m.dep.version,
            dep_kind: m.dep.kind,
            id: m.entry.id,
            source: m.entry.source,
            source_type: m.entry.sourceType,
          })),
          unmatched: unmatched.map((d) => ({ name: d.name, version: d.version, kind: d.kind })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`doc0 scan: scanned ${deps.length} deps in ${path.resolve(dir, "package.json")}\n`);
  if (matches.length === 0) {
    console.log("No registry coverage for any dependency.");
  } else {
    console.log(`${matches.length} matched:\n`);
    for (const { dep, entry } of matches) {
      const kindLabel = dep.kind === "devDep" ? "dev" : dep.kind === "peerDep" ? "peer" : "   ";
      console.log(
        `  ${kindLabel}  ${dep.name.padEnd(28)} -> ${entry.id.padEnd(18)} ${entry.sourceType}  ${entry.source}`,
      );
    }
    console.log("\nTry:");
    console.log(`  doc0 ${matches[0]!.entry.id}`);
    console.log(`  (or in MCP) find_docs("${matches[0]!.entry.id}")`);
  }

  if (unmatched.length > 0) {
    console.log(`\n${unmatched.length} without registry coverage:`);
    const preview = unmatched.slice(0, 20).map((d) => d.name).join(", ");
    console.log(`  ${preview}${unmatched.length > 20 ? ", ..." : ""}`);
    console.log("\nTip: add your own entry to ~/.d0/docs-registry.json to cover these.");
  }
}

/** Backward-compatible alias; prefer `cmdScan` + `doc0 scan`. */
export const cmdSuggest = cmdScan;
