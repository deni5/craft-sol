import { getLatestSignals, getRecentTrades, getSignalHistory } from '../lib/supabase';
import { SignalWaveform } from './signal-waveform';

// force-dynamic: signal/trade data must be FRESH on every request
// (updated daily via daily_pipeline_sol.sh), not statically cached
// at build time.
export const dynamic = 'force-dynamic';

function SignalBadge({ signal }) {
  const cls = signal === 'BUY' ? 'buy' : signal === 'SELL' ? 'sell' : 'hold';
  return <span className={`badge ${cls}`}>{signal}</span>;
}

export default async function DashboardPage() {
  const [signals, trades, waveformData] = await Promise.all([
    getLatestSignals(),
    getRecentTrades(10),
    getSignalHistory('hodl', 'standard', 60),
  ]);

  const totalPortfolio = signals.reduce((sum, s) => sum + (s.portfolio ?? 0), 0);

  return (
    <main>
      <div className="panel">
        <div className="panel-label">Total Portfolio (all sub-pools)</div>
        <div className="data-grid">
          <div className="data-cell">
            <div className="value neutral">${totalPortfolio.toFixed(2)}</div>
            <div className="sublabel">Total USDC-equivalent</div>
          </div>
          <div className="data-cell">
            <div className="value">{signals.length}/6</div>
            <div className="sublabel">Active sub-pools</div>
          </div>
          <div className="data-cell">
            <div className="value">
              {signals.filter((s) => s.signal === 'BUY').length}
            </div>
            <div className="sublabel">BUY signals now</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-label">Signal hodl / standard — target_position (60d)</div>
        <SignalWaveform data={waveformData} />
      </div>

      <div className="panel">
        <div className="panel-label">Sub-pools — current state</div>
        <table className="signal-table">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Sensitivity</th>
              <th>Signal</th>
              <th>Price</th>
              <th>Portfolio</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {signals.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--text-dim)' }}>
                  No data — check Supabase connection and whether daily_pipeline_sol.sh has run
                </td>
              </tr>
            )}
            {signals.map((s) => (
              <tr key={`${s.strategy_type}-${s.sensitivity}`}>
                <td>{s.strategy_type}</td>
                <td>{s.sensitivity}</td>
                <td><SignalBadge signal={s.signal} /></td>
                <td>${s.price?.toFixed(2) ?? '—'}</td>
                <td>${s.portfolio?.toFixed(2) ?? '—'}</td>
                <td>{s.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="panel-label">Recent Trades</div>
        <table className="signal-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Sub-pool</th>
              <th>Type</th>
              <th>SOL</th>
              <th>USDT</th>
              <th>Order ID</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--text-dim)' }}>
                  No trades yet
                </td>
              </tr>
            )}
            {trades.map((t) => (
              <tr key={t.id}>
                <td>{t.date}</td>
                <td>{t.strategy_type}/{t.sensitivity}</td>
                <td><SignalBadge signal={t.type} /></td>
                <td>{t.sol_amount?.toFixed(4) ?? '—'}</td>
                <td>${t.usdt_amount?.toFixed(2) ?? '—'}</td>
                <td style={{ color: 'var(--text-dim)' }}>{t.order_id ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
