"use client";

import { useState, useEffect } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { TJPYC_PACKAGE_ID, TJPYC_TREASURY_CAP, TJPYC_COIN_TYPE } from "@/lib/sui";
import { useZkLogin } from "@/context/ZkLoginContext";
import { zkLoginSponsoredSignAndExecute } from "@/lib/zklogin";

export function TJPYCFaucet() {
  const account = useCurrentAccount();
  const { session } = useZkLogin();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending: walletPending } = useSignAndExecuteTransaction();
  const [zkPending, setZkPending] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const isPending = walletPending || zkPending;

  const address = account?.address || session?.address;

  useEffect(() => {
    if (!address) {
      setBalance(null);
      return;
    }
    const fetchBalance = async () => {
      try {
        const bl = await suiClient.getBalance({
          owner: address,
          coinType: TJPYC_COIN_TYPE,
        });
        setBalance((Number(bl.totalBalance) / 1_000_000_000).toLocaleString());
      } catch (e) {
        console.error(e);
      }
    };
    fetchBalance();
    // Refresh randomly or after actions, but simple interval for now
    const intv = setInterval(fetchBalance, 10000);
    return () => clearInterval(intv);
  }, [address, suiClient]);

  const handleMint = async () => {
    if (!address) return;
    const tx = new Transaction();
    tx.moveCall({
      target: `${TJPYC_PACKAGE_ID}::tjpyc::mint_to_sender`,
      arguments: [tx.object(TJPYC_TREASURY_CAP)],
    });

    if (session && !account) {
      try {
        setZkPending(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await zkLoginSponsoredSignAndExecute(session, tx, suiClient as any);
        // refresh immediately not needed, interval will catch it, but we can optimistically do it
      } finally {
        setZkPending(false);
      }
      return;
    }
    if (account) {
      signAndExecute({ transaction: tx });
    }
  };

  if (!address) return null;

  return (
    <div className="flex items-center gap-3 bg-blue-950/40 border border-blue-800/50 rounded-lg px-3 py-1.5 backdrop-blur-sm">
      <div className="flex flex-col">
        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">TSUI-JPY (テスト円)</span>
        <span className="text-sm font-bold text-white leading-none">
          {balance !== null ? `${balance} 円` : "..."}
        </span>
      </div>
      <div className="w-px h-6 bg-blue-800/50 mx-1"></div>
      <button
        onClick={handleMint}
        disabled={isPending}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-md transition-all shadow-[0_0_10px_rgba(37,99,235,0.3)] hover:shadow-[0_0_15px_rgba(37,99,235,0.6)]"
      >
        {isPending ? "取得中..." : "💧 1万円分取得 (TSUI-JPY)"}
      </button>
    </div>
  );
}
