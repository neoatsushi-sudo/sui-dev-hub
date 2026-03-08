# Sui Dev Hub

A decentralized technical content platform built on the Sui blockchain — think Mirror.xyz, but for Sui developers.

**Live Demo:** https://sui-dev-hub-tau.vercel.app

## Overview

Sui Dev Hub enables developers to publish technical articles and research directly on-chain. Readers can tip authors with SUI tokens, creating a permissionless monetization layer for technical content.

### Why Sui Dev Hub?

- **No intermediaries** — content ownership is on-chain, not platform-controlled
- **Native monetization** — tip authors directly with SUI, no sign-ups or payment rails
- **Sui-native** — built for the Sui developer community, not a general audience
- **Open** — anyone with a Sui wallet can publish or tip

## Features

- Publish articles stored on-chain (title + content via Sui Move objects)
- Tip authors 0.1 SUI per click
- Markdown rendering for technical content
- Wallet connection via Slush / any Sui-compatible wallet
- Article detail pages with full content view

## Tech Stack

| Layer | Tech |
|-------|------|
| Smart Contract | Move (Sui) |
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Wallet | @mysten/dapp-kit |
| Network | Sui Testnet |

## Smart Contract

**Package ID (Testnet):** `0x2a0120c049a8642953d7adc0d841bc91917e3e42b6029b73d250f3a0194a8b06`

### Key Functions

```move
public fun create_post(title: String, content_hash: String, ctx: &mut TxContext)
public fun tip(post: &mut Post, payment: Coin<SUI>, ctx: &mut TxContext)
```

## Local Development

```bash
# Clone
git clone https://github.com/neoatsushi-sudo/sui-dev-hub
cd sui-dev-hub/web

# Install dependencies
npm install

# Run dev server
npm run dev
```

Open http://localhost:3000 and connect your Sui wallet (Slush recommended).

## Roadmap

- [ ] Walrus integration for decentralized content storage
- [ ] Sponsored transactions (gasless UX for readers)
- [ ] On-chain profiles
- [ ] Tag/category system
- [ ] Comment system

## License

MIT
