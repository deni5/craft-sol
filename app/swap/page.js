'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  fetchSwapPoolState,
  buildSwapUsdcToSolInstruction,
  buildSwapSolToUsdcInstruction,
  SWAP_CONFIG,
} from '../../lib/swap-client';

const SLIPPAGE_BPS = 100;

function formatUsdc(raw) {
  if (raw === null || raw === undefined) return '-';
  return (Number(raw) / 10 ** SWAP_CONFIG.decimals).toFixed(4);
}

export default function SwapPage() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [poolState, setPoolState] = useState(null);
  const [direction, setDirection] = useState('usdc-to-sol');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false);

  const refreshPool = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const pool = await fetchSwapPoolState(connection);
      setPoolState(pool);
    } catch (err) {
      console.error('Failed to fetch swap pool state:', err);
    } finally {
      fetchingRef.current = false;
    }
  }, [connection]);

  useEffect(() => {
    refreshPool();
  }, [refreshPool]);

  let expectedOutput = null;
  let feeAmount = null;
  if (poolState && amount && parseFloat(amount) > 0) {
    const amountNum = parseFloat(amount);
    const price = Number(poolState.priceUsdcPerSol) / 10 ** SWAP_CONFIG.decimals;
    const feeRate = poolState.feeBps / 10000;

    if (direction === 'usdc-to-sol') {
      const grossSol = amountNum / price;
      feeAmount = grossSol * feeRate;
      expectedOutput = grossSol - feeAmount;
    } else {
      const grossUsdc = amountNum * price;
      feeAmount = grossUsdc * feeRate;
      expectedOutput = grossUsdc - feeAmount;
    }
  }

  async function handleSwap() {
    if (!publicKey) return;
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setStatus({ type: 'error', message: 'Enter a valid amount' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'pending', message: 'Sending swap transaction...' });

    try {
      let instruction;
      if (direction === 'usdc-to-sol') {
        const amountRaw = BigInt(Math.round(amountNum * 10 ** SWAP_CONFIG.decimals));
        const expectedLamports = BigInt(Math.round((expectedOutput || 0) * LAMPORTS_PER_SOL));
        const minSolOut = (expectedLamports * BigInt(10000 - SLIPPAGE_BPS)) / BigInt(10000);
        instruction = await buildSwapUsdcToSolInstruction(publicKey, amountRaw, minSolOut);
      } else {
        const amountRaw = BigInt(Math.round(amountNum * LAMPORTS_PER_SOL));
        const expectedRaw = BigInt(Math.round((expectedOutput || 0) * 10 ** SWAP_CONFIG.decimals));
        const minUsdcOut = (expectedRaw * BigInt(10000 - SLIPPAGE_BPS)) / BigInt(10000);
        instruction = await buildSwapSolToUsdcInstruction(publicKey, amountRaw, minUsdcOut);
      }

      const transaction = new Transaction().add(instruction);
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');

      setStatus({ type: 'success', message: 'Swap confirmed: ' + signature.slice(0, 20) + '...' });
      setAmount('');
      await refreshPool();
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Error: ' + (err.message || err) });
    } finally {
      setLoading(false);
    }
  }

  const toggleButtonStyle = (active) => ({
    flex: 1,
    background: active ? 'var(--signal-amber)' : 'var(--bg-panel-raised)',
    color: active ? 'var(--bg-void)' : 'var(--text-muted)',
    border: '1px solid var(--hairline)',
    borderRadius: 3,
    padding: '10px 0',
    fontWeight: 600,
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    cursor: 'pointer',
  });

  const inputStyle = {
    flex: 1,
    background: 'var(--bg-panel-raised)',
    border: '1px solid var(--hairline)',
    borderRadius: 3,
    padding: '10px 12px',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    fontSize: 'inherit',
  };

  const fromLabel = direction === 'usdc-to-sol' ? 'USDC' : 'SOL';
  const toLabel = direction === 'usdc-to-sol' ? 'SOL' : 'USDC';

  return (
    <main>
      <div className="panel">
        <div className="panel-label">Swap - internal SOL / USDC market maker</div>
        <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 12 }}>
          Own liquidity pool instead of Jupiter Aggregator (Jupiter routes real mainnet
          liquidity, unavailable on Devnet). Price synced from Binance. Fee stays in the
          reserve, benefiting future swaps.
        </p>

        {!poolState ? (
          <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            Loading pool state...
          </p>
        ) : (
          <div className="data-grid">
            <div className="data-cell">
              <div className="value neutral">${formatUsdc(poolState.priceUsdcPerSol)}</div>
              <div className="sublabel">SOL price (synced from Binance)</div>
            </div>
            <div className="data-cell">
              <div className="value">{(poolState.feeBps / 100).toFixed(2)}%</div>
              <div className="sublabel">Swap fee</div>
            </div>
          </div>
        )}
      </div>

      {connected && (
        <div className="panel">
          <div className="panel-label">Swap</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={toggleButtonStyle(direction === 'usdc-to-sol')}
                onClick={() => setDirection('usdc-to-sol')}
                disabled={loading}
              >
                USDC to SOL
              </button>
              <button style={toggleButtonStyle(direction === 'sol-to-usdc')}
                onClick={() => setDirection('sol-to-usdc')}
                disabled={loading}
              >
                SOL to USDC
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              <input type="number"
                placeholder={'Amount (' + fromLabel + ')'}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={loading}
                style={inputStyle}
              />
              <button onClick={handleSwap}
                disabled={loading}
                style={{
                  background: 'var(--signal-amber)',
                  color: 'var(--bg-void)',
                  border: 'none',
                  borderRadius: 3,
                  padding: '10px 20px',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                Swap
              </button>
            </div>

            {expectedOutput !== null && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                You will receive approximately{' '}
                <span style={{ color: 'var(--confirm-green)' }}>
                  {expectedOutput.toFixed(6)} {toLabel}
                </span>
                {' '}(fee: {feeAmount ? feeAmount.toFixed(6) : '0'} {toLabel}, 1% slippage tolerance applied)
              </div>
            )}
          </div>
        </div>
      )}

      {!connected && (
        <div className="panel">
          <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            Connect your wallet (button above) to swap.
          </p>
        </div>
      )}

      {status && (
        <div className="panel">
          <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color:
                status.type === 'success'
                  ? 'var(--confirm-green)'
                  : status.type === 'error'
                  ? 'var(--danger-red)'
                  : 'var(--signal-amber)',
              wordBreak: 'break-word',
            }}
          >
            {status.message}
          </div>
        </div>
      )}
    </main>
  );
}
