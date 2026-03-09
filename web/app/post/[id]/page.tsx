import { Metadata } from "next";
import PostDetail from "@/components/PostDetail";

const SUI_RPC = "https://fullnode.testnet.sui.io";

function decodeBytes(bytes: number[]): string {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function parseCleanTitle(rawTitle: string): string {
  return rawTitle.replace(/\s*\[[^\]]+\]/g, "").trim();
}

async function fetchPostFields(id: string) {
  try {
    const res = await fetch(SUI_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sui_getObject",
        params: [id, { showContent: true }],
      }),
      next: { revalidate: 60 },
    });
    const json = await res.json();
    return json?.result?.data?.content?.fields ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const fields = await fetchPostFields(id);

  if (fields?.title) {
    const rawTitle = decodeBytes(fields.title);
    const title = parseCleanTitle(rawTitle);

    return {
      title: `${title} | Sui Dev Hub`,
      description: `Sui Dev Hubの技術記事 — ${title}`,
      openGraph: {
        title: `${title} | Sui Dev Hub`,
        description: `Sui Dev Hubの技術記事 — ${title}`,
        type: "article",
        siteName: "Sui Dev Hub",
      },
      twitter: {
        card: "summary",
        title: `${title} | Sui Dev Hub`,
        description: `Sui Dev Hubの技術記事 — ${title}`,
      },
    };
  }

  return {
    title: "記事 | Sui Dev Hub",
    description: "Sui Dev Hubの技術記事",
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PostDetail id={id} />;
}
