"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import TenantLogo from "@/components/TenantLogo";

interface Notification {
  id: string;
  title: string;
  message: string | null;
  type: string;
  order_id: string | null;
  read_at: string | null;
  created_at: string;
}

interface AdminHeaderProps {
  onSignOut?: () => void;
  activePath?: string;
}

export default function AdminHeader({ onSignOut, activePath }: AdminHeaderProps) {
  const [unread, setUnread]         = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [bellOpen, setBellOpen]     = useState(false);
  const [menuOpen, setMenuOpen]     = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setNotifications(d.notifications ?? []);
        setUnread(d.count ?? 0);
      });
  }, []);

  // Close dropdowns on outside click
  const closeDropdowns = useCallback((e: MouseEvent) => {
    if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
      setBellOpen(false);
    }
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setMenuOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", closeDropdowns);
    return () => document.removeEventListener("mousedown", closeDropdowns);
  }, [closeDropdowns]);

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: new Date().toISOString() })));
    setUnread(0);
  }

  function navLink(href: string, label: string) {
    const active = activePath === href || activePath?.startsWith(href + "/");
    return (
      <a
        href={href}
        className={`text-xs font-display font-bold uppercase tracking-wider transition-colors ${
          active ? "text-brand-primary" : "text-brand-muted hover:text-brand-primary"
        }`}
      >
        {label}
      </a>
    );
  }

  // Shared bell button used in both desktop and mobile views
  const BellButton = (
    <div ref={bellRef} className="relative">
      <button
        type="button"
        onClick={() => setBellOpen((v) => !v)}
        className="relative text-brand-muted hover:text-brand-primary transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-brand-primary text-white text-[9px] font-display font-bold flex items-center justify-center leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {bellOpen && (
        <div className="absolute right-0 top-7 w-80 bg-brand-surface border border-brand-border rounded-xl shadow-lg overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} className="text-[10px] font-barlow text-brand-muted hover:text-brand-primary transition-colors">
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs font-barlow text-brand-muted">No notifications yet</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-brand-border">
              {notifications.map((n) => (
                <div key={n.id} className={`px-4 py-3 ${!n.read_at ? "bg-brand-primary/5" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xs font-barlow font-medium ${!n.read_at ? "text-brand-text" : "text-brand-muted"}`}>
                      {n.title}
                    </p>
                    {!n.read_at && <span className="w-1.5 h-1.5 rounded-full bg-brand-primary flex-shrink-0 mt-1" />}
                  </div>
                  {n.message && (
                    <p className="text-[11px] font-barlow text-brand-muted mt-0.5 leading-snug">{n.message}</p>
                  )}
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] font-barlow text-brand-muted">
                      {new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {n.order_id && (
                      <a href={`/admin/orders/${n.order_id}`} className="text-[10px] font-display uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors">
                        View →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <header className="border-b border-brand-border px-5 sm:px-6 py-4 flex items-center justify-between sticky top-0 bg-brand-bg z-40">
      <TenantLogo href="/admin" />

      {/* ── Desktop nav ── */}
      <nav className="hidden lg:flex items-center gap-5">
        {navLink("/admin/workflow",  "Workflow")}
        {navLink("/admin/suppliers", "Suppliers")}
        {navLink("/admin/team",      "Team")}
        {navLink("/portal",          "Client Portal")}
        {navLink("/supplier",        "Supplier Portal")}
        {navLink("/admin/billing",   "Billing")}
        {navLink("/admin/settings",  "Settings")}
        {BellButton}
        {onSignOut && (
          <button type="button" onClick={onSignOut}
            className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">
            Sign Out
          </button>
        )}
      </nav>

      {/* ── Mobile: bell + hamburger ── */}
      <div className="lg:hidden flex items-center gap-3">
        {BellButton}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex flex-col gap-[5px] p-1.5 text-brand-muted hover:text-brand-primary transition-colors"
            aria-label="Menu"
          >
            <span className={`block w-5 h-[2px] bg-current transition-all duration-200 ${menuOpen ? "rotate-45 translate-y-[7px]" : ""}`} />
            <span className={`block w-5 h-[2px] bg-current transition-all duration-200 ${menuOpen ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-[2px] bg-current transition-all duration-200 ${menuOpen ? "-rotate-45 -translate-y-[7px]" : ""}`} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-10 w-52 bg-brand-surface border border-brand-border rounded-xl shadow-lg overflow-hidden z-50">
              <div className="py-2 divide-y divide-brand-border">
                <div className="py-1">
                  {[
                    { href: "/admin/workflow",  label: "Workflow"        },
                    { href: "/admin/suppliers", label: "Suppliers"       },
                    { href: "/admin/team",      label: "Team"            },
                    { href: "/admin/billing",   label: "Billing"         },
                    { href: "/admin/settings",  label: "Settings"        },
                  ].map(({ href, label }) => {
                    const active = activePath === href || activePath?.startsWith(href + "/");
                    return (
                      <a key={href} href={href}
                        onClick={() => setMenuOpen(false)}
                        className={`block px-4 py-2.5 text-xs font-display font-bold uppercase tracking-wider transition-colors
                          ${active ? "text-brand-primary bg-brand-primary/5" : "text-brand-muted hover:text-brand-primary hover:bg-brand-primary/5"}`}>
                        {label}
                      </a>
                    );
                  })}
                </div>
                <div className="py-1">
                  {[
                    { href: "/portal",   label: "Client Portal"   },
                    { href: "/supplier", label: "Supplier Portal"  },
                  ].map(({ href, label }) => (
                    <a key={href} href={href}
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2.5 text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary hover:bg-brand-primary/5 transition-colors">
                      {label}
                    </a>
                  ))}
                </div>
                {onSignOut && (
                  <div className="py-1">
                    <button type="button"
                      onClick={() => { setMenuOpen(false); onSignOut(); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary hover:bg-brand-primary/5 transition-colors">
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
