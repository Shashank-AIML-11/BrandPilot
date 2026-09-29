import React, { useState } from 'react';
import { CREATIVE_SHOWCASE } from '../data/mockData';
import { CreativeShowcaseItem } from '../types';
import { 
  Heart, 
  Share2, 
  Play, 
  Pause, 
  Sparkles, 
  TrendingUp, 
  Volume2, 
  Layers, 
  ArrowUpRight,
  Filter,
  Check,
  Copy
} from 'lucide-react';
import { playClickSound, playSuccessSound, triggerConfetti } from '../utils/audio';

export const CreativesShowcase: React.FC = () => {
  const [activePlayingId, setActivePlayingId] = useState<string | null>(CREATIVE_SHOWCASE[0].id);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const togglePlay = (id: string) => {
    playClickSound();
    setActivePlayingId(activePlayingId === id ? null : id);
  };

  const handleLike = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playClickSound();
    setLikedMap((prev) => ({ ...prev, [id]: !prev[id] }));
    if (!likedMap[id]) {
      triggerConfetti();
    }
  };

  const handleCopyHook = (id: string, hook: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playSuccessSound();
    navigator.clipboard.writeText(hook);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <section id="creatives-showcase" className="py-20 md:py-28 border-t border-zinc-800 relative bg-black text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl mb-12">
          <p className="text-xs uppercase tracking-widest text-yellow-400 font-bold mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Autonomous Creative Stream
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight [text-wrap:balance]">
            Creatives generated, optimized, and posted on autopilot
          </h2>
          <p className="mt-3 text-zinc-400 text-sm sm:text-base">
            Every creative below was autonomously synthesized by LOVIZA from brand profile assets, published programmatically, and iteratively enhanced by our Auto-Learn engine.
          </p>
        </div>

        {/* Creatives Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {CREATIVE_SHOWCASE.map((creative) => {
            const isPlaying = activePlayingId === creative.id;
            const isLiked = likedMap[creative.id];
            const isCopied = copiedId === creative.id;

            return (
              <div
                key={creative.id}
                onClick={() => togglePlay(creative.id)}
                className="bg-zinc-950 border border-zinc-800 hover:border-yellow-400/50 rounded-3xl overflow-hidden flex flex-col justify-between transition-all duration-300 hover:-translate-y-1.5 shadow-xl shadow-black/80 group cursor-pointer"
              >
                {/* Visual Phone-Style Canvas */}
                <div className="relative aspect-[9/15] overflow-hidden bg-black">
                  <img
                    src={creative.imageUrl}
                    alt={creative.title}
                    className={`w-full h-full object-cover transition-transform duration-700 ${
                      isPlaying ? 'scale-105' : 'group-hover:scale-105'
                    }`}
                    referrerPolicy="no-referrer"
                  />
                  
                  {/* Subtle Gradient Scrim */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/50 pointer-events-none" />

                  {/* Top Bar with Format & Platform Badges */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-black/80 backdrop-blur-md text-[10px] text-zinc-200 border border-zinc-700 font-bold uppercase tracking-wider">
                      {creative.format}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full bg-yellow-400 text-black font-extrabold text-[10px] uppercase">
                        {creative.views} Views
                      </span>
                    </div>
                  </div>

                  {/* Right Floating Actions (TikTok/Reels Simulation) */}
                  <div className="absolute right-3 bottom-24 flex flex-col items-center gap-3 text-white z-10">
                    <button
                      onClick={(e) => handleLike(creative.id, e)}
                      className="flex flex-col items-center gap-0.5 group/btn cursor-pointer"
                    >
                      <div className={`w-9 h-9 rounded-full bg-black/60 backdrop-blur-md border border-zinc-700 flex items-center justify-center transition-transform active:scale-125 ${
                        isLiked ? 'text-yellow-400 border-yellow-400' : 'text-zinc-200 hover:text-white'
                      }`}>
                        <Heart className={`w-4 h-4 ${isLiked ? 'fill-yellow-400 stroke-yellow-400' : ''}`} />
                      </div>
                      <span className="text-[10px] font-mono font-bold text-zinc-300">{creative.likes}</span>
                    </button>

                    <button
                      onClick={(e) => handleCopyHook(creative.id, creative.hookText, e)}
                      className="flex flex-col items-center gap-0.5 group/btn cursor-pointer"
                      title="Copy Hook"
                    >
                      <div className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-md border border-zinc-700 flex items-center justify-center text-zinc-200 hover:text-yellow-400 transition-colors">
                        {isCopied ? <Check className="w-4 h-4 text-yellow-400 stroke-[3]" /> : <Copy className="w-4 h-4" />}
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400">{isCopied ? 'Copied' : 'Hook'}</span>
                    </button>
                  </div>

                  {/* Center Play Button Overlay */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                    <div className={`w-12 h-12 rounded-full bg-yellow-400/30 backdrop-blur-md border border-yellow-400/50 flex items-center justify-center transition-transform ${
                      isPlaying ? 'opacity-0 scale-75' : 'opacity-100 scale-100'
                    }`}>
                      <Play className="w-5 h-5 fill-yellow-400 text-yellow-400 translate-x-0.5" />
                    </div>
                  </div>

                  {/* Bottom Video Overlays */}
                  <div className="absolute bottom-3 left-3 right-14 space-y-1.5 text-left">
                    <div className="text-[10px] font-bold text-yellow-400 font-mono">
                      @{creative.brand.toLowerCase().replace(/\s+/g, '')} · Autopilot
                    </div>
                    <p className="text-xs font-bold text-white leading-snug drop-shadow-md">
                      {creative.hookText}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-300 font-mono">
                      <Volume2 className="w-3 h-3 text-yellow-400 shrink-0" />
                      <span className="truncate">{creative.audioTrack}</span>
                    </div>
                  </div>
                </div>

                {/* Card Bottom: Auto-Learned Optimization Breakdown */}
                <div className="p-4 bg-zinc-900 border-t border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-white">{creative.brand}</span>
                    <span className="text-zinc-500 font-mono">{creative.category}</span>
                  </div>
                  
                  <div className="p-2.5 rounded-xl bg-black border border-zinc-800 space-y-1">
                    <div className="text-[9px] uppercase tracking-wider font-extrabold text-yellow-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Auto-Learned Viral Optimization
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-snug">
                      {creative.autoLearnedOptimization}
                    </p>
                  </div>
                </div>

              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
