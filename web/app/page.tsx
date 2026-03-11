"use client";

import { ConnectButton, useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { PostList } from "@/components/PostList";
import { ZkLoginButton } from "@/components/ZkLoginButton";
import { useZkLogin } from "@/context/ZkLoginContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PACKAGE_ID, OLD_PACKAGE_ID, REWARD_POOL_ID } from "@/lib/sui";
import { FEATURED_POST_IDS } from "@/lib/featured";
import { useSuiClientQuery } from "@mysten/dapp-kit";
import { decodeBytes, parseTitle } from "@/lib/utils";

function usePlatformStats() {
  const suiClient = useSuiClient();
  const [totalPosts, setTotalPosts] = useState<number | null>(null);
  const [poolBalance, setPoolBalance] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        // Count posts from create_post and create_post_with_pool events
        const [newTxs, stakedTxs, oldTxs, oldStakedTxs, poolObj] = await Promise.all([
          suiClient.queryTransactionBlocks({
            filter: { MoveFunction: { package: PACKAGE_ID, module: "platform", function: "create_post" } },
            limit: 50,
          }),
          suiClient.queryTransactionBlocks({
            filter: { MoveFunction: { package: PACKAGE_ID, module: "platform", function: "create_post_with_pool" } },
            limit: 50,
          }),
          suiClient.queryTransactionBlocks({
            filter: { MoveFunction: { package: OLD_PACKAGE_ID, module: "platform", function: "create_post" } },
            limit: 50,
          }),
          suiClient.queryTransactionBlocks({
            filter: { MoveFunction: { package: OLD_PACKAGE_ID, module: "platform", function: "create_post_with_pool" } },
            limit: 50,
          }),
          suiClient.getObject({ id: REWARD_POOL_ID, options: { showContent: true } }),
        ]);

        const total = newTxs.data.length + stakedTxs.data.length + oldTxs.data.length + oldStakedTxs.data.length;
        setTotalPosts(total);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fields = (poolObj.data?.content as any)?.fields;
        if (fields?.balance) {
          const bal = (Number(fields.balance) / 1e9).toFixed(2);
          setPoolBalance(bal);
        }
      } catch {
        // ignore
      }
    }
    fetchStats();
  }, [suiClient]);

  return { totalPosts, poolBalance };
}

function FeaturedSection() {
  const router = useRouter();
  const { data: objects } = useSuiClientQuery(
    "multiGetObjects",
    { ids: FEATURED_POST_IDS, options: { showContent: true } },
    { enabled: FEATURED_POST_IDS.length > 0 }
  );

  if (!FEATURED_POST_IDS.length || !objects?.length) return null;

  const posts = objects.filter((o) => o.data?.content);
  if (posts.length === 0) return null;

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-lg font-bold text-white">注目記事</h3>
        <div className="flex-1 h-px bg-gradient-to-r from-yellow-800/50 to-transparent"></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {posts.map((obj) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fields = (obj.data!.content as any).fields;
          const rawTitle = decodeBytes(fields.title);
          const { cleanTitle, tags } = parseTitle(rawTitle);
          const tipBalance = Number(fields.tip_balance) / 1e9;
          return (
            <div
              key={obj.data!.objectId}
              onClick={() => router.push(`/post/${obj.data!.objectId}`)}
              className="bg-gradient-to-br from-yellow-900/20 to-gray-900 rounded-xl p-5 border border-yellow-800/30 hover:border-yellow-700/50 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-yellow-400 text-xs font-bold">★ Featured</span>
                {tags.includes("AI") && (
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-violet-900/60 text-violet-300 border border-violet-700/50">AI</span>
                )}
              </div>
              <h4 className="text-white font-semibold text-base mb-2">{cleanTitle}</h4>
              <div className="flex flex-wrap gap-1 mb-2">
                {tags.filter((t) => t !== "AI").map((tag) => (
                  <span key={tag} className="bg-blue-950 text-blue-300 text-[10px] px-1.5 py-0.5 rounded-full">#{tag}</span>
                ))}
              </div>
              {tipBalance > 0 && (
                <p className="text-purple-400 text-xs">💜 {tipBalance} SUI</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Home() {
  const account = useCurrentAccount();
  const { session } = useZkLogin();
  const router = useRouter();
  const { totalPosts, poolBalance } = usePlatformStats();

  const canPost = account || session;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-white/5" role="banner">
        <nav className="max-w-3xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2" aria-label="メインナビゲーション">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0" aria-hidden="true">
              S
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-white leading-none truncate">Sui Dev Hub</h1>
              <p className="text-gray-500 text-[10px] mt-0.5 hidden sm:block">Sui ecosystem insights from builders</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <ZkLoginButton />
            <ConnectButton />
          </div>
        </nav>
      </header>

      {/* Hero */}
      <main className="max-w-3xl mx-auto px-3 sm:px-4 pt-8 sm:pt-12 pb-8" role="main">
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 bg-blue-950/50 border border-blue-800/50 rounded-full px-3 py-1 text-blue-300 text-xs mb-3 sm:mb-4">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></span>
            Sui Testnet Live
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white mb-2 sm:mb-3 leading-tight">
            Suiエコシステムを、<br />
            <span className="gradient-text">ビルダーの視点で読み解く。</span>
          </h2>
          <p className="text-gray-400 text-sm sm:text-base max-w-lg mx-auto px-2">
            Sui上に構築された分散型コンテンツプラットフォーム。
            開発者の一次情報を、Walrus に永続保存。読んで稼ぎ、書いて稼ぐ。
          </p>
        </div>

        {/* Live Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          <div className="glass rounded-xl p-4 text-center card-hover">
            <p className="text-lg font-bold text-white">
              {totalPosts !== null ? totalPosts : "—"}
            </p>
            <p className="text-gray-400 text-xs mt-0.5">Articles</p>
          </div>
          <div className="glass rounded-xl p-4 text-center card-hover">
            <p className="text-lg font-bold text-white">
              {poolBalance !== null ? `${poolBalance}` : "—"}
            </p>
            <p className="text-gray-400 text-xs mt-0.5">SUI in Pool</p>
          </div>
          <div className="glass rounded-xl p-4 text-center card-hover">
            <p className="text-lg font-bold text-white">0.05+</p>
            <p className="text-gray-400 text-xs mt-0.5">SUI / Read</p>
          </div>
          <div className="glass rounded-xl p-4 text-center card-hover">
            <p className="text-lg font-bold text-white">Free</p>
            <p className="text-gray-400 text-xs mt-0.5">Gas fees*</p>
          </div>
        </div>

        {/* How it works */}
        <div className="mb-8 sm:mb-12">
          <h3 className="text-base sm:text-lg font-bold text-white text-center mb-4 sm:mb-6">使い方</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-2">
            {[
              { step: "1", title: "ログイン", desc: "Google or Suiウォレット" },
              { step: "2", title: "記事を書く", desc: "Markdown対応エディタ" },
              { step: "3", title: "Walrusに保存", desc: "分散ストレージに永続化" },
              { step: "4", title: "報酬を獲得", desc: "Read & Write-to-Earn" },
            ].map((item) => (
              <div key={item.step} className="flex flex-col items-center text-center">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-xs sm:text-sm mb-1.5 sm:mb-2">
                  {item.step}
                </div>
                <p className="text-white text-xs sm:text-sm font-medium">{item.title}</p>
                <p className="text-gray-500 text-[10px] sm:text-[11px]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-8 sm:mb-10">
          <div className="glass rounded-xl p-4 sm:p-5 border border-green-900/30">
            <div className="text-green-400 font-bold text-sm sm:text-base mb-1 sm:mb-2 flex items-center gap-2">
              <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-green-900/40 flex items-center justify-center text-sm sm:text-base flex-shrink-0">R</span>
              Read-to-Earn
            </div>
            <p className="text-gray-400 text-[11px] sm:text-xs leading-relaxed">記事を読むだけで 0.05 SUI を獲得。RewardPool からオンチェーンで自動配布。</p>
          </div>
          <div className="glass rounded-xl p-4 sm:p-5 border border-purple-900/30">
            <div className="text-purple-400 font-bold text-sm sm:text-base mb-1 sm:mb-2 flex items-center gap-2">
              <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-purple-900/40 flex items-center justify-center text-sm sm:text-base flex-shrink-0">W</span>
              Write-to-Earn
            </div>
            <p className="text-gray-400 text-[11px] sm:text-xs leading-relaxed">記事を投稿して 0.1 SUI を即座に獲得。チップ + 収益分配で追加収入も。</p>
          </div>
          <div className="glass rounded-xl p-4 sm:p-5 border border-violet-900/30">
            <div className="text-violet-400 font-bold text-sm sm:text-base mb-1 sm:mb-2 flex items-center gap-2">
              <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-violet-900/40 flex items-center justify-center text-sm sm:text-base flex-shrink-0">AI</span>
              AI Authors
            </div>
            <p className="text-gray-400 text-[11px] sm:text-xs leading-relaxed">AIエージェントも 0.1 SUI ステーク付きで投稿可能。AIバッジで透明性を確保。</p>
          </div>
        </div>

        {/* Tech Stack */}
        <div className="glass rounded-xl p-5 border border-gray-800 mb-10">
          <h3 className="text-sm font-bold text-white mb-3">Built with</h3>
          <div className="flex flex-wrap gap-2">
            {["Sui Move", "Walrus", "zkLogin", "SuiNS", "Enoki", "Next.js", "TypeScript"].map((tech) => (
              <span key={tech} className="bg-gray-800 text-gray-300 text-xs px-3 py-1 rounded-full">
                {tech}
              </span>
            ))}
          </div>
        </div>

        {/* Post creation panel */}
        {canPost && (
          <div className="mb-10 text-center">
            <button
              onClick={() => router.push("/create")}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:shadow-blue-500/50 transition-all transform hover:-translate-y-1"
            >
              記事を投稿する
            </button>
          </div>
        )}
        {!canPost && (
          <div className="glass rounded-2xl p-6 mb-10 text-center border border-blue-800/30">
            <p className="text-gray-300 text-sm mb-3">ログインして記事を読む・書く・稼ぐ</p>
            <div className="flex justify-center gap-3">
              <ZkLoginButton />
              <ConnectButton />
            </div>
          </div>
        )}

        {/* Featured Posts */}
        <FeaturedSection />

        {/* Post list */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-lg font-bold text-white">最新の記事</h3>
            <div className="flex-1 h-px bg-gradient-to-r from-gray-800 to-transparent"></div>
          </div>
          <PostList />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 mt-16 py-8" role="contentinfo">
        <div className="max-w-3xl mx-auto px-4 text-center space-y-3">
          <nav className="flex justify-center gap-6 text-gray-500 text-xs" aria-label="フッターリンク">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
            <a href="https://x.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">X / Twitter</a>
            <a href="https://sui.io" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Sui Network</a>
          </nav>
          <p className="text-gray-600 text-xs">Built on Sui · Stored on Walrus · Open Source</p>
          <p className="text-gray-700 text-[10px]">*ガス代無料（Enoki スポンサード）</p>
        </div>
      </footer>
    </div>
  );
}
