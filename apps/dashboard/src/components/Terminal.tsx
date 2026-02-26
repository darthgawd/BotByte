'use client';

import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'INFO' | 'ACTION' | 'ALERT' | 'SYSTEM';
  message: string;
}

export function Terminal() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addLog = (message: string, type: LogEntry['type'] = 'INFO') => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString([], { hour12: false }),
      type,
      message
    };
    setLogs(prev => [...prev.slice(-50), newLog]);
  };

  useEffect(() => {
    // Initial welcome logs
    addLog('INITIALIZING FALKEN_OS V2.0...', 'SYSTEM');
    addLog('ESTABLISHING SECURE NEURAL LINK...', 'SYSTEM');
    addLog('CONNECTION STABLE. MONITORING ARENA...', 'SYSTEM');

    // Subscribe to new matches
    const matchChannel = supabase
      .channel('terminal-matches')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, (payload) => {
        addLog(`NEW MATCH DETECTED: ID ${payload.new.match_id.split('-').pop()}`, 'ACTION');
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, (payload) => {
        if (payload.new.status === 'SETTLED') {
          const winner = payload.new.winner ? `WINNER: ${payload.new.winner.slice(0, 6)}...` : 'DRAW';
          addLog(`MATCH ${payload.new.match_id.split('-').pop()} SETTLED. ${winner}`, 'ALERT');
        }
      })
      .subscribe();

    // Subscribe to rounds
    const roundChannel = supabase
      .channel('terminal-rounds')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rounds' }, (payload) => {
        if (payload.new.player_index === 1) {
          addLog(`AGENT_A COMMITTED MOVE // MATCH ${payload.new.match_id.split('-').pop()}`, 'INFO');
        } else {
          addLog(`AGENT_B COMMITTED MOVE // MATCH ${payload.new.match_id.split('-').pop()}`, 'INFO');
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
    <div className="flex flex-col h-full bg-black/60 font-mono text-[10px] md:text-xs">
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-hide"
      >
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 leading-relaxed">
            <span className="text-zinc-600 flex-none">[{log.timestamp}]</span>
            <span className={`flex-none w-16 font-bold ${
              log.type === 'SYSTEM' ? 'text-blue-500' :
              log.type === 'ACTION' ? 'text-purple-500' :
              log.type === 'ALERT' ? 'text-yellow-500' :
              'text-zinc-500'
            }`}>
              {log.type}
            </span>
            <span className={log.type === 'ALERT' ? 'text-white font-bold' : 'text-zinc-300'}>
              {log.message}
            </span>
          </div>
        ))}
        <div className="flex gap-2 items-center text-blue-500 animate-pulse mt-2">
          <span>&gt;</span>
          <div className="w-2 h-4 bg-blue-500" />
        </div>
      </div>
      
      <div className="p-3 border-t border-zinc-800/50 bg-zinc-900/20">
        <div className="flex items-center gap-2 text-zinc-600">
          <span className="text-[10px] uppercase font-bold">Terminal Input:</span>
          <div className="flex-1 bg-black/40 border border-zinc-800/50 rounded px-2 py-1 text-[10px] italic">
            Command interface locked in read-only mode...
          </div>
        </div>
      </div>
    </div>
  );
}
