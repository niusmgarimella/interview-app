import 'dotenv/config';
import express, { Request, Response, RequestHandler, ErrorRequestHandler } from 'express';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as db from './store';
import * as ai from './ai';
import { evaluateAttempt, latestResult } from './evaluate';
import type { Answer, Attempt, AttemptSkill, GeneratedQuestion, MonitoringEvent, Proficiency, Question, QuestionType, User } from './types';

const T = db.t;
const id = (): string => crypto.randomUUID();
const now = (): string => new Date().toISOString();
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const E = (status: number, message: string): HttpError => new HttpError(status, message);
const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };
const LEVELS: Proficiency[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const MAX_WARNINGS = 3;
const ANSWER_TYPE: Record<QuestionType, Answer['answer_type']> = { MCQ: 'MCQ', CODING: 'CODE', SHORT_TEXT: 'TEXT' };

// ---------- PAN encryption (AES-256-GCM). PAN never goes to AI, logs or API responses. ----------
const PAN_KEY = Buffer.from(process.env.PAN_KEY || '0'.repeat(64), 'hex');
if (!process.env.PAN_KEY) console.warn('WARNING: PAN_KEY not set; using insecure dev key.');
function encrypt(text: string): string {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', PAN_KEY, iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}

// ---------- helpers ----------
async function audit(req: Request, action: string, target_type: string, target_id: string, details: Record<string, unknown> = {}): Promise<void> {
  T.audit_logs.push({ id: id(), actor_user_id: req.session?.uid ?? null, action, target_type, target_id, occurred_at: now(), details });
  await db.save('audit_logs');
}
async function closeAttempt(a: Attempt, status: Attempt['status'], reason: string | null): Promise<void> {
  a.status = status; a.termination_reason = reason; a.completed_at = now(); a.updated_at = now();
  await db.save('attempts');
  setImmediate(() => { evaluateAttempt(a.id).catch(console.error); }); // queue evaluation of locked answers
}
async function tick(a: Attempt): Promise<void> { // server-side deadline enforcement
  if (a.status === 'IN_PROGRESS' && a.deadline_at && Date.now() > Date.parse(a.deadline_at)) await closeAttempt(a, 'EXPIRED', 'TIMER_EXPIRED');
}
const questionsOf = (aid: string): Question[] => T.questions.filter(q => q.attempt_id === aid).sort((x, y) => x.sequence_number - y.sequence_number);
const answerOf = (aid: string, qid: string): Answer | undefined => T.answers.find(x => x.attempt_id === aid && x.question_id === qid);
const nextUnlocked = (aid: string): Question | undefined => questionsOf(aid).find(q => !answerOf(aid, q.id));
const publicUser = (u: User) => ({ id: u.id, email: u.email, role: u.role, must_change_password: !!u.must_change_password });

async function ownAttempt(req: Request): Promise<Attempt> {
  const a = T.attempts.find(x => x.id === req.params.id);
  if (!a || (req.user.role !== 'ADMIN' && a.candidate_user_id !== req.user.id)) throw E(404, 'Not found');
  await tick(a);
  return a;
}

// ---------- app ----------
const app = express();
app.use(express.json({ limit: '200kb' }));
app.use(session({ secret: process.env.SESSION_SECRET || 'dev-secret-change-me', resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 3600e3 } }));
// Serve the built React app (client/dist) when it exists
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) app.use(express.static(dist));

const requireAuth: RequestHandler = (req, res, next) => {
  const u = T.users.find(x => x.id === req.session.uid);
  if (!u || u.account_status === 'DISABLED') { res.status(401).json({ error: 'Not signed in' }); return; }
  req.user = u; next();
};
const requireRole = (role: User['role']): RequestHandler => (req, res, next) => {
  if (req.user.role === role) next(); else res.status(403).json({ error: 'Forbidden' });
};
const admin: RequestHandler[] = [requireAuth, requireRole('ADMIN')];
const cand: RequestHandler[] = [requireAuth, requireRole('CANDIDATE')];

// ---------- auth ----------
app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60e3, max: 10, standardHeaders: true }), h(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = T.users.find(x => x.email === email);
  const ok = !!u && u.account_status !== 'DISABLED' && await bcrypt.compare(String(req.body.password || ''), u.password_hash);
  if (!u || !ok) throw E(401, 'Invalid email or password'); // generic error
  await new Promise<void>((resolve, reject) => req.session.regenerate(e => e ? reject(e) : resolve()));
  req.session.uid = u.id; u.last_login_at = now(); await db.save('users');
  res.json(publicUser(u));
}));
app.post('/api/auth/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });
app.get('/api/auth/me', requireAuth, (req, res) => { res.json(publicUser(req.user)); });
app.post('/api/auth/change-password', requireAuth, h(async (req, res) => {
  const { current, next } = req.body as { current?: string; next?: string };
  if (!(await bcrypt.compare(String(current || ''), req.user.password_hash))) throw E(400, 'Current password is incorrect');
  if (String(next || '').length < 10) throw E(400, 'New password must be at least 10 characters');
  Object.assign(req.user, { password_hash: await bcrypt.hash(String(next), 12), must_change_password: false, account_status: 'ACTIVE', updated_at: now() });
  await db.save('users'); res.json({ ok: true });
}));

// ---------- candidate ----------
app.get('/api/candidate/me', ...cand, (req, res) => {
  const p = T.candidate_profiles.find(x => x.user_id === req.user.id);
  res.json({ email: req.user.email, full_name: p?.full_name || '', phone: p?.phone || '', pan_masked: p?.pan_last4 ? '••••••' + p.pan_last4 : '' });
});
app.put('/api/candidate/me', ...cand, h(async (req, res) => {
  const p = T.candidate_profiles.find(x => x.user_id === req.user.id);
  if (!p) throw E(404, 'Profile not found');
  const { full_name, phone, pan } = req.body as { full_name?: string; phone?: string; pan?: string };
  if (!String(full_name || '').trim()) throw E(400, 'Name is required');
  p.full_name = String(full_name).trim().slice(0, 120); p.phone = String(phone || '').slice(0, 20);
  if (pan) {
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(pan)) throw E(400, 'Invalid PAN format');
    p.pan_ciphertext = encrypt(pan.toUpperCase()); p.pan_last4 = pan.slice(-4).toUpperCase();
  }
  p.updated_at = now(); await db.save('candidate_profiles'); res.json({ ok: true });
}));
app.get('/api/candidate/attempts', ...cand, (req, res) => {
  res.json(T.attempts.filter(a => a.candidate_user_id === req.user.id).map(a => ({ id: a.id, status: a.status,
    title: T.interviews.find(i => i.id === a.interview_id)?.title, released: !!a.result_released_at })));
});

app.get('/api/attempts/:id', requireAuth, h(async (req, res) => {
  const a = await ownAttempt(req);
  const iv = T.interviews.find(i => i.id === a.interview_id);
  if (!iv) throw E(500, 'Interview missing');
  res.json({ id: a.id, status: a.status, deadline_at: a.deadline_at, warning_count: a.warning_count, max_warnings: MAX_WARNINGS,
    released: !!a.result_released_at,
    interview: { title: iv.title, description: iv.description, duration_minutes: iv.duration_minutes, allowed_skills: iv.allowed_skills },
    skills: T.attempt_skills.filter(s => s.attempt_id === a.id).map(s => ({ skill_name: s.skill_name, proficiency: s.proficiency })),
    questions: questionsOf(a.id).map(q => ({ id: q.id, sequence_number: q.sequence_number, locked: !!answerOf(a.id, q.id) })) });
}));

app.put('/api/attempts/:id/skills', ...cand, h(async (req, res) => {
  const a = await ownAttempt(req);
  if (a.status !== 'NOT_STARTED') throw E(409, 'Skills can only be changed before start');
  const iv = T.interviews.find(i => i.id === a.interview_id);
  const sel = req.body.skills as { skill_name: string; proficiency: Proficiency }[] | undefined;
  if (!iv || !Array.isArray(sel) || !sel.length) throw E(400, 'Select at least one skill');
  const seen = new Set<string>();
  for (const s of sel) {
    if (!iv.allowed_skills.includes(s.skill_name) || !LEVELS.includes(s.proficiency) || seen.has(s.skill_name)) throw E(400, 'Invalid skill selection');
    seen.add(s.skill_name);
  }
  T.attempt_skills = T.attempt_skills.filter(s => s.attempt_id !== a.id);
  sel.forEach(s => T.attempt_skills.push({ id: id(), attempt_id: a.id, skill_name: s.skill_name, proficiency: s.proficiency, created_at: now() }));
  await db.save('attempt_skills'); res.json({ ok: true });
}));

const starting = new Set<string>();
app.post('/api/attempts/:id/start', ...cand, h(async (req, res) => {
  const a = await ownAttempt(req);
  if (a.status !== 'NOT_STARTED' || starting.has(a.id)) throw E(409, 'Attempt already started');
  const skills = T.attempt_skills.filter(s => s.attempt_id === a.id);
  if (!skills.length) throw E(400, 'Select skills first');
  const iv = T.interviews.find(i => i.id === a.interview_id);
  if (!iv) throw E(500, 'Interview missing');
  starting.add(a.id);
  try {
    const base = Math.floor(iv.question_count / skills.length), extra = iv.question_count % skills.length;
    const gen: (GeneratedQuestion & { s: AttemptSkill })[] = [];
    for (const [i, s] of skills.entries()) {
      const count = base + (i < extra ? 1 : 0);
      if (count) (await ai.generateQuestions({ skill: s.skill_name, level: s.proficiency, count })).forEach(q => gen.push({ ...q, s }));
    }
    // persist questions + private metadata BEFORE anything is shown
    gen.forEach((g, i) => {
      const qid = id(), m = g.private_metadata || {};
      T.questions.push({ id: qid, attempt_id: a.id, sequence_number: i + 1, skill_name: g.s.skill_name, proficiency: g.s.proficiency,
        question_type: g.question_type, prompt: g.prompt, options: g.question_type === 'MCQ' ? g.options ?? [] : null,
        language: g.question_type === 'CODING' ? g.language || 'javascript' : null, points_possible: g.points_possible,
        generation_model: ai.modelId(), prompt_version: '1.0', created_at: now() });
      T.question_private.push({ question_id: qid, correct_option_id: m.correct_option_id || null, rubric: m.rubric || null,
        hidden_test_case_refs: m.hidden_test_case_refs || [], reference_solution: null, evaluation_config: {} });
    });
    a.status = 'IN_PROGRESS'; a.started_at = now(); a.updated_at = now();
    a.deadline_at = iv.duration_minutes ? new Date(Date.now() + iv.duration_minutes * 60e3).toISOString() : null;
    await db.save('questions', 'question_private', 'attempts');
    res.json({ ok: true });
  } catch (e) { console.error(e); throw E(502, 'Could not generate questions. Please try again.'); }
  finally { starting.delete(a.id); }
}));

app.get('/api/attempts/:id/questions/:qid', ...cand, h(async (req, res) => {
  const a = await ownAttempt(req);
  if (a.status !== 'IN_PROGRESS') throw E(409, 'Attempt is not in progress');
  const q = T.questions.find(x => x.id === req.params.qid && x.attempt_id === a.id);
  if (!q) throw E(404, 'Not found');
  const nxt = nextUnlocked(a.id);
  if (nxt && q.sequence_number > nxt.sequence_number) throw E(403, 'Question not available yet'); // no future questions
  const ans = answerOf(a.id, q.id);
  res.json({ // explicit allow-list: private fields can never leak
    question: { id: q.id, sequence_number: q.sequence_number, skill_name: q.skill_name, proficiency: q.proficiency,
      question_type: q.question_type, prompt: q.prompt, options: q.options, language: q.language, points_possible: q.points_possible },
    answer: ans ? { payload: ans.answer_payload, locked: true } : null });
}));

app.post('/api/attempts/:id/answers/:qid/lock', ...cand, h(async (req, res) => {
  const a = await ownAttempt(req);
  if (a.status !== 'IN_PROGRESS') throw E(409, 'Attempt is not in progress');
  const q = T.questions.find(x => x.id === req.params.qid && x.attempt_id === a.id);
  if (!q) throw E(404, 'Not found');
  const requestId = typeof req.body.request_id === 'string' ? req.body.request_id : null;
  const existing = answerOf(a.id, q.id);
  if (existing) { if (requestId && existing.request_id === requestId) { res.json({ locked: true }); return; } throw E(409, 'Answer already locked'); }
  if (nextUnlocked(a.id)?.id !== q.id) throw E(409, 'Questions must be answered in order');
  const p: unknown = req.body.payload;
  const valid = typeof p === 'string' && (q.question_type === 'MCQ' ? !!q.options?.some(o => o.id === p) : p.length <= 20000);
  if (typeof p !== 'string' || !valid) throw E(400, 'Invalid answer');
  const row: Answer = { id: id(), attempt_id: a.id, question_id: q.id, answer_type: ANSWER_TYPE[q.question_type], answer_payload: p,
    locked: true, locked_at: now(), request_id: requestId, answer_hash: crypto.createHash('sha256').update(p).digest('hex'),
    evaluation_status: 'PENDING', created_at: now(), updated_at: now() };
  T.answers.push(row);                                   // synchronous check+insert => no double-lock race
  try { await db.save('answers'); } catch { T.answers.splice(T.answers.indexOf(row), 1); throw E(500, 'Could not save answer'); }
  res.json({ locked: true });                            // success only after durable write
}));

app.post('/api/attempts/:id/monitoring-events', ...cand, h(async (req, res) => {
  const a = await ownAttempt(req);
  const event_type = req.body.event_type as MonitoringEvent['event_type'];
  const episode_id: string | null = typeof req.body.episode_id === 'string' ? req.body.episode_id : null;
  if (!['VISIBILITY_LOST', 'WINDOW_BLUR', 'VISIBILITY_RESTORED'].includes(event_type)) throw E(400, 'Bad event');
  if (a.status !== 'IN_PROGRESS') { res.json({ status: a.status, warning_count: a.warning_count, action: 'IGNORED' }); return; }
  let action: MonitoringEvent['action_taken'] = 'LOGGED', warning: number | null = null;
  if (event_type !== 'VISIBILITY_RESTORED') {
    const dup = !!episode_id && T.monitoring_events.some(e => e.attempt_id === a.id && e.metadata.episode_id === episode_id
      && (e.action_taken === 'WARNED' || e.action_taken === 'TERMINATED'));
    if (dup) action = 'IGNORED_DUPLICATE';
    else { a.warning_count++; warning = a.warning_count; action = warning >= MAX_WARNINGS ? 'TERMINATED' : 'WARNED'; }
  }
  T.monitoring_events.push({ id: id(), attempt_id: a.id, event_type, occurred_at: now(), warning_number: warning, action_taken: action, metadata: { episode_id } });
  await db.save('monitoring_events', 'attempts');
  if (action === 'TERMINATED') await closeAttempt(a, 'TERMINATED', 'WINDOW_VIOLATION_LIMIT'); // locked answers preserved
  res.json({ status: a.status, warning_count: a.warning_count, action });
}));

app.post('/api/attempts/:id/submit', ...cand, h(async (req, res) => {
  const a = await ownAttempt(req);
  if (a.status !== 'IN_PROGRESS') throw E(409, 'Attempt is not in progress');
  a.submitted_at = now(); await closeAttempt(a, 'SUBMITTED', null);
  res.json({ status: a.status });
}));

app.get('/api/attempts/:id/result', ...cand, h(async (req, res) => {
  const a = await ownAttempt(req);
  const r = latestResult(a.id);
  if (!a.result_released_at || !r) throw E(403, 'Result not released yet');
  res.json({ overall_score: r.overall_score, max_score: r.max_score, feedback: r.feedback });
}));

// ---------- admin ----------
app.post('/api/admin/candidates', ...admin, h(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(), name = String(req.body.full_name || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) throw E(400, 'Valid name and email required');
  if (T.users.some(u => u.email === email)) throw E(409, 'Email already exists');
  const custom = String(req.body.password || '');           // optional: admin chooses the password (handy for local testing)
  if (custom && custom.length < 8) throw E(400, 'Password must be at least 8 characters');
  const temp = custom || crypto.randomBytes(9).toString('base64url'), uid = id();
  T.users.push({ id: uid, email, password_hash: await bcrypt.hash(temp, 12), role: 'CANDIDATE', account_status: custom ? 'ACTIVE' : 'INVITED',
    must_change_password: !custom, created_at: now(), updated_at: now(), last_login_at: null });
  T.candidate_profiles.push({ user_id: uid, full_name: name, phone: String(req.body.phone || ''), pan_ciphertext: null, pan_last4: null, created_at: now(), updated_at: now() });
  await db.save('users', 'candidate_profiles'); await audit(req, 'CANDIDATE_CREATED', 'user', uid);
  res.json({ id: uid, email, temporary_password: custom ? null : temp }); // generated one is shown once; only the hash is stored
}));
app.get('/api/admin/candidates', ...admin, (_req, res) => {
  res.json(T.users.filter(u => u.role === 'CANDIDATE').map(u => ({
    id: u.id, email: u.email, account_status: u.account_status, full_name: T.candidate_profiles.find(p => p.user_id === u.id)?.full_name })));
});
app.post('/api/admin/candidates/:id/status', ...admin, h(async (req, res) => {
  const u = T.users.find(x => x.id === req.params.id && x.role === 'CANDIDATE');
  const status = req.body.status as 'ACTIVE' | 'DISABLED';
  if (!u || !['ACTIVE', 'DISABLED'].includes(status)) throw E(400, 'Bad request');
  u.account_status = status; u.updated_at = now(); await db.save('users');
  await audit(req, 'ACCOUNT_' + status, 'user', u.id); res.json({ ok: true });
}));
app.post('/api/admin/candidates/:id/reset-password', ...admin, h(async (req, res) => {
  const u = T.users.find(x => x.id === req.params.id && x.role === 'CANDIDATE');
  if (!u) throw E(404, 'Not found');
  const custom = String(req.body.password || '');
  if (custom && custom.length < 8) throw E(400, 'Password must be at least 8 characters');
  const pw = custom || crypto.randomBytes(9).toString('base64url');
  Object.assign(u, { password_hash: await bcrypt.hash(pw, 12), must_change_password: !custom, updated_at: now() });
  await db.save('users'); await audit(req, 'PASSWORD_RESET', 'user', u.id);
  res.json({ email: u.email, temporary_password: custom ? null : pw });
}));
app.post('/api/admin/interviews', ...admin, h(async (req, res) => {
  const b = req.body as { title?: string; description?: string; allowed_skills?: unknown; question_count?: number; duration_minutes?: number | string | null };
  const skills = Array.isArray(b.allowed_skills) ? b.allowed_skills.map(s => String(s).trim()).filter(Boolean) : [];
  const qc = Number(b.question_count);
  if (!b.title || !skills.length || !(qc >= 1 && qc <= 50)) throw E(400, 'Title, skills and question count (1-50) required');
  const iv = { id: id(), title: String(b.title), description: String(b.description || ''), duration_minutes: b.duration_minutes ? Number(b.duration_minutes) : null,
    question_count: qc, allowed_skills: skills, status: 'ACTIVE' as const, created_by: req.user.id, created_at: now(), updated_at: now() };
  T.interviews.push(iv); await db.save('interviews'); await audit(req, 'INTERVIEW_CREATED', 'interview', iv.id); res.json(iv);
}));
app.get('/api/admin/interviews', ...admin, (_req, res) => { res.json(T.interviews); });
app.post('/api/admin/attempts', ...admin, h(async (req, res) => {
  const iv = T.interviews.find(i => i.id === req.body.interview_id && i.status === 'ACTIVE');
  const u = T.users.find(x => x.id === req.body.candidate_user_id && x.role === 'CANDIDATE');
  if (!iv || !u) throw E(400, 'Invalid interview or candidate');
  const a: Attempt = { id: id(), interview_id: iv.id, candidate_user_id: u.id, status: 'NOT_STARTED', started_at: null, submitted_at: null, deadline_at: null,
    completed_at: null, warning_count: 0, termination_reason: null, result_released_at: null, created_at: now(), updated_at: now() };
  T.attempts.push(a); await db.save('attempts'); await audit(req, 'ATTEMPT_ASSIGNED', 'attempt', a.id); res.json({ id: a.id });
}));
app.get('/api/admin/attempts', ...admin, (_req, res) => {
  res.json(T.attempts.map(a => ({ id: a.id, status: a.status, warning_count: a.warning_count,
    candidate: T.candidate_profiles.find(p => p.user_id === a.candidate_user_id)?.full_name, interview: T.interviews.find(i => i.id === a.interview_id)?.title })));
});
app.get('/api/admin/attempts/:id', ...admin, h(async (req, res) => {
  const a = await ownAttempt(req);
  res.json({ attempt: a, skills: T.attempt_skills.filter(s => s.attempt_id === a.id), result: latestResult(a.id) ?? null,
    questions: questionsOf(a.id).map(q => ({ ...q, private: T.question_private.find(p => p.question_id === q.id), answer: answerOf(a.id, q.id) ?? null })),
    events: T.monitoring_events.filter(e => e.attempt_id === a.id) });
}));
app.post('/api/admin/attempts/:id/release', ...admin, h(async (req, res) => {
  const a = await ownAttempt(req), r = latestResult(a.id);
  if (!r || r.status !== 'COMPLETED') throw E(409, 'Evaluation not completed');
  a.result_released_at = now(); if (a.status === 'EVALUATED') a.status = 'RELEASED';
  await db.save('attempts'); await audit(req, 'RESULT_RELEASED', 'attempt', a.id); res.json({ ok: true });
}));
app.post('/api/admin/attempts/:id/re-evaluate', ...admin, h(async (req, res) => {
  const a = await ownAttempt(req);
  if (!['SUBMITTED', 'EVALUATED', 'EVALUATION_FAILED', 'EXPIRED', 'TERMINATED'].includes(a.status)) throw E(409, 'Cannot re-evaluate now');
  if (a.status === 'EVALUATED' || a.status === 'EVALUATION_FAILED') a.status = 'SUBMITTED';
  await audit(req, 'RE_EVALUATION_REQUESTED', 'attempt', a.id);
  evaluateAttempt(a.id).catch(console.error); res.json({ ok: true });
}));

// ---------- errors & boot ----------
app.use('/api', (_req, res) => { res.status(404).json({ error: 'Not found' }); });
const onError: ErrorRequestHandler = (err: Error & { status?: number }, _req, res, _next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error' });
};
app.use(onError);

(async () => {
  await db.init();
  if (!T.users.some(u => u.role === 'ADMIN')) {
    const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
    T.users.push({ id: id(), email, password_hash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'ChangeMe-12345', 12), role: 'ADMIN',
      account_status: 'ACTIVE', must_change_password: false, created_at: now(), updated_at: now(), last_login_at: null });
    await db.save('users'); console.log('Seeded admin:', email);
  }
  // recover attempts left mid-evaluation by a restart
  T.attempts.filter(a => a.status === 'SUBMITTED' || a.status === 'EVALUATING').forEach(a => { evaluateAttempt(a.id).catch(console.error); });
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log('Interview app on http://localhost:' + port));
})().catch(e => { console.error(e); process.exit(1); });
