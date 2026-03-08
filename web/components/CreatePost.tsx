"use client";

import { useState } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID } from "@/lib/sui";

export function CreatePost() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content || !account) return;

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::platform::create_post`,
      arguments: [
        tx.pure.string(title),
        tx.pure.string(content), // 将来はWalrus blob IDに置き換え
      ],
    });

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: () => {
          setTitle("");
          setContent("");
          setDone(true);
          setTimeout(() => setDone(false), 3000);
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <h2 className="text-lg font-semibold mb-4">記事を投稿</h2>
      <input
        className="w-full bg-gray-800 rounded-lg px-4 py-2 mb-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="タイトル"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="w-full bg-gray-800 rounded-lg px-4 py-2 mb-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500 h-28 resize-none"
        placeholder="本文（Markdown）"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <button
        type="submit"
        disabled={isPending || !title || !content}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-5 py-2 rounded-lg transition-colors"
      >
        {isPending ? "送信中..." : "投稿する"}
      </button>
      {done && <span className="ml-3 text-green-400 text-sm">投稿しました！</span>}
    </form>
  );
}
