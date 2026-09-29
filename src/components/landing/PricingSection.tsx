import React, { useState } from 'react';
import { PRICING_PLANS } from '../data/mockData';
import { PricingPlan } from '../types';
import { Check, ArrowRight, Zap, ShieldCheck } from 'lucide-react';
import { playClickSound, playSuccessSound, triggerConfetti } from '../utils/audio';

interface PricingSectionProps {
  onSelectPlan: (plan: PricingPlan, isAnnual: boolean) => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({ onSelectPlan }) => {
  const [isAnnual, setIsAnnual] = useState(true);

  return (
    <section id="pricing" className="py-20 md:py-28 border-t border-zinc-800 relative bg-black text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <p className="text-xs uppercase tracking-widest text-yellow-400 font-bold mb-2 flex items-center justify-center gap-1.5">
            <Zap className="w-3.5 h-3.5 fill-yellow-400" />
            Simple Autopilot Subscription
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight [text-wrap:balance]">
            Predictable investment. Exponential organic growth.
          </h2>
          <p className="mt-4 text-zinc-400 text-sm sm:text-base leading-relaxed">
            Replace entire agency retainers with a continuous self-learning machine that works 24/7/365. Cancel or upgrade anytime.
          </p>

          {/* Annual Toggle */}
          <div className="mt-8 inline-flex items-center gap-3 p-1.5 rounded-xl bg-zinc-950 border border-zinc-800">
            <button
              onClick={() => {
                playClickSound();
                setIsAnnual(false);
              }}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                !isAnnual ? 'bg-yellow-400 text-black shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => {
                playClickSound();
                setIsAnnual(true);
              }}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
                isAnnual ? 'bg-yellow-400 text-black shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span>Annual Billing</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-black text-yellow-400 border border-zinc-800">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {PRICING_PLANS.map((plan) => {
            const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
            const isPopular = plan.popular;

            return (
              <div
                key={plan.id}
                className={`rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 relative ${
                  isPopular
                    ? 'bg-zinc-900 border-2 border-yellow-400 shadow-2xl shadow-yellow-400/10 md:-translate-y-2'
                    : 'bg-zinc-950 border border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* Popular Pill Label */}
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-yellow-400 text-black text-[11px] font-black uppercase tracking-wider shadow-md">
                    Most Popular
                  </div>
                )}

                <div>
                  <div className="flex justify-between items-baseline mb-2">
                    <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                  </div>
                  <p className="text-xs text-zinc-400 min-h-[36px] leading-relaxed">{plan.description}</p>

                  {/* Price */}
                  <div className="my-6 pb-6 border-b border-zinc-800 flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white font-mono">${price}</span>
                    <span className="text-xs text-zinc-500">/ month</span>
                    {isAnnual && (
                      <span className="text-[11px] text-yellow-400 ml-2 font-mono font-semibold">billed yearly</span>
                    )}
                  </div>

                  {/* Features List */}
                  <div className="space-y-3 mb-8 text-xs text-zinc-300">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">
                      Included in Autopilot:
                    </div>
                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => {
                    playSuccessSound();
                    triggerConfetti();
                    onSelectPlan(plan, isAnnual);
                  }}
                  className={`w-full py-3.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-95 ${
                    isPopular
                      ? 'bg-yellow-400 hover:bg-yellow-300 text-black shadow-yellow-400/25'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'
                  }`}
                >
                  <span>Launch 14-Day Free Trial</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
