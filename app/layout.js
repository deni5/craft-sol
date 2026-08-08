import './globals.css';
import { SolanaProviders } from './providers';
import { WalletConnectButton } from './wallet-connect-button';

export const metadata = {
  title: 'CRAFT-SOL',
  description: 'Automated trading system for SOL - GRU model, TWAP execution, Solana Devnet.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SolanaProviders>
          <div className="terminal-shell">
            <header className="terminal-header">
              <div className="terminal-logo">
                <span className="pulse-dot" />
                CRAFT-SOL
              </div>
              <nav className="terminal-nav">
                <a href="/">Dashboard</a>
                <a href="/about">About</a>
                <a href="/bot">Bot</a>
                <a href="/signals">Signals</a>
                <a href="/swap">Swap</a>
                <a href="/fund">Fund</a>
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
