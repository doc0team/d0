import { spawn } from "node:child_process";

export async function copyToClipboard(value: string): Promise<boolean> {
  const platform = process.platform;
  const command =
    platform === "win32"
      ? { cmd: "clip", args: [] as string[] }
      : platform === "darwin"
        ? { cmd: "pbcopy", args: [] as string[] }
        : { cmd: "xclip", args: ["-selection", "clipboard"] };
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command.cmd, command.args, { stdio: ["pipe", "ignore", "ignore"], shell: platform === "win32" });
      child.on("error", reject);
      child.stdin.write(value, "utf8");
      child.stdin.end();
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("clipboard command failed"))));
    });
    return true;
  } catch {
    return false;
  }
}
