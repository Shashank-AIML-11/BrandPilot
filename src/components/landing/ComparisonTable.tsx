import React from 'react';
import { Check, X } from 'lucide-react';

export const ComparisonTable: React.FC = () => {
  const comparisonRows = [
    {
      feature: 'Human intervention required',
      loviza: 'Zero (Set Brand Profile Once)',
      manualAi: 'Daily manual prompts & reviews',
      agency: 'Constant weekly approvals',
      inhouse: 'Daily filming & direction'
    },
    {
      feature: 'Auto-Generate Multi-format Creatives',
      loviza: true,
      manualAi: 'Partial (User must click)',
      agency: false,
      inhouse: false
    },
    {
      feature: 'Auto-Post at Dynamic Algorithmic Peaks',
      loviza: true,
      manualAi: false,
      agency: 'Manual scheduling delays',
      inhouse: 'Manual uploads'
    },
    {
      feature: 'Auto-Learn from Previous Video Telemetry',
      loviza: true,
      manualAi: false,
      agency: 'Monthly retrospective report',
      inhouse: 'Trial and error'
    },
    {
      feature: 'Auto-Builds Ongoing Marketing Strategy',
      loviza: true,
      manualAi: false,
      agency: '$5,000+ extra retainer',
      inhouse: false
    },
    {
      feature: 'Exponential Virality Feedback Loop',
      loviza: true,
      manualAi: false,
      agency: false,
      inhouse: false
    },
    {
      feature: 'Monthly Investment',
      loviza: 'From $63 / month',
      manualAi: '$79 – $199 / mo + your hours',
      agency: '$3,500 – $10,000 / mo',
      inhouse: '$6,000+ / mo salary'
    }
  ];

  return (
    <section className="py-20 md:py-28 border-t border-zinc-800 relative bg-black text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <p className="text-xs uppercase tracking-widest text-yellow-400 font-bold mb-2">
            Autopilot vs Old Manual Paradigms
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight [text-wrap:balance]">
            Why manual video tools are already obsolete
          </h2>
          <p className="mt-4 text-zinc-400 text-sm sm:text-base leading-relaxed">
            Other SaaS tools still force you to write prompts, select templates, and hit &ldquo;generate&rdquo; every single morning. LOVIZA is truly autonomous: you provide your brand DNA once, and it scales your organic virality forever.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="max-w-5xl mx-auto bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl shadow-black/80">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900">
                  <th className="py-4 px-6 text-sm font-bold text-white">Capabilities</th>
                  <th className="py-4 px-6 text-sm font-black text-yellow-400 bg-yellow-400/10 border-x border-yellow-400/30">
                    LOVIZA Autopilot
                  </th>
                  <th className="py-4 px-6 text-xs font-semibold text-zinc-400">Manual AI Tools (e.g. Fastlane)</th>
                  <th className="py-4 px-6 text-xs font-semibold text-zinc-400">Traditional Agency</th>
                  <th className="py-4 px-6 text-xs font-semibold text-zinc-400">In-House Creator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {comparisonRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="py-4 px-6 font-semibold text-zinc-200">
                      {row.feature}
                    </td>
                    
                    {/* LOVIZA Column */}
                    <td className="py-4 px-6 font-bold text-white bg-yellow-400/5 border-x border-yellow-400/20">
                      {typeof row.loviza === 'boolean' ? (
                        <div className="flex items-center gap-1.5 text-yellow-400">
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>100% Autonomous</span>
                        </div>
                      ) : (
                        <span className="text-yellow-400 font-bold">{row.loviza}</span>
                      )}
                    </td>

                    {/* Manual AI Tools Column */}
                    <td className="py-4 px-6 text-zinc-400">
                      {typeof row.manualAi === 'boolean' ? (
                        row.manualAi ? <Check className="w-4 h-4 text-zinc-500" /> : <X className="w-4 h-4 text-zinc-600" />
                      ) : (
                        <span>{row.manualAi}</span>
                      )}
                    </td>

                    {/* Agency Column */}
                    <td className="py-4 px-6 text-zinc-400">
                      {typeof row.agency === 'boolean' ? (
                        row.agency ? <Check className="w-4 h-4 text-zinc-500" /> : <X className="w-4 h-4 text-zinc-600" />
                      ) : (
                        <span>{row.agency}</span>
                      )}
                    </td>

                    {/* In-House Column */}
                    <td className="py-4 px-6 text-zinc-400">
                      {typeof row.inhouse === 'boolean' ? (
                        row.inhouse ? <Check className="w-4 h-4 text-zinc-500" /> : <X className="w-4 h-4 text-zinc-600" />
                      ) : (
                        <span>{row.inhouse}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </section>
  );
};
