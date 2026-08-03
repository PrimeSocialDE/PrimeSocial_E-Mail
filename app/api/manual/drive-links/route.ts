import { NextRequest, NextResponse } from "next/server";
import { getDriveLinks, createDriveLink } from "@/lib/manual/db";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const links = await getDriveLinks();
    return NextResponse.json({ links });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { label, url, category } = await req.json();
    if (!label || !url) {
      return NextResponse.json({ error: "label und url sind Pflicht" }, { status: 400 });
    }
    const link = await createDriveLink({ label, url, category });
    return NextResponse.json(link, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
