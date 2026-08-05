export const dynamic = 'force-dynamic';

export default function SwapPage() {
  return (
    <main>
      <div className="panel">
        <div className="panel-label">Обмінник USDC ↔ SOL</div>
        <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          Каркас — функціонал буде реалізовано після смарт-контракту
          (solana-contracts/programs/craft_fund). Наразі показує лише
          структуру сторінки.
        </p>
      </div>
    </main>
  );
}
