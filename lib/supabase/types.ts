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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          interests?: InterestId[];
          diet?: Diet | null;
          home_city?: string | null;
        };
        Update: {
          interests?: InterestId[];
          diet?: Diet | null;
          home_city?: string | null;
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
          created_at: string;
        };
        Insert: {
          user_id: string;
          dish_id: string;
          city?: string | null;
          slot?: string | null;
          action: "shown" | "clicked";
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
