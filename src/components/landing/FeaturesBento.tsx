import React from 'react';
import { 
  Users, 
  TrendingUp, 
  Globe2, 
  CalendarClock, 
  BarChart3, 
  Sparkles, 
  CheckCircle2, 
  ArrowUpRight 
} from 'lucide-react';
import { playClickSound } from '../utils/audio';

export const FeaturesBento: React.FC = () => {
  return (
    <section className="py-20 md:py-28 border-t border-white/[0.08] relative bg-[#090a10]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl mb-14">
          <p className="text-xs uppercase tracking-widest text-indigo-400 font-semibold mb-2">
            Engine Architecture
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight [text-wrap:balance]">
            Built specifically for organic short-form algorithms
          </h2>
          <p className="mt-4 text-slate-300 text-sm sm:text-base leading-relaxed">
            Generic video editors make static corporate explainers that die at 200 views. LOVIZA reverse-engineers the exact mechanics that trigger algorithmic velocity.
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Bento Card 1 (Large - Col 8): Hyper-Realistic Influencers */}
          <div className="md:col-span-8 bg-[#10131f] border border-white/10 rounded-2xl p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden group">
            <div className="relative z-10 space-y-4 max-w-xl">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
                <Users className="w-4 h-4" />
                <span>01. Consistent Biometric Influencer Personas</span>
              </div>
              <h3 className="text-2xl font-bold text-white tracking-tight">
                No awkward robotic uncanny valley. Phone-camera authenticity.
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Choose from our pre-trained creator roster or clone your founder face. LOVIZA simulates natural breathing, micro-expressions, handheld camera jitter, and studio-grade voiceover cadence so viewers never swipe away.
              </p>
              
              <div className="pt-2 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-300">
                <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 space-y-1">
                  <div className="text-slate-400 text-[11px]">Face Consistency</div>
                  <div className="font-bold text-white font-mono">100% Locked</div>
                </div>
                <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 space-y-1">
                  <div className="text-slate-400 text-[11px]">Voice Warmth</div>
                  <div className="font-bold text-white font-mono">Studio Mic 48kHz</div>
                </div>
                <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 space-y-1 col-span-2 sm:col-span-1">
                  <div className="text-slate-400 text-[11px]">Product Placement</div>
                  <div className="font-bold text-white font-mono">In-Hand Physics</div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
              <span>Supports DTC physical products, mobile apps & desktop SaaS</span>
              <span className="text-indigo-400 font-semibold flex items-center gap-1">
                Explore Roster <ArrowUpRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          {/* Bento Card 2 (Col 4): Trend Remaster Engine */}
          <div className="md:col-span-4 bg-[#10131f] border border-white/10 rounded-2xl p-6 sm:p-8 flex flex-col justify-between relative group">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400">
                <TrendingUp className="w-4 h-4" />
                <span>02. Trend Remaster Engine</span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">
                Hijack today&apos;s spiking viral formats
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed">
                Our algorithm constantly indexes trending sounds, meme structures, and hook templates across TikTok and Instagram, automatically adapting them to your product niche.
              </p>

              <div className="p-3 rounded-xl bg-black/50 border border-white/5 space-y-2 text-xs">
                <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                  Trending Today (Spiking 420%)
                </div>
                <div className="text-slate-200 italic font-medium">
                  &ldquo;I tested 10 alternatives so you don&apos;t have to...&rdquo;
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Audio: 148,000 uses in last 24h
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 text-[11px] text-slate-400">
              Updated hourly based on TikTok FYP telemetry
            </div>
          </div>

          {/* Bento Card 3 (Col 4): Instant URL Extraction */}
          <div className="md:col-span-4 bg-[#10131f] border border-white/10 rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
                <Globe2 className="w-4 h-4" />
                <span>03. Zero-Effort Scraper</span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">
                No manual briefing or scriptwriting
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed">
                Provide your landing page URL. LOVIZA parses value propositions, target personas, customer objections, and feature lists to write natural scripts that convert.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 text-[11px] text-slate-400">
              Integrates with Shopify, Webflow, WordPress & Custom Apps
            </div>
          </div>

          {/* Bento Card 4 (Col 4): Direct Social Publishing */}
          <div className="md:col-span-4 bg-[#10131f] border border-white/10 rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <CalendarClock className="w-4 h-4" />
                <span>04. Auto-Publishing API</span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">
                Direct distribution to 4 platforms
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed">
                Connect your accounts once. Approved Blitz videos post automatically to TikTok, Instagram Reels, YouTube Shorts, and LinkedIn Video at peak audience hours.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 text-[11px] text-slate-400">
              Official TikTok Content Marketing & Meta Graph API partner
            </div>
          </div>

          {/* Bento Card 5 (Col 4): Revenue Attribution */}
          <div className="md:col-span-4 bg-[#10131f] border border-white/10 rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                <BarChart3 className="w-4 h-4" />
                <span>05. Real Revenue Tracking</span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">
                Track signups, not just vanity views
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed">
                Embed tracking links and bio pixels to understand which hooks drive paying users. LOVIZA automatically doubles down on scripts that bring real customers.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 text-[11px] text-slate-400">
              Direct UTM & First-Touch Attribution built-in
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
