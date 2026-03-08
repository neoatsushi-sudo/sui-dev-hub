import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  generateNonce,
  generateRandomness,
  getZkLoginSignature,
} from "@mysten/sui/zklogin";
import { Transaction } from "@mysten/sui/transactions";

const PROVER_URL = "/api/zklogin-prove";

export interface ZkLoginSession {
  address: string;
  maxEpoch: number;
  ephemeralPrivKey: string;
  zkProof: ZkProofInputs;
}

interface ZkProofInputs {
  proofPoints: unknown;
  issBase64Details: unknown;
  headerBase64: string;
  addressSeed: string;
}

function toB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromB64(str: string): Uint8Array {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

export async function initiateGoogleLogin(
  clientId: string,
  suiClient: { getLatestSuiSystemState: () => Promise<{ epoch: string | number }> }
) {
  const keypair = new Ed25519Keypair();
  const randomness = generateRandomness();
  const { epoch } = await suiClient.getLatestSuiSystemState();
  const maxEpoch = Number(epoch) + 2;
  const nonce = generateNonce(keypair.getPublicKey(), maxEpoch, randomness);

  const rawKey = keypair.getSecretKey();
  const privKey = typeof rawKey === "string" ? rawKey : toB64(rawKey as Uint8Array);
  sessionStorage.setItem("zk_privkey", privKey);
  sessionStorage.setItem("zk_randomness", randomness);
  sessionStorage.setItem("zk_max_epoch", String(maxEpoch));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}/auth`,
    response_type: "id_token",
    scope: "openid",
    nonce,
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function processOAuthCallback(jwt: string): Promise<ZkLoginSession> {
  const privKeyRaw = sessionStorage.getItem("zk_privkey") || "";
  const randomness = sessionStorage.getItem("zk_randomness") || "";
  const maxEpoch = Number(sessionStorage.getItem("zk_max_epoch") || "0");

  let keypair: Ed25519Keypair;
  try {
    keypair = Ed25519Keypair.fromSecretKey(privKeyRaw);
  } catch {
    keypair = Ed25519Keypair.fromSecretKey(fromB64(privKeyRaw));
  }

  // Enoki が管理する ephemeralPublicKey 形式
  const ephemeralPublicKey = keypair.getPublicKey().toSuiPublicKey();

  // Enoki に ZK proof と address を依頼
  const proverRes = await fetch(PROVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jwt,
      ephemeralPublicKey,
      maxEpoch,
      randomness,
    }),
  });

  if (!proverRes.ok) {
    const err = await proverRes.text();
    throw new Error(`ZK proof failed: ${err}`);
  }

  const { proof, address } = await proverRes.json();

  const session: ZkLoginSession = {
    address,
    maxEpoch,
    ephemeralPrivKey: privKeyRaw,
    zkProof: proof,
  };

  localStorage.setItem("zk_session", JSON.stringify(session));
  return session;
}

export function loadZkLoginSession(): ZkLoginSession | null {
  try {
    const raw = localStorage.getItem("zk_session");
    if (!raw) return null;
    return JSON.parse(raw) as ZkLoginSession;
  } catch {
    return null;
  }
}

export function clearZkLoginSession() {
  localStorage.removeItem("zk_session");
  sessionStorage.removeItem("zk_privkey");
  sessionStorage.removeItem("zk_randomness");
  sessionStorage.removeItem("zk_max_epoch");
}

export async function zkLoginSponsoredSignAndExecute(
  session: ZkLoginSession,
  tx: Transaction,
  _suiClient?: unknown
) {
  // トランザクション種別バイトのみビルド（ガス不要）
  const txKindBytes = await tx.build({ onlyTransactionKind: true });
  const txKindB64 = Buffer.from(txKindBytes).toString("base64");

  // Enoki にガス代スポンサーを依頼
  const sponsorRes = await fetch("/api/sponsor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txKindBytes: txKindB64, sender: session.address }),
  });

  if (!sponsorRes.ok) {
    const err = await sponsorRes.text();
    throw new Error(`Sponsor failed: ${err}`);
  }

  const { txBytes, digest } = await sponsorRes.json();
  const fullTxBytes = new Uint8Array(Buffer.from(txBytes, "base64"));

  // ephemeral key で署名
  let keypair: Ed25519Keypair;
  try {
    keypair = Ed25519Keypair.fromSecretKey(session.ephemeralPrivKey);
  } catch {
    keypair = Ed25519Keypair.fromSecretKey(fromB64(session.ephemeralPrivKey));
  }

  const { signature: userSignature } = await keypair.signTransaction(fullTxBytes);

  // Enoki が addressSeed を管理しているのでそのまま proof を使用
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zkLoginSignature = getZkLoginSignature({
    inputs: session.zkProof as any,
    maxEpoch: session.maxEpoch,
    userSignature,
  });

  // Enoki の execute エンドポイント（スポンサー署名は Enoki が保持）
  const executeRes = await fetch("/api/sponsor-execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ digest, signature: zkLoginSignature }),
  });

  if (!executeRes.ok) {
    const err = await executeRes.text();
    throw new Error(`Execute failed: ${err}`);
  }

  return executeRes.json();
}

export async function zkLoginSignAndExecute(
  session: ZkLoginSession,
  tx: Transaction,
  suiClient: { getLatestSuiSystemState: () => Promise<{ epoch: string | number }>, executeTransactionBlock: (...args: any[]) => Promise<any> }
) {
  let keypair: Ed25519Keypair;
  try {
    keypair = Ed25519Keypair.fromSecretKey(session.ephemeralPrivKey);
  } catch {
    keypair = Ed25519Keypair.fromSecretKey(fromB64(session.ephemeralPrivKey));
  }

  tx.setSender(session.address);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txBytes = await tx.build({ client: suiClient as any });
  const { signature: userSignature } = await keypair.signTransaction(txBytes);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zkLoginSignature = getZkLoginSignature({
    inputs: session.zkProof as any,
    maxEpoch: session.maxEpoch,
    userSignature,
  });

  return suiClient.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: zkLoginSignature,
    options: { showEffects: true },
  });
}
