'use client';

import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { getLatestSignals, getRecentTrades } from '../../lib/supabase';
import { fetchAllClientsAggregate, DECIMALS } from '../../lib/simple-fund';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

const ADMIN_PUBKEY = 'xBJwibCHjcX7SjJ2RQ1yaaanDiXxzgEQDdzWK4HJGP9';

export default function AdminPage() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [signals, setSignals] = useState([]);
  const [trades, setTrades] = useState([]);
  const [clientsAggregate, setClientsAggregate] = useState(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = connected && publicKey && publicKey.toString() === ADMIN_PUBKEY;

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    getLatestSignals()
      .then((data) => {
        setSignals(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch signals:', err);
        setLoading(false);
      });
    getRecentTrades(30)
      .then(setTrades)
      .catch((err) => console.error('Failed to fetch trades:', err));
    fetchAllClientsAggregate(connection)
      .then(setClientsAggregate)
      .catch((err) => console.error('Failed to fetch clients aggregate:', err));
  }, [isAdmin, connection]);

  if (!connected) {
    return (
      <main>
        <div className="panel">
          <div className="panel-label">Admin - restricted</div>
          <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            Connect your wallet to check access.
          </p>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main>
        <div className="panel">
          <div className="panel-label">Admin - restricted</div>
          <p style={{ color: 'var(--danger-red)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            This wallet does not have access to this page.
          </p>
        </div>
      </main>
    );
  }

  const totalTrackRecord = signals.reduce((sum, s) => sum + (s.portfolio ?? 0), 0);
  const buyCount = signals.filter((s) => s.signal === 'BUY').length;

  const totalClientValueUsd = clientsAggregate
    ? (Number(clientsAggregate.totalSol) / LAMPORTS_PER_SOL) * (signals[0]?.price ?? 0) + Number(clientsAggregate.totalUsdc) / 10 ** DECIMALS
    : null;

  return (
    <main>
      <div className="panel">
        <div className="panel-label">Real client funds (all clients, all sub-pools, on-chain)</div>
        {clientsAggregate ? (
          <div className="data-grid">
            <div className="data-cell">
              <div className="value neutral">{clientsAggregate.uniqueClientCount}</div>
              <div className="sublabel">Unique clients</div>
            </div>
            <div className="data-cell">
              <div className="value">{clientsAggregate.totalPoolCount}</div>
              <div className="sublabel">Total client positions (across 6 pools)</div>
            </div>
            <div className="data-cell">
              <div className="value neutral">${totalClientValueUsd?.toFixed(2) ?? '-'}</div>
              <div className="sublabel">Accumulated real client fund (USD)</div>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Loading on-chain data...</p>
        )}
      </div>

      <div className="panel">
        <div className="panel-label">Platform overview (bot track record - all sub-pools)</div>
        <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 12 }}>
          Internal simulation tracked by the trading bot itself, independent of any client&apos;s real
          on-chain balance. This is the model&apos;s own performance demonstration, not client funds.
        </p>
        {loading ? (
          <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Loading...</p>
        ) : (
          <div className="data-grid">
            <div className="data-cell">
              <div className="value neutral">${totalTrackRecord.toFixed(2)}</div>
              <div className="sublabel">Total tracked value (all 6 sub-pools)</div>
            </div>
            <div className="data-cell">
              <div className="value">{signals.length}/6</div>
              <div className="sublabel">Sub-pools reporting</div>
            </div>
            <div className="data-cell">
              <div className="value">{buyCount}</div>
              <div className="sublabel">BUY signals now</div>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-label">Per sub-pool breakdown</div>
        <table className="signal-table">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Sensitivity</th>
              <th>Signal</th>
              <th>Price</th>
              <th>Tracked value</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {signals.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--text-dim)' }}>No data.</td>
              </tr>
            )}
            {signals.map((s) => (
              <tr key={`${s.strategy_type}-${s.sensitivity}`}>
                <td>{s.strategy_type}</td>
                <td>{s.sensitivity}</td>
                <td>{s.signal}</td>
                <td>${s.price?.toFixed(2) ?? '-'}</td>
                <td>${s.portfolio?.toFixed(2) ?? '-'}</td>
                <td>{s.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="panel-label">Recent trades (all sub-pools, on-chain confirmed)</div>
        <table className="signal-table">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Sensitivity</th>
              <th>Date</th>
              <th>Type</th>
              <th>SOL</th>
              <th>USDT</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--text-dim)' }}>No confirmed trades yet.</td>
              </tr>
            )}
            {trades.map((t) => (
              <tr key={t.id}>
                <td>{t.strategy_type}</td>
                <td>{t.sensitivity}</td>
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
        <div className="panel-label">Liquidity buffer (Binance operator account)</div>
        <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          Run <code>check_binance_buffer.py</code> on the operator&apos;s machine to verify the
          Binance Testnet account holds at least 120% of the total value deposited by all clients
          across all 6 sub-pools. Not yet surfaced automatically on this page.
        </p>
      </div>
    </main>
  );
}
