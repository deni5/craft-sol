/* Same calculation method as backtest_sol.py finalize_backtest() -
   ported to JS to compute directly on the client from real data. */

function computeMetrics(series) {
  if (!series || series.length < 2) return null;

  const values = series.map((p) => p.portfolio);
  const initial = values[0];
  const final = values[values.length - 1];
  const totalReturnPct = ((final / initial) - 1) * 100;

  const dailyReturns = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) {
      dailyReturns.push((values[i] - values[i - 1]) / values[i - 1]);
    }
  }

  let sharpe = 0;
  if (dailyReturns.length > 1) {
    const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance =
      dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length;
    const std = Math.sqrt(variance);
    if (std > 0) {
      sharpe = (mean / std) * Math.sqrt(365);
    }
  }

  let runningMax = values[0];
  let maxDrawdownPct = 0;
  for (const v of values) {
    if (v > runningMax) runningMax = v;
    const drawdown = ((v - runningMax) / runningMax) * 100;
    if (drawdown < maxDrawdownPct) maxDrawdownPct = drawdown;
  }

  return {
    totalReturnPct,
    sharpe,
    maxDrawdownPct,
    finalValue: final,
    nDays: values.length,
  };
}

const POOL_LABELS = {
  swing_conservative: 'swing/conservative',
  swing_standard: 'swing/standard',
  swing_sensitive: 'swing/sensitive',
  hodl_conservative: 'hodl/conservative',
  hodl_standard: 'hodl/standard',
  hodl_sensitive: 'hodl/sensitive',
};

function metricColor(value) {
  if (value > 0) return 'var(--confirm-green)';
  if (value < 0) return 'var(--danger-red)';
  return 'var(--text-muted)';
}

export function PerformanceMetrics({ groupedData }) {
  const keys = Object.keys(groupedData || {}).filter((k) => groupedData[k]?.length >= 2);

  if (keys.length === 0) {
    return (
      <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        Not enough history yet to compute performance metrics (needs 2+ data points per pool).
      </p>
    );
  }

  return (
    <table className="signal-table">
      <thead>
        <tr>
          <th>Sub-pool</th>
          <th>Total Return</th>
          <th>Sharpe Ratio</th>
          <th>Max Drawdown</th>
          <th>Data Points</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((key) => {
          const metrics = computeMetrics(groupedData[key]);
          if (!metrics) return null;
          return (
            <tr key={key}>
              <td>{POOL_LABELS[key] || key}</td>
              <td style={{ color: metricColor(metrics.totalReturnPct) }}>
                {metrics.totalReturnPct >= 0 ? '+' : ''}
                {metrics.totalReturnPct.toFixed(2)}%
              </td>
              <td>{metrics.sharpe.toFixed(3)}</td>
              <td style={{ color: 'var(--danger-red)' }}>
                {metrics.maxDrawdownPct.toFixed(2)}%
              </td>
              <td style={{ color: 'var(--text-dim)' }}>{metrics.nDays}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
