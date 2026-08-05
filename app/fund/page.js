export const dynamic = 'force-dynamic';

export default function FundPage() {
  return (
    <main>
      <div className="panel">
        <div className="panel-label">Фонд — депозит/вивід</div>
        <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          Каркас — TVL/APY/депозит/вивід буде реалізовано після
          смарт-контракту (solana-contracts/programs/craft_fund).
        </p>
      </div>
    </main>
  );
}
