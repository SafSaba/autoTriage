import React, { useState, useEffect } from 'react';
import { getTelemetryState } from '../lib/api';

export const FDEMissionControl: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [telemetry, setTelemetry] = useState(getTelemetryState());

  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetry(getTelemetryState());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const envColor =
    telemetry.env === 'PROD'
      ? 'bg-purple-600 text-white'
      : telemetry.env === 'QA'
      ? 'bg-amber-500 text-black'
      : 'bg-emerald-600 text-white';

  return (
    <div className="fixed bottom-3 right-3 z-50 font-mono text-xs">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg border border-slate-700/50 backdrop-blur-md ${envColor} font-semibold transition hover:scale-105`}
        >
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span>FDE Mission Control ({telemetry.env})</span>
        </button>
      ) : (
        <div className="w-96 rounded-xl border border-slate-700 bg-slate-900/95 text-slate-200 p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${envColor}`}>
                {telemetry.env}
              </span>
              <span className="font-bold text-slate-100">AutoTriage FDE Observability HUD</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-800"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2.5">
            <div>
              <span className="text-slate-400 block text-[11px]">Active Backend Container App:</span>
              <span className="text-emerald-400 break-all select-all font-mono text-[11px]">
                {telemetry.apiBase}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block text-[11px]">Neon Database Tier:</span>
              <span className="text-blue-400 font-semibold font-mono text-[11px]">
                {telemetry.env === 'PROD'
                  ? 'neondb_prod (Isolated AWS us-east-1)'
                  : telemetry.env === 'QA'
                  ? 'neondb_qa (Chaos Isolated)'
                  : 'neondb_dev (Shift-Left Sandbox)'}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block text-[11px]">Latest W3C OperationId (App Insights):</span>
              <span className="bg-slate-950 px-2 py-1 rounded block text-amber-300 break-all select-all border border-slate-800 text-[10px]">
                {telemetry.operationId}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block text-[11px]">Latest W3C traceparent Header:</span>
              <span className="bg-slate-950 px-2 py-1 rounded block text-slate-300 break-all select-all border border-slate-800 text-[10px]">
                {telemetry.traceparent}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Autonomous Self-Healing:</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                ENABLED (Sprints 7-8)
              </span>
            </div>

            <div className="pt-2">
              <a
                href="/mission-control"
                className="block text-center py-1.5 bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 rounded text-white font-bold text-[11px] shadow-lg shadow-cyan-900/30 transition"
              >
                🚀 Launch 4-Zone Command Center UI
              </a>
            </div>

            <div className="pt-1 flex items-center gap-2">
              <a
                href="https://dev.azure.com/isafwan/AutoTriage/_boards/board/t/AutoTriage%20Team/Stories"
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-center py-1 bg-blue-600 hover:bg-blue-500 rounded text-white font-medium text-[10px] transition"
              >
                ADO Sprint 8 Board
              </a>
              <a
                href="https://dev.azure.com/isafwan/AutoTriage/_workitems/edit/82"
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-center py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-[10px] transition border border-slate-700"
              >
                Test Plan TP-700
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
