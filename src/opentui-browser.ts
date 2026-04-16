import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  TextAttributes,
  TextRenderable,
  createCliRenderer,
  type KeyEvent,
} from "@opentui/core";

const POPULAR = [
  "https://docs.anthropic.com",
  "https://docs.stack-auth.com",
  "https://react.dev",
  "https://nextjs.org/docs",
  "https://www.typescriptlang.org/docs",
];

function isUrlLike(input: string): boolean {
  const t = input.trim();
  return /^https?:\/\//i.test(t) || /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/.*)?$/i.test(t);
}

function menuText(selected: number, focus: "menu" | "input"): string {
  return POPULAR.map((u, i) => {
    const marker = i === selected ? "›" : " ";
    const host = new URL(u).host;
    const prefix = focus === "menu" && i === selected ? marker : " ";
    return `${prefix} ${i + 1}. ${host}`;
  }).join("\n");
}

async function main(): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 30,
  });

  let selected = 0;
  let focus: "menu" | "input" = "menu";

  const root = new BoxRenderable(renderer, {
    id: "opentui-root",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    padding: 1,
    gap: 1,
  });

  const header = new BoxRenderable(renderer, {
    id: "header",
    border: true,
    borderStyle: "rounded",
    borderColor: "#6f6f82",
    title: " d0 / OpenTUI experimental ",
    titleAlignment: "center",
    padding: 1,
  });
  const title = new TextRenderable(renderer, {
    content: "Secondary TUI (OpenTUI)",
    fg: "#ffd7af",
    attributes: TextAttributes.BOLD,
  });
  const subtitle = new TextRenderable(renderer, {
    content: "Tab switches focus | Enter opens selected URL or input URL | q quits",
    fg: "#a5a5b8",
  });
  header.add(title);
  header.add(subtitle);

  const body = new BoxRenderable(renderer, {
    id: "body",
    flexDirection: "row",
    flexGrow: 1,
    gap: 1,
  });

  const menuBox = new BoxRenderable(renderer, {
    border: true,
    borderStyle: "single",
    borderColor: "#5f5f6f",
    title: " Popular docs ",
    width: "40%",
    padding: 1,
  });
  const menu = new TextRenderable(renderer, {
    content: menuText(selected, focus),
    fg: "#d7d7e2",
  });
  menuBox.add(menu);

  const inputBox = new BoxRenderable(renderer, {
    border: true,
    borderStyle: "single",
    borderColor: "#5f5f6f",
    title: " Open URL ",
    flexGrow: 1,
    padding: 1,
    gap: 1,
  });
  const hint = new TextRenderable(renderer, {
    content: "Enter docs URL (e.g. docs.stack-auth.com)",
    fg: "#9b9bae",
  });
  const input = new InputRenderable(renderer, {
    width: 56,
    placeholder: "docs.example.com",
    backgroundColor: "#1f1f25",
    focusedBackgroundColor: "#2a2a33",
    textColor: "#e9e9ee",
    cursorColor: "#f6c177",
  });
  const status = new TextRenderable(renderer, {
    content: "Ready.",
    fg: "#a8d8a8",
  });
  inputBox.add(hint);
  inputBox.add(input);
  inputBox.add(status);

  body.add(menuBox);
  body.add(inputBox);
  root.add(header);
  root.add(body);
  renderer.root.add(root);

  function setStatus(line: string, color = "#a8d8a8"): void {
    status.content = line;
    status.fg = color;
  }

  function openUrl(raw: string): void {
    const t = raw.trim();
    if (!t) return;
    if (!isUrlLike(t)) {
      setStatus(`Invalid URL: ${t}`, "#e07a7a");
      return;
    }
    const normalized = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    setStatus(`Selected: ${normalized}`);
  }

  function refreshMenu(): void {
    menu.content = menuText(selected, focus);
  }

  function setFocus(next: "menu" | "input"): void {
    focus = next;
    if (focus === "input") {
      input.focus();
      setStatus("Input focused. Type URL and press Enter.");
    } else {
      input.blur();
      setStatus(`Menu focused. Selected: ${new URL(POPULAR[selected]!).host}`);
    }
    refreshMenu();
  }

  input.on(InputRenderableEvents.ENTER, (value: string) => {
    openUrl(value);
  });

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.name === "tab") {
      setFocus(focus === "menu" ? "input" : "menu");
      return;
    }
    if (key.name === "q" && !key.ctrl && !key.meta) {
      renderer.destroy();
      return;
    }
    if (focus === "menu") {
      if (key.name === "down" || key.name === "j") {
        selected = Math.min(POPULAR.length - 1, selected + 1);
        refreshMenu();
        return;
      }
      if (key.name === "up" || key.name === "k") {
        selected = Math.max(0, selected - 1);
        refreshMenu();
        return;
      }
      if (key.name === "return") {
        openUrl(POPULAR[selected]!);
      }
    }
  });
  setFocus("menu");
}

void main();
