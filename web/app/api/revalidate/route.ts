import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

type Payload = { token?: string; paths?: string[] };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Payload;
  const expected = process.env.VERCEL_REVALIDATE_TOKEN;
  if (!expected || body.token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === "string") : [];
  if (paths.length === 0) {
    return NextResponse.json({ ok: true, revalidated: [] });
  }

  for (const p of paths) revalidatePath(p);
  return NextResponse.json({ ok: true, revalidated: paths });
}
