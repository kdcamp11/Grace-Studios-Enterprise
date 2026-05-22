"use client";

import { Fragment } from "react";

const STEPS = ["Sport", "Style", "Direction"] as const;

export function StepBar({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex items-start w-full">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;

        return (
          <Fragment key={n}>
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              {/* Circle */}
              <div
                className={[
                  "w-6 h-6 rounded-full flex items-center justify-center transition-colors",
                  active
                    ? "bg-gold"
                    : done
                    ? "border border-gold"
                    : "border border-border",
                ].join(" ")}
              >
                {done ? (
                  <svg viewBox="0 0 10 10" fill="none" className="w-2.5 h-2.5">
                    <path
                      d="M1.5 5l2.5 2.5L8.5 2"
                      stroke="#C4A35A"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span
                    className={[
                      "font-display text-[11px] font-bold leading-none",
                      active ? "text-background" : "text-white/30",
                    ].join(" ")}
                  >
                    {n}
                  </span>
                )}
              </div>
              {/* Label */}
              <span
                className={[
                  "font-display text-[9px] tracking-[0.15em] uppercase",
                  active ? "text-gold" : done ? "text-white/40" : "text-white/25",
                ].join(" ")}
              >
                {label}
              </span>
            </div>

            {/* Connector — mt-3 aligns to center of 24px circle */}
            {i < STEPS.length - 1 && (
              <div
                className={[
                  "flex-1 h-px mt-3 mx-2",
                  done ? "bg-gold/40" : "bg-border",
                ].join(" ")}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
