"use client";

import { useSuiClientQuery, useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, OLD_PACKAGE_ID } from "@/lib/sui";
import { useRouter } from "next/navigation";
import { useZkLogin } from "@/context/ZkLoginContext";
import { zkLoginSponsoredSignAndExecute } from "@/lib/zklogin";
import { useState, useMemo } from "react";
import { useAuthorName } from "@/lib/profile";
import { decodeBytes, parseTitle } from "@/lib/utils";
import { useBookmarks } from "@/lib/bookmarks";

export type Post = {
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

type SortOption = "newest" | "popular";

function PostCard({ post }: { post: Post }) {
  const account = useCurrentAccount();
  const { session } = useZkLogin();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending: walletPending } = useSignAndExecuteTransaction();
  const [zkPending, setZkPending] = useState(false);
  const router = useRouter();
  const fields = post.content.fields;
  const isPending = walletPending || zkPending;
  const { displayName, suiNsName } = useAuthorName(fields.author);
  const { toggleBookmark, isBookmarked } = useBookmarks();
  const { cleanTitle, tags } = parseTitle(decodeBytes(fields.title));

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
    if (!confirm("この記事を削除しますか？")) return;
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
      } catch (err) {
        alert(`削除失敗: ${String(err)}`);
      } finally {
        setZkPending(false);
      }
      return;
    }

    if (account) {
      signAndExecute({ transaction: tx }, {
        onError: (err) => alert(`削除失敗: ${String(err)}`),
      });
    }
  };

  return (
    <div
      className="bg-gray-900 rounded-xl p-5 border border-gray-800 cursor-pointer hover:border-gray-600 transition-colors"
      onClick={() => router.push(`/post/${post.objectId}`)}
    >
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-white font-semibold text-lg flex-1">
          {cleanTitle}
        </h3>
        {tags.includes("AI") && (
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-violet-900/60 text-violet-300 border border-violet-700/50 flex-shrink-0">
            AI
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); toggleBookmark(post.objectId, cleanTitle); }}
          className={`flex-shrink-0 text-sm transition-colors ${
            isBookmarked(post.objectId) ? "text-yellow-400" : "text-gray-600 hover:text-gray-400"
          }`}
          title={isBookmarked(post.objectId) ? "保存済み" : "保存する"}
        >
          {isBookmarked(post.objectId) ? "★" : "☆"}
        </button>
      </div>
      {tags.filter((t) => t !== "AI").length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.filter((t) => t !== "AI").map((tag) => (
            <span key={tag} className="bg-blue-950 text-blue-300 text-[10px] px-1.5 py-0.5 rounded-full">#{tag}</span>
          ))}
        </div>
      )}
      <p className="text-gray-500 text-xs mb-3 flex items-center gap-2">
        <span
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/profile/${fields.author}`);
          }}
          className={`px-2 py-0.5 rounded-md font-medium text-[10px] cursor-pointer transition-colors ${
            suiNsName ? "bg-blue-900 text-blue-300 hover:bg-blue-800" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          {suiNsName ? `🔷 ${displayName}` : displayName}
        </span>
        <span>· {Number(fields.tip_balance) > 0 ? `💜 ${(Number(fields.tip_balance) / 1e9).toLocaleString()} SUI` : ""}</span>
      </p>
      <p className="text-gray-500 text-xs mb-4">記事を読む →</p>
      <div className="flex items-center gap-2">
        {!isAuthor && account && account.address !== fields.author && (
          <button
            onClick={(e) => { e.stopPropagation(); handleTip(); }}
            disabled={isPending}
            className="text-sm bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition-colors"
          >
            {isPending ? "送信中..." : "🎁 0.1 SUI サポート"}
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useAllPostIds() {
  const { data: newTxs, isPending: isNewPending } = useSuiClientQuery(
    "queryTransactionBlocks",
    {
      filter: { MoveFunction: { package: PACKAGE_ID, module: "platform", function: "create_post" } },
      options: { showEvents: true },
      limit: 50,
      order: "descending",
    },
    { refetchInterval: 5000 }
  );

  // ステーク付き投稿も検索 (AI投稿 = create_post_with_pool)
  const { data: stakedTxs, isPending: isStakedPending } = useSuiClientQuery(
    "queryTransactionBlocks",
    {
      filter: { MoveFunction: { package: PACKAGE_ID, module: "platform", function: "create_post_with_pool" } },
      options: { showEvents: true },
      limit: 50,
      order: "descending",
    },
    { refetchInterval: 5000 }
  );

  const { data: oldTxs, isPending: isOldPending } = useSuiClientQuery(
    "queryTransactionBlocks",
    {
      filter: { MoveFunction: { package: OLD_PACKAGE_ID, module: "platform", function: "create_post" } },
      options: { showEvents: true },
      limit: 50,
      order: "descending",
    }
  );

  // 旧バージョンのステーク付き投稿も検索
  const { data: oldStakedTxs } = useSuiClientQuery(
    "queryTransactionBlocks",
    {
      filter: { MoveFunction: { package: OLD_PACKAGE_ID, module: "platform", function: "create_post_with_pool" } },
      options: { showEvents: true },
      limit: 50,
      order: "descending",
    }
  );

  const { data: deleteTxs } = useSuiClientQuery(
    "queryTransactionBlocks",
    {
      filter: { MoveFunction: { package: PACKAGE_ID, module: "platform", function: "delete_post" } },
      options: { showEvents: true },
      limit: 50,
      order: "descending",
    },
    { refetchInterval: 10000 }
  );

  // 旧バージョンの削除も検索
  const { data: oldDeleteTxs } = useSuiClientQuery(
    "queryTransactionBlocks",
    {
      filter: { MoveFunction: { package: OLD_PACKAGE_ID, module: "platform", function: "delete_post" } },
      options: { showEvents: true },
      limit: 50,
      order: "descending",
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getPostIdsFromTxs = (txsData: any[] | undefined, eventSuffix: string) => {
    const ids: string[] = [];
    if (!txsData) return ids;
    txsData.forEach((tx) => {
      if (tx.events) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tx.events.forEach((ev: any) => {
          if (ev.type.includes(eventSuffix) && ev.parsedJson?.post_id) {
            ids.push(ev.parsedJson.post_id as string);
          }
        });
      }
    });
    return ids;
  };

  const newIds = getPostIdsFromTxs(newTxs?.data, "::platform::PostCreated");
  const stakedIds = getPostIdsFromTxs(stakedTxs?.data, "::platform::PostCreated");
  const oldIds = getPostIdsFromTxs(oldTxs?.data, "::platform::PostCreated");
  const oldStakedIds = getPostIdsFromTxs(oldStakedTxs?.data, "::platform::PostCreated");
  const deletedIdsList = [
    ...getPostIdsFromTxs(deleteTxs?.data, "::platform::PostDeleted"),
    ...getPostIdsFromTxs(oldDeleteTxs?.data, "::platform::PostDeleted"),
  ];

  const deletedIds = new Set(deletedIdsList);

  return {
    postIds: [...new Set([...newIds, ...stakedIds, ...oldIds, ...oldStakedIds])].filter((id) => !deletedIds.has(id)),
    isEventsLoading: isNewPending || isOldPending || isStakedPending,
  };
}

export function PostList({ authorAddress }: { authorAddress?: string } = {}) {
  const { postIds, isEventsLoading } = useAllPostIds();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [showSaved, setShowSaved] = useState(false);
  const { bookmarkedIds } = useBookmarks();

  const { data: objects, isLoading: isObjectsLoading } = useSuiClientQuery(
    "multiGetObjects",
    { ids: postIds, options: { showContent: true } },
    { enabled: postIds.length > 0 }
  );

  const isLoading = isEventsLoading || (postIds.length > 0 && isObjectsLoading);

  // Process posts: filter by author, parse titles, extract tags
  const { filteredPosts, allTags } = useMemo(() => {
    const validPosts = (objects ?? []).filter((obj) => {
      if (!obj.data?.content) return false;
      if (authorAddress) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const author = (obj.data.content as any).fields?.author;
        return author === authorAddress;
      }
      return true;
    }) as unknown as { data: Post }[];

    // Collect all unique tags
    const tagSet = new Set<string>();
    const postsWithParsed = validPosts.map((obj) => {
      const post = obj.data as unknown as Post;
      const rawTitle = decodeBytes(post.content.fields.title);
      const { cleanTitle, tags } = parseTitle(rawTitle);
      tags.forEach((t) => tagSet.add(t));
      return { post, cleanTitle, tags };
    });

    // Filter by search query
    let filtered = postsWithParsed;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((p) => p.cleanTitle.toLowerCase().includes(q));
    }

    // Filter by selected tag
    if (selectedTag) {
      filtered = filtered.filter((p) => p.tags.includes(selectedTag));
    }

    // Filter by bookmarks
    if (showSaved) {
      const savedSet = new Set(bookmarkedIds);
      filtered = filtered.filter((p) => savedSet.has(p.post.objectId));
    }

    // Sort
    if (sortBy === "popular") {
      filtered.sort((a, b) =>
        Number(b.post.content.fields.tip_balance) - Number(a.post.content.fields.tip_balance)
      );
    }
    // "newest" keeps the original order (already descending by creation)

    return {
      filteredPosts: filtered.map((p) => p.post),
      allTags: [...tagSet].sort(),
    };
  }, [objects, authorAddress, searchQuery, selectedTag, sortBy, showSaved, bookmarkedIds]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-200">最新記事</h2>
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-gray-900 rounded-xl p-5 border border-gray-800">
            <div className="h-6 bg-gray-800 rounded-md w-3/4 mb-4"></div>
            <div className="flex gap-2 mb-4">
              <div className="h-5 bg-gray-800 rounded-full w-16"></div>
              <div className="h-5 bg-gray-800 rounded-full w-16"></div>
            </div>
            <div className="h-4 bg-gray-800 rounded-md w-1/2 mb-5"></div>
            <div className="flex gap-2">
              <div className="h-8 bg-gray-800 rounded-lg w-24"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search, Sort & Tag Filter UI */}
      {!authorAddress && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="記事を検索..."
              className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="flex bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <button
                onClick={() => { setSortBy("newest"); setShowSaved(false); }}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  sortBy === "newest" && !showSaved
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                新着
              </button>
              <button
                onClick={() => { setSortBy("popular"); setShowSaved(false); }}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  sortBy === "popular" && !showSaved
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                人気
              </button>
              <button
                onClick={() => setShowSaved(!showSaved)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  showSaved
                    ? "bg-yellow-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                ★ 保存済み
              </button>
            </div>
          </div>

          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedTag(null)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                  selectedTag === null
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                ALL
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                    selectedTag === tag
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <h2 className="text-lg font-semibold text-gray-200">
        {sortBy === "popular" ? "人気記事" : "最新記事"}
        {selectedTag && <span className="text-blue-400 text-sm ml-2">#{selectedTag}</span>}
        {searchQuery.trim() && <span className="text-gray-500 text-sm ml-2">「{searchQuery.trim()}」の検索結果</span>}
      </h2>

      {filteredPosts.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {searchQuery.trim() || selectedTag ? "該当する記事が見つかりません。" : "まだ記事がありません。"}
        </p>
      ) : (
        filteredPosts.map((post) => (
          <PostCard key={post.objectId} post={post} />
        ))
      )}
    </div>
  );
}
