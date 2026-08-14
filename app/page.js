'use client';

import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  fetchAllPoolsState,
  buildDepositSolSimpleInstruction,
  buildDepositUsdcSimpleInstruction,
  getPoolConfig,
  STRATEGIES,
  SENSITIVITIES,
  DECIMALS,
} from '../lib/simple-fund';
import { getLatestSignals } from '../lib/supabase';
import { PoolCard } from './pool-card';
import { Transaction } from '@solana/web3.js';

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

  const [allSignals, setAllSignals] = useState([]);
  const [allPools, setAllPools] = useState([]);

  const [newStrategyType, setNewStrategyType] = useState(0);
  const [newSensitivity, setNewSensitivity] = useState(0);
  const [newAsset, setNewAsset] = useState('SOL');
  const [newAmount, setNewAmount] = useState('');
  const [createStatus, setCreateStatus] = useState(null);
  const [creating, setCreating] = useState(false);

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

  const refreshAllPools = useCallback(async () => {
    try {
      const pools = await fetchAllPoolsState(connection, publicKey);
      setAllPools(pools);
    } catch (err) {
      console.error('Failed to fetch all pools state:', err);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  useEffect(() => {
    refreshAllPools();
  }, [refreshAllPools]);

  const createdPools = allPools.filter((p) => p.solAmount > 0n || p.usdcAmount > 0n);
  const newPoolAlreadyCreated = allPools.some(
    (p) => p.strategyType === newStrategyType && p.sensitivityType === newSensitivity && (p.solAmount > 0n || p.usdcAmount > 0n)
  );

  async function handleCreatePool() {
    if (!publicKey) return;
    const amountNum = parseFloat(newAmount);
    if (!amountNum || amountNum <= 0) {
      setCreateStatus({ type: 'error', message: `Enter a valid ${newAsset} amount` });
      return;
    }

    const config = getPoolConfig(newStrategyType, newSensitivity);
    const buildFn = newAsset === 'SOL' ? buildDepositSolSimpleInstruction : buildDepositUsdcSimpleInstruction;
    const amountRaw =
      newAsset === 'SOL'
        ? BigInt(Math.round(amountNum * LAMPORTS_PER_SOL))
        : BigInt(Math.round(amountNum * 10 ** DECIMALS));

    setCreating(true);
    setCreateStatus({ type: 'pending', message: 'Creating your pool...' });

    try {
      const instruction = await buildFn(publicKey, amountRaw, config);
      const transaction = new Transaction().add(instruction);
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');

      setCreateStatus({ type: 'success', message: `Pool created and funded: ${signature.slice(0, 20)}...` });
      setNewAmount('');
      await refreshAllPools();
    } catch (err) {
      console.error(err);
      setCreateStatus({ type: 'error', message: `Error: ${err.message || err}` });
    } finally {
      setCreating(false);
    }
  }

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

      {!connected && (
        <div className="panel">
          <div className="panel-label">Your bot-pools</div>
          <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            Connect your wallet (button above) to create and manage bot-pools.
          </p>
        </div>
      )}

      {connected && createdPools.length === 0 && (
        <div className="panel">
          <div className="panel-label">Your bot-pools</div>
          <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            You have not created any bot-pool yet. Use the form below to create your first one.
          </p>
        </div>
      )}

      {connected &&
        createdPools.map((p) => (
          <PoolCard key={`${p.strategyType}-${p.sensitivityType}`}
            strategyType={p.strategyType}
            sensitivityType={p.sensitivityType}
            strategyName={p.strategyName}
            sensitivityName={p.sensitivityName}
            priceUsdcPerSol={p.priceUsdcPerSol}
            solAmount={p.solAmount}
            usdcAmount={p.usdcAmount}
            onPoolUpdated={refreshAllPools}
          />
        ))}

      {connected && (
        <div className="panel">
          <div className="panel-label">Create a new bot-pool (max 6 total - one per strategy x sensitivity)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>
                Strategy
              </div>
              <CheckboxRow options={STRATEGIES} selectedValue={newStrategyType} onSelect={setNewStrategyType} disabled={creating} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>
                Sensitivity
              </div>
              <CheckboxRow options={SENSITIVITIES} selectedValue={newSensitivity} onSelect={setNewSensitivity} disabled={creating} />
            </div>

            {newPoolAlreadyCreated ? (
              <p style={{ color: 'var(--signal-amber)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                This bot-pool already exists - use its card above to top up or withdraw.
              </p>
            ) : (
              <div style={{ paddingTop: 6, borderTop: '1px solid var(--hairline)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>
                  Asset to invest
                </div>
                <CheckboxRow options={[{ type: 'SOL', name: 'SOL' }, { type: 'USDC', name: 'USDC' }]}
                  selectedValue={newAsset}
                  onSelect={setNewAsset}
                  disabled={creating}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                  <input type="number"
                    placeholder={`Amount (${newAsset})`}
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    disabled={creating}
                    style={inputStyle}
                  />
                  <button onClick={handleCreatePool}
                    disabled={creating}
                    style={{
                      background: 'var(--confirm-green)',
                      color: 'var(--bg-void)',
                      border: 'none',
                      borderRadius: 3,
                      padding: '8px 20px',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      cursor: creating ? 'not-allowed' : 'pointer',
                      opacity: creating ? 0.6 : 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Create Pool
                  </button>
                </div>
              </div>
            )}

            {createStatus && (
              <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color:
                    createStatus.type === 'success' ? 'var(--confirm-green)' : createStatus.type === 'error' ? 'var(--danger-red)' : 'var(--signal-amber)',
                  wordBreak: 'break-word',
                }}
              >
                {createStatus.message}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
