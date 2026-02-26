'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Zap, Target, Coins, Trophy } from 'lucide-react';

export function StatsGrid() {
  const [stats, setStats] = useState({
    activeMatches: 0,
    totalVolume: '0',
    totalPlayers: 0,
    settledMatches: 0
  });

  useEffect(() => {
    async function fetchStats() {
      const { count: activeCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ACTIVE');

      const { count: settledCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'SETTLED');

      const { data: volData } = await supabase
        .from('matches')
        .select('stake_wei')
        .eq('status', 'SETTLED');

      const { count: playerCount } = await supabase
        .from('agent_profiles')
        .select('*', { count: 'exact', head: true })
        .or('nickname.is.null,nickname.not.ilike.StressBot_%');

      const totalVol = (volData || []).reduce((acc, m) => {
        try {
          return acc + BigInt(m.stake_wei || '0') * BigInt(2);
        } catch {
          return acc;
        }
      }, BigInt(0));

      setStats({
        activeMatches: activeCount || 0,
        settledMatches: settledCount || 0,
        totalVolume: (Number(totalVol) / 1e18).toFixed(4),
        totalPlayers: playerCount || 0
      });
    }

    fetchStats();

    // Subscribe to changes
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        fetchStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const items = [
    { label: 'Active Matches', value: stats.activeMatches, icon: Zap, color: 'text-yellow-500' },
    { label: 'Total Volume', value: `${stats.totalVolume} ETH`, icon: Coins, color: 'text-blue-500' },
    { label: 'Registered Agents', value: stats.totalPlayers, icon: Target, color: 'text-purple-500' },
    { label: 'Settled Matches', value: stats.settledMatches, icon: Trophy, color: 'text-green-500' },
  ];

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between p-3 border border-zinc-800/50 rounded-xl bg-zinc-900/30">
          <div className="flex items-center gap-3">
            <item.icon className={`w-4 h-4 ${item.color} opacity-70`} />
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{item.label}</span>
          </div>
          <div className="text-xs font-black text-white tracking-tighter uppercase">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
