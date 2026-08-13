'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getPoolConfig,
  getSimplePoolPda,
  fetchSimplePoolState,
  fetchUserAssetBalance,
  buildDepositSolSimpleInstruction,
  buildDepositUsdcSimpleInstruction,
  buildWithdrawSolSimpleInstruction,
  buildWithdrawUsdcSimpleInstruction,
  DECIMALS,
} from '../lib/simple-fund';
import {
  getSignalHistory,
  getTradesForPool,
  requestBotRun,
} from '../lib/supabase';
import { SimpleLineChart } from './simple-line-chart';

const INSTRUCTION_MAP = {
  'deposit-SOL': buildDepositSolSimpleInstruction,
  'deposit-USDC': buildDepositUsdcSimpleInstruction,
  'withdraw-SOL': buildWithdrawSolSimpleInstruction,
  'withdraw-USDC': buildWithdrawUsdcSimpleInstruction,
};

function formatSol(lamports) {
  if (lamports === null || lamports === undefined) return '-';
  return (Number(lamports) / LAMPORTS_PER_SOL).toFixed(4);
}

function formatUsdc(raw) {
  if (raw === null || raw === undefined) return '-';
  return (Number(raw) / 10 ** DECIMALS).toFixed(4);
}

function computeMetrics(series) {
  if (!series || series.length < 2) return null;
  const values = series.map((p) => p.value).filter((v) => v !== null && v !== undefined && v > 0);
  if (values.length < 2) return null;

  const initial = values[0];
  const final = values[values.length - 1];
  if (initial <= 0) return null;
  const totalReturnPct = ((final / initial) - 1) * 100;

  let runningMax = values[0];
  let maxDrawdownPct = 0;
  for (const v of values) {
    if (v > runningMax) runningMax = v;
    const dd = ((v - runningMax) / runningMax) * 100;
    if (dd < maxDrawdownPct) maxDrawdownPct = dd;
  }

  return { totalReturnPct, maxDrawdownPct };
}

export function PoolCard({ strategyType, sensitivityType, strategyName, sensitivityName, onPoolUpdated }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const config = getPoolConfig(strategyType, sensitivityType);
  const simplePoolPda = getSimplePoolPda(strategyType, sensitivityType);

  const [poolState, setPoolState] = useState(null);
  const [userBalance, setUserBalance] = useState(null);
  const [signalHistory, setSignalHistory] = useState([]);
  const [trades, setTrades] = useState([]);

  const [mode, setMode] = useState('deposit');
  const [asset, setAsset] = useState('SOL');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState(null);
  const [botStatus, setBotStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [botLoading, setBotLoading] = useState(false);
  const fetchingRef = useRef(false);

  const refreshData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const pool = await fetchSimplePoolState(connection, simplePoolPda);
      setPoolState(pool);

      if (publicKey) {
        const balance = await fetchUserAssetBalance(connection, simplePoolPda, publicKey);
        setUserBalance(balance);
      }

      const history = await getSignalHistory(strategyName, sensitivityName, 60);
      setSignalHistory(history);

      const tradeList = await getTradesForPool(strategyName, sensitivityName, 8);
      setTrades(tradeList);
    } catch (err) {
      console.error(`Failed to fetch data for ${strategyName}/${sensitivityName}:`, err);
    } finally {
      fetchingRef.current = false;
    }
  }, [connection, simplePoolPda, publicKey, strategyName, sensitivityName]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const metrics = computeMetrics(signalHistory.map((s) => ({ value: s.price })));

  async function handleStartBot() {
    setBotLoading(true);
    setBotStatus({ type: 'pending', message: 'Requesting bot run...' });
    try {
      await requestBotRun(strategyName, sensitivityName);
      setBotStatus({ type: 'success', message: 'Run requested.' });
    } catch (err) {
      setBotStatus({ type: 'error', message: `Error: ${err.message || err}` });
    } finally {
      setBotLoading(false);
    }
  }

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
        : BigInt(Math.round(amountNum * 10 ** DECIMALS));

    const buildInstructionFn = INSTRUCTION_MAP[`${mode}-${asset}`];

    setLoading(true);
    setStatus({ type: 'pending', message: 'Sending transaction...' });

    try {
      const instruction = await buildInstructionFn(publicKey, amountRaw, config);
      const transaction = new Transaction().add(instruction);
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');

      const label = mode === 'deposit' ? `${asset} top up confirmed` : `${asset} withdrawal confirmed`;
      setStatus({ type: 'success', message: `${label}: ${signature.slice(0, 20)}...` });
      setAmount('');
      await refreshData();
      if (onPoolUpdated) onPoolUpdated();
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
    <div className="panel">
      <div className="panel-label">
        Bot-pool: {strategyName}/{sensitivityName}
      </div>

      <div className="data-grid" style={{ marginBottom: 12 }}>
        <div className="data-cell">
          <div className="value neutral">${poolState ? formatUsdc(poolState.priceUsdcPerSol) : '-'}</div>
          <div className="sublabel">SOL/USDC price</div>
        </div>
        <div className="data-cell">
          <div className="value neutral">{formatSol(userBalance?.solAmount)}</div>
          <div className="sublabel">Your SOL balance</div>
        </div>
        <div className="data-cell">
          <div className="value neutral">{formatUsdc(userBalance?.usdcAmount)}</div>
          <div className="sublabel">Your USDC balance</div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>
          Price dynamics (this bot-pool)
        </div>
        <SimpleLineChart data={signalHistory.map((s) => ({ date: s.date, value: s.price }))}
          valueKey="value"
          color="#6bcb77"
          height={120}
          formatValue={(v) => `$${v?.toFixed(2)}`}
        />
      </div>

      {metrics && (
        <div className="data-grid" style={{ marginBottom: 12 }}>
          <div className="data-cell">
            <div className="value" style={{ color: metrics.totalReturnPct >= 0 ? 'var(--confirm-green)' : 'var(--danger-red)' }}>
              {metrics.totalReturnPct >= 0 ? '+' : ''}{metrics.totalReturnPct.toFixed(2)}%
            </div>
            <div className="sublabel">Price change (period)</div>
          </div>
          <div className="data-cell">
            <div className="value" style={{ color: 'var(--danger-red)' }}>{metrics.maxDrawdownPct.toFixed(2)}%</div>
            <div className="sublabel">Max drawdown</div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <button onClick={handleStartBot}
          disabled={botLoading}
          style={{
            width: '100%',
            background: 'var(--bg-panel-raised)',
            color: 'var(--text-primary)',
            border: '1px solid var(--hairline)',
            borderRadius: 3,
            padding: '8px 0',
            fontWeight: 600,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            cursor: botLoading ? 'not-allowed' : 'pointer',
            opacity: botLoading ? 0.6 : 1,
          }}
        >
          Trigger bot run for this pool
        </button>
        {botStatus && (
          <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              marginTop: 6,
              color: botStatus.type === 'success' ? 'var(--confirm-green)' : botStatus.type === 'error' ? 'var(--danger-red)' : 'var(--signal-amber)',
            }}
          >
            {botStatus.message}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>
          Top up / Withdraw
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={toggleButtonStyle(mode === 'deposit')} onClick={() => setMode('deposit')} disabled={loading}>
              Top up
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
            <input type="number"
              placeholder={`Amount (${asset})`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={loading}
              style={inputStyle}
            />
            <button onClick={handleSubmit}
              disabled={loading}
              style={{
                background: submitColor,
                color: 'var(--bg-void)',
                border: 'none',
                borderRadius: 3,
                padding: '8px 20px',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {mode === 'deposit' ? 'Top up' : 'Withdraw'}
            </button>
          </div>
          {status && (
            <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: status.type === 'success' ? 'var(--confirm-green)' : status.type === 'error' ? 'var(--danger-red)' : 'var(--signal-amber)',
                wordBreak: 'break-word',
              }}
            >
              {status.message}
            </div>
          )}
        </div>
      </div>

      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>
          Recent trades (this bot-pool)
        </div>
        <table className="signal-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>SOL</th>
              <th>USDT</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: 'var(--text-dim)' }}>No trades yet.</td>
              </tr>
            )}
            {trades.map((t) => (
              <tr key={t.id}>
                <td>{t.date}</td>
                <td>{t.type}</td>
                <td>{t.sol_amount?.toFixed(4) ?? '-'}</td>
                <td>${t.usdt_amount?.toFixed(2) ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
