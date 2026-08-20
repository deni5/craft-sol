import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';

// ВАЖЛИВО: SimplePool — production-шлях уперед (докс.
// ARCHITECTURE.md, рішення 07.08.2026): БЕЗ shares/NAV, кожен
// клієнт має власний, прямо відстежуваний баланс (не частка
// спільного пулу) — юридично ближче до "managed account".

export const PROGRAM_ID = new PublicKey(
  'Fe8Tvmpi83vfPG5ViiZFLfibVAvQNbDJjxMAxHehQxke'
);

// Спільний тестовий токен для всіх 6 sub-pools
export const MINT = new PublicKey('93xPu42YyfAq8jFWFW4xqBvvcBReCC9dfddtCHSruK5w');
export const DECIMALS = 6;

export const STRATEGIES = [
  { type: 0, name: 'swing' },
  { type: 1, name: 'hodl' },
];
export const SENSITIVITIES = [
  { type: 0, name: 'conservative' },
  { type: 1, name: 'standard' },
  { type: 2, name: 'sensitive' },
];

/** Конфіг для конкретного sub-pool (замість жорстко закодованого
 * одного пулу — тепер будь-яка з 6 комбінацій strategy x sensitivity). */
export function getPoolConfig(strategyType, sensitivity) {
  return { strategyType, sensitivity, mint: MINT, decimals: DECIMALS };
}

async function anchorDiscriminator(instructionName) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`global:${instructionName}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer).slice(0, 8);
}

export function getSimplePoolPda(strategyType, sensitivity) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('simple_pool'), Buffer.from([strategyType]), Buffer.from([sensitivity])],
    PROGRAM_ID
  );
  return pda;
}

export function getSimpleUsdcVaultPda(strategyType, sensitivity) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('simple_usdc_vault'), Buffer.from([strategyType]), Buffer.from([sensitivity])],
    PROGRAM_ID
  );
  return pda;
}

export function getSimpleSolVaultPda(strategyType, sensitivity) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('simple_sol_vault'), Buffer.from([strategyType]), Buffer.from([sensitivity])],
    PROGRAM_ID
  );
  return pda;
}

/** Знаходить дату ПЕРШОЇ on-chain транзакції UserAssetBalance -
 * реальна дата депозиту клієнта в цьому конкретному sub-pool, не
 * наближення через діапазон графіка сигналів. */
export async function fetchFirstDepositDate(connection, simplePoolPda, clientPubkey) {
  const userBalancePda = getUserAssetBalancePda(simplePoolPda, clientPubkey);

  let oldestSignature = null;
  let before = undefined;

  while (true) {
    const batch = await connection.getSignaturesForAddress(userBalancePda, { before, limit: 1000 });
    if (batch.length === 0) break;
    oldestSignature = batch[batch.length - 1];
    if (batch.length < 1000) break;
    before = batch[batch.length - 1].signature;
  }

  if (!oldestSignature || oldestSignature.blockTime === null) return null;

  const date = new Date(oldestSignature.blockTime * 1000);
  return date.toISOString().split('T')[0];
}

export function getUserAssetBalancePda(simplePool, user) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('simple_user_balance'), simplePool.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export async function fetchSimplePoolState(connection, simplePoolPda) {
  const accountInfo = await connection.getAccountInfo(simplePoolPda);
  if (!accountInfo) return null;

  const data = accountInfo.data;
  const priceUsdcPerSol = data.readBigUInt64LE(106);

  return { priceUsdcPerSol };
}

export async function fetchUserAssetBalance(connection, simplePoolPda, user) {
  const pda = getUserAssetBalancePda(simplePoolPda, user);
  const accountInfo = await connection.getAccountInfo(pda);
  if (!accountInfo) return { solAmount: 0n, usdcAmount: 0n };

  const data = accountInfo.data;
  const solAmount = data.readBigUInt64LE(72);
  const usdcAmount = data.readBigUInt64LE(80);

  return { solAmount, usdcAmount };
}

/** Стан і баланс клієнта по ВСІХ 6 sub-pools одразу — для сторінки
 * вибору пулу. Повертає масив { strategyType, sensitivity, price,
 * solAmount, usdcAmount }. */
export async function fetchAllPoolsState(connection, user) {
  const results = [];

  for (const strategy of STRATEGIES) {
    for (const sensitivity of SENSITIVITIES) {
      const poolPda = getSimplePoolPda(strategy.type, sensitivity.type);
      const pool = await fetchSimplePoolState(connection, poolPda);

      let balance = { solAmount: 0n, usdcAmount: 0n };
      if (user) {
        balance = await fetchUserAssetBalance(connection, poolPda, user);
      }

      results.push({
        strategyType: strategy.type,
        strategyName: strategy.name,
        sensitivityType: sensitivity.type,
        sensitivityName: sensitivity.name,
        priceUsdcPerSol: pool ? pool.priceUsdcPerSol : null,
        solAmount: balance.solAmount,
        usdcAmount: balance.usdcAmount,
      });
    }
  }

  return results;
}

export async function buildDepositSolSimpleInstruction(user, amountLamports, config) {
  const simplePoolPda = getSimplePoolPda(config.strategyType, config.sensitivity);
  const solVaultPda = getSimpleSolVaultPda(config.strategyType, config.sensitivity);
  const userBalancePda = getUserAssetBalancePda(simplePoolPda, user);

  const discriminator = await anchorDiscriminator('deposit_sol_simple');
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(amountLamports, 0);
  const data = Buffer.concat([Buffer.from(discriminator), amountBuffer]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: simplePoolPda, isSigner: false, isWritable: false },
      { pubkey: solVaultPda, isSigner: false, isWritable: true },
      { pubkey: userBalancePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export async function buildDepositUsdcSimpleInstruction(user, amountRaw, config) {
  const simplePoolPda = getSimplePoolPda(config.strategyType, config.sensitivity);
  const usdcVaultPda = getSimpleUsdcVaultPda(config.strategyType, config.sensitivity);
  const userBalancePda = getUserAssetBalancePda(simplePoolPda, user);
  const userUsdcAccount = await getAssociatedTokenAddress(config.mint, user);

  const discriminator = await anchorDiscriminator('deposit_usdc_simple');
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(amountRaw, 0);
  const data = Buffer.concat([Buffer.from(discriminator), amountBuffer]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: simplePoolPda, isSigner: false, isWritable: false },
      { pubkey: usdcVaultPda, isSigner: false, isWritable: true },
      { pubkey: userUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: userBalancePda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export async function buildWithdrawSolSimpleInstruction(user, amountLamports, config) {
  const simplePoolPda = getSimplePoolPda(config.strategyType, config.sensitivity);
  const solVaultPda = getSimpleSolVaultPda(config.strategyType, config.sensitivity);
  const userBalancePda = getUserAssetBalancePda(simplePoolPda, user);

  const discriminator = await anchorDiscriminator('withdraw_sol_simple');
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(amountLamports, 0);
  const data = Buffer.concat([Buffer.from(discriminator), amountBuffer]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: simplePoolPda, isSigner: false, isWritable: false },
      { pubkey: solVaultPda, isSigner: false, isWritable: true },
      { pubkey: userBalancePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export async function buildWithdrawUsdcSimpleInstruction(user, amountRaw, config) {
  const simplePoolPda = getSimplePoolPda(config.strategyType, config.sensitivity);
  const usdcVaultPda = getSimpleUsdcVaultPda(config.strategyType, config.sensitivity);
  const userBalancePda = getUserAssetBalancePda(simplePoolPda, user);
  const userUsdcAccount = await getAssociatedTokenAddress(config.mint, user);

  const discriminator = await anchorDiscriminator('withdraw_usdc_simple');
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(amountRaw, 0);
  const data = Buffer.concat([Buffer.from(discriminator), amountBuffer]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: simplePoolPda, isSigner: false, isWritable: false },
      { pubkey: usdcVaultPda, isSigner: false, isWritable: true },
      { pubkey: userUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: userBalancePda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}
