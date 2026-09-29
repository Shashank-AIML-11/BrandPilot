import React from 'react';
import { playClickSound } from './audio';
import { Cpu } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-zinc-800 bg-black py-12 text-xs text-zinc-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          
          {/* Brand Col */}
          <div className="col-span-2 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-yellow-400 flex items-center justify-center text-black font-extrabold shadow-md shadow-yellow-400/20">
                <Cpu className="w-4 h-4 stroke-[2.5]" />
              </div>
              <span className="text-xl font-extrabold text-white tracking-tight">
                LOVIZA<span className="text-yellow-400 font-normal">.ai</span>
              </span>
            </div>
            <p className="text-zinc-400 text-xs max-w-sm leading-relaxed">
              The autonomous SaaS that Auto-Generates, Auto-Posts, Auto-Learns, and Auto-Builds your entire marketing strategy. Build your Brand Profile once; LOVIZA handles exponential organic virality forever.
            </p>
            <div className="text-[11px] text-zinc-500 pt-2 font-mono">
              © {new Date().getFullYear()} LOVIZA Autonomous Technologies, Inc. All rights reserved.
            </div>
          </div>

          {/* Product Col */}
          <div className="space-y-2.5">
            <div className="font-bold text-white uppercase text-[11px] tracking-wider">Autonomous Engine</div>
            <ul className="space-y-2">
              <li><a href="#brand-vault" onClick={playClickSound} className="hover:text-yellow-400 transition-colors">Brand DNA Vault</a></li>
              <li><a href="#four-pillars" onClick={playClickSound} className="hover:text-yellow-400 transition-colors">The 4 Pillars</a></li>
              <li><a href="#auto-learn" onClick={playClickSound} className="hover:text-yellow-400 transition-colors">Auto-Learn Loop</a></li>
              <li><a href="#creatives-showcase" onClick={playClickSound} className="hover:text-yellow-400 transition-colors">Creatives Stream</a></li>
              <li><a href="#pricing" onClick={playClickSound} className="hover:text-yellow-400 transition-colors">Autopilot Plans</a></li>
            </ul>
          </div>

          {/* Solutions Col */}
          <div className="space-y-2.5">
            <div className="font-bold text-white uppercase text-[11px] tracking-wider">Solutions</div>
            <ul className="space-y-2">
              <li><a href="#wall-of-proof" onClick={playClickSound} className="hover:text-yellow-400 transition-colors">DTC E-Commerce</a></li>
              <li><a href="#wall-of-proof" onClick={playClickSound} className="hover:text-yellow-400 transition-colors">B2B SaaS & DevTools</a></li>
              <li><a href="#wall-of-proof" onClick={playClickSound} className="hover:text-yellow-400 transition-colors">Mobile Consumer Apps</a></li>
              <li><a href="#wall-of-proof" onClick={playClickSound} className="hover:text-yellow-400 transition-colors">Consumer Tech & Hardware</a></li>
              <li><a href="#wall-of-proof" onClick={playClickSound} className="hover:text-yellow-400 transition-colors">Marketing Agencies</a></li>
            </ul>
          </div>

          {/* Legal & Compliance Col */}
          <div className="space-y-2.5">
            <div className="font-bold text-white uppercase text-[11px] tracking-wider">Trust & Security</div>
            <ul className="space-y-2">
              <li><a href="#" onClick={playClickSound} className="hover:text-yellow-400 transition-colors">Brand DNA Protection</a></li>
              <li><a href="#" onClick={playClickSound} className="hover:text-yellow-400 transition-colors">Terms of Service</a></li>
              <li><a href="#" onClick={playClickSound} className="hover:text-yellow-400 transition-colors">Privacy Policy</a></li>
              <li><a href="#" onClick={playClickSound} className="hover:text-yellow-400 transition-colors">Commercial Rights</a></li>
              <li><a href="#" onClick={playClickSound} className="hover:text-yellow-400 transition-colors">SOC2 Type II Ready</a></li>
            </ul>
          </div>

        </div>

      </div>
    </footer>
  );
};
