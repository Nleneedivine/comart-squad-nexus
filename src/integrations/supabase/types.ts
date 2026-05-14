export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          activity: string
          created_at: string
          id: string
          metadata: Json | null
          store_id: string
          type: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          activity: string
          created_at?: string
          id?: string
          metadata?: Json | null
          store_id: string
          type?: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          activity?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          store_id?: string
          type?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      agent_stocks: {
        Row: {
          agent_id: string
          agent_name: string | null
          allocated_at: string
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          store_id: string
        }
        Insert: {
          agent_id: string
          agent_name?: string | null
          allocated_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          quantity?: number
          store_id: string
        }
        Update: {
          agent_id?: string
          agent_name?: string | null
          allocated_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_stocks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_stocks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          area: string | null
          commission_pct: number
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          area?: string | null
          commission_pct?: number
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          area?: string | null
          commission_pct?: number
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_errors: {
        Row: {
          created_at: string
          environment: string | null
          id: string
          message: string
          metadata: Json
          module: string
          resolved_at: string | null
          resolved_by: string | null
          sentry_event_id: string | null
          severity: string
          stack_trace: string | null
          status: string
          store_id: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          environment?: string | null
          id?: string
          message: string
          metadata?: Json
          module?: string
          resolved_at?: string | null
          resolved_by?: string | null
          sentry_event_id?: string | null
          severity?: string
          stack_trace?: string | null
          status?: string
          store_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          environment?: string | null
          id?: string
          message?: string
          metadata?: Json
          module?: string
          resolved_at?: string | null
          resolved_by?: string | null
          sentry_event_id?: string | null
          severity?: string
          stack_trace?: string | null
          status?: string
          store_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      attendance: {
        Row: {
          clock_in: string
          clock_out: string | null
          created_at: string
          id: string
          store_id: string
          user_id: string
        }
        Insert: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          store_id: string
          user_id: string
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          audience: string
          body: string
          id: string
          sent_at: string
          sent_by: string | null
          title: string
        }
        Insert: {
          audience?: string
          body: string
          id?: string
          sent_at?: string
          sent_by?: string | null
          title: string
        }
        Update: {
          audience?: string
          body?: string
          id?: string
          sent_at?: string
          sent_by?: string | null
          title?: string
        }
        Relationships: []
      }
      businesses: {
        Row: {
          address: string | null
          business_name: string
          category: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          phone: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_name: string
          category?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_name?: string
          category?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_group_members: {
        Row: {
          added_at: string
          group_id: string
          id: string
          store_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          group_id: string
          id?: string
          store_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          group_id?: string
          id?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_groups: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          store_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          store_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          store_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          body: string
          channel: string
          created_at: string
          group_id: string | null
          id: string
          read_at: string | null
          recipient_id: string | null
          sender_id: string
          store_id: string
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          group_id?: string | null
          id?: string
          read_at?: string | null
          recipient_id?: string | null
          sender_id: string
          store_id: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          group_id?: string | null
          id?: string
          read_at?: string | null
          recipient_id?: string | null
          sender_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          agent_id: string
          amount: number
          base_amount: number
          created_at: string
          id: string
          order_id: string
          paid_at: string | null
          paid_by: string | null
          percent: number
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          amount?: number
          base_amount?: number
          created_at?: string
          id?: string
          order_id: string
          paid_at?: string | null
          paid_by?: string | null
          percent?: number
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          amount?: number
          base_amount?: number
          created_at?: string
          id?: string
          order_id?: string
          paid_at?: string | null
          paid_by?: string | null
          percent?: number
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          full_address: string | null
          id: string
          name: string
          notes: string | null
          phone: string
          state: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          full_address?: string | null
          id?: string
          name: string
          notes?: string | null
          phone: string
          state?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          full_address?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string
          state?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_snapshots: {
        Row: {
          cancelled_count: number
          created_at: string
          delivered_count: number
          id: string
          orders_count: number
          report_date: string
          revenue: number
          store_id: string
          top_product: string | null
        }
        Insert: {
          cancelled_count?: number
          created_at?: string
          delivered_count?: number
          id?: string
          orders_count?: number
          report_date: string
          revenue?: number
          store_id: string
          top_product?: string | null
        }
        Update: {
          cancelled_count?: number
          created_at?: string
          delivered_count?: number
          id?: string
          orders_count?: number
          report_date?: string
          revenue?: number
          store_id?: string
          top_product?: string | null
        }
        Relationships: []
      }
      failed_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          job_name: string
          last_retry_at: string | null
          payload: Json
          retry_count: number
          status: string
          store_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          job_name: string
          last_retry_at?: string | null
          payload?: Json
          retry_count?: number
          status?: string
          store_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          job_name?: string
          last_retry_at?: string | null
          payload?: Json
          retry_count?: number
          status?: string
          store_id?: string | null
        }
        Relationships: []
      }
      failed_webhooks: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string | null
          id: string
          last_retry_at: string | null
          payload: Json
          provider: string
          retry_count: number
          status: string
          store_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          id?: string
          last_retry_at?: string | null
          payload?: Json
          provider?: string
          retry_count?: number
          status?: string
          store_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          id?: string
          last_retry_at?: string | null
          payload?: Json
          provider?: string
          retry_count?: number
          status?: string
          store_id?: string | null
        }
        Relationships: []
      }
      faulty_stocks: {
        Row: {
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          reason: string | null
          reported_date: string
          store_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          quantity?: number
          reason?: string | null
          reported_date?: string
          store_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          reason?: string | null
          reported_date?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "faulty_stocks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faulty_stocks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          flag_key: string
          id: string
          store_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          flag_key: string
          id?: string
          store_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          flag_key?: string
          id?: string
          store_id?: string
        }
        Relationships: []
      }
      finance_records: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          record_date: string
          source: string | null
          store_id: string
          type: Database["public"]["Enums"]["finance_type"]
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          record_date?: string
          source?: string | null
          store_id: string
          type: Database["public"]["Enums"]["finance_type"]
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          record_date?: string
          source?: string | null
          store_id?: string
          type?: Database["public"]["Enums"]["finance_type"]
        }
        Relationships: []
      }
      form_submissions: {
        Row: {
          created_at: string
          customer_address: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string
          form_id: string
          id: string
          items: Json
          notes: string | null
          store_id: string
          total: number
        }
        Insert: {
          created_at?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          form_id: string
          id?: string
          items?: Json
          notes?: string | null
          store_id: string
          total?: number
        }
        Update: {
          created_at?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          form_id?: string
          id?: string
          items?: Json
          notes?: string | null
          store_id?: string
          total?: number
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          created_by: string | null
          current_value: number
          deadline: string | null
          description: string | null
          id: string
          status: string
          store_id: string
          target_value: number
          title: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_value?: number
          deadline?: string | null
          description?: string | null
          id?: string
          status?: string
          store_id: string
          target_value?: number
          title: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_value?: number
          deadline?: string | null
          description?: string | null
          id?: string
          status?: string
          store_id?: string
          target_value?: number
          title?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      integration_catalog: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          key: string
          monthly_price: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          monthly_price?: number
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          monthly_price?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          created_at: string
          currency: string
          discount: number
          id: string
          invoice_number: string
          issued_at: string
          line_items: Json
          paid_at: string | null
          paystack_reference: string | null
          period_end: string | null
          period_start: string | null
          status: string
          store_id: string
          subtotal: number
          total: number
        }
        Insert: {
          created_at?: string
          currency?: string
          discount?: number
          id?: string
          invoice_number: string
          issued_at?: string
          line_items?: Json
          paid_at?: string | null
          paystack_reference?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          store_id: string
          subtotal?: number
          total?: number
        }
        Update: {
          created_at?: string
          currency?: string
          discount?: number
          id?: string
          invoice_number?: string
          issued_at?: string
          line_items?: Json
          paid_at?: string | null
          paystack_reference?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          store_id?: string
          subtotal?: number
          total?: number
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          store_id: string
          updated_at: string
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          store_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          email: boolean
          id: string
          in_app: boolean
          notif_type: string
          toast: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: boolean
          id?: string
          in_app?: boolean
          notif_type: string
          toast?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: boolean
          id?: string
          in_app?: boolean
          notif_type?: string
          toast?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          store_id: string
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          store_id: string
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          store_id?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          store_id: string
          subtotal: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          store_id: string
          subtotal?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          store_id?: string
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          note: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount: number
          assigned_at: string | null
          assigned_to: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          expire_pending: boolean
          id: string
          is_archived: boolean
          notes: string | null
          order_number: string | null
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          units: number
        }
        Insert: {
          amount?: number
          assigned_at?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          expire_pending?: boolean
          id?: string
          is_archived?: boolean
          notes?: string | null
          order_number?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id: string
          units?: number
        }
        Update: {
          amount?: number
          assigned_at?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          expire_pending?: boolean
          id?: string
          is_archived?: boolean
          notes?: string | null
          order_number?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount: number
          created_at: string
          currency: string
          event_type: string
          id: string
          processed_at: string | null
          provider: string
          raw: Json
          reference: string
          status: string
          store_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          event_type: string
          id?: string
          processed_at?: string | null
          provider?: string
          raw?: Json
          reference: string
          status: string
          store_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          event_type?: string
          id?: string
          processed_at?: string | null
          provider?: string
          raw?: Json
          reference?: string
          status?: string
          store_id?: string | null
        }
        Relationships: []
      }
      payment_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          entry_type: string
          event_id: string | null
          id: string
          reference: string | null
          store_id: string
        }
        Insert: {
          amount: number
          balance_after?: number
          created_at?: string
          description?: string | null
          entry_type: string
          event_id?: string | null
          id?: string
          reference?: string | null
          store_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          entry_type?: string
          event_id?: string | null
          id?: string
          reference?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_ledger_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "payment_events"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          staff_count: number
          status: string
          store_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          staff_count?: number
          status?: string
          store_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          staff_count?: number
          status?: string
          store_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      payslips: {
        Row: {
          allowances: number
          base_salary: number
          bonus: number
          commission_amount: number
          created_at: string
          deductions: number
          gross_pay: number
          hourly_pay: number
          hours_worked: number
          id: string
          net_pay: number
          notes: string | null
          paid_at: string | null
          period_id: string
          staff_name: string | null
          status: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowances?: number
          base_salary?: number
          bonus?: number
          commission_amount?: number
          created_at?: string
          deductions?: number
          gross_pay?: number
          hourly_pay?: number
          hours_worked?: number
          id?: string
          net_pay?: number
          notes?: string | null
          paid_at?: string | null
          period_id: string
          staff_name?: string | null
          status?: string
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowances?: number
          base_salary?: number
          bonus?: number
          commission_amount?: number
          created_at?: string
          deductions?: number
          gross_pay?: number
          hourly_pay?: number
          hours_worked?: number
          id?: string
          net_pay?: number
          notes?: string | null
          paid_at?: string | null
          period_id?: string
          staff_name?: string | null
          status?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payslips_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          buying_price: number
          category: string | null
          created_at: string
          id: string
          name: string
          reorder_point: number
          selling_price: number
          sku: string | null
          status: string
          stock_qty: number
          store_id: string
          updated_at: string
        }
        Insert: {
          buying_price?: number
          category?: string | null
          created_at?: string
          id?: string
          name: string
          reorder_point?: number
          selling_price?: number
          sku?: string | null
          status?: string
          stock_qty?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          buying_price?: number
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          reorder_point?: number
          selling_price?: number
          sku?: string | null
          status?: string
          stock_qty?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_locked_until: string | null
          avatar_url: string | null
          community_name: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          onboarding_completed: boolean
          onboarding_step: number
          phone: string | null
          theme_preference: string
          updated_at: string
        }
        Insert: {
          avatar_locked_until?: string | null
          avatar_url?: string | null
          community_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          onboarding_completed?: boolean
          onboarding_step?: number
          phone?: string | null
          theme_preference?: string
          updated_at?: string
        }
        Update: {
          avatar_locked_until?: string | null
          avatar_url?: string | null
          community_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          onboarding_step?: number
          phone?: string | null
          theme_preference?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          purchase_id: string
          quantity: number
          store_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          purchase_id: string
          quantity?: number
          store_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          purchase_id?: string
          quantity?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          damaged_qty: number
          id: string
          notes: string | null
          product_id: string | null
          product_name: string
          purchase_order_id: string
          quantity: number
          received_qty: number
          store_id: string
          subtotal: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          damaged_qty?: number
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name: string
          purchase_order_id: string
          quantity?: number
          received_qty?: number
          store_id: string
          subtotal?: number
          unit_cost?: number
        }
        Update: {
          created_at?: string
          damaged_qty?: number
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name?: string
          purchase_order_id?: string
          quantity?: number
          received_qty?: number
          store_id?: string
          subtotal?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          amount_paid: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          expected_date: string | null
          id: string
          invoice_url: string | null
          notes: string | null
          po_number: string
          received_at: string | null
          status: string
          store_id: string
          subtotal: number
          supplier_id: string
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          expected_date?: string | null
          id?: string
          invoice_url?: string | null
          notes?: string | null
          po_number: string
          received_at?: string | null
          status?: string
          store_id: string
          subtotal?: number
          supplier_id: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          expected_date?: string | null
          id?: string
          invoice_url?: string | null
          notes?: string | null
          po_number?: string
          received_at?: string | null
          status?: string
          store_id?: string
          subtotal?: number
          supplier_id?: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          purchase_date: string
          store_id: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          purchase_date?: string
          store_id: string
          total_amount?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          purchase_date?: string
          store_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchases_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          amount: number
          id: string
          invoice_id: string | null
          issued_at: string
          paystack_reference: string | null
          receipt_number: string
          store_id: string
        }
        Insert: {
          amount: number
          id?: string
          invoice_id?: string | null
          issued_at?: string
          paystack_reference?: string | null
          receipt_number: string
          store_id: string
        }
        Update: {
          amount?: number
          id?: string
          invoice_id?: string | null
          issued_at?: string
          paystack_reference?: string | null
          receipt_number?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          requested_by: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          order_id: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          requested_by?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          requested_by?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_forms: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          fields: Json
          id: string
          product_ids: string[]
          slug: string
          status: string
          store_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          id?: string
          product_ids?: string[]
          slug: string
          status?: string
          store_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          id?: string
          product_ids?: string[]
          slug?: string
          status?: string
          store_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          store_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role: Database["public"]["Enums"]["app_role"]
          status?: string
          store_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          store_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invites_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_salaries: {
        Row: {
          allowances: number
          base_salary: number
          created_at: string
          effective_from: string
          hourly_rate: number
          id: string
          notes: string | null
          pay_type: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowances?: number
          base_salary?: number
          created_at?: string
          effective_from?: string
          hourly_rate?: number
          id?: string
          notes?: string | null
          pay_type?: string
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowances?: number
          base_salary?: number
          created_at?: string
          effective_from?: string
          hourly_rate?: number
          id?: string
          notes?: string | null
          pay_type?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_workload_stats: {
        Row: {
          assigned_count: number
          cancelled_count: number
          completed_count: number
          delivered_count: number
          expired_count: number
          id: string
          period_start: string
          staff_id: string
          store_id: string
          updated_at: string
        }
        Insert: {
          assigned_count?: number
          cancelled_count?: number
          completed_count?: number
          delivered_count?: number
          expired_count?: number
          id?: string
          period_start: string
          staff_id: string
          store_id: string
          updated_at?: string
        }
        Update: {
          assigned_count?: number
          cancelled_count?: number
          completed_count?: number
          delivered_count?: number
          expired_count?: number
          id?: string
          period_start?: string
          staff_id?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          balance: number
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          qty_change: number
          reference: string | null
          store_id: string
          type: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          qty_change: number
          reference?: string | null
          store_id: string
          type: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          qty_change?: number
          reference?: string | null
          store_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_integrations: {
        Row: {
          activated_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          integration_key: string
          paystack_reference: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          integration_key: string
          paystack_reference?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          integration_key?: string
          paystack_reference?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stores: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          status: Database["public"]["Enums"]["store_status"]
          suspended_at: string | null
          webhook_secret: string | null
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          status?: Database["public"]["Enums"]["store_status"]
          suspended_at?: string | null
          webhook_secret?: string | null
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          status?: Database["public"]["Enums"]["store_status"]
          suspended_at?: string | null
          webhook_secret?: string | null
        }
        Relationships: []
      }
      subscription_history: {
        Row: {
          created_at: string
          from_status: string | null
          id: string
          metadata: Json | null
          reason: string | null
          store_id: string
          to_status: string
        }
        Insert: {
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json | null
          reason?: string | null
          store_id: string
          to_status: string
        }
        Update: {
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json | null
          reason?: string | null
          store_id?: string
          to_status?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount: number
          billing_cycle: string
          created_at: string
          current_period_end: string | null
          discount_note: string | null
          discount_type: string
          discount_value: number
          grace_period_ends_at: string | null
          id: string
          next_billing_at: string | null
          paystack_customer_code: string | null
          paystack_subscription_code: string | null
          plan: string
          status: string
          store_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          billing_cycle?: string
          created_at?: string
          current_period_end?: string | null
          discount_note?: string | null
          discount_type?: string
          discount_value?: number
          grace_period_ends_at?: string | null
          id?: string
          next_billing_at?: string | null
          paystack_customer_code?: string | null
          paystack_subscription_code?: string | null
          plan?: string
          status?: string
          store_id: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_cycle?: string
          created_at?: string
          current_period_end?: string | null
          discount_note?: string | null
          discount_type?: string
          discount_value?: number
          grace_period_ends_at?: string | null
          id?: string
          next_billing_at?: string | null
          paystack_customer_code?: string | null
          paystack_subscription_code?: string | null
          plan?: string
          status?: string
          store_id?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      superadmins: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_at: string
          purchase_order_id: string | null
          reference: string | null
          store_id: string
          supplier_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string
          purchase_order_id?: string | null
          reference?: string | null
          store_id: string
          supplier_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string
          purchase_order_id?: string | null
          reference?: string | null
          store_id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          category: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_by: string | null
          assigned_to: string | null
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          priority: string
          status: string
          store_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          assigned_to?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          priority?: string
          status?: string
          store_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          assigned_to?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          priority?: string
          status?: string
          store_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      todos: {
        Row: {
          completed: boolean
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          store_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          store_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          store_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          is_suspended: boolean
          role: Database["public"]["Enums"]["app_role"]
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_suspended?: boolean
          role: Database["public"]["Enums"]["app_role"]
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_suspended?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["wallet_tx_kind"]
          paystack_reference: string | null
          reference: string | null
          status: Database["public"]["Enums"]["wallet_tx_status"]
          store_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind: Database["public"]["Enums"]["wallet_tx_kind"]
          paystack_reference?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["wallet_tx_status"]
          store_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["wallet_tx_kind"]
          paystack_reference?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["wallet_tx_status"]
          store_id?: string
          wallet_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          created_at: string
          id: string
          pin_hash: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          pin_hash?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          pin_hash?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      waybills: {
        Row: {
          created_at: string
          destination: string | null
          dispatch_date: string
          dispatched_by: string | null
          id: string
          items: Json
          notes: string | null
          recipient_address: string | null
          recipient_name: string
          recipient_phone: string | null
          store_id: string
          waybill_number: string
        }
        Insert: {
          created_at?: string
          destination?: string | null
          dispatch_date?: string
          dispatched_by?: string | null
          id?: string
          items?: Json
          notes?: string | null
          recipient_address?: string | null
          recipient_name: string
          recipient_phone?: string | null
          store_id: string
          waybill_number: string
        }
        Update: {
          created_at?: string
          destination?: string | null
          dispatch_date?: string
          dispatched_by?: string | null
          id?: string
          items?: Json
          notes?: string | null
          recipient_address?: string | null
          recipient_name?: string
          recipient_phone?: string | null
          store_id?: string
          waybill_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "waybills_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          created_at: string
          error: string | null
          id: string
          payload: Json
          result: Json | null
          source: string
          status: string
          store_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          source?: string
          status?: string
          store_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          source?: string
          status?: string
          store_id?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          id: string
          payload: Json | null
          status: string
          store_id: string
          summary: string | null
          topic: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          payload?: Json | null
          status?: string
          store_id: string
          summary?: string | null
          topic: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          payload?: Json | null
          status?: string
          store_id?: string
          summary?: string | null
          topic?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_subscription_lifecycle: { Args: never; Returns: undefined }
      compute_subscription_amount: {
        Args: { _store_id: string }
        Returns: number
      }
      expire_stale_orders: { Args: never; Returns: undefined }
      generate_daily_reports: { Args: never; Returns: undefined }
      generate_payslips: { Args: { _period_id: string }; Returns: number }
      get_store_webhook_secret: { Args: { _store_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _store_id: string
          _user_id: string
        }
        Returns: boolean
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_member_active: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
      is_store_admin: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
      is_store_member: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      isolation_probe: {
        Args: { _actor: string; _foreign_store: string }
        Returns: {
          leaked_rows: number
          table_name: string
        }[]
      }
      mark_payroll_paid: { Args: { _period_id: string }; Returns: undefined }
      receive_purchase_order_items: {
        Args: { _items: Json; _po_id: string }
        Returns: undefined
      }
      record_payment_event: {
        Args: {
          _amount: number
          _event_type: string
          _raw: Json
          _reference: string
          _status: string
          _store_id: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "owner"
        | "sales_rep"
        | "manager"
        | "hr"
        | "inventory_manager"
        | "marketer"
        | "order_manager"
        | "customer_care"
        | "logistics_manager"
        | "accountant"
        | "head_of_operations"
      finance_type: "income" | "expense"
      order_status:
        | "pending"
        | "processing"
        | "delivered"
        | "cancelled"
        | "shipped"
      store_status: "active" | "suspended" | "deleted"
      wallet_tx_kind: "sale" | "funding" | "withdrawal"
      wallet_tx_status: "pending" | "success" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "owner",
        "sales_rep",
        "manager",
        "hr",
        "inventory_manager",
        "marketer",
        "order_manager",
        "customer_care",
        "logistics_manager",
        "accountant",
        "head_of_operations",
      ],
      finance_type: ["income", "expense"],
      order_status: [
        "pending",
        "processing",
        "delivered",
        "cancelled",
        "shipped",
      ],
      store_status: ["active", "suspended", "deleted"],
      wallet_tx_kind: ["sale", "funding", "withdrawal"],
      wallet_tx_status: ["pending", "success", "failed"],
    },
  },
} as const
