"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TreeNode } from "@document0/core";

export function DocsSidebar({ tree }: { tree: TreeNode[] }) {
  const pathname = usePathname() ?? "/docs";
  return (
    <nav aria-label="Documentation" className="text-[13.5px]">
      <ul className="space-y-0.5">
        {tree.map((node, i) => (
          <TreeItem key={i} node={node} currentUrl={pathname} depth={0} />
        ))}
      </ul>
    </nav>
  );
}

function TreeItem({
  node,
  currentUrl,
  depth,
}: {
  node: TreeNode;
  currentUrl: string;
  depth: number;
}) {
  if (node.type === "separator") {
    return (
      <li
        className="mt-5 mb-1.5 px-2 font-mono text-[10.5px] uppercase tracking-[0.14em]"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        {node.name}
      </li>
    );
  }

  if (node.type === "folder") {
    const activeIndex = node.index ? isActive(node.index.url, currentUrl) : false;
    return (
      <li>
        {node.index ? (
          <SidebarLink href={node.index.url} active={activeIndex} depth={depth} bold>
            {node.name}
          </SidebarLink>
        ) : (
          <div
            className="py-1.5 font-semibold"
            style={{ paddingLeft: 12 + depth * 12, paddingRight: 12, color: "var(--color-fg)" }}
          >
            {node.name}
          </div>
        )}
        {node.children.length > 0 && (
          <ul className="mt-0.5 space-y-0.5">
            {node.children.map((child, i) => (
              <TreeItem key={i} node={child} currentUrl={currentUrl} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li>
      <SidebarLink href={node.url} active={isActive(node.url, currentUrl)} depth={depth}>
        {node.name}
      </SidebarLink>
    </li>
  );
}

function SidebarLink({
  href,
  active,
  depth,
  bold,
  children,
}: {
  href: string;
  active: boolean;
  depth: number;
  bold?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center rounded-full py-[7px] leading-none transition-colors ${
        active
          ? "bg-[var(--color-surface)] text-[var(--color-fg)]"
          : "text-[var(--color-fg-muted)] hover:bg-[color-mix(in_srgb,var(--color-surface)_50%,transparent)] hover:text-[var(--color-fg)]"
      }`}
      style={{
        paddingLeft: 12 + depth * 12,
        paddingRight: 12,
        fontWeight: bold ? 600 : 400,
      }}
    >
      {children}
    </Link>
  );
}

function normalize(u: string): string {
  return u.endsWith("/") && u.length > 1 ? u.slice(0, -1) : u;
}
function isActive(nodeUrl: string, currentUrl: string): boolean {
  return normalize(nodeUrl) === normalize(currentUrl);
}
