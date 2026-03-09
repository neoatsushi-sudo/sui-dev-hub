"use client";

import { useState, useRef } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, REWARD_POOL_ID } from "@/lib/sui";
import { useZkLogin } from "@/context/ZkLoginContext";
import { zkLoginSponsoredSignAndExecute } from "@/lib/zklogin";

const WALRUS_PUBLISHER = "https://publisher.walrus-testnet.walrus.space";

// Stake-to-Publish: 1 SUI デポジット
const STAKE_AMOUNT_MIST = 1_000_000_000;

async function uploadToWalrus(content: string | File): Promise<string> {
  const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=5`, {
    method: "PUT",
    body: content,
  });
  if (!res.ok) throw new Error("Walrus upload failed");
  const data = await res.json();
  return data.newlyCreated?.blobObject?.blobId ?? data.alreadyCertified?.blobId;
}

const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";

const COMMON_TAGS = ["Move", "Sui", "DeFi", "NFT", "zkLogin", "Walrus", "Tutorial", "Security"];

export function CreatePost() {
  const account = useCurrentAccount();
  const { session } = useZkLogin();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending: walletPending } = useSignAndExecuteTransaction();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sponsoring, setSponsoring] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [useStake, setUseStake] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addTag = (tag: string) => {
    const clean = tag.trim().replace(/^#/, "");
    if (clean && !tags.includes(clean) && tags.length < 5) {
      setTags((prev) => [...prev, clean]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === " " || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    }
  };

  // Tags are stored in title as a suffix: "My Article Title [Move][Sui]"
  const buildFinalTitle = () => {
    const tagSuffix = tags.map((t) => `[${t}]`).join("");
    return tagSuffix ? `${title} ${tagSuffix}` : title;
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show local preview immediately while uploading
    const localPreview = URL.createObjectURL(file);
    setImagePreviewUrl(localPreview);

    try {
      setUploading(true);
      setError("");
      const blobId = await uploadToWalrus(file);
      const imageUrl = `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`;
      const imageMarkdown = `\n![${file.name}](${imageUrl})\n`;
      setContent((prev) => prev + imageMarkdown);
      // Update preview to the actual Walrus URL
      setImagePreviewUrl(imageUrl);
    } catch (err) {
      setError(`画像のアップロードに失敗しました: ${String(err)}`);
      setImagePreviewUrl(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSuccess = () => {
    setTitle("");
    setContent("");
    setTags([]);
    setDone(true);
    setTimeout(() => setDone(false), 3000);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title || !content) return;
    if (!account && !session) return;
    setError("");

    let blobId: string;
    try {
      setUploading(true);
      blobId = await uploadToWalrus(content);
    } catch {
      setError("Walrusへのアップロードに失敗しました");
      setUploading(false);
      return;
    } finally {
      setUploading(false);
    }

    const tx = new Transaction();

    if (useStake && account) {
      // Stake-to-Publish: ガスコインから 1 SUI を分割してデポジット
      const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(STAKE_AMOUNT_MIST)]);
      tx.moveCall({
        target: `${PACKAGE_ID}::platform::create_post_with_pool`,
        arguments: [
          tx.object(REWARD_POOL_ID),
          tx.pure.string(buildFinalTitle()),
          tx.pure.string(blobId),
          depositCoin,
        ],
      });
    } else {
      tx.moveCall({
        target: `${PACKAGE_ID}::platform::create_post`,
        arguments: [
          tx.pure.string(buildFinalTitle()),
          tx.pure.string(blobId),
        ],
      });
    }

    // zkLogin user: use sponsored transaction (gasless) — stake不可
    if (session && !account) {
      try {
        setSponsoring(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await zkLoginSponsoredSignAndExecute(session, tx, suiClient as any);
        handleSuccess();
      } catch (err) {
        setError(`投稿に失敗しました: ${String(err)}`);
      } finally {
        setSponsoring(false);
      }
      return;
    }

    // Wallet user: use dapp-kit
    signAndExecute({ transaction: tx }, { onSuccess: handleSuccess });
  };

  const isPending = uploading || walletPending || sponsoring;

  const getButtonLabel = () => {
    if (uploading) return "Walrusにアップロード中...";
    if (sponsoring) return "ガス代スポンサー中...";
    if (walletPending) return "チェーンに保存中...";
    if (useStake) return "🔒 1 SUI デポジットして投稿する";
    return "投稿する";
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <h2 className="text-lg font-semibold mb-4">記事を投稿</h2>
      {session && !account && (
        <p className="text-xs text-green-400 mb-3">✓ ガス代無料で投稿できます（スポンサー付き）</p>
      )}
      <input
        className="w-full bg-gray-800 rounded-lg px-4 py-2 mb-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="タイトル"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="w-full bg-gray-800 rounded-lg px-4 py-2 mb-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500 h-28 resize-none"
        placeholder="本文（Markdown対応）"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      {/* Tag Input */}
      <div className="mb-4">
        <div className="flex flex-wrap gap-2 mb-2">
          {tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 bg-blue-900 text-blue-300 text-xs px-2 py-1 rounded-full">
              #{tag}
              <button type="button" onClick={() => removeTag(tag)} className="hover:text-white ml-1">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-800 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="タグを追加（例: Move, Sui）"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
          />
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {COMMON_TAGS.filter((t) => !tags.includes(t)).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addTag(t)}
              className="text-xs text-gray-400 hover:text-blue-300 border border-gray-700 hover:border-blue-700 rounded-full px-2 py-0.5 transition-colors"
            >
              +{t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          ref={fileInputRef}
          onChange={handleImageUpload}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          {uploading ? "アップロード中..." : "📷 画像をアップロード"}
        </button>
        {imagePreviewUrl && (
          <div className="relative group">
            <img
              src={imagePreviewUrl}
              alt="プレビュー"
              className="h-16 w-24 object-cover rounded-lg border border-gray-700"
            />
            <button
              type="button"
              onClick={() => {
                setImagePreviewUrl(null);
                // Remove the last image markdown from content
                setContent(prev => prev.replace(/\n!\[.*?\]\(.*?\)\n$/, ''));
              }}
              className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          </div>
        )}
      </div>
      {/* Stake-to-Publish トグル（ウォレット接続時のみ） */}
      {account && (
        <div
          onClick={() => setUseStake((v) => !v)}
          className={`flex items-center gap-3 mb-4 p-3 rounded-lg border cursor-pointer transition-all select-none ${
            useStake
              ? "border-orange-700/60 bg-orange-950/20"
              : "border-gray-700 bg-gray-800/30 hover:border-gray-600"
          }`}
        >
          <div
            className={`w-10 h-5 rounded-full flex items-center transition-colors ${
              useStake ? "bg-orange-600" : "bg-gray-600"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white mx-0.5 transition-transform ${
                useStake ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              🔒 Stake-to-Publish（スパム対策）
            </p>
            <p className="text-xs text-gray-400">
              1 SUI をデポジットして投稿の信頼性を証明。いつでも回収可能。
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || !title || !content}
          className={`disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-5 py-2 rounded-lg transition-colors ${
            useStake
              ? "bg-orange-600 hover:bg-orange-500"
              : "bg-blue-600 hover:bg-blue-500"
          }`}
        >
          {getButtonLabel()}
        </button>
        {done && <span className="text-green-400 text-sm">投稿しました！</span>}
        {error && <span className="text-red-400 text-sm">{error}</span>}
      </div>
    </form>
  );
}
