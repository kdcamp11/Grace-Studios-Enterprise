export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string;
          created_at: string;
          name: string;
          contact_name: string;
          email: string;
          sport: string;
          city: string;
          retainer_plan: string | null;
          retainer_status: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          name: string;
          contact_name?: string;
          email: string;
          sport?: string;
          city?: string;
          retainer_plan?: string | null;
          retainer_status?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
      };
      orders: {
        Row: {
          id: string;
          created_at: string;
          order_number: string;
          client_id: string;
          stage: OrderStage;
          order_type?: 'creative' | 'production';
          originating_creative_order_id?: string | null;
          package_tier: string | null;
          deposit_paid: boolean;
          balance_paid: boolean;
          supplier: string | null;
          supplier_region: string | null;
          estimated_delivery: string | null;
          tracking_number: string | null;
          shipping_cost: number | null;
          account_lead: string | null;
          approved_at: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          order_number?: string;
          client_id: string;
          stage?: OrderStage;
          order_type?: 'creative' | 'production';
          originating_creative_order_id?: string | null;
          package_tier?: string | null;
          deposit_paid?: boolean;
          balance_paid?: boolean;
          supplier?: string | null;
          supplier_region?: string | null;
          estimated_delivery?: string | null;
          tracking_number?: string | null;
          shipping_cost?: number | null;
          account_lead?: string | null;
          approved_at?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
      };
      briefs: {
        Row: {
          id: string;
          created_at: string;
          order_id: string;
          primary_colors: string | null;
          secondary_colors: string | null;
          accent_color: string | null;
          colors_to_avoid: string | null;
          hex_confirmed: boolean;
          brand_match: boolean;
          design_system: string | null;
          negative_references: string | null;
          jersey_cut: string | null;
          sublimated: boolean | null;
          home_colorway: string | null;
          away_colorway: string | null;
          number_style: string | null;
          player_names: boolean;
          logo_placement: string | null;
          logos_to_include: string | null;
          sponsor_text: string | null;
          reference_image_url: string | null;
          vision_prompt: string | null;
          ai_prompt: string | null;
          player_roster: RosterPlayer[] | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          order_id: string;
          primary_colors?: string | null;
          secondary_colors?: string | null;
          accent_color?: string | null;
          colors_to_avoid?: string | null;
          hex_confirmed?: boolean;
          brand_match?: boolean;
          design_system?: string | null;
          negative_references?: string | null;
          jersey_cut?: string | null;
          sublimated?: boolean | null;
          home_colorway?: string | null;
          away_colorway?: string | null;
          number_style?: string | null;
          player_names?: boolean;
          logo_placement?: string | null;
          logos_to_include?: string | null;
          sponsor_text?: string | null;
          reference_image_url?: string | null;
          vision_prompt?: string | null;
          ai_prompt?: string | null;
          player_roster?: RosterPlayer[] | null;
        };
        Update: Partial<Database["public"]["Tables"]["briefs"]["Insert"]>;
      };
      concepts: {
        Row: {
          id: string;
          created_at: string;
          order_id: string;
          concept_number: number;
          image_url: string;
          selected: boolean;
          client_feedback: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          order_id: string;
          concept_number: number;
          image_url: string;
          selected?: boolean;
          client_feedback?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["concepts"]["Insert"]>;
      };
      stage_log: {
        Row: {
          id: string;
          created_at: string;
          order_id: string;
          from_stage: string;
          to_stage: string;
          changed_at: string;
          changed_by: string;
          note: string | null;
          email_sent: boolean;
        };
        Insert: {
          id?: string;
          created_at?: string;
          order_id: string;
          from_stage: string;
          to_stage: string;
          changed_at?: string;
          changed_by: string;
          note?: string | null;
          email_sent?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["stage_log"]["Insert"]>;
      };
      reference_images: {
        Row: {
          id: string;
          created_at: string;
          item_type: string;
          design_system: string;
          image_url: string;
          tags: string | null;
          active: boolean;
        };
        Insert: {
          id?: string;
          created_at?: string;
          item_type: string;
          design_system: string;
          image_url: string;
          tags?: string | null;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["reference_images"]["Insert"]>;
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: "client" | "supplier" | "admin" | "super_admin" | "designer" | "sales_rep";
          company: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role: "client" | "supplier" | "admin" | "super_admin" | "designer" | "sales_rep";
          company?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["profiles"]["Insert"], "id">>;
      };
      first_piece_media: {
        Row: {
          id: string;
          created_at: string;
          order_id: string;
          uploaded_by: string | null;
          media_url: string;
          media_type: "photo" | "video";
          caption: string | null;
          admin_approved: boolean | null;
          admin_note: string | null;
          admin_reviewed_at: string | null;
          admin_reviewed_by: string | null;
          client_visible: boolean;
          client_approved: boolean | null;
          client_note: string | null;
          client_reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          order_id: string;
          uploaded_by?: string | null;
          media_url: string;
          media_type: "photo" | "video";
          caption?: string | null;
          admin_approved?: boolean | null;
          admin_note?: string | null;
          admin_reviewed_at?: string | null;
          admin_reviewed_by?: string | null;
          client_visible?: boolean;
          client_approved?: boolean | null;
          client_note?: string | null;
          client_reviewed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["first_piece_media"]["Insert"]>;
      };
    };
  };
}

// Canonical vocabulary lives in lib/order-stages.ts — keep this union in sync.
export type OrderStage =
  // legacy stages (still written/read by older code paths)
  | "onboarding"
  | "design_confirmed"
  // production stages
  | "files_sent"
  | "first_piece_in_progress"
  | "first_piece_review"
  | "bulk_production"
  | "qc_verified"
  | "shipped"
  | "delivered"
  | "complete"
  // new creative lifecycle stages
  | "creative_started"
  | "creative_submitted"
  | "payment_pending"
  | "paid"
  | "creative_in_review"
  | "revision_requested"
  | "creative_approved"
  | "ready_for_production";

export interface RosterPlayer {
  name: string;
  number: string;
  size: string;
  cut: string;
}

export interface BriefState {
  // Screen 1 (saved to DB on submit)
  teamName: string;
  contactName: string;
  email: string;
  city: string;
  sport: string;
  orderId: string;
  clientId: string;

  // Screen 2
  designSystem: "bold" | "gradient" | "program" | "culture" | "freestyle" | "";
  jerseycut: "mens" | "womens" | "youth" | "unisex" | "";
  sublimated: boolean | null;

  // Screen 3 — Builder preview colors (also fed to AI)
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;

  // Screen 3 — Logo & Details
  logoUrls: string[];           // team logos (multiple)
  referenceImageUrls: string[]; // inspiration / reference images (multiple)

  // Screen 3 — Details (submitted to DB on review)
  gsLogoPlacement: "chest" | "back_neck" | "sleeve" | "";
  visionPrompt: string;
  numberStyle: string;
  logosToInclude: string;
  sponsorText: string;
  negativeReferences: string;

  // Screen 6 — Roster (last step)
  playerRoster: RosterPlayer[];
  playerNames: boolean;

  // Jersey Builder — 7-zone color data (optional, only set when builder path used)
  zoneColors?: {
    jerseyTop:          string;
    collar:             string;
    jerseyShorts:       string;
    jerseySidePanels:   string;
    jerseyLowerPanels:  string;
    sleevePanels:       string;
    shortSidePanels:    string;
  } | null;

  // Jersey Builder — render URL captured from canvas on "Review My Design"
  renderUrl?: string | null;
}
