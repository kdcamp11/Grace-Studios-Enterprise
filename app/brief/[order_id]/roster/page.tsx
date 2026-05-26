"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import BriefLayout from "@/components/brief/BriefLayout";
import { clearBriefState } from "@/lib/brief-state";
import type { RosterPlayer } from "@/types/database";

const SIZES = ["YS", "YM", "YL", "YXL", "AS", "AM", "AL", "AXL", "A2XL", "A3XL"];
const CUTS = ["Mens", "Womens", "Youth"];
const COLUMNS = ["name", "number", "size", "cut"] as const;

function emptyPlayer(): RosterPlayer {
  return { name: "", number: "", size: "", cut: "" };
}

export default function RosterPage() {
  const router = useRouter();
  const { order_id } = useParams<{ order_id: string }>();
  const tableRef = useRef<HTMLTableElement>(null);

  const [players, setPlayers] = useState<RosterPlayer[]>([emptyPlayer()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updatePlayer(index: number, field: keyof RosterPlayer, value: string) {
    setPlayers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addRow() {
    setPlayers((prev) => [...prev, emptyPlayer()]);
  }

  function removeRow(index: number) {
    setPlayers((prev) => prev.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>, rowIndex: number, colName: typeof COLUMNS[number]) {
    const colIndex = COLUMNS.indexOf(colName);
    const isLastCol = colIndex === COLUMNS.length - 1;
    const isLastRow = rowIndex === players.length - 1;

    if (e.key === "Tab" && !e.shiftKey && isLastCol) {
      e.preventDefault();
      if (isLastRow) {
        addRow();
        setTimeout(() => {
          const rows = tableRef.current?.querySelectorAll("tbody tr");
          const firstInput = rows?.[rowIndex + 1]?.querySelector<HTMLInputElement>("input");
          firstInput?.focus();
        }, 0);
      } else {
        const rows = tableRef.current?.querySelectorAll("tbody tr");
        const firstInput = rows?.[rowIndex + 1]?.querySelector<HTMLInputElement>("input");
        firstInput?.focus();
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (isLastRow) {
        addRow();
        setTimeout(() => {
          const rows = tableRef.current?.querySelectorAll("tbody tr");
          const firstInput = rows?.[rowIndex + 1]?.querySelector<HTMLInputElement>("input");
          firstInput?.focus();
        }, 0);
      } else {
        const rows = tableRef.current?.querySelectorAll("tbody tr");
        const firstInput = rows?.[rowIndex + 1]?.querySelector<HTMLInputElement>("input");
        firstInput?.focus();
      }
    }
  }

  async function saveAndFinish(roster: RosterPlayer[], hasPlayers: boolean) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/brief/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id,
          player_roster: hasPlayers ? roster : null,
          player_names: hasPlayers,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json() as { error: string };
        throw new Error(error);
      }
      clearBriefState();
      // Go directly to concepts page so the user sees the live generation progress bar
      router.push(`/orders/${order_id}/concepts`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
      setSaving(false);
    }
  }

  function handleSkip() {
    saveAndFinish([], false);
  }

  function handleContinue() {
    const filled = players.filter((p) => p.name || p.number);
    saveAndFinish(filled, filled.length > 0);
  }

  const filledCount = players.filter((p) => p.name || p.number).length;

  return (
    <BriefLayout
      currentStep={6}
      title="Player Roster"
      subtitle="Optional: add player names, numbers, sizes, and cuts. Tab across columns, Enter to add rows."
    >
      <div className="space-y-5">
        <div className="overflow-x-auto rounded-xl border border-brand-border">
          <table ref={tableRef} className="w-full text-sm font-barlow">
            <thead>
              <tr className="border-b border-brand-border bg-brand-surface">
                <th className="w-8 py-3 px-3 text-left text-xs font-display uppercase tracking-wider text-brand-muted">#</th>
                <th className="py-3 px-3 text-left text-xs font-display uppercase tracking-wider text-brand-muted">Name</th>
                <th className="w-20 py-3 px-3 text-left text-xs font-display uppercase tracking-wider text-brand-muted">Number</th>
                <th className="w-24 py-3 px-3 text-left text-xs font-display uppercase tracking-wider text-brand-muted">Size</th>
                <th className="w-24 py-3 px-3 text-left text-xs font-display uppercase tracking-wider text-brand-muted">Cut</th>
                <th className="w-10 py-3 px-2" />
              </tr>
            </thead>
            <tbody>
              {players.map((player, i) => (
                <tr key={i} className="border-b border-brand-border last:border-b-0 hover:bg-brand-surface/50">
                  <td className="py-2 px-3 text-brand-muted text-xs select-none">{i + 1}</td>
                  <td className="py-1.5 px-2">
                    <input
                      type="text"
                      value={player.name}
                      onChange={(e) => updatePlayer(i, "name", e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, i, "name")}
                      placeholder="Player name"
                      className="w-full bg-transparent text-brand-text placeholder-brand-border focus:outline-none py-1"
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="text"
                      value={player.number}
                      onChange={(e) => updatePlayer(i, "number", e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, i, "number")}
                      placeholder="00"
                      maxLength={3}
                      className="w-full bg-transparent text-brand-text placeholder-brand-border focus:outline-none py-1"
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <select
                      value={player.size}
                      onChange={(e) => updatePlayer(i, "size", e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, i, "size")}
                      className="w-full bg-transparent text-brand-text focus:outline-none py-1 cursor-pointer"
                    >
                      <option value="" className="bg-brand-surface">—</option>
                      {SIZES.map((s) => <option key={s} value={s} className="bg-brand-surface">{s}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 px-2">
                    <select
                      value={player.cut}
                      onChange={(e) => updatePlayer(i, "cut", e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, i, "cut")}
                      className="w-full bg-transparent text-brand-text focus:outline-none py-1 cursor-pointer"
                    >
                      <option value="" className="bg-brand-surface">—</option>
                      {CUTS.map((c) => <option key={c} value={c} className="bg-brand-surface">{c}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 px-2">
                    {players.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="text-brand-border hover:text-red-400 transition-colors"
                        aria-label="Remove row"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={addRow}
          className="text-brand-muted hover:text-brand-primary text-sm font-barlow flex items-center gap-1.5 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add player
        </button>

        {filledCount > 0 && (
          <p className="text-xs text-brand-muted font-barlow">
            {filledCount} player{filledCount !== 1 ? "s" : ""} entered
          </p>
        )}

        {error && (
          <p className="text-red-400 text-sm font-barlow bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleSkip}
            disabled={saving}
            className="px-6 py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-muted transition-colors disabled:opacity-40"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={saving}
            className="flex-1 py-3 rounded-lg font-display font-bold text-base uppercase tracking-widest transition-all duration-200
              bg-brand-primary text-brand-bg hover:bg-brand-secondary
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Finish & View Concepts →"}
          </button>
        </div>
      </div>
    </BriefLayout>
  );
}
