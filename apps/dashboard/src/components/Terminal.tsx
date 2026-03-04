'use client';

import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Terminal as TerminalIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'INFO' | 'ACTION' | 'ALERT' | 'SYSTEM';
  message: string;
}

export function Terminal() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasBooted = useRef(false);

  const addLog = (message: string, type: LogEntry['type'] = 'INFO') => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type,
      message
    };
    setLogs(prev => [...prev.slice(-99), newLog]);
  };

  useEffect(() => {
    if (hasBooted.current) return;
    hasBooted.current = true;

    addLog('FALKEN_OS: INITIALIZING ARENA_LIVE_FEED...', 'SYSTEM');
    addLog('SUBSCRIBING TO ONCHAIN_REPLICATION_LAYERS...', 'SYSTEM');
    addLog('CONNECTION_ESTABLISHED: MONITORING MATCHES AND ROUNDS.', 'INFO');

    // 1. Listen for Match Changes (Created, Joined, Settled)
    const matchChannel = supabase
      .channel('terminal-matches')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, (payload) => {
        const id = payload.new.match_id.split('-').pop();
        addLog(`**NEW MATCH CREATED** [ID: ${id}]`, 'ACTION');
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, (payload) => {
        const id = payload.new.match_id.split('-').pop();
        
        if (payload.old.status === 'OPEN' && payload.new.status === 'ACTIVE') {
          addLog(`**RIVAL JOINED MATCH ${id}**. BATTLE IS LIVE.`, 'ACTION');
        }
        
        if (payload.new.status === 'SETTLED') {
          const winner = payload.new.winner ? `WINNER: ${payload.new.winner.slice(0, 8)}...` : 'RESULT: DRAW';
          addLog(`**SETTLEMENT DETECTED**: MATCH ${id} CLOSED. ${winner}`, 'ALERT');
        }

        if (payload.old.phase !== payload.new.phase && payload.new.status === 'ACTIVE') {
          addLog(`MATCH ${id}: PHASE_SHIFT TO **${payload.new.phase}**`, 'INFO');
        }
      })
      .subscribe();

    // 2. Listen for Round Results
    const roundChannel = supabase
      .channel('terminal-rounds')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds' }, (payload) => {
        // Only log when a round is revealed and has a winner
        if (payload.new.revealed && payload.new.winner !== null) {
          const matchIdShort = payload.new.match_id.split('-').pop();
          const winnerLabel = payload.new.winner === 0 ? 'DRAW' : payload.new.winner === 1 ? 'PLAYER_A' : 'PLAYER_B';
          addLog(`MATCH ${matchIdShort} [ROUND ${payload.new.round_number}]: **${winnerLabel}** VICTORIOUS.`, 'INFO');
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(matchChannel);
      supabase.removeChannel(roundChannel);
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#050505] font-arena text-[13px] overflow-hidden transition-colors duration-500">
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-hide selection:bg-blue-500/20 dark:selection:bg-blue-500/30"
      >
        {logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-300 dark:text-zinc-800 opacity-50">
            <TerminalIcon className="w-10 h-10 mb-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.5em]">Synchronizing...</span>
          </div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="w-full flex flex-col items-start leading-relaxed animate-in fade-in slide-in-from-left-2 duration-300 group">
            <div className="w-full flex items-center gap-2 mb-1">
              <span className="text-zinc-400 dark:text-zinc-600 font-bold tabular-nums whitespace-nowrap text-[10px] uppercase">
                [{log.timestamp}]
              </span>
              <span className={`text-[10px] font-black uppercase tracking-widest ${
                log.type === 'SYSTEM' ? 'text-blue-600 dark:text-blue-500' :
                log.type === 'ACTION' ? 'text-purple-600 dark:text-purple-500' :
                log.type === 'ALERT' ? 'text-amber-600 dark:text-yellow-500' :
                'text-zinc-400 dark:text-zinc-500'
              }`}>
                {log.type}
              </span>
              <div className="h-[1px] flex-1 bg-zinc-100 dark:bg-zinc-900/10 group-hover:bg-zinc-800 transition-colors" />
            </div>
            
            <div className={`w-full max-w-none break-words font-semibold p-3 rounded-sm bg-blue-500/10 dark:bg-blue-500/20 backdrop-blur-[2px] border-l-2 ${
              log.type === 'SYSTEM' ? 'border-blue-500/40' :
              log.type === 'ACTION' ? 'border-purple-500/40' :
              log.type === 'ALERT' ? 'border-amber-500/40' :
              'border-blue-500/20'
            } ${
              log.type === 'ALERT' ? 'text-zinc-900 dark:text-white' : 
              'text-zinc-800 dark:text-zinc-300'
            } text-sm`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {log.message}
              </ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
      
      <div className="p-3 bg-zinc-50 dark:bg-black border-t border-zinc-200 dark:border-zinc-900 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Live_Operations_Active</span>
        </div>
        <span className="text-[9px] font-bold text-zinc-300 dark:text-zinc-800 uppercase tracking-tighter">FALKEN_OS_v0.0.1</span>
      </div>
    </div>
  );
}
