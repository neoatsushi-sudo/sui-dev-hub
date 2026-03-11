"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID } from "@/lib/sui";
import { useZkLogin } from "@/context/ZkLoginContext";
import { zkLoginSponsoredSignAndExecute } from "@/lib/zklogin";
import { Turnstile } from "@marsidev/react-turnstile";

const WALRUS_PUBLISHER = "https://publisher.walrus-testnet.walrus.space";
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

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

const COMMON_TAGS = ["Move", "Sui", "DeFi", "NFT", "zkLogin", "Walrus", "Tutorial", "Security", "Ecosystem", "Analysis"];

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
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  // 下書き復元（初回マウント時）
  useEffect(() => {
    try {
      const raw = localStorage.getItem("sui-dev-hub-draft");
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.title) setTitle(draft.title);
        if (draft.content) setContent(draft.content);
        if (draft.tags) setTags(draft.tags);
      }
    } catch { /* ignore */ }
    // 下書き復元後にtextareaの高さを調整
    requestAnimationFrame(() => {
      if (textareaRef.current) autoResize(textareaRef.current);
    });
  }, []);

  // 下書き自動保存（500ms デバウンス）
  useEffect(() => {
    if (!title && !content && tags.length === 0) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      localStorage.setItem("sui-dev-hub-draft", JSON.stringify({ title, content, tags }));
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    }, 500);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [title, content, tags]);

  const onCaptchaSuccess = useCallback((token: string) => {
    setCaptchaToken(token);
    setCaptchaVerified(true);
  }, []);

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

  const buildFinalTitle = () => {
    const tagSuffix = tags.map((t) => `[${t}]`).join("");
    return tagSuffix ? `${title} ${tagSuffix}` : title;
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const localPreview = URL.createObjectURL(file);
    setImagePreviewUrl(localPreview);

    try {
      setUploading(true);
      setError("");
      const blobId = await uploadToWalrus(file);
      const imageUrl = `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`;
      const imageMarkdown = `\n![${file.name}](${imageUrl})\n`;
      setContent((prev) => prev + imageMarkdown);
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
    localStorage.removeItem("sui-dev-hub-draft");
    setDone(true);
    setTimeout(() => setDone(false), 3000);
  };

  const verifyCaptcha = async (): Promise<boolean> => {
    if (!captchaToken) return false;
    try {
      const res = await fetch("/api/verify-captcha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: captchaToken }),
      });
      const data = await res.json();
      return data.success === true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title || !content) return;
    if (!account && !session) return;
    setError("");

    if (!captchaVerified) {
      setError("CAPTCHA認証を完了してください");
      return;
    }
    const isHuman = await verifyCaptcha();
    if (!isHuman) {
      setError("CAPTCHA認証に失敗しました。リロードしてやり直してください。");
      return;
    }

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
    tx.moveCall({
      target: `${PACKAGE_ID}::platform::create_post`,
      arguments: [
        tx.pure.string(buildFinalTitle()),
        tx.pure.string(blobId),
      ],
    });

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

    signAndExecute({ transaction: tx }, { onSuccess: handleSuccess });
  };

  const isPending = uploading || walletPending || sponsoring;

  const getButtonLabel = () => {
    if (uploading) return "Walrusにアップロード中...";
    if (sponsoring) return "ガス代スポンサー中...";
    if (walletPending) return "チェーンに保存中...";
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
      {/* Write / Preview toggle */}
      <div className="flex gap-1 mb-2">
        <button
          type="button"
          onClick={() => setShowPreview(false)}
          className={`text-xs px-3 py-1 rounded-t-lg transition-colors ${
            !showPreview ? "bg-gray-800 text-white" : "bg-gray-900 text-gray-500 hover:text-gray-300"
          }`}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className={`text-xs px-3 py-1 rounded-t-lg transition-colors ${
            showPreview ? "bg-gray-800 text-white" : "bg-gray-900 text-gray-500 hover:text-gray-300"
          }`}
        >
          Preview
        </button>
      </div>
      {showPreview ? (
        <div className="w-full bg-gray-800 rounded-lg px-4 py-3 mb-3 min-h-[7rem] prose prose-invert prose-sm max-w-none prose-code:text-green-400 prose-code:bg-gray-900 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700">
          {content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {content}
            </ReactMarkdown>
          ) : (
            <p className="text-gray-500 text-sm">プレビューがここに表示されます</p>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className="w-full bg-gray-800 rounded-lg px-4 py-2 mb-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500 min-h-28 resize-none overflow-hidden"
          placeholder="本文（Markdown対応）"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            autoResize(e.target);
          }}
        />
      )}

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
                setContent(prev => prev.replace(/\n!\[.*?\]\(.*?\)\n$/, ''));
              }}
              className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Cloudflare Turnstile CAPTCHA */}
      <div className="mb-4">
        <Turnstile
          siteKey={TURNSTILE_SITE_KEY}
          onSuccess={onCaptchaSuccess}
          onError={() => setCaptchaVerified(false)}
          onExpire={() => { setCaptchaVerified(false); setCaptchaToken(null); }}
          options={{ theme: "dark", size: "normal" }}
        />
        {captchaVerified && (
          <p className="text-xs text-green-400 mt-1">✓ 人間であることが確認されました</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || !title || !content || !captchaVerified}
          className="disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-5 py-2 rounded-lg transition-colors bg-blue-600 hover:bg-blue-500"
        >
          {getButtonLabel()}
        </button>
        {done && <span className="text-green-400 text-sm">投稿しました！</span>}
        {error && <span className="text-red-400 text-sm">{error}</span>}
        {draftSaved && !done && !error && <span className="text-gray-500 text-xs">下書き保存済み</span>}
      </div>
    </form>
  );
}
