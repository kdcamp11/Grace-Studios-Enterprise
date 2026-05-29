"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import TenantLogo from "@/components/TenantLogo";
import MobileDropdown from "@/components/MobileDropdown";

const SPORTS = ["Basketball", "Tracksuits", "Football", "Soccer", "Baseball", "Volleyball", "Other"];

interface PortfolioItem {
  id: string;
  image_url: string;
  caption: string | null;
  sport: string | null;
  created_at: string;
}

export default function SupplierPortfolioPage() {
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [items, setItems]       = useState<PortfolioItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError]       = useState("");

  // Form state
  const [imageUrl, setImageUrl] = useState("");
  const [sport, setSport]       = useState("");
  const [caption, setCaption]   = useState("");
  const [previewOk, setPreviewOk] = useState<boolean | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const profile = await getProfile();
      if (!profile || (profile.role !== "supplier" && profile.role !== "admin")) {
        router.replace("/portal");
        return;
      }
      const res = await fetch("/api/supplier/portfolio");
      if (res.ok) {
        const { items: data } = await res.json();
        setItems(data ?? []);
      }
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!imageUrl.trim() || !sport) return;
    setSaving(true);
    setError("");

    const res = await fetch("/api/supplier/portfolio", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ image_url: imageUrl.trim(), sport, caption: caption || null }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to save");
    } else {
      setItems((prev) => [data.item, ...prev]);
      setImageUrl("");
      setSport("");
      setCaption("");
      setPreviewOk(null);
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    await fetch(`/api/supplier/portfolio/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDeleting(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const inputCls = "w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors";

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <TenantLogo className="h-7" href="/supplier" />
          <a href="/supplier" className="text-xs font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors">
            Supplier Portal
          </a>
        </div>
        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-5">
          <a href="/supplier" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Orders</a>
          <a href="/supplier/portfolio" className="text-xs font-display font-bold uppercase tracking-wider text-brand-primary">Portfolio</a>
          <a href="/settings" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Settings</a>
          <button
            type="button"
            onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}
            className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
          >
            Sign Out
          </button>
        </div>
        {/* Mobile nav */}
        <div className="lg:hidden">
          <MobileDropdown
            groups={[
              [
                { label: "Orders", href: "/supplier" },
                { label: "Portfolio", href: "/supplier/portfolio" },
                { label: "Settings", href: "/settings" },
              ],
              [{ label: "Sign Out", onClick: async () => { await supabase.auth.signOut(); router.replace("/login"); } }],
            ]}
          />
        </div>
      </header>

      <main className="flex-1 px-4 py-10 max-w-4xl mx-auto w-full space-y-10">

        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-brand-text">Portfolio</h1>
          <p className="text-sm text-brand-muted font-barlow mt-1">
            Link photos of your past work. These appear on the studio&apos;s public gallery and help admins assign you to the right orders.
          </p>
        </div>

        {/* Add form */}
        <form onSubmit={handleSubmit} className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-5">
          <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Add Work</p>

          {/* URL input + live preview */}
          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-2">
              Image URL
            </label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => { setImageUrl(e.target.value); setPreviewOk(null); }}
              placeholder="https://i.imgur.com/example.jpg"
              required
              className={inputCls}
            />
            <p className="text-[10px] font-barlow text-brand-muted mt-1.5 opacity-70">
              Paste a direct link to an image: Imgur, Dropbox, Google Drive (shared), your own site, etc.
            </p>

            {/* Preview */}
            {imageUrl.trim() && (
              <div className="mt-3">
                <img
                  src={imageUrl.trim()}
                  alt="Preview"
                  onLoad={() => setPreviewOk(true)}
                  onError={() => setPreviewOk(false)}
                  className={`max-h-48 rounded-lg border object-cover transition-opacity ${previewOk === false ? "opacity-0" : "opacity-100"}`}
                />
                {previewOk === false && (
                  <p className="text-xs font-barlow text-amber-400 mt-1">
                    Could not load image. Make sure the URL points directly to an image file.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Sport */}
          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-2">Sport</label>
            <div className="flex flex-wrap gap-2">
              {SPORTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSport(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-barlow font-medium transition-all
                    ${sport === s
                      ? "bg-brand-primary text-white"
                      : "bg-brand-bg border border-brand-border text-brand-muted hover:border-brand-primary hover:text-brand-text"
                    }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Caption */}
          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-2">
              Caption <span className="normal-case opacity-60">(optional)</span>
            </label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="e.g. Custom reversible set, Westside Warriors"
              className={inputCls}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm font-barlow bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !imageUrl.trim() || !sport || previewOk === false}
            className="w-full py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary disabled:opacity-40 transition-all"
          >
            {saving ? "Saving…" : "Add to Portfolio"}
          </button>
        </form>

        {/* Grid */}
        {items.length === 0 ? (
          <div className="border border-brand-border rounded-xl p-12 text-center">
            <p className="text-brand-muted font-barlow text-sm">No portfolio items yet.</p>
            <p className="text-xs text-brand-muted font-barlow mt-1 opacity-60">
              Link photos of your best work to stand out when admins assign orders.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-4">
              {items.length} item{items.length !== 1 ? "s" : ""}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {items.map((item) => (
                <div key={item.id} className="group bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
                  <div className="aspect-square overflow-hidden">
                    <img
                      src={item.image_url}
                      alt={item.caption ?? "Portfolio item"}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {item.sport && (
                        <span className="text-[10px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/30">
                          {item.sport}
                        </span>
                      )}
                      {item.caption && (
                        <p className="text-xs font-barlow text-brand-muted mt-1.5 leading-relaxed line-clamp-2">
                          {item.caption}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={deleting === item.id}
                      className="text-[10px] font-display uppercase tracking-wider text-brand-muted hover:text-red-400 transition-colors disabled:opacity-40 flex-shrink-0 mt-0.5"
                    >
                      {deleting === item.id ? "…" : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
