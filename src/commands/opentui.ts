import { spawn } from "node:child_process";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function cmdBrowseOpenTui(): Promise<void> {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error("d0 browse-opentui: interactive mode requires a TTY.");
    process.exitCode = 1;
    return;
  }

  await new Promise<void>((done) => {
    const here = dirname(fileURLToPath(import.meta.url));
    const appEntry = pathResolve(here, "../opentui-browser.js");
    const child = spawn("bun", [appEntry], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", () => {
      console.error("d0 browse-opentui: failed to launch Bun. Install Bun to use OpenTUI mode.");
      process.exitCode = 1;
      done();
    });

    child.on("exit", (code: number | null) => {
      if (typeof code === "number" && code !== 0) {
        process.exitCode = code;
      }
      done();
    });
  });
}
