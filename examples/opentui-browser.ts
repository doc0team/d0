import { createCliRenderer, TextRenderable } from "@opentui/core";

const POPULAR = [
  "https://docs.anthropic.com",
  "https://docs.stack-auth.com",
  "https://react.dev",
  "https://nextjs.org/docs",
  "https://www.typescriptlang.org/docs",
];

function homeScreenText(): string {
  return [
    "d0 - OpenTUI (experimental)",
    "",
    "This is a secondary TUI track powered by OpenTUI/OpenCode runtime.",
    "Current Ink-based TUI remains the default.",
    "",
    "Popular docs sites:",
    ...POPULAR.map((u, i) => `  ${i + 1}. ${u}`),
    "",
    "Next step: wire interactive URL input + page navigation in this OpenTUI path.",
    "",
    "Press Ctrl+C to exit.",
  ].join("\n");
}

async function main(): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });

  const text = new TextRenderable(renderer, {
    id: "d0-opentui-home",
    content: homeScreenText(),
  });

  renderer.root.add(text);
}

void main();
