import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

// ── Config ──────────────────────────────────────────────────────────────────
const SUI_RPC = 'https://fullnode.testnet.sui.io:443';
const PACKAGE_ID = "0x0ff874ccde9a069bd6506d71eefb44d420215ce39ae168fa8dbe2364a8a60b1a";
const REWARD_POOL_ID = "0x6d491f156024ce769f9b1ff878daa6ab84e4795b67132eeb75f701953d02fc42";

// ── JSON-RPC helper ───────────────────────────────────────────────────────────
async function rpc(method, params) {
    const r = await fetch(SUI_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const j = await r.json();
    if (j.error) throw new Error(`RPC error (${method}): ${JSON.stringify(j.error)}`);
    return j.result;
}

// ── Load Ed25519 keypair ──────────────────────────────────────────────────────
function loadKeypair() {
    const p = join(process.env.USERPROFILE || homedir(), '.sui', 'sui_config', 'sui.keystore');
    const keys = JSON.parse(readFileSync(p, 'utf8'));
    for (const b64 of keys) {
        const raw = Buffer.from(b64, 'base64');
        if (raw[0] === 0) return Ed25519Keypair.fromSecretKey(raw.slice(1));
    }
    throw new Error('No Ed25519 key found in keystore');
}

// ── Minimal RPC client shim for tx.build() ───────────────────────────────────
function makeClient(sender) {
    return {
        async getCoins({ owner, coinType }) {
            const r = await rpc('suix_getCoins', [owner, coinType ?? '0x2::sui::SUI', null, 20]);
            return r;
        },
        async getReferenceGasPrice() {
            return await rpc('suix_getReferenceGasPrice', []);
        },
    };
}

// ── Execute Funding ────────────────────────────────────────────────────────────
async function main() {
    const keypair = loadKeypair();
    const sender = keypair.toSuiAddress();
    console.log('Sender:', sender);

    const client = makeClient(sender);

    console.log('Funding RewardPool with 3 SUI...');
    const tx = new Transaction();
    tx.setSender(sender);

    const amountToFund = 3_000_000_000; // 3 SUI
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountToFund)]);

    tx.moveCall({
        target: `${PACKAGE_ID}::platform::fund_reward_pool`,
        arguments: [
            tx.object(REWARD_POOL_ID),
            coin,
        ],
    });

    const bytes = await tx.build({ client });
    const { signature } = await keypair.signTransaction(bytes);

    const result = await rpc('sui_executeTransactionBlock', [
        Buffer.from(bytes).toString('base64'),
        [signature],
        { showEffects: true, showEvents: true },
        'WaitForLocalExecution',
    ]);

    if (result?.effects?.status?.status === 'success') {
        console.log('✅ Successfully funded the RewardPool! Digest:', result.digest);
    } else {
        console.error('❌ Failed to fund:', result?.effects?.status);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
