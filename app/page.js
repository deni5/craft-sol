import { getLatestSignals, getRecentTrades, getSignalHistory } from '../lib/supabase';
import { SignalWaveform } from './signal-waveform';

// ВАЖЛИВО: force-dynamic — дані сигналів/угод мають бути СВІЖИМИ на
// кожен запит (оновлюються щодня через daily_pipeline_sol.sh), а не
// статично закешованими на момент білда. Без цього Next.js спробує
// пре-рендерити сторінку один раз під час build і показувати
// застарілі дані всім відвідувачам.
export const dynamic = 'force-dynamic';

function SignalBadge({ signal }) {
  const cls = signal === 'BUY' ? 'buy' : signal === 'SELL' ? 'sell' : 'hold';
  return <span className={`badge ${cls}`}>{signal}</span>;
}

export default async function DashboardPage() {
  // Server component — дані підтягуються на сервері при кожному
  // запиті (немає client-side loading state для першого рендеру)
  const [signals, trades, waveformData] = await Promise.all([
    getLatestSignals(),
    getRecentTrades(10),
    getSignalHistory('hodl', 'standard', 60),
  ]);

  const totalPortfolio = signals.reduce((sum, s) => sum + (s.portfolio ?? 0), 0);

  return (
    <main>
      <div className="panel">
        <div className="panel-label">Сукупний портфель (усі sub-pools)</div>
        <div className="data-grid">
          <div className="data-cell">
            <div className="value neutral">${totalPortfolio.toFixed(2)}</div>
            <div className="sublabel">Total USDC-equivalent</div>
          </div>
          <div className="data-cell">
            <div className="value">{signals.length}/6</div>
            <div className="sublabel">Активних sub-pools</div>
          </div>
          <div className="data-cell">
            <div className="value">
              {signals.filter((s) => s.signal === 'BUY').length}
            </div>
            <div className="sublabel">BUY сигналів зараз</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-label">Сигнал hodl / standard — target_position (60д)</div>
        <SignalWaveform data={waveformData} />
      </div>

      <div className="panel">
        <div className="panel-label">Sub-pools — поточний стан</div>
        <table className="signal-table">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Sensitivity</th>
              <th>Сигнал</th>
              <th>Ціна</th>
              <th>Portfolio</th>
              <th>Оновлено</th>
            </tr>
          </thead>
          <tbody>
            {signals.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--text-dim)' }}>
                  Немає даних — перевірте підключення Supabase та чи запускався daily_pipeline_sol.sh
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
        <div className="panel-label">Останні угоди</div>
        <table className="signal-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Sub-pool</th>
              <th>Тип</th>
              <th>SOL</th>
              <th>USDT</th>
              <th>Order ID</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--text-dim)' }}>
                  Угод ще не було
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
