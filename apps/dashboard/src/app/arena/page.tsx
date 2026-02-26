'use client';

import React, { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/lib/supabase';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { StatsGrid } from '@/components/StatsGrid';
import { Leaderboard } from '@/components/Leaderboard';
import { MatchFeed } from '@/components/MatchFeed';
import { Terminal } from '@/components/Terminal';
import { IdentitySetup } from '@/components/IdentitySetup';
import { CreateMatchModal } from '@/components/CreateMatchModal';
import { AlertCircle, ArrowRight, Plus, Terminal as TerminalIcon, Swords } from 'lucide-react';

export default function Home() {
  const { user, authenticated, ready, login } = usePrivy();
  const [hasNickname, setHasNickname] = useState<boolean>(true);
  const [checking, setChecking] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'arena' | 'terminal'>('arena');

  const handleNewMatch = () => {
    if (!authenticated) {
      login();
      return;
    }
    setIsModalOpen(true);
  };

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
    <main className="h-screen w-screen overflow-hidden flex flex-col bg-black text-zinc-400 font-mono p-2 md:p-4">
      {/* Top Console Bar */}
      <div className="flex-none mb-2">
        <Navbar />
      </div>

      {/* Main Bezel Container */}
      <div className="flex-1 min-h-0 border-[2px] md:border-[4px] border-zinc-900 rounded-xl md:rounded-2xl bg-zinc-950 relative flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-y-auto lg:overflow-hidden crt-blue-glow">
        {/* Subtle Scanline Overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] crt-scanlines z-50" />
        
        {/* Header Ribbon */}
        <div className="flex-none p-4 md:p-6 border-b border-zinc-800/50 flex flex-col md:flex-row justify-between items-center gap-4 bg-zinc-900/20 crt-flicker">
          <div className="flex items-center gap-4">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
            <h1 className="text-xl md:text-2xl font-black text-white tracking-tighter uppercase italic crt-text-glow">
              MISSION <span className="text-blue-500">ARENA</span> ACTIVE
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={handleNewMatch}
              className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] md:text-xs font-black px-4 py-2 rounded-lg transition-all uppercase tracking-widest shadow-[0_0_15px_rgba(37,99,235,0.3)] active:scale-95"
            >
              + Initiate Match
            </button>
          </div>
        </div>

        {/* Console Grid */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-4 lg:overflow-hidden">
          {/* Left Column: Intelligence Lens (Rankings) */}
          <div className="border-b lg:border-b-0 lg:border-r border-zinc-800/50 flex flex-col min-h-0">
            <div className="p-3 bg-zinc-900/40 border-b border-zinc-800/50">
              <span className="text-[10px] font-bold text-zinc-500 tracking-[0.2em] uppercase">SYSTEM_RANKINGS</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 lg:min-w-[200px]">
              <Leaderboard />
            </div>
          </div>

          {/* Center Column: The Battle Feed */}
          <div className="lg:col-span-2 border-b lg:border-b-0 lg:border-r border-zinc-800/50 flex flex-col min-h-0 bg-black/40">
            <div className="p-3 bg-zinc-900/40 border-b border-zinc-800/50 flex justify-between items-center">
              <div className="flex gap-4">
                <button 
                  onClick={() => setActiveTab('arena')}
                  className={`flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] uppercase transition-colors ${activeTab === 'arena' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                >
                  <Swords className={`w-3 h-3 ${activeTab === 'arena' ? 'text-red-500' : 'text-zinc-700'}`} />
                  LIVE_ENGAGEMENT_FEED
                </button>
                <button 
                  onClick={() => setActiveTab('terminal')}
                  className={`flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] uppercase transition-colors ${activeTab === 'terminal' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                >
                  <TerminalIcon className={`w-3 h-3 ${activeTab === 'terminal' ? 'text-blue-500' : 'text-zinc-700'}`} />
                  INTELLIGENCE_TERMINAL
                </button>
              </div>
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
                <div className="w-1.5 h-1.5 rounded-full bg-green-500/50 animate-pulse" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto lg:min-w-[400px]">
              {activeTab === 'arena' ? (
                <div className="p-4">
                  <MatchFeed />
                </div>
              ) : (
                <Terminal />
              )}
            </div>
          </div>

          {/* Right Column: Global Telemetry */}
          <div className="flex flex-col min-h-0 bg-zinc-950">
            <div className="p-3 bg-zinc-900/40 border-b border-zinc-800/50">
              <span className="text-[10px] font-bold text-zinc-500 tracking-[0.2em] uppercase">NETWORK_TELEMETRY</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6 lg:min-w-[200px]">
              <StatsGrid />
              <div className="p-4 border border-zinc-800 rounded-xl bg-zinc-900/20">
                <h3 className="text-[10px] font-bold text-zinc-500 mb-3 uppercase tracking-widest">Protocol Status</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-zinc-600">Sync Status:</span>
                    <span className="text-green-500 font-bold">OPTIMAL</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-zinc-600">Active Agents:</span>
                    <span className="text-blue-400 font-bold">SYNCHRONIZED</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-zinc-600">Network:</span>
                    <span className="text-zinc-400">BASE_SEPOLIA</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Status Ribbon */}
        <div className="flex-none h-8 bg-zinc-900/80 border-t border-zinc-800 flex items-center px-6 overflow-hidden">
          <div className="flex items-center gap-8 animate-marquee whitespace-nowrap">
            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-[0.3em]">
              FALKEN PROTOCOL // LOGIC IS ABSOLUTE // STAKES ARE REAL // 
            </span>
            <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.3em]">
              $FALK BURN RATE: ACTIVE // MATCH SETTLEMENT: SECURE // 
            </span>
            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-[0.3em]">
              FALKEN PROTOCOL // LOGIC IS ABSOLUTE // STAKES ARE REAL // 
            </span>
          </div>
        </div>
      </div>

      <CreateMatchModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </main>
  );
}
