import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check } from "lucide-react";
import PublicNav from "@/components/PublicNav";
import PublicFooter from "@/components/PublicFooter";
import { formatNaira } from "@/lib/format";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Comart+" },
      { name: "description", content: "Simple, transparent pricing for Nigerian businesses. From ₦5,000/month. 14-day free trial." },
      { property: "og:title", content: "Comart+ Pricing — From ₦5,000/month" },
      { property: "og:description", content: "Three plans for every stage of your business journey." },
    ],
  }),
  component: PricingPage,
});

const PLANS = [
  { id: "starter", name: "Starter", monthly: 5000, features: ["1 store", "Up to 3 staff", "Basic modules (Orders, Inventory, Wallet)", "1 sales form", "Email support"] },
  { id: "growth", name: "Growth", monthly: 15000, featured: true, features: ["1 store", "Up to 15 staff", "All modules", "5 sales forms", "Paystack integration", "Priority email support"] },
  { id: "enterprise", name: "Enterprise", monthly: 35000, features: ["Unlimited staff", "All modules + integrations", "Unlimited sales forms", "Custom subdomain", "Dedicated account manager", "Phone + WhatsApp support"] },
];

function PricingPage() {
  const [annual, setAnnual] = useState(false);
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicNav />
      <section className="py-16 md:py-20 max-w-6xl mx-auto px-4 md:px-6 text-center w-full">
        <h1 className="text-4xl md:text-5xl font-bold">Simple pricing for every stage</h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">14-day free trial. No credit card required. Cancel anytime.</p>

        <div className="mt-8 inline-flex items-center bg-muted rounded-full p-1 text-sm">
          <button onClick={() => setAnnual(false)} className={`px-5 py-2 rounded-full transition ${!annual ? "bg-background shadow font-semibold" : "text-muted-foreground"}`}>Monthly</button>
          <button onClick={() => setAnnual(true)} className={`px-5 py-2 rounded-full transition ${annual ? "bg-background shadow font-semibold" : "text-muted-foreground"}`}>Annual <span className="text-primary text-xs ml-1">save 2 mo</span></button>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-5 text-left">
          {PLANS.map(p => {
            const price = annual ? p.monthly * 10 : p.monthly;
            const suffix = annual ? "/year" : "/month";
            return (
              <div key={p.id} className={`p-7 rounded-2xl border bg-card flex flex-col ${p.featured ? "border-primary ring-2 ring-primary/30 relative" : ""}`}>
                {p.featured && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">Most Popular</span>}
                <h3 className="text-xl font-bold">{p.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{formatNaira(price)}</span>
                  <span className="text-muted-foreground text-sm">{suffix}</span>
                </div>
                {annual && <p className="text-xs text-primary mt-1">Save {formatNaira(p.monthly * 2)}/year</p>}
                <ul className="mt-6 space-y-2.5 flex-1">
                  {p.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/auth" search={{ plan: p.id }} className={`mt-7 text-center py-2.5 rounded-md font-semibold ${p.featured ? "bg-primary text-primary-foreground hover:opacity-90" : "border border-border hover:bg-muted"}`}>Start Free Trial</Link>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-sm text-muted-foreground">Need something custom? <a href="mailto:hello@comartplus.app" className="text-primary font-medium">Talk to sales →</a></p>
      </section>
      <PublicFooter />
    </div>
  );
}
