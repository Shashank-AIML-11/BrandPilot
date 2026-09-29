import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { BrandProfileBuilder } from './components/BrandProfileBuilder';
import { AutonomousFlywheel } from './components/AutonomousFlywheel';
import { AutoLearnCycleDemo } from './components/AutoLearnCycleDemo';
import { CreativesShowcase } from './components/CreativesShowcase';
import { VideoShowcase } from './components/VideoShowcase';
import { ComparisonTable } from './components/ComparisonTable';
import { PricingSection } from './components/PricingSection';
import { FaqSection } from './components/FaqSection';
import { CtaSection } from './components/CtaSection';
import { Footer } from './components/Footer';
import { DemoModal } from './components/DemoModal';
import { PlanModal } from './components/PlanModal';
import { PricingPlan } from './types';
import { PRICING_PLANS } from './data/mockData';

export default function App() {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(PRICING_PLANS[1]);
  const [isAnnualPlan, setIsAnnualPlan] = useState(true);

  const handleScrollToVault = () => {
    const el = document.getElementById('brand-vault');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleOpenPlanModal = (plan?: PricingPlan, annual = true) => {
    setSelectedPlan(plan || PRICING_PLANS[1]);
    setIsAnnualPlan(annual);
    setIsPlanModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col selection:bg-yellow-400/30 selection:text-white">
      {/* Top Bar (3 Zones) */}
      <Navbar
        onOpenDemo={() => setIsDemoModalOpen(true)}
        onOpenGetStarted={() => handleOpenPlanModal()}
      />

      {/* Main Page Flow */}
      <main className="flex-1">
        {/* 1. Hero: Autonomous AI Marketing & Live Holographic Workspace */}
        <Hero
          onScrollToVault={handleScrollToVault}
          onOpenDemo={() => setIsDemoModalOpen(true)}
        />

        {/* 2. Step 1: The Brand Profile DNA Vault Builder */}
        <BrandProfileBuilder
          onAutopilotActivated={() => {
            const el = document.getElementById('auto-learn');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
        />

        {/* 3. The 4 Autonomous Pillars (Auto-Generate, Post, Learn, Strategy) */}
        <AutonomousFlywheel />

        {/* 4. The Self-Optimizing Feedback Loop Telemetry Simulator */}
        <AutoLearnCycleDemo />

        {/* 5. Autonomous Creative Stream (Animated Gallery & Multi-Format Showcase) */}
        <CreativesShowcase />

        {/* 6. Wall of Proof & Case Studies */}
        <VideoShowcase
          onOpenDemo={() => setIsDemoModalOpen(true)}
        />

        {/* 7. Comparison Matrix: Autonomous Autopilot vs Manual Tools */}
        <ComparisonTable />

        {/* 9. Transparent Autopilot Pricing */}
        <PricingSection
          onSelectPlan={(plan, annual) => handleOpenPlanModal(plan, annual)}
        />

        {/* 10. Frequently Asked Questions */}
        <FaqSection />

        {/* 11. Bottom Conversion CTA Block */}
        <CtaSection
          onStartWithUrl={(url) => {
            handleScrollToVault();
          }}
        />
      </main>

      {/* Clean Quiet Footer */}
      <Footer />

      {/* Interactive Modals */}
      <DemoModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
        onOpenVault={handleScrollToVault}
      />

      <PlanModal
        isOpen={isPlanModalOpen}
        plan={selectedPlan}
        isAnnual={isAnnualPlan}
        onClose={() => setIsPlanModalOpen(false)}
      />
    </div>
  );
}
