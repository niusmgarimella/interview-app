import 'express-session';

export type Role = 'ADMIN' | 'CANDIDATE';
export type AccountStatus = 'ACTIVE' | 'DISABLED' | 'INVITED';
export type Proficiency = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type QuestionType = 'MCQ' | 'CODING' | 'SHORT_TEXT';
export type AttemptStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'EVALUATING' | 'EVALUATED' | 'RELEASED'
  | 'TERMINATED' | 'EXPIRED' | 'EVALUATION_FAILED';

export interface User {
  id: string; email: string; password_hash: string; role: Role; account_status: AccountStatus;
  must_change_password: boolean; created_at: string; updated_at: string; last_login_at: string | null;
}
export interface CandidateProfile {
  user_id: string; full_name: string; phone: string; pan_ciphertext: string | null; pan_last4: string | null;
  created_at: string; updated_at: string;
}
export interface Interview {
  id: string; title: string; description: string; duration_minutes: number | null; question_count: number;
  allowed_skills: string[]; status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'; created_by: string; created_at: string; updated_at: string;
}
export interface Attempt {
  id: string; interview_id: string; candidate_user_id: string; status: AttemptStatus;
  started_at: string | null; submitted_at: string | null; deadline_at: string | null; completed_at: string | null;
  warning_count: number; termination_reason: string | null; result_released_at: string | null;
  created_at: string; updated_at: string;
}
export interface AttemptSkill { id: string; attempt_id: string; skill_name: string; proficiency: Proficiency; created_at: string }
export interface McqOption { id: string; text: string }
export interface RubricItem { criterion: string; points: number }
export interface Question {
  id: string; attempt_id: string; sequence_number: number; skill_name: string; proficiency: Proficiency;
  question_type: QuestionType; prompt: string; options: McqOption[] | null; language: string | null;
  points_possible: number; generation_model: string; prompt_version: string; created_at: string;
}
export interface QuestionPrivate {
  question_id: string; correct_option_id: string | null; rubric: RubricItem[] | null; hidden_test_case_refs: string[];
  reference_solution: string | null; evaluation_config: Record<string, unknown>;
}
export interface Answer {
  id: string; attempt_id: string; question_id: string; answer_type: 'MCQ' | 'CODE' | 'TEXT'; answer_payload: string;
  locked: boolean; locked_at: string | null; request_id: string | null; answer_hash: string | null;
  evaluation_status: 'PENDING' | 'EVALUATED' | 'ERROR' | 'NOT_APPLICABLE'; created_at: string; updated_at: string;
}
export interface QuestionResult { question_id: string; skill_name: string; points: number; max: number; rationale: string }
export interface EvaluationResult {
  id: string; attempt_id: string; overall_score: number; max_score: number;
  skill_scores: Record<string, { level: Proficiency; score: number; max: number }>;
  question_results: QuestionResult[]; feedback: string; evaluation_model: string; evaluation_version: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'; evaluated_at: string | null;
}
export interface MonitoringEvent {
  id: string; attempt_id: string; event_type: 'VISIBILITY_LOST' | 'WINDOW_BLUR' | 'VISIBILITY_RESTORED' | 'TERMINATED';
  occurred_at: string; warning_number: number | null;
  action_taken: 'LOGGED' | 'WARNED' | 'TERMINATED' | 'IGNORED_DUPLICATE'; metadata: { episode_id: string | null };
}
export interface AuditLog {
  id: string; actor_user_id: string | null; action: string; target_type: string; target_id: string;
  occurred_at: string; details: Record<string, unknown>;
}

export interface Tables {
  users: User[]; candidate_profiles: CandidateProfile[]; interviews: Interview[]; attempts: Attempt[];
  attempt_skills: AttemptSkill[]; questions: Question[]; question_private: QuestionPrivate[]; answers: Answer[];
  evaluation_results: EvaluationResult[]; monitoring_events: MonitoringEvent[]; audit_logs: AuditLog[];
}
export type TableName = keyof Tables;

export interface GeneratedQuestion {
  question_type: QuestionType; prompt: string; options?: McqOption[]; language?: string; points_possible: number;
  private_metadata?: { correct_option_id?: string; rubric?: RubricItem[]; hidden_test_case_refs?: string[] };
}

declare module 'express-session' { interface SessionData { uid?: string } }
declare global { namespace Express { interface Request { user: User } } }
