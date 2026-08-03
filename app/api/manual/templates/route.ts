import { NextRequest, NextResponse } from "next/server";
import { getTemplates, createTemplate } from "@/lib/manual/db";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const templates = await getTemplates();
    return NextResponse.json({ templates });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, subject, body, placeholders, source_examples } = await req.json();
    if (!name || !body) {
      return NextResponse.json({ error: "name und body sind Pflicht" }, { status: 400 });
    }
    const tpl = await createTemplate({ name, subject, body, placeholders, source_examples });
    return NextResponse.json(tpl, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
