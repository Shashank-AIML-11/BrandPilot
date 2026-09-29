import React, { useState, useEffect } from 'react';
import { ArrowRight, Play, CheckCircle2, Cpu, Sparkles, TrendingUp, RefreshCw, Send, Wand2, Layers, Volume2, ShieldCheck, Flame, Zap } from 'lucide-react';
import { playClickSound, playSuccessSound, triggerConfetti } from '../utils/audio';

interface HeroProps {
  onScrollToVault: () => void;
  onOpenDemo: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onScrollToVault, onOpenDemo }) => {
  const [quickUrl, setQuickUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'generate' | 'post' | 'learn' | 'strategy'>('generate');

  // Automatically cycle through autonomous phases so preview is live without requiring any clicks
  useEffect(() => {
    const tabs: ('generate' | 'post' | 'learn' | 'strategy')[] = ['generate', 'post', 'learn', 'strategy'];
    const interval = setInterval(() => {
      setActiveTab((prev) => {
        const nextIndex = (tabs.indexOf(prev) + 1) % tabs.length;
        return tabs[nextIndex];
      });
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const handleQuickLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    playClickSound();
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      playSuccessSound();
      triggerConfetti();
      onScrollToVault();
    }, 900);
  };

  const previewData = {
    generate: {
      badge: '1. AUTO-GENERATE',
      title: 'Infinite Creative Synthesis',
      hook: '"Stop buying 8 skincare bottles until you understand what barrier starvation looks like."',
      image: '/src/assets/images/loviza_viral_fashion_dtc_1790440795970.jpg',
      audio: '♫ Clean Girl Acoustic Pop · 122 BPM',
      views: '1.4M Organic FYP',
      metricLabel: 'Daily Autonomous Output',
      metricVal: '60+ Creatives / Day',
      metricSub: 'Biometric face lock, product-in-hand physics & kinetic typography',
      color: 'text-yellow-400'
    },
    post: {
      badge: '2. AUTO-POST',
      title: 'Omnichannel Peak Dispatch',
      hook: '"If you do this in your morning routine, you\'re shutting off 60% of metabolic burn."',
      image: '/src/assets/images/loviza_viral_fitness_creative_1790441350420.jpg',
      audio: '♫ Uptempo Dopamine Trap · 128 BPM',
      views: '2.8M FYP Viral',
      metricLabel: 'Peak Algorithmic Window',
      metricVal: '7:18 PM Slot Locked',
      metricSub: 'Programmatic direct publishing across TikTok, Reels, Shorts & Meta',
      color: 'text-yellow-400'
    },
    learn: {
      badge: '3. AUTO-LEARN',
      title: 'Closed-Loop Telemetry',
      hook: '"Your engineering team is burning $80k/month waiting on manual PR reviews."',
      image: '/src/assets/images/loviza_viral_saas_creator_1790440812141.jpg',
      audio: '♫ Deep Tech Focus Ambient · 110 BPM',
      views: '890K Dev Reach',
      metricLabel: '3-Sec Hook Retention',
      metricVal: '89.4% (+34% lift)',
      metricSub: 'Auto-pruned 1.2s cold intro; diagnosed viral contrast trigger',
      color: 'text-yellow-400'
    },
    strategy: {
      badge: '4. AUTO-BUILD STRATEGY',
      title: 'Exponential Compounding',
      hook: '"LOVIZA Autonomous Command: 14 high-converting sub-variants deployed."',
      image: '/src/assets/images/loviza_strategy_intelligence_hub_1790441374391.jpg',
      audio: '♫ Cybernetic Intelligence Hub',
      views: '5.2M Ecosystem',
      metricLabel: 'Compounded Viral Lift',
      metricVal: '+1,590% Velocity',
      metricSub: 'Evolves ongoing brand narrative and angles based on paying customer conversions',
      color: 'text-yellow-400'
    }
  };

  const current = previewData[activeTab];

  return (
    <section className="relative pt-8 pb-20 md:pt-14 md:pb-28 overflow-hidden bg-black text-zinc-100">
      {/* Background ambient yellow and grey glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[480px] bg-gradient-to-tr from-yellow-500/15 via-zinc-800/10 to-transparent blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute top-10 right-10 w-96 h-96 bg-yellow-400/5 blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-zinc-800/20 blur-[100px] pointer-events-none rounded-full" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Master Headline */}
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] [text-wrap:balance]">
            The Autonomous SaaS that <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-300 bg-clip-text text-transparent">
              Auto-Generates, Auto-Posts, & Auto-Learns
            </span>{' '}
            to make your brand viral
          </h1>

          <p className="mt-6 text-base sm:text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto font-normal leading-relaxed">
            Feed LOVIZA your website, product images, raw videos, ICP, and focus keywords once. Our self-learning engine continuously generates high-converting short videos, tests posting windows, diagnoses performance telemetry, and auto-builds your exponential marketing strategy forever.
          </p>

          {/* Quick Setup Form */}
          <form onSubmit={handleQuickLaunch} className="mt-8 max-w-xl mx-auto flex flex-col sm:flex-row items-center gap-2 p-1.5 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/80">
            <input
              type="url"
              required
              value={quickUrl}
              onChange={(e) => setQuickUrl(e.target.value)}
              placeholder="Enter your website: https://yourbrand.com"
              className="w-full sm:flex-1 px-4 py-3 bg-transparent text-white text-sm placeholder:text-zinc-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isAnalyzing}
              className="w-full sm:w-auto px-6 py-3.5 bg-yellow-400 hover:bg-yellow-300 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-yellow-400/20 flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap active:scale-95 disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-black" />
                  <span>Extracting Brand DNA...</span>
                </>
              ) : (
                <>
                  <span>Activate Brand DNA</span>
                  <ArrowRight className="w-4 h-4 text-black stroke-[3]" />
                </>
              )}
            </button>
          </form>

          {/* Trust points */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" />
              <span>100% Hands-off Autonomous Operation</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" />
              <span>Auto-Learns & Optimizes Daily</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" />
              <span>Self-Evolving Marketing Strategy</span>
            </span>
          </div>
        </div>

        {/* Dynamic Holographic Preview Canvas (Display Only - Non-Clickable) */}
        <div className="mt-14 max-w-5xl mx-auto rounded-3xl border border-zinc-800 bg-zinc-950 p-3 sm:p-4 shadow-2xl shadow-yellow-400/5 relative overflow-hidden pointer-events-none select-none">
          
          {/* Animated Top Terminal Status Bar */}
          <div className="px-4 py-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400"></span>
              </div>
              <span className="font-mono text-zinc-200 font-semibold text-[11px]">
                loviza-core // autonomous-flywheel.stream
              </span>
            </div>

            {/* 4-Phase Display Badges */}
            <div className="flex items-center gap-1 bg-black p-1 rounded-xl border border-zinc-800 text-[11px] overflow-x-auto">
              {(['generate', 'post', 'learn', 'strategy'] as const).map((tab) => (
                <div
                  key={tab}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all capitalize whitespace-nowrap ${
                    activeTab === tab
                      ? 'bg-yellow-400 text-black shadow-md shadow-yellow-400/25'
                      : 'text-zinc-500'
                  }`}
                >
                  {tab === 'generate' && '1. Auto-Generate'}
                  {tab === 'post' && '2. Auto-Post'}
                  {tab === 'learn' && '3. Auto-Learn'}
                  {tab === 'strategy' && '4. Auto-Strategy'}
                </div>
              ))}
            </div>

            <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-yellow-400">
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
              Viral Accuracy: 98.6%
            </div>
          </div>

          {/* Central Workspace Multi-Screen Grid */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
            
            {/* Left Col (5 cols): Brand DNA Vault Live Monitor */}
            <div className="md:col-span-5 rounded-2xl bg-black border border-zinc-800/80 p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-400 pb-2 border-b border-zinc-900">
                  <span className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-yellow-400" />
                    Locked Brand DNA Profile
                  </span>
                  <span className="text-yellow-400 font-mono font-bold text-[11px] bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-400/20">
                    100% AUTOPILOT
                  </span>
                </div>

                {/* Brand Identity Card */}
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-white">Aura Luxe Skincare</div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 font-bold">
                      DTC E-Commerce
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-snug">
                    Clean clinical barrier repair engineered for modern urban skin.
                  </p>
                </div>

                {/* Target ICP */}
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1 text-xs">
                  <div className="text-[10px] uppercase font-bold text-zinc-500">Target ICP Persona</div>
                  <div className="font-semibold text-zinc-200">Urban Skincare Seekers (24–38)</div>
                  <div className="text-[11px] text-zinc-400">Core Pain: Damaged skin barrier from aggressive peels & pollution</div>
                </div>

                {/* Focus Words Chips */}
                <div>
                  <div className="text-[10px] uppercase font-bold text-zinc-500 mb-1.5">Focus Words Ingested</div>
                  <div className="flex flex-wrap gap-1 text-[11px]">
                    {['barrier repair', 'ceramide', 'dermatologist tested', 'glass skin glow'].map((w, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-zinc-900 text-yellow-400 border border-zinc-800 font-mono text-[10px]">
                        #{w}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status footer */}
              <div className="pt-3 border-t border-zinc-900 flex items-center justify-between text-xs">
                <span className="text-zinc-500 font-medium">Daily Production:</span>
                <span className="font-mono font-bold text-yellow-400">4-6 Videos / Day Auto-Distributed</span>
              </div>
            </div>

            {/* Center Col (4 cols): Animated Vertical Phone Reel */}
            <div className="md:col-span-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 p-3 flex items-center justify-center relative overflow-hidden">
              <div className="w-[210px] sm:w-[230px] aspect-[9/17] rounded-[28px] overflow-hidden border-2 border-zinc-700 shadow-2xl relative bg-black">
                <img
                  src={current.image}
                  alt={current.title}
                  className="w-full h-full object-cover transition-all duration-500"
                  referrerPolicy="no-referrer"
                />

                {/* Scrim Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/40" />

                {/* Top Badge: Auto-Learned Tag */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-[10px]">
                  <span className="px-2 py-0.5 rounded-full bg-yellow-400 text-black font-black uppercase tracking-wider flex items-center gap-1 shadow-md text-[9px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse"></span>
                    {current.badge}
                  </span>
                  <span className="font-mono text-yellow-400 font-bold bg-black/70 px-1.5 py-0.5 rounded border border-zinc-800">
                    {current.views}
                  </span>
                </div>

                {/* Animated Captions */}
                <div className="absolute bottom-3 left-3 right-3 space-y-1.5 text-left">
                  <div className="inline-block bg-yellow-400 text-black font-black text-[9px] px-1.5 py-0.5 rounded uppercase">
                    AUTOPILOT VIRAL HOOK
                  </div>
                  <p className="text-[11px] font-extrabold text-white leading-tight drop-shadow-md">
                    {current.hook}
                  </p>
                  
                  {/* Dancing Sound Bars */}
                  <div className="flex items-center gap-1 pt-1 text-[9px] text-yellow-400 font-mono">
                    <span className="truncate max-w-[130px]">{current.audio}</span>
                    <div className="flex items-end gap-0.5 ml-auto h-3">
                      <span className="w-0.5 h-2 bg-yellow-400 animate-pulse"></span>
                      <span className="w-0.5 h-3 bg-yellow-300 animate-pulse [animation-delay:150ms]"></span>
                      <span className="w-0.5 h-1.5 bg-yellow-400 animate-pulse [animation-delay:300ms]"></span>
                    </div>
                  </div>
                </div>

                {/* Floating Play Indicator */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-yellow-400/20 backdrop-blur-md border border-yellow-400/40 flex items-center justify-center text-yellow-400">
                  <Play className="w-4 h-4 fill-yellow-400 text-yellow-400 translate-x-0.5" />
                </div>
              </div>
            </div>

            {/* Right Col (3 cols): Autonomous Feedback Loop Metrics */}
            <div className="md:col-span-3 rounded-2xl bg-black border border-zinc-800/80 p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-yellow-400" />
                  Telemetry Diagnoser
                </div>

                <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1 text-xs">
                  <div className="text-zinc-500 text-[10px] uppercase font-bold">{current.metricLabel}</div>
                  <div className="text-base font-extrabold text-yellow-400 font-mono">{current.metricVal}</div>
                  <div className="text-[11px] text-zinc-400 leading-snug">{current.metricSub}</div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1 text-xs">
                  <div className="text-zinc-500 text-[10px] uppercase font-bold">Auto-Post Destination</div>
                  <div className="font-bold text-white">TikTok · Reels · Shorts</div>
                  <div className="text-[10px] text-yellow-400 font-mono">Dynamic Slot Scoring Active</div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1 text-xs">
                  <div className="text-zinc-500 text-[10px] uppercase font-bold">Marketing Strategy Brain</div>
                  <div className="text-xs text-zinc-300">
                    Self-evolving based on actual checkout revenue and retention peaks.
                  </div>
                </div>
              </div>

              <div className="w-full py-2.5 bg-yellow-400 text-black font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-yellow-400/10">
                <span>Open Brand Profile DNA</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
