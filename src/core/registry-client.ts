import type { D0Config } from "./config.js";

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

export interface RegistryBundleMeta {
  name: string;
  version: string;
  tarballUrl: string;
}

/**
 * Stub registry client — real registry not live in v0.1.
 * Interface matches planned HTTP API.
 */
export async function fetchBundleMeta(
  _config: D0Config,
  _name: string,
  _version?: string,
): Promise<RegistryBundleMeta> {
  throw new RegistryError(
    "Registry downloads are not available yet. Use: d0 add --local <path-to-bundle-dir>",
  );
}

export async function publishBundle(
  _config: D0Config,
  _tarballPath: string,
  _token?: string,
): Promise<void> {
  throw new RegistryError(
    "d0 publish is not wired to a live registry yet. Use d0 build to produce a .d0.tgz artifact.",
  );
}
