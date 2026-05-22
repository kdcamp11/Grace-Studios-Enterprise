"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/AdminHeader";
import type { Tenant } from "@/lib/supabase/types";

const SPORTS   = ["basketball","football","soccer","baseball","softball","volleyball","lacrosse","hockey","tennis","wrestling"];
const PRODUCTS = ["jersey","shorts","tracksuit","jacket","hoodie","pants","socks"];

const COLORS: [keyof Tenant, string][] = [
  ["brand_primary",   "Primary"],
  ["brand_secondary", "Secondary"],
  ["brand_bg",        "Background"],
  ["brand_surface",   "Surface"],
  ["brand_border",    "Border"],
  ["brand_text",      "Text"],
  ["brand_muted",     "Muted"],
];

export default function AdminSettingsPage() {
  const router      = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm]         = useState<Partial<Tenant>>({});
  const [tenantId, setTenantId] = useState<string>("");
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    getProfile().then((profile) => {
      if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
        router.replace("/portal");
        return;
      }
      fetch("/api/admin/settings")
        .then((r) => r.json())
        .then(({ tenant, error }: { tenant?: Tenant; error?: string }) => {
          if (!tenant) { setError(error ?? "Failed to load settings"); setLoading(false); return; }
          setForm(tenant);
          setTenantId(tenant.id);
          setLoading(false);
        });
    });
  }, [router]);

  function set(key: keyof Tenant, val: unknown) {
    setForm((f) => ({ ...f, [key]: val }));
    setSaved(false);
  }

  function toggleArray(key: "enabled_sports" | "enabled_products", val: string) {
    const arr = (form[key] as string[]) ?? [];
    set(key, arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  }

  async function handleLogoUpload(file: File) {
    if (!tenantId) return;
    setUploading(true);
    setError("");

    const ext  = file.name.split(".").pop() ?? "png";
    const path = `logos/${tenantId}/logo.${ext}`;
    const supabase = createClient();

    const { error: uploadError } = await supabase.storage
      .from("assets")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setError(`Upload failed: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(path);
    set("logo_url", publicUrl);
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json() as { tenant?: Tenant; error?: string };

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      setSaving(false);
      return;
    }

    setForm(data.tenant!);
    setSaved(true);
    setSaving(false);

    // Refresh the page so TenantProvider picks up new brand colors
    setTimeout(() => window.location.reload(), 800);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const field = "w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2.5 text-brand-text text-sm focus:outline-none focus:border-brand-primary transition-colors";
  const label = "block text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5";
  const section = "space-y-4 bg-brand-surface border border-brand-border rounded-xl p-6";

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <AdminHeader activePath="/admin/settings" />

      <main className="flex-1 px-4 py-8 flex justify-center">
        <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-6">

          {/* Identity */}
          <section className={section}>
            <h2 className="font-display font-bold uppercase tracking-widest text-xs text-brand-muted border-b border-brand-border pb-3">
              Identity
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Studio Name</label>
                <input
                  required
                  className={field}
                  value={form.name ?? ""}
                  onChange={(e) => set("name", e.target.value)}
                />
              </div>
              <div>
                <label className={label}>Support Email</label>
                <input
                  type="email"
                  className={field}
                  value={form.support_email ?? ""}
                  onChange={(e) => set("support_email", e.target.value)}
                  placeholder="support@yourstudio.com"
                />
              </div>
            </div>
            <div>
              <label className={label}>Logo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }}
              />
              <div
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={`flex items-center gap-4 border border-dashed border-brand-border rounded-xl px-5 py-4 transition-colors ${uploading ? "opacity-60 cursor-wait" : "cursor-pointer hover:border-brand-primary"}`}
              >
                {form.logo_url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.logo_url} alt="Logo" className="h-10 w-auto object-contain rounded flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-barlow text-brand-text">{uploading ? "Uploading…" : "Logo uploaded"}</p>
                      <p className="text-xs text-brand-muted font-barlow mt-0.5">Click to replace</p>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-10 h-10 rounded-lg bg-brand-border flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-brand-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-barlow text-brand-text">{uploading ? "Uploading…" : "Upload logo"}</p>
                      <p className="text-xs text-brand-muted font-barlow mt-0.5">PNG, JPG, SVG or WebP</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Brand Colors */}
          <section className={section}>
            <h2 className="font-display font-bold uppercase tracking-widest text-xs text-brand-muted border-b border-brand-border pb-3">
              Brand Colors
            </h2>
            <div className="grid grid-cols-4 gap-4">
              {COLORS.map(([key, lbl]) => (
                <div key={key} className="flex flex-col items-center gap-2">
                  <div className="relative">
                    <input
                      type="color"
                      className="w-12 h-12 rounded-xl border border-brand-border cursor-pointer p-1 bg-brand-surface"
                      value={(form[key] as string) ?? "#000000"}
                      onChange={(e) => set(key, e.target.value)}
                    />
                  </div>
                  <span className="text-[10px] font-display uppercase tracking-wider text-brand-muted text-center">
                    {lbl}
                  </span>
                  <span className="text-[9px] font-mono text-brand-muted opacity-60">
                    {(form[key] as string) ?? ""}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Product Catalog */}
          <section className={section}>
            <h2 className="font-display font-bold uppercase tracking-widest text-xs text-brand-muted border-b border-brand-border pb-3">
              Product Catalog
            </h2>
            <div>
              <label className={label}>Sports</label>
              <div className="flex flex-wrap gap-2">
                {SPORTS.map((sport) => {
                  const active = (form.enabled_sports ?? []).includes(sport);
                  return (
                    <button
                      key={sport}
                      type="button"
                      onClick={() => toggleArray("enabled_sports", sport)}
                      className={`px-3 py-1.5 rounded-full text-xs font-display uppercase tracking-wider border transition-colors ${
                        active
                          ? "bg-brand-primary text-white border-brand-primary"
                          : "border-brand-border text-brand-muted hover:border-brand-primary hover:text-brand-text"
                      }`}
                    >
                      {sport}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className={label}>Products</label>
              <div className="flex flex-wrap gap-2">
                {PRODUCTS.map((product) => {
                  const active = (form.enabled_products ?? []).includes(product);
                  return (
                    <button
                      key={product}
                      type="button"
                      onClick={() => toggleArray("enabled_products", product)}
                      className={`px-3 py-1.5 rounded-full text-xs font-display uppercase tracking-wider border transition-colors ${
                        active
                          ? "bg-brand-primary text-white border-brand-primary"
                          : "border-brand-border text-brand-muted hover:border-brand-primary hover:text-brand-text"
                      }`}
                    >
                      {product}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {error && (
            <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-4 pb-8">
            {saved && (
              <p className="text-sm font-barlow text-emerald-500">
                Settings saved — reloading…
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-8 py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </div>

        </form>
      </main>
    </div>
  );
}
