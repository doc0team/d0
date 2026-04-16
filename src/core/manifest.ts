import { readFile } from "node:fs/promises";
import path from "node:path";

export interface ManifestLibrary {
  name: string;
  versions?: string;
}

export interface D0Manifest {
  name: string;
  version: string;
  library?: ManifestLibrary;
  bin?: string;
  structure: Record<string, string>;
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseManifestJson(raw: string): D0Manifest {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ManifestError("d0.json is not valid JSON");
  }
  if (!isRecord(data)) throw new ManifestError("d0.json root must be an object");

  const name = data.name;
  if (typeof name !== "string" || !name.trim()) {
    throw new ManifestError('d0.json requires non-empty string field "name"');
  }
  if (!name.includes("/")) {
    throw new ManifestError('d0.json "name" must be scoped (e.g. "@acme/docs")');
  }

  const version = data.version;
  if (typeof version !== "string" || !version.trim()) {
    throw new ManifestError('d0.json requires non-empty string field "version"');
  }

  const structure = data.structure;
  if (!isRecord(structure)) {
    throw new ManifestError('d0.json requires object field "structure" mapping slug -> relative path');
  }
  const structureMap: Record<string, string> = {};
  for (const [slug, rel] of Object.entries(structure)) {
    if (typeof rel !== "string" || !rel.trim()) {
      throw new ManifestError(`structure["${slug}"] must be a non-empty string path`);
    }
    if (slug.includes("..") || slug.startsWith("/")) {
      throw new ManifestError(`Invalid structure key: "${slug}"`);
    }
    structureMap[slug] = rel.replace(/\\/g, "/");
  }
  if (Object.keys(structureMap).length === 0) {
    throw new ManifestError("d0.json structure must contain at least one page");
  }

  let library: ManifestLibrary | undefined;
  if (data.library !== undefined) {
    if (!isRecord(data.library)) throw new ManifestError('"library" must be an object');
    const libName = data.library.name;
    if (typeof libName !== "string" || !libName.trim()) {
      throw new ManifestError('library.name must be a non-empty string');
    }
    library = { name: libName.trim() };
    if (data.library.versions !== undefined) {
      if (typeof data.library.versions !== "string") {
        throw new ManifestError("library.versions must be a string if present");
      }
      library.versions = data.library.versions;
    }
  }

  let bin: string | undefined;
  if (data.bin !== undefined) {
    if (typeof data.bin !== "string" || !data.bin.trim()) {
      throw new ManifestError('"bin" must be a non-empty string if present');
    }
    bin = data.bin.trim();
  }

  return { name, version, structure: structureMap, library, bin };
}

export async function readManifest(bundleRoot: string): Promise<D0Manifest> {
  const p = path.join(bundleRoot, "d0.json");
  const raw = await readFile(p, "utf8");
  return parseManifestJson(raw);
}

export function manifestId(m: D0Manifest): string {
  return `${m.name}@${m.version}`;
}
