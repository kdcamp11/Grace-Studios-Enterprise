"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import BriefLayout from "@/components/brief/BriefLayout";
import { clearBriefState } from "@/lib/brief-state";
import { createClient } from "@/lib/supabase/client";
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
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
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
      await supabase
        .from("briefs")
        .update({
          player_roster: hasPlayers ? roster : null,
          player_names: hasPlayers,
        })
        .eq("order_id", order_id);

      clearBriefState();
      router.push(`/portal?submitted=${order_id}`);
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
      subtitle="Optional — add player names, numbers, sizes, and cuts. Tab across columns, Enter to add rows."
    >
      <div className="space-y-5">
        <div className="overflow-x-auto rounded-xl border border-gs-border">
          <table ref={tableRef} className="w-full text-sm font-barlow">
            <thead>
              <tr className="border-b border-gs-border bg-gs-dark-3">
                <th className="w-8 py-3 px-3 text-left text-xs font-display uppercase tracking-wider text-gs-muted">#</th>
                <th className="py-3 px-3 text-left text-xs font-display uppercase tracking-wider text-gs-muted">Name</th>
                <th className="w-20 py-3 px-3 text-left text-xs font-display uppercase tracking-wider text-gs-muted">Number</th>
                <th className="w-24 py-3 px-3 text-left text-xs font-display uppercase tracking-wider text-gs-muted">Size</th>
                <th className="w-24 py-3 px-3 text-left text-xs font-display uppercase tracking-wider text-gs-muted">Cut</th>
                <th className="w-10 py-3 px-2" />
              </tr>
            </thead>
            <tbody>
              {players.map((player, i) => (
                <tr key={i} className="border-b border-gs-border last:border-b-0 hover:bg-gs-dark-3/50">
                  <td className="py-2 px-3 text-gs-muted text-xs select-none">{i + 1}</td>
                  <td className="py-1.5 px-2">
                    <input
                      type="text"
                      value={player.name}
                      onChange={(e) => updatePlayer(i, "name", e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, i, "name")}
                      placeholder="Player name"
                      className="w-full bg-transparent text-gs-white placeholder-gs-border focus:outline-none py-1"
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
                      className="w-full bg-transparent text-gs-white placeholder-gs-border focus:outline-none py-1"
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <select
                      value={player.size}
                      onChange={(e) => updatePlayer(i, "size", e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, i, "size")}
                      className="w-full bg-transparent text-gs-white focus:outline-none py-1 cursor-pointer"
                    >
                      <option value="" className="bg-gs-dark-3">—</option>
                      {SIZES.map((s) => <option key={s} value={s} className="bg-gs-dark-3">{s}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 px-2">
                    <select
                      value={player.cut}
                      onChange={(e) => updatePlayer(i, "cut", e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, i, "cut")}
                      className="w-full bg-transparent text-gs-white focus:outline-none py-1 cursor-pointer"
                    >
                      <option value="" className="bg-gs-dark-3">—</option>
                      {CUTS.map((c) => <option key={c} value={c} className="bg-gs-dark-3">{c}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 px-2">
                    {players.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="text-gs-border hover:text-red-400 transition-colors"
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
          className="text-gs-muted hover:text-gs-gold text-sm font-barlow flex items-center gap-1.5 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add player
        </button>

        {filledCount > 0 && (
          <p className="text-xs text-gs-muted font-barlow">
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
            className="px-6 py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest border border-gs-border text-gs-muted hover:text-gs-white hover:border-gs-muted transition-colors disabled:opacity-40"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={saving}
            className="flex-1 py-3 rounded-lg font-display font-bold text-base uppercase tracking-widest transition-all duration-200
              bg-gs-gold text-gs-dark hover:bg-gs-gold-light
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Finish & View Concepts →"}
          </button>
        </div>
      </div>
    </BriefLayout>
  );
}
