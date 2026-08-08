'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSignalHistory,
  requestBotRun,
  getRecentBotRunRequests,
} from '../../lib/supabase';
import { SimpleLineChart } from '../simple-line-chart';

const STRATEGIES = ['swing', 'hodl'];
const SENSITIVITIES = ['conservative', 'standard', 'sensitive'];

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

export default function BotControlPage() {
  const [strategy, setStrategy] = useState('swing');
  const [sensitivity, setSensitivity] = useState('standard');

  const [signalHistory, setSignalHistory] = useState([]);
  const [botRequests, setBotRequests] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false);

  const refreshSignalHistory = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const history = await getSignalHistory(strategy, sensitivity, 60);
      setSignalHistory(history);
    } catch (err) {
      console.error('Failed to fetch signal history:', err);
    } finally {
      fetchingRef.current = false;
    }
  }, [strategy, sensitivity]);

  const refreshBotRequests = useCallback(async () => {
    try {
      const requests = await getRecentBotRunRequests(10);
      setBotRequests(requests);
    } catch (err) {
      console.error('Failed to fetch bot requests:', err);
    }
  }, []);

  useEffect(() => {
    refreshSignalHistory();
  }, [refreshSignalHistory]);

  useEffect(() => {
    refreshBotRequests();
    const interval = setInterval(refreshBotRequests, 5000);
    return () => clearInterval(interval);
  }, [refreshBotRequests]);

  async function handleStartBot() {
    setLoading(true);
    setStatus({ type: 'pending', message: 'Requesting bot run...' });
    try {
      await requestBotRun(strategy, sensitivity);
      setStatus({
        type: 'success',
        message: `Run requested for ${strategy}/${sensitivity}. Waiting for local listener to pick it up (bot_run_listener.py must be running).`,
      });
      await refreshBotRequests();
    } catch (err) {
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

  return (
    <main>
      <div className="panel">
        <div className="panel-label">Bot Control</div>
        <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 16 }}>
          Select a sub-pool (strategy × sensitivity), then request a real bot run. A local
          listener process (bot_run_listener.py) on the operator&apos;s machine must be running
          to actually execute it.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>
              Strategy
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {STRATEGIES.map((s) => (
                <button key={s} style={toggleButtonStyle(strategy === s)} onClick={() => setStrategy(s)} disabled={loading}>
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
                <button key={s} style={toggleButtonStyle(sensitivity === s)} onClick={() => setSensitivity(s)} disabled={loading}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={handleStartBot}
              disabled={loading}
              style={{
                flex: 1,
                background: 'var(--confirm-green)',
                color: 'var(--bg-void)',
                border: 'none',
                borderRadius: 3,
                padding: '10px 0',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              ▶ Start Bot ({strategy}/{sensitivity})
            </button>
            
              href="/fund"
              style={{
                flex: 1,
                background: 'var(--signal-amber)',
                color: 'var(--bg-void)',
                border: 'none',
                borderRadius: 3,
                padding: '10px 0',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                textAlign: 'center',
                textDecoration: 'none',
                display: 'block',
              }}
            >
              💰 Top Up Balance
            </a>
          </div>
        </div>
      </div>

      {status && (
        <div className="panel">
          <div
            style={{
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
        <div className="panel-label">Signal history — target_position ({strategy}/{sensitivity})</div>
        <SimpleLineChart
          data={signalHistory}
          valueKey="buy_prob"
          color="#ffb86b"
          formatValue={(v) => v?.toFixed(3)}
        />
      </div>

      <div className="panel">
        <div className="panel-label">SOL price — {strategy}/{sensitivity}</div>
        <SimpleLineChart
          data={signalHistory}
          valueKey="price"
          color="#6bcb77"
          formatValue={(v) => `$${v?.toFixed(2)}`}
        />
      </div>

      <div className="panel">
        <div className="panel-label">Recent bot run requests</div>
        <table className="signal-table">
          <thead>
            <tr>
              <th>Requested</th>
              <th>Sub-pool</th>
              <th>Status</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {botRequests.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: 'var(--text-dim)' }}>
                  No run requests yet.
                </td>
              </tr>
            )}
            {botRequests.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.requested_at).toLocaleString()}</td>
                <td>{r.strategy_type}/{r.sensitivity}</td>
                <td><StatusBadge status={r.status} /></td>
                <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>{r.error_message ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
