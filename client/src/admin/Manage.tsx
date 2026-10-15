import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import { api, errMsg } from '../api';
import type { CandidateRow, CreatedCandidate, InterviewRow } from '../types';

export function Candidates() {
  const [list, setList] = useState<CandidateRow[]>([]);
  const [f, setF] = useState({ full_name: '', email: '', phone: '', password: '' });
  const [err, setErr] = useState(''); const [created, setCreated] = useState<CreatedCandidate | null>(null); const [resetMsg, setResetMsg] = useState('');
  const load = useCallback(() => api<CandidateRow[]>('GET', '/admin/candidates').then(setList).catch(e => setErr(errMsg(e))), []);
  useEffect(() => { void load(); }, [load]);
  const create = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setCreated(null);
    try { setCreated(await api<CreatedCandidate>('POST', '/admin/candidates', f)); setF({ full_name: '', email: '', phone: '', password: '' }); await load(); }
    catch (x) { setErr(errMsg(x)); }
  };
  const toggle = async (c: CandidateRow) => {
    await api('POST', `/admin/candidates/${c.id}/status`, { status: c.account_status === 'DISABLED' ? 'ACTIVE' : 'DISABLED' }); await load();
  };
  const reset = async (c: CandidateRow) => {
    const pw = window.prompt(`New password for ${c.email} (min 8 chars). Leave blank to generate one:`);
    if (pw === null) return;
    try {
      const r = await api<{ email: string; temporary_password: string | null }>('POST', `/admin/candidates/${c.id}/reset-password`, { password: pw || undefined });
      setResetMsg(r.temporary_password ? `New temporary password for ${r.email}: ${r.temporary_password}` : `Password updated for ${r.email}`);
    } catch (x) { setResetMsg(errMsg(x)); }
  };
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <div className="card"><h2>Candidate accounts</h2>
        <div className="tablewrap"><table><thead><tr><th>Name</th><th>Email</th><th>Status</th><th /></tr></thead><tbody>
          {list.map(c => (
            <tr key={c.id}><td>{c.full_name}</td><td>{c.email}</td><td>{c.account_status}</td>
              <td className="row"><button className="sec" onClick={() => toggle(c)}>{c.account_status === 'DISABLED' ? 'Enable' : 'Disable'}</button>
                <button className="sec" onClick={() => reset(c)}>Reset password</button></td></tr>))}
        </tbody></table></div>
        {resetMsg && <p className="ok">{resetMsg}</p>}</div>
      <form className="card" onSubmit={create}><h3>Create candidate</h3>
        <label>Name</label><input value={f.full_name} onChange={set('full_name')} required />
        <label>Email</label><input type="email" value={f.email} onChange={set('email')} required />
        <label>Phone (optional)</label><input value={f.phone} onChange={set('phone')} />
        <label>Password (optional, min 8 chars; leave blank to auto-generate)</label>
        <input type="text" value={f.password} autoComplete="off" onChange={set('password')} />
        <p className="err" role="alert">{err}</p><button>Create</button>
        {created && (created.temporary_password
          ? <p className="ok">Created. Temporary password (shown once): <code>{created.temporary_password}</code></p>
          : <p className="ok">Created. The candidate can sign in with the password you set.</p>)}</form>
    </>
  );
}

export function Interviews() {
  const [list, setList] = useState<InterviewRow[]>([]); const [err, setErr] = useState('');
  const [f, setF] = useState({ title: '', description: '', skills: 'JavaScript, React, TypeScript, HTML/CSS', question_count: '8', duration_minutes: '45' });
  const load = useCallback(() => api<InterviewRow[]>('GET', '/admin/interviews').then(setList).catch(e => setErr(errMsg(e))), []);
  useEffect(() => { void load(); }, [load]);
  const create = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    try {
      await api('POST', '/admin/interviews', { title: f.title, description: f.description, allowed_skills: f.skills.split(','),
        question_count: Number(f.question_count), duration_minutes: f.duration_minutes || null });
      setF({ ...f, title: '', description: '' }); await load();
    } catch (x) { setErr(errMsg(x)); }
  };
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <div className="card"><h2>Interviews</h2>
        {list.length ? list.map(i => <div key={i.id}>{i.title} <span className="muted">· {i.question_count} questions · {i.allowed_skills.join(', ')}</span></div>) : <p className="muted">None yet.</p>}</div>
      <form className="card" onSubmit={create}><h3>Create interview</h3>
        <label>Title</label><input value={f.title} onChange={set('title')} required />
        <label>Instructions</label><textarea style={{ minHeight: 70 }} value={f.description} onChange={set('description')} />
        <label>Allowed skills (comma separated)</label><input value={f.skills} onChange={set('skills')} />
        <label>Question count</label><input type="number" min="1" max="50" value={f.question_count} onChange={set('question_count')} />
        <label>Duration in minutes (blank = untimed)</label><input type="number" value={f.duration_minutes} onChange={set('duration_minutes')} />
        <p className="err" role="alert">{err}</p><button>Create</button></form>
    </>
  );
}
