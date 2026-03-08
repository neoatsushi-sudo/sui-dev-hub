"use client";

import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { CreatePost } from "@/components/CreatePost";
import { PostList } from "@/components/PostList";

export default function Home() {
  const account = useCurrentAccount();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <header className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-2xl font-bold text-white">Sui Dev Hub</h1>
          <p className="text-gray-400 text-sm mt-1">Sui開発者のための技術記事プラットフォーム</p>
        </div>
        <ConnectButton />
      </header>

      {account && (
        <div className="mb-8">
          <CreatePost />
        </div>
      )}

      <PostList />
    </div>
  );
}
