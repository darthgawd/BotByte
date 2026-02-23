'use client';

import React from 'react';
import { Shield, LogOut, Settings } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { WithdrawalUI } from './WithdrawalUI';
import Link from 'next/link';
import { 
  ConnectWallet, 
  Wallet, 
  WalletDropdown, 
  WalletDropdownDisconnect, 
} from '@coinbase/onchainkit/wallet';
import {
  Address,
  Avatar,
  Name,
  Identity,
  EthBalance,
} from '@coinbase/onchainkit/identity';

export function Navbar() {
  const { logout, authenticated, ready } = usePrivy();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const escrowAddress = process.env.NEXT_PUBLIC_ESCROW_ADDRESS || '';
  const displayEscrow = escrowAddress ? `${escrowAddress.slice(0, 6)}...${escrowAddress.slice(-4)}` : 'No Contract';

  return (
    <nav className="border-b border-zinc-800 bg-black/50 backdrop-blur-md sticky top-0 z-50 h-16">
      <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Shield className="w-8 h-8 text-blue-500 fill-blue-500/10" />
          <span className="font-bold text-xl tracking-tight text-white uppercase tracking-tighter">BOTBYTE</span>
        </Link>

        <div className="flex items-center gap-6">
          <Link href="/" className="text-xs font-bold text-zinc-500 hover:text-white transition-colors uppercase tracking-widest">
            Arena
          </Link>
          <Link href="/developer" className="text-xs font-bold text-zinc-500 hover:text-white transition-colors uppercase tracking-widest">
            Developer
          </Link>
          <Link href="/vision" className="text-xs font-bold text-zinc-500 hover:text-white transition-colors uppercase tracking-widest">
            Vision
          </Link>
          
          <div className="hidden lg:flex flex-col text-right border-l border-zinc-800 pl-6">
            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest text-nowrap">Protocol Escrow</span>
            <span className="text-xs font-mono text-zinc-400">{displayEscrow}</span>
          </div>

          <div className="flex items-center gap-3">
            {!mounted || !ready ? (
              <div className="w-32 h-10 bg-zinc-900 animate-pulse rounded-xl" />
            ) : (
              <>
                {authenticated && <WithdrawalUI />}
                
                <Wallet>
                  <ConnectWallet className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/10">
                    <Avatar className="h-6 w-6" />
                    <Name />
                  </ConnectWallet>
                  <WalletDropdown className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-2 mt-2">
                    <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                      <Avatar />
                      <Name />
                      <Address />
                      <EthBalance />
                    </Identity>
                    <div className="p-2 space-y-1">
                      <Link 
                        href="/settings"
                        className="flex items-center gap-3 w-full px-4 py-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors text-sm font-medium"
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </Link>
                      <WalletDropdownDisconnect className="flex items-center gap-3 w-full px-4 py-2 hover:bg-red-500/10 rounded-lg text-zinc-500 hover:text-red-500 transition-colors text-sm font-medium">
                        <LogOut className="w-4 h-4" />
                        Disconnect
                      </WalletDropdownDisconnect>
                    </div>
                  </WalletDropdown>
                </Wallet>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
