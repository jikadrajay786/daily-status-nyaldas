// Hand-written so check constraints become literal unions; `supabase gen types` widens them to string.
export type Role = 'user' | 'admin'

export type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: Role
  created_at: string
  updated_at: string
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
}

export type Database = {
  public: {
    Tables: {
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
        // Non-admins may only change status (enforced by the tasks_guard_update trigger).
        Update: Partial<Pick<Task, 'title' | 'description' | 'due_date' | 'status'>>
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
        Insert: Pick<TaskAssignment, 'task_id' | 'user_id'>
        Update: never
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
    }
    Views: { daily_status_user_stats: { Row: UserStats; Relationships: [] } }
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
      create_task: {
        Args: {
          p_title: string
          p_description: string | null
          p_due_date: string
          p_user_ids: string[]
        }
        Returns: Task
      }
    }
    Enums: { task_status: TaskStatus }
  }
}
