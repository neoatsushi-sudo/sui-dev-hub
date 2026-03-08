"use client";

import { useState, useEffect } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID } from "@/lib/sui";
import { useZkLogin } from "@/context/ZkLoginContext";
import { zkLoginSponsoredSignAndExecute } from "@/lib/zklogin";
import { ProfileData, fetchUserProfile } from "@/lib/profile";

export function ProfileEditor() {
  const account = useCurrentAccount();
  const { session } = useZkLogin();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending: walletPending } = useSignAndExecuteTransaction();
  
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [sponsoring, setSponsoring] = useState(false);
  const [error, setError] = useState("");

  const address = account?.address || session?.address;

  useEffect(() => {
    if (!address) return;
    setIsLoading(true);
    fetchUserProfile(suiClient, address)
      .then((p) => {
        setProfile(p);
        if (p) {
          setUsername(p.username);
          setBio(p.bio);
        }
      })
      .finally(() => setIsLoading(false));
  }, [address, suiClient]);

  const handleSave = async () => {
    if (!address) return;
    if (!username.trim()) {
      setError("ユーザー名は必須です");
      return;
    }
    setError("");

    const tx = new Transaction();
    
    if (profile) {
      tx.moveCall({
        target: `${PACKAGE_ID}::platform::edit_profile`,
        arguments: [
          tx.object(profile.id),
          tx.pure.string(username),
          tx.pure.string(bio),
        ],
      });
    } else {
      tx.moveCall({
        target: `${PACKAGE_ID}::platform::create_profile`,
        arguments: [
          tx.pure.string(username),
          tx.pure.string(bio),
        ],
      });
    }

    const handleSuccess = async () => {
      setIsEditing(false);
      // refetch
      const p = await fetchUserProfile(suiClient, address);
      setProfile(p);
    };

    if (session && !account) {
      try {
        setSponsoring(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await zkLoginSponsoredSignAndExecute(session, tx, suiClient as any);
        handleSuccess();
      } catch (err) {
        setError(`エラー: ${String(err)}`);
      } finally {
        setSponsoring(false);
      }
      return;
    }

    signAndExecute({ transaction: tx }, { 
      onSuccess: handleSuccess,
      onError: (err) => setError(`エラー: ${String(err)}`) 
    });
  };

  if (!address) return null;
  if (isLoading) return <div className="text-sm text-gray-500">プロフィール読み込み中...</div>;

  const isPending = walletPending || sponsoring;

  if (!isEditing && profile) {
    return (
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-white">{profile.username}</h2>
          {profile.bio && <p className="text-sm text-gray-400 mt-1">{profile.bio}</p>}
        </div>
        <button 
          onClick={() => setIsEditing(true)}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          編集
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <h2 className="text-lg font-semibold mb-4 text-white">
        {profile ? "プロフィールを編集" : "プロフィールの作成"}
      </h2>
      <input
        className="w-full bg-gray-800 rounded-lg px-4 py-2 mb-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="ユーザー名 (表示名)"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        className="w-full bg-gray-800 rounded-lg px-4 py-2 mb-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Bio (自己紹介)"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
      />
      
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg transition-colors"
        >
          {isPending ? "保存中..." : "保存する"}
        </button>
        {profile && (
          <button
            onClick={() => {
              setIsEditing(false);
              setUsername(profile.username);
              setBio(profile.bio);
            }}
            disabled={isPending}
            className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2 rounded-lg"
          >
            キャンセル
          </button>
        )}
      </div>
    </div>
  );
}
