import React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, PLANS } from "@/lib/plans";
import { playClickSound } from "./audio";

/**
 * Landing-page pricing section.
 *
 * Plans, prices (INR) and feature lists come from the single source of truth
 * in src/lib/plans.ts - the same data that drives /pricing, /checkout and the
 * Razorpay plans - so the landing page can never drift from what is billed.
 */
export const PricingSection: React.FC = () => {
  const { data: session } = useQuery({
    queryKey: ["session-check"],
    queryFn: async () => (await supabase.auth.getSession()).data.session,
  });

  return (
    <section
      id="pricing"
      className="py-20 md:py-28 border-t border-zinc-800 relative bg-black text-zinc-100"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight [text-wrap:balance]">
            Pick your plan
          </h2>
          <p className="mt-4 text-zinc-400 text-sm sm:text-base leading-relaxed">
            Upgrade or downgrade at any time.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {PLANS.map((plan) => {
            const isPopular = Boolean(plan.highlight);

            return (
              <div
                key={plan.id}
                className={`rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 relative ${
                  isPopular
                    ? "bg-zinc-900 border-2 border-yellow-400 shadow-2xl shadow-yellow-400/10 md:-translate-y-2"
                    : "bg-zinc-950 border border-zinc-800 hover:border-zinc-700"
                }`}
              >
                {/* Popular Pill Label */}
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-yellow-400 text-black text-[11px] font-black uppercase tracking-wider shadow-md">
                    Most popular
                  </div>
                )}

                <div>
                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                  <p className="mt-1 text-sm text-zinc-400 min-h-[40px] leading-relaxed">
                    {plan.tagline}
                  </p>

                  {/* Price */}
                  <div className="my-6 pb-6 border-b border-zinc-800 flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white">
                      {formatINR(plan.priceMonthly)}
                    </span>
                    <span className="text-sm text-zinc-500">/month</span>
                  </div>

                  {/* Features List */}
                  <ul className="space-y-3 mb-8 text-sm text-zinc-300">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* CTA: signed-in users go straight to checkout, others sign in first */}
                {session ? (
                  <Link
                    to="/checkout"
                    search={{ plan: plan.id }}
                    onClick={playClickSound}
                    className={`w-full py-3.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-95 ${
                      isPopular
                        ? "bg-yellow-400 hover:bg-yellow-300 text-black shadow-yellow-400/25"
                        : "bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700"
                    }`}
                  >
                    <span>Choose {plan.name}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <Link
                    to="/auth"
                    search={{ redirect: "/pricing" }}
                    onClick={playClickSound}
                    className={`w-full py-3.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-95 ${
                      isPopular
                        ? "bg-yellow-400 hover:bg-yellow-300 text-black shadow-yellow-400/25"
                        : "bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700"
                    }`}
                  >
                    <span>Choose {plan.name}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
