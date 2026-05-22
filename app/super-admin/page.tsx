"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSuperAdmin } from "@/lib/super-admin";
import type { Tenant, TenantStats } from "@/lib/supabase/types";

const PLAN_COLORS: Record<string, string> = {
  starter:    "bg-gray-100 text-gray-600 border border-gray-200",
  pro:        "bg-blue-50 text-blue-700 border border-blue-200",
  enterprise: "bg-purple-50 text-purple-700 border border-purple-200",
};

interface PlatformStats {
  total_tenants: number;
  active_tenants: number;
  total_orders: number;
  active_orders: number;
  total_clients: number;
  total_revenue: number;
}

function fmt$(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function SuperAdminPage() {
  const router      = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  const [tenants, setTenants]         = useState<Tenant[]>([]);
  const [statsMap, setStatsMap]       = useState<Record<string, TenantStats>>({});
  const [platform, setPlatform]       = useState<PlatformStats | null>(null);
  const [loading, setLoading]         = useState(true);
  const [showNew, setShowNew]         = useState(false);
  const [inviting, setInviting]       = useState<string | null>(null);
  const [inviteDone, setInviteDone]   = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !isSuperAdmin(user.email)) { router.replace("/portal"); return; }

      Promise.all([
        fetch("/api/super-admin/tenants").then((r) => r.json()),
        fetch("/api/super-admin/stats").then((r) => r.json()),
      ]).then(([tenantsData, statsData]) => {
        const list: Tenant[] = tenantsData.tenants ?? [];
        setTenants(list);
        setPlatform(statsData.stats ?? null);
        setLoading(false);

        // Fetch per-tenant stats in parallel
        Promise.all(
          list.map((t) =>
            fetch(`/api/super-admin/tenants/${t.id}/stats`)
              .then((r) => r.json())
              .then(({ stats }) => stats as TenantStats)
          )
        ).then((results) => {
          const map: Record<string, TenantStats> = {};
          results.forEach((s) => { if (s) map[s.tenant_id] = s; });
          setStatsMap(map);
        });
      });
    });
  }, [supabase, router]);

  async function toggleActive(tenant: Tenant) {
    const res = await fetch(`/api/super-admin/tenants/${tenant.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !tenant.active }),
    });
    if (res.ok) {
      setTenants((prev) => prev.map((t) => t.id === tenant.id ? { ...t, active: !t.active } : t));
    }
  }

  async function inviteAdmin(tenant: Tenant) {
    setInviting(tenant.id); setInviteDone(null);
    const res = await fetch(`/api/super-admin/tenants/${tenant.id}/invite-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: tenant.owner_email }),
    });
    const data = await res.json() as { success?: boolean; invited?: boolean; email?: string; error?: string };
    setInviting(null);
    if (res.ok) {
      setInviteDone(tenant.id);
      setTimeout(() => setInviteDone(null), 3000);
    } else {
      alert(data.error ?? "Invite failed");
    }
  }

  async function deleteTenant(tenant: Tenant) {
    if (!confirm(`Delete "${tenant.name}"? This is irreversible.`)) return;
    const res = await fetch(`/api/super-admin/tenants/${tenant.id}`, { method: "DELETE" });
    if (res.ok) setTenants((prev) => prev.filter((t) => t.id !== tenant.id));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--brand-bg)" }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--brand-primary)" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
      <header className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: "var(--brand-border)" }}>
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.25em]" style={{ color: "var(--brand-muted)" }}>Platform</p>
          <h1 className="font-display text-xl font-bold uppercase tracking-wide">Super Admin</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/super-admin/billing")}
            className="px-4 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-widest border transition-colors hover:opacity-70"
            style={{ borderColor: "var(--brand-border)" }}
          >
            Billing
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-80"
            style={{ background: "var(--brand-primary)" }}
          >
            + New Tenant
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 flex flex-col items-center">
        <div className="w-full max-w-5xl space-y-6">

          {/* Platform stats */}
          {platform && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[
                { label: "Tenants",        value: platform.active_tenants + " / " + platform.total_tenants },
                { label: "Orders",         value: platform.total_orders.toString() },
                { label: "Active Orders",  value: platform.active_orders.toString() },
                { label: "Clients",        value: platform.total_clients.toString() },
                { label: "Revenue",        value: fmt$(platform.total_revenue) },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-xl border px-4 py-3 text-center"
                  style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}
                >
                  <p className="text-[10px] font-display uppercase tracking-widest mb-1" style={{ color: "var(--brand-muted)" }}>{label}</p>
                  <p className="font-display font-bold text-base">{value}</p>
                </div>
              ))}
            </div>
          )}

          <p className="text-sm font-barlow" style={{ color: "var(--brand-muted)" }}>
            {tenants.length} tenant{tenants.length !== 1 ? "s" : ""}
          </p>

          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--brand-border)" }}>
            <table className="w-full text-sm font-barlow">
              <thead>
                <tr className="border-b" style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)" }}>
                  <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider" style={{ color: "var(--brand-muted)" }}>Tenant</th>
                  <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider hidden sm:table-cell" style={{ color: "var(--brand-muted)" }}>Slug / Domain</th>
                  <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider" style={{ color: "var(--brand-muted)" }}>Plan</th>
                  <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider hidden md:table-cell" style={{ color: "var(--brand-muted)" }}>Stats</th>
                  <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider" style={{ color: "var(--brand-muted)" }}>Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => {
                  const s = statsMap[tenant.id];
                  return (
                    <tr
                      key={tenant.id}
                      className="border-b last:border-b-0 transition-colors"
                      style={{ borderColor: "var(--brand-border)" }}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full flex-shrink-0" style={{ background: tenant.brand_primary }} />
                          <div>
                            <p className="font-medium">{tenant.name}</p>
                            <p className="text-xs" style={{ color: "var(--brand-muted)" }}>{tenant.owner_email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden sm:table-cell">
                        <p className="font-mono text-xs">{tenant.slug}</p>
                        {tenant.custom_domain && (
                          <p className="font-mono text-xs" style={{ color: "var(--brand-muted)" }}>{tenant.custom_domain}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-display uppercase tracking-wider ${PLAN_COLORS[tenant.plan] ?? ""}`}>
                          {tenant.plan}
                        </span>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        {s ? (
                          <div className="space-y-0.5">
                            <p className="text-xs">{s.total_orders} orders <span style={{ color: "var(--brand-muted)" }}>({s.active_orders} active)</span></p>
                            <p className="text-xs">{s.total_clients} clients</p>
                            <p className="text-xs font-medium">{fmt$(s.total_revenue)}</p>
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--brand-muted)" }}>Loading…</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => toggleActive(tenant)}
                          className={`inline-block px-2.5 py-1 rounded-full text-xs font-display uppercase tracking-wider border transition-colors ${
                            tenant.active
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                              : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
                          }`}
                        >
                          {tenant.active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3 justify-end">
                          <button
                            onClick={() => inviteAdmin(tenant)}
                            disabled={inviting === tenant.id}
                            className="text-xs font-display font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
                            style={{ color: inviteDone === tenant.id ? "#10b981" : "var(--brand-muted)" }}
                          >
                            {inviting === tenant.id ? "Inviting…" : inviteDone === tenant.id ? "Invited ✓" : "Invite Admin"}
                          </button>
                          <button
                            onClick={() => router.push(`/super-admin/tenants/${tenant.id}`)}
                            className="text-xs font-display font-bold uppercase tracking-wider transition-opacity hover:opacity-60"
                            style={{ color: "var(--brand-primary)" }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteTenant(tenant)}
                            className="text-xs font-display font-bold uppercase tracking-wider text-red-500 hover:text-red-700 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {tenants.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center text-sm" style={{ color: "var(--brand-muted)" }}>
                      No tenants yet. Create your first one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {showNew && (
        <NewTenantModal
          onClose={() => setShowNew(false)}
          onCreate={(tenant) => { setTenants((prev) => [tenant, ...prev]); setShowNew(false); }}
        />
      )}
    </div>
  );
}

function NewTenantModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (t: Tenant) => void;
}) {
  const [form, setForm] = useState({
    name: "", slug: "", owner_email: "",
    plan: "starter",
    brand_primary: "#111111", brand_secondary: "#333333",
    brand_bg: "#ffffff", brand_surface: "#f5f5f5",
    brand_border: "#d4d4d4", brand_text: "#0a0a0a", brand_muted: "#888888",
    design_fee: "0", commission_rate: "0",
    custom_domain: "", support_email: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  function set(key: string, val: string) { setForm((f) => ({ ...f, [key]: val })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    const res = await fetch("/api/super-admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        design_fee:      parseFloat(form.design_fee)      || 0,
        commission_rate: parseFloat(form.commission_rate) || 0,
        slug: form.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Something went wrong"); setSaving(false); return; }
    onCreate(data.tenant);
  }

  const field = "w-full bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10";
  const label = "block text-xs font-display uppercase tracking-wider mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-display font-bold text-lg uppercase tracking-wide">New Tenant</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Studio Name</label>
              <input required className={field} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Rival Athletics" />
            </div>
            <div>
              <label className={label}>Slug</label>
              <input required className={field} value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="rival" />
            </div>
          </div>

          <div>
            <label className={label}>Owner Email</label>
            <input required type="email" className={field} value={form.owner_email} onChange={(e) => set("owner_email", e.target.value)} placeholder="owner@rival.com" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Plan</label>
              <select className={field} value={form.plan} onChange={(e) => set("plan", e.target.value)}>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className={label}>Custom Domain</label>
              <input className={field} value={form.custom_domain} onChange={(e) => set("custom_domain", e.target.value)} placeholder="app.rival.com" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Design Fee ($)</label>
              <input type="number" min="0" step="0.01" className={field} value={form.design_fee} onChange={(e) => set("design_fee", e.target.value)} />
            </div>
            <div>
              <label className={label}>Commission %</label>
              <input type="number" min="0" max="100" step="0.1" className={field} value={form.commission_rate} onChange={(e) => set("commission_rate", e.target.value)} />
            </div>
          </div>

          <div>
            <p className={label}>Brand Colors</p>
            <div className="grid grid-cols-4 gap-3">
              {(["brand_primary","brand_secondary","brand_bg","brand_text"] as const).map((key) => (
                <div key={key} className="flex flex-col items-center gap-1.5">
                  <input type="color" className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5" value={form[key]} onChange={(e) => set(key, e.target.value)} />
                  <span className="text-[10px] text-gray-400 capitalize">{key.replace("brand_","")}</span>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-display font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-black text-white text-sm font-display font-bold uppercase tracking-wider hover:bg-gray-800 transition-colors disabled:opacity-50">
              {saving ? "Creating…" : "Create Tenant"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
