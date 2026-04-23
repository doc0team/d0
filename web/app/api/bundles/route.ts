import { NextResponse } from "next/server";
import { fetchHostedIndex } from "@/lib/hosted-bundles";

export const revalidate = 60;

export async function GET() {
  const data = await fetchHostedIndex();
  if (!data) {
    return NextResponse.json({ error: "hosted index unavailable" }, { status: 503 });
  }
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600",
    },
  });
}
