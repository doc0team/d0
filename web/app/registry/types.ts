export type RegistryEntry = {
  id: string;
  aliases?: string[];
  sourceType: "url";
  source: string;
  description?: string;
};

export type RegistryDocument = {
  version?: number;
  description?: string;
  entries: RegistryEntry[];
};
