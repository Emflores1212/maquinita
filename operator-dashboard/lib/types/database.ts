/*
 * TODO: Regenerate this file from live Supabase project once SUPABASE_PROJECT_ID is set.
 * Command:
 *   npm run supabase:types
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      operators: {
        Row: {
          id: string;
          name: string;
          slug: string;
          plan: string | null;
          settings: Json | null;
          branding: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          plan?: string | null;
          settings?: Json | null;
          branding?: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          plan?: string | null;
          settings?: Json | null;
          branding?: Json | null;
          created_at?: string | null;
        };
      };
      profiles: {
        Row: {
          id: string;
          operator_id: string | null;
          full_name: string | null;
          role: 'admin' | 'manager' | 'driver' | 'viewer' | null;
          assigned_machine_ids: string[] | null;
          preferred_language: string | null;
          status: string | null;
          created_at: string | null;
          last_login_at: string | null;
        };
        Insert: {
          id: string;
          operator_id?: string | null;
          full_name?: string | null;
          role?: 'admin' | 'manager' | 'driver' | 'viewer' | null;
          assigned_machine_ids?: string[] | null;
          preferred_language?: string | null;
          status?: string | null;
          created_at?: string | null;
          last_login_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string | null;
          full_name?: string | null;
          role?: 'admin' | 'manager' | 'driver' | 'viewer' | null;
          assigned_machine_ids?: string[] | null;
          preferred_language?: string | null;
          status?: string | null;
          created_at?: string | null;
          last_login_at?: string | null;
        };
      };
      machines: {
        Row: {
          id: string;
          operator_id: string;
          name: string;
          mid: string;
          type: 'fridge' | 'pantry' | 'freezer';
          location_name: string | null;
          address: string | null;
          lat: number | null;
          lng: number | null;
          status: string | null;
          temperature: number | null;
          last_seen_at: string | null;
          api_key: string | null;
          settings: Json | null;
          notes: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id: string;
          name: string;
          mid: string;
          type: 'fridge' | 'pantry' | 'freezer';
          location_name?: string | null;
          address?: string | null;
          lat?: number | null;
          lng?: number | null;
          status?: string | null;
          temperature?: number | null;
          last_seen_at?: string | null;
          api_key?: string | null;
          settings?: Json | null;
          notes?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          name?: string;
          mid?: string;
          type?: 'fridge' | 'pantry' | 'freezer';
          location_name?: string | null;
          address?: string | null;
          lat?: number | null;
          lng?: number | null;
          status?: string | null;
          temperature?: number | null;
          last_seen_at?: string | null;
          api_key?: string | null;
          settings?: Json | null;
          notes?: string | null;
          created_at?: string | null;
        };
      };
      machine_product_prices: {
        Row: {
          machine_id: string;
          product_id: string;
          price: number;
        };
        Insert: {
          machine_id: string;
          product_id: string;
          price: number;
        };
        Update: {
          machine_id?: string;
          product_id?: string;
          price?: number;
        };
      };
      par_levels: {
        Row: {
          machine_id: string;
          product_id: string;
          quantity: number;
        };
        Insert: {
          machine_id: string;
          product_id: string;
          quantity?: number;
        };
        Update: {
          machine_id?: string;
          product_id?: string;
          quantity?: number;
        };
      };
      products: {
        Row: {
          id: string;
          operator_id: string;
          name: string;
          sku: string | null;
          category_id: string | null;
          description: string | null;
          base_price: number;
          photo_url: string | null;
          nutritional: Json | null;
          allergens: string[] | null;
          status: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id: string;
          name: string;
          sku?: string | null;
          category_id?: string | null;
          description?: string | null;
          base_price: number;
          photo_url?: string | null;
          nutritional?: Json | null;
          allergens?: string[] | null;
          status?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          name?: string;
          sku?: string | null;
          category_id?: string | null;
          description?: string | null;
          base_price?: number;
          photo_url?: string | null;
          nutritional?: Json | null;
          allergens?: string[] | null;
          status?: string | null;
          created_at?: string | null;
        };
      };
      product_categories: {
        Row: {
          id: string;
          operator_id: string;
          name: string;
          color: string | null;
          sort_order: number | null;
        };
        Insert: {
          id?: string;
          operator_id: string;
          name: string;
          color?: string | null;
          sort_order?: number | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          name?: string;
          color?: string | null;
          sort_order?: number | null;
        };
      };
      rfid_items: {
        Row: {
          epc: string;
          operator_id: string;
          product_id: string | null;
          machine_id: string | null;
          status: 'available' | 'in_machine' | 'sold' | 'discarded' | 'lost' | null;
          expiration_date: string | null;
          restocked_at: string | null;
          restocked_by: string | null;
          sold_at: string | null;
          current_discount: number | null;
          tag_type: string | null;
          created_at: string | null;
        };
        Insert: {
          epc: string;
          operator_id: string;
          product_id?: string | null;
          machine_id?: string | null;
          status?: 'available' | 'in_machine' | 'sold' | 'discarded' | 'lost' | null;
          expiration_date?: string | null;
          restocked_at?: string | null;
          restocked_by?: string | null;
          sold_at?: string | null;
          current_discount?: number | null;
          tag_type?: string | null;
          created_at?: string | null;
        };
        Update: {
          epc?: string;
          operator_id?: string;
          product_id?: string | null;
          machine_id?: string | null;
          status?: 'available' | 'in_machine' | 'sold' | 'discarded' | 'lost' | null;
          expiration_date?: string | null;
          restocked_at?: string | null;
          restocked_by?: string | null;
          sold_at?: string | null;
          current_discount?: number | null;
          tag_type?: string | null;
          created_at?: string | null;
        };
      };
      tag_orders: {
        Row: {
          id: string;
          operator_id: string;
          tag_type: string | null;
          quantity: number | null;
          status: string | null;
          shipping_address: Json | null;
          notes: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id: string;
          tag_type?: string | null;
          quantity?: number | null;
          status?: string | null;
          shipping_address?: Json | null;
          notes?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          tag_type?: string | null;
          quantity?: number | null;
          status?: string | null;
          shipping_address?: Json | null;
          notes?: string | null;
          created_at?: string | null;
        };
      };
      transactions: {
        Row: {
          id: string;
          operator_id: string;
          machine_id: string | null;
          stripe_charge_id: string | null;
          amount: number | null;
          tax_amount: number | null;
          discount_amount: number | null;
          status: string | null;
          items: Json | null;
          customer_phone: string | null;
          customer_email: string | null;
          is_offline_sync: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id: string;
          machine_id?: string | null;
          stripe_charge_id?: string | null;
          amount?: number | null;
          tax_amount?: number | null;
          discount_amount?: number | null;
          status?: string | null;
          items?: Json | null;
          customer_phone?: string | null;
          customer_email?: string | null;
          is_offline_sync?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          machine_id?: string | null;
          stripe_charge_id?: string | null;
          amount?: number | null;
          tax_amount?: number | null;
          discount_amount?: number | null;
          status?: string | null;
          items?: Json | null;
          customer_phone?: string | null;
          customer_email?: string | null;
          is_offline_sync?: boolean | null;
          created_at?: string | null;
        };
      };
      alerts: {
        Row: {
          id: string;
          operator_id: string;
          machine_id: string | null;
          type: string;
          severity: string | null;
          message: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id: string;
          machine_id?: string | null;
          type: string;
          severity?: string | null;
          message?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          machine_id?: string | null;
          type?: string;
          severity?: string | null;
          message?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          created_at?: string | null;
        };
      };
      audit_log: {
        Row: {
          id: string;
          operator_id: string | null;
          user_id: string | null;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          payload: Json | null;
          ip_address: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id?: string | null;
          user_id?: string | null;
          action: string;
          entity_type?: string | null;
          entity_id?: string | null;
          payload?: Json | null;
          ip_address?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string | null;
          user_id?: string | null;
          action?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          payload?: Json | null;
          ip_address?: string | null;
          created_at?: string | null;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_operator_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
