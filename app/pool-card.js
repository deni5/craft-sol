'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getPoolConfig,
  getSimplePoolPda,
  fetchFirstDepositDate,
  fetchBalanceHistory,
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

function findPriceForDate(signalHistory, targetDate) {
  // Знаходить ціну НАЙБЛИЖЧОГО дня в signalHistory до targetDate
  // (точної відповідності може не бути - вихідні, дні без сигналу).
  if (!signalHistory || signalHistory.length === 0) return null;
  let closest = signalHistory[0];
  let minDiff = Math.abs(new Date(closest.date) - new Date(targetDate));
  for (const s of signalHistory) {
    const diff = Math.abs(new Date(s.date) - new Date(targetDate));
    if (diff < minDiff) {
      minDiff = diff;
      closest = s;
    }
  }
  return closest.price;
}

function computeRealPnl(balanceHistory, signalHistory, currentPrice) {
  // Time-Weighted Return: для КОЖНОГО відрізка між подіями зміни
  // балансу (депозит/вивід/ребаланс бота) рахує прибутковість ЛИШЕ
  // від руху ціни, тримаючи баланс СТАЛИМ - сама подія зміни балансу
  // НЕ зараховується як "прибуток", лише те, що сталося МІЖ подіями.
  // Це коректно виключає вплив депозитів/виводів, залишаючи ЛИШЕ
  // результат руху ціни та рішень бота.
  if (!balanceHistory || balanceHistory.length === 0) return null;

  const events = [...balanceHistory].sort((a, b) => a.timestamp - b.timestamp);
  const checkpoints = events.map((ev) => ({
    date: ev.date,
    sol: Number(ev.solAmount) / LAMPORTS_PER_SOL,
    usdc: Number(ev.usdcAmount) / 10 ** DECIMALS,
    price: findPriceForDate(signalHistory, ev.date),
  }));

  const today = new Date().toISOString().split('T')[0];
  const last = checkpoints[checkpoints.length - 1];
  checkpoints.push({ date: today, sol: last.sol, usdc: last.usdc, price: currentPrice });

  let cumulativeFactor = 1.0;
  for (let i = 0; i < checkpoints.length - 1; i++) {
    const cp = checkpoints[i];
    const next = checkpoints[i + 1];
    if (cp.price === null || next.price === null || cp.price <= 0) continue;

    const valueStart = cp.sol * cp.price + cp.usdc;
    const valueHeldAtNextPrice = cp.sol * next.price + cp.usdc;
    if (valueStart > 0) {
      cumulativeFactor *= valueHeldAtNextPrice / valueStart;
    }
  }

  return (cumulativeFactor - 1) * 100;
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

function computeDayOverDayChange(series) {
  if (!series || series.length < 2) return null;
  const uniqueDates = [...new Set(series.map((p) => p.date))].sort();
  if (uniqueDates.length < 2) return null;

  const lastDate = uniqueDates[uniqueDates.length - 1];
  const prevDate = uniqueDates[uniqueDates.length - 2];

  const lastEntry = [...series].reverse().find((p) => p.date === lastDate);
  const prevEntry = [...series].reverse().find((p) => p.date === prevDate);

  if (!lastEntry || !prevEntry || prevEntry.value <= 0) return null;
  return ((lastEntry.value / prevEntry.value) - 1) * 100;
}

/* IMPORTANT: priceUsdcPerSol/solAmount/usdcAmount are RECEIVED as
   props from the parent component (app/page.js), which has ALREADY
   fetched this data via ONE fetchAllPoolsState call for all 6 pools
   at once. Previously each card SEPARATELY repeated the same RPC
   calls - with 4 cards this gave ~20 concurrent Devnet RPC calls
   and caused mass 429 Too Many Requests errors. Now the card makes
   NO own RPC call for price/balance - only Supabase queries
   (signals/trades) which are not part of fetchAllPoolsState. */
export function PoolCard({
  strategyType,
  sensitivityType,
  strategyName,
  sensitivityName,
  priceUsdcPerSol,
  solAmount,
  usdcAmount,
  onPoolUpdated,
}) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const config = getPoolConfig(strategyType, sensitivityType);

  const [signalHistory, setSignalHistory] = useState([]);
  const [trades, setTrades] = useState([]);
  const [firstDepositDate, setFirstDepositDate] = useState(null);

  const [mode, setMode] = useState('deposit');
  const [asset, setAsset] = useState('SOL');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState(null);
  const [botStatus, setBotStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [botLoading, setBotLoading] = useState(false);
  const fetchingRef = useRef(false);

  const refreshOffChainData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const history = await getSignalHistory(strategyName, sensitivityName, 60);
      setSignalHistory(history);

      const tradeList = await getTradesForPool(strategyName, sensitivityName, 8);
      setTrades(tradeList);
    } catch (err) {
      console.error(`Failed to fetch off-chain data for ${strategyName}/${sensitivityName}:`, err);
    } finally {
      fetchingRef.current = false;
    }
  }, [strategyName, sensitivityName]);

  useEffect(() => {
    refreshOffChainData();
  }, [refreshOffChainData]);

  // Реальна on-chain дата ПЕРШОГО депозиту - потрібна лише ОДИН раз
  // (не при кожному оновленні), тому окремий useEffect.
  useEffect(() => {
    if (!publicKey) return;
    const simplePoolPda = getSimplePoolPda(strategyType, sensitivityType);
    fetchFirstDepositDate(connection, simplePoolPda, publicKey)
      .then(setFirstDepositDate)
      .catch((err) => console.error('Failed to fetch first deposit date:', err));
  }, [connection, publicKey, strategyType, sensitivityType]);

  const [balanceHistory, setBalanceHistory] = useState([]);
  useEffect(() => {
    if (!publicKey) return;
    const simplePoolPda = getSimplePoolPda(strategyType, sensitivityType);
    fetchBalanceHistory(connection, simplePoolPda, publicKey)
      .then(setBalanceHistory)
      .catch((err) => console.error('Failed to fetch balance history:', err));
  }, [connection, publicKey, strategyType, sensitivityType, onPoolUpdated]);

  // IMPORTANT: value of YOUR current balance (SOL+USDC) on each
  // historical price day - NOT the SOL price itself (same for all
  // pools). Different clients with different SOL/USDC amounts in
  // different pools get DIFFERENT curves, since the formula uses
  // THEIR specific balance.
  const solAmountNum = Number(solAmount || 0n) / LAMPORTS_PER_SOL;
  const usdcAmountNum = Number(usdcAmount || 0n) / 10 ** DECIMALS;
  const balanceValueHistory = signalHistory.map((s) => ({
    date: s.date,
    value: solAmountNum * (s.price || 0) + usdcAmountNum,
  }));
  const balanceMetrics = computeMetrics(balanceValueHistory);

  // "З моменту депозиту" - фільтруємо історію до РЕАЛЬНОЇ дати
  // депозиту (не всього доступного діапазону графіка сигналів).
  const sinceDepositHistory = firstDepositDate
    ? balanceValueHistory.filter((h) => h.date >= firstDepositDate)
    : balanceValueHistory;
  const sinceDepositMetrics = computeMetrics(sinceDepositHistory);

  const dayChangePct = computeDayOverDayChange(balanceValueHistory);

  const realPnl = computeRealPnl(balanceHistory, signalHistory, Number(priceUsdcPerSol || 0n) / 10 ** DECIMALS);

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

      // ВАЖЛИВО: автоматично запитуємо запуск бота ПІСЛЯ кожного
      // депозиту/виводу - саме тоді реальна пропорція клієнта може
      // розійтись із ціллю моделі, і потрібна перевірка/корекція
      // (rebalance_client_position), без очікування щоденного циклу
      // чи ручного натискання окремої кнопки.
      try {
        await requestBotRun(strategyName, sensitivityName);
      } catch (err) {
        console.error('Failed to auto-request bot run after deposit:', err);
      }

      // IMPORTANT: do NOT make our own RPC call here - just notify
      // the parent component, which will refresh fetchAllPoolsState
      // in ONE call and pass the new priceUsdcPerSol/solAmount/
      // usdcAmount back as updated props (React re-renders the card).
      if (onPoolUpdated) await onPoolUpdated();
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
          <div className="value neutral">${formatUsdc(priceUsdcPerSol)}</div>
          <div className="sublabel">SOL/USDC price</div>
        </div>
        <div className="data-cell">
          <div className="value neutral">{formatSol(solAmount)}</div>
          <div className="sublabel">Your SOL balance</div>
        </div>
        <div className="data-cell">
          <div className="value neutral">{formatUsdc(usdcAmount)}</div>
          <div className="sublabel">Your USDC balance</div>
        </div>
        <div className="data-cell">
          <div className="value neutral">
            ${((Number(solAmount || 0n) / LAMPORTS_PER_SOL) * (Number(priceUsdcPerSol || 0n) / 10 ** DECIMALS) + Number(usdcAmount || 0n) / 10 ** DECIMALS).toFixed(2)}
          </div>
          <div className="sublabel">Total value (USD)</div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>
          Your balance value in USD (this bot-pool)
        </div>
        <SimpleLineChart data={balanceValueHistory}
          valueKey="value"
          color="#6bcb77"
          height={120}
          formatValue={(v) => `$${v?.toFixed(2)}`}
        />
      </div>

      <div className="data-grid" style={{ marginBottom: 12 }}>
        <div className="data-cell">
          <div className="value" style={{ color: realPnl !== null && realPnl >= 0 ? 'var(--confirm-green)' : 'var(--danger-red)' }}>
            {realPnl !== null ? `${realPnl >= 0 ? '+' : ''}${realPnl.toFixed(2)}%` : '-'}
          </div>
          <div className="sublabel">PnL (bot performance){firstDepositDate ? ` since ${firstDepositDate}` : ''}</div>
        </div>
        <div className="data-cell">
          <div className="value" style={{ color: dayChangePct !== null && dayChangePct >= 0 ? 'var(--confirm-green)' : dayChangePct !== null ? 'var(--danger-red)' : 'var(--text-muted)' }}>
            {dayChangePct !== null ? `${dayChangePct >= 0 ? '+' : ''}${dayChangePct.toFixed(2)}%` : '-'}
          </div>
          <div className="sublabel">vs yesterday</div>
        </div>
        <div className="data-cell">
          <div className="value" style={{ color: 'var(--danger-red)' }}>{sinceDepositMetrics ? sinceDepositMetrics.maxDrawdownPct.toFixed(2) : '0.00'}%</div>
          <div className="sublabel">Max drawdown</div>
        </div>
      </div>

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
