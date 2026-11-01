import React from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, CheckCircle2, Cpu } from 'lucide-react';
import { playClickSound } from './audio';

// The CTA now routes straight to the sign-in page, so this callback is no
// longer used here. It stays optional so the existing <CtaSection ... /> usage
// in routes/index.tsx keeps compiling unchanged.
interface CtaSectionProps {
  onStartWithUrl?: (url: string) => void;
}

export const CtaSection: React.FC<CtaSectionProps> = () => {
  return (
    <section className="py-20 md:py-28 relative bg-black border-t border-zinc-800 overflow-hidden text-zinc-100">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[750px] h-[380px] bg-yellow-400/10 blur-[150px] pointer-events-none rounded-full" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="rounded-3xl bg-zinc-950 border border-zinc-800 p-8 sm:p-12 md:p-16 text-center shadow-2xl shadow-black/80">
          
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-yellow-400 text-xs font-semibold mb-6">
            <Cpu className="w-3.5 h-3.5 text-yellow-400" />
            <span>Autonomous Brand Scaling · Zero Creative Burnout</span>
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight [text-wrap:balance] max-w-2xl mx-auto">
            Ready to let LOVIZA scale your brand virality forever?
          </h2>

          <p className="mt-4 text-zinc-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            Activate your Brand Profile Vault. LOVIZA will auto-generate, auto-post, and auto-learn continuously on 100% autopilot.
          </p>

          {/* Primary CTA: same button as the navbar, routes to the LOVIZA sign-in page */}
          <div className="mt-8 flex justify-center">
            <Link
              to="/auth"
              onClick={() => playClickSound()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-black bg-yellow-400 hover:bg-yellow-300 rounded-lg shadow-md shadow-yellow-500/25 hover:shadow-yellow-500/40 transition-all duration-150 whitespace-nowrap active:scale-[0.98] cursor-pointer"
            >
              Activate Brand Autopilot
              <ArrowRight className="w-3.5 h-3.5 text-black stroke-[3]" />
            </Link>
          </div>

          {/* Guarantee markers */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" /> No credit card required to build profile
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" /> Instant brand DNA extraction
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" /> 14-day free autopilot trial
            </span>
          </div>

        </div>
      </div>
    </section>
  );
};
