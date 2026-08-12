'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getPoolConfig,
  getSimplePoolPda,
  fetchSimplePoolState,
  fetchUserAssetBalance,
  fetchAllPoolsState,
  buildDepositSolSimpleInstruction,
  buildDepositUsdcSimpleInstruction,
  buildWithdrawSolSimpleInstruction,
  buildWithdrawUsdcSimpleInstruction,
  STRATEGIES,
  SENSITIVITIES,
  DECIMALS,
} from '../../lib/simple-fund';
import { getSignalHistory, getTradesForPool } from '../../lib/supabase';
import { SimpleLineChart } from '../simple-line-chart';

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
  const values = series.map((p) => p.portfolio).filter((v) => v !== null && v !== undefined);
  if (values.length < 2) return null;

  const initial = values[0];
  const final = values[values.length - 1];
  const totalReturnPct = ((final / initial) - 1) * 100;

  let runningMax = values[0];
  let maxDrawdownPct = 0;
  for (const v of values) {
    if (v > runningMax) runningMax = v;
    const dd = ((v - runningMax) / runningMax) * 100;
    if (dd < maxDrawdownPct) maxDrawdownPct = dd;
  }

  return { totalReturnPct, maxDrawdownPct, finalValue: final };
}

export default function FundPage() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [strategyType, setStrategyType] = useState(0);
  const [sensitivity, setSensitivity] = useState(0);

  const [allPools, setAllPools] = useState([]);
  const [poolState, setPoolState] = useState(null);
  const [userBalance, setUserBalance] = useState(null);
  const [signalHistory, setSignalHistory] = useState([]);
  const [trades, setTrades] = useState([]);

  const [mode, setMode] = useState('deposit');
  const [asset, setAsset] = useState('SOL');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false);

  const strategyName = STRATEGIES.find((s) => s.type === strategyType)?.name || 'swing';
  const sensitivityName = SENSITIVITIES.find((s) => s.type === sensitivity)?.name || 'conservative';
  const config = getPoolConfig(strategyType, sensitivity);
  const simplePoolPda = getSimplePoolPda(strategyType, sensitivity);

  const refreshAllPools = useCallback(async () => {
    try {
      const pools = await fetchAllPoolsState(connection, publicKey);
      setAllPools(pools);
    } catch (err) {
      console.error('Failed to fetch all pools state:', err);
    }
  }, [connection, publicKey]);

  const refreshSelectedPool = useCallback(async () => {
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

      const history = await getSignalHistory(strategyName, sensitivityName, 60);
      setSignalHistory(history);

      const tradeList = await getTradesForPool(strategyName, sensitivityName, 10);
      setTrades(tradeList);
    } catch (err) {
      console.error('Failed to fetch selected pool data:', err);
    } finally {
      fetchingRef.current = false;
    }
  }, [connection, simplePoolPda, publicKey, strategyName, sensitivityName]);

  useEffect(() => {
    refreshAllPools();
  }, [refreshAllPools]);

  useEffect(() => {
    refreshSelectedPool();
  }, [refreshSelectedPool]);

  const metrics = computeMetrics(signalHistory.map((s) => ({ portfolio: s.price })));

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

      const label = mode === 'deposit' ? `${asset} deposit confirmed` : `${asset} withdrawal confirmed`;
      setStatus({ type: 'success', message: `${label}: ${signature.slice(0, 20)}...` });
      setAmount('');
      await refreshSelectedPool();
      await refreshAllPools();
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
        <div className="panel-label">Fund - choose a sub-pool</div>
        <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 12 }}>
          Each of the 6 sub-pools has its own directly tracked balance per client (no shares).
          Pick a strategy and sensitivity, then deposit or withdraw.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>
              Strategy
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {STRATEGIES.map((s) => (
                <button key={s.type} style={toggleButtonStyle(strategyType === s.type)} onClick={() => setStrategyType(s.type)}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>
              Sensitivity
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {SENSITIVITIES.map((s) => (
                <button key={s.type} style={toggleButtonStyle(sensitivity === s.type)} onClick={() => setSensitivity(s.type)}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-label">
          {strategyName}/{sensitivityName} - your position
        </div>
        {!connected ? (
          <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            Connect your wallet (button above) to see your balance and perform operations.
          </p>
        ) : (
          <div className="data-grid">
            <div className="data-cell">
              <div className="value neutral">${poolState ? formatUsdc(poolState.priceUsdcPerSol) : '-'}</div>
              <div className="sublabel">SOL/USDC price</div>
            </div>
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
                {mode === 'deposit' ? 'Deposit' : 'Withdraw'} {asset}
              </button>
            </div>
          </div>
        </div>
      )}

      {status && (
        <div className="panel">
          <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color:
                status.type === 'success' ? 'var(--confirm-green)' : status.type === 'error' ? 'var(--danger-red)' : 'var(--signal-amber)',
              wordBreak: 'break-word',
            }}
          >
            {status.message}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-label">
          {strategyName}/{sensitivityName} - profitability (bot performance for this sub-pool)
        </div>
        <SimpleLineChart data={signalHistory.map((s) => ({ date: s.date, value: s.price }))}
          valueKey="value"
          color="#6bcb77"
          formatValue={(v) => `$${v?.toFixed(2)}`}
        />
        {metrics && (
          <div className="data-grid" style={{ marginTop: 12 }}>
            <div className="data-cell">
              <div className={`value ${metrics.totalReturnPct >= 0 ? 'neutral' : ''}`} style={{ color: metrics.totalReturnPct >= 0 ? 'var(--confirm-green)' : 'var(--danger-red)' }}>
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
      </div>

      <div className="panel">
        <div className="panel-label">
          {strategyName}/{sensitivityName} - recent trades
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
                <td colSpan={4} style={{ color: 'var(--text-dim)' }}>
                  No trades yet for this sub-pool.
                </td>
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

      <div className="panel">
        <div className="panel-label">All 6 sub-pools - your positions overview</div>
        <table className="signal-table">
          <thead>
            <tr>
              <th>Sub-pool</th>
              <th>Price</th>
              <th>Your SOL</th>
              <th>Your USDC</th>
            </tr>
          </thead>
          <tbody>
            {allPools.map((p) => (
              <tr key={`${p.strategyType}-${p.sensitivityType}`}
                style={{
                  cursor: 'pointer',
                  background: p.strategyType === strategyType && p.sensitivityType === sensitivity ? 'var(--bg-panel-raised)' : 'transparent',
                }}
                onClick={() => {
                  setStrategyType(p.strategyType);
                  setSensitivity(p.sensitivityType);
                }}
              >
                <td>{p.strategyName}/{p.sensitivityName}</td>
                <td>${p.priceUsdcPerSol ? formatUsdc(p.priceUsdcPerSol) : '-'}</td>
                <td>{formatSol(p.solAmount)}</td>
                <td>{formatUsdc(p.usdcAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
