import React from 'react';
import { CASE_STUDIES } from '../data/mockData';
import { ArrowUpRight, Play, Quote, Zap, ShieldCheck } from 'lucide-react';
import { playClickSound } from '../utils/audio';

interface VideoShowcaseProps {
  onOpenDemo: () => void;
}

export const VideoShowcase: React.FC<VideoShowcaseProps> = ({ onOpenDemo }) => {
  return (
    <section id="wall-of-proof" className="py-20 md:py-28 border-t border-zinc-800 relative bg-black text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <p className="text-xs uppercase tracking-widest text-yellow-400 font-bold mb-2 flex items-center justify-center gap-1.5">
            <Zap className="w-3.5 h-3.5 fill-yellow-400" />
            Exponential Proof · Zero Human Daily Work
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight [text-wrap:balance]">
            What happens when brands put marketing on complete autopilot
          </h2>
          <p className="mt-4 text-zinc-400 text-sm sm:text-base leading-relaxed">
            These brand owners configured their Brand Profile DNA once in under 8 minutes. LOVIZA handled creative production, multi-platform publishing, and strategy refinement completely hands-off.
          </p>
        </div>

        {/* Case Studies Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {CASE_STUDIES.map((study) => (
            <div
              key={study.id}
              className="bg-zinc-950 border border-zinc-800 hover:border-yellow-400/40 rounded-3xl p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1.5 shadow-xl shadow-black/80 group"
            >
              <div>
                {/* Brand & Metric Header */}
                <div className="flex items-center justify-between pb-4 border-b border-zinc-900">
                  <div>
                    <div className="text-base font-bold text-white">{study.brand}</div>
                    <div className="text-xs text-zinc-500 font-medium">{study.category}</div>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 font-bold">
                    {study.period}
                  </span>
                </div>

                {/* Big Stat Box */}
                <div className="my-5 p-4 rounded-2xl bg-black border border-zinc-800 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">Total Organic Reach</div>
                    <div className="text-2xl font-black text-white font-mono mt-0.5">{study.views}</div>
                    <div className="text-xs font-bold text-yellow-400 font-mono mt-1">{study.conversions}</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-yellow-400">
                    <ArrowUpRight className="w-5 h-5 stroke-[2.5]" />
                  </div>
                </div>

                {/* Persona & Winning Hook Used */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <img
                      src={study.personaImg}
                      alt={study.influencerName}
                      className="w-9 h-9 rounded-full object-cover border border-zinc-700"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">{study.influencerName}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">Autonomous AI Persona</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 italic leading-snug">
                    {study.hookUsed}
                  </div>
                </div>

                {/* Quote */}
                <p className="mt-4 text-xs text-zinc-400 leading-relaxed">
                  &ldquo;{study.quote}&rdquo;
                </p>
              </div>

              {/* Card Action */}
              <div className="pt-5 mt-5 border-t border-zinc-900">
                <button
                  onClick={() => {
                    playClickSound();
                    onOpenDemo();
                  }}
                  className="w-full py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                  <span>Inspect Growth Telemetry</span>
                </button>
              </div>

            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
