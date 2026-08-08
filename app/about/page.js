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
          model with on-chain fund accounting.
        </p>
        <p style={{ marginBottom: 12 }}>
          A GRU-based regression model analyzes price, RSI, and macro indicators (VIX, DXY,
          Fear and Greed Index) to predict an optimal SOL allocation percentage (0 to 100 percent)
          using a TWAP-style approach: gradual position adjustment rather than sudden all-or-nothing
          trades.
        </p>
        <p>
          The bot trades on Binance across 6 parallel configurations (2 strategies -- swing and
          hodl -- times 3 risk levels -- conservative, standard, sensitive), updating daily.
          A Solana smart contract lets clients deposit SOL or USDC directly, with an individually
          tracked balance (not a pooled share), and withdraw at any time.
        </p>
      </Section>

      <Section title="Architecture">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>1. ML model (GRU, regression) -- predicts target position from price and macro data</div>
          <div>2. Trading bot (Python, Binance Testnet) -- executes the model&apos;s decisions</div>
          <div>3. Supabase -- stores signals, prices, portfolio history, bot run requests</div>
          <div>4. Solana smart contract (Devnet) -- individual balance accounting, deposit/withdraw</div>
          <div>5. Swap pool -- internal SOL/USDC market maker, price synced from Binance</div>
          <div>6. This website -- dashboard, bot control, fund management</div>
        </div>
      </Section>

      <Section title="How to use: connecting and depositing">
        <Step number="1" title="Connect your wallet">
          Click the wallet button in the top right corner and connect Phantom (make sure it is
          set to Solana Devnet, not Mainnet).
        </Step>
        <Step number="2" title="Get Devnet SOL and test tokens">
          You need Devnet SOL for transaction fees. Use a Devnet faucet
          (faucet.solana.com or the Coinbase Developer Platform faucet). Test USDC-equivalent
          tokens for this demo pool can be requested from the operator.
        </Step>
        <Step number="3" title="Go to the Fund page">
          Open the Fund tab. You will see the current SOL price and your own balance
          (SOL and USDC amounts), tracked individually -- not a proportional share of a pooled
          fund.
        </Step>
        <Step number="4" title="Deposit">
          Choose Deposit mode, pick SOL or USDC, enter an amount, and confirm the transaction
          in your wallet.
        </Step>
      </Section>

      <Section title="How to use: monitoring and running the bot">
        <Step number="1" title="Check the Dashboard">
          The main dashboard shows portfolio value over time across all 6 sub-pools, current
          signals (BUY, HOLD, SELL), and recent trades.
        </Step>
        <Step number="2" title="Open Bot Control">
          On the Bot tab, pick a strategy (swing or hodl) and a sensitivity level
          (conservative, standard, sensitive). Charts show the model&apos;s target position
          history and the SOL price for that specific sub-pool.
        </Step>
        <Step number="3" title="Start a run (operator only)">
          The Start Bot button writes a run request. It is only executed if the operator&apos;s
          local listener process (bot_run_listener.py) is currently running -- this is not a
          fully automated public trading button.
        </Step>
        <Step number="4" title="Withdraw anytime">
          On the Fund page, switch to Withdraw mode, pick the asset, enter an amount up to your
          current balance, and confirm.
        </Step>
      </Section>

      <Section title="Important notes">
        <p style={{ marginBottom: 12, color: 'var(--signal-amber)' }}>
          This system currently runs entirely on Solana Devnet with test tokens. Nothing here
          involves real funds.
        </p>
        <p style={{ marginBottom: 12 }}>
          Backtests show the model reduces losses compared to buy-and-hold during downturns, but
          does not outperform simple holding during strong bull markets. Past performance on
          historical data does not guarantee future results.
        </p>
        <p>
          This is not financial advice. Smart contracts on Devnet have not been professionally
          audited. Do not use this system with real funds until a formal audit and legal review
          have been completed.
        </p>
      </Section>
    </main>
  );
}
