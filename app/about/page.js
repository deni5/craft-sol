export const dynamic = 'force-static';

function Section({ title, children }) {
  return (
    <div className="panel">
      <div className="panel-label">{title}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  );
}

function Step({ number, title, children }) {
  return (
    <div style={{ marginBottom: 16, paddingLeft: 28, position: 'relative' }}>
      <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 20,
          height: 20,
          borderRadius: 3,
          background: 'var(--signal-amber)',
          color: 'var(--bg-void)',
          fontWeight: 700,
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {number}
      </div>
      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{children}</div>
    </div>
  );
}

export default function AboutPage() {
  return (
    <main>
      <Section title="What is CRAFT-SOL">
        <p style={{ marginBottom: 12 }}>
          CRAFT-SOL is an automated trading system for SOL that combines a machine learning
          model with individual, on-chain balance accounting -- not a pooled fund.
        </p>
        <p style={{ marginBottom: 12 }}>
          A GRU-based regression model analyzes price, RSI, and macro indicators (VIX, DXY) to
          predict an optimal SOL allocation percentage (0 to 100 percent) using a TWAP-style
          approach: gradual position adjustment rather than sudden all-or-nothing trades.
        </p>
        <p>
          Clients create their own bot-pool by picking a strategy (swing or hodl) and a
          sensitivity level (conservative, standard, sensitive) -- up to 6 combinations total --
          then deposit SOL or USDC directly into it. Each bot-pool is tracked individually per
          client: not a proportional share of a shared fund, but your own on-chain balance.
        </p>
      </Section>

      <Section title="How a trade actually reaches your balance">
        <p style={{ marginBottom: 12 }}>
          The model's decision (what percent of a position to hold) is executed on Binance
          Testnet using the operator's account -- your deposited SOL/USDC stays safely in the
          Solana smart contract the whole time, it is never sent to Binance directly.
        </p>
        <p>
          The trade size itself is calculated from your actual current on-chain balance in that
          specific bot-pool (not an abstract internal number), and the result is written back to
          your balance right after the trade confirms. Only trades that completed this full
          round-trip are shown in a bot-pool's Recent trades list.
        </p>
      </Section>

      <Section title="Architecture">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>1. ML model (GRU, regression) -- predicts target position from price and macro data</div>
          <div>2. Trading bot (Python, Binance Testnet) -- executes the model&apos;s decisions</div>
          <div>3. Supabase -- stores signals, prices, trades, bot run requests</div>
          <div>4. Solana smart contract (Devnet) -- individual per-client balance, deposit/withdraw</div>
          <div>5. Internal swap pool -- SOL/USDC market maker, price synced from Binance</div>
          <div>6. This website -- create and manage up to 6 bot-pools, signals, market data</div>
        </div>
      </Section>

      <Section title="How to use: creating a bot-pool">
        <Step number="1" title="Connect your wallet">
          Click the wallet button in the top right corner and connect Phantom (make sure it is
          set to Solana Devnet, not Mainnet).
        </Step>
        <Step number="2" title="Get Devnet SOL and test tokens">
          You need Devnet SOL for transaction fees. Use a Devnet faucet
          (faucet.solana.com or the Coinbase Developer Platform faucet). Test USDC-equivalent
          tokens for this demo can be requested from the operator.
        </Step>
        <Step number="3" title="Choose your bot-pool options">
          At the top of the Home page, check the boxes for strategy and sensitivity, pick which
          asset to invest (SOL or USDC), enter an amount, and press Create Pool. This deposits
          your funds and creates your personal position in that specific bot-pool.
        </Step>
        <Step number="4" title="Manage each bot-pool separately">
          Every bot-pool you create gets its own card below: current balance, total value in
          USD, a chart of your balance value over time, return since your actual deposit date,
          day-over-day change, recent trades, and its own top up / withdraw controls. You can
          create up to 6 bot-pools total, one per strategy x sensitivity combination.
        </Step>
      </Section>

      <Section title="How to use: monitoring and running the bot">
        <Step number="1" title="Check each bot-pool card">
          Each card shows your balance value dynamics, since-deposit return, and a Trigger bot
          run button specific to that pool.
        </Step>
        <Step number="2" title="Trigger a run, or let it run automatically">
          Pressing Trigger requests an immediate run for that pool. The system also runs all 6
          bot-pools automatically once a day; both paths only execute while the operator&apos;s
          local listener process is active -- this is not a fully autonomous public service yet.
        </Step>
        <Step number="3" title="Check Signals for more detail">
          The Signals page shows price with BUY/SELL markers, RSI, the full BUY/HOLD/SELL
          probability distribution, and the general market history (SOL price, VIX, DXY) over
          the same period, independent of any single bot-pool.
        </Step>
        <Step number="4" title="Withdraw anytime">
          On any bot-pool&apos;s card, switch to Withdraw mode, pick the asset, enter an amount
          up to your current balance in that specific pool, and confirm.
        </Step>
      </Section>

      <Section title="Measured performance (honest summary)">
        <p style={{ marginBottom: 12 }}>
          The model is evaluated using walk-forward backtesting (training only on past data,
          testing on unseen future periods across multiple market regimes) -- not a single
          train/test split, which tends to give overly optimistic results.
        </p>
        <p style={{ marginBottom: 12 }}>
          Across bull, sideways, and crash periods, the model does not outperform simple
          buy-and-hold during strong bull markets, but shows meaningfully smaller losses during
          market crashes. Risk-adjusted return (Sharpe ratio) is close to neutral overall --
          this system is best understood as a risk-reduction tool, not a guaranteed profit
          generator. A sharp overbought RSI reading, for example, will correctly hold off on
          buying even after a strong price rise, rather than chasing it.
        </p>
        <p>
          Live trades and balances shown on this site reflect real executions and real on-chain
          updates, but span only a short period so far -- not enough history to draw
          statistically meaningful conclusions about live performance on their own. The
          walk-forward backtest results (covering years of historical data) remain the more
          reliable performance signal.
        </p>
      </Section>

      <Section title="Model research: hypotheses tested">
        <p style={{ marginBottom: 12 }}>
          The production model is a GRU regression network predicting a 0-100 percent SOL
          allocation from price, RSI, and macro features, with a daily lookback window and a
          minimum delta threshold of 0.05 (below that, the model holds rather than trades).
        </p>
        <p style={{ marginBottom: 12, fontWeight: 600 }}>Hypothesis 1: hourly trading beats daily.</p>
        <p style={{ marginBottom: 12 }}>
          Tested with a 48-hour lookback and its own hourly labels. Result: hourly Sharpe ratio
          reached only +0.091 at its best-calibrated delta threshold (0.70) after adding funding
          rate as a feature, up from -0.030 uncalibrated. Two of three walk-forward folds stayed
          negative. Verdict: hourly trading is research-only, not production-ready -- the daily
          regime remains the live system.
        </p>
        <p style={{ marginBottom: 12, fontWeight: 600 }}>Hypothesis 2: funding rate improves signal quality.</p>
        <p style={{ marginBottom: 12 }}>
          Added Binance funding rate as a model feature for the hourly regime. Result: Sharpe
          improved from +0.039 to +0.049 at the same threshold, and to +0.091 once the delta
          threshold was also recalibrated for hourly noise. Verdict: real but modest
          improvement.
        </p>
        <p style={{ marginBottom: 12, fontWeight: 600 }}>Hypothesis 3: purged splits matter for overlapping windows.</p>
        <p style={{ marginBottom: 12 }}>
          With a 48-hour lookback, adjacent training samples share 47 of 48 hours of history,
          risking leakage across the train/validation boundary. A purge step was added to drop
          the first (lookback - 1) rows of each split. Measured impact on R-squared was small
          (about 0.0004) for this dataset, but the safeguard is kept as standard practice.
        </p>
        <p>
          A genuine data leakage bug was also found and fixed during this research: a forward-
          looking drawdown column was not being excluded from model inputs due to a column name
          mismatch (drawdown_fwd vs drawdown). Fixing it dropped hourly R-squared from 0.31 to
          0.28 -- a real but not catastrophic change, confirming most of the original signal was
          genuine rather than leaked.
        </p>
      </Section>

      <Section title="Future improvements under consideration">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>- Proportional trade sizing across multiple real clients sharing the same sub-pool (current logic is verified correct for a single client per pool)</div>
          <div>- VIX/DXY macro features for the hourly regime (blocked on a rate-limited data source, daily regime already has them)</div>
          <div>- Order book depth and on-chain Solana activity as additional model features</div>
          <div>- Walk-forward validation of the hodl strategy specifically in the hourly regime</div>
          <div>- Scheduled weekly retraining instead of a static trained model</div>
          <div>- Automatic execution of the Binance liquidity buffer rebalance (currently a manual, read-only calculation)</div>
          <div>- Server-side wallet verification for the admin page (current check is client-side only)</div>
        </div>
      </Section>

      <Section title="Important notes">
        <p style={{ marginBottom: 12, color: 'var(--signal-amber)' }}>
          This system currently runs entirely on Solana Devnet with test tokens. Nothing here
          involves real funds.
        </p>
        <p style={{ marginBottom: 12 }}>
          Past performance on historical data does not guarantee future results. This is not
          financial advice.
        </p>
        <p>
          Smart contracts on Devnet have not been professionally audited. Do not use this system
          with real funds until a formal audit and legal review have been completed.
        </p>
      </Section>
    </main>
  );
}
