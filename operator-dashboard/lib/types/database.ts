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
          stripe_account_id: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          plan?: string | null;
          settings?: Json | null;
          branding?: Json | null;
          stripe_account_id?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          plan?: string | null;
          settings?: Json | null;
          branding?: Json | null;
          stripe_account_id?: string | null;
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
      restock_sessions: {
        Row: {
          id: string;
          operator_id: string;
          machine_id: string;
          started_by: string | null;
          started_at: string | null;
          completed_at: string | null;
          status: string | null;
          items_added: Json | null;
          items_removed: Json | null;
          physical_counts: Json | null;
          notes: string | null;
          photo_urls: string[] | null;
          discrepancy_count: number | null;
        };
        Insert: {
          id?: string;
          operator_id: string;
          machine_id: string;
          started_by?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          status?: string | null;
          items_added?: Json | null;
          items_removed?: Json | null;
          physical_counts?: Json | null;
          notes?: string | null;
          photo_urls?: string[] | null;
          discrepancy_count?: number | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          machine_id?: string;
          started_by?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          status?: string | null;
          items_added?: Json | null;
          items_removed?: Json | null;
          physical_counts?: Json | null;
          notes?: string | null;
          photo_urls?: string[] | null;
          discrepancy_count?: number | null;
        };
      };
      transactions: {
        Row: {
          id: string;
          operator_id: string;
          machine_id: string | null;
          discount_id: string | null;
          stripe_charge_id: string | null;
          amount: number | null;
          tax_amount: number | null;
          discount_amount: number | null;
          refund_amount: number | null;
          refunded_at: string | null;
          status: string | null;
          items: Json | null;
          customer_phone: string | null;
          customer_email: string | null;
          card_last4: string | null;
          currency: string | null;
          status_timeline: Json | null;
          receipt_sent_at: string | null;
          is_offline_sync: boolean | null;
          synced_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id: string;
          machine_id?: string | null;
          discount_id?: string | null;
          stripe_charge_id?: string | null;
          amount?: number | null;
          tax_amount?: number | null;
          discount_amount?: number | null;
          refund_amount?: number | null;
          refunded_at?: string | null;
          status?: string | null;
          items?: Json | null;
          customer_phone?: string | null;
          customer_email?: string | null;
          card_last4?: string | null;
          currency?: string | null;
          status_timeline?: Json | null;
          receipt_sent_at?: string | null;
          is_offline_sync?: boolean | null;
          synced_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          machine_id?: string | null;
          discount_id?: string | null;
          stripe_charge_id?: string | null;
          amount?: number | null;
          tax_amount?: number | null;
          discount_amount?: number | null;
          refund_amount?: number | null;
          refunded_at?: string | null;
          status?: string | null;
          items?: Json | null;
          customer_phone?: string | null;
          customer_email?: string | null;
          card_last4?: string | null;
          currency?: string | null;
          status_timeline?: Json | null;
          receipt_sent_at?: string | null;
          is_offline_sync?: boolean | null;
          synced_at?: string | null;
          created_at?: string | null;
        };
      };
      discounts: {
        Row: {
          id: string;
          operator_id: string;
          name: string;
          type: 'standard' | 'happy_hour' | 'expiration' | 'coupon' | string;
          value_type: 'percentage' | 'fixed' | string;
          value: number;
          target_product_ids: string[] | null;
          target_category_ids: string[] | null;
          target_machine_ids: string[] | null;
          schedule: Json | null;
          coupon_code: string | null;
          max_uses: number | null;
          uses_count: number | null;
          status: 'active' | 'scheduled' | 'paused' | 'ended' | string;
          starts_at: string | null;
          ends_at: string | null;
          ended_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id: string;
          name: string;
          type: 'standard' | 'happy_hour' | 'expiration' | 'coupon' | string;
          value_type: 'percentage' | 'fixed' | string;
          value: number;
          target_product_ids?: string[] | null;
          target_category_ids?: string[] | null;
          target_machine_ids?: string[] | null;
          schedule?: Json | null;
          coupon_code?: string | null;
          max_uses?: number | null;
          uses_count?: number | null;
          status?: 'active' | 'scheduled' | 'paused' | 'ended' | string;
          starts_at?: string | null;
          ends_at?: string | null;
          ended_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          name?: string;
          type?: 'standard' | 'happy_hour' | 'expiration' | 'coupon' | string;
          value_type?: 'percentage' | 'fixed' | string;
          value?: number;
          target_product_ids?: string[] | null;
          target_category_ids?: string[] | null;
          target_machine_ids?: string[] | null;
          schedule?: Json | null;
          coupon_code?: string | null;
          max_uses?: number | null;
          uses_count?: number | null;
          status?: 'active' | 'scheduled' | 'paused' | 'ended' | string;
          starts_at?: string | null;
          ends_at?: string | null;
          ended_at?: string | null;
          created_at?: string | null;
        };
      };
      expiration_rules: {
        Row: {
          id: string;
          operator_id: string;
          name: string | null;
          target_product_ids: string[] | null;
          target_category_ids: string[] | null;
          tiers: Json;
          is_active: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id: string;
          name?: string | null;
          target_product_ids?: string[] | null;
          target_category_ids?: string[] | null;
          tiers: Json;
          is_active?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          name?: string | null;
          target_product_ids?: string[] | null;
          target_category_ids?: string[] | null;
          tiers?: Json;
          is_active?: boolean | null;
          created_at?: string | null;
        };
      };
      daily_rollups: {
        Row: {
          operator_id: string;
          machine_id: string;
          product_id: string;
          date: string;
          units_sold: number;
          revenue: number;
          refunds: number;
          units_wasted: number;
          transactions_count: number;
        };
        Insert: {
          operator_id: string;
          machine_id: string;
          product_id: string;
          date: string;
          units_sold?: number;
          revenue?: number;
          refunds?: number;
          units_wasted?: number;
          transactions_count?: number;
        };
        Update: {
          operator_id?: string;
          machine_id?: string;
          product_id?: string;
          date?: string;
          units_sold?: number;
          revenue?: number;
          refunds?: number;
          units_wasted?: number;
          transactions_count?: number;
        };
      };
      cogs_settings: {
        Row: {
          id: string;
          operator_id: string;
          product_id: string | null;
          category_id: string | null;
          cogs_percentage: number;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id: string;
          product_id?: string | null;
          category_id?: string | null;
          cogs_percentage: number;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          product_id?: string | null;
          category_id?: string | null;
          cogs_percentage?: number;
          created_at?: string | null;
        };
      };
      consumer_profiles: {
        Row: {
          id: string;
          operator_id: string;
          phone: string | null;
          full_name: string | null;
          credit_balance: number;
          notification_opt_in: boolean;
          created_at: string | null;
        };
        Insert: {
          id: string;
          operator_id: string;
          phone?: string | null;
          full_name?: string | null;
          credit_balance?: number;
          notification_opt_in?: boolean;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          phone?: string | null;
          full_name?: string | null;
          credit_balance?: number;
          notification_opt_in?: boolean;
          created_at?: string | null;
        };
      };
      credit_ledger: {
        Row: {
          id: string;
          consumer_id: string;
          operator_id: string;
          type: 'award' | 'spend' | 'refund' | string;
          amount: number;
          reference_id: string | null;
          note: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          consumer_id: string;
          operator_id: string;
          type: 'award' | 'spend' | 'refund' | string;
          amount: number;
          reference_id?: string | null;
          note?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          consumer_id?: string;
          operator_id?: string;
          type?: 'award' | 'spend' | 'refund' | string;
          amount?: number;
          reference_id?: string | null;
          note?: string | null;
          created_at?: string | null;
        };
      };
      consumer_feedback: {
        Row: {
          id: string;
          consumer_id: string;
          operator_id: string;
          machine_id: string | null;
          product_id: string | null;
          rating: number;
          comment: string | null;
          operator_reply: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          consumer_id: string;
          operator_id: string;
          machine_id?: string | null;
          product_id?: string | null;
          rating: number;
          comment?: string | null;
          operator_reply?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          consumer_id?: string;
          operator_id?: string;
          machine_id?: string | null;
          product_id?: string | null;
          rating?: number;
          comment?: string | null;
          operator_reply?: string | null;
          created_at?: string | null;
        };
      };
      automation_rules: {
        Row: {
          id: string;
          operator_id: string | null;
          name: string;
          trigger_type: 'welcome' | 'nth_purchase' | 'spend_threshold' | string;
          trigger_value: number | null;
          reward_credits: number;
          is_active: boolean;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id?: string | null;
          name: string;
          trigger_type: 'welcome' | 'nth_purchase' | 'spend_threshold' | string;
          trigger_value?: number | null;
          reward_credits: number;
          is_active?: boolean;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string | null;
          name?: string;
          trigger_type?: 'welcome' | 'nth_purchase' | 'spend_threshold' | string;
          trigger_value?: number | null;
          reward_credits?: number;
          is_active?: boolean;
          created_at?: string | null;
        };
      };
      bonus_awards: {
        Row: {
          id: string;
          rule_id: string | null;
          consumer_id: string | null;
          operator_id: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          rule_id?: string | null;
          consumer_id?: string | null;
          operator_id?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          rule_id?: string | null;
          consumer_id?: string | null;
          operator_id?: string | null;
          created_at?: string | null;
        };
      };
      notification_sends: {
        Row: {
          id: string;
          operator_id: string | null;
          title: string;
          body: string;
          target: Json;
          deep_link_url: string | null;
          sent_count: number;
          sent_at: string | null;
          scheduled_for: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id?: string | null;
          title: string;
          body: string;
          target?: Json;
          deep_link_url?: string | null;
          sent_count?: number;
          sent_at?: string | null;
          scheduled_for?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string | null;
          title?: string;
          body?: string;
          target?: Json;
          deep_link_url?: string | null;
          sent_count?: number;
          sent_at?: string | null;
          scheduled_for?: string | null;
          created_at?: string | null;
        };
      };
      api_keys: {
        Row: {
          id: string;
          operator_id: string | null;
          name: string;
          key_hash: string;
          key_prefix: string;
          permissions: string[] | null;
          last_used_at: string | null;
          usage_count_today: number;
          is_active: boolean;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id?: string | null;
          name: string;
          key_hash: string;
          key_prefix: string;
          permissions?: string[] | null;
          last_used_at?: string | null;
          usage_count_today?: number;
          is_active?: boolean;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string | null;
          name?: string;
          key_hash?: string;
          key_prefix?: string;
          permissions?: string[] | null;
          last_used_at?: string | null;
          usage_count_today?: number;
          is_active?: boolean;
          created_at?: string | null;
        };
      };
      webhook_subscriptions: {
        Row: {
          id: string;
          operator_id: string | null;
          url: string;
          events: string[];
          secret: string;
          is_active: boolean;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id?: string | null;
          url: string;
          events: string[];
          secret: string;
          is_active?: boolean;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string | null;
          url?: string;
          events?: string[];
          secret?: string;
          is_active?: boolean;
          created_at?: string | null;
        };
      };
      webhook_deliveries: {
        Row: {
          id: string;
          subscription_id: string | null;
          event: string | null;
          payload: Json | null;
          status: number | null;
          response_body: string | null;
          attempt_count: number;
          next_retry_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          subscription_id?: string | null;
          event?: string | null;
          payload?: Json | null;
          status?: number | null;
          response_body?: string | null;
          attempt_count?: number;
          next_retry_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          subscription_id?: string | null;
          event?: string | null;
          payload?: Json | null;
          status?: number | null;
          response_body?: string | null;
          attempt_count?: number;
          next_retry_at?: string | null;
          created_at?: string | null;
        };
      };
      payouts: {
        Row: {
          id: string;
          operator_id: string;
          stripe_payout_id: string;
          amount: number;
          status: string;
          period_start: string | null;
          period_end: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id: string;
          stripe_payout_id: string;
          amount?: number;
          status?: string;
          period_start?: string | null;
          period_end?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          stripe_payout_id?: string;
          amount?: number;
          status?: string;
          period_start?: string | null;
          period_end?: string | null;
          created_at?: string | null;
        };
      };
      payout_transactions: {
        Row: {
          payout_id: string;
          transaction_id: string | null;
          operator_id: string;
          stripe_balance_transaction_id: string;
          amount: number;
          fee_amount: number;
          net_amount: number;
          created_at: string | null;
        };
        Insert: {
          payout_id: string;
          transaction_id?: string | null;
          operator_id: string;
          stripe_balance_transaction_id: string;
          amount?: number;
          fee_amount?: number;
          net_amount?: number;
          created_at?: string | null;
        };
        Update: {
          payout_id?: string;
          transaction_id?: string | null;
          operator_id?: string;
          stripe_balance_transaction_id?: string;
          amount?: number;
          fee_amount?: number;
          net_amount?: number;
          created_at?: string | null;
        };
      };
      temperature_readings: {
        Row: {
          id: string;
          operator_id: string;
          machine_id: string;
          temperature: number;
          recorded_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id: string;
          machine_id: string;
          temperature: number;
          recorded_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          machine_id?: string;
          temperature?: number;
          recorded_at?: string | null;
        };
      };
      push_subscriptions: {
        Row: {
          id: string;
          operator_id: string;
          user_id: string;
          subscription: Json;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id: string;
          user_id: string;
          subscription: Json;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          user_id?: string;
          subscription?: Json;
          created_at?: string | null;
        };
      };
      machine_commands: {
        Row: {
          id: string;
          operator_id: string;
          machine_id: string;
          issued_by: string | null;
          type: 'LOCKDOWN' | 'UNLOCK' | 'REBOOT' | 'TEMP_ADJUST' | string;
          status: 'pending' | 'acknowledged' | 'executed' | 'failed' | string;
          payload: Json;
          issued_at: string;
          acknowledged_at: string | null;
          executed_at: string | null;
          error_message: string | null;
        };
        Insert: {
          id?: string;
          operator_id: string;
          machine_id: string;
          issued_by?: string | null;
          type: 'LOCKDOWN' | 'UNLOCK' | 'REBOOT' | 'TEMP_ADJUST' | string;
          status?: 'pending' | 'acknowledged' | 'executed' | 'failed' | string;
          payload?: Json;
          issued_at?: string;
          acknowledged_at?: string | null;
          executed_at?: string | null;
          error_message?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          machine_id?: string;
          issued_by?: string | null;
          type?: 'LOCKDOWN' | 'UNLOCK' | 'REBOOT' | 'TEMP_ADJUST' | string;
          status?: 'pending' | 'acknowledged' | 'executed' | 'failed' | string;
          payload?: Json;
          issued_at?: string;
          acknowledged_at?: string | null;
          executed_at?: string | null;
          error_message?: string | null;
        };
      };
      machine_alert_preferences: {
        Row: {
          id: string;
          operator_id: string;
          machine_id: string;
          user_id: string;
          alert_type: 'OFFLINE' | 'TOO_WARM' | 'RFID_ERROR' | 'LOW_STOCK' | string;
          email_enabled: boolean;
          sms_enabled: boolean;
          push_enabled: boolean;
          delay_minutes: number;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          operator_id: string;
          machine_id: string;
          user_id: string;
          alert_type: 'OFFLINE' | 'TOO_WARM' | 'RFID_ERROR' | 'LOW_STOCK' | string;
          email_enabled?: boolean;
          sms_enabled?: boolean;
          push_enabled?: boolean;
          delay_minutes?: number;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          operator_id?: string;
          machine_id?: string;
          user_id?: string;
          alert_type?: 'OFFLINE' | 'TOO_WARM' | 'RFID_ERROR' | 'LOW_STOCK' | string;
          email_enabled?: boolean;
          sms_enabled?: boolean;
          push_enabled?: boolean;
          delay_minutes?: number;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      machine_alert_conditions: {
        Row: {
          operator_id: string;
          machine_id: string;
          alert_type: 'OFFLINE' | 'TOO_WARM' | 'RFID_ERROR' | 'LOW_STOCK' | string;
          condition_started_at: string;
          last_seen_at: string;
        };
        Insert: {
          operator_id: string;
          machine_id: string;
          alert_type: 'OFFLINE' | 'TOO_WARM' | 'RFID_ERROR' | 'LOW_STOCK' | string;
          condition_started_at: string;
          last_seen_at?: string;
        };
        Update: {
          operator_id?: string;
          machine_id?: string;
          alert_type?: 'OFFLINE' | 'TOO_WARM' | 'RFID_ERROR' | 'LOW_STOCK' | string;
          condition_started_at?: string;
          last_seen_at?: string;
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
      increment_coupon_uses_count: {
        Args: {
          p_discount_id: string;
          p_operator_id: string;
          p_increment?: number;
        };
        Returns: undefined;
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
