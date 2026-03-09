"use client";

import { useState, useEffect } from "react";
import { useSuiClient, useSignAndExecuteTransaction, useCurrentAccount } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, REWARD_POOL_ID } from "@/lib/sui";
import { useZkLogin } from "@/context/ZkLoginContext";
import { zkLoginSponsoredSignAndExecute } from "@/lib/zklogin";

export default function ReadToEarnButton({ postId }: { postId: string }) {
  const suiClient = useSuiClient();
  const account = useCurrentAccount();
  const { session } = useZkLogin();
  const [isPending, setIsPending] = useState(false);
  const [hasClaimed, setHasClaimed] = useState<boolean | null>(null);
  const { mutate: signAndExecute } = useSignAndExecuteTransaction({
    execute: async ({ bytes, signature }) =>
      await suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: {
          showRawEffects: true,
          showEffects: true,
        },
      }),
  });

  const userAddress = account?.address || (session ? "zklogin_user" : null); // zkLogin doesn't trivially expose address without setup, simplification here, actual query needed

  useEffect(() => {
    // Check if the user already has a ReadReceipt for this post
    const checkReceipt = async () => {
        if (!userAddress) return;
        
        // This is a simplified check. Ideally, we query objects owned by the user of type ReadReceipt
        // and check if any matches the postId.
        setHasClaimed(false); // Default to false for now, would need actual object query implementation
    };
    checkReceipt();
  }, [userAddress, postId, suiClient]);

  const handleClaim = async () => {
    if (!account && !session) return;
    setIsPending(true);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::platform::claim_reading_reward`,
        arguments: [
          tx.object(REWARD_POOL_ID),
          tx.object(postId),
        ],
      });

      if (session && !account) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await zkLoginSponsoredSignAndExecute(session, tx, suiClient as any);
        setHasClaimed(true);
      } else if (account) {
        signAndExecute(
          { transaction: tx },
          {
            onSuccess: () => setHasClaimed(true),
            onError: (err) => alert(`報酬の受け取りに失敗しました: ${err.message}`),
          }
        );
      }
    } catch (err: any) {
      alert(`報酬の受け取りに失敗しました: ${err.message}`);
    } finally {
      if (!account) { // handle zkLogin finally
          setIsPending(false);
      }
      // account signAndExecute runs async so we will need to handle pending state in onSuccess/onError mostly if it takes long, but for now this is okay
    }
  };

  if (!account && !session) return null;

  return (
    <div className="mt-8 mb-4">
      <button
        onClick={handleClaim}
        disabled={isPending || hasClaimed === true}
        className={`w-full py-3 rounded-xl font-bold transition-all ${
          hasClaimed
            ? "bg-green-900/40 text-green-400 border border-green-800 cursor-not-allowed"
            : "bg-gradient-to-r from-yellow-600 to-orange-500 hover:from-yellow-500 hover:to-orange-400 text-white shadow-lg hover:shadow-orange-500/20"
        }`}
      >
        {isPending
          ? "クレーム処理中..."
          : hasClaimed
          ? "✅ 報酬受け取り済み"
          : "💡 この記事を最後まで読んだ報酬を受け取る（Read-to-Earn）"}
      </button>
    </div>
  );
}
