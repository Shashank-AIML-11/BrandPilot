import React, { useState } from 'react';
import { AUTONOMOUS_PILLARS } from './mockData';
import { AutonomousPillar } from './types';
import { 
  Wand2, 
  Send, 
  Cpu, 
  TrendingUp, 
  ArrowRight, 
  Sparkles, 
  CheckCircle2, 
  Zap,
  Activity,
  Layers,
  Flame,
  Radio
} from 'lucide-react';
import { playClickSound } from './audio';

export const AutonomousFlywheel: React.FC = () => {
  const [selectedPillarId, setSelectedPillarId] = useState<string>(AUTONOMOUS_PILLARS[0]!.id);

  const activePillar = AUTONOMOUS_PILLARS.find((p) => p.id === selectedPillarId) ?? AUTONOMOUS_PILLARS[0]!;

  const getPillarIcon = (name: string) => {
    switch (name) {
      case 'Wand2': return <Wand2 className="w-5 h-5 text-yellow-400" />;
      case 'Send': return <Send className="w-5 h-5 text-yellow-400" />;
      case 'Cpu': return <Cpu className="w-5 h-5 text-yellow-400" />;
      case 'TrendingUp': return <TrendingUp className="w-5 h-5 text-yellow-400" />;
      default: return <Sparkles className="w-5 h-5 text-yellow-400" />;
    }
  };

  const pillarVisuals: Record<string, { image: string; tag: string; caption: string }> = {
    'auto-generate': {
      image: '/images/landing/loviza_viral_fashion_dtc_1790440795970.jpg',
      tag: 'SYNTHESIS ENGINE',
      caption: 'Continuous multi-format creative production matching Brand DNA'
    },
    'auto-post': {
      image: '/images/landing/loviza_viral_fitness_creative_1790441350420.jpg',
      tag: 'OMNICHANNEL DISPATCH',
      caption: 'Direct algorithmic scheduling across TikTok, Reels, and Shorts'
    },
    'auto-learn': {
      image: '/images/landing/loviza_autolearn_flywheel_1790440780063.jpg',
      tag: 'CLOSED-LOOP TELEMETRY',
      caption: 'Sub-second hook analysis, acoustic energy & visual drop-off diagnostic'
    },
    'auto-strategy': {
      image: '/images/landing/loviza_strategy_intelligence_hub_1790441374391.jpg',
      tag: 'SELF-EVOLVING BRAIN',
      caption: 'Autonomous brand marketing roadmap pivots based on conversion sales'
    }
  };

  const activeVisual = pillarVisuals[selectedPillarId] ?? pillarVisuals['auto-generate']!;

  return (
    <section id="four-pillars" className="py-20 md:py-28 border-t border-zinc-800 relative bg-black overflow-hidden text-zinc-100">
      
      {/* Background ambient lighting */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-yellow-400/5 blur-[160px] pointer-events-none rounded-full" />
      <div className="absolute top-1/2 right-10 w-80 h-80 bg-zinc-800/20 blur-[120px] pointer-events-none rounded-full" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="max-w-3xl mb-14">
          <p className="text-xs uppercase tracking-widest text-yellow-400 font-bold mb-2 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            The Autonomous Engine Architecture
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight [text-wrap:balance]">
            The 4 pillars of self-scaling exponential virality
          </h2>
          <p className="mt-4 text-zinc-400 text-sm sm:text-base leading-relaxed">
            Other tools are manual editors that wait for you to do the work every day. LOVIZA is a closed-loop autonomous system: it generates, distributes, learns from every millisecond of engagement, and re-engineers your marketing strategy automatically forever.
          </p>
        </div>

        {/* Visual Flywheel Display Banner */}
        <div className="mb-14 rounded-3xl overflow-hidden border border-zinc-800 bg-zinc-950 shadow-2xl relative group">
          <div className="relative aspect-[21/9] max-h-[380px] w-full overflow-hidden">
            <img
              src="/images/landing/loviza_autolearn_flywheel_1790440780063.jpg"
              alt="LOVIZA Autonomous Learning Flywheel"
              className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-700"
              referrerPolicy="no-referrer"
            />
            {/* Scrim Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

            {/* Floating Overlays */}
            <div className="absolute bottom-6 left-6 right-6 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="px-2.5 py-1 rounded-full bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 text-xs font-bold uppercase tracking-wider">
                  The Closed Loop Cycle
                </span>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Auto-Generate ➔ Auto-Post ➔ Auto-Learn ➔ Auto-Build Strategy
                </h3>
              </div>
              <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md px-3.5 py-2 rounded-xl border border-zinc-800 text-xs text-yellow-400 font-mono">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-ping"></span>
                <span>Autonomous Engine: Active 24/7/365</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Pillars Interactive Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {AUTONOMOUS_PILLARS.map((pillar) => {
            const isSelected = selectedPillarId === pillar.id;
            return (
              <div
                key={pillar.id}
                onClick={() => {
                  playClickSound();
                  setSelectedPillarId(pillar.id);
                }}
                className={`rounded-2xl p-6 flex flex-col justify-between transition-all duration-300 cursor-pointer relative overflow-hidden group ${
                  isSelected
                    ? 'bg-zinc-900 border-2 border-yellow-400 shadow-xl shadow-yellow-400/10 -translate-y-1'
                    : 'bg-zinc-950 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/60'
                }`}
              >
                <div>
                  {/* Top Bar */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-black border border-zinc-800 flex items-center justify-center">
                      {getPillarIcon(pillar.iconName)}
                    </div>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase font-bold ${
                      isSelected
                        ? 'bg-yellow-400 text-black font-extrabold'
                        : 'bg-zinc-900 text-yellow-400 border border-zinc-800'
                    }`}>
                      {pillar.shortTitle}
                    </span>
                  </div>

                  {/* Title & Action */}
                  <h3 className="text-lg font-bold text-white tracking-tight">{pillar.title}</h3>
                  <div className="text-xs font-semibold text-yellow-400 mt-0.5 mb-2">{pillar.action}</div>
                  
                  {/* Description */}
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {pillar.description}
                  </p>
                </div>

                {/* Telemetry Footer */}
                <div className="mt-6 pt-4 border-t border-zinc-800/80 space-y-1.5">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Autonomous Capability</div>
                  <div className="text-[11px] font-mono text-zinc-300 font-semibold">{pillar.telemetryData}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Pillar Deep Dive Showcase */}
        <div className="mt-12 bg-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 text-xs font-bold uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5" />
              <span>Deep Dive: {activePillar.title}</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {activePillar.action}
            </h3>
            <p className="text-sm text-zinc-300 leading-relaxed">
              {activePillar.description}
            </p>
            <div className="p-4 rounded-2xl bg-black border border-zinc-800 space-y-2 text-xs">
              <div className="text-[11px] uppercase font-bold text-zinc-400">Core Technologies Locked in Engine:</div>
              <div className="text-zinc-200 font-mono">{activePillar.keyCapability}</div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-2xl overflow-hidden border border-zinc-800 bg-black aspect-video relative group shadow-2xl">
              <img
                src={activeVisual.image}
                alt={activeVisual.tag}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30" />
              <div className="absolute bottom-3 left-3 right-3 space-y-1">
                <span className="text-[9px] px-2 py-0.5 rounded bg-yellow-400 text-black font-extrabold font-mono uppercase">
                  {activeVisual.tag}
                </span>
                <p className="text-xs text-white font-semibold drop-shadow">
                  {activeVisual.caption}
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
