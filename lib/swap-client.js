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

export const SWAP_CONFIG = {
  mint: new PublicKey('93xPu42YyfAq8jFWFW4xqBvvcBReCC9dfddtCHSruK5w'),
  decimals: 6,
};

async function anchorDiscriminator(instructionName) {
  const encoder = new TextEncoder();
  const data = encoder.encode('global:' + instructionName);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer).slice(0, 8);
}

export function getSwapPoolPda() {
  const result = PublicKey.findProgramAddressSync(
    [Buffer.from('swap_pool')],
    PROGRAM_ID
  );
  return result[0];
}

export function getSwapTokenVaultPda() {
  const result = PublicKey.findProgramAddressSync(
    [Buffer.from('swap_token_vault')],
    PROGRAM_ID
  );
  return result[0];
}

export function getSwapSolVaultPda() {
  const result = PublicKey.findProgramAddressSync(
    [Buffer.from('swap_sol_vault')],
    PROGRAM_ID
  );
  return result[0];
}

export async function fetchSwapPoolState(connection) {
  const swapPoolPda = getSwapPoolPda();
  const accountInfo = await connection.getAccountInfo(swapPoolPda);
  if (!accountInfo) return null;

  const data = accountInfo.data;
  const priceOffset = 8 + 32 + 32 + 32;
  const price = data.readBigUInt64LE(priceOffset);
  const feeBps = data.readUInt16LE(priceOffset + 8);

  return { priceUsdcPerSol: price, feeBps };
}

export async function buildSwapUsdcToSolInstruction(user, usdcAmountIn, minSolOut) {
  const swapPoolPda = getSwapPoolPda();
  const tokenVaultPda = getSwapTokenVaultPda();
  const solVaultPda = getSwapSolVaultPda();
  const userTokenAccount = await getAssociatedTokenAddress(SWAP_CONFIG.mint, user);

  const discriminator = await anchorDiscriminator('swap_usdc_to_sol');
  const argsBuffer = Buffer.alloc(16);
  argsBuffer.writeBigUInt64LE(usdcAmountIn, 0);
  argsBuffer.writeBigUInt64LE(minSolOut, 8);
  const data = Buffer.concat([Buffer.from(discriminator), argsBuffer]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: swapPoolPda, isSigner: false, isWritable: false },
      { pubkey: tokenVaultPda, isSigner: false, isWritable: true },
      { pubkey: solVaultPda, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export async function buildSwapSolToUsdcInstruction(user, solAmountIn, minUsdcOut) {
  const swapPoolPda = getSwapPoolPda();
  const tokenVaultPda = getSwapTokenVaultPda();
  const solVaultPda = getSwapSolVaultPda();
  const userTokenAccount = await getAssociatedTokenAddress(SWAP_CONFIG.mint, user);

  const discriminator = await anchorDiscriminator('swap_sol_to_usdc');
  const argsBuffer = Buffer.alloc(16);
  argsBuffer.writeBigUInt64LE(solAmountIn, 0);
  argsBuffer.writeBigUInt64LE(minUsdcOut, 8);
  const data = Buffer.concat([Buffer.from(discriminator), argsBuffer]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: swapPoolPda, isSigner: false, isWritable: false },
      { pubkey: tokenVaultPda, isSigner: false, isWritable: true },
      { pubkey: solVaultPda, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}
