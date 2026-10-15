export type Proficiency = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type QuestionType = 'MCQ' | 'CODING' | 'SHORT_TEXT';
export type AttemptStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'EVALUATING' | 'EVALUATED' | 'RELEASED'
  | 'TERMINATED' | 'EXPIRED' | 'EVALUATION_FAILED';

export interface Me { id: string; email: string; role: 'ADMIN' | 'CANDIDATE'; must_change_password: boolean }
export interface Profile { email: string; full_name: string; phone: string; pan_masked: string }
export interface AttemptSummary { id: string; status: AttemptStatus; title: string; released: boolean }
export interface QuestionStub { id: string; sequence_number: number; locked: boolean }
export interface AttemptState {
  id: string; status: AttemptStatus; deadline_at: string | null; warning_count: number; max_warnings: number; released: boolean;
  interview: { title: string; description: string; duration_minutes: number | null; allowed_skills: string[] };
  skills: { skill_name: string; proficiency: Proficiency }[];
  questions: QuestionStub[];
}
export interface CandidateQuestion {
  id: string; sequence_number: number; skill_name: string; proficiency: Proficiency; question_type: QuestionType;
  prompt: string; options: { id: string; text: string }[] | null; language: string | null; points_possible: number;
}
export interface QuestionPayload { question: CandidateQuestion; answer: { payload: string; locked: boolean } | null }
export interface MonitoringResponse { status: AttemptStatus; warning_count: number; action: string }
export interface ResultView { overall_score: number; max_score: number; feedback: string }

// admin
export interface CandidateRow { id: string; email: string; account_status: 'ACTIVE' | 'DISABLED' | 'INVITED'; full_name: string }
export interface InterviewRow { id: string; title: string; question_count: number; allowed_skills: string[] }
export interface AdminAttemptRow { id: string; status: AttemptStatus; warning_count: number; candidate: string; interview: string }
export interface CreatedCandidate { id: string; email: string; temporary_password: string | null }
export interface QuestionResult { question_id: string; points: number; max: number; rationale: string }
export interface AdminAttemptDetail {
  attempt: { id: string; status: AttemptStatus; warning_count: number; termination_reason: string | null; result_released_at: string | null };
  skills: { skill_name: string; proficiency: Proficiency }[];
  result: { status: string; overall_score: number; max_score: number; evaluation_model: string; question_results: QuestionResult[] } | null;
  questions: { id: string; sequence_number: number; skill_name: string; question_type: QuestionType; prompt: string;
    private?: { correct_option_id: string | null }; answer: { answer_payload: string } | null }[];
  events: { id: string; occurred_at: string; event_type: string; action_taken: string; warning_number: number | null }[];
}
