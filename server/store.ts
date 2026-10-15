// Protected JSON repository: in-memory cache, serialized writes, temp file + atomic rename, .bak backup.
import fs from 'fs/promises';
import path from 'path';
import type { Tables, TableName } from './types';

const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data'); // keep OUTSIDE any public/static dir
const NAMES: TableName[] = ['users', 'candidate_profiles', 'interviews', 'attempts', 'attempt_skills', 'questions',
  'question_private', 'answers', 'evaluation_results', 'monitoring_events', 'audit_logs'];

export const t: Tables = {
  users: [], candidate_profiles: [], interviews: [], attempts: [], attempt_skills: [], questions: [],
  question_private: [], answers: [], evaluation_results: [], monitoring_events: [], audit_logs: [],
};
let chain: Promise<void> = Promise.resolve();

export async function init(): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  for (const n of NAMES) {
    try { (t as unknown as Record<TableName, unknown[]>)[n] = JSON.parse(await fs.readFile(path.join(DIR, n + '.json'), 'utf8')); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; } // corrupt JSON fails loudly on purpose
  }
}
function writeOne(n: TableName): Promise<void> {
  const job = chain.then(async () => {
    const f = path.join(DIR, n + '.json'), tmp = f + '.tmp';
    const fh = await fs.open(tmp, 'w');
    try { await fh.writeFile(JSON.stringify(t[n], null, 2)); await fh.sync(); } finally { await fh.close(); }
    try { await fs.copyFile(f, f + '.bak'); } catch { /* first write: nothing to back up */ }
    await fs.rename(tmp, f);
  });
  chain = job.catch(() => {});
  return job;
}
export const save = (...names: TableName[]): Promise<void[]> => Promise.all((names.length ? names : NAMES).map(writeOne));
