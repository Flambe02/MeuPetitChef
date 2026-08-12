// Generated from supabase/migrations by `npm run db:types`. Do not edit by hand.
// Regenerate after every migration; the whole app compiles against this file.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      adaptation_logs: {
        Row: {
          id: string;
          user_id: string | null;
          recipe_id: string | null;
          variant_id: string | null;
          kind: string;
          prompt: string | null;
          model_used: string | null;
          payload: Json;
          accepted: boolean | null;
          reviewed_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          recipe_id?: string | null;
          variant_id?: string | null;
          kind: string;
          prompt?: string | null;
          model_used?: string | null;
          payload?: Json;
          accepted?: boolean | null;
          reviewed_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          recipe_id?: string | null;
          variant_id?: string | null;
          kind?: string;
          prompt?: string | null;
          model_used?: string | null;
          payload?: Json;
          accepted?: boolean | null;
          reviewed_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "adaptation_logs_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "adaptation_logs_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "adaptation_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "adaptation_logs_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "recipe_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_usage_events: {
        Row: {
          id: string;
          created_by: string | null;
          provider: string;
          model: string;
          operation: string;
          input_tokens: number;
          output_tokens: number;
          estimated_cost_usd: number;
          magazine_import_id: string | null;
          context: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          created_by?: string | null;
          provider: string;
          model: string;
          operation: string;
          input_tokens?: number;
          output_tokens?: number;
          estimated_cost_usd?: number;
          magazine_import_id?: string | null;
          context?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          created_by?: string | null;
          provider?: string;
          model?: string;
          operation?: string;
          input_tokens?: number;
          output_tokens?: number;
          estimated_cost_usd?: number;
          magazine_import_id?: string | null;
          context?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_usage_events_magazine_import_id_fkey";
            columns: ["magazine_import_id"];
            isOneToOne: false;
            referencedRelation: "magazine_imports";
            referencedColumns: ["id"];
          },
        ];
      };
      collection_recipes: {
        Row: {
          collection_id: string;
          recipe_id: string;
          position: number;
          added_at: string;
        };
        Insert: {
          collection_id: string;
          recipe_id: string;
          position?: number;
          added_at?: string;
        };
        Update: {
          collection_id?: string;
          recipe_id?: string;
          position?: number;
          added_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collection_recipes_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collection_recipes_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      collections: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          emoji: string | null;
          cover_recipe_id: string | null;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          emoji?: string | null;
          cover_recipe_id?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          emoji?: string | null;
          cover_recipe_id?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collections_cover_recipe_id_fkey";
            columns: ["cover_recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collections_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cook_sessions: {
        Row: {
          id: string;
          user_id: string;
          recipe_id: string;
          path_id: string | null;
          mode: Database["public"]["Enums"]["chef_mode"];
          servings: number;
          current_step: number;
          completed_step_ids: string[];
          started_at: string;
          finished_at: string | null;
          abandoned_at: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          recipe_id: string;
          path_id?: string | null;
          mode?: Database["public"]["Enums"]["chef_mode"];
          servings?: number;
          current_step?: number;
          completed_step_ids?: string[];
          started_at?: string;
          finished_at?: string | null;
          abandoned_at?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          recipe_id?: string;
          path_id?: string | null;
          mode?: Database["public"]["Enums"]["chef_mode"];
          servings?: number;
          current_step?: number;
          completed_step_ids?: string[];
          started_at?: string;
          finished_at?: string | null;
          abandoned_at?: string | null;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cook_sessions_path_id_fkey";
            columns: ["path_id"];
            isOneToOne: false;
            referencedRelation: "cooking_paths";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cook_sessions_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cook_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cooking_paths: {
        Row: {
          id: string;
          recipe_id: string;
          slug: string;
          name: string;
          required_equipment: Database["public"]["Enums"]["equipment_type"][];
          total_minutes: number | null;
          active_minutes: number | null;
          difficulty: Database["public"]["Enums"]["difficulty"] | null;
          is_recommended: boolean;
          reason: string | null;
          vessel_count: number | null;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          recipe_id: string;
          slug: string;
          name: string;
          required_equipment?: Database["public"]["Enums"]["equipment_type"][];
          total_minutes?: number | null;
          active_minutes?: number | null;
          difficulty?: Database["public"]["Enums"]["difficulty"] | null;
          is_recommended?: boolean;
          reason?: string | null;
          vessel_count?: number | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          recipe_id?: string;
          slug?: string;
          name?: string;
          required_equipment?: Database["public"]["Enums"]["equipment_type"][];
          total_minutes?: number | null;
          active_minutes?: number | null;
          difficulty?: Database["public"]["Enums"]["difficulty"] | null;
          is_recommended?: boolean;
          reason?: string | null;
          vessel_count?: number | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cooking_paths_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      cooking_step_dials: {
        Row: {
          id: string;
          step_id: string;
          position: number;
          kind: Database["public"]["Enums"]["dial_kind"];
          value_num: number | null;
          value_text: string | null;
          sub_label: string | null;
        };
        Insert: {
          id?: string;
          step_id: string;
          position?: number;
          kind: Database["public"]["Enums"]["dial_kind"];
          value_num?: number | null;
          value_text?: string | null;
          sub_label?: string | null;
        };
        Update: {
          id?: string;
          step_id?: string;
          position?: number;
          kind?: Database["public"]["Enums"]["dial_kind"];
          value_num?: number | null;
          value_text?: string | null;
          sub_label?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cooking_step_dials_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "cooking_steps";
            referencedColumns: ["id"];
          },
        ];
      };
      cooking_step_equipment_specs: {
        Row: {
          id: string;
          step_id: string;
          equipment: Database["public"]["Enums"]["equipment_type"];
          capacity_min_litres: number | null;
          capacity_max_litres: number | null;
          temperature_c: number | null;
          duration_seconds: number | null;
          needs_preheat: boolean;
          accessory: string | null;
          note: string | null;
        };
        Insert: {
          id?: string;
          step_id: string;
          equipment: Database["public"]["Enums"]["equipment_type"];
          capacity_min_litres?: number | null;
          capacity_max_litres?: number | null;
          temperature_c?: number | null;
          duration_seconds?: number | null;
          needs_preheat?: boolean;
          accessory?: string | null;
          note?: string | null;
        };
        Update: {
          id?: string;
          step_id?: string;
          equipment?: Database["public"]["Enums"]["equipment_type"];
          capacity_min_litres?: number | null;
          capacity_max_litres?: number | null;
          temperature_c?: number | null;
          duration_seconds?: number | null;
          needs_preheat?: boolean;
          accessory?: string | null;
          note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cooking_step_equipment_specs_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "cooking_steps";
            referencedColumns: ["id"];
          },
        ];
      };
      cooking_step_ingredients: {
        Row: {
          step_id: string;
          recipe_ingredient_id: string;
        };
        Insert: {
          step_id: string;
          recipe_ingredient_id: string;
        };
        Update: {
          step_id?: string;
          recipe_ingredient_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cooking_step_ingredients_recipe_ingredient_id_fkey";
            columns: ["recipe_ingredient_id"];
            isOneToOne: false;
            referencedRelation: "recipe_ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cooking_step_ingredients_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "cooking_steps";
            referencedColumns: ["id"];
          },
        ];
      };
      cooking_steps: {
        Row: {
          id: string;
          path_id: string;
          position: number;
          is_micro: boolean;
          verb: string | null;
          instruction: string;
          equipment: Database["public"]["Enums"]["equipment_type"];
          duration_seconds: number | null;
          timer_enabled: boolean;
          alert_text: string | null;
          can_run_parallel: boolean;
          depends_on_step_id: string | null;
          image_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          path_id: string;
          position: number;
          is_micro?: boolean;
          verb?: string | null;
          instruction: string;
          equipment?: Database["public"]["Enums"]["equipment_type"];
          duration_seconds?: number | null;
          timer_enabled?: boolean;
          alert_text?: string | null;
          can_run_parallel?: boolean;
          depends_on_step_id?: string | null;
          image_path?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          path_id?: string;
          position?: number;
          is_micro?: boolean;
          verb?: string | null;
          instruction?: string;
          equipment?: Database["public"]["Enums"]["equipment_type"];
          duration_seconds?: number | null;
          timer_enabled?: boolean;
          alert_text?: string | null;
          can_run_parallel?: boolean;
          depends_on_step_id?: string | null;
          image_path?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cooking_steps_depends_on_step_id_fkey";
            columns: ["depends_on_step_id"];
            isOneToOne: false;
            referencedRelation: "cooking_steps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cooking_steps_path_id_fkey";
            columns: ["path_id"];
            isOneToOne: false;
            referencedRelation: "cooking_paths";
            referencedColumns: ["id"];
          },
        ];
      };
      diary_entries: {
        Row: {
          id: string;
          user_id: string;
          entry_date: string;
          slot: Database["public"]["Enums"]["meal_slot"];
          recipe_id: string | null;
          title: string;
          servings: number;
          kcal: number | null;
          protein_g: number | null;
          carbs_g: number | null;
          fat_g: number | null;
          logged_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          entry_date?: string;
          slot: Database["public"]["Enums"]["meal_slot"];
          recipe_id?: string | null;
          title: string;
          servings?: number;
          kcal?: number | null;
          protein_g?: number | null;
          carbs_g?: number | null;
          fat_g?: number | null;
          logged_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          entry_date?: string;
          slot?: Database["public"]["Enums"]["meal_slot"];
          recipe_id?: string | null;
          title?: string;
          servings?: number;
          kcal?: number | null;
          protein_g?: number | null;
          carbs_g?: number | null;
          fat_g?: number | null;
          logged_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "diary_entries_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "diary_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      favorites: {
        Row: {
          user_id: string;
          recipe_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          recipe_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          recipe_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ingredient_substitutions: {
        Row: {
          id: string;
          ingredient_id: string;
          replacement_id: string;
          ratio: number;
          mode: Database["public"]["Enums"]["chef_mode"] | null;
          reason: string | null;
          note: string | null;
          priority: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          ingredient_id: string;
          replacement_id: string;
          ratio?: number;
          mode?: Database["public"]["Enums"]["chef_mode"] | null;
          reason?: string | null;
          note?: string | null;
          priority?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          ingredient_id?: string;
          replacement_id?: string;
          ratio?: number;
          mode?: Database["public"]["Enums"]["chef_mode"] | null;
          reason?: string | null;
          note?: string | null;
          priority?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ingredient_substitutions_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ingredient_substitutions_replacement_id_fkey";
            columns: ["replacement_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
        ];
      };
      ingredients: {
        Row: {
          id: string;
          slug: string;
          name: string;
          name_plural: string | null;
          aliases: string[];
          default_unit: string;
          default_unit_kind: Database["public"]["Enums"]["unit_kind"];
          grams_per_unit: number | null;
          grams_per_ml: number | null;
          kcal_100: number | null;
          protein_100: number | null;
          carbs_100: number | null;
          fat_100: number | null;
          fiber_100: number | null;
          sodium_mg_100: number | null;
          allergens: string[];
          aisle: Database["public"]["Enums"]["shopping_aisle"];
          is_common_in_br: boolean;
          is_verified: boolean;
          source_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          name_plural?: string | null;
          aliases?: string[];
          default_unit?: string;
          default_unit_kind?: Database["public"]["Enums"]["unit_kind"];
          grams_per_unit?: number | null;
          grams_per_ml?: number | null;
          kcal_100?: number | null;
          protein_100?: number | null;
          carbs_100?: number | null;
          fat_100?: number | null;
          fiber_100?: number | null;
          sodium_mg_100?: number | null;
          allergens?: string[];
          aisle?: Database["public"]["Enums"]["shopping_aisle"];
          is_common_in_br?: boolean;
          is_verified?: boolean;
          source_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          name_plural?: string | null;
          aliases?: string[];
          default_unit?: string;
          default_unit_kind?: Database["public"]["Enums"]["unit_kind"];
          grams_per_unit?: number | null;
          grams_per_ml?: number | null;
          kcal_100?: number | null;
          protein_100?: number | null;
          carbs_100?: number | null;
          fat_100?: number | null;
          fiber_100?: number | null;
          sodium_mg_100?: number | null;
          allergens?: string[];
          aisle?: Database["public"]["Enums"]["shopping_aisle"];
          is_common_in_br?: boolean;
          is_verified?: boolean;
          source_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      magazine_import_items: {
        Row: {
          id: string;
          import_id: string;
          title: string | null;
          source_pages: number[];
          block_index: number;
          source_data: Json | null;
          transformed_data: Json | null;
          confidence: Json;
          status: Database["public"]["Enums"]["magazine_item_status"];
          needs_review: boolean;
          error_message: string | null;
          source_image_path: string | null;
          app_image_url: string | null;
          fingerprint: string | null;
          recipe_id: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          import_id: string;
          title?: string | null;
          source_pages?: number[];
          block_index?: number;
          source_data?: Json | null;
          transformed_data?: Json | null;
          confidence?: Json;
          status?: Database["public"]["Enums"]["magazine_item_status"];
          needs_review?: boolean;
          error_message?: string | null;
          source_image_path?: string | null;
          app_image_url?: string | null;
          fingerprint?: string | null;
          recipe_id?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          import_id?: string;
          title?: string | null;
          source_pages?: number[];
          block_index?: number;
          source_data?: Json | null;
          transformed_data?: Json | null;
          confidence?: Json;
          status?: Database["public"]["Enums"]["magazine_item_status"];
          needs_review?: boolean;
          error_message?: string | null;
          source_image_path?: string | null;
          app_image_url?: string | null;
          fingerprint?: string | null;
          recipe_id?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "magazine_import_items_import_id_fkey";
            columns: ["import_id"];
            isOneToOne: false;
            referencedRelation: "magazine_imports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "magazine_import_items_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "magazine_import_items_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      magazine_import_logs: {
        Row: {
          id: string;
          import_id: string;
          level: string;
          message: string;
          context: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          import_id: string;
          level?: string;
          message: string;
          context?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          import_id?: string;
          level?: string;
          message?: string;
          context?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "magazine_import_logs_import_id_fkey";
            columns: ["import_id"];
            isOneToOne: false;
            referencedRelation: "magazine_imports";
            referencedColumns: ["id"];
          },
        ];
      };
      magazine_import_pages: {
        Row: {
          id: string;
          import_id: string;
          page_number: number;
          kind: Database["public"]["Enums"]["magazine_page_kind"];
          confidence: number | null;
          classified_by: string | null;
          text_excerpt: string | null;
          image_path: string | null;
          status: string;
          error_message: string | null;
          attempts: number;
          analyzed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          import_id: string;
          page_number: number;
          kind?: Database["public"]["Enums"]["magazine_page_kind"];
          confidence?: number | null;
          classified_by?: string | null;
          text_excerpt?: string | null;
          image_path?: string | null;
          status?: string;
          error_message?: string | null;
          attempts?: number;
          analyzed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          import_id?: string;
          page_number?: number;
          kind?: Database["public"]["Enums"]["magazine_page_kind"];
          confidence?: number | null;
          classified_by?: string | null;
          text_excerpt?: string | null;
          image_path?: string | null;
          status?: string;
          error_message?: string | null;
          attempts?: number;
          analyzed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "magazine_import_pages_import_id_fkey";
            columns: ["import_id"];
            isOneToOne: false;
            referencedRelation: "magazine_imports";
            referencedColumns: ["id"];
          },
        ];
      };
      magazine_imports: {
        Row: {
          id: string;
          created_by: string;
          source_type: string;
          publication: string | null;
          issue: string | null;
          publication_date: string | null;
          language: string;
          country: string | null;
          file_path: string;
          file_name: string | null;
          file_size_bytes: number | null;
          cover_image_path: string | null;
          page_count: number | null;
          status: Database["public"]["Enums"]["magazine_import_status"];
          stage: string | null;
          pages_analyzed: number;
          recipe_count: number;
          metadata: Json;
          error_message: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          created_by: string;
          source_type?: string;
          publication?: string | null;
          issue?: string | null;
          publication_date?: string | null;
          language?: string;
          country?: string | null;
          file_path: string;
          file_name?: string | null;
          file_size_bytes?: number | null;
          cover_image_path?: string | null;
          page_count?: number | null;
          status?: Database["public"]["Enums"]["magazine_import_status"];
          stage?: string | null;
          pages_analyzed?: number;
          recipe_count?: number;
          metadata?: Json;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          created_by?: string;
          source_type?: string;
          publication?: string | null;
          issue?: string | null;
          publication_date?: string | null;
          language?: string;
          country?: string | null;
          file_path?: string;
          file_name?: string | null;
          file_size_bytes?: number | null;
          cover_image_path?: string | null;
          page_count?: number | null;
          status?: Database["public"]["Enums"]["magazine_import_status"];
          stage?: string | null;
          pages_analyzed?: number;
          recipe_count?: number;
          metadata?: Json;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "magazine_imports_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_plan_entries: {
        Row: {
          id: string;
          user_id: string;
          plan_date: string;
          slot: Database["public"]["Enums"]["meal_slot"];
          recipe_id: string | null;
          custom_title: string | null;
          servings: number;
          mode: Database["public"]["Enums"]["chef_mode"] | null;
          source: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan_date: string;
          slot: Database["public"]["Enums"]["meal_slot"];
          recipe_id?: string | null;
          custom_title?: string | null;
          servings?: number;
          mode?: Database["public"]["Enums"]["chef_mode"] | null;
          source?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          plan_date?: string;
          slot?: Database["public"]["Enums"]["meal_slot"];
          recipe_id?: string | null;
          custom_title?: string | null;
          servings?: number;
          mode?: Database["public"]["Enums"]["chef_mode"] | null;
          source?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_plan_entries_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meal_plan_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      pantry_items: {
        Row: {
          id: string;
          user_id: string;
          ingredient_id: string | null;
          display_name: string;
          quantity: number | null;
          unit: string | null;
          expires_on: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          ingredient_id?: string | null;
          display_name: string;
          quantity?: number | null;
          unit?: string | null;
          expires_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          ingredient_id?: string | null;
          display_name?: string;
          quantity?: number | null;
          unit?: string | null;
          expires_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pantry_items_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pantry_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      prep_notes: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          body: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          week_start: string;
          body?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          week_start?: string;
          body?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prep_notes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_disliked_ingredients: {
        Row: {
          id: string;
          user_id: string;
          ingredient_id: string | null;
          display_name: string;
          is_allergy: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          ingredient_id?: string | null;
          display_name: string;
          is_allergy?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          ingredient_id?: string | null;
          display_name?: string;
          is_allergy?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_disliked_ingredient_fk";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_disliked_ingredients_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_equipment: {
        Row: {
          id: string;
          user_id: string;
          equipment: Database["public"]["Enums"]["equipment_type"];
          spec: string | null;
          capacity_litres: number | null;
          power_watts: number | null;
          is_preferred: boolean;
          is_excluded: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          equipment: Database["public"]["Enums"]["equipment_type"];
          spec?: string | null;
          capacity_litres?: number | null;
          power_watts?: number | null;
          is_preferred?: boolean;
          is_excluded?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          equipment?: Database["public"]["Enums"]["equipment_type"];
          spec?: string | null;
          capacity_litres?: number | null;
          power_watts?: number | null;
          is_preferred?: boolean;
          is_excluded?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_equipment_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_preferences: {
        Row: {
          id: string;
          user_id: string;
          kind: Database["public"]["Enums"]["preference_kind"];
          value: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: Database["public"]["Enums"]["preference_kind"];
          value: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: Database["public"]["Enums"]["preference_kind"];
          value?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_path: string | null;
          locale: string;
          role: Database["public"]["Enums"]["app_role"];
          chef_mode: Database["public"]["Enums"]["chef_mode"];
          skill_level: Database["public"]["Enums"]["skill_level"] | null;
          default_servings: number;
          max_active_minutes: number | null;
          daily_kcal_goal: number | null;
          daily_protein_goal_g: number | null;
          theme: string;
          keep_screen_awake: boolean;
          timer_sound: boolean;
          voice_guidance: boolean;
          onboarding_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_path?: string | null;
          locale?: string;
          role?: Database["public"]["Enums"]["app_role"];
          chef_mode?: Database["public"]["Enums"]["chef_mode"];
          skill_level?: Database["public"]["Enums"]["skill_level"] | null;
          default_servings?: number;
          max_active_minutes?: number | null;
          daily_kcal_goal?: number | null;
          daily_protein_goal_g?: number | null;
          theme?: string;
          keep_screen_awake?: boolean;
          timer_sound?: boolean;
          voice_guidance?: boolean;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_path?: string | null;
          locale?: string;
          role?: Database["public"]["Enums"]["app_role"];
          chef_mode?: Database["public"]["Enums"]["chef_mode"];
          skill_level?: Database["public"]["Enums"]["skill_level"] | null;
          default_servings?: number;
          max_active_minutes?: number | null;
          daily_kcal_goal?: number | null;
          daily_protein_goal_g?: number | null;
          theme?: string;
          keep_screen_awake?: boolean;
          timer_sound?: boolean;
          voice_guidance?: boolean;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_generations: {
        Row: {
          id: string;
          user_id: string;
          prompt: string;
          equipment: Database["public"]["Enums"]["equipment_type"][];
          mode: Database["public"]["Enums"]["chef_mode"];
          servings: number;
          turns: Json;
          status: Database["public"]["Enums"]["import_status"];
          error_message: string | null;
          recipe_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          prompt: string;
          equipment?: Database["public"]["Enums"]["equipment_type"][];
          mode?: Database["public"]["Enums"]["chef_mode"];
          servings?: number;
          turns?: Json;
          status?: Database["public"]["Enums"]["import_status"];
          error_message?: string | null;
          recipe_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          prompt?: string;
          equipment?: Database["public"]["Enums"]["equipment_type"][];
          mode?: Database["public"]["Enums"]["chef_mode"];
          servings?: number;
          turns?: Json;
          status?: Database["public"]["Enums"]["import_status"];
          error_message?: string | null;
          recipe_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_generations_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_generations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_imports: {
        Row: {
          id: string;
          user_id: string | null;
          source: Database["public"]["Enums"]["import_source"];
          source_url: string | null;
          raw_text: string | null;
          raw_file_path: string | null;
          status: Database["public"]["Enums"]["import_status"];
          extracted: Json | null;
          error_message: string | null;
          model_used: string | null;
          token_cost: number | null;
          recipe_id: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
          provider: string | null;
          external_id: string | null;
          raw_data: Json | null;
          fingerprint: string | null;
          warnings: string[];
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          source: Database["public"]["Enums"]["import_source"];
          source_url?: string | null;
          raw_text?: string | null;
          raw_file_path?: string | null;
          status?: Database["public"]["Enums"]["import_status"];
          extracted?: Json | null;
          error_message?: string | null;
          model_used?: string | null;
          token_cost?: number | null;
          recipe_id?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          provider?: string | null;
          external_id?: string | null;
          raw_data?: Json | null;
          fingerprint?: string | null;
          warnings?: string[];
        };
        Update: {
          id?: string;
          user_id?: string | null;
          source?: Database["public"]["Enums"]["import_source"];
          source_url?: string | null;
          raw_text?: string | null;
          raw_file_path?: string | null;
          status?: Database["public"]["Enums"]["import_status"];
          extracted?: Json | null;
          error_message?: string | null;
          model_used?: string | null;
          token_cost?: number | null;
          recipe_id?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          provider?: string | null;
          external_id?: string | null;
          raw_data?: Json | null;
          fingerprint?: string | null;
          warnings?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "recipe_imports_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_imports_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_ingredient_groups: {
        Row: {
          id: string;
          recipe_id: string;
          position: number;
          name: string;
        };
        Insert: {
          id?: string;
          recipe_id: string;
          position?: number;
          name: string;
        };
        Update: {
          id?: string;
          recipe_id?: string;
          position?: number;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_ingredient_groups_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_ingredients: {
        Row: {
          id: string;
          recipe_id: string;
          group_id: string | null;
          ingredient_id: string | null;
          position: number;
          display_name: string;
          quantity: number | null;
          unit: string | null;
          unit_kind: Database["public"]["Enums"]["unit_kind"];
          note: string | null;
          is_optional: boolean;
          is_scalable: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipe_id: string;
          group_id?: string | null;
          ingredient_id?: string | null;
          position?: number;
          display_name: string;
          quantity?: number | null;
          unit?: string | null;
          unit_kind?: Database["public"]["Enums"]["unit_kind"];
          note?: string | null;
          is_optional?: boolean;
          is_scalable?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          recipe_id?: string;
          group_id?: string | null;
          ingredient_id?: string | null;
          position?: number;
          display_name?: string;
          quantity?: number | null;
          unit?: string | null;
          unit_kind?: Database["public"]["Enums"]["unit_kind"];
          note?: string | null;
          is_optional?: boolean;
          is_scalable?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "recipe_ingredient_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_notes: {
        Row: {
          id: string;
          recipe_id: string;
          kind: string;
          title: string | null;
          body: string;
          position: number;
        };
        Insert: {
          id?: string;
          recipe_id: string;
          kind?: string;
          title?: string | null;
          body: string;
          position?: number;
        };
        Update: {
          id?: string;
          recipe_id?: string;
          kind?: string;
          title?: string | null;
          body?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_notes_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_ratings: {
        Row: {
          user_id: string;
          recipe_id: string;
          rating: number;
          comment: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          recipe_id: string;
          rating: number;
          comment?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          recipe_id?: string;
          rating?: number;
          comment?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_ratings_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_ratings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_tags: {
        Row: {
          recipe_id: string;
          tag_id: string;
        };
        Insert: {
          recipe_id: string;
          tag_id: string;
        };
        Update: {
          recipe_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_tags_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_variant_extra_ingredients: {
        Row: {
          id: string;
          variant_id: string;
          group_id: string | null;
          ingredient_id: string | null;
          position: number;
          display_name: string;
          quantity: number | null;
          unit: string | null;
          unit_kind: Database["public"]["Enums"]["unit_kind"];
          note: string | null;
          is_scalable: boolean;
        };
        Insert: {
          id?: string;
          variant_id: string;
          group_id?: string | null;
          ingredient_id?: string | null;
          position?: number;
          display_name: string;
          quantity?: number | null;
          unit?: string | null;
          unit_kind?: Database["public"]["Enums"]["unit_kind"];
          note?: string | null;
          is_scalable?: boolean;
        };
        Update: {
          id?: string;
          variant_id?: string;
          group_id?: string | null;
          ingredient_id?: string | null;
          position?: number;
          display_name?: string;
          quantity?: number | null;
          unit?: string | null;
          unit_kind?: Database["public"]["Enums"]["unit_kind"];
          note?: string | null;
          is_scalable?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_variant_extra_ingredients_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "recipe_ingredient_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_variant_extra_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_variant_extra_ingredients_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "recipe_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_variant_ingredients: {
        Row: {
          id: string;
          variant_id: string;
          recipe_ingredient_id: string;
          is_removed: boolean;
          display_name: string | null;
          quantity: number | null;
          unit: string | null;
          unit_kind: Database["public"]["Enums"]["unit_kind"] | null;
          note: string | null;
          replacement_ingredient_id: string | null;
        };
        Insert: {
          id?: string;
          variant_id: string;
          recipe_ingredient_id: string;
          is_removed?: boolean;
          display_name?: string | null;
          quantity?: number | null;
          unit?: string | null;
          unit_kind?: Database["public"]["Enums"]["unit_kind"] | null;
          note?: string | null;
          replacement_ingredient_id?: string | null;
        };
        Update: {
          id?: string;
          variant_id?: string;
          recipe_ingredient_id?: string;
          is_removed?: boolean;
          display_name?: string | null;
          quantity?: number | null;
          unit?: string | null;
          unit_kind?: Database["public"]["Enums"]["unit_kind"] | null;
          note?: string | null;
          replacement_ingredient_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_variant_ingredients_recipe_ingredient_id_fkey";
            columns: ["recipe_ingredient_id"];
            isOneToOne: false;
            referencedRelation: "recipe_ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_variant_ingredients_replacement_ingredient_id_fkey";
            columns: ["replacement_ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_variant_ingredients_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "recipe_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_variants: {
        Row: {
          id: string;
          recipe_id: string;
          mode: Database["public"]["Enums"]["chef_mode"];
          kcal: number | null;
          protein_g: number | null;
          carbs_g: number | null;
          fat_g: number | null;
          fiber_g: number | null;
          summary: string | null;
          changes: string[];
          servings_factor: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          recipe_id: string;
          mode: Database["public"]["Enums"]["chef_mode"];
          kcal?: number | null;
          protein_g?: number | null;
          carbs_g?: number | null;
          fat_g?: number | null;
          fiber_g?: number | null;
          summary?: string | null;
          changes?: string[];
          servings_factor?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          recipe_id?: string;
          mode?: Database["public"]["Enums"]["chef_mode"];
          kcal?: number | null;
          protein_g?: number | null;
          carbs_g?: number | null;
          fat_g?: number | null;
          fiber_g?: number | null;
          summary?: string | null;
          changes?: string[];
          servings_factor?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_variants_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      recipes: {
        Row: {
          id: string;
          slug: string;
          title: string;
          subtitle: string | null;
          description: string | null;
          hero_image_path: string | null;
          author_name: string;
          cuisine: string | null;
          category: string | null;
          difficulty: Database["public"]["Enums"]["difficulty"];
          total_minutes: number;
          active_minutes: number | null;
          default_servings: number;
          rating_avg: number;
          rating_count: number;
          status: Database["public"]["Enums"]["recipe_status"];
          published_at: string | null;
          created_by: string | null;
          search_vector: unknown | null;
          created_at: string;
          updated_at: string;
          source_provider: string | null;
          source_url: string | null;
          source_image_url: string | null;
          imported_at: string | null;
          photo_url: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          subtitle?: string | null;
          description?: string | null;
          hero_image_path?: string | null;
          author_name?: string;
          cuisine?: string | null;
          category?: string | null;
          difficulty?: Database["public"]["Enums"]["difficulty"];
          total_minutes: number;
          active_minutes?: number | null;
          default_servings?: number;
          rating_avg?: number;
          rating_count?: number;
          status?: Database["public"]["Enums"]["recipe_status"];
          published_at?: string | null;
          created_by?: string | null;
          search_vector?: unknown | null;
          created_at?: string;
          updated_at?: string;
          source_provider?: string | null;
          source_url?: string | null;
          source_image_url?: string | null;
          imported_at?: string | null;
          photo_url?: string | null;
        };
        Update: {
          id?: string;
          slug?: string;
          title?: string;
          subtitle?: string | null;
          description?: string | null;
          hero_image_path?: string | null;
          author_name?: string;
          cuisine?: string | null;
          category?: string | null;
          difficulty?: Database["public"]["Enums"]["difficulty"];
          total_minutes?: number;
          active_minutes?: number | null;
          default_servings?: number;
          rating_avg?: number;
          rating_count?: number;
          status?: Database["public"]["Enums"]["recipe_status"];
          published_at?: string | null;
          created_by?: string | null;
          search_vector?: unknown | null;
          created_at?: string;
          updated_at?: string;
          source_provider?: string | null;
          source_url?: string | null;
          source_image_url?: string | null;
          imported_at?: string | null;
          photo_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recipes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      shopping_items: {
        Row: {
          id: string;
          list_id: string;
          ingredient_id: string | null;
          recipe_id: string | null;
          display_name: string;
          quantity: number | null;
          unit: string | null;
          aisle: Database["public"]["Enums"]["shopping_aisle"];
          is_checked: boolean;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          list_id: string;
          ingredient_id?: string | null;
          recipe_id?: string | null;
          display_name: string;
          quantity?: number | null;
          unit?: string | null;
          aisle?: Database["public"]["Enums"]["shopping_aisle"];
          is_checked?: boolean;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          list_id?: string;
          ingredient_id?: string | null;
          recipe_id?: string | null;
          display_name?: string;
          quantity?: number | null;
          unit?: string | null;
          aisle?: Database["public"]["Enums"]["shopping_aisle"];
          is_checked?: boolean;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_items_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shopping_items_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "shopping_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shopping_items_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      shopping_lists: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          week_start: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name?: string;
          week_start?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          week_start?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_lists_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          id: string;
          slug: string;
          label: string;
          kind: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          label: string;
          kind?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          label?: string;
          kind?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      recipe_cards: {
        Row: {
          id: string | null;
          slug: string | null;
          title: string | null;
          subtitle: string | null;
          hero_image_path: string | null;
          author_name: string | null;
          cuisine: string | null;
          category: string | null;
          difficulty: Database["public"]["Enums"]["difficulty"] | null;
          total_minutes: number | null;
          active_minutes: number | null;
          default_servings: number | null;
          rating_avg: number | null;
          rating_count: number | null;
          status: Database["public"]["Enums"]["recipe_status"] | null;
          published_at: string | null;
          equipment: Database["public"]["Enums"]["equipment_type"][] | null;
          tags: string[] | null;
          variants: Json | null;
          photo_url: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      add_recipe_to_shopping_list: {
        Args: {
          target_recipe: string;
          target_servings?: number;
          target_mode?: Database["public"]["Enums"]["chef_mode"];
          skip_pantry?: boolean;
        };
        Returns: string;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_editor: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      mpc_normalize: {
        Args: {
          input: string;
        };
        Returns: string;
      };
      mpc_slugify: {
        Args: {
          input: string;
        };
        Returns: string;
      };
      owns_draft_path: {
        Args: {
          target_path: string;
        };
        Returns: boolean;
      };
      owns_draft_recipe: {
        Args: {
          target_recipe: string;
        };
        Returns: boolean;
      };
      path_is_visible: {
        Args: {
          target_path: string;
        };
        Returns: boolean;
      };
      recipe_is_visible: {
        Args: {
          target_recipe: string;
        };
        Returns: boolean;
      };
      recipe_paths_for_me: {
        Args: {
          target_recipe: string;
        };
        Returns: {
          id: string | null;
          slug: string | null;
          name: string | null;
          required_equipment: Database["public"]["Enums"]["equipment_type"][] | null;
          total_minutes: number | null;
          active_minutes: number | null;
          is_recommended: boolean | null;
          reason: string | null;
          vessel_count: number | null;
          fit_score: number | null;
          missing_equipment: Database["public"]["Enums"]["equipment_type"][] | null;
        }[];
      };
      score_cooking_path: {
        Args: {
          path_equipment: Database["public"]["Enums"]["equipment_type"][];
          target_user?: string;
        };
        Returns: number;
      };
      search_recipes: {
        Args: {
          query?: string;
          equipment_filter?: Database["public"]["Enums"]["equipment_type"][];
          max_total_minutes?: number;
          max_kcal?: number;
          min_protein_g?: number;
          difficulty_filter?: Database["public"]["Enums"]["difficulty"];
          mode_filter?: Database["public"]["Enums"]["chef_mode"];
          page_limit?: number;
          page_offset?: number;
        };
        Returns: Database["public"]["Views"]["recipe_cards"]["Row"][];
      };
      suggest_recipes: {
        Args: {
          target_mode?: Database["public"]["Enums"]["chef_mode"];
          page_limit?: number;
        };
        Returns: Database["public"]["Views"]["recipe_cards"]["Row"][];
      };
      variant_is_visible: {
        Args: {
          target_variant: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "user" | "editor" | "admin";
      chef_mode: "normal" | "gourmand" | "fit";
      dial_kind: "tempo" | "temperatura" | "velocidade" | "potencia" | "modo" | "alerta";
      difficulty: "facil" | "medio" | "dificil";
      equipment_type: "air_fryer" | "oven" | "stovetop" | "thermomix" | "microwave" | "blender" | "pressure_cooker" | "electric_cooker" | "barbecue" | "sous_vide" | "other" | "none";
      import_source: "url" | "text" | "image" | "pdf" | "manual";
      import_status: "pending" | "extracting" | "needs_review" | "accepted" | "failed";
      magazine_import_status: "uploaded" | "processing" | "extracting" | "review_required" | "ready" | "completed" | "failed";
      magazine_item_status: "detected" | "extracted" | "review" | "approved" | "imported" | "ignored" | "failed";
      magazine_page_kind: "cover" | "advertisement" | "editorial" | "index" | "article" | "recipe" | "recipe_index" | "unknown";
      meal_slot: "cafe" | "almoco" | "lanche" | "jantar" | "ceia";
      preference_kind: "cuisine" | "style" | "time" | "restriction";
      recipe_status: "draft" | "review" | "published" | "archived";
      shopping_aisle: "hortifruti" | "acougue" | "peixaria" | "mercearia" | "laticinios" | "padaria" | "congelados" | "bebidas" | "outros";
      skill_level: "beginner" | "occasional" | "confident" | "advanced";
      unit_kind: "mass" | "volume" | "count" | "spoon" | "pinch" | "to_taste";
    };
    CompositeTypes: Record<PropertyKey, never>;
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> =
  PublicSchema["Views"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
export type FunctionArgs<T extends keyof PublicSchema["Functions"]> =
  PublicSchema["Functions"][T]["Args"];
export type FunctionReturns<T extends keyof PublicSchema["Functions"]> =
  PublicSchema["Functions"][T]["Returns"];
