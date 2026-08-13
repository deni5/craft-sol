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
  STRATEGIES,
  SENSITIVITIES,
  DECIMALS,
} from '../lib/simple-fund';
import {
  getLatestSignals,
  getSignalHistory,
  getTradesForPool,
  requestBotRun,
  getRecentBotRunRequests,
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

function StatusBadge({ status }) {
  const colors = {
    pending: 'var(--signal-amber)',
    running: 'var(--neutral-blue)',
    completed: 'var(--confirm-green)',
    failed: 'var(--danger-red)',
  };
  return (
    <span style={{ color: colors[status] || 'var(--text-muted)', fontWeight: 600 }}>
      {status}
    </span>
  );
}

function CheckboxRow({ options, selectedValue, onSelect, disabled }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {options.map((opt) => (
        <label key={opt.type}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: selectedValue === opt.type ? 'var(--text-primary)' : 'var(--text-muted)',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <input type="checkbox"
            checked={selectedValue === opt.type}
            onChange={() => onSelect(opt.type)}
            disabled={disabled}
            style={{ width: 16, height: 16, cursor: disabled ? 'not-allowed' : 'pointer' }}
          />
          {opt.name}
        </label>
      ))}
    </div>
  );
}

export default function HomePage() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [strategyType, setStrategyType] = useState(0);
  const [sensitivity, setSensitivity] = useState(0);

  const [allSignals, setAllSignals] = useState([]);
  const [poolState, setPoolState] = useState(null);
  const [userBalance, setUserBalance] = useState(null);
  const [signalHistory, setSignalHistory] = useState([]);
  const [trades, setTrades] = useState([]);
  const [botRequests, setBotRequests] = useState([]);

  const [mode, setMode] = useState('deposit');
  const [asset, setAsset] = useState('SOL');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState(null);
  const [botStatus, setBotStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [botLoading, setBotLoading] = useState(false);
  const fetchingRef = useRef(false);

  const strategyName = STRATEGIES.find((s) => s.type === strategyType)?.name || 'swing';
  const sensitivityName = SENSITIVITIES.find((s) => s.type === sensitivity)?.name || 'conservative';
  const config = getPoolConfig(strategyType, sensitivity);
  const simplePoolPda = getSimplePoolPda(strategyType, sensitivity);

  const hasPosition = userBalance && (userBalance.solAmount > 0n || userBalance.usdcAmount > 0n);

  const totalPortfolio = allSignals.reduce((sum, s) => sum + (s.portfolio ?? 0), 0);
  const buyCount = allSignals.filter((s) => s.signal === 'BUY').length;

  const refreshSummary = useCallback(async () => {
    try {
      const signals = await getLatestSignals();
      setAllSignals(signals);
    } catch (err) {
      console.error('Failed to fetch summary:', err);
    }
  }, []);

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

  const refreshBotRequests = useCallback(async () => {
    try {
      const requests = await getRecentBotRunRequests(5);
      setBotRequests(requests);
    } catch (err) {
      console.error('Failed to fetch bot requests:', err);
    }
  }, []);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  useEffect(() => {
    refreshSelectedPool();
  }, [refreshSelectedPool]);

  useEffect(() => {
    refreshBotRequests();
    const interval = setInterval(refreshBotRequests, 5000);
    return () => clearInterval(interval);
  }, [refreshBotRequests]);

  const metrics = computeMetrics(signalHistory.map((s) => ({ value: s.price })));

  async function handleStartBot() {
    setBotLoading(true);
    setBotStatus({ type: 'pending', message: 'Requesting bot run...' });
    try {
      await requestBotRun(strategyName, sensitivityName);
      setBotStatus({ type: 'success', message: `Run requested for ${strategyName}/${sensitivityName}.` });
      await refreshBotRequests();
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

    const activeMode = hasPosition ? mode : 'deposit';
    const buildInstructionFn = INSTRUCTION_MAP[`${activeMode}-${asset}`];

    setLoading(true);
    setStatus({ type: 'pending', message: hasPosition ? 'Sending transaction...' : 'Creating your pool...' });

    try {
      const instruction = await buildInstructionFn(publicKey, amountRaw, config);
      const transaction = new Transaction().add(instruction);
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');

      const label = !hasPosition
        ? 'Pool created and funded'
        : activeMode === 'deposit'
        ? `${asset} deposit confirmed`
        : `${asset} withdrawal confirmed`;
      setStatus({ type: 'success', message: `${label}: ${signature.slice(0, 20)}...` });
      setAmount('');
      await refreshSelectedPool();
      await refreshSummary();
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

  const submitColor = (!hasPosition || mode === 'deposit') ? 'var(--confirm-green)' : 'var(--danger-red)';

  return (
    <main>
      <div className="panel">
        <div className="panel-label">Overview - all sub-pools (bot performance)</div>
        <div className="data-grid">
          <div className="data-cell">
            <div className="value neutral">${totalPortfolio.toFixed(2)}</div>
            <div className="sublabel">Total USDC-equivalent (bot track record)</div>
          </div>
          <div className="data-cell">
            <div className="value">{allSignals.length}/6</div>
            <div className="sublabel">Active sub-pools</div>
          </div>
          <div className="data-cell">
            <div className="value">{buyCount}</div>
            <div className="sublabel">BUY signals now</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-label">
          {hasPosition ? 'Sub-pool selection' : 'Create your pool - choose options'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>
              Strategy
            </div>
            <CheckboxRow options={STRATEGIES} selectedValue={strategyType} onSelect={setStrategyType} disabled={loading} />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>
              Sensitivity
            </div>
            <CheckboxRow options={SENSITIVITIES} selectedValue={sensitivity} onSelect={setSensitivity} disabled={loading} />
          </div>

          {connected && !hasPosition && (
            <div style={{ marginTop: 6, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>
                Asset to invest
              </div>
              <CheckboxRow options={[{ type: 'SOL', name: 'SOL' }, { type: 'USDC', name: 'USDC' }]}
                selectedValue={asset}
                onSelect={setAsset}
                disabled={loading}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
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
                    background: 'var(--confirm-green)',
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
                  Create Pool
                </button>
              </div>
              {status && (
                <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    marginTop: 8,
                    color:
                      status.type === 'success' ? 'var(--confirm-green)' : status.type === 'error' ? 'var(--danger-red)' : 'var(--signal-amber)',
                    wordBreak: 'break-word',
                  }}
                >
                  {status.message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel">
            <div className="panel-label">
              Bot control - {strategyName}/{sensitivityName}
            </div>
            <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 10 }}>
              Requires the operator&apos;s local listener process to be running.
            </p>
            <button onClick={handleStartBot}
              disabled={botLoading}
              style={{
                width: '100%',
                background: 'var(--confirm-green)',
                color: 'var(--bg-void)',
                border: 'none',
                borderRadius: 3,
                padding: '10px 0',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                cursor: botLoading ? 'not-allowed' : 'pointer',
                opacity: botLoading ? 0.6 : 1,
                marginBottom: 10,
              }}
            >
              Start Bot ({strategyName}/{sensitivityName})
            </button>
            {botStatus && (
              <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color:
                    botStatus.type === 'success' ? 'var(--confirm-green)' : botStatus.type === 'error' ? 'var(--danger-red)' : 'var(--signal-amber)',
                  marginBottom: 10,
                }}
              >
                {botStatus.message}
              </div>
            )}

            <table className="signal-table">
              <thead>
                <tr>
                  <th>Requested</th>
                  <th>Pool</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {botRequests.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ color: 'var(--text-dim)' }}>No run requests yet.</td>
                  </tr>
                )}
                {botRequests.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.requested_at).toLocaleTimeString()}</td>
                    <td>{r.strategy_type}/{r.sensitivity}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-label">Signal history - target_position</div>
            <SimpleLineChart data={signalHistory}
              valueKey="buy_prob"
              color="#ffb86b"
              height={140}
              formatValue={(v) => v?.toFixed(3)}
            />
          </div>

          <div className="panel">
            <div className="panel-label">SOL/USDC price</div>
            <SimpleLineChart data={signalHistory}
              valueKey="price"
              color="#6bcb77"
              height={140}
              formatValue={(v) => `$${v?.toFixed(2)}`}
            />
          </div>
        </div>

        <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!connected && (
            <div className="panel">
              <div className="panel-label">Your investment</div>
              <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                Connect your wallet (button above) to create a pool and invest.
              </p>
            </div>
          )}

          {connected && hasPosition && (
            <>
              <div className="panel">
                <div className="panel-label">
                  Your personal pool - {strategyName}/{sensitivityName}
                </div>
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
              </div>

              <div className="panel">
                <div className="panel-label">Top up / Withdraw</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                      {mode === 'deposit' ? 'Top up' : 'Withdraw'} {asset}
                    </button>
                  </div>
                  {status && (
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color:
                          status.type === 'success' ? 'var(--confirm-green)' : status.type === 'error' ? 'var(--danger-red)' : 'var(--signal-amber)',
                        wordBreak: 'break-word',
                      }}
                    >
                      {status.message}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {connected && !hasPosition && (
            <div className="panel">
              <div className="panel-label">Your personal pool</div>
              <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                No pool yet for {strategyName}/{sensitivityName}. Check the boxes above and press
                &quot;Create Pool&quot; to invest and create your personal position.
              </p>
            </div>
          )}

          <div className="panel">
            <div className="panel-label">Profitability - {strategyName}/{sensitivityName}</div>
            {metrics && (
              <div className="data-grid" style={{ marginBottom: 10 }}>
                <div className="data-cell">
                  <div style={{ color: metrics.totalReturnPct >= 0 ? 'var(--confirm-green)' : 'var(--danger-red)' }} className="value">
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
                    <td colSpan={4} style={{ color: 'var(--text-dim)' }}>No trades yet for this sub-pool.</td>
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
      </div>
    </main>
  );
}
