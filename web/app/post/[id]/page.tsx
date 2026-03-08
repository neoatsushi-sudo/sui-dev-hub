"use client";

import { useSuiClientQuery, useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID } from "@/lib/sui";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useZkLogin } from "@/context/ZkLoginContext";
import { zkLoginSponsoredSignAndExecute } from "@/lib/zklogin";
import { useAuthorName } from "@/lib/profile";
import { CommentsSection } from "@/components/CommentsSection";
import { LockAsPremiumButton } from "@/components/PremiumContent";
import { RevenueShareSetup } from "@/components/RevenueSharing";

const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";

function decodeBytes(bytes: number[]): string {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// Extract tags from title: "My Title [Move][Sui]" → { cleanTitle: "My Title", tags: ["Move", "Sui"] }
function parseTitle(rawTitle: string): { cleanTitle: string; tags: string[] } {
  const tagRegex = /\[([^\]]+)\]/g;
  const tags: string[] = [];
  let match;
  while ((match = tagRegex.exec(rawTitle)) !== null) {
    tags.push(match[1]);
  }
  const cleanTitle = rawTitle.replace(/\s*\[[^\]]+\]/g, "").trim();
  return { cleanTitle, tags };
}

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const account = useCurrentAccount();
  const { session } = useZkLogin();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending: walletPending } = useSignAndExecuteTransaction();
  const [zkPending, setZkPending] = useState(false);
  const [content, setContent] = useState<string>("");
  const [contentLoading, setContentLoading] = useState(false);
  const [liked, setLiked] = useState(false);
  const isPending = walletPending || zkPending;

  const { data, isLoading } = useSuiClientQuery("getObject", {
    id,
    options: { showContent: true },
  });

  useEffect(() => {
    if (!data?.data) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields = (data.data.content as any).fields as any;
    const blobId = decodeBytes(fields.content_hash);

    if (blobId.length >= 20 && /^[A-Za-z0-9_-]+$/.test(blobId)) {
      setContentLoading(true);
      fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`)
        .then((r) => r.text())
        .then((text) => {
          setContent(text);
          setContentLoading(false);
        })
        .catch(() => {
          setContent(blobId);
          setContentLoading(false);
        });
    } else {
      setContent(blobId);
    }
  }, [data]);

  if (isLoading) return (
    <div className="max-w-2xl mx-auto px-4 py-8 text-gray-400">読み込み中...</div>
  );

  if (!data?.data) return (
    <div className="max-w-2xl mx-auto px-4 py-8 text-gray-400">記事が見つかりません</div>
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields = (data.data.content as any).fields as any;
  const rawTitle = decodeBytes(fields.title);
  const { cleanTitle, tags } = parseTitle(rawTitle);
  const author = fields.author;
  const tipBalance = Number(fields.tip_balance) / 1e9;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { displayName, suiNsName } = useAuthorName(author);

  const isAuthor =
    (account && account.address === author) ||
    (session && !account && session.address === author);

  const handleLike = async () => {
    if (liked) return;
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::platform::like_post`,
      arguments: [tx.object(id)],
    });

    if (session && !account) {
      try {
        setZkPending(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await zkLoginSponsoredSignAndExecute(session, tx, suiClient as any);
        setLiked(true);
      } finally {
        setZkPending(false);
      }
      return;
    }
    if (account) {
      signAndExecute({ transaction: tx }, { onSuccess: () => setLiked(true) });
    }
  };

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

  const handleDelete = async () => {
    if (!confirm("この記事を削除しますか？")) return;
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::platform::delete_post`,
      arguments: [tx.object(id)],
    });

    if (session && !account) {
      try {
        setZkPending(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await zkLoginSponsoredSignAndExecute(session, tx, suiClient as any);
        router.push("/");
      } finally {
        setZkPending(false);
      }
      return;
    }

    if (account) {
      signAndExecute({ transaction: tx }, {
        onSuccess: () => router.push("/"),
      });
    }
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
        <h1 className="text-2xl font-bold text-white mb-2">{cleanTitle}</h1>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {tags.map((tag) => (
              <span key={tag} className="bg-blue-950 text-blue-300 text-xs px-2 py-0.5 rounded-full">
                #{tag}
              </span>
            ))}
          </div>
        )}

        <p className="text-gray-500 text-sm mb-6 flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-md font-medium text-[10px] ${
            suiNsName ? "bg-blue-900 text-blue-300" : "bg-gray-800 text-gray-300"
          }`}>
            {suiNsName ? `🔷 ${displayName}` : displayName}
          </span>
          <span>· チップ合計: {tipBalance} SUI</span>
        </p>

        <div className="prose prose-invert prose-sm max-w-none mb-8
          prose-headings:text-white prose-p:text-gray-200 prose-a:text-blue-400
          prose-code:text-green-400 prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded
          prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-700
          prose-blockquote:border-gray-600 prose-blockquote:text-gray-400
          prose-strong:text-white prose-li:text-gray-200
          prose-img:rounded-xl prose-img:border prose-img:border-gray-700 prose-img:shadow-lg prose-img:max-h-96 prose-img:object-cover prose-img:mx-auto">
          {contentLoading ? (
            <p className="text-gray-500 text-sm">コンテンツを読み込み中...</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Like button */}
          {(account || session) && !isAuthor && (
            <button
              onClick={handleLike}
              disabled={isPending || liked}
              className={`${liked ? "bg-pink-900 text-pink-300 cursor-default" : "bg-gray-800 hover:bg-pink-900 hover:text-pink-300"} disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm`}
            >
              {liked ? "❤️ いいね済み" : "🤍 いいね"}
            </button>
          )}

          {!isAuthor && account && account.address !== author && (
            <button
              onClick={handleTip}
              disabled={isPending}
              className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg transition-colors"
            >
              {isPending ? "送信中..." : "0.1 SUI チップを送る"}
            </button>
          )}
          {isAuthor && (
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg transition-colors"
            >
              {isPending ? "削除中..." : "記事を削除"}
            </button>
          )}
        </div>

        {/* Premium lock - only shown to author */}
        {isAuthor && (
          <div className="mt-4 space-y-3">
            <LockAsPremiumButton postId={id} />
            <RevenueShareSetup postId={id} />
          </div>
        )}
      </article>

      {/* Comments */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mt-4">
        <CommentsSection postId={id} />
      </div>
    </div>
  );
}
