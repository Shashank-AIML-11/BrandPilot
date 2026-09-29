import React, { useState } from 'react';
import { X, Check, ShieldCheck, Zap, ArrowRight, Cpu } from 'lucide-react';
import { PricingPlan } from '../types';
import { playClickSound, playSuccessSound, triggerConfetti } from '../utils/audio';

interface PlanModalProps {
  isOpen: boolean;
  plan: PricingPlan | null;
  isAnnual: boolean;
  onClose: () => void;
}

export const PlanModal: React.FC<PlanModalProps> = ({ isOpen, plan, isAnnual, onClose }) => {
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isOpen || !plan) return null;

  const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    playSuccessSound();
    triggerConfetti();
    setIsSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl shadow-yellow-400/5 text-zinc-100">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <span className="text-sm font-extrabold text-white">Start 14-Day Free Autopilot Trial</span>
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

        {isSubmitted ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-yellow-400/10 border border-yellow-400/40 text-yellow-400 flex items-center justify-center mx-auto">
              <Check className="w-7 h-7 stroke-[3]" />
            </div>
            <h3 className="text-xl font-bold text-white">Your LOVIZA Workspace is Ready!</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
              We&apos;ve sent your activation link to <strong className="text-white">{email}</strong>. LOVIZA is already scraping <strong className="text-yellow-400">{website || 'your brand'}</strong> to prepare your first autonomous video batch.
            </p>
            <button
              onClick={() => {
                playClickSound();
                setIsSubmitted(false);
                onClose();
              }}
              className="mt-4 px-6 py-3 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md shadow-yellow-400/20"
            >
              Enter LOVIZA Dashboard
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Selected Plan Summary */}
            <div className="p-4 rounded-2xl bg-black border border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Selected Autopilot Tier</span>
                <div className="text-base font-bold text-white">{plan.name}</div>
                <div className="text-[11px] text-yellow-400 font-mono">
                  ${price}/month {isAnnual ? '(Billed Annually · 20% off)' : '(Monthly)'}
                </div>
              </div>
              <div className="text-right">
                <span className="px-2.5 py-1 rounded bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 text-xs font-bold font-mono">
                  14-Day Free
                </span>
              </div>
            </div>

            {/* Inputs */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Work Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="founder@yourbrand.com"
                  className="w-full px-4 py-2.5 bg-black border border-zinc-800 focus:border-yellow-400 rounded-xl text-white text-xs placeholder:text-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Brand or Store Website URL
                </label>
                <input
                  type="url"
                  required
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yourbrand.com"
                  className="w-full px-4 py-2.5 bg-black border border-zinc-800 focus:border-yellow-400 rounded-xl text-white text-xs placeholder:text-zinc-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Trial Guarantees */}
            <div className="space-y-1.5 text-xs text-zinc-400 pt-2 border-t border-zinc-900">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-yellow-400" />
                <span>Zero credit card required for 14-day setup</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-yellow-400" />
                <span>Immediate Brand Profile DNA extraction</span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-yellow-400/25 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <span>Activate 14-Day Free Autopilot</span>
              <ArrowRight className="w-4 h-4 text-black stroke-[3]" />
            </button>
          </form>
        )}

      </div>
    </div>
  );
};
