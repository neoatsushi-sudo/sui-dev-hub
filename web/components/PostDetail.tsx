"use client";

import { useSuiClientQuery, useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, TJPYC_COIN_TYPE } from "@/lib/sui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useZkLogin } from "@/context/ZkLoginContext";
import { zkLoginSponsoredSignAndExecute } from "@/lib/zklogin";
import { useAuthorName } from "@/lib/profile";
import { CommentsSection } from "@/components/CommentsSection";
import { LockAsPremiumButton } from "@/components/PremiumContent";
import { RevenueShareSetup } from "@/components/RevenueSharing";
import ReadToEarnButton from "@/components/ReadToEarnButton";

const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";

function decodeBytes(bytes: number[]): string {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function shortAddress(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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

export default function PostDetail({ id }: { id: string }) {
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

  // Fetch CoAuthorConfigSet events to check if revenue sharing is enabled
  const { data: coAuthorEvents } = useSuiClientQuery("queryEvents", {
    query: { MoveEventType: `${PACKAGE_ID}::platform::CoAuthorConfigSet` },
    limit: 50,
    order: "descending", // newest first
  });

  const coAuthorConfig = coAuthorEvents?.data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .find((e: any) => e.parsedJson?.post_id === id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ?.parsedJson as any;
  const configId = coAuthorConfig?.config_id;

  // Must call all hooks before any early returns (Rules of Hooks)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authorAddress = data?.data ? (data.data.content as any)?.fields?.author ?? "" : "";
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { displayName, suiNsName, profile, loading: profileLoading } = useAuthorName(authorAddress);

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

  const handleTip = async () => {
    if (!account) return;

    // Fetch TJPYC coins to pay 100 TJPYC (100 * 10^9)
    const TIP_AMOUNT = 100 * 1_000_000_000;
    const coins = await suiClient.getCoins({
      owner: account.address,
      coinType: TJPYC_COIN_TYPE,
    });

    const validCoins = coins.data;
    if (validCoins.length === 0) {
      alert("TJPYCが不足しています。上の「蛇口」ボタンから取得してください。");
      return;
    }

    const tx = new Transaction();

    let paymentCoinId;
    if (validCoins.length > 1) {
      const primaryCoin = tx.object(validCoins[0].coinObjectId);
      const restCoins = validCoins.slice(1).map(c => tx.object(c.coinObjectId));
      tx.mergeCoins(primaryCoin, restCoins);
      paymentCoinId = primaryCoin;
    } else {
      paymentCoinId = tx.object(validCoins[0].coinObjectId);
    }

    const [tipCoin] = tx.splitCoins(paymentCoinId, [tx.pure.u64(TIP_AMOUNT)]);

    if (configId) {
      tx.moveCall({
        target: `${PACKAGE_ID}::platform::tip_with_sharing_token`,
        typeArguments: [TJPYC_COIN_TYPE],
        arguments: [tx.object(id), tx.object(configId), tipCoin],
      });
    } else {
      tx.moveCall({
        target: `${PACKAGE_ID}::platform::tip_token`,
        typeArguments: [TJPYC_COIN_TYPE],
        arguments: [tx.object(id), tipCoin],
      });
    }
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
          <span className="text-purple-400 font-medium">· 💜 チップ獲得: {tipBalance.toLocaleString()} 円</span>
          {configId && (
            <span className="ml-2 flex items-center gap-1 text-[10px] bg-purple-900/40 border border-purple-800/50 text-purple-300 px-2 rounded-full">
              ✨ 収益分配 ON
            </span>
          )}
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

        {/* Read-to-Earn: 著者本人以外に表示 */}
        {!isAuthor && (account || session) && (
          <ReadToEarnButton postId={id} />
        )}

        {/* Author Card */}
        <div className="mt-12 pt-8 border-t border-gray-800">
          <h3 className="text-lg font-bold text-white mb-6">この記事を書いた人</h3>
          <div
            onClick={() => router.push(`/profile/${authorAddress}`)}
            className="group block bg-gray-900/50 hover:bg-gray-800/50 rounded-2xl p-6 border border-gray-800 hover:border-gray-700 transition-all cursor-pointer relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-purple-600/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative z-10 flex flex-col sm:flex-row gap-5 items-start sm:items-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 border-2 border-gray-700 shadow-lg flex-shrink-0 flex items-center justify-center text-2xl">
                {profile?.username ? profile.username.charAt(0).toUpperCase() : "👤"}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded-md font-medium text-xs ${
                    suiNsName ? "bg-blue-900 text-blue-300" : "bg-gray-800 text-gray-300"
                  }`}>
                    {suiNsName ? `🔷 ${displayName}` : displayName}
                  </span>
                  <span className="text-gray-500 text-xs font-mono">
                    {shortAddress(authorAddress)}
                  </span>
                </div>
                {profileLoading ? (
                  <div className="h-4 bg-gray-800 rounded w-3/4 animate-pulse mt-2"></div>
                ) : (
                  <p className="text-gray-400 text-sm leading-relaxed mt-2 line-clamp-2">
                    {profile?.bio || "自己紹介はまだありません。"}
                  </p>
                )}
              </div>
              <div className="hidden sm:flex text-gray-500 group-hover:text-white transition-colors text-sm">
                → プロフィールを見る
              </div>
            </div>
          </div>
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
              className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 font-medium px-5 py-2 rounded-full transition-all flex items-center gap-2"
            >
              {isPending ? "送信中..." : "🎁 100円分サポートする"}
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
