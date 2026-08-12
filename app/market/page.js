import { getMarketHistory } from '../../lib/supabase';
import { SimpleLineChart } from '../simple-line-chart';

export const dynamic = 'force-dynamic';

export default async function MarketPage() {
  const history = await getMarketHistory(2500);

  const validPrices = history.filter((h) => h.price !== null && h.price !== undefined);
  const validVix = history.filter((h) => h.vix !== null && h.vix !== undefined);
  const validDxy = history.filter((h) => h.dxy !== null && h.dxy !== undefined);

  return (
    <main>
      <div className="panel">
        <div className="panel-label">Market overview - independent of any single sub-pool</div>
        <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 12 }}>
          Full historical SOL/USDC price alongside macro indicators (VIX, DXY) used as model
          inputs. {history.length} days of data ({history[0]?.date} to {history[history.length - 1]?.date}).
        </p>
      </div>

      <div className="panel">
        <div className="panel-label">SOL/USDC price - full history</div>
        <SimpleLineChart data={validPrices.map((h) => ({ date: h.date, value: h.price }))}
          valueKey="value"
          color="#6bcb77"
          height={220}
          formatValue={(v) => `$${v?.toFixed(2)}`}
        />
      </div>

      <div className="panel">
        <div className="panel-label">VIX - CBOE Volatility Index (macro model input)</div>
        <SimpleLineChart data={validVix.map((h) => ({ date: h.date, value: h.vix }))}
          valueKey="value"
          color="#ff6b6b"
          height={160}
          formatValue={(v) => v?.toFixed(2)}
        />
      </div>

      <div className="panel">
        <div className="panel-label">DXY - US Dollar Index (macro model input)</div>
        <SimpleLineChart data={validDxy.map((h) => ({ date: h.date, value: h.dxy }))}
          valueKey="value"
          color="#ffb86b"
          height={160}
          formatValue={(v) => v?.toFixed(2)}
        />
      </div>
    </main>
  );
}
