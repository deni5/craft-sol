import './globals.css';
import { SolanaProviders } from './providers';
import { WalletConnectButton } from './wallet-connect-button';

export const metadata = {
  title: 'CRAFT-SOL',
  description: 'Автоматизована торгова система для SOL — GRU-модель, TWAP-виконання, Solana Devnet.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="uk">
      <body>
        <SolanaProviders>
          <div className="terminal-shell">
            <header className="terminal-header">
              <div className="terminal-logo">
                <span className="pulse-dot" />
                CRAFT-SOL
              </div>
              <nav className="terminal-nav">
                <a href="/">Дашборд</a>
                <a href="/swap">Обмінник</a>
                <a href="/fund">Фонд</a>
              </nav>
              <WalletConnectButton />
            </header>
            {children}
          </div>
        </SolanaProviders>
      </body>
    </html>
  );
}
