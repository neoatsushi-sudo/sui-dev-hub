"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { processOAuthCallback } from "@/lib/zklogin";
import { useZkLogin } from "@/context/ZkLoginContext";

export default function AuthPage() {
  const router = useRouter();
  const { setSession } = useZkLogin();
  const [status, setStatus] = useState("処理中...");

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const jwt = params.get("id_token");

    if (!jwt) {
      setStatus("エラー: JWTが見つかりません");
      setTimeout(() => router.push("/"), 2000);
      return;
    }

    processOAuthCallback(jwt)
      .then((session) => {
        setSession(session);
        setStatus("ログイン完了！リダイレクト中...");
        setTimeout(() => router.push("/"), 1000);
      })
      .catch((err) => {
        console.error(err);
        setStatus(`エラー: ${err.message}`);
        setTimeout(() => router.push("/"), 3000);
      });
  }, [router, setSession]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">{status}</div>
    </div>
  );
}
