import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';

export const PROGRAM_ID = new PublicKey(
  'Fe8Tvmpi83vfPG5ViiZFLfibVAvQNbDJjxMAxHehQxke'
);

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

export function getPoolConfig(strategyType, sensitivity) {
  return { strategyType, sensitivity, mint: MINT, decimals: DECIMALS };
}

async function anchorDiscriminator(instructionName) {
  const encoder = new TextEncoder();
  const data = encoder.encode('global:' + instructionName);
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

export async function fetchFirstDepositDate(connection, simplePoolPda, clientPubkey) {
  const userBalancePda = getUserAssetBalancePda(simplePoolPda, clientPubkey);

  let oldestSignature = null;
  let before = undefined;

  while (true) {
    const batch = await connection.getSignaturesForAddress(userBalancePda, { before: before, limit: 1000 });
    if (batch.length === 0) break;
    oldestSignature = batch[batch.length - 1];
    if (batch.length < 1000) break;
    before = batch[batch.length - 1].signature;
  }

  if (!oldestSignature || oldestSignature.blockTime === null) return null;

  const date = new Date(oldestSignature.blockTime * 1000);
  return date.toISOString().split('T')[0];
}

async function anchorDiscriminatorNew(instructionName) {
  const encoder = new TextEncoder();
  const data = encoder.encode('global:' + instructionName);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer).slice(0, 8);
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export async function fetchBalanceHistory(connection, simplePoolPda, clientPubkey) {
  const userBalancePda = getUserAssetBalancePda(simplePoolPda, clientPubkey);

  const depositSolDisc = await anchorDiscriminatorNew('deposit_sol_simple');
  const depositUsdcDisc = await anchorDiscriminatorNew('deposit_usdc_simple');
  const withdrawSolDisc = await anchorDiscriminatorNew('withdraw_sol_simple');
  const withdrawUsdcDisc = await anchorDiscriminatorNew('withdraw_usdc_simple');
  const botSetBalanceDisc = await anchorDiscriminatorNew('bot_set_user_balance');

  let allSignatures = [];
  let before = undefined;
  while (true) {
    const batch = await connection.getSignaturesForAddress(userBalancePda, { before: before, limit: 1000 });
    if (batch.length === 0) break;
    allSignatures = allSignatures.concat(batch);
    if (batch.length < 1000) break;
    before = batch[batch.length - 1].signature;
  }
  allSignatures.reverse();

  const events = [];
  let runningSol = 0n;
  let runningUsdc = 0n;

  for (const sigInfo of allSignatures) {
    if (sigInfo.blockTime === null) continue;
    const tx = await connection.getTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 });
    if (!tx || !tx.transaction) continue;

    const instructions = tx.transaction.message.compiledInstructions || tx.transaction.message.instructions;
    if (!instructions) continue;

    for (const ix of instructions) {
      const dataBytes = typeof ix.data === 'string'
        ? Uint8Array.from(Buffer.from(ix.data, 'base64'))
        : new Uint8Array(ix.data);
      if (dataBytes.length < 8) continue;
      const disc = dataBytes.slice(0, 8);

      let eventType = null;
      let deltaSol = 0n;
      let deltaUsdc = 0n;

      if (bytesEqual(disc, depositSolDisc) && dataBytes.length >= 16) {
        const amount = new DataView(dataBytes.buffer, dataBytes.byteOffset + 8, 8).getBigUint64(0, true);
        eventType = 'deposit';
        deltaSol = amount;
      } else if (bytesEqual(disc, depositUsdcDisc) && dataBytes.length >= 16) {
        const amount = new DataView(dataBytes.buffer, dataBytes.byteOffset + 8, 8).getBigUint64(0, true);
        eventType = 'deposit';
        deltaUsdc = amount;
      }
      else if (bytesEqual(disc, withdrawSolDisc) && dataBytes.length >= 16) {
        const amount = new DataView(dataBytes.buffer, dataBytes.byteOffset + 8, 8).getBigUint64(0, true);
        eventType = 'withdraw';
        deltaSol = -amount;
      }
      else if (bytesEqual(disc, withdrawUsdcDisc) && dataBytes.length >= 16) {
        const amount = new DataView(dataBytes.buffer, dataBytes.byteOffset + 8, 8).getBigUint64(0, true);
        eventType = 'withdraw';
        deltaUsdc = -amount;
      }
      else if (bytesEqual(disc, botSetBalanceDisc) && dataBytes.length >= 24) {
        const newSol = new DataView(dataBytes.buffer, dataBytes.byteOffset + 8, 8).getBigUint64(0, true);
        const newUsdc = new DataView(dataBytes.buffer, dataBytes.byteOffset + 16, 8).getBigUint64(0, true);
        eventType = 'bot_rebalance';
        deltaSol = newSol - runningSol;
        deltaUsdc = newUsdc - runningUsdc;
      }

      if (eventType) {
        runningSol += deltaSol;
        runningUsdc += deltaUsdc;
        events.push({
          date: new Date(sigInfo.blockTime * 1000).toISOString().split('T')[0],
          timestamp: sigInfo.blockTime,
          solAmount: runningSol,
          usdcAmount: runningUsdc,
          isCashFlow: eventType === 'deposit' || eventType === 'withdraw',
          eventType: eventType,
        });
      }
    }
  }

  return events;
}

const USER_ASSET_BALANCE_SIZE = 89; // 8 discriminator + 32 + 32 + 8 + 8 + 1

/** Агрегує ВСІХ клієнтів по ВСІХ 6 sub-pools через getProgramAccounts -
 * для адмін-панелі: кількість унікальних клієнтів, сумарний фонд. */
export async function fetchAllClientsAggregate(connection) {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ dataSize: USER_ASSET_BALANCE_SIZE }],
  });

  const uniqueOwners = new Set();
  let totalSol = 0n;
  let totalUsdc = 0n;

  for (const { account } of accounts) {
    const data = account.data;
    const owner = new PublicKey(data.subarray(8, 40));
    const solAmount = data.readBigUInt64LE(72);
    const usdcAmount = data.readBigUInt64LE(80);
    uniqueOwners.add(owner.toString());
    totalSol += solAmount;
    totalUsdc += usdcAmount;
  }

  return {
    uniqueClientCount: uniqueOwners.size,
    totalPoolCount: accounts.length,
    totalSol,
    totalUsdc,
  };
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
