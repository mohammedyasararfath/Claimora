// Hand-written to match supabase/migrations/*.sql. Regenerate with
// `supabase gen types typescript --local > lib/types/database.types.ts`
// (or --project-id against a hosted project) after any schema change — the
// generated output supersedes this file structurally but should keep the
// same shape (every table needs a `Relationships` array — see
// @supabase/postgrest-js's GenericTable type — or query results silently
// degrade to `never` everywhere).

export type ProfileStatus = "unclaimed" | "claimed" | "pro";
export type UserRole = "visitor" | "profile_owner" | "live_agent" | "admin";
export type ChatMode = "claim" | "create" | "dashboard";
export type ChatStatus =
  | "active"
  | "live_waiting"
  | "live_active"
  | "ready_to_claim"
  | "claimed"
  | "handed_off"
  | "abandoned";
export type ChatSender = "visitor" | "agent" | "system" | "liveagent" | "bio_proposal";
export type LiveRequestType = "claim" | "upgrade" | "contact";
export type LiveRequestStatus = "waiting" | "active" | "resolved" | "abandoned";
export type BillingCycle = "monthly" | "yearly";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";
export type EmailEventStatus = "queued" | "received" | "opened" | "clicked" | "bounced" | "spam" | "unsubscribed";

export interface Database {
  public: {
    Tables: {
      app_users: {
        Row: { id: string; role: UserRole; full_name: string | null; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["app_users"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["app_users"]["Row"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          slug: string;
          name: string;
          category: string;
          brokerage: string | null;
          city: string | null;
          license: string | null;
          status: ProfileStatus;
          owner_user_id: string | null;
          rating: number;
          reviews_count: number;
          srs: number;
          top5: boolean;
          phone_e164: string | null;
          email: string | null;
          snippet: string | null;
          verification_method: string | null;
          is_restricted: boolean;
          claim_date: string | null;
          sub_start_date: string | null;
          trial_end_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          slug: string;
          name: string;
          category: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      profile_field_locks: {
        Row: {
          profile_id: string;
          field_name: string;
          locked_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profile_field_locks"]["Row"]> & {
          profile_id: string;
          field_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["profile_field_locks"]["Row"]>;
        Relationships: [];
      };
      otp_codes: {
        Row: {
          id: string;
          profile_id: string | null;
          session_id: string | null;
          channel: "email" | "sms";
          destination: string;
          code_hash: string;
          attempts: number;
          max_attempts: number;
          expires_at: string;
          verified_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["otp_codes"]["Row"]> & {
          channel: "email" | "sms";
          destination: string;
          code_hash: string;
          expires_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["otp_codes"]["Row"]>;
        Relationships: [];
      };
      claim_tokens: {
        Row: {
          token_hash: string;
          profile_id: string;
          campaign_enrollment_id: string | null;
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["claim_tokens"]["Row"]> & {
          token_hash: string;
          profile_id: string;
          expires_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["claim_tokens"]["Row"]>;
        Relationships: [];
      };
      chat_sessions: {
        Row: {
          id: string;
          anon_token: string | null;
          visitor_user_id: string | null;
          profile_id: string | null;
          mode: ChatMode;
          status: ChatStatus;
          intent: string | null;
          fields: Record<string, unknown>;
          bio_state: { text?: string; status?: string } | null;
          pre_verified: { channel?: string; contact?: string } | "restricted" | null;
          claim_source: string | null;
          live_request_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["chat_sessions"]["Row"]> & { mode: ChatMode };
        Update: Partial<Database["public"]["Tables"]["chat_sessions"]["Row"]>;
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          session_id: string;
          sender: ChatSender;
          agent_name: string | null;
          body: string;
          is_open_question: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["chat_messages"]["Row"]> & {
          session_id: string;
          sender: ChatSender;
          body: string;
        };
        Update: Partial<Database["public"]["Tables"]["chat_messages"]["Row"]>;
        Relationships: [];
      };
      chat_graph_reads: {
        Row: { id: string; session_id: string; field_name: string; value_returned: string | null; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["chat_graph_reads"]["Row"]> & {
          session_id: string;
          field_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["chat_graph_reads"]["Row"]>;
        Relationships: [];
      };
      chat_open_questions: {
        Row: { id: string; session_id: string; topic: string; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["chat_open_questions"]["Row"]> & {
          session_id: string;
          topic: string;
        };
        Update: Partial<Database["public"]["Tables"]["chat_open_questions"]["Row"]>;
        Relationships: [];
      };
      live_agent_requests: {
        Row: {
          id: string;
          type: LiveRequestType;
          session_id: string | null;
          profile_id: string | null;
          status: LiveRequestStatus;
          abandoned: boolean;
          reason: string | null;
          summary: string | null;
          requester_name: string | null;
          requester_email: string | null;
          requester_message: string | null;
          current_tier: ProfileStatus | null;
          current_srs: number | null;
          pkg_snapshot: Record<string, unknown> | null;
          conversion_status: string | null;
          ai_snapshot_message_count: number;
          agent_user_id: string | null;
          accepted_at: string | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["live_agent_requests"]["Row"]> & { type: LiveRequestType };
        Update: Partial<Database["public"]["Tables"]["live_agent_requests"]["Row"]>;
        Relationships: [];
      };
      live_agent_requirements: {
        Row: { id: string; request_id: string; label: string; done: boolean; sort_order: number };
        Insert: Partial<Database["public"]["Tables"]["live_agent_requirements"]["Row"]> & {
          request_id: string;
          label: string;
        };
        Update: Partial<Database["public"]["Tables"]["live_agent_requirements"]["Row"]>;
        Relationships: [];
      };
      live_agent_notes: {
        Row: { id: string; request_id: string; agent_user_id: string | null; note: string; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["live_agent_notes"]["Row"]> & {
          request_id: string;
          note: string;
        };
        Update: Partial<Database["public"]["Tables"]["live_agent_notes"]["Row"]>;
        Relationships: [];
      };
      live_agent_field_edits: {
        Row: {
          id: string;
          request_id: string;
          field_name: string;
          old_value: string | null;
          new_value: string | null;
          edited_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["live_agent_field_edits"]["Row"]> & {
          request_id: string;
          field_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["live_agent_field_edits"]["Row"]>;
        Relationships: [];
      };
      agent_presence: {
        Row: { agent_user_id: string; status: "online" | "busy" | "offline"; last_seen_at: string };
        Insert: Partial<Database["public"]["Tables"]["agent_presence"]["Row"]> & { agent_user_id: string };
        Update: Partial<Database["public"]["Tables"]["agent_presence"]["Row"]>;
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          name: string;
          kind: string;
          sequence_length: number;
          interval_days: number;
          active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["campaigns"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["campaigns"]["Row"]>;
        Relationships: [];
      };
      campaign_enrollments: {
        Row: {
          id: string;
          campaign_id: string;
          profile_id: string;
          emails_sent: number;
          next_scheduled_at: string | null;
          stopped_reason: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["campaign_enrollments"]["Row"]> & {
          campaign_id: string;
          profile_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["campaign_enrollments"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "campaign_enrollments_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
        ];
      };
      email_events: {
        Row: {
          id: string;
          enrollment_id: string | null;
          profile_id: string;
          sequence_num: number;
          provider_message_id: string | null;
          status: EmailEventStatus;
          sent_at: string | null;
          opened_at: string | null;
          clicked_at: string | null;
          bounced_at: string | null;
          spam_at: string | null;
          unsubscribed_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["email_events"]["Row"]> & {
          profile_id: string;
          sequence_num: number;
        };
        Update: Partial<Database["public"]["Tables"]["email_events"]["Row"]>;
        Relationships: [];
      };
      sms_events: {
        Row: {
          id: string;
          profile_id: string | null;
          purpose: string;
          provider_message_sid: string | null;
          status: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sms_events"]["Row"]> & { purpose: string };
        Update: Partial<Database["public"]["Tables"]["sms_events"]["Row"]>;
        Relationships: [];
      };
      email_suppressions: {
        Row: { email: string; reason: string; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["email_suppressions"]["Row"]> & { email: string };
        Update: Partial<Database["public"]["Tables"]["email_suppressions"]["Row"]>;
        Relationships: [];
      };
      packages: {
        Row: {
          id: string;
          code: string;
          name: string;
          monthly_price_cents: number;
          yearly_price_cents: number;
          stripe_monthly_price_id: string | null;
          stripe_yearly_price_id: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["packages"]["Row"]> & { code: string; name: string };
        Update: Partial<Database["public"]["Tables"]["packages"]["Row"]>;
        Relationships: [];
      };
      addons: {
        Row: {
          id: string;
          code: string;
          name: string;
          monthly_price_cents: number;
          yearly_price_cents: number;
          bundled_only: boolean;
          stripe_monthly_price_id: string | null;
          stripe_yearly_price_id: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["addons"]["Row"]> & { code: string; name: string };
        Update: Partial<Database["public"]["Tables"]["addons"]["Row"]>;
        Relationships: [];
      };
      promo_codes: {
        Row: {
          code: string;
          description: string | null;
          trial_charge_cents: number | null;
          stripe_promotion_code_id: string | null;
          active: boolean;
          expires_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["promo_codes"]["Row"]> & { code: string };
        Update: Partial<Database["public"]["Tables"]["promo_codes"]["Row"]>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          profile_id: string;
          owner_user_id: string;
          package_id: string;
          addon_ids: string[];
          cycle: BillingCycle;
          promo_code: string | null;
          status: SubscriptionStatus;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          current_period_end: string | null;
          trial_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["subscriptions"]["Row"]> & {
          profile_id: string;
          owner_user_id: string;
          package_id: string;
          cycle: BillingCycle;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Row"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          subscription_id: string | null;
          request_id: string | null;
          stripe_payment_intent_id: string | null;
          amount_cents: number;
          currency: string;
          status: string;
          failure_reason: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["payments"]["Row"]> & { amount_cents: number; status: string };
        Update: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
        Relationships: [];
      };
      admin_audit_log: {
        Row: {
          id: string;
          actor_user_id: string | null;
          action: string;
          target_table: string | null;
          target_id: string | null;
          before: Record<string, unknown> | null;
          after: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["admin_audit_log"]["Row"]> & { action: string };
        Update: Partial<Database["public"]["Tables"]["admin_audit_log"]["Row"]>;
        Relationships: [];
      };
      agent_events: {
        Row: {
          id: string;
          session_id: string | null;
          surface: string;
          outcome: "started" | "converted" | "handed_off" | "resolved_by_human" | "abandoned";
          detail: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["agent_events"]["Row"]> & {
          surface: string;
          outcome: Database["public"]["Tables"]["agent_events"]["Row"]["outcome"];
        };
        Update: Partial<Database["public"]["Tables"]["agent_events"]["Row"]>;
        Relationships: [];
      };
      knowledge_chunks: {
        Row: { id: string; source: string; content: string; embedding: number[] | null; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["knowledge_chunks"]["Row"]> & { content: string };
        Update: Partial<Database["public"]["Tables"]["knowledge_chunks"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      confirm_claim: { Args: { p_session_id: string }; Returns: void };
      match_knowledge_chunks: {
        Args: { query_embedding: number[]; match_count?: number };
        Returns: { id: string; content: string; similarity: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
