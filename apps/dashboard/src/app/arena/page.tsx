'use client';

import React, { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/lib/supabase';
import { Navbar } from '@/components/Navbar';
import { StatsGrid } from '@/components/StatsGrid';
import { Leaderboard } from '@/components/Leaderboard';
import { MatchFeed } from '@/components/MatchFeed';
import { Terminal } from '@/components/Terminal';
import { Terminal as TerminalIcon, Swords, Activity, Zap, ShieldCheck, ChevronDown } from 'lucide-react';

export default function ArenaPage() {
  const { authenticated, login } = usePrivy();
  const [activeTab, setActiveTab] = useState<'terminal' | 'arena'>('terminal');
  const [expandedModule, setExpandedModule] = useState<'rankings' | 'registry' | 'telemetry' | null>('rankings');

  return (
    <main className="h-screen w-screen overflow-hidden flex flex-col bg-zinc-50 dark:bg-[#050505] text-zinc-600 dark:text-zinc-400 font-arena text-base p-4 gap-4 transition-colors duration-500">
      {/* Beta Disclaimer Banner */}
      <div className="flex-none px-4 py-3 bg-emerald-600/5 dark:bg-emerald-500/5 border border-emerald-600/10 dark:border-emerald-500/20 rounded-xl flex items-center justify-between transition-colors">
        <div className="flex items-center gap-3">
          <div className="px-2 py-0.5 rounded bg-gold text-[9px] font-black text-black uppercase tracking-tighter italic">BETA_V0.0.1</div>
          <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest leading-none">
            Falken Protocol is currently in early beta. Smart contracts are on Base Sepolia. Use with testnet funds only.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-[0.2em]">Live_Status: Optimizing</span>
        </div>
      </div>

      <div className="flex-none">
        <Navbar />
      </div>

      {/* Main Command Center Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Left Column: Multi-Module Lens [3 Cols] */}
        <div className="lg:col-span-3 flex flex-col gap-4 min-h-0">
          
          {/* Module: Leaderboard (The Blue Zone) */}
          <div className={`flex flex-col border transition-all duration-500 rounded-xl overflow-hidden bg-blue-600/[0.05] dark:bg-blue-600/[0.08] ${expandedModule === 'rankings' ? 'flex-[2] border-blue-600/30 dark:border-blue-500/30 shadow-sm dark:shadow-[0_0_50px_rgba(37,99,235,0.15)]' : 'flex-none h-14 border-zinc-200 dark:border-zinc-900'}`}>
            <button 
              onClick={() => setExpandedModule(expandedModule === 'rankings' ? null : 'rankings')}
              className={`flex-none px-4 py-5 border-b transition-colors flex items-center justify-between group ${expandedModule === 'rankings' ? 'bg-blue-600/20 dark:bg-blue-600/20 border-blue-600/30 dark:border-blue-500/30' : 'bg-blue-600/10 dark:bg-blue-900/20 border-blue-600/20 dark:border-blue-900'}`}
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className={`w-5 h-5 transition-colors ${expandedModule === 'rankings' ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400'}`} />
                <span className="text-base font-arena font-black uppercase tracking-[0.3em] text-zinc-900 dark:text-white">Leaderboard</span>
              </div>
              <ChevronDown className={`w-5 h-5 text-zinc-500 transition-transform duration-300 ${expandedModule === 'rankings' ? 'rotate-180' : ''}`} />
            </button>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <Leaderboard />
            </div>
          </div>

          {/* Module: Falk Stats (The Green Zone) */}
          <div className={`flex flex-col border transition-all duration-500 rounded-xl overflow-hidden bg-emerald-600/[0.05] dark:bg-emerald-600/[0.08] ${expandedModule === 'telemetry' ? 'flex-[2] border-emerald-600/30 dark:border-emerald-500/30 shadow-sm dark:shadow-[0_0_50px_rgba(16,185,129,0.15)]' : 'flex-none h-14 border-zinc-200 dark:border-zinc-900'}`}>
            <button 
              onClick={() => setExpandedModule(expandedModule === 'telemetry' ? null : 'telemetry')}
              className={`flex-none px-4 py-5 border-b transition-colors flex items-center justify-between group ${expandedModule === 'telemetry' ? 'bg-emerald-600/20 dark:bg-emerald-600/20 border-emerald-600/30 dark:border-emerald-500/30' : 'bg-emerald-600/10 dark:bg-emerald-900/20 border-emerald-600/20 dark:border-zinc-900'}`}
            >
              <div className="flex items-center gap-3">
                <Activity className={`w-5 h-5 transition-colors ${expandedModule === 'telemetry' ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`} />
                <span className="text-base font-arena font-black uppercase tracking-[0.3em] text-zinc-900 dark:text-white">Falk Stats</span>
              </div>
              <ChevronDown className={`w-5 h-5 text-zinc-500 transition-transform duration-300 ${expandedModule === 'telemetry' ? 'rotate-180' : ''}`} />
            </button>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <StatsGrid />
              <div className="mt-4 p-4 border border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-900/10 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Protocol_Link</span>
                  <div className="px-2 py-0.5 rounded bg-emerald-600/5 dark:bg-emerald-500/10 border border-emerald-600/10 dark:border-emerald-500/20 text-[8px] font-bold text-emerald-600 dark:text-emerald-500 uppercase">Secure</div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-zinc-400 dark:text-zinc-500 uppercase tracking-tighter">Network</span>
                    <span className="text-zinc-900 dark:text-zinc-200 font-bold tracking-tight">BASE_SEPOLIA</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-zinc-400 dark:text-zinc-500 uppercase tracking-tighter">Sync_Status</span>
                    <span className="text-emerald-600 dark:text-emerald-500 font-bold tracking-tight uppercase">Optimal</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Module: App Store (The Purple Zone) */}
          <div className={`flex flex-col border transition-all duration-500 rounded-xl overflow-hidden bg-purple-600/[0.05] dark:bg-purple-600/[0.08] ${expandedModule === 'registry' ? 'flex-[2] border-purple-600/30 dark:border-purple-500/30 shadow-sm dark:shadow-[0_0_50px_rgba(168,85,247,0.15)]' : 'flex-none h-14 border-purple-600/20 dark:border-zinc-900'}`}>
            <button 
              onClick={() => setExpandedModule(expandedModule === 'registry' ? null : 'registry')}
              className={`flex-none px-4 py-5 border-b transition-colors flex items-center justify-between group ${expandedModule === 'registry' ? 'bg-purple-600/20 dark:bg-purple-600/20 border-purple-600/30 dark:border-purple-500/30' : 'bg-purple-600/10 dark:bg-zinc-900/20 border-purple-600/20 dark:border-zinc-900'}`}
            >
              <div className="flex items-center gap-3">
                <Zap className={`w-5 h-5 transition-colors ${expandedModule === 'registry' ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-400'}`} />
                <span className="text-base font-arena font-black uppercase tracking-[0.3em] text-zinc-900 dark:text-white">App Store</span>
              </div>
              <ChevronDown className={`w-5 h-5 text-zinc-500 transition-transform duration-300 ${expandedModule === 'registry' ? 'rotate-180' : ''}`} />
            </button>
            <div className="flex-1 p-4 flex flex-col items-center justify-center text-center space-y-4">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-300">Querying_Onchain_Logic_Store...</p>
              <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
              <button className="text-xs font-black text-purple-600 dark:text-purple-400 uppercase tracking-tighter hover:underline">Explore_FISE_Library</button>
            </div>
          </div>

        </div>

        {/* Right Column: The Primary Feed [9 Cols] */}
        <div className="lg:col-span-9 border border-blue-600/50 dark:border-blue-500/50 bg-white dark:bg-[#080808] rounded-xl flex flex-col min-h-0 shadow-sm dark:shadow-2xl overflow-hidden transition-colors">
          <div className="flex-none px-4 py-4 bg-zinc-100/50 dark:bg-zinc-900/20 border-b border-blue-600/20 dark:border-blue-500/30 flex items-center justify-between">
            <div className="flex gap-6">
              <button 
                onClick={() => setActiveTab('terminal')}
                className={`flex items-center gap-3 text-sm font-arena font-black tracking-[0.3em] uppercase transition-all ${activeTab === 'terminal' ? 'text-blue-600 dark:text-gold underline underline-offset-4 decoration-blue-500/50' : 'text-zinc-400 dark:text-zinc-600 hover:text-blue-600 dark:hover:text-gold'}`}
              >
                <TerminalIcon className={`w-4 h-4 ${activeTab === 'terminal' ? 'text-blue-600 dark:text-blue-500' : 'text-zinc-300 dark:text-zinc-700'}`} />
                Terminal
              </button>
              <button 
                onClick={() => setActiveTab('arena')}
                className={`flex items-center gap-3 text-sm font-arena font-black tracking-[0.3em] uppercase transition-all ${activeTab === 'arena' ? 'text-blue-600 dark:text-gold underline underline-offset-4 decoration-blue-500/50' : 'text-zinc-400 dark:text-zinc-600 hover:text-blue-600 dark:hover:text-gold'}`}
              >
                <Swords className={`w-4 h-4 ${activeTab === 'arena' ? 'text-blue-600 dark:text-blue-500' : 'text-zinc-300 dark:text-zinc-700'}`} />
                Live_Matches
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500/30 dark:bg-blue-500/50 animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500/30 dark:bg-blue-500/50" />
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-hidden relative">
            {activeTab === 'terminal' ? (
              <div className="absolute inset-0">
                <Terminal />
              </div>
            ) : (
              <div className="absolute inset-0 p-4 overflow-y-auto custom-scrollbar">
                <MatchFeed />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Ticker */}
      <div className="flex-none px-6 py-2 border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-[#080808] rounded-xl flex items-center overflow-hidden shadow-sm dark:shadow-2xl transition-colors">
        <div className="flex items-center gap-12 animate-marquee whitespace-nowrap">
          <span className="text-[9px] font-black text-blue-600 dark:text-blue-600 uppercase tracking-[0.4em]">
            FALKEN PROTOCOL // LOGIC IS ABSOLUTE // STAKES ARE REAL // 
          </span>
          <span className="text-[9px] font-black text-zinc-300 dark:text-zinc-800 uppercase tracking-[0.4em]">
            $FALK BURN_RATE: ACTIVE // MATCH_SETTLEMENT: ENCRYPTED // 
          </span>
          <span className="text-[9px] font-black text-blue-600 dark:text-blue-600 uppercase tracking-[0.4em]">
            SYNCHRONIZING NEURAL ARCHITECTURE... // 
          </span>
        </div>
      </div>

    </main>
  );
}
