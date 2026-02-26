'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Swords, ArrowRight, Loader2, ExternalLink, Play } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';

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
const DICE_LOGIC = (process.env.NEXT_PUBLIC_DICE_LOGIC_ADDRESS || '').toLowerCase();
const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}`;

const ESCROW_ABI = [
  { name: 'joinMatch', type: 'function', stateMutability: 'payable', inputs: [{ name: '_matchId', type: 'uint256' }], outputs: [] },
] as const;

type GameTab = 'ALL' | 'RPS' | 'DICE';

export function MatchFeed() {
  const { authenticated, login } = usePrivy();
  const { isConnected } = useAccount();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<GameTab>('ALL');

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const handleJoin = (e: React.MouseEvent, match: Match) => {
    e.preventDefault(); // Prevent Link navigation
    e.stopPropagation();

    if (!authenticated) {
      login();
      return;
    }

    const onChainId = BigInt(match.match_id.split('-').pop() || '0');
    
    writeContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'joinMatch',
      args: [onChainId],
      value: BigInt(match.stake_wei),
    });
  };

  useEffect(() => {
    async function fetchMatches() {
      let query = supabase
        .from('matches')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (activeTab === 'RPS') query = query.eq('game_logic', RPS_LOGIC);
      if (activeTab === 'DICE') query = query.eq('game_logic', DICE_LOGIC);

      const { data: matchData } = await query.limit(20);
      if (!matchData) {
        setMatches([]);
        setLoading(false);
        return;
      }

      const addresses = new Set<string>();
      matchData.forEach(m => {
        addresses.add(m.player_a.toLowerCase());
        if (m.player_b) addresses.add(m.player_b.toLowerCase());
      });

      const { data: profiles } = await supabase
        .from('agent_profiles')
        .select('address, nickname')
        .in('address', Array.from(addresses));

      const profileMap = new Map(profiles?.map(p => [p.address.toLowerCase(), p.nickname]) || []);

      const enrichedMatches = matchData.map(m => ({
        ...m,
        player_a_nickname: profileMap.get(m.player_a.toLowerCase()),
        player_b_nickname: m.player_b ? profileMap.get(m.player_b.toLowerCase()) : undefined
      })).filter(m => {
        const isAStress = m.player_a_nickname?.startsWith('StressBot_');
        const isBStress = m.player_b_nickname?.startsWith('StressBot_');
        return !isAStress && !isBStress;
      });

      setMatches(enrichedMatches);
      setLoading(false);
    }

    fetchMatches();

    const channel = supabase
      .channel('match-feed-changes')
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
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/50 self-start w-fit mb-4">
        {(['ALL', 'RPS', 'DICE'] as GameTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${
              activeTab === tab 
                ? 'bg-zinc-800 text-white shadow-lg' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      
      <div className="grid gap-2">
        {matches.map((match) => (
          <Link 
            key={match.match_id} 
            href={`/match/${match.match_id}`}
            className="bg-zinc-900/30 border border-zinc-800/50 p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-zinc-800/50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[9px] border ${
                    match.game_logic.toLowerCase() === RPS_LOGIC ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                    match.game_logic.toLowerCase() === DICE_LOGIC ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' :
                    'bg-zinc-800 text-zinc-500 border-zinc-700'
                }`}>
                    {match.game_logic.toLowerCase() === RPS_LOGIC ? 'RPS' :
                    match.game_logic.toLowerCase() === DICE_LOGIC ? 'DICE' : '??'}
                </div>
                <span className="text-[8px] font-bold text-zinc-600 mt-0.5">#{match.match_id.split('-').pop()}</span>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-zinc-600 uppercase mb-0.5">PLAYER A</span>
                  <span className="text-xs font-bold text-white truncate max-w-[80px]">
                    {match.player_a_nickname || `${match.player_a.slice(0, 4)}...`}
                  </span>
                </div>
                <ArrowRight className="w-3 h-3 text-zinc-800" />
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-zinc-600 uppercase mb-0.5">PLAYER B</span>
                  <span className="text-xs font-bold text-white truncate max-w-[80px]">
                    {match.player_b ? (match.player_b_nickname || `${match.player_b.slice(0, 4)}...`) : 'WAITING...'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 ml-auto sm:ml-0">
              <div className="flex flex-col text-right">
                <span className="text-[8px] font-bold text-zinc-600 uppercase mb-0.5">Stake</span>
                <span className="text-[10px] font-bold text-white">{(Number(match.stake_wei) / 1e18).toFixed(4)} ETH</span>
              </div>
              
              {match.status === 'OPEN' ? (
                <button 
                  onClick={(e) => handleJoin(e, match)}
                  disabled={isPending || isConfirming}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-black px-4 py-1.5 rounded-lg transition-all uppercase text-[9px] flex items-center gap-2 active:scale-95 shadow-lg shadow-blue-500/10"
                >
                  {isPending || isConfirming ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : (
                    <>JOIN <Play className="w-2.5 h-2.5 fill-white" /></>
                  )}
                </button>
              ) : (
                <div className="flex flex-col text-right min-w-[70px]">
                  <span className="text-[8px] font-bold text-zinc-600 uppercase mb-0.5">Status</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider text-center ${
                    match.status === 'ACTIVE' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                    match.status === 'SETTLED' ? 'bg-green-500/10 text-green-500 border border-green-500/20' :
                    match.status === 'VOIDED' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                    'bg-zinc-800 text-zinc-400'
                  }`}>
                    {match.status}
                  </span>
                </div>
              )}
            </div>
          </Link>
        ))}
        {matches.length === 0 && (
          <div className="bg-zinc-900/20 border border-zinc-800/50 p-8 rounded-xl text-center">
            <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-[0.2em] italic">Arena Offline</p>
          </div>
        )}
      </div>
    </div>
  );
}
