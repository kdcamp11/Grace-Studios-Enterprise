"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import type { Tenant } from "@/lib/supabase/types";

const SPORTS   = ["basketball","football","soccer","baseball","softball","volleyball","lacrosse","hockey","tennis","wrestling"];
const PRODUCTS = ["jersey","shorts","tracksuit","jacket","hoodie","pants","socks"];

const STEPS = ["Welcome", "Brand", "Catalog", "Launch"] as const;
type Step = 0 | 1 | 2 | 3;

export default function OnboardingPage() {
  const router      = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabaseRef  = useRef(createClient());
  const supabase     = supabaseRef.current;

  const [step, setStep]         = useState<Step>(0);
  const [tenant, setTenant]     = useState<Tenant | null>(null);
  const [form, setForm]         = useState<Partial<Tenant>>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    getProfile().then((profile) => {
      if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
        router.replace("/portal");
        return;
      }
      fetch("/api/onboarding")
        .then((r) => r.json())
        .then(({ tenant }: { tenant: Tenant }) => {
          if (!tenant) { router.replace("/admin"); return; }
          if (tenant.onboarding_complete) { router.replace("/admin"); return; }
          setTenant(tenant);
          setForm(tenant);
          setLoading(false);
        });
    });
  }, [router]);

  function set(key: keyof Tenant, val: unknown) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function toggleArray(key: "enabled_sports" | "enabled_products", val: string) {
    const arr = (form[key] as string[]) ?? [];
    set(key, arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  }

  async function handleLogoUpload(file: File) {
    if (!tenant?.id) return;
    setUploading(true);
    setError("");
    const ext  = file.name.split(".").pop() ?? "png";
    const path = `logos/${tenant.id}/logo.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("assets")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) { setError(`Upload failed: ${uploadError.message}`); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(path);
    set("logo_url", publicUrl);
    setUploading(false);
  }

  async function saveStep(nextStep: Step, complete = false) {
    setSaving(true); setError("");
    const res = await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, ...(complete ? { complete: true } : {}) }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Something went wrong"); setSaving(false); return; }
    setTenant(data.tenant);
    setSaving(false);
    if (complete) {
      router.replace("/admin");
    } else {
      setStep(nextStep);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-6 h-6 border-2 border-t-transparent border-white/40 rounded-full animate-spin" />
      </div>
    );
  }

  const primary = (form.brand_primary as string) ?? "#111111";
  const bg      = (form.brand_bg      as string) ?? "#ffffff";
  const surface = (form.brand_surface as string) ?? "#f5f5f5";
  const border  = (form.brand_border  as string) ?? "#d4d4d4";
  const text    = (form.brand_text    as string) ?? "#0a0a0a";
  const muted   = (form.brand_muted   as string) ?? "#888888";

  const field  = `w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10`;
  const label  = "block text-[10px] font-display uppercase tracking-widest mb-1.5";
  const pill   = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-display uppercase tracking-wider border transition-colors ${
      active
        ? "text-white border-transparent"
        : "text-gray-400 border-gray-200 hover:border-gray-400"
    }`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: bg, color: text }}>

      {/* Progress bar */}
      <div className="h-1 w-full" style={{ background: border }}>
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: primary }}
        />
      </div>

      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between border-b" style={{ borderColor: border }}>
        <div className="flex items-center gap-3">
          {form.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.logo_url} alt="Logo" className="h-8 w-auto object-contain" />
          ) : (
            <div className="w-8 h-8 rounded-full" style={{ background: primary }} />
          )}
          <span className="font-display font-bold uppercase tracking-widest text-sm">
            {form.name ?? "Your Studio"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-display font-bold transition-colors ${
                  i < step ? "text-white" : i === step ? "text-white" : ""
                }`}
                style={{
                  background: i <= step ? primary : border,
                  color:      i <= step ? "#fff"   : muted,
                }}
              >
                {i < step ? "✓" : i + 1}
              </div>
              <span
                className="text-[10px] font-display uppercase tracking-wider hidden sm:block"
                style={{ color: i === step ? text : muted }}
              >
                {s}
              </span>
              {i < STEPS.length - 1 && (
                <div className="w-4 h-px mx-1 hidden sm:block" style={{ background: border }} />
              )}
            </div>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-xl">

          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {/* ── Step 0: Welcome ─────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-8">
              <div>
                <p className="text-[10px] font-display uppercase tracking-[0.3em] mb-2" style={{ color: primary }}>
                  Welcome
                </p>
                <h1 className="font-display text-3xl font-bold uppercase tracking-wide mb-3">
                  Let&apos;s set up<br />your studio
                </h1>
                <p className="font-barlow text-sm leading-relaxed" style={{ color: muted }}>
                  This takes about 2 minutes. We&apos;ll configure your studio name, branding, and product catalog. You can change everything later in Settings.
                </p>
              </div>

              <div className="space-y-4 rounded-xl border p-6" style={{ borderColor: border, background: surface }}>
                <div>
                  <label className={label} style={{ color: muted }}>Studio Name</label>
                  <input
                    required
                    className={field}
                    style={{ borderColor: border, background: bg, color: text }}
                    value={form.name ?? ""}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Rival Athletics"
                  />
                </div>
                <div>
                  <label className={label} style={{ color: muted }}>Support Email</label>
                  <input
                    type="email"
                    className={field}
                    style={{ borderColor: border, background: bg, color: text }}
                    value={form.support_email ?? ""}
                    onChange={(e) => set("support_email", e.target.value)}
                    placeholder="support@yourstudio.com"
                  />
                  <p className="text-[11px] mt-1.5 font-barlow" style={{ color: muted }}>
                    Shown to clients in order emails
                  </p>
                </div>
              </div>

              <button
                onClick={() => saveStep(1)}
                disabled={saving || !form.name?.trim()}
                className="w-full py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-widest text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ background: primary }}
              >
                {saving ? "Saving…" : "Continue →"}
              </button>
            </div>
          )}

          {/* ── Step 1: Brand ────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-8">
              <div>
                <p className="text-[10px] font-display uppercase tracking-[0.3em] mb-2" style={{ color: primary }}>
                  Step 2 of 4
                </p>
                <h1 className="font-display text-3xl font-bold uppercase tracking-wide mb-3">
                  Brand your<br />studio
                </h1>
                <p className="font-barlow text-sm leading-relaxed" style={{ color: muted }}>
                  Upload your logo and set brand colors. These appear throughout the client portal and emails.
                </p>
              </div>

              <div className="space-y-6 rounded-xl border p-6" style={{ borderColor: border, background: surface }}>

                {/* Logo */}
                <div>
                  <label className={label} style={{ color: muted }}>Logo</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }}
                  />
                  <div
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    className={`flex items-center gap-4 border-2 border-dashed rounded-xl px-5 py-4 transition-colors ${uploading ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
                    style={{ borderColor: form.logo_url ? primary : border }}
                  >
                    {form.logo_url ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={form.logo_url} alt="Logo" className="h-10 w-auto object-contain rounded flex-shrink-0" />
                        <div>
                          <p className="text-sm font-barlow" style={{ color: text }}>{uploading ? "Uploading…" : "Logo uploaded"}</p>
                          <p className="text-xs font-barlow mt-0.5" style={{ color: muted }}>Click to replace</p>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-3 w-full">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: border }}>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: muted }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-barlow" style={{ color: text }}>{uploading ? "Uploading…" : "Upload logo"}</p>
                          <p className="text-xs font-barlow mt-0.5" style={{ color: muted }}>PNG, JPG, SVG or WebP</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Colors */}
                <div>
                  <label className={label} style={{ color: muted }}>Brand Colors</label>
                  <div className="grid grid-cols-4 gap-4">
                    {([
                      ["brand_primary",   "Primary"],
                      ["brand_secondary", "Accent"],
                      ["brand_bg",        "Background"],
                      ["brand_text",      "Text"],
                    ] as [keyof Tenant, string][]).map(([key, lbl]) => (
                      <div key={key} className="flex flex-col items-center gap-2">
                        <input
                          type="color"
                          className="w-12 h-12 rounded-xl border cursor-pointer p-1"
                          style={{ borderColor: border, background: surface }}
                          value={(form[key] as string) ?? "#000000"}
                          onChange={(e) => set(key, e.target.value)}
                        />
                        <span className="text-[10px] font-display uppercase tracking-wider" style={{ color: muted }}>{lbl}</span>
                        <span className="text-[9px] font-mono" style={{ color: muted }}>
                          {(form[key] as string) ?? ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live preview */}
                <div className="rounded-lg p-4" style={{ background: bg, border: `1px solid ${border}` }}>
                  <p className="text-[10px] font-display uppercase tracking-widest mb-3" style={{ color: muted }}>Preview</p>
                  <div className="flex items-center gap-3">
                    {form.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.logo_url} alt="" className="h-7 w-auto object-contain" />
                    ) : (
                      <div className="w-7 h-7 rounded-full" style={{ background: primary }} />
                    )}
                    <span className="font-display font-bold text-sm uppercase tracking-wide" style={{ color: text }}>
                      {form.name ?? "Your Studio"}
                    </span>
                    <span
                      className="ml-auto px-3 py-1 rounded-full text-xs font-display font-bold uppercase tracking-wider text-white"
                      style={{ background: primary }}
                    >
                      Sample CTA
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="px-6 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-widest border transition-colors hover:opacity-70"
                  style={{ borderColor: border, color: muted }}
                >
                  ← Back
                </button>
                <button
                  onClick={() => saveStep(2)}
                  disabled={saving || uploading}
                  className="flex-1 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-widest text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ background: primary }}
                >
                  {saving ? "Saving…" : "Continue →"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Catalog ──────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-8">
              <div>
                <p className="text-[10px] font-display uppercase tracking-[0.3em] mb-2" style={{ color: primary }}>
                  Step 3 of 4
                </p>
                <h1 className="font-display text-3xl font-bold uppercase tracking-wide mb-3">
                  What do you<br />offer?
                </h1>
                <p className="font-barlow text-sm leading-relaxed" style={{ color: muted }}>
                  Select the sports and products your studio specializes in. These filter the brief builder for your clients.
                </p>
              </div>

              <div className="space-y-6 rounded-xl border p-6" style={{ borderColor: border, background: surface }}>
                <div>
                  <label className={label} style={{ color: muted }}>Sports</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {SPORTS.map((sport) => {
                      const active = (form.enabled_sports ?? []).includes(sport);
                      return (
                        <button
                          key={sport}
                          type="button"
                          onClick={() => toggleArray("enabled_sports", sport)}
                          className={pill(active)}
                          style={active ? { background: primary, borderColor: primary } : { borderColor: border, color: muted }}
                        >
                          {sport}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className={label} style={{ color: muted }}>Products</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {PRODUCTS.map((product) => {
                      const active = (form.enabled_products ?? []).includes(product);
                      return (
                        <button
                          key={product}
                          type="button"
                          onClick={() => toggleArray("enabled_products", product)}
                          className={pill(active)}
                          style={active ? { background: primary, borderColor: primary } : { borderColor: border, color: muted }}
                        >
                          {product}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-6 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-widest border transition-colors hover:opacity-70"
                  style={{ borderColor: border, color: muted }}
                >
                  ← Back
                </button>
                <button
                  onClick={() => saveStep(3)}
                  disabled={saving || (form.enabled_sports ?? []).length === 0}
                  className="flex-1 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-widest text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ background: primary }}
                >
                  {saving ? "Saving…" : "Continue →"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Launch ───────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-8">
              <div>
                <p className="text-[10px] font-display uppercase tracking-[0.3em] mb-2" style={{ color: primary }}>
                  All set
                </p>
                <h1 className="font-display text-3xl font-bold uppercase tracking-wide mb-3">
                  Your studio<br />is ready
                </h1>
                <p className="font-barlow text-sm leading-relaxed" style={{ color: muted }}>
                  Everything is configured. Head to your admin portal to create your first order, invite team members, or set up billing.
                </p>
              </div>

              {/* Summary */}
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: border }}>
                <div className="px-5 py-4 flex items-center gap-4 border-b" style={{ background: surface, borderColor: border }}>
                  {form.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logo_url} alt="Logo" className="h-10 w-auto object-contain flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ background: primary }} />
                  )}
                  <div>
                    <p className="font-display font-bold uppercase tracking-wide">{form.name}</p>
                    {form.support_email && (
                      <p className="text-xs font-barlow mt-0.5" style={{ color: muted }}>{form.support_email}</p>
                    )}
                  </div>
                  <div className="ml-auto flex gap-2">
                    {(["brand_primary","brand_secondary","brand_bg","brand_text"] as (keyof Tenant)[]).map((k) => (
                      <div key={k} className="w-5 h-5 rounded-full border" style={{ background: (form[k] as string) ?? "#000", borderColor: border }} />
                    ))}
                  </div>
                </div>
                <div className="px-5 py-4" style={{ background: bg }}>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-display uppercase tracking-widest mb-2" style={{ color: muted }}>Sports</p>
                      <p className="text-sm font-barlow" style={{ color: text }}>
                        {(form.enabled_sports ?? []).length > 0
                          ? (form.enabled_sports as string[]).join(", ")
                          : "None selected"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-display uppercase tracking-widest mb-2" style={{ color: muted }}>Products</p>
                      <p className="text-sm font-barlow" style={{ color: text }}>
                        {(form.enabled_products ?? []).length > 0
                          ? (form.enabled_products as string[]).join(", ")
                          : "None selected"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-6 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-widest border transition-colors hover:opacity-70"
                  style={{ borderColor: border, color: muted }}
                >
                  ← Back
                </button>
                <button
                  onClick={() => saveStep(3, true)}
                  disabled={saving}
                  className="flex-1 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-widest text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ background: primary }}
                >
                  {saving ? "Launching…" : "Launch Admin Portal →"}
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
