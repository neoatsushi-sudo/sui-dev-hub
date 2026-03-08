"use client";

import { useSuiClientQuery, useSignAndExecuteTransaction, useCurrentAccount } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID } from "@/lib/sui";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";

function decodeBytes(bytes: number[]): string {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const account = useCurrentAccount();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [content, setContent] = useState<string>("");
  const [contentLoading, setContentLoading] = useState(false);

  const { data, isLoading } = useSuiClientQuery("getObject", {
    id,
    options: { showContent: true },
  });

  useEffect(() => {
    if (!data?.data) return;
    const fields = (data.data.content as any).fields;
    const blobId = decodeBytes(fields.content_hash);

    // Walrus blob IDかどうか判定（44文字以上の英数字）
    if (blobId.length >= 20 && /^[A-Za-z0-9_-]+$/.test(blobId)) {
      setContentLoading(true);
      fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`)
        .then((r) => r.text())
        .then((text) => {
          setContent(text);
          setContentLoading(false);
        })
        .catch(() => {
          setContent(blobId); // フェッチ失敗時はblob IDをそのまま表示
          setContentLoading(false);
        });
    } else {
      // 旧形式（直接テキスト）
      setContent(blobId);
    }
  }, [data]);

  if (isLoading) return (
    <div className="max-w-2xl mx-auto px-4 py-8 text-gray-400">読み込み中...</div>
  );

  if (!data?.data) return (
    <div className="max-w-2xl mx-auto px-4 py-8 text-gray-400">記事が見つかりません</div>
  );

  const fields = (data.data.content as any).fields;
  const title = decodeBytes(fields.title);
  const author = fields.author;
  const tipBalance = Number(fields.tip_balance) / 1e9;

  const handleTip = () => {
    if (!account) return;
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(100_000_000)]);
    tx.moveCall({
      target: `${PACKAGE_ID}::platform::tip`,
      arguments: [tx.object(id), coin],
    });
    signAndExecute({ transaction: tx });
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => router.back()}
        className="text-gray-400 hover:text-white text-sm mb-6 flex items-center gap-1"
      >
        ← 戻る
      </button>

      <article className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
        <p className="text-gray-500 text-sm mb-6">
          by {shortAddress(author)} · チップ合計: {tipBalance} SUI
        </p>

        <div className="prose prose-invert prose-sm max-w-none mb-8
          prose-headings:text-white prose-p:text-gray-200 prose-a:text-blue-400
          prose-code:text-green-400 prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded
          prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-700
          prose-blockquote:border-gray-600 prose-blockquote:text-gray-400
          prose-strong:text-white prose-li:text-gray-200">
          {contentLoading ? (
            <p className="text-gray-500 text-sm">コンテンツを読み込み中...</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          )}
        </div>

        {account && account.address !== author && (
          <button
            onClick={handleTip}
            disabled={isPending}
            className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {isPending ? "送信中..." : "0.1 SUI チップを送る"}
          </button>
        )}
      </article>
    </div>
  );
}
