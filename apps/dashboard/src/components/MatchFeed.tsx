'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Swords, Loader2, Circle } from 'lucide-react';
import Link from 'next/link';

interface Match {
  match_id: string;
  player_a: string;
  player_b: string;
  stake_wei: string; 
  status: string;
  phase: string;
  game_logic: string;
  current_round: number;
  winner: string;
  created_at: string;
  player_a_nickname?: string;
  player_b_nickname?: string;
}

const RPS_LOGIC = (process.env.NEXT_PUBLIC_RPS_LOGIC_ADDRESS || '').toLowerCase();
const POKER_ALIASES = [
  '0xa00a45cb44b39c3dc91fb7963d2dd65c217ae5b25c20cb216c1f9431900a5d61',
  '0x4173a4e2e54727578fd50a3f1e721827c4c97c3a2824ca469c0ec730d4264b43', 
  '0xec63afc7c67678adbe7a60af04d49031878d1e78eff9758b1b79edeb7546dfdf', 
  '0x5f164061c4cbb981098161539f7f691650e0c245be54ade84ea5b57496955846',
  '0x61266711df04ebe17432b3482471e64c69150e370a9c558657b28944233b97d1'
].map(a => a.toLowerCase());

type GameTab = 'ALL' | 'POKER' | 'RPS';

export function MatchFeed({ initialTab = 'ALL', onTabChange }: { initialTab?: GameTab, onTabChange?: (tab: GameTab) => void }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<GameTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleTabClick = (tab: GameTab) => {
    setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  useEffect(() => {
    async function fetchMatches() {
      let query = supabase
        .from('matches')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (activeTab === 'RPS') query = query.eq('game_logic', RPS_LOGIC);
      if (activeTab === 'POKER') query = query.in('game_logic', POKER_ALIASES);

      const { data: matchData } = await query.limit(100);
      if (!matchData) {
        setMatches([]);
        setLoading(false);
        return;
      }

      const involvedAddresses = new Set<string>();
      matchData.forEach(m => {
        involvedAddresses.add(m.player_a.toLowerCase());
        if (m.player_b) involvedAddresses.add(m.player_b.toLowerCase());
      });

      const { data: profiles } = await supabase
        .from('agent_profiles')
        .select('address, nickname')
        .in('address', Array.from(involvedAddresses));

      const profileMap = new Map(profiles?.map(p => [p.address.toLowerCase(), p.nickname]) || []);

      const enrichedMatches = matchData
        .map(m => ({
          ...m,
          player_a_nickname: profileMap.get(m.player_a.toLowerCase()),
          player_b_nickname: m.player_b ? profileMap.get(m.player_b.toLowerCase()) : undefined
        }))
        .sort((a, b) => {
          const idA = parseInt(a.match_id.split('-').pop() || '0');
          const idB = parseInt(b.match_id.split('-').pop() || '0');
          return idB - idA;
        });

      setMatches(enrichedMatches);
      setLoading(false);
    }

    fetchMatches();

    const channel = supabase
      .channel('match-feed-changes-stable')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        fetchMatches();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-zinc-300 dark:text-zinc-800 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 transition-colors duration-500 font-arena">
      <div className="flex gap-4 border-b border-zinc-100 dark:border-zinc-900 pb-4">
        {(['ALL', 'POKER', 'RPS'] as GameTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabClick(tab)}
            className={`text-xs font-black tracking-[0.2em] uppercase transition-all ${
              activeTab === tab ? 'text-blue-600 dark:text-blue-500' : 'text-zinc-300 dark:text-zinc-700 hover:text-zinc-500 dark:hover:text-zinc-500'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      
      <div className="space-y-1">
        {matches.map((match, index) => (
          <Link 
            key={match.match_id} 
            href={`/match/${match.match_id}`}
            className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 md:p-4 border border-zinc-100 dark:border-zinc-900/50 hover:border-zinc-200 dark:hover:border-zinc-800 transition-all group rounded-md ${
              index % 2 === 0 
                ? 'bg-blue-600/[0.03] dark:bg-blue-500/[0.03]' 
                : 'bg-blue-600/[0.08] dark:bg-blue-500/[0.08]'
            } hover:bg-blue-600/[0.12] dark:hover:bg-blue-500/[0.12] gap-4 sm:gap-6`}
          >
            <div className="flex items-center gap-4 md:gap-6 w-full sm:w-auto">
              <div className="flex flex-col items-center min-w-[36px] md:min-w-[40px]">
                <div className={`text-[9px] md:text-[10px] font-black tracking-widest ${
                  match.game_logic.toLowerCase() === RPS_LOGIC ? 'text-orange-500' :
                  POKER_ALIASES.includes(match.game_logic.toLowerCase()) ? 'text-blue-500' :
                  'text-zinc-400 dark:text-zinc-700'
                }`}>
                  {match.game_logic.toLowerCase() === RPS_LOGIC ? 'RPS' : 
                   POKER_ALIASES.includes(match.game_logic.toLowerCase()) ? 'POKER' : 'FISE'}
                </div>
                <div className="text-[10px] md:text-xs font-black text-black dark:text-zinc-200 tabular-nums opacity-80 group-hover:opacity-100 transition-opacity">#{match.match_id.split('-').pop()}</div>
              </div>

              <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                <div className="flex flex-col min-w-0">
                  <span className="text-[8px] md:text-[10px] font-black text-blue-600 dark:text-gold uppercase tracking-tighter mb-0.5">INITIATOR</span>
                  <span className="text-sm md:text-base font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {match.player_a_nickname || match.player_a.slice(0, 6)}
                  </span>
                </div>
                <Swords className="w-3 h-3 md:w-4 md:h-4 text-zinc-200 dark:text-zinc-800 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-[8px] md:text-[10px] font-black text-blue-600 dark:text-gold uppercase tracking-tighter mb-0.5">RIVAL</span>
                  <span className={`text-sm md:text-base font-medium truncate ${match.player_b && match.player_b !== '0x0000000000000000000000000000000000000000' ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-300 dark:text-zinc-800 italic'}`}>
                    {match.player_b && match.player_b !== '0x0000000000000000000000000000000000000000' ? (match.player_b_nickname || match.player_b.slice(0, 6)) : 'WAITING...'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-4 md:gap-8 w-full sm:w-auto border-t sm:border-none border-zinc-100 dark:border-zinc-900/50 pt-3 sm:pt-0">
              <div className="flex flex-col text-left sm:text-right tabular-nums">
                <span className="text-[8px] md:text-[10px] font-black text-blue-600 dark:text-gold uppercase tracking-tighter mb-0.5">STAKE</span>
                <span className="text-sm md:text-base font-black text-zinc-900 dark:text-zinc-100 italic">
                  {(Number(match.stake_wei || 0) / 1e18).toFixed(4)} <span className="text-[10px] not-italic text-zinc-500 uppercase">ETH</span>
                </span>
              </div>
              
              <div className="min-w-[80px] md:min-w-[100px] flex justify-end">
                <div className={`flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 rounded border ${
                  match.status === 'OPEN' ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-800' :
                  match.status === 'ACTIVE' ? 'bg-blue-600/5 dark:bg-blue-500/5 text-blue-600 dark:text-blue-500 border-blue-600/10 dark:border-blue-500/20' :
                  match.status === 'SETTLED' ? 'bg-emerald-600/5 dark:bg-emerald-500/5 text-emerald-600 dark:text-emerald-500 border-emerald-600/10 dark:border-emerald-500/20' :
                  'bg-red-600/5 dark:bg-red-500/5 text-red-600 dark:text-red-500 border-red-600/10 dark:border-red-500/20'
                }`}>
                  {match.status === 'ACTIVE' && <Circle className="w-1.5 h-1.5 md:w-2 md:h-2 fill-blue-600 dark:fill-blue-500 animate-pulse" />}
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest">{match.status}</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
      {matches.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 opacity-20 dark:opacity-10 grayscale">
          <Swords className="w-12 h-12 mb-4 text-zinc-400" />
          <span className="text-xs font-black uppercase tracking-[0.5em] text-zinc-500 italic uppercase">ARENA_READY // AWAITING_FIRST_BATTLE</span>
        </div>
      )}
    </div>
  );
}
