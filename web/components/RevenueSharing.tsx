"use client";

import { useState } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID } from "@/lib/sui";
import { useZkLogin } from "@/context/ZkLoginContext";
import { zkLoginSponsoredSignAndExecute } from "@/lib/zklogin";

type Author = {
  address: string;
  share: number; // percentage 0-100
};

// Panel for post author to add co-authors and set revenue splits
export function RevenueShareSetup({ postId }: { postId: string }) {
  const account = useCurrentAccount();
  const { session } = useZkLogin();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending: walletPending } = useSignAndExecuteTransaction();
  const [authors, setAuthors] = useState<Author[]>([{ address: "", share: 100 }]);
  const [zkPending, setZkPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const isPending = walletPending || zkPending;

  const totalShare = authors.reduce((acc, a) => acc + a.share, 0);
  const isValid = authors.length >= 2 && totalShare === 100 && authors.every((a) => a.address.trim().startsWith("0x"));

  const addAuthor = () => {
    if (authors.length >= 5) return;
    setAuthors((prev) => [...prev, { address: "", share: 0 }]);
  };

  const removeAuthor = (idx: number) => {
    setAuthors((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateAuthor = (idx: number, field: keyof Author, value: string | number) => {
    setAuthors((prev) => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setError("");

    // Convert to basis points (100% = 10000 bps)
    const co_authors = authors.map((a) => a.address.trim());
    const shares_bps = authors.map((a) => Math.round(a.share * 100));

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::platform::set_coauthor_config`,
      arguments: [
        tx.object(postId),
        tx.pure.vector("address", co_authors),
        tx.pure.vector("u64", shares_bps),
      ],
    });

    if (session && !account) {
      try {
        setZkPending(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await zkLoginSponsoredSignAndExecute(session, tx, suiClient as any);
        setDone(true);
      } catch (err) {
        setError(String(err));
      } finally {
        setZkPending(false);
      }
      return;
    }
    if (account) {
      signAndExecute({ transaction: tx }, {
        onSuccess: () => setDone(true),
        onError: (err) => setError(String(err)),
      });
    }
  };

  if (done) {
    return (
      <div className="bg-green-950/30 border border-green-700/40 rounded-xl p-4 text-center">
        <p className="text-green-300 font-semibold">✅ 収益分配設定完了！</p>
        <p className="text-gray-400 text-xs mt-1">チップは設定したConfigオブジェクトを通じて共同著者に自動分配されます</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-purple-950/20 border border-purple-800/40 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-purple-300 font-semibold text-sm">💜 収益分配（Revenue Sharing）</p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          totalShare === 100 ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"
        }`}>
          合計 {totalShare}%
        </span>
      </div>
      <p className="text-gray-400 text-xs mb-4">
        共同著者を追加してチップの自動分配率を設定します。合計は100%になるように設定してください。チップは即座に各著者のウォレットへ送られます。
      </p>

      <div className="space-y-2 mb-4">
        {authors.map((author, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs outline-none focus:ring-1 focus:ring-purple-500 font-mono"
              placeholder={idx === 0 ? "あなたのアドレス (0x...)" : `共同著者 ${idx} のアドレス (0x...)`}
              value={author.address}
              onChange={(e) => updateAuthor(idx, "address", e.target.value)}
            />
            <div className="relative w-20">
              <input
                type="number"
                min={1}
                max={99}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-white text-xs outline-none focus:ring-1 focus:ring-purple-500 text-right pr-5"
                value={author.share}
                onChange={(e) => updateAuthor(idx, "share", Number(e.target.value))}
              />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 text-[10px]">%</span>
            </div>
            {authors.length > 2 && (
              <button
                type="button"
                onClick={() => removeAuthor(idx)}
                className="text-gray-500 hover:text-red-400 text-xs w-6 h-6 flex items-center justify-center"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {authors.length < 5 && (
          <button
            type="button"
            onClick={addAuthor}
            className="text-purple-400 hover:text-purple-300 border border-purple-800/50 rounded-lg px-3 py-1.5 text-xs transition-colors"
          >
            + 著者を追加
          </button>
        )}
        <button
          type="submit"
          disabled={isPending || !isValid}
          className="ml-auto bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-4 py-1.5 rounded-lg text-xs transition-colors"
        >
          {isPending ? "設定中..." : "収益分配を設定する"}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      {!isValid && authors.length >= 2 && totalShare !== 100 && (
        <p className="text-amber-400 text-xs mt-2">⚠ 合計が{totalShare}%です。100%になるように調整してください。</p>
      )}
    </form>
  );
}
