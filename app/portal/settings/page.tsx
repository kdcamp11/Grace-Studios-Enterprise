"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient, sessionReady } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import OrgLogo, { invalidateOrgCache } from "@/components/OrgLogo";

const SPORTS   = ["Basketball","Football","Soccer","Baseball","Softball","Volleyball","Lacrosse","Hockey","Tennis","Wrestling","Tracksuits"];
const PRODUCTS = ["Jersey","Shorts","Tracksuit","Jacket","Hoodie","Pants","Socks"];

interface ClientProfile {
  id: string;
  name: string;
  contact_name: string | null;
  city: string | null;
  logo_url: string | null;
}

export default function PortalSettingsPage() {
  const router      = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading]   = useState(true);
  const [email, setEmail]       = useState("");
  const [client, setClient]     = useState<ClientProfile | null>(null);

  // Team fields
  const [teamName, setTeamName]       = useState("");
  const [contactName, setContactName] = useState("");
  const [city, setCity]               = useState("");
  const [logoUrl, setLogoUrl]         = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError]     = useState("");

  // Catalog
  const [enabledSports, setEnabledSports]     = useState<string[]>([]);
  const [enabledProducts, setEnabledProducts] = useState<string[]>([]);

  // Save state
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [saveError, setSaveError] = useState("");

  // Password
  const [newPw, setNewPw]       = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving]   = useState(false);
  const [pwSaved, setPwSaved]     = useState(false);
  const [pwError, setPwError]     = useState("");

  useEffect(() => {
    async function load() {
      await sessionReady();
      const profile = await getProfile();
      if (!profile) { router.replace("/login"); return; }
      // Suppliers and admins have their own settings
      if (profile.role === "supplier") { router.replace("/supplier/settings"); return; }
      if (profile.role === "admin" || profile.role === "super_admin") {
        // Admin can still view/edit client settings if they have a client row
      }
      setEmail(profile.email);

      // Load client row via admin API (bypasses RLS)
      const res = await fetch("/api/brief/client-profile");
      if (res.ok) {
        const { client: cp } = await res.json();
        if (cp && !cp.is_prefill) {
          setClient(cp);
          setTeamName(cp.name ?? "");
          setContactName(cp.contact_name ?? "");
          setCity(cp.city ?? "");
          setLogoUrl(cp.logo_url ?? null);
        }
      }

      // Load profile catalog preferences (from profiles table)
      const catRes = await fetch("/api/supplier/settings");
      if (catRes.ok) {
        // This endpoint works for any role
        const { profile: sp } = await catRes.json();
        setEnabledSports(sp?.enabled_sports ?? []);
        setEnabledProducts(sp?.enabled_products ?? []);
      }

      setLoading(false);
    }
    load();
  }, [router]);

  async function handleLogoUpload(file: File) {
    if (!client) return;
    setLogoUploading(true);
    setLogoError("");

    const ext  = file.name.split(".").pop() ?? "png";
    const path = `logos/clients/${client.id}/logo.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("assets")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadErr) {
      setLogoError(`Upload failed: ${uploadErr.message}`);
      setLogoUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(path);
    setLogoUrl(publicUrl);

    // Save to clients table
    await fetch("/api/client/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: teamName, contact_name: contactName, city, logo_url: publicUrl }),
    });

    invalidateOrgCache();
    setLogoUploading(false);
  }

  function toggleSport(sport: string) {
    setEnabledSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  }

  function toggleProduct(product: string) {
    setEnabledProducts((prev) =>
      prev.includes(product) ? prev.filter((p) => p !== product) : [...prev, product]
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    setSaved(false);

    const results = await Promise.all([
      // Save team info
      client
        ? fetch("/api/client/team", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: teamName, contact_name: contactName, city, logo_url: logoUrl }),
          })
        : Promise.resolve(null),
      // Save catalog preferences to profiles
      fetch("/api/supplier/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled_sports: enabledSports, enabled_products: enabledProducts }),
      }),
    ]);

    const failed = results.some((r) => r && !r.ok);
    if (failed) {
      setSaveError("Failed to save some settings. Please try again.");
    } else {
      invalidateOrgCache();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) { setPwError("Passwords do not match"); return; }
    if (newPw.length < 8)    { setPwError("Minimum 8 characters");   return; }
    setPwSaving(true);
    setPwError("");
    const { error: err } = await supabase.auth.updateUser({ password: newPw });
    if (err) { setPwError(err.message); }
    else     { setPwSaved(true); setNewPw(""); setConfirmPw(""); setTimeout(() => setPwSaved(false), 3000); }
    setPwSaving(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const inputCls = "w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors";
  const chipCls  = (active: boolean) =>
    `px-4 py-2 rounded-full font-display font-bold text-[10px] uppercase tracking-widest border cursor-pointer transition-colors ${
      active
        ? "bg-brand-text text-white border-brand-text"
        : "bg-brand-surface text-brand-muted border-brand-border hover:border-brand-primary hover:text-brand-primary"
    }`;

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      {/* Header — matches client portal */}
      <header className="border-b border-brand-border px-6 sm:px-10 py-5 flex items-center justify-between">
        <OrgLogo href="/portal" />
        <div className="flex items-center gap-5">
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">My Orders</a>
          <a href="/brief/choose" className="text-xs font-display font-bold uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors">+ New Order</a>
          <a href="/portfolio" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Portfolio</a>
          <a href="/contact" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Creative Direction</a>
          <a href="/billing" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Billing</a>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-10 py-12 sm:py-16">
        <div className="max-w-xl mx-auto space-y-8">

          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-brand-text">Settings</h1>
            <p className="text-sm text-brand-muted font-barlow mt-1">{email}</p>
          </div>

          <form onSubmit={handleSave} className="space-y-8">

            {/* ── Team Identity ─────────────────────────────────── */}
            {client && (
              <div className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-5">
                <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Team Identity</p>

                {/* Logo upload */}
                <div>
                  <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">
                    Team Logo
                  </label>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }}
                  />
                  <div
                    onClick={() => !logoUploading && logoInputRef.current?.click()}
                    className={`flex items-center gap-4 border border-dashed border-brand-border rounded-xl px-5 py-4 transition-colors ${logoUploading ? "opacity-60 cursor-wait" : "cursor-pointer hover:border-brand-primary"}`}
                  >
                    {logoUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={logoUrl} alt="Team logo" className="h-10 w-auto object-contain rounded flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-brand-border/40 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-brand-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-barlow text-brand-text">
                        {logoUploading ? "Uploading…" : logoUrl ? "Logo uploaded" : "Upload logo"}
                      </p>
                      <p className="text-xs font-barlow text-brand-muted mt-0.5">
                        {logoUrl ? "Click to replace" : "PNG, JPG, SVG, shown in your client profile"}
                      </p>
                    </div>
                  </div>
                  {logoError && <p className="text-xs text-red-500 mt-1.5">{logoError}</p>}
                </div>

                <div>
                  <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">
                    Team / Program Name
                  </label>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="e.g. Westside Warriors"
                    required
                    className={inputCls}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">Contact Name</label>
                    <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Coach Johnson" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">City</label>
                    <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Atlanta, GA" className={inputCls} />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">Email Address</label>
                  <input type="email" value={email} disabled className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3 text-brand-muted font-barlow text-sm cursor-not-allowed" />
                </div>
              </div>
            )}

            {/* ── Product Catalog ───────────────────────────────── */}
            <div className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-5">
              <div>
                <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Product Catalog</p>
                <p className="text-[11px] font-barlow text-brand-muted mt-1">
                  Select the sports and products your program needs. This helps us match you with the right designs.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2.5">Sports</label>
                <div className="flex flex-wrap gap-2">
                  {SPORTS.map((sport) => (
                    <button key={sport} type="button" onClick={() => toggleSport(sport)} className={chipCls(enabledSports.includes(sport))}>
                      {sport}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2.5">Products</label>
                <div className="flex flex-wrap gap-2">
                  {PRODUCTS.map((product) => (
                    <button key={product} type="button" onClick={() => toggleProduct(product)} className={chipCls(enabledProducts.includes(product))}>
                      {product}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {saveError && (
              <p className="text-sm font-barlow text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{saveError}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-4 rounded-lg bg-brand-text text-white font-display font-bold text-sm uppercase tracking-widest hover:opacity-80 disabled:opacity-40 transition-all"
            >
              {saved ? "Saved ✓" : saving ? "Saving…" : "Save Settings"}
            </button>
          </form>

          {/* ── Password ─────────────────────────────────────────── */}
          <form onSubmit={changePassword} className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-4">
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Change Password</p>
            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">New Password</label>
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Min. 8 characters" minLength={8} className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">Confirm Password</label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Repeat new password"
                className={`${inputCls} ${confirmPw && confirmPw !== newPw ? "border-red-400 focus:border-red-400" : ""}`}
              />
            </div>
            {pwError && <p className="text-xs text-red-500">{pwError}</p>}
            {pwSaved && <p className="text-xs text-emerald-600">Password updated ✓</p>}
            <button
              type="submit"
              disabled={pwSaving || !newPw}
              className="w-full py-3 rounded-lg bg-brand-primary text-white font-display font-bold text-sm uppercase tracking-widest hover:bg-brand-secondary disabled:opacity-40 transition-colors"
            >
              {pwSaving ? "Saving…" : "Update Password"}
            </button>
          </form>

        </div>
      </main>

      <footer className="border-t border-brand-border px-6 py-5 text-center">
        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted">Grace Studios · Program Partner Portal</p>
      </footer>
    </div>
  );
}
