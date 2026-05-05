import { createFileRoute, Link } from "@tanstack/react-router";
import { ShoppingCart, Boxes, Banknote, UserCog, Users, Wallet, Check, ArrowRight, Play } from "lucide-react";
import PublicNav from "@/components/PublicNav";
import PublicFooter from "@/components/PublicFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Comart+ — Run Your Entire Nigerian Business from One Place" },
      { name: "description", content: "Comart+ unifies orders, inventory, finance, staff, agents and wallet for Nigerian SMEs. Start your 14-day free trial." },
      { property: "og:title", content: "Comart+ — Business Management for Nigerian SMEs" },
      { property: "og:description", content: "Orders, inventory, finance, staff, agents and wallet — all in one place." },
    ],
  }),
  component: HomePage,
});

const FEATURES = [
  { icon: ShoppingCart, title: "Orders", desc: "Track every sale from pending to delivered with status timelines and receipts." },
  { icon: Boxes, title: "Inventory", desc: "Real-time stock, agent allocations, faulty returns and waybills." },
  { icon: Banknote, title: "Finance", desc: "Income, expenses and reports your accountant will actually like." },
  { icon: UserCog, title: "Staff", desc: "Roles, attendance and task assignments built for Nigerian teams." },
  { icon: Users, title: "Agents", desc: "Manage field agents, commissions and stock allocations in one place." },
  { icon: Wallet, title: "Wallet", desc: "Paystack-powered wallet with PIN-protected withdrawals to any bank." },
];

const TESTIMONIALS = [
  { name: "Adaeze O.", company: "Mama A Foods, Lagos", quote: "Comart+ replaced three apps. We close orders 3× faster now." },
  { name: "Tunde A.", company: "Bestway Electronics, Abuja", quote: "Stock and finance finally talk to each other. No more spreadsheets." },
  { name: "Chinwe E.", company: "Glow Beauty, Port Harcourt", quote: "My agents log in from anywhere. Sales went up 40% this quarter." },
];

function HomePage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background -z-10" />
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-20 md:py-28 text-center">
          <span className="inline-block text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full mb-5">Built for Nigerian SMEs</span>
          <h1 className="text-4xl md:text-6xl font-bold leading-tight max-w-4xl mx-auto">Run Your Entire Business from <span className="text-primary">One Place</span></h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">Orders, inventory, finance, staff, agents and wallet — Comart+ is the all-in-one operating system for Nigerian small and medium businesses.</p>
          <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/auth" className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-7 py-3 rounded-md font-semibold hover:opacity-90">Start Free Trial <ArrowRight className="h-4 w-4" /></Link>
            <a href="#how" className="inline-flex items-center justify-center gap-2 border border-border px-7 py-3 rounded-md font-semibold hover:bg-muted"><Play className="h-4 w-4" /> Watch Demo</a>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">14-day free trial · No credit card required</p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">Everything you need, nothing you don't</h2>
          <p className="mt-3 text-muted-foreground">Six tightly integrated modules that work together out of the box.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(f => (
            <div key={f.title} className="p-6 rounded-xl border bg-card hover:shadow-md hover:-translate-y-0.5 transition">
              <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4"><f.icon className="h-5 w-5" /></div>
              <h3 className="font-semibold text-lg">{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-1.5">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 bg-muted/40">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { n: "1", t: "Sign Up", d: "Create your free account in under a minute." },
              { n: "2", t: "Set Up Your Store", d: "Add products, staff and your bank details." },
              { n: "3", t: "Start Selling", d: "Take orders online, track stock, get paid." },
            ].map(s => (
              <div key={s.n} className="text-center p-6 bg-card rounded-xl border">
                <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground font-bold text-xl flex items-center justify-center mx-auto mb-4">{s.n}</div>
                <h3 className="font-semibold text-lg">{s.t}</h3>
                <p className="text-sm text-muted-foreground mt-2">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 max-w-7xl mx-auto px-4 md:px-6">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">Trusted by ambitious Nigerian businesses</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {TESTIMONIALS.map(t => (
            <div key={t.name} className="p-6 rounded-xl border bg-card">
              <p className="text-sm">"{t.quote}"</p>
              <div className="mt-5 pt-4 border-t">
                <p className="font-semibold text-sm">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.company}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Integrations */}
      <section className="py-14 border-y bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 md:px-6 text-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-5">Works with the tools you already use</p>
          <div className="flex flex-wrap justify-center items-center gap-6 md:gap-10 text-muted-foreground font-semibold">
            <span>Paystack</span><span>WooCommerce</span><span>WhatsApp</span><span>Elementor</span>
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="py-20 max-w-5xl mx-auto px-4 md:px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold">Simple, transparent pricing</h2>
        <p className="mt-3 text-muted-foreground">Plans for every stage — from solo shops to enterprises.</p>
        <div className="mt-8 grid md:grid-cols-3 gap-5 text-left">
          {[
            { name: "Starter", price: "₦5,000", desc: "1 store · 3 staff" },
            { name: "Growth", price: "₦15,000", desc: "1 store · 15 staff · all modules", featured: true },
            { name: "Enterprise", price: "₦35,000", desc: "Unlimited staff · custom subdomain" },
          ].map(p => (
            <div key={p.name} className={`p-6 rounded-xl border ${p.featured ? "border-primary ring-2 ring-primary/30 bg-card" : "bg-card"}`}>
              <h3 className="font-semibold">{p.name}</h3>
              <p className="text-3xl font-bold mt-2">{p.price}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              <p className="text-sm text-muted-foreground mt-2">{p.desc}</p>
            </div>
          ))}
        </div>
        <Link to="/pricing" className="inline-flex items-center gap-2 mt-8 text-primary font-semibold">View full pricing <ArrowRight className="h-4 w-4" /></Link>
      </section>

      {/* CTA */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="max-w-3xl mx-auto px-4 md:px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold">Ready to take control of your business?</h2>
          <p className="mt-3 opacity-90">Join hundreds of Nigerian SMEs running on Comart+.</p>
          <Link to="/auth" className="inline-flex items-center gap-2 mt-7 bg-background text-foreground px-7 py-3 rounded-md font-semibold hover:opacity-90">Start Your Free Trial <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
