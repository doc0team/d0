import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import figlet from "figlet";
import { tuiChrome as chrome } from "./chrome.js";

/**
 * Interactive "MCP server idle" screen. Shown when a human runs `doc0 mcp`
 * directly in a terminal — *not* when an MCP client spawns the process with
 * piped stdio. In the piped case stdin/stdout belong to JSON-RPC and we can
 * never render a TUI without corrupting the protocol, so the caller must
 * gate this on `process.stdin.isTTY`.
 */
export type McpStatusTuiOpts = {
  launch: { command: string; args: string[] };
  installedOnly: boolean;
  version: string;
};

function renderFigletLines(text: string): string[] {
  try {
    return figlet
      .textSync(text, { font: "Roman", whitespaceBreak: true })
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+$/g, ""))
      .filter((l) => l.length > 0);
  } catch {
    return [text];
  }
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function Spinner({ tick }: { tick: number }): React.ReactElement {
  return <Text color={chrome.accent}>{SPINNER_FRAMES[tick % SPINNER_FRAMES.length]}</Text>;
}

/**
 * Scrolling radar/signal sweep using unicode shade blocks. Width-aware so it
 * never overflows narrow terminals. Produces a smooth soliton wave that moves
 * left→right, then fades, then re-emerges — implies "listening" without being
 * a busy loop animation.
 */
function SignalBar({ tick, width }: { tick: number; width: number }): React.ReactElement {
  const chars: string[] = [];
  const safeWidth = Math.max(8, Math.min(width, 72));
  for (let i = 0; i < safeWidth; i++) {
    const wave = Math.sin((i - tick * 0.9) * 0.28);
    const pulse = Math.sin(tick * 0.18) * 0.25;
    const intensity = (wave + 1) / 2 + pulse;
    if (intensity > 0.9) chars.push("█");
    else if (intensity > 0.65) chars.push("▓");
    else if (intensity > 0.38) chars.push("▒");
    else if (intensity > 0.15) chars.push("░");
    else chars.push(" ");
  }
  return <Text color={chrome.accentCool}>{chars.join("")}</Text>;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function McpStatusApp({ launch, installedOnly, version }: McpStatusTuiOpts): React.ReactElement {
  const { exit } = useApp();
  const [tick, setTick] = useState(0);
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    const anim = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 120);
    const clock = setInterval(() => setUptime((s) => s + 1), 1000);
    return () => {
      clearInterval(anim);
      clearInterval(clock);
    };
  }, []);

  useInput((input, key) => {
    if (input === "q" || key.escape) exit();
    if (key.ctrl && (input === "c" || input === "d")) exit();
  });

  const logoLines = useMemo(() => renderFigletLines("doc0"), []);
  const cmdLine = `${launch.command} ${launch.args.join(" ")}`;
  const tools = ["list_docs", "find_docs", "read_docs", "grep_docs"] as const;

  return (
    <Box flexDirection="column" paddingX={2}>
      {logoLines.map((line, i) => (
        <Text key={i} color={chrome.accent}>
          {line}
        </Text>
      ))}

      <Box marginTop={1} flexDirection="row">
        <Text color={chrome.label}>mcp stdio server</Text>
        <Text color={chrome.borderDim}>{"  ·  "}</Text>
        <Text color={chrome.label}>v{version}</Text>
        {installedOnly ? (
          <>
            <Text color={chrome.borderDim}>{"  ·  "}</Text>
            <Text color={chrome.accent}>installed-only</Text>
          </>
        ) : null}
        <Text color={chrome.borderDim}>{"  ·  "}</Text>
        <Spinner tick={tick} />
        <Text color={chrome.text}> dev inspector</Text>
      </Box>

      <Box marginTop={1}>
        <SignalBar tick={tick} width={60} />
      </Box>

      <Box marginTop={1} flexDirection="row">
        <Text color={chrome.label}>launch </Text>
        <Text color={chrome.accent}>$ </Text>
        <Text color={chrome.text}>{cmdLine}</Text>
      </Box>

      <Box flexDirection="row">
        <Text color={chrome.label}>tools{"  "}</Text>
        {tools.map((t, i) => (
          <React.Fragment key={t}>
            <Text color={chrome.accentCool}>{t}</Text>
            {i < tools.length - 1 ? <Text color={chrome.borderDim}>{"  "}</Text> : null}
          </React.Fragment>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={chrome.label}>
          <Text color={chrome.accent}>use it </Text>
          if you&apos;re debugging — pipe JSON-RPC at stdin, e.g.{" "}
          <Text color={chrome.accent}>
            echo {"'"}{`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`}{"'"} | doc0 mcp
          </Text>
        </Text>
        <Text color={chrome.label}>
          <Text color={chrome.accent}>skip it </Text>
          if you&apos;re just curious — MCP hosts spawn their own{" "}
          <Text color={chrome.accent}>doc0 mcp</Text> child; run{" "}
          <Text color={chrome.accent}>doc0 mcp install</Text> to wire it up.
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="row">
        <Text color={chrome.label}>uptime </Text>
        <Text color={chrome.text}>{formatUptime(uptime)}</Text>
        <Text color={chrome.borderDim}>{"   ·   "}</Text>
        <Text color={chrome.label}>
          press <Text color={chrome.accent}>q</Text> or <Text color={chrome.accent}>Ctrl-C</Text> to exit
        </Text>
      </Box>
    </Box>
  );
}

export async function renderMcpStatusTui(opts: McpStatusTuiOpts): Promise<void> {
  const app = render(<McpStatusApp {...opts} />);
  await app.waitUntilExit();
}
