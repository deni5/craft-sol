import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';

// ВАЖЛИВО: той самий сирий підхід (без IDL/типізованого Anchor
// Program-клієнта), що вже перевірений у solana-contracts/scripts/
// (initialize-pool-raw.ts, deposit-test-pool.ts) — IDL не вдалось
// згенерувати через несумісність anchor-syn/proc-macro2, див.
// docs/ARCHITECTURE.md.

export const PROGRAM_ID = new PublicKey(
  'Fe8Tvmpi83vfPG5ViiZFLfibVAvQNbDJjxMAxHehQxke'
);

// Тестовий пул swing/conservative — власний тестовий токен
// (не залежить від зовнішніх USDC faucet-ів, дозволяє демо на
// Devnet без реальних коштів). Для production потрібно перемкнути
// на реальний офіційний USDC mint і hodl/standard чи інші sub-pools.
export const DEMO_POOL = {
  strategyType: 0, // swing
  sensitivity: 0, // conservative
  mint: new PublicKey('93xPu42YyfAq8jFWFW4xqBvvcBReCC9dfddtCHSruK5w'),
  decimals: 6,
};

/** Anchor instruction discriminator: перші 8 байт sha256("global:<name>") */
async function anchorDiscriminator(instructionName) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`global:${instructionName}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer).slice(0, 8);
}

export function getPoolPda(strategyType, sensitivity) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('fund_pool'), Buffer.from([strategyType]), Buffer.from([sensitivity])],
    PROGRAM_ID
  );
  return pda;
}

export function getVaultPda(fundPool) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), fundPool.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function getTreasuryPda(fundPool) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('treasury'), fundPool.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function getUserPositionPda(fundPool, user) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_position'), fundPool.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

/** Бінарний layout FundPool — той самий, що в scripts/fetch-pool-raw.ts */
export async function fetchPoolState(connection, fundPool) {
  const accountInfo = await connection.getAccountInfo(fundPool);
  if (!accountInfo) return null;

  const data = accountInfo.data;
  let offset = 8;
  const authority = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const strategyType = data.readUInt8(offset);
  offset += 1;
  const sensitivity = data.readUInt8(offset);
  offset += 1;
  const totalShares = data.readBigUInt64LE(offset);
  offset += 8;
  const totalCapitalUsdc = data.readBigUInt64LE(offset);
  offset += 8;
  const feeBps = data.readUInt16LE(offset);
  offset += 2;
  const usdcMint = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const vault = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const treasury = new PublicKey(data.subarray(offset, offset + 32));

  return {
    authority,
    strategyType,
    sensitivity,
    totalShares,
    totalCapitalUsdc,
    feeBps,
    usdcMint,
    vault,
    treasury,
  };
}

/** Бінарний layout UserPosition — той самий, що в scripts/verify-deposit.ts */
export async function fetchUserPosition(connection, fundPool, user) {
  const pda = getUserPositionPda(fundPool, user);
  const accountInfo = await connection.getAccountInfo(pda);
  if (!accountInfo) return null;

  const data = accountInfo.data;
  const owner = new PublicKey(data.subarray(8, 40));
  const pool = new PublicKey(data.subarray(40, 72));
  const shares = data.readBigUInt64LE(72);

  return { owner, pool, shares };
}

/**
 * Будує інструкцію deposit — не відправляє, лише конструює для
 * підпису підключеним гаманцем (Phantom тощо через wallet-adapter).
 */
export async function buildDepositInstruction(user, amountRaw, pool = DEMO_POOL) {
  const fundPoolPda = getPoolPda(pool.strategyType, pool.sensitivity);
  const vaultPda = getVaultPda(fundPoolPda);
  const userPositionPda = getUserPositionPda(fundPoolPda, user);
  const userTokenAccount = await getAssociatedTokenAddress(pool.mint, user);

  const discriminator = await anchorDiscriminator('deposit');
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(amountRaw, 0);
  const data = Buffer.concat([Buffer.from(discriminator), amountBuffer]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: fundPoolPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: userPositionPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Будує інструкцію withdraw — виводить вказану кількість shares.
 */
export async function buildWithdrawInstruction(user, shares, pool = DEMO_POOL) {
  const fundPoolPda = getPoolPda(pool.strategyType, pool.sensitivity);
  const vaultPda = getVaultPda(fundPoolPda);
  const treasuryPda = getTreasuryPda(fundPoolPda);
  const userPositionPda = getUserPositionPda(fundPoolPda, user);
  const userTokenAccount = await getAssociatedTokenAddress(pool.mint, user);

  const discriminator = await anchorDiscriminator('withdraw');
  const sharesBuffer = Buffer.alloc(8);
  sharesBuffer.writeBigUInt64LE(shares, 0);
  const data = Buffer.concat([Buffer.from(discriminator), sharesBuffer]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: fundPoolPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: treasuryPda, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: userPositionPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}
