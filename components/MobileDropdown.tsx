"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface DropdownItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface MobileDropdownProps {
  /** Each inner array is a visual group separated by a divider line */
  groups: DropdownItem[][];
}

export default function MobileDropdown({ groups }: MobileDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [handleOutside]);

  return (
    <div ref={ref} className="relative">
      {/* Hamburger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex flex-col gap-[5px] p-1.5 text-brand-muted hover:text-brand-primary transition-colors"
        aria-label={open ? "Close menu" : "Open menu"}
      >
        <span className={`block w-5 h-[2px] bg-current transition-all duration-200 ${open ? "rotate-45 translate-y-[7px]" : ""}`} />
        <span className={`block w-5 h-[2px] bg-current transition-all duration-200 ${open ? "opacity-0" : ""}`} />
        <span className={`block w-5 h-[2px] bg-current transition-all duration-200 ${open ? "-rotate-45 -translate-y-[7px]" : ""}`} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute right-0 top-10 w-52 bg-brand-surface border border-brand-border rounded-xl shadow-lg overflow-hidden z-50">
            <div className="py-2 divide-y divide-brand-border">
              {groups.map((group, gi) => (
                <div key={gi} className="py-1">
                  {group.map((item) =>
                    item.href ? (
                      <a
                        key={item.label}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="block px-4 py-2.5 text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary hover:bg-brand-primary/5 transition-colors"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => { setOpen(false); item.onClick?.(); }}
                        className="w-full text-left px-4 py-2.5 text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary hover:bg-brand-primary/5 transition-colors"
                      >
                        {item.label}
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
