import React, { useState } from 'react';
import { X, Play, Pause, Volume2, VolumeX, Sparkles, CheckCircle2, Cpu } from 'lucide-react';
import { playClickSound } from '../utils/audio';

interface DemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenVault: () => void;
}

export const DemoModal: React.FC<DemoModalProps> = ({ isOpen, onClose, onOpenVault }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [activeStep, setActiveStep] = useState(0);

  if (!isOpen) return null;

  const demoSteps = [
    { 
      title: 'Step 1: Ingest Brand Profile DNA', 
      desc: 'User inputs website URL, product photos, raw video clips, ICP, and focus keywords once. LOVIZA locks the brand DNA permanently.',
      image: '/src/assets/images/loviza_brand_dna_onboarding_1790441385216.jpg'
    },
    { 
      title: 'Step 2: Autonomous Auto-Generate', 
      desc: 'LOVIZA synthesizes 60+ multiformat video creatives, AI creator UGC, and kinetic hooks matching brand tone.',
      image: '/src/assets/images/loviza_viral_fashion_dtc_1790440795970.jpg'
    },
    { 
      title: 'Step 3: Programmatic Auto-Post', 
      desc: 'Direct omnichannel distribution across TikTok, Instagram Reels, and YouTube Shorts at dynamically computed peak FYP slots.',
      image: '/src/assets/images/loviza_viral_fitness_creative_1790441350420.jpg'
    },
    { 
      title: 'Step 4: Continuous Auto-Learn & Strategy', 
      desc: 'Feedback loop diagnoses second-by-second dropoffs, acoustic energy, and conversions to self-evolve your ongoing marketing strategy.',
      image: '/src/assets/images/loviza_strategy_intelligence_hub_1790441374391.jpg'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl shadow-yellow-400/5 text-zinc-100">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse"></span>
            <span className="text-sm font-extrabold text-white">LOVIZA Autonomous Walkthrough (60 Seconds)</span>
          </div>
          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Player Area */}
        <div className="p-6 space-y-6">
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-zinc-800 flex items-center justify-center group">
            <img
              src={demoSteps[activeStep].image}
              alt="LOVIZA Demo Walkthrough"
              className="w-full h-full object-cover opacity-80"
            />
            
            {/* Scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/40" />

            {/* Center Play Button Overlay */}
            <button
              onClick={() => {
                playClickSound();
                setIsPlaying(!isPlaying);
              }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-yellow-400 hover:bg-yellow-300 text-black flex items-center justify-center shadow-2xl transition-transform hover:scale-105 cursor-pointer"
            >
              {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current translate-x-0.5" />}
            </button>

            {/* Video Lower Third Title */}
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs text-white">
              <div className="space-y-0.5 max-w-md">
                <div className="font-extrabold text-yellow-400">{demoSteps[activeStep].title}</div>
                <div className="text-[11px] text-zinc-300 leading-tight">{demoSteps[activeStep].desc}</div>
              </div>
              <span className="font-mono bg-black/80 px-2.5 py-1 rounded border border-zinc-700 text-yellow-400 text-xs font-bold">
                0:{(activeStep + 1) * 15} / 1:00
              </span>
            </div>
          </div>

          {/* Interactive Step Navigator */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {demoSteps.map((step, idx) => (
              <button
                key={idx}
                onClick={() => {
                  playClickSound();
                  setActiveStep(idx);
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  activeStep === idx
                    ? 'border-yellow-400 bg-yellow-400/10 text-white'
                    : 'border-zinc-800 bg-black text-zinc-400 hover:text-white'
                }`}
              >
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-yellow-400">Step {idx + 1}</div>
                <div className="text-xs font-bold truncate mt-0.5">{step.title.split(':')[1] || step.title}</div>
              </button>
            ))}
          </div>

          {/* Bottom Action */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-zinc-800">
            <div className="text-xs text-zinc-400">
              Initial setup takes &lt; 8 minutes. Zero worry forever after.
            </div>
            <button
              onClick={() => {
                playClickSound();
                onClose();
                onOpenVault();
              }}
              className="w-full sm:w-auto px-5 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-yellow-400/20 cursor-pointer"
            >
              Build Your Brand DNA Vault
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
