import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, errMsg } from '../api';
import type { AttemptState, AttemptSummary, Profile } from '../types';
import SkillSelect from './SkillSelect';
import Workspace from './Workspace';
import Status from './Status';

export default function CandidateApp() {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  return attemptId ? <Attempt id={attemptId} onExit={() => setAttemptId(null)} /> : <Dashboard onOpen={setAttemptId} />;
}

function Dashboard({ onOpen }: { onOpen: (id: string) => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [list, setList] = useState<AttemptSummary[]>([]);
  const [form, setForm] = useState({ full_name: '', phone: '', pan: '' });
  const [msg, setMsg] = useState('');
  useEffect(() => {
    Promise.all([api<Profile>('GET', '/candidate/me'), api<AttemptSummary[]>('GET', '/candidate/attempts')]).then(([p, l]) => {
      setProfile(p); setList(l); setForm({ full_name: p.full_name, phone: p.phone, pan: '' });
    }).catch(e => setMsg(errMsg(e)));
  }, []);
  const save = async (e: FormEvent) => {
    e.preventDefault(); setMsg('');
    try { await api('PUT', '/candidate/me', { ...form, pan: form.pan || undefined }); setMsg('Saved'); setForm(f => ({ ...f, pan: '' })); }
    catch (x) { setMsg(errMsg(x)); }
  };
  if (!profile) return <p className="muted">{msg || 'Loading…'}</p>;
  return (
    <>
      <div className="card"><h2>My interviews</h2>
        {list.length === 0 && <p className="muted">No interviews assigned yet.</p>}
        {list.map(a => (
          <div key={a.id} className="row between" style={{ padding: '6px 0' }}>
            <span>{a.title} <span className="muted">· {a.status}</span></span><button onClick={() => onOpen(a.id)}>Open</button>
          </div>))}
      </div>
      <form className="card" onSubmit={save}>
        <h2>Candidate profile</h2>
        <label>Full name</label><input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
        <label>Email</label><input value={profile.email} disabled />
        <label>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <label>PAN (only if required) {profile.pan_masked && <span className="muted">saved: {profile.pan_masked}</span>}</label>
        <input value={form.pan} placeholder="Leave blank to keep" autoComplete="off" onChange={e => setForm({ ...form, pan: e.target.value })} />
        <p className="err" role="status">{msg}</p><button>Save profile</button>
      </form>
    </>
  );
}

function Attempt({ id, onExit }: { id: string; onExit: () => void }) {
  const [state, setState] = useState<AttemptState | null>(null);
  const [err, setErr] = useState('');
  const reload = useCallback(
    (): Promise<void> => api<AttemptState>('GET', '/attempts/' + id).then(setState).catch(e => setErr(errMsg(e))), [id]);
  useEffect(() => { void reload(); }, [reload]);
  if (err) return <div className="card"><p className="err">{err}</p><button onClick={onExit}>Back</button></div>;
  if (!state) return <p className="muted">Loading…</p>;
  if (state.status === 'NOT_STARTED') return <SkillSelect state={state} reload={reload} onExit={onExit} />;
  if (state.status === 'IN_PROGRESS') return <Workspace key={state.id} state={state} reload={reload} />;
  return <Status state={state} onExit={onExit} />;
}
