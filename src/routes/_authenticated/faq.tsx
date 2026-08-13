import { createFileRoute } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/_authenticated/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — LOVIZA123" },
      { name: "description", content: "How LOVIZA123 generates, schedules and posts your content." },
      { property: "og:title", content: "FAQ — LOVIZA123" },
      { property: "og:description", content: "Answers about generation, scheduling and posting." },
    ],
  }),
  component: FaqPage,
});

const FAQS = [
  {
    q: "How does LOVIZA123 decide what to write?",
    a: "Every generation reads your Brand Profile: website, description, products and services, ICP, value propositions, tone of voice and focus keywords. The richer that page, the more specific the output.",
  },
  {
    q: "What exactly gets generated each day?",
    a: "1 long-form blog, 4 infographic packages (headline, caption, hashtags and art direction) and 2 video packages (title, 60-90 second script, thumbnail direction and caption).",
  },
  {
    q: "How do I generate a full month?",
    a: "Open the Content Calendar, pick the month and press Generate Content. LOVIZA123 works week by week and fills the calendar as it goes. Regenerating a month replaces the content for those dates.",
  },
  {
    q: "Can I turn off individual days or pieces?",
    a: "Yes. Click any day to see everything scheduled, toggle the whole day on or off, or open a single piece and disable just that one. Disabled content is never posted.",
  },
  {
    q: "Where do the visuals come from?",
    a: "Infographic and thumbnail images are generated on demand inside the content viewer, using the art direction produced with the copy. They are stored privately in your workspace.",
  },
  {
    q: "How does posting work?",
    a: "Each piece carries the channels from your Brand Profile and a scheduled time. You can post manually from the content viewer; connecting live channel APIs is the next step on the roadmap.",
  },
  {
    q: "Who can access my workspace?",
    a: "Only you, plus anyone an admin grants a role to from the Admin Portal. Roles are viewer, editor, admin and root.",
  },
  {
    q: "When will payments be charged?",
    a: "Checkout records your plan choice and payment method today. Charges begin once the payment gateway is connected to the workspace.",
  },
];

function FaqPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">FAQ</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything about generating, scheduling and publishing with LOVIZA123.
        </p>
      </div>
      <div className="surface px-6">
        <Accordion type="single" collapsible>
          {FAQS.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="text-left text-sm">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}
