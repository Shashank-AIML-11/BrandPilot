import React, { useState } from 'react';
import { Menu, X, ArrowRight, Cpu } from 'lucide-react';
import { playClickSound } from '../utils/audio';

interface NavbarProps {
  onOpenDemo?: () => void;
  onOpenGetStarted: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenGetStarted }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-black/90 border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Zone 1: Clean Brand Wordmark without Autopilot Active badge */}
        <a 
          href="#" 
          className="flex items-center gap-2.5 group focus:outline-none"
          onClick={() => playClickSound()}
        >
          <div className="w-8 h-8 rounded-lg bg-yellow-400 flex items-center justify-center text-black shadow-lg shadow-yellow-500/25 group-hover:scale-105 transition-transform duration-150">
            <Cpu className="w-4 h-4 text-black stroke-[2.5]" />
          </div>
          <span className="text-xl font-extrabold tracking-tight text-white">
            LOVIZA<span className="text-yellow-400 font-normal">.ai</span>
          </span>
        </a>

        {/* Zone 2: Minimal Navigation */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-300">
          <a 
            href="#pricing" 
            className="hover:text-yellow-400 transition-colors duration-150 py-1"
            onClick={() => playClickSound()}
          >
            Pricing
          </a>
          <a 
            href="#faq" 
            className="hover:text-yellow-400 transition-colors duration-150 py-1"
            onClick={() => playClickSound()}
          >
            FAQ
          </a>
        </nav>

        {/* Zone 3: Primary CTA action (Screenshot button removed) */}
        <div className="hidden sm:flex items-center gap-3">
          <button
            onClick={() => {
              playClickSound();
              onOpenGetStarted();
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-black bg-yellow-400 hover:bg-yellow-300 rounded-lg shadow-md shadow-yellow-500/25 hover:shadow-yellow-500/40 transition-all duration-150 whitespace-nowrap active:scale-[0.98] cursor-pointer"
          >
            Activate Brand Autopilot
            <ArrowRight className="w-3.5 h-3.5 text-black stroke-[3]" />
          </button>
        </div>

        {/* Mobile menu toggle */}
        <div className="md:hidden flex items-center gap-2">
          <button
            onClick={() => {
              playClickSound();
              onOpenGetStarted();
            }}
            className="px-3 py-1.5 text-xs font-black text-black bg-yellow-400 rounded-lg cursor-pointer"
          >
            Autopilot
          </button>
          <button
            onClick={() => {
              playClickSound();
              setMobileMenuOpen(!mobileMenuOpen);
            }}
            className="p-2 text-zinc-400 hover:text-white focus:outline-none cursor-pointer"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-950 px-5 py-4 space-y-3">
          <a
            href="#pricing"
            onClick={() => { playClickSound(); setMobileMenuOpen(false); }}
            className="block py-2 text-sm font-medium text-zinc-200 hover:text-yellow-400"
          >
            Pricing
          </a>
          <a
            href="#faq"
            onClick={() => { playClickSound(); setMobileMenuOpen(false); }}
            className="block py-2 text-sm font-medium text-zinc-200 hover:text-yellow-400"
          >
            FAQ
          </a>
          <div className="pt-2 border-t border-zinc-800">
            <button
              onClick={() => {
                playClickSound();
                setMobileMenuOpen(false);
                onOpenGetStarted();
              }}
              className="w-full py-2.5 text-xs font-black text-black bg-yellow-400 rounded-lg text-center cursor-pointer"
            >
              Activate Brand Autopilot
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
