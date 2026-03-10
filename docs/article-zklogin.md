## はじめに

Web3 の世界に足を踏み入れようとしたユーザーが最初にぶつかる壁、それは**ウォレットのセットアップ**だ。シードフレーズの保管、ブラウザ拡張のインストール、ネットワークの切り替え――Web2 で「Googleでログイン」ボタン一つで済んでいた体験と比べると、その摩擦は圧倒的に大きい。

実際、多くの dApp がウォレット接続の段階でユーザーの大半を失っている。DappRadar のレポートによれば、Web3 アプリのオンボーディング完了率は 10-20% 程度に留まるとされる。この「ウォレットの壁」を壊さない限り、ブロックチェーンのマスアダプションは実現しない。

Sui ブロックチェーンが提供する **zkLogin** は、この問題に正面から取り組むソリューションだ。ゼロ知識証明（Zero-Knowledge Proof）と OAuth 認証を組み合わせ、Google や Apple のアカウントだけでオンチェーントランザクションを実行可能にする。ユーザーはシードフレーズを知る必要も、ウォレット拡張をインストールする必要もない。

本記事では、zkLogin の仕組みを解説し、Next.js + Enoki を使った実装方法を具体的なコードとともに紹介する。

## zkLoginとは

zkLogin は Sui ネイティブのアカウント抽象化（Account Abstraction）機能で、以下の二つの技術を組み合わせている。

### OAuth 2.0 / OpenID Connect

Google、Apple、Twitch などの既存の ID プロバイダー（IdP）を利用した認証。ユーザーは普段使い慣れたログインフローでアプリにアクセスする。

### ゼロ知識証明（ZKP）

OAuth で取得した JWT トークンから、ユーザーのメールアドレスなどの個人情報を**一切公開することなく**、オンチェーンアドレスとの紐付けを証明する。これにより、Google アカウントと Sui アドレスの対応関係がブロックチェーン上では完全に秘匿される。

zkLogin で生成されるアドレスは、通常のウォレットアドレスと区別がつかない。SUI の送受信、NFT の操作、Move コントラクトの呼び出し――すべてが通常のアドレスと同様に動作する。

### 従来のウォレット接続との比較

| 項目 | 従来のウォレット | zkLogin |
|------|----------------|---------|
| セットアップ | 拡張機能インストール + シードフレーズ保管 | Google ログインのみ |
| UX | dApp ごとに承認ポップアップ | Web2 と同等のフロー |
| セキュリティ | シードフレーズの漏洩リスク | OAuth + ZKP の二重保護 |
| プライバシー | アドレスは公開 | OAuth ID とアドレスの対応は秘匿 |
| リカバリ | シードフレーズ紛失 = 資産喪失 | Google アカウントで再認証可能 |

## 仕組みの解説

zkLogin の認証フローは、見た目はシンプルな「Google でログイン」だが、裏側では複数のコンポーネントが協調して動作している。

### ステップ 1: エフェメラルキーペアの生成

ログインフロー開始時に、クライアント側で一時的な Ed25519 キーペア（**エフェメラルキー**）を生成する。このキーペアには有効期限（`maxEpoch`）が設定され、通常は現在のエポックから 2 エポック先までとする。

```typescript
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { generateNonce, generateRandomness } from "@mysten/sui/zklogin";

const keypair = new Ed25519Keypair();
const randomness = generateRandomness();

// Sui ネットワークの現在のエポックを取得
const { epoch } = await suiClient.getLatestSuiSystemState();
const maxEpoch = Number(epoch) + 2;

// OAuth リダイレクト用の nonce を生成
const nonce = generateNonce(keypair.getPublicKey(), maxEpoch, randomness);
```

生成した秘密鍵と randomness は `sessionStorage` に一時保存し、OAuth のリダイレクト後に復元する。

### ステップ 2: OAuth 認証

nonce をパラメータに含めて、Google の OAuth 認証画面にリダイレクトする。

```typescript
const params = new URLSearchParams({
  client_id: GOOGLE_CLIENT_ID,
  redirect_uri: `${window.location.origin}/auth`,
  response_type: "id_token",
  scope: "openid",
  nonce, // エフェメラルキーとバインドされた nonce
});

window.location.href =
  `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
```

ユーザーが Google ログインを完了すると、`/auth#id_token=eyJ...` のようなフラグメントを含むリダイレクトが返される。この JWT にはユーザーの `sub`（一意識別子）と先ほどの `nonce` が含まれている。

### ステップ 3: ZK 証明の取得

ここが zkLogin のコアとなる部分だ。JWT から以下を証明するゼロ知識証明を生成する。

1. JWT が正当な ID プロバイダーによって署名されていること
2. JWT に含まれる `sub` と `aud` から導出されるアドレスが正しいこと
3. JWT の `nonce` がエフェメラルキーにバインドされていること

**これらすべてを、JWT の中身（メールアドレス等）を一切公開せずに証明する。**

実装では、Mysten Labs が提供する Enoki API をバックエンドのプロキシ経由で呼び出す。

```typescript
// サーバーサイド API (/api/zklogin-prove)
const [proofRes, addrRes] = await Promise.all([
  // ZK 証明の生成
  fetch(`${ENOKI_API}/zklogin/zkp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ENOKI_PRIVATE_KEY}`,
      "zklogin-jwt": jwt,
    },
    body: JSON.stringify({
      network: "testnet",
      ephemeralPublicKey,
      maxEpoch,
      randomness,
    }),
  }),
  // アドレスの導出
  fetch(`${ENOKI_API}/zklogin`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ENOKI_PRIVATE_KEY}`,
      "zklogin-jwt": jwt,
    },
  }),
]);
```

ZK 証明とアドレスを並行取得することで、レイテンシを最小化している。

### ステップ 4: セッションの確立

取得した ZK 証明、アドレス、エフェメラルキーを組み合わせて zkLogin セッションを構成する。

```typescript
interface ZkLoginSession {
  address: string;        // 導出された Sui アドレス
  maxEpoch: number;       // エフェメラルキーの有効期限
  ephemeralPrivKey: string; // 一時秘密鍵（Base64）
  zkProof: object;        // ゼロ知識証明
}
```

このセッションを `localStorage` に保存し、React Context 経由でアプリ全体に共有する。

### ステップ 5: トランザクションの署名

トランザクション実行時は、エフェメラルキーでの署名と ZK 証明を組み合わせた **zkLogin 署名**を構成する。

```typescript
import { getZkLoginSignature } from "@mysten/sui/zklogin";

// エフェメラルキーでトランザクションに署名
const { signature: userSignature } = await keypair.signTransaction(txBytes);

// zkLogin 署名を構成
const zkLoginSignature = getZkLoginSignature({
  inputs: session.zkProof,
  maxEpoch: session.maxEpoch,
  userSignature,
});

// Sui ネットワークに送信
await suiClient.executeTransactionBlock({
  transactionBlock: txBytes,
  signature: zkLoginSignature,
});
```

Sui バリデーターは、この署名を検証する際に ZK 証明を検証し、エフェメラルキーが正当な OAuth セッションにバインドされていることを確認する。

## 実装方法

ここからは、Next.js アプリケーションでの具体的な実装パターンを紹介する。

### プロバイダーの構成

アプリのルートで、Sui クライアントと zkLogin のプロバイダーをネストする。

```typescript
// app/providers.tsx
"use client";

import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZkLoginProvider } from "@/context/ZkLoginContext";

const queryClient = new QueryClient();
const networks = {
  testnet: {
    url: "https://fullnode.testnet.sui.io:443",
    network: "testnet" as const,
  },
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <ZkLoginProvider>{children}</ZkLoginProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
```

ポイントは `ZkLoginProvider` を `WalletProvider` の内側に配置することだ。これにより、zkLogin ユーザーも通常のウォレットユーザーも同じ `useSuiClient()` フックで Sui クライアントを利用できる。

### ZkLoginContext の設計

zkLogin セッションのライフサイクルを管理する Context を実装する。

```typescript
// context/ZkLoginContext.tsx
"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { ZkLoginSession, loadZkLoginSession, clearZkLoginSession } from "@/lib/zklogin";

interface ZkLoginContextType {
  session: ZkLoginSession | null;
  setSession: (s: ZkLoginSession | null) => void;
  logout: () => void;
}

export function ZkLoginProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<ZkLoginSession | null>(
    typeof window !== "undefined" ? loadZkLoginSession() : null
  );

  const setSession = (s: ZkLoginSession | null) => {
    setSessionState(s);
    if (s) localStorage.setItem("zk_session", JSON.stringify(s));
  };

  const logout = () => {
    clearZkLoginSession();
    setSessionState(null);
  };

  return (
    <ZkLoginContext.Provider value={{ session, setSession, logout }}>
      {children}
    </ZkLoginContext.Provider>
  );
}

export function useZkLogin() {
  return useContext(ZkLoginContext);
}
```

`typeof window !== "undefined"` のガードは、Next.js の SSR 環境で `localStorage` にアクセスしないために必要だ。

### ログインボタンコンポーネント

ユーザーが直接触れるログインボタンの実装はシンプルに保つ。

```typescript
// components/ZkLoginButton.tsx
"use client";

import { useSuiClient } from "@mysten/dapp-kit";
import { initiateGoogleLogin } from "@/lib/zklogin";
import { useZkLogin } from "@/context/ZkLoginContext";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

export function ZkLoginButton() {
  const suiClient = useSuiClient();
  const { session, logout } = useZkLogin();

  if (session) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">
          {session.address.slice(0, 6)}...{session.address.slice(-4)}
        </span>
        <button onClick={logout}>ログアウト</button>
      </div>
    );
  }

  return (
    <button
      onClick={() => initiateGoogleLogin(GOOGLE_CLIENT_ID, suiClient)}
      disabled={!GOOGLE_CLIENT_ID}
    >
      Googleでログイン
    </button>
  );
}
```

### OAuth コールバックページ

Google からのリダイレクトを受け取るページでは、URL フラグメントから JWT を抽出して ZK 証明の取得を開始する。

```typescript
// app/auth/page.tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { processOAuthCallback } from "@/lib/zklogin";
import { useZkLogin } from "@/context/ZkLoginContext";

export default function AuthPage() {
  const router = useRouter();
  const { setSession } = useZkLogin();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const jwt = params.get("id_token");

    if (!jwt) {
      router.push("/");
      return;
    }

    processOAuthCallback(jwt)
      .then((session) => {
        setSession(session);
        router.push("/");
      })
      .catch((err) => {
        console.error("zkLogin failed:", err);
        router.push("/");
      });
  }, [router, setSession]);

  return <div>処理中...</div>;
}
```

`useRef` による重複実行防止は、React 18 の Strict Mode でエフェクトが二重実行される問題を回避するために必須だ。

## Sponsored Transactions

zkLogin で「ウォレットの壁」を取り除いても、もう一つの壁が残る。**ガス代**だ。初めてログインしたユーザーの zkLogin アドレスには SUI がない。トランザクションを実行しようにも、ガス代を支払えない。

Mysten Labs の **Enoki** は、この問題を解決する **Sponsored Transaction** 機能を提供する。dApp 運営者がガス代を肩代わりすることで、ユーザーは SUI を一切保有しなくてもオンチェーン操作が可能になる。

### 実装フロー

Sponsored Transaction のフローは以下の 3 ステップだ。

**1. TransactionKind のビルド**

まず、ガス情報を含まない「トランザクションの中身」だけをビルドする。

```typescript
const tx = new Transaction();
tx.moveCall({
  target: `${PACKAGE_ID}::platform::some_function`,
  arguments: [/* ... */],
});

// onlyTransactionKind: true でガス情報なしでビルド
const txKindBytes = await tx.build({
  onlyTransactionKind: true,
  client: suiClient,
});
```

**2. Enoki にスポンサーを依頼**

サーバーサイドの API ルートを経由して、Enoki にガス代のスポンサーを依頼する。

```typescript
// サーバーサイド API (/api/sponsor)
const res = await fetch(`${ENOKI_API}/transaction-blocks/sponsor`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${ENOKI_PRIVATE_KEY}`,
  },
  body: JSON.stringify({
    network: "testnet",
    transactionBlockKindBytes: txKindB64,
    sender: session.address,
  }),
});

// Enoki がガス情報を付与した完全なトランザクションバイトを返す
const { data } = await res.json();
// data.bytes: スポンサー済みトランザクション
// data.digest: トランザクションダイジェスト
```

**3. zkLogin 署名 + 実行**

スポンサー済みトランザクションにエフェメラルキーで署名し、zkLogin 署名を構成して実行する。

```typescript
// エフェメラルキーで署名
const { signature: userSignature } =
  await keypair.signTransaction(fullTxBytes);

// zkLogin 署名を構成
const zkLoginSignature = getZkLoginSignature({
  inputs: session.zkProof,
  maxEpoch: session.maxEpoch,
  userSignature,
});

// Enoki の execute エンドポイントで実行
// （スポンサー側の署名は Enoki が保持している）
await fetch(`/api/sponsor-execute`, {
  method: "POST",
  body: JSON.stringify({
    digest,
    signature: zkLoginSignature,
  }),
});
```

この設計では、**Enoki の API キーはサーバーサイドにのみ存在**し、クライアントには公開されない。Next.js の Route Handler（`app/api/`）がプロキシとして機能することで、セキュリティを確保している。

### コスト管理

Sponsored Transaction のガス代は dApp 運営者の Enoki アカウントから支払われる。Enoki のダッシュボードでは、トランザクションあたりの上限額や日次の予算を設定できる。テストネットでは無制限だが、メインネットでは適切な上限設定が重要だ。

## セキュリティ考慮事項

zkLogin は強力なセキュリティ特性を持つが、実装時には以下の点に注意が必要だ。

### エフェメラルキーのライフサイクル管理

エフェメラルキーには `maxEpoch` による有効期限がある（Sui のエポックは約 24 時間）。期限切れのキーではトランザクションが失敗するため、セッション開始時にエポックを確認し、必要に応じて再認証を促す必要がある。

```typescript
// セッション有効性チェックの例
const { epoch } = await suiClient.getLatestSuiSystemState();
if (Number(epoch) >= session.maxEpoch) {
  // セッション期限切れ - 再ログインを促す
  logout();
}
```

### JWT の取り扱い

OAuth から取得した JWT には個人情報が含まれる。以下を徹底すること。

- JWT はサーバーサイド API でのみ処理し、クライアントには ZK 証明とアドレスのみを返す
- JWT をログに出力しない
- JWT を `localStorage` に保存しない（`sessionStorage` も最小限に）

### Enoki API キーの保護

`ENOKI_PRIVATE_KEY` は `.env.local` に格納し、`NEXT_PUBLIC_` プレフィックスを付けないこと。サーバーサイドの Route Handler からのみアクセスする。

```bash
# .env.local
ENOKI_PRIVATE_KEY=enoki_private_xxxxx    # サーバーサイドのみ
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com  # クライアントOK
```

### salt の管理

zkLogin アドレスの導出には salt が必要だ。Enoki を使う場合は Enoki が salt を管理するが、セルフホスト構成の場合は salt のバックアップが重要になる。**salt を紛失すると、同じ Google アカウントでも異なるアドレスが生成され、元のアドレスの資産にアクセスできなくなる。**

### フィッシング対策

zkLogin はユーザーに「Google でログイン」を促す。攻撃者が偽の dApp を作成して OAuth トークンを窃取するリスクがある。これに対しては以下で対応する。

- Google Cloud Console で正確なリダイレクト URI を設定する
- `response_type: "id_token"` を使い、アクセストークンは取得しない
- 正規のドメインからのみ OAuth フローを開始する

## まとめ

zkLogin は、Web3 のマスアダプションに向けた重要なブレークスルーだ。

- **ゼロ知識証明 + OAuth** の組み合わせにより、ウォレットのセットアップを完全に排除
- **Sponsored Transaction** との組み合わせで、ガス代の壁も同時に解消
- **プライバシー保護**により、OAuth ID とオンチェーンアドレスの対応を秘匿

これらが意味するのは、ユーザーが「Googleでログイン」ボタンを押すだけで、裏側ではブロックチェーン上にアドレスが生成され、ガス代不要でトランザクションが実行できる世界だ。Web2 ユーザーにとっては、通常の Web アプリと区別がつかない体験になる。

現時点では Google、Apple、Twitch などの OAuth プロバイダーがサポートされており、今後さらに対応プロバイダーが拡大していくことが期待される。また、Sui のアカウント抽象化は zkLogin に留まらず、マルチシグやパスキーなど、多様な認証手段への拡張が進んでいる。

Web3 開発者にとって、zkLogin の導入はもはやオプションではなく、ユーザー獲得のための必須要件になりつつある。「ウォレットを持っていないユーザー」にこそ、ブロックチェーンの最大の成長余地がある。zkLogin は、その扉を開く鍵だ。

### 参考リンク

- [Sui zkLogin ドキュメント](https://docs.sui.io/concepts/cryptography/zklogin)
- [Mysten Labs Enoki](https://docs.enoki.mystenlabs.com/)
- [@mysten/sui SDK](https://sdk.mystenlabs.com/typescript)
- [Sui Dev Hub - zkLogin 実装例](https://sui-dev-hub-tau.vercel.app)
