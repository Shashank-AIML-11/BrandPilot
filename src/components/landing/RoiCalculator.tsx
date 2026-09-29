import React, { useState } from 'react';
import { Calculator, TrendingUp, DollarSign, Clock, Zap, CheckCircle2 } from 'lucide-react';
import { playClickSound } from '../utils/audio';

export const RoiCalculator: React.FC = () => {
  const [creativesPerMonth, setCreativesPerMonth] = useState(60);
  const [currentAgencySpend, setCurrentAgencySpend] = useState(3500);

  const traditionalCost = currentAgencySpend;
  const lovizaCost = creativesPerMonth <= 60 ? 79 : creativesPerMonth <= 180 ? 199 : 499;
  const monthlySavings = traditionalCost - lovizaCost;
  const hoursReclaimed = Math.round(creativesPerMonth * 3.2); // ~3.2 hours per script, shoot, edit, and post manually
  const projectedReach = Math.round(creativesPerMonth * 22500).toLocaleString();

  return (
    <section className="py-20 md:py-28 border-t border-zinc-800 relative bg-black text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <p className="text-xs uppercase tracking-widest text-yellow-400 font-bold mb-2 flex items-center justify-center gap-1.5">
            <Calculator className="w-3.5 h-3.5" />
            Autopilot Efficiency & ROI Calculator
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight [text-wrap:balance]">
            How much time & capital does LOVIZA Autopilot save you?
          </h2>
          <p className="mt-4 text-zinc-400 text-sm sm:text-base leading-relaxed">
            Eliminate agency retainers, creator flakes, and 30+ hours of weekly filming. See your exact monthly savings and compound reach on 100% autopilot.
          </p>
        </div>

        {/* Calculator Container */}
        <div className="max-w-4xl mx-auto bg-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-black/80 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          
          {/* Left Inputs (7 cols) */}
          <div className="md:col-span-7 space-y-8">
            
            {/* Slider 1: Creatives per month */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-white">Target Monthly Autonomous Creatives</span>
                <span className="font-mono text-yellow-400 font-bold text-base px-2.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                  {creativesPerMonth} Creatives / mo
                </span>
              </div>
              <input
                type="range"
                min="30"
                max="240"
                step="15"
                value={creativesPerMonth}
                onChange={(e) => {
                  playClickSound();
                  setCreativesPerMonth(Number(e.target.value));
                }}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-yellow-400"
              />
              <div className="flex justify-between text-[11px] text-zinc-500 font-mono">
                <span>30 / mo (1 post/day)</span>
                <span>90 / mo (3 posts/day)</span>
                <span>240 / mo (8 posts/day)</span>
              </div>
            </div>

            {/* Slider 2: Current Agency or Freelancer spend */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-white">Current Agency / Creator Spend</span>
                <span className="font-mono text-yellow-400 font-bold text-base px-2.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                  ${currentAgencySpend.toLocaleString()} / month
                </span>
              </div>
              <input
                type="range"
                min="1000"
                max="15000"
                step="500"
                value={currentAgencySpend}
                onChange={(e) => {
                  playClickSound();
                  setCurrentAgencySpend(Number(e.target.value));
                }}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-yellow-400"
              />
              <div className="flex justify-between text-[11px] text-zinc-500 font-mono">
                <span>$1,000 (Freelancer)</span>
                <span>$4,000 (Agency Retainer)</span>
                <span>$15,000 (In-House Video Team)</span>
              </div>
            </div>

            {/* Reclaimed metrics */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-900 text-xs">
              <div className="p-3.5 rounded-xl bg-black border border-zinc-800 space-y-1">
                <span className="text-zinc-400 flex items-center gap-1 font-medium">
                  <Clock className="w-3.5 h-3.5 text-yellow-400" />
                  Founder Hours Reclaimed
                </span>
                <span className="text-xl font-extrabold text-white font-mono">{hoursReclaimed} Hours / mo</span>
                <div className="text-[10px] text-zinc-500">Zero filming or editing meetings</div>
              </div>

              <div className="p-3.5 rounded-xl bg-black border border-zinc-800 space-y-1">
                <span className="text-zinc-400 flex items-center gap-1 font-medium">
                  <TrendingUp className="w-3.5 h-3.5 text-yellow-400" />
                  Estimated Monthly Reach
                </span>
                <span className="text-xl font-extrabold text-yellow-400 font-mono">~{projectedReach} Views</span>
                <div className="text-[10px] text-zinc-500">Autonomous multi-channel distribution</div>
              </div>
            </div>

          </div>

          {/* Right Summary Card (5 cols) */}
          <div className="md:col-span-5 bg-black border border-zinc-800 p-6 rounded-2xl flex flex-col justify-between space-y-6 text-center">
            <div className="space-y-3">
              <span className="text-[11px] uppercase tracking-wider font-extrabold text-zinc-400">
                Monthly Net Capital Reclaimed
              </span>
              <div className="text-4xl sm:text-5xl font-black text-yellow-400 font-mono">
                ${monthlySavings > 0 ? monthlySavings.toLocaleString() : 0}
              </div>
              <p className="text-xs text-zinc-400 leading-snug">
                Annualized bottom-line savings of{' '}
                <strong className="text-white font-mono">
                  ${Math.max(0, monthlySavings * 12).toLocaleString()}
                </strong>{' '}
                while multiplying organic video volume by{' '}
                <span className="text-yellow-400 font-bold font-mono">
                  {(creativesPerMonth / 12).toFixed(1)}x
                </span>.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1 text-left text-xs">
              <div className="flex items-center gap-1.5 text-white font-bold">
                <CheckCircle2 className="w-4 h-4 text-yellow-400" />
                <span>What LOVIZA Replaces:</span>
              </div>
              <ul className="text-zinc-400 text-[11px] space-y-1 pl-5 list-disc">
                <li>Scriptwriters and prompt engineers</li>
                <li>UGC creator outreach and contracts</li>
                <li>Manual video editing software</li>
                <li>Social media scheduling dashboards</li>
              </ul>
            </div>

            <a
              href="#brand-vault"
              className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-yellow-400/20"
            >
              Start Autonomous Scaling
            </a>
          </div>

        </div>

      </div>
    </section>
  );
};
