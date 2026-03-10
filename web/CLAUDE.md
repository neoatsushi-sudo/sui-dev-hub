# Web - フロントエンド規約

## 基本情報

- Next.js 16 App Router
- React 19, TypeScript, Tailwind CSS 4
- ウォレット: @mysten/dapp-kit
- ガスレス: @mysten/enoki

## ディレクトリルール

- `app/` - ページルーティングのみ、ビジネスロジックは `components/` へ
- `components/` - UIコンポーネント（PascalCase）
- `lib/` - ユーティリティ、定数定義
- `context/` - React Context（ZkLogin等）

## パッケージID参照

**`lib/sui.ts` 経由で参照すること。ハードコード禁止。**

```typescript
import { PACKAGE_ID, ORIGINAL_PACKAGE_ID, REWARD_POOL_ID } from "@/lib/sui";
```

- `PACKAGE_ID` - 最新パッケージ（関数呼び出しに使用）
- `ORIGINAL_PACKAGE_ID` - v1パッケージ（構造体の型フィルタに使用）
- `REWARD_POOL_ID` - RewardPoolオブジェクト

## コンポーネント設計パターン

### トランザクション構築
```typescript
import { Transaction } from "@mysten/sui/transactions";
import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";

const tx = new Transaction();
tx.moveCall({ target: `${PACKAGE_ID}::platform::function_name`, arguments: [...] });
```

### 状態管理
- `useCurrentAccount()` - ウォレット接続状態
- `useZkLogin()` - zkLogin認証状態（`context/ZkLoginContext`）
- `useSuiClient()` - Suiクライアント

### イベントクエリ（重複チェック）
```typescript
const events = await suiClient.queryEvents({
  query: { MoveEventType: `${PACKAGE_ID}::platform::EventName` }
});
```

## UIデザインガイド

- テーマ: ダークベース
- カスタムCSSクラス（`globals.css`定義）:
  - `.glass` - 半透明ガラス効果
  - `.gradient-text` - ブルー/パープルグラデーション文字
  - `.card-hover` - ホバーアニメーション付きカード
- `"use client"` ディレクティブ: インタラクティブなコンポーネントに必須

## ビルド確認

```bash
npm run build
```
