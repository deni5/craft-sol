'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getSimplePoolPda,
  fetchSimplePoolState,
  fetchUserAssetBalance,
  buildDepositSolSimpleInstruction,
  buildDepositUsdcSimpleInstruction,
  buildWithdrawSolSimpleInstruction,
  buildWithdrawUsdcSimpleInstruction,
  SIMPLE_POOL_CONFIG,
} from '../../lib/simple-fund';

function formatSol(lamports) {
  if (lamports === null || lamports === undefined) return '—';
  return (Number(lamports) / LAMPORTS_PER_SOL).toFixed(4);
}

function formatUsdc(raw, decimals = 6) {
  if (raw === null || raw === undefined) return '—';
  return (Number(raw) / 10 ** decimals).toFixed(2);
}

const INSTRUCTION_MAP = {
  'deposit-SOL': buildDepositSolSimpleInstruction,
  'deposit-USDC': buildDepositUsdcSimpleInstruction,
  'withdraw-SOL': buildWithdrawSolSimpleInstruction,
  'withdraw-USDC': buildWithdrawUsdcSimpleInstruction,
};

export default function FundPage() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [poolState, setPoolState] = useState(null);
  const [userBalance, setUserBalance] = useState(null);

  const [mode, setMode] = useState('deposit');
  const [asset, setAsset] = useState('SOL');
  const [amount, setAmount] = useState('');

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false);

  const simplePoolPda = getSimplePoolPda(SIMPLE_POOL_CONFIG.strategyType, SIMPLE_POOL_CONFIG.sensitivity);

  const refreshState = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const pool = await fetchSimplePoolState(connection, simplePoolPda);
      setPoolState(pool);

      if (publicKey) {
        const balance = await fetchUserAssetBalance(connection, simplePoolPda, publicKey);
        setUserBalance(balance);
      } else {
        setUserBalance(null);
      }
    } catch (err) {
      console.error('Failed to fetch state:', err);
    } finally {
      fetchingRef.current = false;
    }
  }, [connection, simplePoolPda, publicKey]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  async function handleSubmit() {
    if (!publicKey) return;
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setStatus({ type: 'error', message: `Enter a valid ${asset} amount` });
      return;
    }

    const amountRaw =
      asset === 'SOL'
        ? BigInt(Math.round(amountNum * LAMPORTS_PER_SOL))
        : BigInt(Math.round(amountNum * 10 ** SIMPLE_POOL_CONFIG.decimals));

    const buildInstructionFn = INSTRUCTION_MAP[`${mode}-${asset}`];

    setLoading(true);
    setStatus({ type: 'pending', message: 'Sending transaction...' });

    try {
      const instruction = await buildInstructionFn(publicKey, amountRaw);
      const transaction = new Transaction().add(instruction);
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');

      const label = mode === 'deposit' ? `${asset} deposit confirmed` : `${asset} withdrawal confirmed`;
      setStatus({ type: 'success', message: `${label}: ${signature.slice(0, 20)}...` });
      setAmount('');
      await refreshState();
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: `Error: ${err.message || err}` });
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
    padding: '8px 0',
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
    padding: '8px 12px',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    fontSize: 'inherit',
  };

  const submitColor = mode === 'deposit' ? 'var(--confirm-green)' : 'var(--danger-red)';

  return (
    <main>
      <div className="panel">
        <div className="panel-label">
          Fund — swing / conservative (individual balance accounting, no shares)
        </div>
        <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 12 }}>
          Each client has a directly tracked balance (SOL + USDC), not a proportional
          share of a pooled fund.
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
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-label">Your Balance (direct, not shares)</div>
        {!connected ? (
          <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            Connect your wallet (button above) to see your balance and perform operations.
          </p>
        ) : (
          <div className="data-grid">
            <div className="data-cell">
              <div className="value neutral">{formatSol(userBalance?.solAmount)}</div>
              <div className="sublabel">Your SOL</div>
            </div>
            <div className="data-cell">
              <div className="value neutral">{formatUsdc(userBalance?.usdcAmount)}</div>
              <div className="sublabel">Your USDC</div>
            </div>
          </div>
        )}
      </div>

      {connected && (
        <div className="panel">
          <div className="panel-label">Deposit / Withdraw</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={toggleButtonStyle(mode === 'deposit')} onClick={() => setMode('deposit')} disabled={loading}>
                Deposit
              </button>
              <button style={toggleButtonStyle(mode === 'withdraw')} onClick={() => setMode('withdraw')} disabled={loading}>
                Withdraw
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button style={toggleButtonStyle(asset === 'SOL')} onClick={() => setAsset('SOL')} disabled={loading}>
                SOL
              </button>
              <button style={toggleButtonStyle(asset === 'USDC')} onClick={() => setAsset('USDC')} disabled={loading}>
                USDC
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              <input
                type="number"
                placeholder={`Amount (${asset})`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={loading}
                style={inputStyle}
              />
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  background: submitColor,
                  color: 'var(--bg-void)',
                  border: 'none',
                  borderRadius: 3,
                  padding: '8px 20px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                }}
              >
                {mode === 'deposit' ? 'Deposit' : 'Withdraw'} {asset}
              </button>
            </div>
          </div>
        </div>
      )}

      {status && (
        <div className="panel">
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color:
                status.type === 'success'
                  ? 'var(--confirm-green)'
                  : status.type === 'error'
                  ? 'var(--danger-red)'
                  : 'var(--signal-amber)',
              wordBreak: 'break-all',
            }}
          >
            {status.message}
          </div>
        </div>
      )}
    </main>
  );
}
