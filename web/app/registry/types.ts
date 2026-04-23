export type RegistryEntry = {
  id: string;
  aliases?: string[];
  sourceType: "url";
  source: string;
  description?: string;
};

export type RegistryBuildStatus = {
  latestVersion?: string;
  builtAt?: string;
  pages?: number;
  state: "healthy" | "stale" | "missing";
};

export type RegistryDocument = {
  version?: number;
  description?: string;
  entries: RegistryEntry[];
};
