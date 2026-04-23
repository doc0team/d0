export interface HostedVersionMeta {
  sha: string;
  url: string;
  pages: number;
  builtAt: string;
  embedModel?: string;
  embedDim?: number;
  manifestUrl?: string;
  pagesBaseUrl?: string;
}

export interface HostedEntryMeta {
  latest: string;
  versions: Record<string, HostedVersionMeta>;
}

export interface HostedIndex {
  builtAt: string;
  entries: Record<string, HostedEntryMeta>;
}

const FALLBACK_INDEX_URL = "https://doc0.sh/api/bundles/index.json";

function indexUrl(): string {
  return process.env.D0_HOSTED_INDEX_URL ?? FALLBACK_INDEX_URL;
}

export async function fetchHostedIndex(): Promise<HostedIndex | null> {
  try {
    const res = await fetch(indexUrl(), { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()) as HostedIndex;
  } catch {
    return null;
  }
}

export async function fetchHostedEntry(id: string): Promise<HostedEntryMeta | null> {
  const base = indexUrl().replace(/\/index\.json$/, "");
  const url = `${base}/${encodeURIComponent(id)}.json`;
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()) as HostedEntryMeta;
  } catch {
    return null;
  }
}
