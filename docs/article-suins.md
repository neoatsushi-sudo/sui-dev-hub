## はじめに

Web3アプリケーションを使ったことがある人なら、一度は経験したことがあるはずです。ウォレットを接続した瞬間に画面に表示される `0x7a3b...9f2d` のような意味不明な文字列。記事を読んでいるとき、コメント欄に並ぶのは人間の名前ではなく、16進数のハッシュ値。

これはWeb3のUXにおける根本的な問題です。

従来のWebでは、ユーザーは `@alice` や `alice@example.com` のような人間が読める識別子を使います。しかしブロックチェーンの世界では、アカウントは暗号学的に生成されたアドレスで表現されます。Suiの場合、`0x` から始まる64文字の16進数文字列がそれにあたります。

この問題を解決するのが **ネームサービス** です。Ethereumには ENS（Ethereum Name Service）があり、Solanaには Bonfida があります。そしてSuiエコシステムには **SuiNS（Sui Name Service）** があります。

この記事では、SuiNSの仕組み、ドメイン登録方法、そしてdApp開発者がフロントエンドに統合する方法を、Sui Dev Hubでの実装例とともに解説します。

## SuiNSとは

SuiNS（Sui Name Service）は、Suiブロックチェーン上の分散型ネームサービスです。ユーザーが `.sui` で終わるドメイン名を登録し、自分のSuiアドレスに紐づけることができます。

例えば、`alice.sui` というドメインを登録すれば、`0x7a3b...9f2d` という長いアドレスの代わりに `alice.sui` を使ってトークンを送受信したり、dApp上で自分のアイデンティティを表示したりできます。

### SuiNSの主な特徴

- **オンチェーン**: ドメインの所有権はSuiブロックチェーン上のオブジェクトとして管理される
- **NFTベース**: 登録したドメインはNFTとして所有し、譲渡や売買が可能
- **サブドメイン対応**: `blog.alice.sui` のようなサブドメインも設定できる
- **リバースレゾリューション**: アドレスからドメイン名を逆引きできる（dApp表示に重要）
- **低コスト**: Ethereumの ENS と比べて登録コストが大幅に安い

### SuiNS のアーキテクチャ

SuiNSはSui Move スマートコントラクトとして実装されています。内部的には以下のような構造を持ちます。

```
┌─────────────────┐     ┌──────────────────┐
│  SuiNS Registry │────▶│ NameRecord       │
│  (Shared Object) │     │  - name: String  │
└─────────────────┘     │  - target: addr  │
                         │  - expiry: u64   │
                         └──────────────────┘
                                │
                                ▼
                         ┌──────────────────┐
                         │  SuinsRegistration│
                         │  (NFT / Owned)    │
                         │  - domain: String │
                         │  - image_url      │
                         └──────────────────┘
```

`SuinsRegistration` はユーザーが所有するNFTオブジェクトで、ドメインの所有権を表します。`NameRecord` はレジストリ内のエントリで、ドメイン名とターゲットアドレスのマッピングを保持します。

## ドメイン登録方法

### Webインターフェースからの登録

最も簡単な方法は、SuiNSの公式サイト（https://suins.io）を使うことです。

1. **ウォレット接続**: Sui Wallet や Suiet などの対応ウォレットを接続
2. **ドメイン検索**: 希望するドメイン名を入力して空き状況を確認
3. **登録期間選択**: 1年、2年、3年から選択（長期ほど年あたりのコストが安い）
4. **トランザクション承認**: ウォレットでトランザクションを承認して登録完了

### 登録料金の目安

ドメイン名の文字数によって料金が異なります（2026年3月時点の目安）。

| 文字数 | 年間料金（目安） |
|--------|-----------------|
| 3文字  | 500 SUI         |
| 4文字  | 100 SUI         |
| 5文字以上 | 20 SUI       |

短い名前ほど希少価値が高いため、料金が高く設定されています。これはENSと同様の価格モデルです。

### CLIからの登録

開発者であれば、Sui CLIを使ったプログラマティックな登録も可能です。

```bash
sui client call \
  --package <suins-package-id> \
  --module register \
  --function register \
  --args <registry> "myname" <payment-coin> <clock> \
  --gas-budget 100000000
```

ただし実際のパッケージIDや関数名はSuiNSのバージョンによって異なるため、公式ドキュメントを参照してください。

## 開発者向け統合

dApp開発者にとって最も重要なのは、**リバースレゾリューション**（アドレスからドメイン名への逆引き）です。これにより、ユーザーのアドレスを人間が読める形式で表示できます。

### SuiClientを使ったリバースレゾリューション

Sui SDK（`@mysten/sui`）には、SuiNSの名前解決APIが組み込まれています。

```typescript
import { SuiClient } from "@mysten/sui/client";

const client = new SuiClient({ url: "https://fullnode.testnet.sui.io:443" });

// アドレス → SuiNS名（リバースレゾリューション）
async function resolveAddressToName(address: string): Promise<string | null> {
  try {
    const result = await client.resolveNameServiceNames({
      address,
      limit: 1,
    });

    if (result?.data?.length > 0) {
      return result.data[0]; // 例: "alice.sui"
    }
  } catch (error) {
    console.error("SuiNS resolution failed:", error);
  }
  return null;
}

// SuiNS名 → アドレス（フォワードレゾリューション）
async function resolveNameToAddress(name: string): Promise<string | null> {
  try {
    const address = await client.resolveNameServiceAddress({
      name,
    });
    return address ?? null;
  } catch (error) {
    console.error("SuiNS forward resolution failed:", error);
  }
  return null;
}

// 使用例
const name = await resolveAddressToName("0x7a3b...");
console.log(name); // "alice.sui"

const addr = await resolveNameToAddress("alice.sui");
console.log(addr); // "0x7a3b..."
```

### @mysten/dapp-kit との統合

React アプリケーションでは `@mysten/dapp-kit` の `useSuiClient` フックを使って、コンポーネント内でSuiNS名を解決できます。

```typescript
"use client";

import { useState, useEffect } from "react";
import { useSuiClient } from "@mysten/dapp-kit";

function useResolveSuiNS(address: string) {
  const client = useSuiClient();
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }

    setLoading(true);
    client
      .resolveNameServiceNames({ address, limit: 1 })
      .then((result) => {
        if (result?.data?.length > 0) {
          setName(result.data[0]);
        }
      })
      .catch(() => {
        // SuiNS解決失敗はサイレントに処理
      })
      .finally(() => setLoading(false));
  }, [client, address]);

  return { name, loading };
}
```

### 名前のバリデーション

ユーザー入力としてSuiNS名を受け取る場合、Sui SDKのユーティリティ関数でバリデーションできます。

```typescript
import { isValidSuiNSName, normalizeSuiNSName } from "@mysten/sui/utils";

// バリデーション
isValidSuiNSName("alice.sui");       // true
isValidSuiNSName("ALICE.sui");       // true（大文字小文字は区別しない）
isValidSuiNSName("my-name.sui");     // true（ハイフン可）
isValidSuiNSName("a.sui");           // true
isValidSuiNSName("invalid");         // false（.suiが必要）

// 正規化（@形式とドット形式の変換）
normalizeSuiNSName("alice.sui", "at");    // "alice@sui" → 内部表現
normalizeSuiNSName("alice@sui", "dot");   // "alice.sui" → 表示用
```

SuiNSは `@` 形式（内部表現）と `.sui` 形式（表示用）の2つのフォーマットをサポートしています。ユーザーに見せるときは `.sui` 形式、内部処理では `@` 形式を使うのが一般的です。

## Sui Dev Hubでの実装例

Sui Dev Hub では、SuiNSを**オンチェーンプロフィール**と組み合わせて、著者名の表示に活用しています。

### 表示名の優先順位

Sui Dev Hub では以下の優先順位で著者名を解決します。

1. **SuiNS名**（`alice.sui`）- 最優先
2. **カスタムプロフィール名**（`@alice`）- SuiNSが未設定の場合
3. **短縮アドレス**（`0x7a3b...9f2d`）- どちらも未設定の場合

この優先順位ロジックは `useAuthorName` カスタムフックに集約しています。

```typescript
// lib/profile.ts - Sui Dev Hub の実装

export function useAuthorName(address: string): {
  displayName: string;
  suiNsName: string | null;
  profile: ProfileData | null;
  loading: boolean;
} {
  const suiClient = useSuiClient();
  const [suiNsName, setSuiNsName] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }
    setLoading(true);
    // SuiNS名とオンチェーンプロフィールを並行取得
    Promise.all([
      resolveSuiNSName(suiClient, address),
      fetchUserProfile(suiClient, address),
    ]).then(([ns, prof]) => {
      setSuiNsName(ns);
      setProfile(prof);
      setLoading(false);
    });
  }, [suiClient, address]);

  // 優先順位に従って表示名を決定
  let displayName: string;
  if (suiNsName) {
    displayName = suiNsName;           // "alice.sui"
  } else if (profile?.username) {
    displayName = `@${profile.username}`; // "@alice"
  } else {
    displayName = shortAddress(address);  // "0x7a3b...9f2d"
  }

  return { displayName, suiNsName, profile, loading };
}
```

### UIでの差別化表示

SuiNS名を持つユーザーは視覚的に区別して表示しています。ドメインを持つことが一種の「認証済みステータス」として機能します。

```tsx
// components/PostDetail.tsx - 著者名の表示部分

const { displayName, suiNsName } = useAuthorName(authorAddress);

<span className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
  suiNsName
    ? "bg-blue-900 text-blue-300"    // SuiNSユーザー: 青いバッジ
    : "bg-gray-800 text-gray-300"    // 一般ユーザー: グレーのバッジ
}`}>
  {suiNsName ? `🔷 ${displayName}` : displayName}
</span>
```

SuiNS名を持つユーザーには青いバッジとダイヤモンドアイコンが付き、一目でドメイン保有者だと分かるようになっています。これはコメント欄や記事一覧など、著者名が表示される全ての場所で統一的に適用されます。

### パフォーマンスの考慮

SuiNSの名前解決はRPCコールを伴うため、パフォーマンスに注意が必要です。Sui Dev Hub では以下の対策を講じています。

- **並行取得**: `Promise.all` でSuiNS名とプロフィールを同時に取得
- **エラーのサイレント処理**: SuiNS解決に失敗してもフォールバック表示が機能するよう、エラーはキャッチしてログのみ出力
- **React Query**: `SuiClientProvider` 配下で `QueryClientProvider` を利用し、同一アドレスのRPCレスポンスをキャッシュ

```typescript
// app/providers.tsx - キャッシュ設定
const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
```

## ENSとの比較

SuiNSとENS（Ethereum Name Service）は同じ「ブロックチェーンネームサービス」というカテゴリに属しますが、基盤となるブロックチェーンの違いから、いくつかの重要な差異があります。

### 基本比較

| 項目 | SuiNS | ENS |
|------|-------|-----|
| ブロックチェーン | Sui | Ethereum |
| TLD | `.sui` | `.eth` |
| 所有権モデル | Sui Object (NFT) | ERC-721 NFT |
| 登録コスト | 20 SUI〜/年 | 5 USD〜/年 + 高いガス代 |
| ガス代 | 極めて安い（< 0.01 SUI） | 高い（数〜数十USD） |
| レゾリューション速度 | ファイナリティ < 1秒 | ブロック確認に〜12秒 |
| サブドメイン | 対応 | 対応 |
| リバースレゾリューション | 対応 | 対応 |

### Suiのオブジェクトモデルの利点

ENSではレジストリがスマートコントラクトのマッピング（`mapping(bytes32 => address)`）として実装されています。一方、SuiNSではドメインが独立した**Suiオブジェクト**として存在します。

この違いは重要です。

- **並列処理**: 異なるドメインへのアクセスは独立したオブジェクトに対する操作なので、Suiの並列実行エンジンの恩恵を受けられる
- **所有権の明確さ**: `SuinsRegistration` オブジェクトがウォレットに直接表示され、NFTとして自然に扱える
- **コンポーザビリティ**: Move の型システムにより、SuiNS オブジェクトを他のスマートコントラクトに安全に渡せる

### 開発者体験の違い

ENSの名前解決にはEthersやViemなどのライブラリで `provider.lookupAddress()` を呼びます。SuiNSの場合は `SuiClient` に統合されているため、追加のライブラリなしで名前解決が可能です。

```typescript
// ENS（ethers.js）
const name = await provider.lookupAddress("0x...");

// SuiNS（Sui SDK - 追加ライブラリ不要）
const result = await client.resolveNameServiceNames({ address: "0x..." });
```

Sui SDK に名前解決APIが最初から組み込まれている点は、開発者にとって大きな利点です。依存関係を増やさずにネームサービスを統合できます。

### エコシステムの成熟度

ENSは2017年に開始され、700万以上のドメインが登録されています。DAO による分散型ガバナンスも確立されています。SuiNSはまだ若いサービスですが、Suiエコシステムの成長とともに急速に普及しています。DeFi、NFTマーケットプレイス、ウォレットなど、主要なSui dAppの多くがSuiNSを統合済みです。

## まとめ

SuiNSは、Suiエコシステムにおけるアイデンティティレイヤーとして重要な役割を果たしています。

**ユーザーにとって**:
- 覚えにくいアドレスの代わりに人間が読める名前を使える
- `.sui` ドメインがオンチェーンでのアイデンティティとなる
- NFTとして所有・譲渡・売買が可能

**開発者にとって**:
- Sui SDK に名前解決APIが組み込まれており、統合が容易
- リバースレゾリューションで UI/UX を大幅に改善できる
- フォワード/リバース両方向の解決が標準APIで可能

**dApp のUX向上のために**:
- SuiNS名の有無で表示を切り替え、ドメイン保有者を視覚的に差別化
- フォールバック戦略（SuiNS → カスタム名 → 短縮アドレス）で全ユーザーに対応
- 並行取得とキャッシュでパフォーマンスを維持

Sui Dev Hub では、SuiNS をオンチェーンプロフィールと組み合わせた「複合的なアイデンティティシステム」を実装しています。これにより、ドメインを持つユーザーも持たないユーザーも、それぞれ最適な形で名前を表示できるようになりました。

Web3のUXをWeb2レベルに近づけるために、ネームサービスの統合はもはや必須です。SuiNSの統合は数十行のコードで完了するので、Sui dAppを開発しているなら、ぜひ取り入れてみてください。
