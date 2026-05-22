"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface BriefData {
  teamName: string;
  setTeamName: (v: string) => void;
  sport: string;
  setSport: (v: string) => void;
  designSystem: string;
  setDesignSystem: (v: string) => void;
  logoFile: File | null;
  setLogoFile: (v: File | null) => void;
  colorDirection: string;
  setColorDirection: (v: string) => void;
  references: string;
  setReferences: (v: string) => void;
}

const BriefContext = createContext<BriefData | null>(null);

export function BriefProvider({ children }: { children: ReactNode }) {
  const [teamName, setTeamName] = useState("Northside Elite");
  const [sport, setSport] = useState("");
  const [designSystem, setDesignSystem] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [colorDirection, setColorDirection] = useState("");
  const [references, setReferences] = useState("");

  return (
    <BriefContext.Provider
      value={{
        teamName, setTeamName,
        sport, setSport,
        designSystem, setDesignSystem,
        logoFile, setLogoFile,
        colorDirection, setColorDirection,
        references, setReferences,
      }}
    >
      {children}
    </BriefContext.Provider>
  );
}

export function useBrief() {
  const ctx = useContext(BriefContext);
  if (!ctx) throw new Error("useBrief must be used within BriefProvider");
  return ctx;
}
