'use client';

import dynamic from 'next/dynamic';

// dynamic import з ssr:false — wallet-adapter-react-ui звертається до
// window/navigator, недоступних на сервері при SSR
const WalletMultiButton = dynamic(
  () =>
    import('@solana/wallet-adapter-react-ui').then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

export function WalletConnectButton() {
  return <WalletMultiButton />;
}
