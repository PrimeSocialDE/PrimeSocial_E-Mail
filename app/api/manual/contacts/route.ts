import { NextRequest, NextResponse } from "next/server";
import { getContacts, createContact, getContactByEmail } from "@/lib/manual/db";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const contacts = await getContacts();
    return NextResponse.json({ contacts });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, first_name, last_name, company, branche, notes } = await req.json();
    if (!email) return NextResponse.json({ error: "email ist Pflicht" }, { status: 400 });
    const existing = await getContactByEmail(email);
    if (existing) return NextResponse.json(existing, { status: 200 });
    const contact = await createContact({ email, first_name, last_name, company, branche, notes });
    return NextResponse.json(contact, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
