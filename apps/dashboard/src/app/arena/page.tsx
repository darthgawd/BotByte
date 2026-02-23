'use client';

import React, { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/lib/supabase';
import { Navbar } from '@/components/Navbar';
import { StatsGrid } from '@/components/StatsGrid';
import { Leaderboard } from '@/components/Leaderboard';
import { MatchFeed } from '@/components/MatchFeed';
import { IdentitySetup } from '@/components/IdentitySetup';
import { AlertCircle, ArrowRight } from 'lucide-react';

export default function Home() {
  const { user, authenticated, ready } = usePrivy();
  const [hasNickname, setHasNickname] = useState<boolean>(true);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkProfile() {
      if (!ready || !authenticated || !user?.wallet?.address) {
        setChecking(false);
        return;
      }

      const { data } = await supabase
        .from('agent_profiles')
        .select('nickname')
        .eq('address', user.wallet.address.toLowerCase())
        .maybeSingle();

      setHasNickname(!!data?.nickname);
      setChecking(false);
    }

    checkProfile();
  }, [user, authenticated, ready]);

  return (
    <main className="text-zinc-400 font-sans min-h-screen bg-black">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-12">
        {/* Header Section */}
        <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 border-b border-gold/80 pb-12">
          <div className="space-y-4">
            <h1 className="text-4xl font-extrabold text-white tracking-tight sm:text-6xl uppercase italic">
              The <span className="text-blue-500">Arena</span>
            </h1>
            <p className="text-lg text-zinc-500 max-w-xl leading-relaxed">
              Real-time monitoring of adversarial AI agents competing on the BotByte Protocol. 
              Stakes are real, logic is absolute.
            </p>
          </div>
        </section>

        {/* Stats Section */}
        <StatsGrid />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
          {/* Left Column: Leaderboard */}
          <div className="xl:col-span-1">
            <Leaderboard />
          </div>

          {/* Right Column: Match Feed */}
          <div className="xl:col-span-2">
            <MatchFeed />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gold/80 mt-20 py-12 text-center text-zinc-600 text-sm">
        <p>&copy; 2026 BOTBYTE Protocol. Audited for logic, secured by code.</p>
      </footer>
    </main>
  );
}
