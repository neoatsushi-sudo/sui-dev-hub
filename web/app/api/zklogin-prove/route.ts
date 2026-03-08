import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ENOKI_PRIVATE_KEY) {
      return NextResponse.json({ error: "Enoki not configured" }, { status: 500 });
    }

    const body = await req.json();

    const res = await fetch("https://api.enoki.mystenlabs.com/v1/zklogin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ENOKI_PRIVATE_KEY}`,
        "zklogin-jwt": body.jwt,
      },
      body: JSON.stringify({
        network: "testnet",
        jwt: body.jwt,
        extendedEphemeralPublicKey: body.extendedEphemeralPublicKey,
        maxEpoch: body.maxEpoch,
        jwtRandomness: body.jwtRandomness,
        salt: body.salt,
        keyClaimName: body.keyClaimName ?? "sub",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Enoki prove failed: ${err}` }, { status: res.status });
    }

    const json = await res.json();
    // Enoki wraps response in { data: { proofPoints, issBase64Details, headerBase64 } }
    return NextResponse.json(json.data ?? json);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
