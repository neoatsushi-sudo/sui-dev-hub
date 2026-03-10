## はじめに

Web3コンテンツプラットフォームを構築するとき、最初に直面する問題が「コンテンツをどこに保存するか」です。

ブロックチェーンはデータの整合性と検閲耐性に優れていますが、記事本文のような大きなデータを直接保存するにはコストが高すぎます。Sui上で1KBのデータをオンチェーンに保存するだけでも数十SUIかかる場合があり、数千文字の技術記事を丸ごと格納するのは現実的ではありません。

一方、従来のクラウドストレージ（S3、GCS）を使えばコストは安いですが、単一障害点と検閲リスクが残ります。プラットフォーム運営者がサーバーを止めれば、全てのコンテンツが失われる可能性があります。これでは「分散型」とは言えません。

この記事では、Suiエコシステムのネイティブ分散型ストレージ **Walrus** を使って、コンテンツプラットフォームのストレージ層をどのように構築するかを解説します。実際のプロダクション（Sui Dev Hub）で使っているコードを交えて説明するので、すぐに自分のプロジェクトに応用できるはずです。

## Walrusとは

Walrusは、Suiブロックチェーンの上に構築された分散型ストレージプロトコルです。Mysten Labs（Suiの開発元）が開発しており、Suiエコシステムとネイティブに統合されています。

### 従来の分散型ストレージとの違い

IPFS、Arweaveといった先行プロジェクトと比較した場合、Walrusには以下の特徴があります。

**Erasure Coding（消失訂正符号）によるデータ冗長性**

Walrusはデータをそのまま複製するのではなく、erasure codingを使ってデータを符号化・分割し、複数のストレージノードに分散保存します。例えば、元のデータの1/3のサイズのスライバー（slivers）をN個のノードに分散させ、そのうちN/3個から元データを復元できるように設計されています。これにより、完全な複製に比べて大幅に少ないストレージ容量でデータの可用性を確保できます。

**Suiとのネイティブ統合**

Blobメタデータ（blob ID、有効期限、ストレージ証明）がSuiオブジェクトとして管理されます。ストレージの状態がオンチェーンで検証可能であり、スマートコントラクトからblob IDを直接参照できます。

**エポックベースのストレージモデル**

Walrusのストレージはエポック（期間）単位で課金されます。永続保存が前提のArweaveとは異なり、必要な期間だけストレージを確保するモデルです。テストネットでは5エポックが一般的で、必要に応じて延長が可能です。

### アーキテクチャ概要

Walrusのシステムは主に3つのコンポーネントで構成されます。

```
┌─────────────────┐
│   クライアント    │  ← あなたのdApp
└────────┬────────┘
         │ HTTP API
┌────────▼────────┐
│   Publisher      │  ← Blobのアップロード受付
│   Aggregator     │  ← Blobの取得（読み取り）
└────────┬────────┘
         │ Erasure Coded Slivers
┌────────▼────────┐
│  Storage Nodes   │  ← 分散ストレージノード群
│  (N個)           │     各ノードがスライバーの一部を保持
└─────────────────┘
```

- **Publisher**: データをerasure codingで符号化し、スライバーをストレージノードに配布する。アップロード時に利用する。
- **Aggregator**: ストレージノードからスライバーを収集・復元し、元のデータを返す。読み取り時に利用する。
- **Storage Nodes**: 実際にスライバーを保持するノード群。Suiのバリデータネットワークと統合されている。

## Blob IDとコンテンツアドレッシング

Walrusにデータをアップロードすると、**blob ID** が返されます。これはデータの内容から決定論的に生成される識別子で、同じ内容をアップロードすれば常に同じblob IDになります（content-addressable）。

```
アップロード結果の例:
{
  "newlyCreated": {
    "blobObject": {
      "blobId": "xKCrE0nC2mMMrtjF-ehg9QkBwAKQLLiLPgUKBM7GFxk",
      "size": 4821,
      "encodingType": "RedStuff"
    }
  }
}
```

既に同一内容がWalrus上に存在する場合は、`alreadyCertified`として返されます。

```
{
  "alreadyCertified": {
    "blobId": "xKCrE0nC2mMMrtjF-ehg9QkBwAKQLLiLPgUKBM7GFxk",
    "endEpoch": 10
  }
}
```

このblob IDをオンチェーンのPostオブジェクトに保存することで、ブロックチェーンとストレージの紐付けを実現します。

## 実装方法

### コンテンツのアップロード（TypeScript）

Walrusへのアップロードは、Publisher APIへのHTTP PUTリクエストだけで完了します。SDK不要でシンプルです。

```typescript
const WALRUS_PUBLISHER = "https://publisher.walrus-testnet.walrus.space";
const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";

/**
 * テキストまたはファイルをWalrusにアップロードし、blob IDを返す
 */
async function uploadToWalrus(content: string | File): Promise<string> {
  const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=5`, {
    method: "PUT",
    body: content,
  });

  if (!res.ok) {
    throw new Error(`Walrus upload failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  // 新規作成の場合と既存の場合で返り値の構造が異なる
  return (
    data.newlyCreated?.blobObject?.blobId ??
    data.alreadyCertified?.blobId
  );
}
```

ポイントは以下の通りです。

- `epochs=5` パラメータでストレージの保存期間を指定（テストネットでは5エポックが推奨）
- `body` にはテキスト文字列でもFileオブジェクト（画像等）でも渡せる
- レスポンスの `newlyCreated` と `alreadyCertified` の両方をハンドリングする

### コンテンツの取得（TypeScript）

保存したコンテンツの取得はさらにシンプルです。Aggregator URLにblob IDを付与してGETするだけです。

```typescript
async function fetchFromWalrus(blobId: string): Promise<string> {
  const res = await fetch(
    `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`
  );

  if (!res.ok) {
    throw new Error(`Walrus fetch failed: ${res.status}`);
  }

  return res.text();
}
```

Reactコンポーネントでの利用例を見てみましょう。

```typescript
const [content, setContent] = useState<string>("");
const [loading, setLoading] = useState(false);

useEffect(() => {
  if (!blobId) return;

  // blob IDの形式を検証（Base64URL文字列かどうか）
  if (blobId.length >= 20 && /^[A-Za-z0-9_-]+$/.test(blobId)) {
    setLoading(true);
    fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`)
      .then((r) => r.text())
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch(() => {
        // フォールバック: blob IDそのものを表示
        setContent(blobId);
        setLoading(false);
      });
  } else {
    // 旧フォーマット: content_hashに直接テキストが入っている場合
    setContent(blobId);
  }
}, [blobId]);
```

blob IDのバリデーション（`/^[A-Za-z0-9_-]+$/`）を入れているのは、Walrus導入前のレガシーデータとの互換性を保つためです。古いPostオブジェクトでは`content_hash`に直接テキストが格納されていた場合もあるので、フォールバック処理が重要になります。

### 画像のアップロード

テキストだけでなく、画像もWalrusに保存できます。アップロード後のblob IDからURLを構築し、Markdown内に埋め込みます。

```typescript
const handleImageUpload = async (file: File) => {
  // Walrusにファイルをアップロード
  const blobId = await uploadToWalrus(file);

  // Aggregator URLを構築
  const imageUrl = `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`;

  // Markdown形式で本文に挿入
  const imageMarkdown = `\n![${file.name}](${imageUrl})\n`;
  setContent((prev) => prev + imageMarkdown);
};
```

画像のURLがWalrusの分散ストレージを指すため、中央サーバーに依存しません。CDNキャッシュも効くので、表示速度も実用的です。

### オンチェーンでの参照（Move）

Sui Moveのスマートコントラクト側では、blob IDを`content_hash`フィールドとして保存します。

```move
public struct Post has key, store {
    id: UID,
    author: address,
    title: vector<u8>,
    content_hash: vector<u8>,  // Walrus blob ID
    tip_balance: u64,
    created_at: u64,
}

public fun create_post(
    title: vector<u8>,
    content_hash: vector<u8>,
    ctx: &mut TxContext,
) {
    let post_id = object::new(ctx);
    let id_copy = object::uid_to_inner(&post_id);
    let post = Post {
        id: post_id,
        author: ctx.sender(),
        title,
        content_hash,  // Walrus blob ID をそのまま保存
        tip_balance: 0,
        created_at: ctx.epoch(),
    };
    event::emit(PostCreated {
        post_id: id_copy,
        author: ctx.sender(),
        title: post.title,
    });
    transfer::share_object(post);
}
```

`content_hash`は`vector<u8>`型で、blob IDの文字列をバイト列として格納しています。Move側ではblob IDのバリデーションは行わず、フロントエンド側でWalrus APIの結果をそのまま渡す設計です。

### トランザクション構築（フロントエンド → コントラクト）

記事投稿の全体フローをまとめると、以下のようになります。

```typescript
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID } from "@/lib/sui";

async function publishArticle(title: string, markdownContent: string) {
  // Step 1: コンテンツをWalrusにアップロード
  const blobId = await uploadToWalrus(markdownContent);

  // Step 2: Suiトランザクションを構築
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::platform::create_post`,
    arguments: [
      tx.pure.string(title),    // タイトル
      tx.pure.string(blobId),   // Walrus blob ID
    ],
  });

  // Step 3: トランザクションを署名・実行
  // （dapp-kitのsignAndExecuteTransactionを使用）
  return tx;
}
```

このパターンでは、重いデータ（記事本文）はオフチェーンのWalrusに、軽いメタデータ（タイトル、著者、blob ID）はオンチェーンのSuiに保存します。これにより、トランザクションコストを最小限に抑えつつ、コンテンツの永続性と検証可能性を確保しています。

## Sui Dev Hubでの活用

Sui Dev Hubでは、Walrusを以下の用途で活用しています。

### 記事本文の保存

ユーザーがMarkdownで書いた記事本文をWalrusにアップロードし、blob IDをオンチェーンのPostオブジェクトに記録します。閲覧時はblob IDからWalrus Aggregatorを通じてコンテンツを取得し、`react-markdown`でレンダリングします。

### 画像の分散保存

記事内に埋め込む画像もWalrusに保存します。アップロードUIでは、ファイルを選択するとリアルタイムでローカルプレビューを表示しつつ、バックグラウンドでWalrusにアップロードします。完了後、Markdown形式の画像リンクが本文に自動挿入されます。

### データの流れ

```
[投稿時]
ユーザー → Markdown本文 → Walrus Publisher → blob ID
                                                ↓
ユーザー → Suiトランザクション(title, blob ID) → Post Object (on-chain)

[閲覧時]
Post Object → content_hash (blob ID) を取得
                    ↓
Walrus Aggregator → Markdownテキストを取得 → react-markdown でレンダリング
```

### Stake-to-Publishとの統合

Sui Dev Hubでは、スパム対策として **Stake-to-Publish** 機能を実装しています。投稿時に1 SUIをReward Poolにデポジットすることで、投稿の信頼性を担保します。このフローでもWalrusアップロードは同様に行われ、blob IDが`create_post_with_pool`関数に渡されます。

```typescript
const tx = new Transaction();
const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1_000_000_000)]);
tx.moveCall({
  target: `${PACKAGE_ID}::platform::create_post_with_pool`,
  arguments: [
    tx.object(REWARD_POOL_ID),
    tx.pure.string(title),
    tx.pure.string(blobId),   // Walrusのblob ID
    depositCoin,              // 1 SUI デポジット
  ],
});
```

## コスト比較

分散型ストレージの選択は、コスト・永続性・エコシステム統合のトレードオフです。

### Walrus vs IPFS vs Arweave

| 項目 | Walrus | IPFS + Pinning | Arweave |
|------|--------|---------------|---------|
| **ストレージモデル** | エポックベース（期間指定） | ピニングサービス依存 | 永久保存（1回払い） |
| **コスト構造** | 期間 x データサイズ | 月額課金（Pinata等） | 1回の支払い（AR建て） |
| **冗長性** | Erasure coding | ノード複製（ピン先依存） | マイナーによるPoA |
| **Sui統合** | ネイティブ（blob IDがオンチェーンオブジェクト） | なし（外部連携が必要） | なし（外部連携が必要） |
| **データ取得** | HTTP GET（Aggregator） | HTTP GET（Gateway） | HTTP GET（Gateway） |
| **テストネット** | 無料 | サービス依存 | テストネットあり |

### コンテンツプラットフォームとしての評価

**Walrusを選ぶべきケース**:
- SuiでdAppを構築している（ネイティブ統合の恩恵が大きい）
- ストレージ期間をコントロールしたい
- blob IDをスマートコントラクトで参照する必要がある

**Arweaveを選ぶべきケース**:
- 永久保存が絶対要件（法的文書、学術論文等）
- マルチチェーンで利用する

**IPFSを選ぶべきケース**:
- 既存のIPFSエコシステムとの互換性が必要
- ピニングサービスの運用が確立している

Sui上のdAppにおいては、Walrusがエコシステム統合の面で圧倒的に優位です。トランザクション内でblob IDを直接扱えること、Suiのバリデータネットワークとストレージノードが統合されていること、課金がSUIで完結することが大きなメリットです。

## まとめ

Walrusは、Suiエコシステムにおける分散型ストレージの標準的な選択肢です。本記事で紹介したポイントをまとめます。

- **シンプルなAPI**: HTTP PUTでアップロード、HTTP GETで取得。SDKの導入は不要
- **content-addressable**: 同じ内容は同じblob IDになるため、重複排除が自動的に行われる
- **erasure coding**: 完全な複製より効率的にデータの可用性を確保
- **Sui統合**: blob IDをMoveの`vector<u8>`としてオンチェーンに保存し、スマートコントラクトから参照可能
- **テキスト・画像の両対応**: Markdownテキストも画像ファイルも同じAPIでアップロードできる

Sui Dev Hubでは、この仕組みを使って記事のオーサーシップ（著者情報）をオンチェーンで保証しつつ、コンテンツ本文は分散ストレージに保存するというハイブリッドアーキテクチャを実現しています。

分散型コンテンツプラットフォームを構築する際、「何をオンチェーンに置き、何をオフチェーンに逃がすか」の設計判断は非常に重要です。Walrusは、この判断をシンプルにしてくれるツールです。

コードの詳細は [Sui Dev Hub GitHub リポジトリ](https://github.com/) で公開しています。質問やフィードバックがあれば、コメントで教えてください。
