"use client";

import { useSuiClientQuery, useSignAndExecuteTransaction, useCurrentAccount } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID } from "@/lib/sui";
import { useRouter } from "next/navigation";

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
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const router = useRouter();
  const fields = post.content.fields;

  const handleTip = () => {
    if (!account) return;
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(100_000_000)]); // 0.1 SUI
    tx.moveCall({
      target: `${PACKAGE_ID}::platform::tip`,
      arguments: [tx.object(post.objectId), coin],
    });
    signAndExecute({ transaction: tx });
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
      <p className="text-gray-300 text-sm mb-4 line-clamp-3">
        {decodeBytes(fields.content_hash)}
      </p>
      {account && account.address !== fields.author && (
        <button
          onClick={(e) => { e.stopPropagation(); handleTip(); }}
          disabled={isPending}
          className="text-sm bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition-colors"
        >
          {isPending ? "送信中..." : "0.1 SUI チップ"}
        </button>
      )}
    </div>
  );
}

export function PostList() {
  const { data, isLoading } = useSuiClientQuery("queryEvents", {
    query: { MoveEventType: `${PACKAGE_ID}::platform::PostCreated` },
    limit: 20,
    order: "descending",
  });

  const postIds = data?.data.map((e) => {
    const parsed = e.parsedJson as { post_id: string };
    return parsed.post_id;
  }) ?? [];

  const { data: objects } = useSuiClientQuery(
    "multiGetObjects",
    { ids: postIds, options: { showContent: true } },
    { enabled: postIds.length > 0 }
  );

  if (isLoading) return <p className="text-gray-500 text-sm">読み込み中...</p>;
  if (!objects?.length) return <p className="text-gray-500 text-sm">まだ記事がありません。最初の投稿をしてみましょう！</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-200">最新記事</h2>
      {objects.map((obj) => (
        obj.data ? <PostCard key={obj.data.objectId} post={obj.data as unknown as Post} /> : null
      ))}
    </div>
  );
}
