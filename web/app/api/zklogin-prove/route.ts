import { NextRequest, NextResponse } from "next/server";

const ENOKI_API = "https://api.enoki.mystenlabs.com/v1";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ENOKI_PRIVATE_KEY) {
      return NextResponse.json({ error: "Enoki not configured" }, { status: 500 });
    }

    const { jwt, ephemeralPublicKey, maxEpoch, randomness } = await req.json();

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.ENOKI_PRIVATE_KEY}`,
      "zklogin-jwt": jwt,
    };

    // ZK proof と address を並行取得
    const [proofRes, addrRes] = await Promise.all([
      fetch(`${ENOKI_API}/zklogin/zkp`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          network: "testnet",
          ephemeralPublicKey,
          maxEpoch,
          randomness,
        }),
      }),
      fetch(`${ENOKI_API}/zklogin`, {
        method: "GET",
        headers,
      }),
    ]);

    if (!proofRes.ok) {
      const err = await proofRes.text();
      return NextResponse.json({ error: `Enoki zkp failed: ${err}` }, { status: proofRes.status });
    }
    if (!addrRes.ok) {
      const err = await addrRes.text();
      return NextResponse.json({ error: `Enoki address failed: ${err}` }, { status: addrRes.status });
    }

    const { data: proof } = await proofRes.json();
    const { data: addrData } = await addrRes.json();

    return NextResponse.json({ proof, address: addrData?.address });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
