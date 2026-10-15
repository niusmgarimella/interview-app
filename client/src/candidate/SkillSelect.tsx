import { useState } from 'react';
import { api, errMsg } from '../api';
import type { AttemptState, Proficiency } from '../types';

const LEVELS: Proficiency[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
interface Props { state: AttemptState; reload: () => Promise<void>; onExit: () => void }

export default function SkillSelect({ state, reload, onExit }: Props) {
  const iv = state.interview;
  const [sel, setSel] = useState<Record<string, Proficiency>>(() => Object.fromEntries(state.skills.map(s => [s.skill_name, s.proficiency])));
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const toggle = (k: string) => setSel(s => { const n = { ...s }; if (n[k]) delete n[k]; else n[k] = 'INTERMEDIATE'; return n; });
  const start = async () => {
    setErr('');
    const skills = Object.entries(sel).map(([skill_name, proficiency]) => ({ skill_name, proficiency }));
    if (!skills.length) return setErr('Select at least one technology');
    setBusy(true);
    try { await api('PUT', `/attempts/${state.id}/skills`, { skills }); await api('POST', `/attempts/${state.id}/start`); await reload(); }
    catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  return (
    <div className="card">
      <h2>{iv.title}</h2><p>{iv.description}</p>
      <h3>Choose technologies and levels</h3>
      {iv.allowed_skills.map(k => (
        <div key={k} className="row" style={{ padding: '6px 0' }}>
          <label className="opt" style={{ minWidth: 150, margin: 0, fontWeight: 600 }}>
            <input type="checkbox" checked={!!sel[k]} onChange={() => toggle(k)} /> {k}</label>
          {LEVELS.map(l => (
            <label key={l} className="opt" style={{ margin: 0 }}>
              <input type="radio" name={'lvl-' + k} disabled={!sel[k]} checked={sel[k] === l} onChange={() => setSel(s => ({ ...s, [k]: l }))} /> {l[0] + l.slice(1).toLowerCase()}
            </label>))}
        </div>))}
      <p className="muted">Duration: {iv.duration_minutes ? iv.duration_minutes + ' minutes' : 'untimed'}. Submitted answers are locked and read-only.
        Leaving the interview window triggers a warning; {state.max_warnings} accepted violations terminate the attempt.</p>
      <p className="err" role="alert">{err}</p>
      <div className="row"><button className="sec" onClick={onExit}>Back</button>
        <button onClick={start} disabled={busy}>{busy ? 'Generating questions…' : 'Start interview'}</button></div>
    </div>
  );
}
