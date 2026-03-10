# Contracts - Move開発ルール

## 基本情報

- Edition: 2024.beta
- Framework: Sui Framework
- メインファイル: `sources/platform.move`
- テスト: `tests/contracts_tests.move`

## Compatible Upgrade 制約

- 既存 `public` 関数のシグネチャ（引数の型・順序・戻り値）は変更不可
- 新しい `public` 関数の追加はOK
- `Published.toml` の `published-at` が `Move.toml` より優先される
- デプロイ後に3箇所更新必須: `CLAUDE.md`, `web/lib/sui.ts`, `contracts/Published.toml`

## エラーコード体系（連番管理）

```move
const ENotAuthor: u64 = 1;
const EInsufficientTip: u64 = 2;
const EInsufficientPayment: u64 = 3;
const EPremiumAlreadyFree: u64 = 4;
const EAlreadyClaimed: u64 = 5;
const EInsufficientPool: u64 = 6;
const EInsufficientStake: u64 = 7;
// 次の新エラーは 8 から
```

## 構造体パターン

### Receipt パターン（1回限りの操作証明）
```move
public struct LikeReceipt has key, store { id: UID, ... }
public struct WriteReceipt has key, store { id: UID, ... }
```
- 操作完了時に発行し、ユーザーに転送
- 重複防止の証拠として使用

### ClaimKey + dynamic_field パターン（重複防止）
```move
public struct ClaimKey has copy, drop, store { ... }
// dynamic_field::exists_(&pool.id, key) でチェック
// dynamic_field::add(&mut pool.id, key, true) で記録
```

### Config パターン（設定オブジェクト）
```move
public struct PremiumConfig has store { price: u64, is_free: bool }
public struct CoAuthorConfig has store { addresses: vector<address>, shares: vector<u64> }
```

## ビルド・テスト

```bash
# ビルド
sui move build

# テスト
sui move test

# デプロイ（必ずユーザー確認）
sui client upgrade --upgrade-capability $UPGRADE_CAP
```
