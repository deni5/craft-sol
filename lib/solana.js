import { Connection, clusterApiUrl, LAMPORTS_PER_SOL } from '@solana/web3.js';

// ВАЖЛИВО: Devnet за замовчуванням на етапі розробки — узгоджено з
// рішенням у .env.example бот-частини проєкту. Перемикати на
// mainnet-beta лише після аудиту смарт-контракту та юридичної
// перевірки (див. docs/ARCHITECTURE.md, розділ про юридичні ризики
// фонду колективних інвестицій).
export const SOLANA_NETWORK =
  process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';

export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl(SOLANA_NETWORK);

let connectionInstance = null;

/**
 * Singleton Connection — уникає повторного створення з'єднання при
 * кожному рендері компонента.
 */
export function getConnection() {
  if (!connectionInstance) {
    connectionInstance = new Connection(SOLANA_RPC_URL, 'confirmed');
  }
  return connectionInstance;
}

/**
 * Баланс SOL гаманця в людському форматі (не lamports).
 */
export async function getSolBalance(publicKey) {
  if (!publicKey) return 0;
  const connection = getConnection();
  const lamports = await connection.getBalance(publicKey);
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Короткий формат публічного ключа для UI: "7xKX...gAsU"
 */
export function shortenAddress(address, chars = 4) {
  if (!address) return '';
  const str = typeof address === 'string' ? address : address.toBase58();
  return `${str.slice(0, chars)}...${str.slice(-chars)}`;
}
