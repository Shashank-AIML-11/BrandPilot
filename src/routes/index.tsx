import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { BrandProfileBuilder } from "@/components/landing/BrandProfileBuilder";
import { AutonomousFlywheel } from "@/components/landing/AutonomousFlywheel";
import { AutoLearnCycleDemo } from "@/components/landing/AutoLearnCycleDemo";
import { CreativesShowcase } from "@/components/landing/CreativesShowcase";
import { VideoShowcase } from "@/components/landing/VideoShowcase";
import { ComparisonTable } from "@/components/landing/ComparisonTable";
import { PricingSection } from "@/components/landing/PricingSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { CtaSection } from "@/components/landing/CtaSection";
import { Footer } from "@/components/landing/Footer";
import { DemoModal } from "@/components/landing/DemoModal";
import { PlanModal } from "@/components/landing/PlanModal";
import type { PricingPlan } from "@/components/landing/types";
import { PRICING_PLANS } from "@/components/landing/mockData";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LOVIZA — A month of marketing content, generated in minutes" },
      {
        name: "description",
        content:
          "Store your brand once. LOVIZA generates daily blogs, infographics and video scripts, drops them into a calendar and schedules them across every channel.",
      },
      { property: "og:title", content: "LOVIZA — AI marketing content on autopilot" },
      {
        property: "og:description",
        content:
          "One brand profile in. A full month of blogs, infographics and videos out — scheduled, reviewable and ready to post.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(PRICING_PLANS[1] ?? null);
  const [isAnnualPlan, setIsAnnualPlan] = useState(true);

  const handleScrollToVault = () => {
    const el = document.getElementById("brand-vault");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const handleOpenPlanModal = (plan?: PricingPlan, annual = true) => {
    setSelectedPlan(plan || PRICING_PLANS[1] || null);
    setIsAnnualPlan(annual);
    setIsPlanModalOpen(true);
  };

  return (
    <div
      className="min-h-screen bg-black text-zinc-100 flex flex-col selection:bg-yellow-400/30 selection:text-white"
      style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >
      {/* Primary CTA ("Activate Brand Autopilot") goes straight to sign-in,
          per the request to route it to the Google/Apple auth screen. Every
          other CTA in this design (pricing cards, demo modal, etc.) keeps
          its original behavior from the source design untouched. */}
      <Navbar
        onOpenDemo={() => setIsDemoModalOpen(true)}
        onOpenGetStarted={() => navigate({ to: "/auth" })}
      />

      <main className="flex-1">
        <Hero onScrollToVault={handleScrollToVault} onOpenDemo={() => setIsDemoModalOpen(true)} />

        <BrandProfileBuilder
          onAutopilotActivated={() => {
            const el = document.getElementById("auto-learn");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}
        />

        <AutonomousFlywheel />
        <AutoLearnCycleDemo />
        <CreativesShowcase />
        <VideoShowcase onOpenDemo={() => setIsDemoModalOpen(true)} />
        <ComparisonTable />

        <PricingSection onSelectPlan={(plan, annual) => handleOpenPlanModal(plan, annual)} />

        <FaqSection />

        <CtaSection onStartWithUrl={() => handleScrollToVault()} />
      </main>

      <Footer />

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
