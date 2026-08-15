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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      brand_profiles: {
        Row: {
          business_name: string
          created_at: string
          description: string
          google_drive_folder: string
          icp: string
          id: string
          keywords: string
          products_services: string
          propositions: string
          social_handles: Json
          tone: string
          updated_at: string
          user_id: string
          website: string
        }
        Insert: {
          business_name?: string
          created_at?: string
          description?: string
          google_drive_folder?: string
          icp?: string
          id?: string
          keywords?: string
          products_services?: string
          propositions?: string
          social_handles?: Json
          tone?: string
          updated_at?: string
          user_id: string
          website?: string
        }
        Update: {
          business_name?: string
          created_at?: string
          description?: string
          google_drive_folder?: string
          icp?: string
          id?: string
          keywords?: string
          products_services?: string
          propositions?: string
          social_handles?: Json
          tone?: string
          updated_at?: string
          user_id?: string
          website?: string
        }
        Relationships: []
      }
      channel_connections: {
        Row: {
          access_token: string
          account_id: string
          account_name: string
          channel: string
          created_at: string
          id: string
          meta: Json
          refresh_token: string
          scopes: string
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string
          account_id?: string
          account_name?: string
          channel: string
          created_at?: string
          id?: string
          meta?: Json
          refresh_token?: string
          scopes?: string
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          account_id?: string
          account_name?: string
          channel?: string
          created_at?: string
          id?: string
          meta?: Json
          refresh_token?: string
          scopes?: string
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      content_generation_jobs: {
        Row: {
          content_plan: Json
          created_at: string
          days_done: number
          days_total: number
          error: string | null
          id: string
          month: string
          pending_dates: string[]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_plan?: Json
          created_at?: string
          days_done?: number
          days_total?: number
          error?: string | null
          id?: string
          month: string
          pending_dates?: string[]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_plan?: Json
          created_at?: string
          days_done?: number
          days_total?: number
          error?: string | null
          id?: string
          month?: string
          pending_dates?: string[]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      content_items: {
        Row: {
          autopost: boolean
          body: string | null
          caption: string | null
          clicks: number
          created_at: string
          enabled: boolean
          engagements: number
          hashtags: string | null
          id: string
          image_prompt: string | null
          image_url: string | null
          impressions: number
          platforms: string[]
          posted_at: string | null
          publish_attempts: number
          published_channels: string[]
          scheduled_date: string
          scheduled_time: string
          status: Database["public"]["Enums"]["content_status"]
          summary: string | null
          title: string
          type: Database["public"]["Enums"]["content_type"]
          updated_at: string
          user_id: string
          video_error: string | null
          video_job_id: string | null
          video_script: string | null
          video_status: string
          video_url: string | null
          voiceover_url: string | null
        }
        Insert: {
          autopost?: boolean
          body?: string | null
          caption?: string | null
          clicks?: number
          created_at?: string
          enabled?: boolean
          engagements?: number
          hashtags?: string | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          impressions?: number
          platforms?: string[]
          posted_at?: string | null
          publish_attempts?: number
          published_channels?: string[]
          scheduled_date: string
          scheduled_time?: string
          status?: Database["public"]["Enums"]["content_status"]
          summary?: string | null
          title?: string
          type: Database["public"]["Enums"]["content_type"]
          updated_at?: string
          user_id: string
          video_error?: string | null
          video_job_id?: string | null
          video_script?: string | null
          video_status?: string
          video_url?: string | null
          voiceover_url?: string | null
        }
        Update: {
          autopost?: boolean
          body?: string | null
          caption?: string | null
          clicks?: number
          created_at?: string
          enabled?: boolean
          engagements?: number
          hashtags?: string | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          impressions?: number
          platforms?: string[]
          posted_at?: string | null
          publish_attempts?: number
          published_channels?: string[]
          scheduled_date?: string
          scheduled_time?: string
          status?: Database["public"]["Enums"]["content_status"]
          summary?: string | null
          title?: string
          type?: Database["public"]["Enums"]["content_type"]
          updated_at?: string
          user_id?: string
          video_error?: string | null
          video_job_id?: string | null
          video_script?: string | null
          video_status?: string
          video_url?: string | null
          voiceover_url?: string | null
        }
        Relationships: []
      }
      content_strategies: {
        Row: {
          created_at: string
          directives: string
          id: string
          insights: string
          metrics: Json
          rebuilt_dates: string[]
          user_id: string
          week_end: string
          week_start: string
        }
        Insert: {
          created_at?: string
          directives?: string
          id?: string
          insights?: string
          metrics?: Json
          rebuilt_dates?: string[]
          user_id: string
          week_end: string
          week_start: string
        }
        Update: {
          created_at?: string
          directives?: string
          id?: string
          insights?: string
          metrics?: Json
          rebuilt_dates?: string[]
          user_id?: string
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          plan: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          plan?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          plan?: string
          updated_at?: string
        }
        Relationships: []
      }
      publish_log: {
        Row: {
          channel: string
          content_item_id: string | null
          created_at: string
          error: string
          external_id: string
          external_url: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          channel: string
          content_item_id?: string | null
          created_at?: string
          error?: string
          external_id?: string
          external_url?: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          channel?: string
          content_item_id?: string | null
          created_at?: string
          error?: string
          external_id?: string
          external_url?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publish_log_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_period: string
          cancelled_at: string | null
          created_at: string
          currency: string
          current_period_end: string | null
          failure_reason: string | null
          id: string
          last_payment_id: string | null
          payment_method: string
          plan: string
          price_cents: number
          razorpay_customer_id: string | null
          razorpay_plan_id: string | null
          razorpay_subscription_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_period?: string
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          current_period_end?: string | null
          failure_reason?: string | null
          id?: string
          last_payment_id?: string | null
          payment_method?: string
          plan: string
          price_cents?: number
          razorpay_customer_id?: string | null
          razorpay_plan_id?: string | null
          razorpay_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_period?: string
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          current_period_end?: string | null
          failure_reason?: string | null
          id?: string
          last_payment_id?: string | null
          payment_method?: string
          plan?: string
          price_cents?: number
          razorpay_customer_id?: string | null
          razorpay_plan_id?: string | null
          razorpay_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          status: string
          subject: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string
          id?: string
          message: string
          status?: string
          subject?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          status?: string
          subject?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          email: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "viewer" | "editor" | "admin" | "root"
      content_status: "draft" | "scheduled" | "posted" | "failed"
      content_type: "blog" | "infographic" | "video"
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
      app_role: ["viewer", "editor", "admin", "root"],
      content_status: ["draft", "scheduled", "posted", "failed"],
      content_type: ["blog", "infographic", "video"],
    },
  },
} as const
