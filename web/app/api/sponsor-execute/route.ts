import { NextRequest, NextResponse } from "next/server";

const ENOKI_API = "https://api.enoki.mystenlabs.com/v1";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ENOKI_PRIVATE_KEY) {
      return NextResponse.json({ error: "Enoki not configured" }, { status: 500 });
    }

    const { digest, signature } = await req.json();

    const res = await fetch(`${ENOKI_API}/transaction-blocks/sponsor/${digest}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ENOKI_PRIVATE_KEY}`,
      },
      body: JSON.stringify({ signature }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Enoki execute failed: ${err}` }, { status: res.status });
    }

    const result = await res.json();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
