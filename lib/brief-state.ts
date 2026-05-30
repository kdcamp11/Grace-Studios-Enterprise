import type { BriefState } from "@/types/database";

const STORAGE_KEY = "gs_brief_draft";

export const defaultBriefState: BriefState = {
  teamName: "",
  contactName: "",
  email: "",
  city: "",
  sport: "",
  orderId: "",
  designId: "",
  clientId: "",
  designSystem: "",
  jerseycut: "",
  sublimated: null,
  primaryColor: "",
  secondaryColor: "",
  accentColor: "",
  logoUrls: [],
  referenceImageUrls: [],
  gsLogoPlacement: "",
  visionPrompt: "",
  numberStyle: "",
  logosToInclude: "",
  sponsorText: "",
  negativeReferences: "",
  playerRoster: [],
  playerNames: false,
};

export function loadBriefState(): BriefState {
  if (typeof window === "undefined") return defaultBriefState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultBriefState;
    return { ...defaultBriefState, ...JSON.parse(raw) };
  } catch {
    return defaultBriefState;
  }
}

export function saveBriefState(state: Partial<BriefState>): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadBriefState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...state }));
  } catch {
    // ignore storage errors
  }
}

export function clearBriefState(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
