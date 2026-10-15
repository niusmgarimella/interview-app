// Optional: creates sample data (admin, one test candidate, one interview, one assigned attempt).
// Idempotent: safe to run more than once. Usage: npm run seed
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as db from './store';
import type { Attempt, Interview, User } from './types';

const T = db.t;
const id = (): string => crypto.randomUUID();
const now = (): string => new Date().toISOString();

async function makeUser(email: string, password: string, role: User['role']): Promise<User> {
  const u: User = { id: id(), email, password_hash: await bcrypt.hash(password, 12), role, account_status: 'ACTIVE',
    must_change_password: false, created_at: now(), updated_at: now(), last_login_at: null };
  T.users.push(u);
  return u;
}

(async () => {
  await db.init();
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const admin = T.users.find(u => u.role === 'ADMIN') ?? await makeUser(adminEmail, process.env.ADMIN_PASSWORD || 'ChangeMe-12345', 'ADMIN');

  const candEmail = 'candidate@example.com';
  let cand = T.users.find(u => u.email === candEmail);
  if (!cand) {
    cand = await makeUser(candEmail, 'Candidate@123', 'CANDIDATE');
    T.candidate_profiles.push({ user_id: cand.id, full_name: 'Test Candidate', phone: '', pan_ciphertext: null, pan_last4: null, created_at: now(), updated_at: now() });
  }

  let iv: Interview | undefined = T.interviews.find(i => i.title === 'Frontend Screening (sample)');
  if (!iv) {
    iv = { id: id(), title: 'Frontend Screening (sample)', description: 'Answer each question. Submitted answers are locked.', duration_minutes: 45,
      question_count: 6, allowed_skills: ['JavaScript', 'React', 'TypeScript', 'HTML/CSS'], status: 'ACTIVE', created_by: admin.id, created_at: now(), updated_at: now() };
    T.interviews.push(iv);
  }
  const interviewId = iv.id, candidateId = cand.id;
  if (!T.attempts.some(a => a.candidate_user_id === candidateId && a.interview_id === interviewId)) {
    const a: Attempt = { id: id(), interview_id: interviewId, candidate_user_id: candidateId, status: 'NOT_STARTED', started_at: null, submitted_at: null,
      deadline_at: null, completed_at: null, warning_count: 0, termination_reason: null, result_released_at: null, created_at: now(), updated_at: now() };
    T.attempts.push(a);
  }
  await db.save();
  console.log(`Seed complete.\n  Admin:     ${admin.email}\n  Candidate: ${candEmail} / Candidate@123\n  Sample interview assigned to the candidate.`);
})().catch(e => { console.error(e); process.exit(1); });
