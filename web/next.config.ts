import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // DocsSource + shiki are pure Node packages; don't bundle them for RSC.
  serverExternalPackages: ["shiki", "@document0/core", "@document0/mdx"],
};

export default config;
