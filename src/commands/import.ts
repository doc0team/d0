import path from "node:path";
import { readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

async function collectMarkdownFiles(root: string, base = root): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(root, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await collectMarkdownFiles(full, base)));
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function slugFromFile(root: string, file: string): string {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  return rel.replace(/\.md$/i, "").replace(/\/index$/i, "");
}

export async function cmdImport(
  source: string | undefined,
  opts: { name?: string; out?: string },
): Promise<void> {
  if (!source?.trim()) {
    console.error("Usage: d0 import <path-to-markdown-dir> --name @scope/pkg [--out dir]");
    process.exitCode = 1;
    return;
  }
  const name = opts.name?.trim();
  if (!name || !name.startsWith("@") || !name.includes("/")) {
    console.error("d0 import: --name @scope/package is required");
    process.exitCode = 1;
    return;
  }
  const src = path.resolve(source.trim());
  const st = await stat(src);
  if (!st.isDirectory()) {
    if (st.isFile() && src.endsWith(".md")) {
      const outDir = path.resolve(opts.out ?? "./imported-bundle");
      await mkdir(path.join(outDir, "pages"), { recursive: true });
      const slug = path.basename(src, ".md").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
      const dest = path.join("pages", `${slug}.md`);
      const { copyFile, readFile } = await import("node:fs/promises");
      await copyFile(src, path.join(outDir, dest));
      const manifest = {
        name,
        version: "0.1.0",
        structure: { [slug]: dest },
      };
      await writeFile(path.join(outDir, "d0.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
      console.log(`Imported single file into ${outDir}`);
      return;
    }
    console.error("d0 import: source must be a directory of markdown or a single .md file");
    process.exitCode = 1;
    return;
  }

  const outDir = path.resolve(opts.out ?? "./imported-bundle");
  if (existsSync(path.join(outDir, "d0.json"))) {
    console.error(`d0 import: ${outDir} already has d0.json — pick a different --out`);
    process.exitCode = 1;
    return;
  }

  const mdFiles = await collectMarkdownFiles(src);
  if (!mdFiles.length) {
    console.error("d0 import: no .md files found");
    process.exitCode = 1;
    return;
  }

  const structure: Record<string, string> = {};
  await mkdir(path.join(outDir, "pages"), { recursive: true });
  const { copyFile } = await import("node:fs/promises");

  for (const file of mdFiles) {
    const slug = slugFromFile(src, file);
    const relFromOut = path.join("pages", path.relative(src, file)).replace(/\\/g, "/");
    const destAbs = path.join(outDir, relFromOut);
    await mkdir(path.dirname(destAbs), { recursive: true });
    await copyFile(file, destAbs);
    structure[slug] = relFromOut;
  }

  const manifest = {
    name,
    version: "0.1.0",
    structure,
  };
  await writeFile(path.join(outDir, "d0.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`Imported ${mdFiles.length} pages into ${outDir}`);
  console.log("Run: d0 build " + outDir);
}
