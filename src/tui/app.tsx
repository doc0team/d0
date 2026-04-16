import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, render, useApp, useInput, useWindowSize } from "ink";
import { TextInput } from "@inkjs/ui";
import type { LoadedBundle } from "../core/bundle.js";
import { listSlugs, readPageMarkdown } from "../core/bundle.js";
import { buildIndex, searchIndex, type SearchHit } from "../core/search-engine.js";
import type { D0Config } from "../core/config.js";
import { NavHistory } from "./history.js";
import { breadcrumb } from "./breadcrumbs.js";
import { markdownToTerminal } from "../utils/markdown.js";
import { tuiChrome as chrome } from "./chrome.js";
import {
  AppHeader,
  BrowseInlineQueryBar,
  DocLine,
  HomeLanding,
  HomeSearchField,
  KeyBar,
  PanelTitleBar,
  SplitNavRow,
  browseSplitKeyHints,
  homeMenuKeyHints,
  readModeKeyHints,
  searchPromptKeyHints,
} from "./panels.js";

type ViewMode = "toc" | "read" | "searchPrompt" | "searchResults";
type Phase = "home" | "app";
type HomeFocus = "menu" | "search";

const HOME_MENU = ["Browse documentation", "Quit"] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function keyMatch(input: string, keyName: string | undefined, binding: string): boolean {
  if (!binding) return false;
  if (binding.length === 1) return input === binding;
  return (keyName ?? "") === binding;
}

function BundleHomePanel({
  kb,
  columns,
  homeSubtitle,
  homeMenuIndex,
  setHomeMenuIndex,
  homeFocus,
  setHomeFocus,
  homeSearchDraft,
  setHomeSearchDraft,
  searcher,
  setPhase,
  setMode,
  setQuery,
  setHits,
  setSelectedIndex,
  onExit,
  exit,
}: {
  kb: D0Config["keybindings"];
  columns: number;
  homeSubtitle: string;
  homeMenuIndex: number;
  setHomeMenuIndex: React.Dispatch<React.SetStateAction<number>>;
  homeFocus: HomeFocus;
  setHomeFocus: React.Dispatch<React.SetStateAction<HomeFocus>>;
  homeSearchDraft: string;
  setHomeSearchDraft: React.Dispatch<React.SetStateAction<string>>;
  searcher: Awaited<ReturnType<typeof buildIndex>> | null;
  setPhase: React.Dispatch<React.SetStateAction<Phase>>;
  setMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setHits: React.Dispatch<React.SetStateAction<SearchHit[]>>;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  onExit: () => void;
  exit: () => void;
}): React.ReactElement {
  useInput(
    (input, key) => {
      if (key.ctrl && input.toLowerCase() === "c") {
        onExit();
        exit();
        return;
      }
      if (keyMatch(input, undefined, kb.quit)) {
        onExit();
        exit();
        return;
      }
      if (key.shift && key.tab) {
        setHomeFocus("menu");
        return;
      }
      if (key.tab && !key.shift) {
        setHomeFocus((f) => (f === "menu" ? "search" : "menu"));
        return;
      }
      if (homeFocus === "search" && key.escape) {
        setHomeFocus("menu");
        return;
      }
    },
    { isActive: true },
  );

  useInput(
    (input, key) => {
      const last = HOME_MENU.length - 1;
      if (input === "1") {
        setHomeMenuIndex(0);
        setPhase("app");
        setMode("toc");
        return;
      }
      if (input === "2") {
        onExit();
        exit();
        return;
      }
      if (input === kb.scroll_down || key.downArrow) {
        setHomeMenuIndex((i) => clamp(i + 1, 0, last));
        return;
      }
      if (input === kb.scroll_up || key.upArrow) {
        setHomeMenuIndex((i) => clamp(i - 1, 0, last));
        return;
      }
      if (key.return) {
        const i = homeMenuIndex;
        if (i === 0) {
          setPhase("app");
          setMode("toc");
        } else {
          onExit();
          exit();
        }
      }
    },
    { isActive: homeFocus === "menu" },
  );

  const searchW = Math.min(56, Math.max(24, columns - 8));

  function runHomeSearch(value: string): void {
    const found = searcher ? searchIndex(searcher, value) : [];
    setQuery(value);
    setHits(found);
    setSelectedIndex(0);
    setPhase("app");
    setMode("searchResults");
  }

  return (
    <>
      <Box flexDirection="column" flexGrow={1} width="100%" justifyContent="center" alignItems="center">
        <HomeLanding
          subtitle={homeSubtitle}
          options={[...HOME_MENU]}
          selectedIndex={homeMenuIndex}
          searchSlot={
            <HomeSearchField
              width={searchW}
              focused={homeFocus === "search"}
              draft={homeSearchDraft}
              onDraftChange={setHomeSearchDraft}
              onSubmit={runHomeSearch}
              remountKey="bundle-home-search"
            />
          }
        />
      </Box>
      <Box flexShrink={0} marginTop={1}>
        <KeyBar width={Math.max(40, columns - 2)} items={homeMenuKeyHints(kb, { withSearchBar: true })} />
      </Box>
    </>
  );
}

function TuiApp({ bundle, config, onExit }: { bundle: LoadedBundle; config: D0Config; onExit: () => void }) {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const slugs = useMemo(() => listSlugs(bundle), [bundle]);
  const [phase, setPhase] = useState<Phase>("home");
  const [homeMenuIndex, setHomeMenuIndex] = useState(0);
  const [homeFocus, setHomeFocus] = useState<HomeFocus>("menu");
  const [homeSearchDraft, setHomeSearchDraft] = useState("");
  const [mode, setMode] = useState<ViewMode>("toc");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [readSlug, setReadSlug] = useState(slugs[0] ?? "");
  const [readText, setReadText] = useState("Loading...");
  const [scroll, setScroll] = useState(0);
  const [searcher, setSearcher] = useState<Awaited<ReturnType<typeof buildIndex>> | null>(null);
  const [splitPreview, setSplitPreview] = useState<{ loading: boolean; text: string }>({ loading: true, text: "" });
  const history = useMemo(() => {
    const h = new NavHistory();
    if (slugs[0]) h.reset(slugs[0]);
    return h;
  }, [slugs]);

  useEffect(() => {
    void (async () => {
      const idx = await buildIndex(bundle);
      setSearcher(idx);
    })();
  }, [bundle]);

  const kb = config.keybindings;
  const innerW = Math.max(40, columns - 2);
  const navW = Math.max(26, Math.floor(innerW * 0.36));
  const splitGap = 2;
  const previewW = Math.max(20, innerW - navW - splitGap);
  const navContentW = Math.max(12, navW - 4);
  const navTitleBarW = Math.max(8, navContentW);
  const navBodyCols = Math.max(6, navContentW - 2);
  const previewTitleBarW = Math.max(12, previewW - 4);
  /** Inner text columns inside bordered panels (border + padding). */
  const readTextCols = Math.max(20, innerW - 4);
  const previewTextCols = Math.max(20, previewW - 4);
  const contentHeight = Math.max(8, rows - 12);
  const sideHeight = Math.max(8, rows - 14);
  const showInlineQueryBar = mode === "searchResults" || (mode === "toc" && query.trim().length > 0);
  const inlineQueryReserve = showInlineQueryBar ? 3 : 0;
  const navVisible = Math.max(4, sideHeight - 4 - inlineQueryReserve);
  const previewRows = Math.max(6, rows - 16);

  useEffect(() => {
    if (phase !== "app") return;
    if (!readSlug) return;
    void (async () => {
      const md = await readPageMarkdown(bundle, readSlug);
      const text = await markdownToTerminal(md, config.theme, {
        palette: "subtle",
        contentWidth: readTextCols,
      });
      setReadText(text);
      setScroll(0);
    })();
  }, [bundle, readSlug, config.theme, phase, readTextCols]);

  useEffect(() => {
    if (phase !== "app" || mode !== "toc") return;
    const slug = slugs[selectedIndex];
    if (!slug) {
      setSplitPreview({ loading: false, text: "" });
      return;
    }
    let cancelled = false;
    setSplitPreview((p) => ({ ...p, loading: true }));
    void (async () => {
      try {
        const md = await readPageMarkdown(bundle, slug);
        if (cancelled) return;
        const text = await markdownToTerminal(md, config.theme, {
          palette: "subtle",
          contentWidth: previewTextCols,
        });
        setSplitPreview({ loading: false, text });
      } catch {
        if (!cancelled) setSplitPreview({ loading: false, text: "(Could not load page.)" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, mode, selectedIndex, bundle, config.theme, slugs, previewTextCols]);

  useEffect(() => {
    if (phase !== "app" || mode !== "searchResults") return;
    const hit = hits[selectedIndex];
    if (!hit) {
      setSplitPreview({ loading: false, text: "" });
      return;
    }
    let cancelled = false;
    setSplitPreview((p) => ({ ...p, loading: true }));
    void (async () => {
      try {
        const md = await readPageMarkdown(bundle, hit.slug);
        if (cancelled) return;
        const text = await markdownToTerminal(md, config.theme, {
          palette: "subtle",
          contentWidth: previewTextCols,
        });
        setSplitPreview({ loading: false, text });
      } catch {
        if (!cancelled) setSplitPreview({ loading: false, text: hit.snippet });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, mode, selectedIndex, bundle, config.theme, hits, previewTextCols]);

  const navTopToc = clamp(
    selectedIndex - Math.floor(navVisible / 2),
    0,
    Math.max(0, slugs.length - navVisible),
  );
  const navTopHits = clamp(
    selectedIndex - Math.floor(navVisible / 2),
    0,
    Math.max(0, hits.length - navVisible),
  );

  function openSlug(slug: string, record = true): void {
    if (!slug) return;
    if (record) history.go(slug);
    setReadSlug(slug);
    setMode("read");
  }

  function goBack(): void {
    if (mode === "searchResults") {
      const cur = hits[selectedIndex]?.slug;
      const ix = cur ? slugs.indexOf(cur) : 0;
      setSelectedIndex(ix >= 0 ? ix : 0);
      setMode("toc");
      return;
    }
    if (mode !== "read") return;
    const prev = history.back();
    if (prev) openSlug(prev, false);
    else setMode("toc");
  }

  function goForward(): void {
    if (mode !== "read") return;
    const next = history.forward();
    if (next) openSlug(next, false);
  }

  useInput((input, key) => {
    if (key.ctrl && input.toLowerCase() === "c") {
      onExit();
      exit();
      return;
    }

    if (keyMatch(input, undefined, kb.quit)) {
      onExit();
      exit();
      return;
    }

    if (mode === "searchPrompt") {
      if (key.escape) {
        setMode("toc");
        setQuery("");
      }
      return;
    }

    if (keyMatch(input, undefined, kb.search) && (mode === "toc" || mode === "read")) {
      setMode("searchPrompt");
      setQuery("");
      return;
    }

    if (keyMatch(input, undefined, kb.back) || input === "b") {
      goBack();
      return;
    }

    if (keyMatch(input, undefined, kb.forward)) {
      goForward();
      return;
    }

    if (mode === "toc") {
      if (input === kb.scroll_down || key.downArrow) {
        setSelectedIndex((s) => clamp(s + 1, 0, slugs.length - 1));
        return;
      }
      if (input === kb.scroll_up || key.upArrow) {
        setSelectedIndex((s) => clamp(s - 1, 0, slugs.length - 1));
        return;
      }
      if (key.return) {
        const slug = slugs[selectedIndex];
        if (slug) openSlug(slug, true);
      }
      return;
    }

    if (mode === "searchResults") {
      if (input === kb.scroll_down || key.downArrow) {
        setSelectedIndex((s) => clamp(s + 1, 0, Math.max(0, hits.length - 1)));
        return;
      }
      if (input === kb.scroll_up || key.upArrow) {
        setSelectedIndex((s) => clamp(s - 1, 0, Math.max(0, hits.length - 1)));
        return;
      }
      if (key.return) {
        const hit = hits[selectedIndex];
        if (hit) openSlug(hit.slug, true);
      }
      return;
    }

    if (mode === "read") {
      if (input === kb.scroll_down || key.downArrow) {
        setScroll((s) => s + 1);
        return;
      }
      if (input === kb.scroll_up || key.upArrow) {
        setScroll((s) => Math.max(0, s - 1));
        return;
      }
      if (key.home || input === kb.top) {
        setScroll(0);
        return;
      }
      if (key.end || input === kb.bottom) {
        setScroll(10_000);
      }
    }
  }, { isActive: phase !== "home" });

  const lines = useMemo(() => readText.split(/\r?\n/), [readText]);
  const maxScroll = Math.max(0, lines.length - contentHeight);
  const effectiveScroll = clamp(scroll, 0, maxScroll);
  const visibleLines = lines.slice(effectiveScroll, effectiveScroll + contentHeight);
  const readProgress = maxScroll === 0 ? 100 : Math.floor((effectiveScroll / maxScroll) * 100);

  const previewLines = useMemo(() => splitPreview.text.split(/\r?\n/), [splitPreview.text]);
  const visiblePreview = previewLines.slice(0, previewRows);

  const title =
    mode === "toc"
      ? breadcrumb([bundle.manifest.name, "pages"])
      : mode === "searchPrompt"
        ? breadcrumb([bundle.manifest.name, "search"])
        : mode === "searchResults"
          ? breadcrumb([bundle.manifest.name, "search-results"])
          : breadcrumb([bundle.manifest.name, readSlug]);

  const modeLabel =
    mode === "toc" ? "browse" : mode === "searchPrompt" ? "search" : mode === "searchResults" ? "results" : "read";

  const footerHints =
    mode === "read"
        ? readModeKeyHints(kb)
        : mode === "searchPrompt"
          ? searchPromptKeyHints(kb)
          : browseSplitKeyHints(kb);

  const homeSubtitle =
    phase === "home" ? `${slugs.length} page${slugs.length === 1 ? "" : "s"} · ${bundle.manifest.name}@${bundle.manifest.version}` : "";

  return (
    <Box flexDirection="column" width={columns} height={rows} padding={1}>
      {phase === "home" ? (
        <BundleHomePanel
          kb={kb}
          columns={columns}
          homeSubtitle={homeSubtitle}
          homeMenuIndex={homeMenuIndex}
          setHomeMenuIndex={setHomeMenuIndex}
          homeFocus={homeFocus}
          setHomeFocus={setHomeFocus}
          homeSearchDraft={homeSearchDraft}
          setHomeSearchDraft={setHomeSearchDraft}
          searcher={searcher}
          setPhase={setPhase}
          setMode={setMode}
          setQuery={setQuery}
          setHits={setHits}
          setSelectedIndex={setSelectedIndex}
          onExit={onExit}
          exit={exit}
        />
      ) : (
        <>
          <AppHeader breadcrumbPath={title} modeLabel={modeLabel} />
          <Box flexGrow={1} minHeight={0} width={innerW} overflow="hidden" flexDirection="column">
          {mode === "read" ? (
        <Box
          flexDirection="column"
          flexGrow={1}
          minHeight={0}
          overflow="hidden"
          width={innerW}
          borderStyle="single"
          borderColor={chrome.border}
          paddingX={1}
        >
          <PanelTitleBar title="Read" width={Math.max(12, columns - 8)} />
          <Box justifyContent="space-between">
            <Text color={chrome.text}>{readSlug}</Text>
            <Text color={chrome.label}>{readProgress}%</Text>
          </Box>
          <Box marginBottom={1} />
          <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden" width="100%">
            {visibleLines.map((line, i) => (
              <DocLine key={`read-${effectiveScroll + i}`} width={readTextCols} line={line} />
            ))}
          </Box>
        </Box>
      ) : (
        <Box flexDirection="row" flexGrow={1} minHeight={0} overflow="hidden" width={innerW} columnGap={splitGap}>
          <Box
            flexDirection="column"
            width={navW}
            minHeight={0}
            flexShrink={0}
            borderStyle="single"
            borderColor={chrome.border}
            paddingX={1}
          >
            {(mode === "toc" || mode === "searchResults") && (
              <>
                {mode === "toc" && (
                  <PanelTitleBar title={`Pages · ${slugs.length}`} width={navTitleBarW} />
                )}
                {mode === "searchResults" && <PanelTitleBar title={`Results · ${hits.length}`} width={navTitleBarW} />}
                {showInlineQueryBar ? (
                  <BrowseInlineQueryBar width={navContentW} query={query} hintWhenEmpty="Press / to refine search" />
                ) : null}
                {mode === "toc" && (
                  <Box flexDirection="column">
                    {slugs.slice(navTopToc, navTopToc + navVisible).map((slug, i) => {
                      const idx = navTopToc + i;
                      const active = idx === selectedIndex;
                      return (
                        <SplitNavRow key={slug} marked={active} width={navContentW} text={slug} />
                      );
                    })}
                  </Box>
                )}
                {mode === "searchResults" && (
                  <>
                    {!hits.length ? (
                      <Text color={chrome.label}>No results.</Text>
                    ) : (
                      <Box flexDirection="column">
                        {hits.slice(navTopHits, navTopHits + navVisible).map((hit, i) => {
                          const idx = navTopHits + i;
                          const active = idx === selectedIndex;
                          return (
                            <SplitNavRow
                              key={`${hit.slug}-${idx}`}
                              marked={active}
                              width={navContentW}
                              text={hit.slug}
                            />
                          );
                        })}
                      </Box>
                    )}
                  </>
                )}
              </>
            )}

            {mode === "searchPrompt" && (
              <>
                <PanelTitleBar title="Search query" width={navTitleBarW} />
                <TextInput
                  placeholder="Query…"
                  defaultValue={query}
                  onChange={(value) => setQuery(value)}
                  onSubmit={(value) => {
                    const found = searcher ? searchIndex(searcher, value) : [];
                    setQuery(value);
                    setHits(found);
                    setSelectedIndex(0);
                    setMode("searchResults");
                  }}
                />
                <Text color={chrome.label}>Esc cancel · Enter run</Text>
              </>
            )}
          </Box>

          <Box
            flexDirection="column"
            width={previewW}
            minHeight={0}
            flexGrow={1}
            flexShrink={1}
            overflow="hidden"
            borderStyle="single"
            borderColor={chrome.border}
            paddingX={1}
          >
            {(mode === "toc" || mode === "searchPrompt" || mode === "searchResults") && (
              <PanelTitleBar title="Preview" width={previewTitleBarW} />
            )}
            {mode === "toc" && (
              <>
                {splitPreview.loading ? (
                  <Text color={chrome.label}>Loading…</Text>
                ) : (
                  <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden" width="100%">
                    {visiblePreview.map((line, i) => (
                      <DocLine key={`pv-${i}`} width={previewTextCols} line={line} />
                    ))}
                  </Box>
                )}
                <Box flexShrink={0} marginTop={1}>
                  <Text color={chrome.label}>Use key bar below · Enter opens full-page read</Text>
                </Box>
              </>
            )}
            {mode === "searchPrompt" && (
              <Text color={chrome.label}>Search this bundle. Results open in split view.</Text>
            )}
            {mode === "searchResults" && (
              <>
                <Text color={chrome.label}>
                  {hits.length} match{hits.length === 1 ? "" : "es"}
                  {!!hits[selectedIndex] ? ` · ${hits[selectedIndex]!.title}` : ""}
                </Text>
                <Box marginBottom={1} />
                {splitPreview.loading ? (
                  <Text color={chrome.label}>Loading…</Text>
                ) : (
                  <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden" width="100%">
                    {visiblePreview.map((line, i) => (
                      <DocLine key={`sr-${i}`} width={previewTextCols} line={line} />
                    ))}
                  </Box>
                )}
              </>
            )}
          </Box>
        </Box>
      )}
          </Box>

          <Box flexShrink={0} marginTop={1}>
            <KeyBar width={innerW} items={footerHints} />
          </Box>
        </>
      )}
    </Box>
  );
}

export async function runBrowseTui(bundle: LoadedBundle, config: D0Config): Promise<void> {
  await new Promise<void>((resolve) => {
    render(<TuiApp bundle={bundle} config={config} onExit={resolve} />, {
      alternateScreen: true,
      exitOnCtrlC: true,
    });
  });
}
