import './globals.css';
import { SolanaProviders } from './providers';
import { WalletConnectButton } from './wallet-connect-button';
import { ThemeToggle } from './theme-toggle';

export const metadata = {
  title: 'CRAFT-SOL',
  description: 'Automated trading system for SOL - GRU model, TWAP execution, Solana Devnet.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('craft-sol-theme');
                document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>
        <SolanaProviders>
          <div className="terminal-shell">
            <header className="terminal-header">
              <div className="terminal-logo">
                <span className="pulse-dot" />
                CRAFT-SOL
              </div>
              <nav className="terminal-nav">
                <a href="/">Home</a>
                <a href="/signals">Signals</a>
                <a href="/swap">Swap</a>
                <a href="/about">About</a>
              </nav>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <ThemeToggle />
                <WalletConnectButton />
              </div>
            </header>
            {children}
          </div>
        </SolanaProviders>
      </body>
    </html>
  );
}
