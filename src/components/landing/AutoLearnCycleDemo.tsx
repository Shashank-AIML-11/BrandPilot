import React, { useState } from 'react';
import { AUTO_LEARN_ITERATIONS } from './mockData';
import { AutoLearnIteration } from './types';
import { 
  Cpu, 
  TrendingUp, 
  ArrowRight, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Eye, 
  Clock, 
  Zap,
  BarChart3,
  Layers
} from 'lucide-react';
import { playClickSound, playSuccessSound, triggerConfetti } from './audio';

export const AutoLearnCycleDemo: React.FC = () => {
  const [selectedCycleIndex, setSelectedCycleIndex] = useState(0);
  const [isSimulatingCycle, setIsSimulatingCycle] = useState(false);
  const [simulatedScore, setSimulatedScore] = useState<string | null>(null);

  const activeIteration: AutoLearnIteration = AUTO_LEARN_ITERATIONS[selectedCycleIndex]!;

  const handleSimulateNextCycle = () => {
    playClickSound();
    setIsSimulatingCycle(true);
    setTimeout(() => {
      setIsSimulatingCycle(false);
      setSimulatedScore('Cycle #4 Telemetry Ingested: +618% Retention Gain Unlocked!');
      playSuccessSound();
      triggerConfetti();
    }, 1000);
  };

  return (
    <section id="auto-learn" className="py-20 md:py-28 border-t border-zinc-800 relative bg-black overflow-hidden text-zinc-100">
      
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[600px] h-[500px] bg-yellow-400/5 blur-[150px] pointer-events-none rounded-full" />
      <div className="absolute top-10 right-10 w-80 h-80 bg-zinc-800/20 blur-[130px] pointer-events-none rounded-full" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-14">
          <p className="text-xs uppercase tracking-widest text-yellow-400 font-bold mb-2 flex items-center justify-center gap-1.5">
            <Cpu className="w-3.5 h-3.5" />
            The Self-Optimizing Feedback Loop
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight [text-wrap:balance]">
            How LOVIZA auto-learns and compounds virality
          </h2>
          <p className="mt-4 text-zinc-400 text-sm sm:text-base leading-relaxed">
            Every published video sends back millisecond-level telemetry. LOVIZA diagnoses retention drop-offs, acoustic energy, and comment sentiment, continuously evolving your content and marketing strategy automatically.
          </p>
        </div>

        {/* Step Selector Tabs */}
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
          {AUTO_LEARN_ITERATIONS.map((iter, idx) => {
            const isSelected = selectedCycleIndex === idx;
            return (
              <button
                key={iter.iteration}
                onClick={() => {
                  playClickSound();
                  setSelectedCycleIndex(idx);
                }}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                  isSelected
                    ? 'bg-zinc-900 border-2 border-yellow-400 shadow-lg shadow-yellow-400/10 -translate-y-1'
                    : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 text-zinc-400'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase font-bold ${
                    isSelected ? 'bg-yellow-400 text-black font-extrabold' : 'bg-black text-yellow-400 border border-zinc-800'
                  }`}>
                    Phase 0{iter.iteration}
                  </span>
                  <span className="font-mono text-yellow-400 font-bold text-xs">{iter.growthLift}</span>
                </div>
                <div className="text-sm font-bold text-white truncate">{iter.contentTitle.split('·')[1]}</div>
                <div className="text-[11px] text-zinc-400 mt-1 font-mono">{iter.reach}</div>
              </button>
            );
          })}
        </div>

        {/* The Diagnostic Deep-Dive Card */}
        <div className="max-w-5xl mx-auto bg-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-black/80 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Column: Creative Visual Thumbnail + Telemetry Metrics (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="relative aspect-[4/5] rounded-2xl overflow-hidden border border-zinc-800 bg-black shadow-xl group">
              <img
                src={activeIteration.creativeThumbnail}
                alt={activeIteration.contentTitle}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                referrerPolicy="no-referrer"
              />
              
              {/* Scrim */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/40 pointer-events-none" />

              {/* Status Header */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-xs">
                <span className="px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-[10px] text-yellow-400 border border-zinc-800 font-mono font-bold uppercase">
                  Iteration 0{activeIteration.iteration}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-yellow-400 text-black font-extrabold text-[10px]">
                  {activeIteration.growthLift}
                </span>
              </div>

              {/* Lower Third Metrics */}
              <div className="absolute bottom-3 left-3 right-3 p-3 rounded-xl bg-black/85 backdrop-blur-md border border-zinc-800 space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400 flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-yellow-400" /> Total Reach
                  </span>
                  <span className="font-mono font-bold text-white">{activeIteration.reach}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-yellow-400" /> Watch Retention
                  </span>
                  <span className="font-mono font-bold text-yellow-400">{activeIteration.watchTime}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: AI Diagnostic & Auto-Evolved Strategy Report (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            <div>
              <span className="text-xs font-mono uppercase text-yellow-400 tracking-wider font-bold">
                Telemetry Log · Iteration {activeIteration.iteration}
              </span>
              <h3 className="text-2xl font-bold text-white mt-1">
                {activeIteration.contentTitle}
              </h3>
            </div>

            {/* Diagnostic 1: Identified Drop Point */}
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                <AlertCircle className="w-4 h-4 text-yellow-400" />
                <span>Audience Retention Drop Point</span>
              </div>
              <div className="font-mono text-sm font-semibold text-yellow-400">
                {activeIteration.retentionDropPoint}
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {activeIteration.aiDiagnosis}
              </p>
            </div>

            {/* Diagnostic 2: Strategy Evolution */}
            <div className="p-4 rounded-xl bg-zinc-900 border border-yellow-400/30 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-yellow-400 uppercase tracking-wider">
                <TrendingUp className="w-4 h-4 text-yellow-400" />
                <span>Autonomous Strategy Evolution</span>
              </div>
              <p className="text-xs text-zinc-200 leading-relaxed font-medium">
                {activeIteration.strategyEvolution}
              </p>
            </div>

            {/* Result of Strategy Evolution */}
            <div className="p-4 rounded-xl bg-black border border-zinc-800 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">
                  Next Batch Empirical Velocity
                </div>
                <div className="text-sm sm:text-base font-extrabold text-white font-mono mt-0.5">
                  {activeIteration.nextBatchResult}
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-yellow-400 bg-yellow-400/10 px-2.5 py-1 rounded border border-yellow-400/30">
                {activeIteration.growthLift}
              </span>
            </div>

            {/* Interactive Simulation Button */}
            <div className="pt-2">
              <button
                onClick={handleSimulateNextCycle}
                disabled={isSimulatingCycle}
                className="w-full sm:w-auto px-6 py-3 bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-yellow-400/20 flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap active:scale-95 disabled:opacity-50"
              >
                {isSimulatingCycle ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-black" />
                    <span>Processing Millisecond FYP Telemetry...</span>
                  </>
                ) : (
                  <>
                    <Cpu className="w-4 h-4 text-black stroke-[2.5]" />
                    <span>Trigger Next Algorithmic Iteration</span>
                  </>
                )}
              </button>

              {simulatedScore && (
                <div className="mt-3 p-3 rounded-xl bg-yellow-400/10 border border-yellow-400/30 text-xs text-yellow-400 flex items-center gap-2 animate-in fade-in duration-200">
                  <CheckCircle2 className="w-4 h-4 text-yellow-400 shrink-0" />
                  <span>{simulatedScore}</span>
                </div>
              )}
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
