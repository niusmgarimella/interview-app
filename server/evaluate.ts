import crypto from 'crypto';
import * as db from './store';
import * as ai from './ai';
import type { EvaluationResult } from './types';

export const latestResult = (attemptId: string): EvaluationResult | undefined =>
  [...db.t.evaluation_results].reverse().find(r => r.attempt_id === attemptId);

export async function evaluateAttempt(attemptId: string): Promise<void> {
  const T = db.t;
  const a = T.attempts.find(x => x.id === attemptId);
  if (!a) return;
  if (a.status === 'SUBMITTED') a.status = 'EVALUATING';
  const res: EvaluationResult = { id: crypto.randomUUID(), attempt_id: attemptId, overall_score: 0, max_score: 0, skill_scores: {},
    question_results: [], feedback: '', evaluation_model: ai.modelId(), evaluation_version: '1.0', status: 'RUNNING', evaluated_at: null };
  T.evaluation_results.push(res);
  try {
    const qs = T.questions.filter(q => q.attempt_id === attemptId).sort((x, y) => x.sequence_number - y.sequence_number);
    for (const q of qs) {
      const priv = T.question_private.find(p => p.question_id === q.id);
      const ans = T.answers.find(x => x.attempt_id === attemptId && x.question_id === q.id);
      let points = 0, rationale = 'No answer submitted';
      if (ans && q.question_type === 'MCQ') {                       // deterministic
        const ok = ans.answer_payload === priv?.correct_option_id;
        points = ok ? q.points_possible : 0; rationale = ok ? 'Correct' : 'Incorrect';
      } else if (ans) {                                              // rubric via AI (code sandbox: see README)
        ({ points, rationale } = await ai.evaluateAnswer({ question: q, rubric: priv?.rubric ?? null, answer: ans.answer_payload }));
      }
      if (ans) ans.evaluation_status = 'EVALUATED';
      res.question_results.push({ question_id: q.id, skill_name: q.skill_name, points, max: q.points_possible, rationale });
      res.overall_score += points; res.max_score += q.points_possible;
      const s = (res.skill_scores[q.skill_name] ??= { level: q.proficiency, score: 0, max: 0 });
      s.score += points; s.max += q.points_possible;
    }
    res.feedback = Object.entries(res.skill_scores).map(([k, v]) => `${k} (${v.level}): ${v.score}/${v.max}`).join('\n');
    res.status = 'COMPLETED'; res.evaluated_at = new Date().toISOString();
    if (a.status === 'EVALUATING') a.status = 'EVALUATED';
  } catch (e) {
    console.error('Evaluation failed', e); res.status = 'FAILED';
    if (a.status === 'EVALUATING') a.status = 'EVALUATION_FAILED';
  }
  a.updated_at = new Date().toISOString();
  await db.save('evaluation_results', 'answers', 'attempts');
}
