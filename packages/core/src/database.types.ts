// Hand-written so check constraints become literal unions; `supabase gen types` widens them to string.
export type Role = 'user' | 'manager' | 'store_manager' | 'agency_manager' | 'admin'

export type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: Role
  created_at: string
  updated_at: string
  reports_since: string | null
  reports_to: string | null
}

export type DailyStatus = {
  id: string
  user_id: string
  date: string
  // Sanitized on render, never trusted: anyone can write raw HTML here through the REST API.
  description: string
  // Generated column: description with tags stripped, used for keyword search.
  description_text: string
  hours_logged: number
  created_at: string
  updated_at: string
}

export type StatusInput = Pick<DailyStatus, 'date' | 'description' | 'hours_logged'>

// View over daily_statuses (security_invoker): one row per person who has submitted at least once.
export type UserStats = {
  user_id: string
  submissions: number
  last_date: string
  total_hours: number
  updates: number
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'

export type Task = {
  id: string
  title: string
  description: string | null
  due_date: string
  status: TaskStatus
  created_by: string
  created_at: string
  updated_at: string
}

export type TaskAssignment = {
  id: string
  task_id: string
  user_id: string
  assigned_at: string
  // Last "not started yet" push, set by remind_pending_tasks().
  reminded_at: string | null
  // This person's own progress; tasks.status is everyone's together (task_rollup()).
  status: TaskStatus
  updated_at: string
}

export type TaskMember = {
  task_id: string
  user_id: string
  full_name: string | null
  email: string | null
  status: TaskStatus
  updated_at: string
  editable: boolean
}

// Exactly one of status_id / task_id is set. author_* are stamped by a trigger from the caller's profile.
// One person's copy of a push (written by push_event()), read live by the desktop app.
export type AppNotification = {
  id: number
  user_id: string
  event: string
  kind: 'status' | 'task' | 'leave' | 'person'
  target_id: string
  vars: { name?: string; title?: string; text?: string; status?: TaskStatus }
  created_at: string
}

export type Comment = {
  id: string
  status_id: string | null
  task_id: string | null
  author_id: string
  author_name: string
  author_role: Role
  body: string
  created_at: string
}

// An office holiday: counts like Sunday (updates optional). Admin-managed.
export type Holiday = {
  day: string
  name: string
  created_by: string | null
  created_at: string
}

export type LeaveHalf = 'full' | 'first' | 'second'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'cancelled'
export type LeaveAccrual = 'yearly' | 'monthly' | 'none'

export type LeaveType = {
  id: string
  code: string
  name: string
  name_hi: string | null
  name_gu: string | null
  yearly_quota: number
  accrual: LeaveAccrual
  carry_forward_max: number
  allow_half_day: boolean
  allow_negative: boolean
  sandwich: boolean
  needs_balance: boolean
  active: boolean
  created_at: string
}

export type LeaveRequest = {
  id: string
  user_id: string
  type_id: string
  start_day: string
  end_day: string
  start_half: LeaveHalf
  end_half: LeaveHalf
  days: number
  reason: string
  status: LeaveStatus
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  created_at: string
}

// One line of a person's balance; the balance is the sum of `days`. Written only by the server.
export type LeaveLedgerEntry = {
  id: number
  user_id: string
  type_id: string
  days: number
  kind: 'credit' | 'debit' | 'reversal' | 'adjust' | 'lapse'
  period: string | null
  request_id: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

export type LeaveBalance = {
  user_id: string
  type_id: string
  balance: number
  pending: number
  available: number
  used: number
}

export type SignupStatus = 'waiting' | 'approved' | 'declined'
// Someone who created an account and is waiting for an admin; their profile only exists once approved.
export type SignupRequest = {
  user_id: string
  email: string
  full_name: string | null
  status: SignupStatus
  created_at: string
  decided_by: string | null
  decided_at: string | null
}

export type Database = {
  public: {
    Tables: {
      signup_requests: {
        Row: SignupRequest
        Insert: never
        Update: never
        Relationships: []
      }
      profiles: {
        Row: Profile
        Insert: never
        Update: Partial<Pick<Profile, 'full_name'>>
        Relationships: []
      }
      daily_statuses: {
        Row: DailyStatus
        Insert: StatusInput & Partial<Pick<DailyStatus, 'user_id'>>
        Update: Partial<StatusInput>
        Relationships: [
          {
            foreignKeyName: 'daily_statuses_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      tasks: {
        Row: Task
        Insert: Pick<Task, 'title' | 'due_date'> & Partial<Pick<Task, 'description' | 'status'>>
        // status is worked out from task_assignments and can't be written through the API.
        Update: Partial<Pick<Task, 'title' | 'description' | 'due_date'>>
        Relationships: [
          {
            foreignKeyName: 'tasks_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      task_assignments: {
        Row: TaskAssignment
        Insert: Pick<TaskAssignment, 'task_id' | 'user_id'> &
          Partial<Pick<TaskAssignment, 'status'>>
        Update: Pick<TaskAssignment, 'status'>
        Relationships: [
          {
            foreignKeyName: 'task_assignments_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_assignments_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      holidays: {
        Row: Holiday
        Insert: Pick<Holiday, 'day' | 'name'>
        Update: Partial<Pick<Holiday, 'day' | 'name'>>
        Relationships: []
      }
      leave_types: {
        Row: LeaveType
        Insert: Pick<LeaveType, 'code' | 'name'> & Partial<Omit<LeaveType, 'id' | 'created_at'>>
        Update: Partial<Omit<LeaveType, 'id' | 'code' | 'created_at'>>
        Relationships: []
      }
      leave_requests: {
        Row: LeaveRequest
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'leave_requests_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'leave_requests_decided_by_fkey'
            columns: ['decided_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      leave_ledger: {
        Row: LeaveLedgerEntry
        Insert: never
        Update: never
        Relationships: []
      }
      notifications: {
        Row: AppNotification
        Insert: never
        Update: never
        Relationships: []
      }
      comments: {
        Row: Comment
        Insert: Pick<Comment, 'body'> & Partial<Pick<Comment, 'status_id' | 'task_id'>>
        Update: never
        Relationships: [
          {
            foreignKeyName: 'comments_status_id_fkey'
            columns: ['status_id']
            isOneToOne: false
            referencedRelation: 'daily_statuses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'comments_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      daily_status_user_stats: { Row: UserStats; Relationships: [] }
      leave_balances: { Row: LeaveBalance; Relationships: [] }
    }
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
      request_access: { Args: Record<string, never>; Returns: SignupStatus }
      approve_signup: { Args: { p_user: string }; Returns: undefined }
      decline_signup: { Args: { p_user: string }; Returns: undefined }
      set_user_role: { Args: { p_user: string; p_role: Role }; Returns: undefined }
      set_user_manager: { Args: { p_user: string; p_manager: string | null }; Returns: undefined }
      staff_names: { Args: Record<string, never>; Returns: { id: string; full_name: string }[] }
      task_members: { Args: { p_tasks: string[] }; Returns: TaskMember[] }
      create_task: {
        Args: {
          p_title: string
          p_description: string | null
          p_due_date: string
          p_user_ids: string[]
        }
        Returns: Task
      }
      board_tasks: {
        Args: {
          p_view: string
          p_search: string
          p_person: string | null
          p_now: string
          p_day_start: string
          p_limit: number
          p_offset: number
        }
        Returns: Database['public']['Tables']['tasks']['Row'][]
      }
      board_task_counts: {
        Args: { p_search: string; p_person: string | null; p_now: string; p_day_start: string }
        Returns: {
          pending: number
          in_progress: number
          completed: number
          blocked: number
          overdue: number
          today: number
          week: number
        }[]
      }
      comment_counts: {
        Args: { p_kind: 'status' | 'task'; p_ids: string[] }
        Returns: { id: string; n: number }[]
      }
      register_push_token: {
        Args: {
          p_token: string
          p_platform: 'ios' | 'android'
          p_lang: 'en' | 'hi' | 'gu'
          p_replies?: boolean
        }
        Returns: undefined
      }
      unregister_push_token: { Args: { p_token: string }; Returns: undefined }
      claim_phone_session: { Args: Record<string, never>; Returns: undefined }
      leave_day_count: {
        Args: {
          p_start: string
          p_end: string
          p_start_half: LeaveHalf
          p_end_half: LeaveHalf
          p_sandwich: boolean
        }
        Returns: number
      }
      apply_leave: {
        Args: {
          p_type: string
          p_start: string
          p_end: string
          p_start_half: LeaveHalf
          p_end_half: LeaveHalf
          p_reason: string
        }
        Returns: LeaveRequest
      }
      decide_leave: {
        Args: { p_id: string; p_approve: boolean; p_note?: string | null }
        Returns: LeaveRequest
      }
      cancel_leave: { Args: { p_id: string; p_note?: string | null }; Returns: LeaveRequest }
      adjust_leave_balance: {
        Args: { p_user: string; p_type: string; p_days: number; p_note: string }
        Returns: LeaveLedgerEntry
      }
    }
    Enums: { task_status: TaskStatus }
  }
}
