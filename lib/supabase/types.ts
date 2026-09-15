import type { Diet } from "../types";
import type { InterestId } from "../interests";

/**
 * Mirrors supabase/migrations/0001_profiles.sql.
 *
 * Hand written rather than generated, because the connector cannot reach the
 * project from here. If the schema changes, `npx supabase gen types typescript`
 * replaces this file wholesale.
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          interests: InterestId[];
          diet: Diet | null;
          home_city: string | null;
          email: string | null;
          is_admin: boolean;
          is_pro: boolean;
          spice_level: string | null;
          phone: string | null;
          phone_contact_ok: boolean;
          avoid_cuisines: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          interests?: InterestId[];
          diet?: Diet | null;
          home_city?: string | null;
          spice_level?: string | null;
          avoid_cuisines?: string[];
          phone?: string | null;
          phone_contact_ok?: boolean;
        };
        Update: {
          interests?: InterestId[];
          diet?: Diet | null;
          home_city?: string | null;
          spice_level?: string | null;
          avoid_cuisines?: string[];
          phone?: string | null;
          phone_contact_ok?: boolean;
        };
        Relationships: [];
      };
      recommendation_events: {
        Row: {
          id: number;
          user_id: string;
          dish_id: string;
          city: string | null;
          slot: string | null;
          action: "shown" | "clicked";
          mood: string | null;
          energy: string | null;
          hunger: string | null;
          palate: string | null;
          patience: string | null;
          diet: string | null;
          fasting: boolean | null;
          weather: string | null;
          temp_c: number | null;
          day_part: string | null;
          interests: string[] | null;
          heat_override: number | null;
          activity: string | null;
          rank: number | null;
          shortlist_id: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          dish_id: string;
          city?: string | null;
          slot?: string | null;
          action: "shown" | "clicked";
          mood?: string | null;
          energy?: string | null;
          hunger?: string | null;
          palate?: string | null;
          patience?: string | null;
          diet?: string | null;
          fasting?: boolean | null;
          weather?: string | null;
          temp_c?: number | null;
          day_part?: string | null;
          interests?: string[] | null;
          heat_override?: number | null;
          activity?: string | null;
          rank?: number | null;
          shortlist_id?: string | null;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      /** 'ok', 'month' (global budget spent) or 'day' (this client's share) */
      claim_places_call: { Args: { p_bucket: string }; Returns: string };
      places_quota_status: {
        Args: Record<string, never>;
        Returns: { used_this_month: number; monthly_cap: number; used_today: number }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
