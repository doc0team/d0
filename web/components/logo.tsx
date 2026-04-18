import Link from "next/link";

/**
 * The document0 mark — a "d" formed by a rounded square with a pill cutout.
 * SVG path lives in /public/document0.svg; we inline it here so we can tint
 * with currentColor and pair it with a wordmark without layout shift.
 */
export function DocumentZeroMark({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 2048 2048"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
      style={{ display: "block" }}
    >
      <g transform="matrix(1,0,0,1,1024,1024)">
        <path
          fill="currentColor"
          d="M115.9,-661.558 L115.9,-661.64 L105.417,-661.64 C105.405,-661.64 105.393,-661.64 105.381,-661.64 L105.381,-661.64 L-767.021,-661.64 L-767.021,48.0377 L-767.021,661.64 L105.381,661.64 L105.381,661.64 C105.406,661.64 105.431,661.64 105.455,661.64 L115.899,661.64 L115.899,661.558 C476.684,655.947 767.021,362.131 767.021,7.40293e-05 C767.021,-362.131 476.684,-655.946 115.9,-661.558 Z M-118.592,96.0755 L-118.592,224.583 C-118.592,339.077 -211.067,431.552 -325.561,431.552 C-440.054,431.552 -531.429,339.077 -531.429,224.583 L-531.429,221.281 L-531.429,221.281 L-531.429,96.0755 L-531.429,-221.281 L-531.429,-221.281 L-531.429,-224.583 C-531.429,-339.077 -440.054,-431.552 -325.561,-431.552 C-211.067,-431.552 -118.592,-339.077 -118.592,-224.583 Z"
        />
      </g>
    </svg>
  );
}

/**
 * Primary site logo: `doc0` wordmark with the document0 mark as a colophon.
 * Used in the header.
 */
export function Logo({ size = 18 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center gap-2.5 font-mono font-semibold leading-none tracking-tight"
      style={{ fontSize: size }}
    >
      <DocumentZeroMark size={size + 2} className="text-[var(--color-fg)]" />
      <span
        aria-hidden
        className="inline-block h-[1.05em] w-px shrink-0 rounded-full"
        style={{ background: "var(--color-border-strong)" }}
      />
      <span style={{ color: "var(--color-fg)" }}>doc0</span>
    </span>
  );
}

/**
 * Small "A document0 product" byline.
 * Use under the main doc0 mark on landing, and in the footer.
 */
export function DocumentZeroByline({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "compact";
}) {
  return (
    <Link
      href="https://document0.com"
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1.5 transition-colors hover:opacity-100 ${className ?? ""}`}
      style={{ color: "var(--color-fg-subtle)" }}
    >
      <span
        className={
          variant === "compact"
            ? "font-mono text-[10px] uppercase tracking-[0.16em]"
            : "font-mono text-[11px] uppercase tracking-[0.16em]"
        }
      >
        A
      </span>
      <DocumentZeroMark size={12} className="opacity-70" />
      <span
        className={
          variant === "compact"
            ? "font-mono text-[10px] uppercase tracking-[0.16em]"
            : "font-mono text-[11px] uppercase tracking-[0.16em]"
        }
      >
        document0 product
      </span>
    </Link>
  );
}
