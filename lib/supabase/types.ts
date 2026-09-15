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
          user_id: string | null;
          device_id: string | null;
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
          user_id?: string | null;
          device_id?: string | null;
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
      posts: {
        Row: {
          id: string;
          slug: string;
          title: string;
          excerpt: string | null;
          body: string;
          published: boolean;
          published_at: string | null;
          author_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          slug: string;
          title: string;
          excerpt?: string | null;
          body?: string;
          published?: boolean;
          author_id?: string | null;
        };
        Update: {
          slug?: string;
          title?: string;
          excerpt?: string | null;
          body?: string;
          published?: boolean;
        };
        Relationships: [];
      };
      restaurants: {
        Row: {
          id: string;
          slug: string;
          name: string;
          area: string | null;
          address: string | null;
          city: string;
          lat: number | null;
          lon: number | null;
          cuisines: string[];
          price_band: number | null;
          veg_only: boolean;
          google_place_id: string | null;
          listed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          slug: string;
          name: string;
          city: string;
          area?: string | null;
          address?: string | null;
          lat?: number | null;
          lon?: number | null;
          cuisines?: string[];
          price_band?: number | null;
          veg_only?: boolean;
          google_place_id?: string | null;
          listed?: boolean;
        };
        Update: {
          slug?: string;
          name?: string;
          city?: string;
          area?: string | null;
          address?: string | null;
          lat?: number | null;
          lon?: number | null;
          cuisines?: string[];
          price_band?: number | null;
          veg_only?: boolean;
          // Settable so one write path can serve both insert and update. It is
          // still a join key only - see 0014, nothing may copy a Google name,
          // address or rating into this table.
          google_place_id?: string | null;
          listed?: boolean;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          restaurant_id: string;
          author_id: string;
          visited_on: string;
          hygiene: number;
          food: number;
          value: number;
          as_advertised: number;
          wait: number;
          body: string;
          tags: string[];
          evidence: "none" | "located";
          hidden: boolean;
          hidden_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          restaurant_id: string;
          author_id: string;
          visited_on: string;
          hygiene: number;
          food: number;
          value: number;
          as_advertised: number;
          wait: number;
          body?: string;
          tags?: string[];
          evidence?: "none" | "located";
        };
        Update: {
          hidden?: boolean;
          hidden_reason?: string | null;
          body?: string;
          tags?: string[];
        };
        Relationships: [];
      };
    };
    Views: {
      restaurant_scores: {
        Row: {
          restaurant_id: string;
          reviews: number;
          hygiene: number;
          food: number;
          value: number;
          as_advertised: number;
          wait: number;
          overall: number;
          located_reviews: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      /** 'ok', 'month' (global budget spent) or 'day' (this client's share) */
      claim_places_call: { Args: { p_bucket: string }; Returns: string };
      dish_signals: {
        Args: Record<string, never>;
        Returns: {
          dish_id: string;
          shown: number;
          clicked: number;
          expected: number;
          lift: number;
        }[];
      };
      places_quota_status: {
        Args: Record<string, never>;
        Returns: {
          used_this_month: number;
          monthly_cap: number;
          used_today: number;
          daily_allowance: number;
        }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
