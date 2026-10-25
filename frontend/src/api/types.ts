export type UserRole = "PLATFORM_ADMIN" | "TENANT_ADMIN" | "ANNOTATOR";
export type TaskStatus = "PUBLISHED" | "CLAIMED" | "SUBMITTED" | "ARCHIVED";
export type AssignmentStatus = "CLAIMED" | "SUBMITTED" | "RELEASED";

export interface Tenant {
  id: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  tenant: Tenant | null;
}

export interface Video {
  id: string;
  original_name: string;
  duration_ms: number;
  fps: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  size_bytes: number;
  poster_url: string | null;
  created_at: string;
}

export interface VideoBrief {
  id: string;
  duration_ms: number;
  fps: number | null;
  codec: string | null;
  poster_url: string | null;
}

export interface Segment {
  id?: string;
  start_ms: number;
  end_ms: number;
}

export interface UserBrief {
  id: string;
  display_name: string;
}

export interface Assignment {
  id: string;
  status: AssignmentStatus;
  annotator: UserBrief | null;
  claimed_at: string;
  submitted_at: string | null;
  total_duration_ms: number | null;
  version: number;
}

export interface Task {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_at: string;
  published_at: string;
}

export interface TaskSummary {
  id: string;
  tenant_id: string;
  tenant_name: string;
  title: string;
  status: TaskStatus;
  video: VideoBrief;
  annotator: UserBrief | null;
  submitted_at: string | null;
  total_duration_ms: number | null;
  created_at: string;
}

export interface TaskDetail {
  task: Task;
  tenant: Tenant;
  video: Video;
  assignment: Assignment | null;
  segments: Segment[];
}

export interface AvailableTask {
  id: string;
  title: string;
  description: string | null;
  video: VideoBrief;
  created_at: string;
}

export interface MineTask {
  task_id: string;
  assignment_id: string;
  title: string;
  status: AssignmentStatus;
  segment_count: number;
  total_duration_ms: number | null;
  video: VideoBrief;
}

export interface AnnotatorTasks {
  available: AvailableTask[];
  mine: MineTask[];
}

export interface ClaimOut {
  assignment: Assignment;
  task: Task;
  video: VideoBrief;
}

export interface AssignmentDetail {
  assignment: Assignment;
  task: Task;
  video: VideoBrief;
  segments: Segment[];
}

export interface DraftOut {
  version: number;
  segments: Segment[];
  total_duration_ms: number;
  updated_at: string;
}

export interface SubmitOut {
  assignment_id: string;
  submitted_at: string;
  total_duration_ms: number;
  task_status: TaskStatus;
}

export interface StatsDay {
  date: string;
  total_duration_ms: number;
  task_count: number;
  annotator_count: number;
}

export interface StatsOut {
  timezone: string;
  from: string;
  to: string;
  days: StatsDay[];
}

export interface Annotator {
  id: string;
  display_name: string;
  email: string;
}
