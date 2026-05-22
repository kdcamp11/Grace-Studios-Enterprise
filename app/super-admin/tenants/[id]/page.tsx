"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSuperAdmin } from "@/lib/super-admin";
import type { Tenant, TenantStats } from "@/lib/supabase/types";

const SPORTS   = ["basketball","football","soccer","baseball","softball","volleyball","lacrosse","hockey","tennis","wrestling"];
const PRODUCTS = ["jersey","shorts","tracksuit","jacket","hoodie","pants","socks"];

function fmt$(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function TenantEditPage() {
  const router      = useRouter();
  const { id }      = useParams<{ id: string }>();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [form, setForm]     = useState<Partial<Tenant>>({});
  const [stats, setStats]   = useState<TenantStats | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !isSuperAdmin(user.email)) { router.replace("/portal"); return; }

      Promise.all([
        fetch(`/api/super-admin/tenants/${id}`).then((r) => r.json()),
        fetch(`/api/super-admin/tenants/${id}/stats`).then((r) => r.json()),
      ]).then(([tenantData, statsData]) => {
        if (!tenantData.tenant) { router.replace("/super-admin"); return; }
        setTenant(tenantData.tenant);
        setForm(tenantData.tenant);
        if (statsData.stats) setStats(statsData.stats);
      });
    });
  }, [supabase, router, id]);

  function set(key: keyof Tenant, val: unknown) { setForm((f) => ({ ...f, [key]: val })); }

  function toggleArray(key: "enabled_sports" | "enabled_products", val: string) {
    const arr = (form[key] as string[]) ?? [];
    set(key, arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setSaved(false);
    const res = await fetch(`/api/super-admin/tenants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Something went wrong"); setSaving(false); return; }
    setTenant(data.tenant);
    setSaved(true);
    setSaving(false);
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--brand-bg)" }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--brand-primary)" }} />
      </div>
    );
  }

  const field = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10";
  const label = "block text-xs font-display uppercase tracking-wider mb-1.5";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
      <header className="border-b px-6 py-4 flex items-center gap-4" style={{ borderColor: "var(--brand-border)" }}>
        <button onClick={() => router.push("/super-admin")} className="text-sm font-display uppercase tracking-wider hover:opacity-60 transition-opacity" style={{ color: "var(--brand-muted)" }}>
          ← Back
        </button>
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.25em]" style={{ color: "var(--brand-muted)" }}>Super Admin</p>
          <h1 className="font-display text-xl font-bold uppercase tracking-wide">{tenant.name}</h1>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 flex justify-center">
        <form onSubmit={save} className="w-full max-w-2xl space-y-8">

          {/* Tenant stats summary */}
          {stats && (
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: "Orders",        value: stats.total_orders.toString() },
                { label: "Active",        value: stats.active_orders.toString() },
                { label: "Clients",       value: stats.total_clients.toString() },
                { label: "Users",         value: stats.total_users.toString() },
                { label: "Revenue",       value: fmt$(stats.total_revenue) },
              ].map(({ label: l, value }) => (
                <div key={l} className="rounded-xl border px-3 py-2.5 text-center" style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}>
                  <p className="text-[10px] font-display uppercase tracking-widest mb-0.5" style={{ color: "var(--brand-muted)" }}>{l}</p>
                  <p className="font-display font-bold text-sm">{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Identity */}
          <section className="space-y-4">
            <h2 className="font-display font-bold uppercase tracking-widest text-xs border-b pb-2" style={{ borderColor: "var(--brand-border)", color: "var(--brand-muted)" }}>Identity</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Studio Name</label>
                <input required className={field} value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div>
                <label className={label}>Slug</label>
                <input required className={field} value={form.slug ?? ""} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Owner Email</label>
                <input required type="email" className={field} value={form.owner_email ?? ""} onChange={(e) => set("owner_email", e.target.value)} />
              </div>
              <div>
                <label className={label}>Support Email</label>
                <input type="email" className={field} value={form.support_email ?? ""} onChange={(e) => set("support_email", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Custom Domain</label>
                <input className={field} value={form.custom_domain ?? ""} onChange={(e) => set("custom_domain", e.target.value)} placeholder="app.rivalathletics.com" />
              </div>
              <div>
                <label className={label}>Support URL</label>
                <input className={field} value={form.support_url ?? ""} onChange={(e) => set("support_url", e.target.value)} placeholder="https://…" />
              </div>
            </div>
            <div>
              <label className={label}>Logo URL</label>
              <input className={field} value={form.logo_url ?? ""} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://…" />
            </div>
          </section>

          {/* Plan & Pricing */}
          <section className="space-y-4">
            <h2 className="font-display font-bold uppercase tracking-widest text-xs border-b pb-2" style={{ borderColor: "var(--brand-border)", color: "var(--brand-muted)" }}>Plan & Pricing</h2>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className={label}>Plan</label>
                <select className={field} value={form.plan ?? "starter"} onChange={(e) => set("plan", e.target.value)}>
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label className={label}>Design Fee ($)</label>
                <input type="number" min="0" step="0.01" className={field} value={form.design_fee ?? 0} onChange={(e) => set("design_fee", parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <label className={label}>Commission %</label>
                <input type="number" min="0" max="100" step="0.1" className={field} value={form.commission_rate ?? 0} onChange={(e) => set("commission_rate", parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <label className={label}>Platform Fee %</label>
                <input type="number" min="0" max="100" step="0.01" className={field} value={form.platform_fee_percent ?? 0} onChange={(e) => set("platform_fee_percent", parseFloat(e.target.value) || 0)} />
              </div>
            </div>
          </section>

          {/* Stripe */}
          <section className="space-y-4">
            <h2 className="font-display font-bold uppercase tracking-widest text-xs border-b pb-2" style={{ borderColor: "var(--brand-border)", color: "var(--brand-muted)" }}>Stripe</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Connected Account ID</label>
                <input
                  className={field}
                  value={form.stripe_account_id ?? ""}
                  onChange={(e) => set("stripe_account_id", e.target.value || null)}
                  placeholder="acct_…"
                  spellCheck={false}
                />
                <p className="text-[10px] mt-1" style={{ color: "var(--brand-muted)" }}>Stripe Connect account for this tenant's payouts</p>
              </div>
              <div>
                <label className={label}>Customer ID</label>
                <input
                  className={field}
                  value={form.stripe_customer_id ?? ""}
                  onChange={(e) => set("stripe_customer_id", e.target.value || null)}
                  placeholder="cus_…"
                  spellCheck={false}
                />
                <p className="text-[10px] mt-1" style={{ color: "var(--brand-muted)" }}>Stripe customer for platform subscription billing</p>
              </div>
            </div>
          </section>

          {/* Brand Colors */}
          <section className="space-y-4">
            <h2 className="font-display font-bold uppercase tracking-widest text-xs border-b pb-2" style={{ borderColor: "var(--brand-border)", color: "var(--brand-muted)" }}>Brand Colors</h2>
            <div className="grid grid-cols-4 gap-4">
              {([
                ["brand_primary",   "Primary"],
                ["brand_secondary", "Secondary"],
                ["brand_bg",        "Background"],
                ["brand_surface",   "Surface"],
                ["brand_border",    "Border"],
                ["brand_text",      "Text"],
                ["brand_muted",     "Muted"],
              ] as [keyof Tenant, string][]).map(([key, lbl]) => (
                <div key={key} className="flex flex-col items-center gap-2">
                  <input
                    type="color"
                    className="w-12 h-12 rounded-xl border border-gray-200 cursor-pointer p-1"
                    value={(form[key] as string) ?? "#000000"}
                    onChange={(e) => set(key, e.target.value)}
                  />
                  <span className="text-[10px]" style={{ color: "var(--brand-muted)" }}>{lbl}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Product Catalog */}
          <section className="space-y-4">
            <h2 className="font-display font-bold uppercase tracking-widest text-xs border-b pb-2" style={{ borderColor: "var(--brand-border)", color: "var(--brand-muted)" }}>Product Catalog</h2>
            <div>
              <label className={label}>Enabled Sports</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {SPORTS.map((sport) => {
                  const active = (form.enabled_sports ?? []).includes(sport);
                  return (
                    <button
                      key={sport} type="button"
                      onClick={() => toggleArray("enabled_sports", sport)}
                      className={`px-3 py-1.5 rounded-full text-xs font-display uppercase tracking-wider border transition-colors ${
                        active ? "bg-black text-white border-black" : "border-gray-200 text-gray-500 hover:border-gray-400"
                      }`}
                    >
                      {sport}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className={label}>Enabled Products</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {PRODUCTS.map((product) => {
                  const active = (form.enabled_products ?? []).includes(product);
                  return (
                    <button
                      key={product} type="button"
                      onClick={() => toggleArray("enabled_products", product)}
                      className={`px-3 py-1.5 rounded-full text-xs font-display uppercase tracking-wider border transition-colors ${
                        active ? "bg-black text-white border-black" : "border-gray-200 text-gray-500 hover:border-gray-400"
                      }`}
                    >
                      {product}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {error && <p className="text-red-500 text-sm">{error}</p>}
          {saved && <p className="text-emerald-600 text-sm">Saved successfully.</p>}

          <div className="flex gap-3 pb-8">
            <button type="button" onClick={() => router.push("/super-admin")} className="px-6 py-3 rounded-lg border text-sm font-display font-bold uppercase tracking-wider transition-colors hover:bg-gray-50" style={{ borderColor: "var(--brand-border)" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-3 rounded-lg text-white text-sm font-display font-bold uppercase tracking-wider transition-opacity hover:opacity-80 disabled:opacity-50" style={{ background: "var(--brand-primary)" }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>

        </form>
      </main>
    </div>
  );
}
