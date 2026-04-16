import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, render, useApp, useInput, useWindowSize } from "ink";
import { TextInput } from "@inkjs/ui";
import type { D0Config } from "../core/config.js";
import type { SearchHit } from "../core/search-engine.js";
import type { ListDocUrlsOptions } from "../core/web-docs.js";
import { isUrlLike, listDocUrls, readDocUrl, resolveBrowseBaseUrl, searchDocUrls } from "../core/web-docs.js";
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
import {
  buildPathTrie,
  defaultExpandedPrefixes,
  firstPageUrlInRows,
  flattenPathTrie,
  formatUrlNavRowText,
} from "./url-nav-tree.js";

type ViewMode = "toc" | "read" | "searchPrompt" | "searchResults";
type IndexState = "loading" | "ready" | "error";
type Phase = "home" | "app";
type HomeFocus = "menu" | "search";

const URL_HOME_MENU = ["Browse documentation", "Quit"] as const;
const POPULAR_DOC_SITES = [
  "https://docs.anthropic.com",
  "https://nextjs.org/docs",
  "https://react.dev",
  "https://docs.stack-auth.com",
  "https://www.typescriptlang.org/docs",
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function keyMatch(input: string, keyName: string | undefined, binding: string): boolean {
  if (!binding) return false;
  if (binding.length === 1) return input === binding;
  return (keyName ?? "") === binding;
}

function siteHost(startUrl: string): string {
  try {
    return resolveBrowseBaseUrl(startUrl).hostname;
  } catch {
    return startUrl;
  }
}

function navLabel(url: string, maxLen: number): string {
  try {
    const u = new URL(url);
    const p = (u.pathname || "/") + u.search;
    if (p.length <= maxLen) return p || "/";
    return "…" + p.slice(-(maxLen - 2));
  } catch {
    return url.length <= maxLen ? url : `${url.slice(0, maxLen - 1)}…`;
  }
}

function UrlPickerHome({
  config,
  onOpenUrl,
  onExit,
}: {
  config: D0Config;
  onOpenUrl: (url: string) => void;
  onExit: () => void;
}): React.ReactElement {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const kb = config.keybindings;
  const [homeFocus, setHomeFocus] = useState<HomeFocus>("menu");
  const [homeSearchDraft, setHomeSearchDraft] = useState("");
  const [homeMenuIndex, setHomeMenuIndex] = useState(0);
  const menuOptions = useMemo(
    () => [...POPULAR_DOC_SITES.map((u) => `Open ${new URL(u).hostname}`), "Quit"],
    [],
  );
  const searchW = Math.min(64, Math.max(28, columns - 8));

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
    }
  });

  useInput(
    (input, key) => {
      const last = menuOptions.length - 1;
      if (input === kb.scroll_down || key.downArrow) {
        setHomeMenuIndex((i) => clamp(i + 1, 0, last));
        return;
      }
      if (input === kb.scroll_up || key.upArrow) {
        setHomeMenuIndex((i) => clamp(i - 1, 0, last));
        return;
      }
      if (key.return) {
        if (homeMenuIndex >= POPULAR_DOC_SITES.length) {
          onExit();
          exit();
          return;
        }
        onOpenUrl(POPULAR_DOC_SITES[homeMenuIndex]!);
      }
    },
    { isActive: homeFocus === "menu" },
  );

  return (
    <Box flexDirection="column" width={columns} height={rows} padding={1}>
      <Box flexDirection="column" flexGrow={1} minHeight={0} width="100%" justifyContent="center" alignItems="center">
        <HomeLanding
          subtitle={"Popular documentation sites\nPick one or enter any docs URL below"}
          options={menuOptions}
          selectedIndex={homeMenuIndex}
          searchSlot={
            <HomeSearchField
              width={searchW}
              focused={homeFocus === "search"}
              draft={homeSearchDraft}
              onDraftChange={setHomeSearchDraft}
              onSubmit={(value) => {
                const t = value.trim();
                if (!t) return;
                if (!isUrlLike(t)) return;
                onOpenUrl(t);
              }}
              remountKey="url-launch-search"
              unfocusedHint="Type docs URL then Enter (Tab to edit)"
            />
          }
        />
      </Box>
      <Box flexShrink={0} marginTop={1}>
        <KeyBar width={Math.max(40, columns - 2)} items={homeMenuKeyHints(kb, { withSearchBar: true })} />
      </Box>
    </Box>
  );
}

function UrlHomePanel({
  kb,
  columns,
  homeSubtitle,
  homeMenuIndex,
  setHomeMenuIndex,
  homeFocus,
  setHomeFocus,
  homeSearchDraft,
  setHomeSearchDraft,
  startUrl,
  listOpts,
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
  startUrl: string;
  listOpts?: ListDocUrlsOptions;
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
      const last = URL_HOME_MENU.length - 1;
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
    void (async () => {
      const found = await searchDocUrls(startUrl, value, listOpts);
      const mapped: SearchHit[] = found.map((h) => ({
        slug: h.url,
        title: h.title,
        snippet: h.snippet,
      }));
      setQuery(value);
      setHits(mapped);
      setSelectedIndex(0);
      setPhase("app");
      setMode("searchResults");
    })();
  }

  return (
    <>
      <Box flexDirection="column" flexGrow={1} width="100%" justifyContent="center" alignItems="center">
        <HomeLanding
          subtitle={homeSubtitle}
          options={[...URL_HOME_MENU]}
          selectedIndex={homeMenuIndex}
          searchSlot={
            <HomeSearchField
              width={searchW}
              focused={homeFocus === "search"}
              draft={homeSearchDraft}
              onDraftChange={setHomeSearchDraft}
              onSubmit={runHomeSearch}
              remountKey="url-home-search"
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

function UrlBrowseApp({
  startUrl,
  config,
  listOpts,
  onExit,
}: {
  startUrl: string;
  config: D0Config;
  listOpts?: ListDocUrlsOptions;
  onExit: () => void;
}) {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const host = useMemo(() => siteHost(startUrl), [startUrl]);
  const [indexState, setIndexState] = useState<IndexState>("loading");
  const [indexError, setIndexError] = useState<string>("");
  const [pages, setPages] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("home");
  const [homeMenuIndex, setHomeMenuIndex] = useState(0);
  const [homeFocus, setHomeFocus] = useState<HomeFocus>("menu");
  const [homeSearchDraft, setHomeSearchDraft] = useState("");
  const [mode, setMode] = useState<ViewMode>("toc");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [readUrl, setReadUrl] = useState("");
  const [readText, setReadText] = useState("Loading…");
  const [scroll, setScroll] = useState(0);
  const [splitPreview, setSplitPreview] = useState<{ loading: boolean; text: string }>({ loading: true, text: "" });
  const [expandedPrefixes, setExpandedPrefixes] = useState<Set<string>>(() => new Set());
  const history = useMemo(() => new NavHistory(), []);
  const listKey = listOpts?.llmsIncludeExternal ? "ext" : "same";

  const docOrigin = useMemo(() => {
    try {
      return resolveBrowseBaseUrl(startUrl).origin;
    } catch {
      return "";
    }
  }, [startUrl]);

  const pathTrie = useMemo(() => buildPathTrie(pages, docOrigin), [pages, docOrigin]);

  const navRows = useMemo(
    () => flattenPathTrie(pathTrie, expandedPrefixes),
    [pathTrie, expandedPrefixes],
  );

  useEffect(() => {
    let cancelled = false;
    setIndexState("loading");
    setPhase("home");
    setHomeMenuIndex(0);
    setHomeFocus("menu");
    setHomeSearchDraft("");
    void (async () => {
      try {
        const list = await listDocUrls(startUrl, listOpts);
        if (cancelled) return;
        if (!list.length) {
          setIndexState("error");
          setIndexError("No doc pages discovered for this URL.");
          setPages([]);
          setExpandedPrefixes(new Set());
          return;
        }
        setPages(list);
        setSelectedIndex(0);
        const trie = buildPathTrie(list, resolveBrowseBaseUrl(startUrl).origin);
        const ex = defaultExpandedPrefixes(trie);
        setExpandedPrefixes(ex);
        const first =
          firstPageUrlInRows(flattenPathTrie(trie, ex)) ?? (list.length ? list[0]! : "");
        if (first) history.reset(first);
        setIndexState("ready");
      } catch (e) {
        if (cancelled) return;
        setIndexState("error");
        setIndexError(e instanceof Error ? e.message : String(e));
        setPages([]);
        setExpandedPrefixes(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startUrl, listKey, history]);

  useEffect(() => {
    if (mode !== "toc" || phase !== "app") return;
    setSelectedIndex((i) => clamp(i, 0, Math.max(0, navRows.length - 1)));
  }, [mode, phase, navRows.length]);

  const kb = config.keybindings;
  const innerW = Math.max(40, columns - 2);
  const navW = Math.max(26, Math.floor(innerW * 0.36));
  const splitGap = 2;
  const previewW = Math.max(20, innerW - navW - splitGap);
  const navContentW = Math.max(12, navW - 4);
  const navTitleBarW = Math.max(8, navContentW);
  const navBodyCols = Math.max(6, navContentW - 2);
  const previewTitleBarW = Math.max(12, previewW - 4);
  const readTextCols = Math.max(20, innerW - 4);
  const previewTextCols = Math.max(20, previewW - 4);
  const contentHeight = Math.max(8, rows - 12);
  const sideHeight = Math.max(8, rows - 14);
  const showInlineQueryBar = mode === "searchResults" || (mode === "toc" && query.trim().length > 0);
  const inlineQueryReserve = showInlineQueryBar ? 3 : 0;
  const navVisible = Math.max(4, sideHeight - 4 - inlineQueryReserve);
  const previewRows = Math.max(6, rows - 16);

  useEffect(() => {
    if (phase !== "app" || !readUrl || mode !== "read") return;
    void (async () => {
      try {
        const page = await readDocUrl(readUrl);
        const text = await markdownToTerminal(page.markdown, config.theme, {
          palette: "subtle",
          contentWidth: readTextCols,
        });
        setReadText(text);
        setScroll(0);
      } catch (e) {
        setReadText(`_Error: ${e instanceof Error ? e.message : String(e)}_`);
      }
    })();
  }, [readUrl, mode, config.theme, phase, readTextCols]);

  useEffect(() => {
    if (phase !== "app" || mode !== "toc" || indexState !== "ready") return;
    const row = navRows[selectedIndex];
    if (!row || row.kind === "dir") {
      setSplitPreview({
        loading: false,
        text:
          row?.kind === "dir"
            ? `Folder · ${row.leafCount} page(s) — Enter or → expand · ← collapse`
            : "",
      });
      return;
    }
    const url = row.url;
    let cancelled = false;
    setSplitPreview((p) => ({ ...p, loading: true }));
    void (async () => {
      try {
        const page = await readDocUrl(url);
        if (cancelled) return;
        const text = await markdownToTerminal(page.markdown, config.theme, {
          palette: "subtle",
          contentWidth: previewTextCols,
        });
        setSplitPreview({ loading: false, text });
      } catch (e) {
        if (!cancelled) setSplitPreview({ loading: false, text: `(Could not load page: ${e instanceof Error ? e.message : String(e)})` });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, mode, selectedIndex, navRows, config.theme, indexState, previewTextCols]);

  useEffect(() => {
    if (phase !== "app" || mode !== "searchResults") return;
    const hit = hits[selectedIndex];
    if (!hit?.slug) {
      setSplitPreview({ loading: false, text: "" });
      return;
    }
    let cancelled = false;
    setSplitPreview((p) => ({ ...p, loading: true }));
    void (async () => {
      try {
        const page = await readDocUrl(hit.slug);
        if (cancelled) return;
        const text = await markdownToTerminal(page.markdown, config.theme, {
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
  }, [phase, mode, selectedIndex, hits, config.theme, previewTextCols]);

  const navTopToc = clamp(
    selectedIndex - Math.floor(navVisible / 2),
    0,
    Math.max(0, navRows.length - navVisible),
  );
  const navTopHits = clamp(
    selectedIndex - Math.floor(navVisible / 2),
    0,
    Math.max(0, hits.length - navVisible),
  );

  function openUrl(url: string, record = true): void {
    if (!url) return;
    if (record) history.go(url);
    setReadUrl(url);
    setMode("read");
  }

  function goBack(): void {
    if (mode === "searchResults") {
      const cur = hits[selectedIndex]?.slug;
      const ix = cur ? navRows.findIndex((r) => r.kind === "page" && r.url === cur) : -1;
      setSelectedIndex(ix >= 0 ? ix : 0);
      setMode("toc");
      return;
    }
    if (mode !== "read") return;
    const prev = history.back();
    if (prev) openUrl(prev, false);
    else {
      const ix = navRows.findIndex((r) => r.kind === "page" && r.url === readUrl);
      setSelectedIndex(ix >= 0 ? ix : 0);
      setMode("toc");
    }
  }

  function goForward(): void {
    if (mode !== "read") return;
    const next = history.forward();
    if (next) openUrl(next, false);
  }

  useInput((input, key) => {
    if (key.ctrl && input.toLowerCase() === "c") {
      onExit();
      exit();
      return;
    }
    if (phase === "home" && indexState === "ready") {
      return;
    }

    if (keyMatch(input, undefined, kb.quit)) {
      onExit();
      exit();
      return;
    }

    if (mode === "searchPrompt" && phase === "app" && indexState === "ready") {
      if (key.escape) {
        setMode("toc");
        setQuery("");
      }
      return;
    }

    if (indexState === "error") return;

    if (indexState !== "ready") return;

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
      const maxIx = Math.max(0, navRows.length - 1);
      if (input === kb.scroll_down || key.downArrow) {
        setSelectedIndex((s) => clamp(s + 1, 0, maxIx));
        return;
      }
      if (input === kb.scroll_up || key.upArrow) {
        setSelectedIndex((s) => clamp(s - 1, 0, maxIx));
        return;
      }
      if (key.leftArrow) {
        const row = navRows[selectedIndex];
        if (row?.kind === "dir") {
          setExpandedPrefixes((prev) => {
            const next = new Set(prev);
            next.delete(row.pathKey);
            return next;
          });
        }
        return;
      }
      if (key.rightArrow) {
        const row = navRows[selectedIndex];
        if (row?.kind === "dir") {
          setExpandedPrefixes((prev) => {
            const next = new Set(prev);
            next.add(row.pathKey);
            return next;
          });
        }
        return;
      }
      if (key.return) {
        const row = navRows[selectedIndex];
        if (!row) return;
        if (row.kind === "dir") {
          setExpandedPrefixes((prev) => {
            const next = new Set(prev);
            if (next.has(row.pathKey)) next.delete(row.pathKey);
            else next.add(row.pathKey);
            return next;
          });
        } else {
          openUrl(row.url, true);
        }
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
        if (hit) openUrl(hit.slug, true);
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
  });

  const lines = useMemo(() => readText.split(/\r?\n/), [readText]);
  const maxScroll = Math.max(0, lines.length - contentHeight);
  const effectiveScroll = clamp(scroll, 0, maxScroll);
  const visibleLines = lines.slice(effectiveScroll, effectiveScroll + contentHeight);
  const readProgress = maxScroll === 0 ? 100 : Math.floor((effectiveScroll / maxScroll) * 100);

  const previewLines = useMemo(() => splitPreview.text.split(/\r?\n/), [splitPreview.text]);
  const visiblePreview = previewLines.slice(0, previewRows);

  const title =
    mode === "toc"
      ? breadcrumb([host, "pages"])
      : mode === "searchPrompt"
        ? breadcrumb([host, "search"])
        : mode === "searchResults"
          ? breadcrumb([host, "search-results"])
          : breadcrumb([host, navLabel(readUrl, 48)]);

  const modeLabel =
    mode === "toc" ? "browse" : mode === "searchPrompt" ? "search" : mode === "searchResults" ? "results" : "read";

  const footerHintsLoading = [{ k: kb.quit, d: "Quit" }];
  const footerHintsReady =
    mode === "read"
      ? readModeKeyHints(kb)
      : mode === "searchPrompt"
        ? searchPromptKeyHints(kb)
        : browseSplitKeyHints(kb, { treeNav: mode === "toc" });

  const loadingSubtitle = `Discovering pages…\n${startUrl}`;
  const readyHomeSubtitle = `${pages.length} page${pages.length === 1 ? "" : "s"} · ${host}`;

  return (
    <Box flexDirection="column" width={columns} height={rows} padding={1}>
      {indexState === "loading" ? (
        <>
          <Box flexDirection="column" flexGrow={1} minHeight={0} width="100%" justifyContent="center">
            <HomeLanding subtitle={loadingSubtitle} options={[]} selectedIndex={0} />
          </Box>
          <Box flexShrink={0} marginTop={1}>
            <KeyBar width={Math.max(40, columns - 2)} items={footerHintsLoading} />
          </Box>
        </>
      ) : indexState === "error" ? (
        <>
          <Box flexDirection="column" flexGrow={1} minHeight={0} width="100%" justifyContent="center">
            <HomeLanding subtitle={`Could not open docs browser\n${indexError}`} options={[]} selectedIndex={0} />
          </Box>
          <Box flexShrink={0} marginTop={1}>
            <KeyBar width={Math.max(40, columns - 2)} items={footerHintsLoading} />
          </Box>
        </>
      ) : phase === "home" ? (
        <UrlHomePanel
          kb={kb}
          columns={columns}
          homeSubtitle={readyHomeSubtitle}
          homeMenuIndex={homeMenuIndex}
          setHomeMenuIndex={setHomeMenuIndex}
          homeFocus={homeFocus}
          setHomeFocus={setHomeFocus}
          homeSearchDraft={homeSearchDraft}
          setHomeSearchDraft={setHomeSearchDraft}
          startUrl={startUrl}
          listOpts={listOpts}
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
            <Text color={chrome.text}>{navLabel(readUrl, Math.max(20, columns - 24))}</Text>
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
                {mode === "toc" && <PanelTitleBar title={`Pages · ${pages.length}`} width={navTitleBarW} />}
                {mode === "searchResults" && <PanelTitleBar title={`Results · ${hits.length}`} width={navTitleBarW} />}
                {showInlineQueryBar ? (
                  <BrowseInlineQueryBar width={navContentW} query={query} hintWhenEmpty="Press / to refine search" />
                ) : null}
                {mode === "toc" && (
                  <Box flexDirection="column">
                    {navRows.slice(navTopToc, navTopToc + navVisible).map((row, i) => {
                      const idx = navTopToc + i;
                      const active = idx === selectedIndex;
                      const rk = row.kind === "dir" ? `d:${row.pathKey}` : `p:${row.url}`;
                      return (
                        <SplitNavRow
                          key={rk}
                          marked={active}
                          width={navContentW}
                          text={formatUrlNavRowText(row, expandedPrefixes, navBodyCols)}
                        />
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
                              text={navLabel(hit.slug, navBodyCols)}
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
                    void (async () => {
                      const found = await searchDocUrls(startUrl, value, listOpts);
                      const mapped: SearchHit[] = found.map((h) => ({
                        slug: h.url,
                        title: h.title,
                        snippet: h.snippet,
                      }));
                      setQuery(value);
                      setHits(mapped);
                      setSelectedIndex(0);
                      setMode("searchResults");
                    })();
                  }}
                />
                <Text color={chrome.label}>Esc cancel · Enter run (network)</Text>
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
                  <Text color={chrome.label}>Enter opens full-page read · see key bar</Text>
                </Box>
              </>
            )}
            {mode === "searchPrompt" && (
              <Text color={chrome.label}>Search runs across a sample of discovered pages (may take a few seconds).</Text>
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
            <KeyBar width={innerW} items={footerHintsReady} />
          </Box>
        </>
      )}
    </Box>
  );
}

export async function runUrlBrowseTui(
  startUrl: string,
  config: D0Config,
  listOpts?: ListDocUrlsOptions,
): Promise<void> {
  await new Promise<void>((resolve) => {
    render(<UrlBrowseApp startUrl={startUrl} config={config} listOpts={listOpts} onExit={resolve} />, {
      alternateScreen: true,
      exitOnCtrlC: true,
    });
  });
}

export async function runUrlBrowseHomeTui(
  config: D0Config,
  listOpts?: ListDocUrlsOptions,
): Promise<void> {
  function UrlLaunchShell({ onExit }: { onExit: () => void }): React.ReactElement {
    const [targetUrl, setTargetUrl] = useState<string | null>(null);
    if (targetUrl) {
      return (
        <UrlBrowseApp
          key={targetUrl}
          startUrl={targetUrl}
          config={config}
          listOpts={listOpts}
          onExit={onExit}
        />
      );
    }
    return <UrlPickerHome config={config} onOpenUrl={setTargetUrl} onExit={onExit} />;
  }

  await new Promise<void>((resolve) => {
    render(<UrlLaunchShell onExit={resolve} />, {
      alternateScreen: true,
      exitOnCtrlC: true,
    });
  });
}
