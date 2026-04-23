import { NextResponse } from "next/server";
import { fetchHostedEntry } from "@/lib/hosted-bundles";

export const revalidate = 60;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await fetchHostedEntry(id.toLowerCase());
  if (!data) {
    return NextResponse.json({ error: "bundle entry not found" }, { status: 404 });
  }
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600",
    },
  });
}
