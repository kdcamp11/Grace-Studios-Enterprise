"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient, sessionReady } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import OrgLogo from "@/components/OrgLogo";

const WHAT_TO_EXPECT = [
  {
    num: "01",
    title: "Tell Us About Your Program",
    body: "Share your sport, team identity, color direction, and any reference styles you love. The more context you give us, the sharper the concept.",
  },
  {
    num: "02",
    title: "Design Concept Review",
    body: "Our team prepares a design concept built around your brief, backed by the Grace Studios design library and our production expertise.",
  },
  {
    num: "03",
    title: "Refine & Approve",
    body: "We refine based on your feedback until the design is exactly right. You approve before anything moves to production.",
  },
  {
    num: "04",
    title: "Production & Delivery",
    body: "Designer-built files go to your matched supplier. First-piece review, then full production, every step tracked.",
  },
];

const GOOD_FIT = [
  "Full identity systems: jersey, shorts, warmups, accessories",
  "Complex custom colorways or exclusive design systems",
  "Programs ordering 50+ units with specific timeline requirements",
  "Teams that want direct input on every design decision",
  "Organizations building a multi-season apparel program",
];

function ConsultationForm() {
  const [fields, setFields] = useState({ name: "", email: "", program: "", sport: "", quantity: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  function set(k: keyof typeof fields, v: string) {
    setFields((f) => ({ ...f, [k]: v }));
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...fields,
          message: `Sport: ${fields.sport}\nQuantity: ${fields.quantity}\n\n${fields.message}`,
        }),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  const inputCls = "w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors";

  if (status === "sent") {
    return (
      <div className="rounded-xl border border-brand-border bg-brand-surface p-8 flex flex-col items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center">
          <svg className="w-5 h-5 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="font-display font-bold uppercase tracking-wide text-brand-text">Request Received</p>
          <p className="text-sm font-barlow text-brand-muted mt-1 leading-relaxed">
            Our team will reach out within 1–2 business days to schedule your design consultation.
          </p>
        </div>
        <a href="/portal" className="mt-2 text-xs font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors">
          ← Back to Portal
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSend} className="rounded-xl border border-brand-border bg-brand-surface p-6 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Your Name</label>
          <input required className={inputCls} placeholder="Full name" value={fields.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Email</label>
          <input type="email" required className={inputCls} placeholder="your@email.com" value={fields.email} onChange={(e) => set("email", e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Program / Organization</label>
        <input className={inputCls} placeholder="Team or organization name" value={fields.program} onChange={(e) => set("program", e.target.value)} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Sport</label>
          <input className={inputCls} placeholder="e.g. Basketball, Soccer…" value={fields.sport} onChange={(e) => set("sport", e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Estimated Quantity</label>
          <input className={inputCls} placeholder="e.g. 50 uniforms" value={fields.quantity} onChange={(e) => set("quantity", e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Tell Us About Your Project</label>
        <textarea
          required
          rows={4}
          className={`${inputCls} resize-none`}
          placeholder="Design direction, colors, logos, timeline, special requirements…"
          value={fields.message}
          onChange={(e) => set("message", e.target.value)}
        />
      </div>
      {status === "error" && (
        <p className="text-sm font-barlow text-red-600">Something went wrong — please try again.</p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full py-3.5 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary disabled:opacity-40 transition-colors"
      >
        {status === "sending" ? "Sending…" : "Request Consultation →"}
      </button>
    </form>
  );
}

export default function ConsultationPage() {
  const router    = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase  = supabaseRef.current;

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      await sessionReady();
      const profile = await getProfile();
      if (!profile) { router.replace("/login"); return; }
      if (profile.role === "supplier") { router.replace("/supplier"); return; }
      setLoading(false);
    }
    load();
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">

      {/* Header */}
      <header className="border-b border-brand-border px-6 sm:px-10 py-5 flex items-center justify-between">
        <OrgLogo href="/portal" />
        <div className="flex items-center gap-5">
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">← Orders</a>
          <a href="/portal/consultation" className="text-xs font-display font-bold uppercase tracking-wider text-brand-primary transition-colors">Work with Grace Studios</a>
          <a href="/billing" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Billing</a>
          <a href="/portal/settings" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Settings</a>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 px-5 sm:px-10 py-12 sm:py-16">
        <div className="max-w-5xl mx-auto">

          {/* Page header */}
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
            <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">Full Service</span>
          </div>
          <h1 className="font-display font-bold uppercase tracking-tight text-brand-text leading-none mb-3" style={{ fontSize: "clamp(1.4rem, 2.5vw, 2.4rem)" }}>
            Work Directly<br />with Grace Studios.
          </h1>
          <p className="text-sm font-barlow text-brand-muted max-w-[480px] leading-relaxed mb-14">
            Our full-service consultation path is for programs that want a custom design built around their identity —
            not selected from a library. You brief us, we design, you approve at every step.
          </p>

          <div className="grid lg:grid-cols-[1fr_480px] gap-14 lg:gap-20 items-start">

            {/* Left — process + good fit */}
            <div className="space-y-12">

              {/* What to expect */}
              <div>
                <div className="flex items-center gap-2.5 mb-6">
                  <div className="w-[3px] h-4 bg-brand-primary flex-shrink-0" />
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">What to Expect</span>
                </div>
                <div className="border border-brand-border rounded-xl overflow-hidden divide-y divide-brand-border">
                  {WHAT_TO_EXPECT.map((step) => (
                    <div key={step.num} className="flex gap-5 p-5 bg-brand-bg hover:bg-brand-surface transition-colors">
                      <span className="font-display font-bold text-2xl leading-none text-brand-border select-none flex-shrink-0 w-8">{step.num}</span>
                      <div className="space-y-1">
                        <p className="font-display font-bold uppercase tracking-wide text-brand-text text-sm">{step.title}</p>
                        <p className="text-xs font-barlow text-brand-muted leading-relaxed">{step.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Good fit */}
              <div>
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="w-[3px] h-4 bg-brand-primary flex-shrink-0" />
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">This Path Is a Good Fit If…</span>
                </div>
                <ul className="space-y-3">
                  {GOOD_FIT.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <div className="w-[3px] h-3.5 bg-brand-primary flex-shrink-0 mt-[3px]" />
                      <span className="text-xs font-barlow text-brand-muted leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8 p-5 rounded-xl border border-brand-border bg-brand-surface">
                  <p className="text-xs font-display font-bold uppercase tracking-wide text-brand-text mb-1">Prefer to move faster?</p>
                  <p className="text-xs font-barlow text-brand-muted leading-relaxed mb-3">
                    Our Design Library path lets you choose from curated Grace Studios silhouettes and receive
                    a design concept within minutes — no consultation required.
                  </p>
                  <a href="/brief/choose" className="text-[10px] font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors">
                    Start with the Design Library →
                  </a>
                </div>
              </div>

            </div>

            {/* Right — consultation form */}
            <div>
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-[3px] h-4 bg-brand-primary flex-shrink-0" />
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">Request a Consultation</span>
              </div>
              <ConsultationForm />
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
