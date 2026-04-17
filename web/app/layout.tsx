import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: {
    default: "doc0 - terminal-native documentation",
    template: "%s · doc0",
  },
  description:
    "Browse any framework's docs in your terminal. Your agent runs the same CLI. One registry, one cache, zero servers.",
  metadataBase: new URL("https://doc0.sh"),
  openGraph: {
    title: "doc0 - terminal-native documentation",
    description:
      "Browse any framework's docs in your terminal. Your agent runs the same CLI.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <SiteHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}
