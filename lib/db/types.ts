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
      accountability_settings: {
        Row: {
          id: string
          period_days: number
          period_kind: string
        }
        Insert: {
          id?: string
          period_days?: number
          period_kind?: string
        }
        Update: {
          id?: string
          period_days?: number
          period_kind?: string
        }
        Relationships: []
      }
      app_events: {
        Row: {
          created_at: string
          event_key: string
          id: string
          payload: Json
          processed_at: string | null
        }
        Insert: {
          created_at?: string
          event_key: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Update: {
          created_at?: string
          event_key?: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Relationships: []
      }
      break_rules: {
        Row: {
          age_band: string
          id: string
          max_shift_minutes: number
          meal_minutes_unpaid: number
          min_shift_minutes: number
          rest_minutes_paid: number
          sort: number
        }
        Insert: {
          age_band: string
          id?: string
          max_shift_minutes: number
          meal_minutes_unpaid?: number
          min_shift_minutes: number
          rest_minutes_paid?: number
          sort?: number
        }
        Update: {
          age_band?: string
          id?: string
          max_shift_minutes?: number
          meal_minutes_unpaid?: number
          min_shift_minutes?: number
          rest_minutes_paid?: number
          sort?: number
        }
        Relationships: []
      }
      breaks: {
        Row: {
          authorized_at: string | null
          ended_at: string | null
          id: string
          kind: string
          rule_id: string | null
          sequence: number | null
          setup_id: string | null
          started_at: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          authorized_at?: string | null
          ended_at?: string | null
          id?: string
          kind: string
          rule_id?: string | null
          sequence?: number | null
          setup_id?: string | null
          started_at?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          authorized_at?: string | null
          ended_at?: string | null
          id?: string
          kind?: string
          rule_id?: string | null
          sequence?: number | null
          setup_id?: string | null
          started_at?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "breaks_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "break_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breaks_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "setups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      catering_checklist_defaults: {
        Row: {
          active: boolean
          id: string
          label: string
          sort: number
          stage: string
        }
        Insert: {
          active?: boolean
          id?: string
          label: string
          sort?: number
          stage: string
        }
        Update: {
          active?: boolean
          id?: string
          label?: string
          sort?: number
          stage?: string
        }
        Relationships: []
      }
      catering_checklist_items: {
        Row: {
          done: boolean
          done_at: string | null
          done_by: string | null
          id: string
          label: string
          order_id: string
          sort: number
          stage: string
        }
        Insert: {
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          label: string
          order_id: string
          sort?: number
          stage: string
        }
        Update: {
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          label?: string
          order_id?: string
          sort?: number
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "catering_checklist_items_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_checklist_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "catering_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      catering_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      catering_followups: {
        Row: {
          contact_id: string | null
          done_at: string | null
          due_on: string | null
          id: string
          note: string | null
          order_id: string
          outcome: string | null
        }
        Insert: {
          contact_id?: string | null
          done_at?: string | null
          due_on?: string | null
          id?: string
          note?: string | null
          order_id: string
          outcome?: string | null
        }
        Update: {
          contact_id?: string | null
          done_at?: string | null
          due_on?: string | null
          id?: string
          note?: string | null
          order_id?: string
          outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catering_followups_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "catering_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_followups_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "catering_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      catering_menu_items: {
        Row: {
          active: boolean
          category: string | null
          components: Json | null
          id: string
          name: string
          scaling_rules: Json | null
        }
        Insert: {
          active?: boolean
          category?: string | null
          components?: Json | null
          id?: string
          name: string
          scaling_rules?: Json | null
        }
        Update: {
          active?: boolean
          category?: string | null
          components?: Json | null
          id?: string
          name?: string
          scaling_rules?: Json | null
        }
        Relationships: []
      }
      catering_order_items: {
        Row: {
          id: string
          menu_item_id: string
          order_id: string
          qty: number
        }
        Insert: {
          id?: string
          menu_item_id: string
          order_id: string
          qty?: number
        }
        Update: {
          id?: string
          menu_item_id?: string
          order_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "catering_order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "catering_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "catering_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      catering_orders: {
        Row: {
          amount: number | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          delivery_address: string | null
          email: string | null
          event_date: string
          event_time: string | null
          fulfillment: string | null
          guest_name: string
          headcount: number | null
          id: string
          notes: string | null
          paper_goods: boolean
          phone: string | null
          source: string | null
          stage: string
          stage_changed_at: string | null
        }
        Insert: {
          amount?: number | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_address?: string | null
          email?: string | null
          event_date: string
          event_time?: string | null
          fulfillment?: string | null
          guest_name: string
          headcount?: number | null
          id?: string
          notes?: string | null
          paper_goods?: boolean
          phone?: string | null
          source?: string | null
          stage?: string
          stage_changed_at?: string | null
        }
        Update: {
          amount?: number | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_address?: string | null
          email?: string | null
          event_date?: string
          event_time?: string | null
          fulfillment?: string | null
          guest_name?: string
          headcount?: number | null
          id?: string
          notes?: string | null
          paper_goods?: boolean
          phone?: string | null
          source?: string | null
          stage?: string
          stage_changed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catering_orders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "catering_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_answers: {
        Row: {
          answered_at: string | null
          answered_by: string | null
          comment: string | null
          corrective_action_note: string | null
          flagged: boolean
          id: string
          is_na: boolean
          photo_url: string | null
          question_id: string
          run_id: string
          value: Json | null
        }
        Insert: {
          answered_at?: string | null
          answered_by?: string | null
          comment?: string | null
          corrective_action_note?: string | null
          flagged?: boolean
          id?: string
          is_na?: boolean
          photo_url?: string | null
          question_id: string
          run_id: string
          value?: Json | null
        }
        Update: {
          answered_at?: string | null
          answered_by?: string | null
          comment?: string | null
          corrective_action_note?: string | null
          flagged?: boolean
          id?: string
          is_na?: boolean
          photo_url?: string | null
          question_id?: string
          run_id?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_answers_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "checklist_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_answers_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "checklist_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_questions: {
        Row: {
          allow_na: boolean
          choices: Json | null
          corrective_actions: string | null
          food_item_id: string | null
          id: string
          photo_required: boolean
          prompt: string
          section_id: string
          sort: number
          token_value: number
          type: string
        }
        Insert: {
          allow_na?: boolean
          choices?: Json | null
          corrective_actions?: string | null
          food_item_id?: string | null
          id?: string
          photo_required?: boolean
          prompt: string
          section_id: string
          sort?: number
          token_value?: number
          type: string
        }
        Update: {
          allow_na?: boolean
          choices?: Json | null
          corrective_actions?: string | null
          food_item_id?: string | null
          id?: string
          photo_required?: boolean
          prompt?: string
          section_id?: string
          sort?: number
          token_value?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_questions_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "checklist_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_runs: {
        Row: {
          assigned_position_id: string | null
          assigned_team_id: string | null
          assigned_user_id: string | null
          completed_at: string | null
          completed_by: string | null
          day_part_id: string | null
          id: string
          run_date: string
          schedule_id: string | null
          started_at: string | null
          status: string
          template_id: string
        }
        Insert: {
          assigned_position_id?: string | null
          assigned_team_id?: string | null
          assigned_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          day_part_id?: string | null
          id?: string
          run_date?: string
          schedule_id?: string | null
          started_at?: string | null
          status?: string
          template_id: string
        }
        Update: {
          assigned_position_id?: string | null
          assigned_team_id?: string | null
          assigned_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          day_part_id?: string | null
          id?: string
          run_date?: string
          schedule_id?: string | null
          started_at?: string | null
          status?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_runs_assigned_position_id_fkey"
            columns: ["assigned_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_assigned_team_id_fkey"
            columns: ["assigned_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_day_part_id_fkey"
            columns: ["day_part_id"]
            isOneToOne: false
            referencedRelation: "day_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "checklist_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_schedules: {
        Row: {
          alert_on_incomplete: boolean
          assign_position_id: string | null
          assign_team_id: string | null
          day_of_month: number | null
          day_part_id: string | null
          days_of_week: number[] | null
          discord_channel_id: string | null
          due_time: string | null
          frequency: string
          id: string
          notify_discord: boolean
          start_time: string | null
          template_id: string
        }
        Insert: {
          alert_on_incomplete?: boolean
          assign_position_id?: string | null
          assign_team_id?: string | null
          day_of_month?: number | null
          day_part_id?: string | null
          days_of_week?: number[] | null
          discord_channel_id?: string | null
          due_time?: string | null
          frequency: string
          id?: string
          notify_discord?: boolean
          start_time?: string | null
          template_id: string
        }
        Update: {
          alert_on_incomplete?: boolean
          assign_position_id?: string | null
          assign_team_id?: string | null
          day_of_month?: number | null
          day_part_id?: string | null
          days_of_week?: number[] | null
          discord_channel_id?: string | null
          due_time?: string | null
          frequency?: string
          id?: string
          notify_discord?: boolean
          start_time?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_schedules_assign_position_id_fkey"
            columns: ["assign_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_schedules_assign_team_id_fkey"
            columns: ["assign_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_schedules_day_part_id_fkey"
            columns: ["day_part_id"]
            isOneToOne: false
            referencedRelation: "day_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_schedules_discord_channel_id_fkey"
            columns: ["discord_channel_id"]
            isOneToOne: false
            referencedRelation: "discord_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_sections: {
        Row: {
          id: string
          name: string
          sort: number
          template_id: string
        }
        Insert: {
          id?: string
          name: string
          sort?: number
          template_id: string
        }
        Update: {
          id?: string
          name?: string
          sort?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          active: boolean
          description: string | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      course_attachments: {
        Row: {
          course_id: string
          file_url: string
          id: string
          label: string | null
        }
        Insert: {
          course_id: string
          file_url: string
          id?: string
          label?: string | null
        }
        Update: {
          course_id?: string
          file_url?: string
          id?: string
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_attachments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_feedback: {
        Row: {
          course_id: string
          created_at: string
          feedback: string | null
          id: string
          rating: number | null
          user_id: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          feedback?: string | null
          id?: string
          rating?: number | null
          user_id?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          feedback?: string | null
          id?: string
          rating?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_feedback_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      day_parts: {
        Row: {
          end_time: string
          id: string
          name: string
          sort: number
          start_time: string
        }
        Insert: {
          end_time: string
          id?: string
          name: string
          sort?: number
          start_time: string
        }
        Update: {
          end_time?: string
          id?: string
          name?: string
          sort?: number
          start_time?: string
        }
        Relationships: []
      }
      disciplinary_action_types: {
        Row: {
          description: string | null
          id: string
          name: string
          sort: number
          threshold_points: number
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
          sort?: number
          threshold_points: number
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
          sort?: number
          threshold_points?: number
        }
        Relationships: []
      }
      disciplinary_actions: {
        Row: {
          acknowledged_at: string | null
          id: string
          note: string | null
          status: string
          triggered_at: string
          type_id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          id?: string
          note?: string | null
          status?: string
          triggered_at?: string
          type_id: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          id?: string
          note?: string | null
          status?: string
          triggered_at?: string
          type_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disciplinary_actions_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "disciplinary_action_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_channels: {
        Row: {
          active: boolean
          id: string
          name: string
          purpose: string | null
          webhook_url: string
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          purpose?: string | null
          webhook_url: string
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          purpose?: string | null
          webhook_url?: string
        }
        Relationships: []
      }
      discord_event_routes: {
        Row: {
          channel_id: string | null
          enabled: boolean
          event_key: string
        }
        Insert: {
          channel_id?: string | null
          enabled?: boolean
          event_key: string
        }
        Update: {
          channel_id?: string | null
          enabled?: boolean
          event_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "discord_event_routes_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "discord_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_outbox: {
        Row: {
          attempts: number
          channel_id: string
          created_at: string
          id: string
          next_retry_at: string | null
          payload: Json
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          channel_id: string
          created_at?: string
          id?: string
          next_retry_at?: string | null
          payload: Json
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          channel_id?: string
          created_at?: string
          id?: string
          next_retry_at?: string | null
          payload?: Json
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "discord_outbox_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "discord_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          area: string | null
          category: string | null
          id: string
          installed_on: string | null
          model: string | null
          name: string
          notes: string | null
          photo_url: string | null
          serial: string | null
          service_vendor_id: string | null
          status: string
          warranty_expires_on: string | null
        }
        Insert: {
          area?: string | null
          category?: string | null
          id?: string
          installed_on?: string | null
          model?: string | null
          name: string
          notes?: string | null
          photo_url?: string | null
          serial?: string | null
          service_vendor_id?: string | null
          status?: string
          warranty_expires_on?: string | null
        }
        Update: {
          area?: string | null
          category?: string | null
          id?: string
          installed_on?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          photo_url?: string | null
          serial?: string | null
          service_vendor_id?: string | null
          status?: string
          warranty_expires_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_service_vendor_id_fkey"
            columns: ["service_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_downtime: {
        Row: {
          ended_at: string | null
          equipment_id: string
          id: string
          started_at: string
          work_order_id: string | null
        }
        Insert: {
          ended_at?: string | null
          equipment_id: string
          id?: string
          started_at: string
          work_order_id?: string | null
        }
        Update: {
          ended_at?: string | null
          equipment_id?: string
          id?: string
          started_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_downtime_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_downtime_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_files: {
        Row: {
          equipment_id: string
          file_url: string
          id: string
          label: string | null
        }
        Insert: {
          equipment_id: string
          file_url: string
          id?: string
          label?: string | null
        }
        Update: {
          equipment_id?: string
          file_url?: string
          id?: string
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_files_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          post_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_posts: {
        Row: {
          author_id: string | null
          body: string | null
          created_at: string
          id: string
          kind: string
          subject_user_id: string | null
          tokens_awarded: number | null
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          subject_user_id?: string | null
          tokens_awarded?: number | null
        }
        Update: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          subject_user_id?: string | null
          tokens_awarded?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feed_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_posts_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          assigned_to: string | null
          description: string
          due_at: string | null
          id: string
          resolved_at: string | null
          resolved_by: string | null
          source_answer_id: string | null
          status: string
        }
        Insert: {
          assigned_to?: string | null
          description: string
          due_at?: string | null
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_answer_id?: string | null
          status?: string
        }
        Update: {
          assigned_to?: string | null
          description?: string
          due_at?: string | null
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_answer_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_source_answer_id_fkey"
            columns: ["source_answer_id"]
            isOneToOne: false
            referencedRelation: "checklist_answers"
            referencedColumns: ["id"]
          },
        ]
      }
      food_items: {
        Row: {
          cold_max_f: number | null
          cold_min_f: number | null
          hot_max_f: number | null
          hot_min_f: number | null
          id: string
          name: string
        }
        Insert: {
          cold_max_f?: number | null
          cold_min_f?: number | null
          hot_max_f?: number | null
          hot_min_f?: number | null
          id?: string
          name: string
        }
        Update: {
          cold_max_f?: number | null
          cold_min_f?: number | null
          hot_max_f?: number | null
          hot_min_f?: number | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      graduation_audits: {
        Row: {
          due_on: string
          enrollment_id: string
          id: string
          notes: string | null
          recorded_at: string | null
          recorded_by: string | null
          result: string | null
        }
        Insert: {
          due_on: string
          enrollment_id: string
          id?: string
          notes?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          result?: string | null
        }
        Update: {
          due_on?: string
          enrollment_id?: string
          id?: string
          notes?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "graduation_audits_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "trainee_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_audits_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      infraction_types: {
        Row: {
          active: boolean
          description: string | null
          id: string
          name: string
          points: number
        }
        Insert: {
          active?: boolean
          description?: string | null
          id?: string
          name: string
          points?: number
        }
        Update: {
          active?: boolean
          description?: string | null
          id?: string
          name?: string
          points?: number
        }
        Relationships: []
      }
      infractions: {
        Row: {
          expires_at: string | null
          id: string
          issued_at: string
          issued_by: string | null
          note: string | null
          points: number
          type_id: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          note?: string | null
          points: number
          type_id: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          note?: string | null
          points?: number
          type_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "infractions_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "infractions_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "infraction_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "infractions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_cursors: {
        Row: {
          job_name: string
          last_event_at: string | null
          last_event_id: string | null
          updated_at: string
        }
        Insert: {
          job_name: string
          last_event_at?: string | null
          last_event_id?: string | null
          updated_at?: string
        }
        Update: {
          job_name?: string
          last_event_at?: string | null
          last_event_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      layout_tiles: {
        Row: {
          area_label: string | null
          h: number
          id: string
          layout_id: string
          position_id: string | null
          w: number
          x: number
          y: number
        }
        Insert: {
          area_label?: string | null
          h?: number
          id?: string
          layout_id: string
          position_id?: string | null
          w?: number
          x?: number
          y?: number
        }
        Update: {
          area_label?: string | null
          h?: number
          id?: string
          layout_id?: string
          position_id?: string | null
          w?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "layout_tiles_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "store_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_tiles_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_requests: {
        Row: {
          area: string | null
          declined_reason: string | null
          description: string | null
          equipment_id: string | null
          id: string
          photo_urls: string[] | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          submitted_by: string | null
          suggested_priority: string | null
          title: string
          work_order_id: string | null
        }
        Insert: {
          area?: string | null
          declined_reason?: string | null
          description?: string | null
          equipment_id?: string | null
          id?: string
          photo_urls?: string[] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          suggested_priority?: string | null
          title: string
          work_order_id?: string | null
        }
        Update: {
          area?: string | null
          declined_reason?: string | null
          description?: string | null
          equipment_id?: string | null
          id?: string
          photo_urls?: string[] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          suggested_priority?: string | null
          title?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_requests_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
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
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_roadmaps: {
        Row: {
          active: boolean
          id: string
          name: string
          side: string
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          side: string
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          side?: string
        }
        Relationships: []
      }
      org_slots: {
        Row: {
          id: string
          label: string | null
          sort: number
          tier_id: string
          user_id: string | null
        }
        Insert: {
          id?: string
          label?: string | null
          sort?: number
          tier_id: string
          user_id?: string | null
        }
        Update: {
          id?: string
          label?: string | null
          sort?: number
          tier_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_slots_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "org_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_slots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_tiers: {
        Row: {
          department: string
          goal_count: number
          id: string
          name: string
          sort: number
        }
        Insert: {
          department: string
          goal_count?: number
          id?: string
          name: string
          sort?: number
        }
        Update: {
          department?: string
          goal_count?: number
          id?: string
          name?: string
          sort?: number
        }
        Relationships: []
      }
      passport_enrollments: {
        Row: {
          id: string
          passport_id: string
          stamped_at: string | null
          stamped_by: string | null
          started_at: string
          track: string | null
          user_id: string
        }
        Insert: {
          id?: string
          passport_id: string
          stamped_at?: string | null
          stamped_by?: string | null
          started_at?: string
          track?: string | null
          user_id: string
        }
        Update: {
          id?: string
          passport_id?: string
          stamped_at?: string | null
          stamped_by?: string | null
          started_at?: string
          track?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "passport_enrollments_passport_id_fkey"
            columns: ["passport_id"]
            isOneToOne: false
            referencedRelation: "passports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passport_enrollments_stamped_by_fkey"
            columns: ["stamped_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passport_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      passport_item_progress: {
        Row: {
          completed_at: string | null
          enrollment_id: string
          id: string
          item_id: string
          photo_url: string | null
          signed_by: string | null
          value: Json | null
        }
        Insert: {
          completed_at?: string | null
          enrollment_id: string
          id?: string
          item_id: string
          photo_url?: string | null
          signed_by?: string | null
          value?: Json | null
        }
        Update: {
          completed_at?: string | null
          enrollment_id?: string
          id?: string
          item_id?: string
          photo_url?: string | null
          signed_by?: string | null
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "passport_item_progress_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "passport_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passport_item_progress_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "passport_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passport_item_progress_signed_by_fkey"
            columns: ["signed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      passport_items: {
        Row: {
          course_id: string | null
          id: string
          label: string
          passport_id: string
          sort: number
          type: string
        }
        Insert: {
          course_id?: string | null
          id?: string
          label: string
          passport_id: string
          sort?: number
          type: string
        }
        Update: {
          course_id?: string | null
          id?: string
          label?: string
          passport_id?: string
          sort?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "passport_items_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passport_items_passport_id_fkey"
            columns: ["passport_id"]
            isOneToOne: false
            referencedRelation: "passports"
            referencedColumns: ["id"]
          },
        ]
      }
      passports: {
        Row: {
          active: boolean
          id: string
          kind: string
          name: string
          org_tier_id: string | null
          position_id: string | null
          target_role_id: string | null
        }
        Insert: {
          active?: boolean
          id?: string
          kind: string
          name: string
          org_tier_id?: string | null
          position_id?: string | null
          target_role_id?: string | null
        }
        Update: {
          active?: boolean
          id?: string
          kind?: string
          name?: string
          org_tier_id?: string | null
          position_id?: string | null
          target_role_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "passports_org_tier_id_fkey"
            columns: ["org_tier_id"]
            isOneToOne: false
            referencedRelation: "org_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passports_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passports_target_role_id_fkey"
            columns: ["target_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_schedules: {
        Row: {
          active: boolean
          assign_user_id: string | null
          checklist_template_id: string | null
          description: string | null
          discord_channel_id: string | null
          equipment_id: string
          id: string
          interval_days: number
          lead_days: number
          next_due_on: string | null
          notify_discord: boolean
          priority: string | null
          title: string
          vendor_id: string | null
        }
        Insert: {
          active?: boolean
          assign_user_id?: string | null
          checklist_template_id?: string | null
          description?: string | null
          discord_channel_id?: string | null
          equipment_id: string
          id?: string
          interval_days: number
          lead_days?: number
          next_due_on?: string | null
          notify_discord?: boolean
          priority?: string | null
          title: string
          vendor_id?: string | null
        }
        Update: {
          active?: boolean
          assign_user_id?: string | null
          checklist_template_id?: string | null
          description?: string | null
          discord_channel_id?: string | null
          equipment_id?: string
          id?: string
          interval_days?: number
          lead_days?: number
          next_due_on?: string | null
          notify_discord?: boolean
          priority?: string | null
          title?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_schedules_assign_user_id_fkey"
            columns: ["assign_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_schedules_checklist_template_id_fkey"
            columns: ["checklist_template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_schedules_discord_channel_id_fkey"
            columns: ["discord_channel_id"]
            isOneToOne: false
            referencedRelation: "discord_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_schedules_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_schedules_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      position_groups: {
        Row: {
          id: string
          name: string
          sort: number
        }
        Insert: {
          id?: string
          name: string
          sort?: number
        }
        Update: {
          id?: string
          name?: string
          sort?: number
        }
        Relationships: []
      }
      position_ratings: {
        Row: {
          category_scores: Json | null
          comment: string | null
          id: string
          is_current: boolean
          position_id: string | null
          rated_at: string
          rated_by: string | null
          stars: number
          user_id: string | null
        }
        Insert: {
          category_scores?: Json | null
          comment?: string | null
          id?: string
          is_current?: boolean
          position_id?: string | null
          rated_at?: string
          rated_by?: string | null
          stars: number
          user_id?: string | null
        }
        Update: {
          category_scores?: Json | null
          comment?: string | null
          id?: string
          is_current?: boolean
          position_id?: string | null
          rated_at?: string
          rated_by?: string | null
          stars?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "position_ratings_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_ratings_rated_by_fkey"
            columns: ["rated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          group_id: string | null
          id: string
          name: string
          sort: number
        }
        Insert: {
          group_id?: string | null
          id?: string
          name: string
          sort?: number
        }
        Update: {
          group_id?: string | null
          id?: string
          name?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "positions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "position_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          birthdate: string | null
          created_at: string
          discord_user_id: string | null
          email: string
          hired_on: string | null
          id: string
          name: string
          phone: string | null
          role_id: string | null
          store_id: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          birthdate?: string | null
          created_at?: string
          discord_user_id?: string | null
          email: string
          hired_on?: string | null
          id: string
          name: string
          phone?: string | null
          role_id?: string | null
          store_id: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          birthdate?: string | null
          created_at?: string
          discord_user_id?: string | null
          email?: string
          hired_on?: string | null
          id?: string
          name?: string
          phone?: string | null
          role_id?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_rubrics: {
        Row: {
          category_1: string | null
          category_2: string | null
          category_3: string | null
          category_4: string | null
          id: string
          position_id: string | null
        }
        Insert: {
          category_1?: string | null
          category_2?: string | null
          category_3?: string | null
          category_4?: string | null
          id?: string
          position_id?: string | null
        }
        Update: {
          category_1?: string | null
          category_2?: string | null
          category_3?: string | null
          category_4?: string | null
          id?: string
          position_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rating_rubrics_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      rerate_prompts: {
        Row: {
          due_on: string
          id: string
          position_id: string | null
          resolved_at: string | null
          user_id: string | null
        }
        Insert: {
          due_on: string
          id?: string
          position_id?: string | null
          resolved_at?: string | null
          user_id?: string | null
        }
        Update: {
          due_on?: string
          id?: string
          position_id?: string | null
          resolved_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rerate_prompts_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rerate_prompts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_claims: {
        Row: {
          claimed_at: string
          cost: number
          delivered_at: string | null
          delivered_by: string | null
          fulfillment_task_id: string | null
          id: string
          reward_id: string
          status: string
          user_id: string
        }
        Insert: {
          claimed_at?: string
          cost: number
          delivered_at?: string | null
          delivered_by?: string | null
          fulfillment_task_id?: string | null
          id?: string
          reward_id: string
          status?: string
          user_id: string
        }
        Update: {
          claimed_at?: string
          cost?: number
          delivered_at?: string | null
          delivered_by?: string | null
          fulfillment_task_id?: string | null
          id?: string
          reward_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_claims_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_claims_fulfillment_task_id_fkey"
            columns: ["fulfillment_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_claims_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          active: boolean
          description: string | null
          id: string
          image_url: string | null
          name: string
          stock: number | null
          token_cost: number
        }
        Insert: {
          active?: boolean
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          stock?: number | null
          token_cost: number
        }
        Update: {
          active?: boolean
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          stock?: number | null
          token_cost?: number
        }
        Relationships: []
      }
      roadmap_stations: {
        Row: {
          id: string
          phase: string
          position_id: string | null
          roadmap_id: string
          sort: number
        }
        Insert: {
          id?: string
          phase: string
          position_id?: string | null
          roadmap_id: string
          sort?: number
        }
        Update: {
          id?: string
          phase?: string
          position_id?: string | null
          roadmap_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_stations_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_stations_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "onboarding_roadmaps"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_key: string
          role_id: string
        }
        Insert: {
          permission_key: string
          role_id: string
        }
        Update: {
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          name: string
          rank: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          rank?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          rank?: number | null
        }
        Relationships: []
      }
      setup_assignments: {
        Row: {
          arrival_time: string | null
          id: string
          position_id: string | null
          setup_id: string
          user_id: string | null
        }
        Insert: {
          arrival_time?: string | null
          id?: string
          position_id?: string | null
          setup_id: string
          user_id?: string | null
        }
        Update: {
          arrival_time?: string | null
          id?: string
          position_id?: string | null
          setup_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "setup_assignments_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setup_assignments_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "setups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setup_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      setup_template_positions: {
        Row: {
          position_id: string
          sort: number
          template_id: string
        }
        Insert: {
          position_id: string
          sort?: number
          template_id: string
        }
        Update: {
          position_id?: string
          sort?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "setup_template_positions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setup_template_positions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "setup_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      setup_templates: {
        Row: {
          day_part_id: string | null
          id: string
          name: string
        }
        Insert: {
          day_part_id?: string | null
          id?: string
          name: string
        }
        Update: {
          day_part_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "setup_templates_day_part_id_fkey"
            columns: ["day_part_id"]
            isOneToOne: false
            referencedRelation: "day_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      setups: {
        Row: {
          created_at: string
          date: string
          day_part_id: string | null
          id: string
          posted_at: string | null
          posted_by: string | null
          shift_leader_id: string | null
          template_id: string | null
        }
        Insert: {
          created_at?: string
          date: string
          day_part_id?: string | null
          id?: string
          posted_at?: string | null
          posted_by?: string | null
          shift_leader_id?: string | null
          template_id?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          day_part_id?: string | null
          id?: string
          posted_at?: string | null
          posted_by?: string | null
          shift_leader_id?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "setups_day_part_id_fkey"
            columns: ["day_part_id"]
            isOneToOne: false
            referencedRelation: "day_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setups_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setups_shift_leader_id_fkey"
            columns: ["shift_leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setups_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "setup_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          setup_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          setup_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          setup_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_notes_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "setups"
            referencedColumns: ["id"]
          },
        ]
      }
      station_progress: {
        Row: {
          enrollment_id: string
          id: string
          roadmap_station_id: string
          score: number | null
          scored_at: string | null
          scored_by: string | null
          status: string
        }
        Insert: {
          enrollment_id: string
          id?: string
          roadmap_station_id: string
          score?: number | null
          scored_at?: string | null
          scored_by?: string | null
          status?: string
        }
        Update: {
          enrollment_id?: string
          id?: string
          roadmap_station_id?: string
          score?: number | null
          scored_at?: string | null
          scored_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_progress_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "trainee_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_progress_roadmap_station_id_fkey"
            columns: ["roadmap_station_id"]
            isOneToOne: false
            referencedRelation: "roadmap_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_progress_scored_by_fkey"
            columns: ["scored_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      store_layouts: {
        Row: {
          active: boolean
          day_part_id: string | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          day_part_id?: string | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          day_part_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_layouts_day_part_id_fkey"
            columns: ["day_part_id"]
            isOneToOne: false
            referencedRelation: "day_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          id: string
          name: string
          timezone: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          timezone?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          timezone?: string
        }
        Relationships: []
      }
      task_templates: {
        Row: {
          active: boolean
          assign_position_id: string | null
          assign_user_id: string | null
          day_part_id: string | null
          days_of_week: number[] | null
          description: string | null
          discord_channel_id: string | null
          due_time: string | null
          frequency: string | null
          id: string
          notify_discord: boolean
          start_time: string | null
          title: string
          token_value: number
        }
        Insert: {
          active?: boolean
          assign_position_id?: string | null
          assign_user_id?: string | null
          day_part_id?: string | null
          days_of_week?: number[] | null
          description?: string | null
          discord_channel_id?: string | null
          due_time?: string | null
          frequency?: string | null
          id?: string
          notify_discord?: boolean
          start_time?: string | null
          title: string
          token_value?: number
        }
        Update: {
          active?: boolean
          assign_position_id?: string | null
          assign_user_id?: string | null
          day_part_id?: string | null
          days_of_week?: number[] | null
          description?: string | null
          discord_channel_id?: string | null
          due_time?: string | null
          frequency?: string | null
          id?: string
          notify_discord?: boolean
          start_time?: string | null
          title?: string
          token_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_assign_position_id_fkey"
            columns: ["assign_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_assign_user_id_fkey"
            columns: ["assign_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_day_part_id_fkey"
            columns: ["day_part_id"]
            isOneToOne: false
            referencedRelation: "day_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_discord_channel_id_fkey"
            columns: ["discord_channel_id"]
            isOneToOne: false
            referencedRelation: "discord_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_position_id: string | null
          assigned_user_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          date: string
          day_part_id: string | null
          description: string | null
          discord_channel_id: string | null
          due_at: string | null
          id: string
          kind: string
          notify_discord: boolean
          ref: Json | null
          setup_id: string | null
          start_time: string | null
          status: string
          template_id: string | null
          title: string
          token_value: number
        }
        Insert: {
          assigned_position_id?: string | null
          assigned_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          day_part_id?: string | null
          description?: string | null
          discord_channel_id?: string | null
          due_at?: string | null
          id?: string
          kind?: string
          notify_discord?: boolean
          ref?: Json | null
          setup_id?: string | null
          start_time?: string | null
          status?: string
          template_id?: string | null
          title: string
          token_value?: number
        }
        Update: {
          assigned_position_id?: string | null
          assigned_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          day_part_id?: string | null
          description?: string | null
          discord_channel_id?: string | null
          due_at?: string | null
          id?: string
          kind?: string
          notify_discord?: boolean
          ref?: Json | null
          setup_id?: string | null
          start_time?: string | null
          status?: string
          template_id?: string | null
          title?: string
          token_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_position_id_fkey"
            columns: ["assigned_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_day_part_id_fkey"
            columns: ["day_part_id"]
            isOneToOne: false
            referencedRelation: "day_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_discord_channel_id_fkey"
            columns: ["discord_channel_id"]
            isOneToOne: false
            referencedRelation: "discord_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "setups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          team_id: string
          user_id: string
        }
        Insert: {
          team_id: string
          user_id: string
        }
        Update: {
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      token_earning_rules: {
        Row: {
          amount: number
          event_key: string
        }
        Insert: {
          amount?: number
          event_key: string
        }
        Update: {
          amount?: number
          event_key?: string
        }
        Relationships: []
      }
      token_processed_events: {
        Row: {
          event_id: string
          processed_at: string
        }
        Insert: {
          event_id: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          processed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_processed_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "app_events"
            referencedColumns: ["id"]
          },
        ]
      }
      token_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: string
          kind: string
          note: string | null
          ref: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          kind: string
          note?: string | null
          ref?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          kind?: string
          note?: string | null
          ref?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trainee_enrollments: {
        Row: {
          graduated_on: string | null
          id: string
          roadmap_id: string
          started_on: string
          status: string
          user_id: string
        }
        Insert: {
          graduated_on?: string | null
          id?: string
          roadmap_id: string
          started_on?: string
          status?: string
          user_id: string
        }
        Update: {
          graduated_on?: string | null
          id?: string
          roadmap_id?: string
          started_on?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainee_enrollments_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "onboarding_roadmaps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainee_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_courses: {
        Row: {
          content: string | null
          description: string | null
          id: string
          name: string
          sort: number
          vendor_id: string | null
        }
        Insert: {
          content?: string | null
          description?: string | null
          id?: string
          name: string
          sort?: number
          vendor_id?: string | null
        }
        Update: {
          content?: string | null
          description?: string | null
          id?: string
          name?: string
          sort?: number
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_courses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      training_sessions: {
        Row: {
          date: string
          end_time: string | null
          enrollment_id: string
          id: string
          note: string | null
          position_id: string | null
          start_time: string | null
          tags: string[]
          trainer_user_id: string | null
        }
        Insert: {
          date: string
          end_time?: string | null
          enrollment_id: string
          id?: string
          note?: string | null
          position_id?: string | null
          start_time?: string | null
          tags?: string[]
          trainer_user_id?: string | null
        }
        Update: {
          date?: string
          end_time?: string | null
          enrollment_id?: string
          id?: string
          note?: string | null
          position_id?: string | null
          start_time?: string | null
          tags?: string[]
          trainer_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_sessions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "trainee_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_trainer_user_id_fkey"
            columns: ["trainer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          account_number: string | null
          active: boolean
          category: string | null
          delivery_days: string[] | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          rep_name: string | null
          website: string | null
        }
        Insert: {
          account_number?: string | null
          active?: boolean
          category?: string | null
          delivery_days?: string[] | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          rep_name?: string | null
          website?: string | null
        }
        Update: {
          account_number?: string | null
          active?: boolean
          category?: string | null
          delivery_days?: string[] | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          rep_name?: string | null
          website?: string | null
        }
        Relationships: []
      }
      waste_categories: {
        Row: {
          id: string
          name: string
          sort: number
        }
        Insert: {
          id?: string
          name: string
          sort?: number
        }
        Update: {
          id?: string
          name?: string
          sort?: number
        }
        Relationships: []
      }
      waste_entries: {
        Row: {
          day_part_id: string | null
          id: string
          item_id: string
          logged_at: string
          logged_by: string | null
          note: string | null
          quantity: number
        }
        Insert: {
          day_part_id?: string | null
          id?: string
          item_id: string
          logged_at?: string
          logged_by?: string | null
          note?: string | null
          quantity: number
        }
        Update: {
          day_part_id?: string | null
          id?: string
          item_id?: string
          logged_at?: string
          logged_by?: string | null
          note?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "waste_entries_day_part_id_fkey"
            columns: ["day_part_id"]
            isOneToOne: false
            referencedRelation: "day_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_entries_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "waste_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_entries_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_items: {
        Row: {
          category_id: string | null
          id: string
          name: string
          unit: string
          unit_cost: number | null
        }
        Insert: {
          category_id?: string | null
          id?: string
          name: string
          unit: string
          unit_cost?: number | null
        }
        Update: {
          category_id?: string | null
          id?: string
          name?: string
          unit?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "waste_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "waste_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_comments: {
        Row: {
          author_id: string | null
          body: string | null
          created_at: string
          id: string
          photo_url: string | null
          work_order_id: string
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          photo_url?: string | null
          work_order_id: string
        }
        Update: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          photo_url?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_comments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          assigned_user_id: string | null
          checklist_run_id: string | null
          completed_at: string | null
          completed_by: string | null
          cost: number | null
          created_at: string
          created_by: string | null
          description: string | null
          discord_channel_id: string | null
          due_at: string | null
          equipment_id: string | null
          id: string
          invoice_url: string | null
          notify_discord: boolean
          pm_schedule_id: string | null
          priority: string
          request_id: string | null
          scheduled_for: string | null
          status: string
          title: string
          vendor_id: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          checklist_run_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discord_channel_id?: string | null
          due_at?: string | null
          equipment_id?: string | null
          id?: string
          invoice_url?: string | null
          notify_discord?: boolean
          pm_schedule_id?: string | null
          priority?: string
          request_id?: string | null
          scheduled_for?: string | null
          status?: string
          title: string
          vendor_id?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          checklist_run_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discord_channel_id?: string | null
          due_at?: string | null
          equipment_id?: string | null
          id?: string
          invoice_url?: string | null
          notify_discord?: boolean
          pm_schedule_id?: string | null
          priority?: string
          request_id?: string | null
          scheduled_for?: string | null
          status?: string
          title?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_checklist_run_id_fkey"
            columns: ["checklist_run_id"]
            isOneToOne: false
            referencedRelation: "checklist_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_discord_channel_id_fkey"
            columns: ["discord_channel_id"]
            isOneToOne: false
            referencedRelation: "discord_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_pm_schedule_id_fkey"
            columns: ["pm_schedule_id"]
            isOneToOne: false
            referencedRelation: "pm_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      my_infractions: {
        Row: {
          expires_at: string | null
          id: string | null
          issued_at: string | null
          note: string | null
          points: number | null
          type_id: string | null
          type_name: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "infractions_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "infraction_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "infractions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      current_store_id: { Args: never; Returns: string }
      has_permission: { Args: { permission_key: string }; Returns: boolean }
      redeem_reward: {
        Args: { p_reward_id: string }
        Returns: {
          transaction_id: string
          claim_id: string
          balance_after: number
          cost: number
        }[]
      }
      cancel_reward_claim: {
        Args: { p_claim_id: string }
        Returns: { transaction_id: string; balance_after: number }[]
      }
      gift_tokens: {
        Args: { p_to_user_id: string; p_amount: number; p_note?: string | null }
        Returns: {
          debit_transaction_id: string
          credit_transaction_id: string
          balance_after: number
        }[]
      }
      setup_has_top_performer: {
        Args: { p_setup_id: string }
        Returns: boolean
      }
      adjust_tokens: {
        Args: { p_user_id: string; p_delta: number; p_note?: string | null }
        Returns: { transaction_id: string; balance_after: number }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
