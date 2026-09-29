import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  Image as ImageIcon, 
  Video, 
  Sparkles, 
  CheckCircle2, 
  ShieldCheck, 
  Layers, 
  ArrowRight,
  Cpu
} from 'lucide-react';
import { PRESET_BRAND_PROFILES } from '../data/mockData';
import { BrandProfileState } from '../types';

interface BrandProfileBuilderProps {
  onAutopilotActivated?: () => void;
}

export const BrandProfileBuilder: React.FC<BrandProfileBuilderProps> = () => {
  // Use CyberShield Gear as showcase preset matching the preview
  const [profile] = useState<BrandProfileState>(PRESET_BRAND_PROFILES[3] || PRESET_BRAND_PROFILES[0]);
  const [activeTab, setActiveTab] = useState<'assets' | 'icp' | 'words' | 'tone'>('assets');

  // Automatically cycle through the 4 DNA tabs so it lives completely hands-free on autopilot
  useEffect(() => {
    const tabs: ('assets' | 'icp' | 'words' | 'tone')[] = ['assets', 'icp', 'words', 'tone'];
    const interval = setInterval(() => {
      setActiveTab((prev) => {
        const nextIndex = (tabs.indexOf(prev) + 1) % tabs.length;
        return tabs[nextIndex];
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="brand-vault" className="py-20 md:py-28 border-t border-zinc-800 relative bg-black overflow-hidden text-zinc-100">
      
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-[600px] h-[500px] bg-yellow-400/5 blur-[150px] pointer-events-none rounded-full" />
      <div className="absolute -bottom-10 left-10 w-96 h-96 bg-zinc-800/30 blur-[130px] pointer-events-none rounded-full" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <p className="text-xs uppercase tracking-widest text-yellow-400 font-bold mb-2 flex items-center justify-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            Step 1 · The Brand Profile DNA Vault
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight [text-wrap:balance]">
            Configure once. LOVIZA scales your virality forever.
          </h2>
          <p className="mt-4 text-zinc-400 text-sm sm:text-base leading-relaxed">
            Feed your website URL, product photos, raw video clips, target ICP, focus words, and brand tone into the Vault. You never need to worry about virality or daily content generation ever again—LOVIZA takes over end-to-end to elevate your brand and drive exponential organic growth.
          </p>
        </div>

        {/* Display Only - Non-Clickable Container */}
        <div className="pointer-events-none select-none">
          
          {/* Preset Selector Badges (Display Only) */}
          <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
            <span className="text-xs text-zinc-400 mr-2 font-medium">Select Industry Profile:</span>
            {PRESET_BRAND_PROFILES.map((preset, idx) => (
              <div
                key={idx}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  profile.brandName === preset.brandName
                    ? 'bg-yellow-400 text-black font-bold shadow-md shadow-yellow-400/20'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}
              >
                {preset.brandName} ({preset.industry})
              </div>
            ))}
          </div>

          {/* The Vault Console */}
          <div className="max-w-6xl mx-auto bg-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Column: DNA Configurator Preview (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Tab Navigation Badges */}
              <div className="flex items-center gap-1.5 p-1 bg-black rounded-xl border border-zinc-800 overflow-x-auto text-xs">
                {(['assets', 'icp', 'words', 'tone'] as const).map((tab) => (
                  <div
                    key={tab}
                    className={`px-3 py-2 rounded-lg font-bold whitespace-nowrap transition-colors ${
                      activeTab === tab ? 'bg-yellow-400 text-black shadow-sm' : 'text-zinc-500'
                    }`}
                  >
                    {tab === 'assets' && '1. Assets & Website'}
                    {tab === 'icp' && '2. Target ICP'}
                    {tab === 'words' && '3. Focus & Banned Words'}
                    {tab === 'tone' && '4. Voice Tone & Style'}
                  </div>
                ))}
              </div>

              {/* Tab Content 1: Assets & Website */}
              {activeTab === 'assets' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="space-y-1.5">
                    <span className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Website or E-Commerce Store URL
                    </span>
                    <div className="relative flex items-center w-full pl-10 pr-4 py-2.5 bg-black border border-zinc-800 rounded-xl text-white text-xs font-mono">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-400">
                        <Globe className="w-4 h-4 text-yellow-400" />
                      </div>
                      <span>{profile.websiteUrl}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
                      <div className="flex items-center justify-between text-zinc-400">
                        <span className="flex items-center gap-1.5 text-zinc-300 font-semibold">
                          <ImageIcon className="w-3.5 h-3.5 text-yellow-400" />
                          Photos & Renders Ingested
                        </span>
                        <span className="text-yellow-400 font-mono font-bold">40</span>
                      </div>
                      <div className="text-[11px] text-zinc-500">Product photos, packaging, lifestyle shots, 3D renders</div>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
                      <div className="flex items-center justify-between text-zinc-400">
                        <span className="flex items-center gap-1.5 text-zinc-300 font-semibold">
                          <Video className="w-3.5 h-3.5 text-yellow-400" />
                          B-Roll Video Clips Ingested
                        </span>
                        <span className="text-yellow-400 font-mono font-bold">14</span>
                      </div>
                      <div className="text-[11px] text-zinc-500">Unboxings, texture zooms, founder recordings, screen captures</div>
                    </div>
                  </div>

                  {/* Visual Asset Ingestion Preview Grid */}
                  <div className="p-3 rounded-2xl bg-black border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400 font-medium">Brand Assets Uploaded to Vault:</span>
                      <span className="text-[11px] font-mono text-yellow-400">Catalog Feed: Connected</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="aspect-video rounded-lg overflow-hidden border border-zinc-800 relative">
                        <img src="/src/assets/images/loviza_brand_dna_onboarding_1790441385216.jpg" alt="Brand Kit" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <span className="text-[9px] bg-black/80 px-1 py-0.5 rounded text-zinc-300 font-mono">Brand Kit</span>
                        </div>
                      </div>
                      <div className="aspect-video rounded-lg overflow-hidden border border-zinc-800 relative">
                        <img src="/src/assets/images/loviza_brand_dna_vault_1790440762288.jpg" alt="DNA Store" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <span className="text-[9px] bg-black/80 px-1 py-0.5 rounded text-zinc-300 font-mono">DNA Store</span>
                        </div>
                      </div>
                      <div className="aspect-video rounded-lg overflow-hidden border border-zinc-800 relative">
                        <img src="/src/assets/images/loviza_viral_gadget_creative_1790441361917.jpg" alt="Product B-Roll" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <span className="text-[9px] bg-black/80 px-1 py-0.5 rounded text-zinc-300 font-mono">Product B-Roll</span>
                        </div>
                      </div>
                      <div className="aspect-video rounded-lg overflow-hidden border border-zinc-800 relative">
                        <img src="/src/assets/images/loviza_viral_fashion_dtc_1790440795970.jpg" alt="Lifestyle Reel" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <span className="text-[9px] bg-black/80 px-1 py-0.5 rounded text-zinc-300 font-mono">Lifestyle</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-yellow-400/10 border border-yellow-400/30 text-xs text-yellow-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-yellow-400 shrink-0" />
                    <span>LOVIZA auto-extracted brand colors, value propositions, and product specs into the Vault.</span>
                  </div>
                </div>
              )}

              {/* Tab Content 2: Target ICP */}
              {activeTab === 'icp' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="space-y-1.5">
                    <span className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Ideal Customer Persona (ICP)
                    </span>
                    <div className="w-full px-4 py-2.5 bg-black border border-zinc-800 rounded-xl text-white text-xs font-medium">
                      {profile.targetIcp.personaTitle}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Core Pain Point to Agitate in Hooks
                    </span>
                    <div className="w-full px-4 py-2.5 bg-black border border-zinc-800 rounded-xl text-white text-xs leading-relaxed">
                      {profile.targetIcp.primaryPainPoint}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Dream Transformation / Payoff
                    </span>
                    <div className="w-full px-4 py-2.5 bg-black border border-zinc-800 rounded-xl text-white text-xs">
                      {profile.targetIcp.dreamOutcome}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab Content 3: Focus & Banned Words */}
              {activeTab === 'words' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="space-y-2">
                    <span className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Focus Words & Viral Triggers (Ingested into Engine)
                    </span>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {profile.focusWords.map((word) => (
                        <span
                          key={word}
                          className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-yellow-400 text-xs font-mono"
                        >
                          #{word}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-zinc-900">
                    <span className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Banned Words (LOVIZA Never Says These)
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.bannedWords.map((banned, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-lg bg-zinc-900/60 border border-zinc-800 text-zinc-500 text-xs font-mono line-through"
                        >
                          {banned}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab Content 4: Voice Tone & Style */}
              {activeTab === 'tone' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <span className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Brand Voice Archetype
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {['Minimalist Luxury', 'High-Energy Gen-Z', 'Authoritative & Calm', 'Cyberpunk Minimalist'].map((toneOption) => (
                      <div
                        key={toneOption}
                        className={`p-3 rounded-xl border text-left font-semibold transition-all ${
                          profile.brandTone === toneOption
                            ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400 font-bold'
                            : 'border-zinc-800 bg-black text-zinc-500'
                        }`}
                      >
                        {toneOption}
                      </div>
                    ))}
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
                    <div className="font-bold text-white mb-1">Tone Lock Guarantee:</div>
                    LOVIZA injects this vocal cadence into all AI creators, background audio selection, dynamic subtitles, and video pacing.
                  </div>
                </div>
              )}

            </div>

            {/* Right Column: Autopilot Readiness & Lock Terminal (5 cols) */}
            <div className="lg:col-span-5 rounded-2xl bg-black border border-zinc-800 p-6 flex flex-col justify-between space-y-6">
              
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-900">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-white">DNA Vault Readiness</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-400/20">
                    99% Complete
                  </span>
                </div>

                {/* Readiness Progress Bar */}
                <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-yellow-400 h-full rounded-full transition-all duration-700 w-[99%]" 
                  />
                </div>

                {/* DNA Attributes Checklist */}
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between text-zinc-300 py-1 border-b border-zinc-900">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" /> Website & Store Ingested
                    </span>
                    <span className="font-mono text-zinc-400 font-semibold">Active</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-300 py-1 border-b border-zinc-900">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" /> ICP & Psychological Triggers
                    </span>
                    <span className="font-mono text-zinc-400 font-semibold">Locked</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-300 py-1 border-b border-zinc-900">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" /> Focus Words Library
                    </span>
                    <span className="font-mono text-zinc-400 font-semibold">6 Words</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-300 py-1 border-b border-zinc-900">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" /> Voice Cadence & Banlist
                    </span>
                    <span className="font-mono text-zinc-400 font-semibold">{profile.brandTone}</span>
                  </div>
                </div>

                {/* Zero Worry Promise Banner */}
                <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-yellow-400">
                    <ShieldCheck className="w-4 h-4 text-yellow-400" />
                    <span>The LOVIZA Autopilot Promise</span>
                  </div>
                  <p className="text-zinc-400 text-[11px] leading-relaxed">
                    Once your Brand Profile is locked, you never need to worry about virality ever again. LOVIZA autonomously produces, distributes, analyzes, and adapts your marketing strategy indefinitely.
                  </p>
                </div>
              </div>

              {/* Autopilot Status Display (Display Only - Non-Clickable) */}
              <div>
                <div className="w-full py-4 px-6 bg-yellow-400 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-yellow-400/25 flex items-center justify-center gap-2 whitespace-nowrap">
                  <span>Activate 100% Autopilot</span>
                  <ArrowRight className="w-4 h-4 text-black stroke-[3]" />
                </div>
                <p className="text-[10px] text-center text-zinc-500 mt-2 font-mono">
                  LOVIZA will immediately initiate Cycle #1 creative synthesis
                </p>
              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
