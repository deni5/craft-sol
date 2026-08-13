'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSignalHistory, getMarketHistory } from '../../lib/supabase';
import { PriceWithSignalsChart } from '../price-signals-chart';
import { RsiChart } from '../rsi-chart';
import { ProbabilityChart } from '../probability-chart';
import { SimpleLineChart } from '../simple-line-chart';

const STRATEGIES = ['swing', 'hodl'];
const SENSITIVITIES = ['conservative', 'standard', 'sensitive'];

export default function SignalsPage() {
  const [strategy, setStrategy] = useState('swing');
  const [sensitivity, setSensitivity] = useState('standard');
  const [history, setHistory] = useState([]);
  const [marketHistory, setMarketHistory] = useState([]);
  const fetchingRef = useRef(false);

  const refreshHistory = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const data = await getSignalHistory(strategy, sensitivity, 90);
      setHistory(data);
    } catch (err) {
      console.error('Failed to fetch signal history:', err);
    } finally {
      fetchingRef.current = false;
    }
  }, [strategy, sensitivity]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    getMarketHistory(2500)
      .then(setMarketHistory)
      .catch((err) => console.error('Failed to fetch market history:', err));
  }, []);

  const validPrices = marketHistory.filter((h) => h.price !== null && h.price !== undefined);
  const validVix = marketHistory.filter((h) => h.vix !== null && h.vix !== undefined);
  const validDxy = marketHistory.filter((h) => h.dxy !== null && h.dxy !== undefined);

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

  return (
    <main>
      <div className="panel">
        <div className="panel-label">Signals - detailed view (per sub-pool)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>
              Strategy
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {STRATEGIES.map((s) => (
                <button key={s} style={toggleButtonStyle(strategy === s)} onClick={() => setStrategy(s)}>
                  {s}
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
                <button key={s} style={toggleButtonStyle(sensitivity === s)} onClick={() => setSensitivity(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-label">SOL/USDC price with BUY / SELL markers ({strategy}/{sensitivity})</div>
        <PriceWithSignalsChart data={history} />
      </div>

      <div className="panel">
        <div className="panel-label">RSI indicator ({strategy}/{sensitivity})</div>
        <RsiChart data={history} />
      </div>

      <div className="panel">
        <div className="panel-label">BUY / HOLD / SELL probability distribution ({strategy}/{sensitivity})</div>
        <ProbabilityChart data={history} />
      </div>

      <div className="panel">
        <div className="panel-label">Market overview - full history, independent of any sub-pool</div>
        <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 12 }}>
          {marketHistory.length} days of data used as macro model inputs.
        </p>
      </div>

      <div className="panel">
        <div className="panel-label">SOL/USDC price - full history</div>
        <SimpleLineChart data={validPrices.map((h) => ({ date: h.date, value: h.price }))}
          valueKey="value"
          color="#6bcb77"
          height={200}
          formatValue={(v) => `$${v?.toFixed(2)}`}
        />
      </div>

      <div className="panel">
        <div className="panel-label">VIX - CBOE Volatility Index</div>
        <SimpleLineChart data={validVix.map((h) => ({ date: h.date, value: h.vix }))}
          valueKey="value"
          color="#ff6b6b"
          height={140}
          formatValue={(v) => v?.toFixed(2)}
        />
      </div>

      <div className="panel">
        <div className="panel-label">DXY - US Dollar Index</div>
        <SimpleLineChart data={validDxy.map((h) => ({ date: h.date, value: h.dxy }))}
          valueKey="value"
          color="#ffb86b"
          height={140}
          formatValue={(v) => v?.toFixed(2)}
        />
      </div>
    </main>
  );
}
