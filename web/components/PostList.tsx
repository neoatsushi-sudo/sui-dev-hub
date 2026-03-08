"use client";

import { useSuiClientQuery, useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, OLD_PACKAGE_ID } from "@/lib/sui";
import { useRouter } from "next/navigation";
import { useZkLogin } from "@/context/ZkLoginContext";
import { zkLoginSponsoredSignAndExecute } from "@/lib/zklogin";
import { useState } from "react";

type Post = {
  objectId: string;
  content: {
    fields: {
      title: number[];
      content_hash: number[];
      author: string;
      tip_balance: string;
    };
  };
};

function decodeBytes(bytes: number[]): string {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function PostCard({ post }: { post: Post }) {
  const account = useCurrentAccount();
  const { session } = useZkLogin();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending: walletPending } = useSignAndExecuteTransaction();
  const [zkPending, setZkPending] = useState(false);
  const router = useRouter();
  const fields = post.content.fields;
  const isPending = walletPending || zkPending;

  const isAuthor =
    (account && account.address === fields.author) ||
    (session && !account && session.address === fields.author);

  const handleTip = () => {
    if (!account) return;
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(100_000_000)]);
    tx.moveCall({
      target: `${PACKAGE_ID}::platform::tip`,
      arguments: [tx.object(post.objectId), coin],
    });
    signAndExecute({ transaction: tx });
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::platform::delete_post`,
      arguments: [tx.object(post.objectId)],
    });

    if (session && !account) {
      try {
        setZkPending(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await zkLoginSponsoredSignAndExecute(session, tx, suiClient as any);
      } finally {
        setZkPending(false);
      }
      return;
    }

    if (account) {
      signAndExecute({ transaction: tx });
    }
  };

  return (
    <div
      className="bg-gray-900 rounded-xl p-5 border border-gray-800 cursor-pointer hover:border-gray-600 transition-colors"
      onClick={() => router.push(`/post/${post.objectId}`)}
    >
      <h3 className="text-white font-semibold text-lg mb-1">
        {decodeBytes(fields.title)}
      </h3>
      <p className="text-gray-500 text-xs mb-3">
        by {shortAddress(fields.author)} · チップ合計: {Number(fields.tip_balance) / 1e9} SUI
      </p>
      <p className="text-gray-500 text-xs mb-4">記事を読む →</p>
      <div className="flex items-center gap-2">
        {!isAuthor && account && account.address !== fields.author && (
          <button
            onClick={(e) => { e.stopPropagation(); handleTip(); }}
            disabled={isPending}
            className="text-sm bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition-colors"
          >
            {isPending ? "送信中..." : "0.1 SUI チップ"}
          </button>
        )}
        {isAuthor && (
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="text-sm bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition-colors"
          >
            {isPending ? "削除中..." : "削除"}
          </button>
        )}
      </div>
    </div>
  );
}

function useAllPostIds() {
  const { data: newData } = useSuiClientQuery("queryEvents", {
    query: { MoveEventType: `${PACKAGE_ID}::platform::PostCreated` },
    limit: 20,
    order: "descending",
  });
  const { data: oldData } = useSuiClientQuery("queryEvents", {
    query: { MoveEventType: `${OLD_PACKAGE_ID}::platform::PostCreated` },
    limit: 20,
    order: "descending",
  });
  const { data: deletedData } = useSuiClientQuery("queryEvents", {
    query: { MoveEventType: `${PACKAGE_ID}::platform::PostDeleted` },
    limit: 50,
  });

  const deletedIds = new Set(
    (deletedData?.data ?? []).map((e) => (e.parsedJson as { post_id: string }).post_id)
  );

  const newIds = (newData?.data ?? []).map((e) => (e.parsedJson as { post_id: string }).post_id);
  const oldIds = (oldData?.data ?? []).map((e) => (e.parsedJson as { post_id: string }).post_id);

  return [...new Set([...newIds, ...oldIds])].filter((id) => !deletedIds.has(id));
}

export function PostList() {
  const postIds = useAllPostIds();

  const { data: objects, isLoading } = useSuiClientQuery(
    "multiGetObjects",
    { ids: postIds, options: { showContent: true } },
    { enabled: postIds.length > 0 }
  );

  if (isLoading) return <p className="text-gray-500 text-sm">読み込み中...</p>;

  const validPosts = (objects ?? []).filter((obj) => obj.data?.content);

  if (!validPosts.length) return <p className="text-gray-500 text-sm">まだ記事がありません。最初の投稿をしてみましょう！</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-200">最新記事</h2>
      {validPosts.map((obj) => (
        obj.data ? <PostCard key={obj.data.objectId} post={obj.data as unknown as Post} /> : null
      ))}
    </div>
  );
}
