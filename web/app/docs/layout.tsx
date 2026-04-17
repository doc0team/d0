import { docsSource } from "@/lib/docs-source";
import { DocsSidebar } from "@/components/docs-sidebar";

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const tree = await docsSource.getPageTree();

  return (
    <div className="mx-auto max-w-7xl px-6 pb-24 pt-6 md:pt-10">
      <div className="grid gap-8 md:gap-12 lg:grid-cols-[220px_minmax(0,1fr)_200px]">
        <aside className="hidden lg:block">
          <div
            className="sticky overflow-y-auto pr-2"
            style={{ top: 72, maxHeight: "calc(100vh - 88px)" }}
          >
            <DocsSidebar tree={tree} />
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
        <aside aria-hidden className="hidden lg:block" />
      </div>
    </div>
  );
}
