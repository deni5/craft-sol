'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  getPoolPda,
  fetchPoolState,
  fetchUserPosition,
  buildDepositInstruction,
  buildWithdrawInstruction,
  DEMO_POOL,
} from '../../lib/craft-fund';
import { Transaction } from '@solana/web3.js';

function formatTokenAmount(raw, decimals = 6) {
  if (raw === null || raw === undefined) return '—';
  return (Number(raw) / 10 ** decimals).toLocaleString('uk-UA', {
    maximumFractionDigits: decimals,
  });
}

export default function FundPage() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [poolState, setPoolState] = useState(null);
  const [userPosition, setUserPosition] = useState(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawShares, setWithdrawShares] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const fundPoolPda = getPoolPda(DEMO_POOL.strategyType, DEMO_POOL.sensitivity);
  const fetchingRef = useRef(false);

  const refreshState = useCallback(async () => {
    // Захист від подвійного виклику (React StrictMode у dev-режимі
    // навмисно подвоює useEffect) — без цього кожне завантаження
    // сторінки робить удвічі більше RPC-запитів, наближаючи rate limit.
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const pool = await fetchPoolState(connection, fundPoolPda);
      setPoolState(pool);

      if (publicKey) {
        const position = await fetchUserPosition(connection, fundPoolPda, publicKey);
        setUserPosition(position);
      } else {
        setUserPosition(null);
      }
    } catch (err) {
      console.error('Failed to fetch pool state:', err);
      if (err.message?.includes('429')) {
        setStatus({
          type: 'error',
          message:
            'RPC rate limit reached. Public Devnet RPC has strict limits — ' +
            'consider using a dedicated provider (e.g. Helius free tier).',
        });
      }
    } finally {
      fetchingRef.current = false;
    }
  }, [connection, fundPoolPda, publicKey]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  async function handleDeposit() {
    if (!publicKey) return;
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) {
      setStatus({ type: 'error', message: 'Enter a valid deposit amount' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'pending', message: 'Sending transaction...' });

    try {
      const amountRaw = BigInt(Math.round(amount * 10 ** DEMO_POOL.decimals));
      const instruction = await buildDepositInstruction(publicKey, amountRaw);
      const transaction = new Transaction().add(instruction);

      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');

      setStatus({
        type: 'success',
        message: `Deposit confirmed: ${signature.slice(0, 20)}...`,
      });
      setDepositAmount('');
      await refreshState();
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: `Error: ${err.message || err}` });
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw() {
    if (!publicKey) return;
    const sharesAmount = parseFloat(withdrawShares);
    if (!sharesAmount || sharesAmount <= 0) {
      setStatus({ type: 'error', message: 'Enter a valid number of shares' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'pending', message: 'Sending transaction...' });

    try {
      const sharesRaw = BigInt(Math.round(sharesAmount * 10 ** DEMO_POOL.decimals));
      const instruction = await buildWithdrawInstruction(publicKey, sharesRaw);
      const transaction = new Transaction().add(instruction);

      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');

      setStatus({
        type: 'success',
        message: `Withdrawal confirmed: ${signature.slice(0, 20)}...`,
      });
      setWithdrawShares('');
      await refreshState();
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: `Error: ${err.message || err}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <div className="panel">
        <div className="panel-label">
          Fund — swing / conservative (demo pool, test token on Devnet)
        </div>

        {!poolState ? (
          <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            Loading pool state...
          </p>
        ) : (
          <div className="data-grid">
            <div className="data-cell">
              <div className="value neutral">{formatTokenAmount(poolState.totalCapitalUsdc)}</div>
              <div className="sublabel">Total capital (TVL)</div>
            </div>
            <div className="data-cell">
              <div className="value">{formatTokenAmount(poolState.totalShares)}</div>
              <div className="sublabel">Total shares</div>
            </div>
            <div className="data-cell">
              <div className="value">{(poolState.feeBps / 100).toFixed(2)}%</div>
              <div className="sublabel">Withdrawal fee</div>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-label">Your Position</div>
        {!connected ? (
          <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            Connect your wallet (button above) to see your position and perform operations.
          </p>
        ) : (
          <div className="data-cell">
            <div className="value neutral">{formatTokenAmount(userPosition?.shares ?? 0n)}</div>
            <div className="sublabel">Your shares</div>
          </div>
        )}
      </div>

      {connected && (
        <>
          <div className="panel">
            <div className="panel-label">Deposit</div>
            <div style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              <input
                type="number"
                placeholder="Amount (test USDC)"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                disabled={loading}
                style={{
                  flex: 1,
                  background: 'var(--bg-panel-raised)',
                  border: '1px solid var(--hairline)',
                  borderRadius: 3,
                  padding: '8px 12px',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                }}
              />
              <button
                onClick={handleDeposit}
                disabled={loading}
                style={{
                  background: 'var(--confirm-green)',
                  color: 'var(--bg-void)',
                  border: 'none',
                  borderRadius: 3,
                  padding: '8px 20px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                Deposit
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-label">Withdraw</div>
            <div style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              <input
                type="number"
                placeholder="Number of shares"
                value={withdrawShares}
                onChange={(e) => setWithdrawShares(e.target.value)}
                disabled={loading}
                style={{
                  flex: 1,
                  background: 'var(--bg-panel-raised)',
                  border: '1px solid var(--hairline)',
                  borderRadius: 3,
                  padding: '8px 12px',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                }}
              />
              <button
                onClick={handleWithdraw}
                disabled={loading}
                style={{
                  background: 'var(--danger-red)',
                  color: 'var(--bg-void)',
                  border: 'none',
                  borderRadius: 3,
                  padding: '8px 20px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                Withdraw
              </button>
            </div>
          </div>
        </>
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
