import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const starterManifest = (name: string) => ({
  name,
  version: "0.1.0",
  structure: {
    "getting-started": "pages/getting-started.md",
  },
});

const starterPage = `# Getting started

Welcome to your **doc0** documentation bundle.

## Edit this bundle

- Update \`d0.json\` \`structure\` to add pages (slug → relative path).
- Run \`doc0 build\` to validate and package.

## Install locally

\`\`\`bash
doc0 add --local .
\`\`\`
`;

export async function cmdInit(dirArg: string | undefined, opts: { name?: string }): Promise<void> {
  const dir = path.resolve(dirArg ?? ".");
  if (existsSync(path.join(dir, "d0.json"))) {
    console.error(`doc0 init: d0.json already exists in ${dir}`);
    process.exitCode = 1;
    return;
  }
  const name = opts.name?.trim();
  if (!name) {
    console.error("doc0 init: --name @scope/package is required (scoped name)");
    process.exitCode = 1;
    return;
  }
  if (!name.startsWith("@") || !name.includes("/")) {
    console.error('doc0 init: name must be scoped, e.g. "@acme/my-docs"');
    process.exitCode = 1;
    return;
  }
  await mkdir(path.join(dir, "pages"), { recursive: true });
  await writeFile(path.join(dir, "d0.json"), JSON.stringify(starterManifest(name), null, 2) + "\n", "utf8");
  await writeFile(path.join(dir, "pages", "getting-started.md"), starterPage, "utf8");
  console.log(`Initialized bundle in ${dir}`);
  console.log("Next: edit d0.json and pages/, then run doc0 build");
}
