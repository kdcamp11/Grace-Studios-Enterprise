"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OrgLogo from "@/components/OrgLogo";

// ── Consultation form ─────────────────────────────────────────────────────────

function ConsultationForm() {
  const [fields, setFields] = useState({ name: "", email: "", program: "", message: "" });
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
        body: JSON.stringify(fields),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  const inputCls =
    "w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors";

  if (status === "sent") {
    return (
      <div className="rounded-xl border border-brand-border bg-brand-surface p-8 flex flex-col items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center">
          <svg className="w-5 h-5 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="font-display font-bold uppercase tracking-wide text-brand-text text-lg">Message Received</p>
          <p className="text-sm font-barlow text-brand-muted mt-1 leading-relaxed">
            We&apos;ll be in touch within 1–2 business days to schedule your consultation.
          </p>
        </div>
        <a
          href="/portal"
          className="mt-2 px-6 py-3 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary transition-colors"
        >
          Back to Orders →
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSend} className="rounded-xl border border-brand-border bg-brand-surface p-6 sm:p-8 space-y-5">
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Name</label>
          <input
            required
            className={inputCls}
            placeholder="Your name"
            value={fields.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Email</label>
          <input
            type="email"
            required
            className={inputCls}
            placeholder="your@email.com"
            value={fields.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Program / Organization</label>
        <input
          className={inputCls}
          placeholder="Team name or school"
          value={fields.program}
          onChange={(e) => set("program", e.target.value)}
        />
      </div>
      <div>
        <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5">
          Tell us about your project
        </label>
        <textarea
          required
          rows={5}
          className={`${inputCls} resize-none`}
          placeholder="Sport, quantity, timeline, specific needs…"
          value={fields.message}
          onChange={(e) => set("message", e.target.value)}
        />
      </div>
      {status === "error" && (
        <p className="text-sm font-barlow text-red-600">
          Something went wrong — please try again.
        </p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full py-4 rounded-lg bg-brand-primary text-white font-display font-bold text-sm uppercase tracking-widest hover:bg-brand-secondary disabled:opacity-40 transition-colors"
      >
        {status === "sending" ? "Sending…" : "Request Consultation →"}
      </button>
    </form>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ContactPage() {
  const router      = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">

      {/* Header — same pattern as portal */}
      <header className="border-b border-brand-border px-6 sm:px-10 py-5 flex items-center justify-between">
        <OrgLogo href="/portal" />
        <div className="flex items-center gap-5">
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">
            My Orders
          </a>
          <a href="/brief/choose" className="text-xs font-display font-bold uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors">
            + New Order
          </a>
          <button
            type="button"
            onClick={signOut}
            className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-10 py-12 sm:py-16">
        <div className="max-w-5xl mx-auto">

          {/* Section label */}
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
            <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">
              Design Consultation
            </span>
          </div>

          <div className="grid lg:grid-cols-[1fr_520px] gap-12 lg:gap-16 items-start">

            {/* Left — editorial intro */}
            <div className="space-y-8">
              <div>
                <h1
                  className="font-display font-bold uppercase tracking-tight text-brand-text leading-none mb-5"
                  style={{ fontSize: "clamp(1.8rem, 3.5vw, 3rem)" }}
                >
                  Work Directly<br />
                  <span className="text-brand-primary">with Grace Studios.</span>
                </h1>
                <p className="text-sm font-barlow text-brand-muted leading-relaxed max-w-[360px]">
                  Have a complex program, need a full custom identity system, or want to talk
                  through a large order before you start? Reach out and we&apos;ll set up a
                  dedicated consultation session.
                </p>
              </div>

              {/* What we can help with */}
              <div className="border border-brand-border rounded-xl overflow-hidden">
                {[
                  {
                    title: "Full Identity Systems",
                    body: "Jersey + shorts + warmups + accessories — designed as one cohesive program.",
                  },
                  {
                    title: "Large-Program Pricing",
                    body: "Volume discounts, phased timelines, and dedicated account support for programs with 50+ athletes.",
                  },
                  {
                    title: "Exclusive Colorways",
                    body: "Custom palette development and design systems built specifically for your brand.",
                  },
                  {
                    title: "Complex Projects",
                    body: "Multi-sport programs, specialty garments, or anything outside the standard brief flow.",
                  },
                ].map((item, i) => (
                  <div
                    key={item.title}
                    className={`px-6 py-5 flex flex-col gap-1.5 ${i > 0 ? "border-t border-brand-border" : ""}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-[3px] h-3.5 bg-brand-primary flex-shrink-0" />
                      <p className="font-display font-bold uppercase tracking-wide text-brand-text text-sm">
                        {item.title}
                      </p>
                    </div>
                    <p className="text-xs font-barlow text-brand-muted leading-relaxed pl-[19px]">
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — form */}
            <ConsultationForm />
          </div>
        </div>
      </main>

      <footer className="border-t border-brand-border px-6 py-6 text-center">
        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted">
          Grace Studios · Custom Sportswear
        </p>
      </footer>
    </div>
  );
}
