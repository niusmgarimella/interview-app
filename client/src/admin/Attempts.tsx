import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from '../api';
import type { AdminAttemptDetail, AdminAttemptRow, AttemptStatus, CandidateRow, InterviewRow } from '../types';

export function Attempts({ onReview }: { onReview: (id: string) => void }) {
  const [list, setList] = useState<AdminAttemptRow[]>([]);
  const [cs, setCs] = useState<CandidateRow[]>([]);
  const [ivs, setIvs] = useState<InterviewRow[]>([]);
  const [cid, setCid] = useState(''); const [iid, setIid] = useState(''); const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const [l, c, i] = await Promise.all([api<AdminAttemptRow[]>('GET', '/admin/attempts'), api<CandidateRow[]>('GET', '/admin/candidates'), api<InterviewRow[]>('GET', '/admin/interviews')]);
    setList(l); setCs(c); setIvs(i); setCid(v => v || c[0]?.id || ''); setIid(v => v || i[0]?.id || '');
  }, []);
  useEffect(() => { load().catch(e => setErr(errMsg(e))); }, [load]);
  const count = (...s: AttemptStatus[]) => list.filter(a => s.includes(a.status)).length;
  const assign = async () => { setErr(''); try { await api('POST', '/admin/attempts', { candidate_user_id: cid, interview_id: iid }); await load(); } catch (e) { setErr(errMsg(e)); } };
  return (
    <>
      <div className="card"><h2>Dashboard</h2>
        <p className="muted">Assigned {count('NOT_STARTED')} | In progress {count('IN_PROGRESS')} | Submitted {count('SUBMITTED', 'EVALUATING')} | Evaluated {count('EVALUATED', 'RELEASED')} | Terminated {count('TERMINATED')}</p>
        <div className="tablewrap"><table><thead><tr><th>Candidate</th><th>Interview</th><th>Status</th><th>Warnings</th><th /></tr></thead><tbody>
          {list.map(a => (
            <tr key={a.id}><td>{a.candidate}</td><td>{a.interview}</td><td>{a.status}</td><td>{a.warning_count}</td>
              <td><button className="sec" onClick={() => onReview(a.id)}>Review</button></td></tr>))}
        </tbody></table></div></div>
      <div className="card"><h3>Assign interview</h3>
        <div className="row">
          <select value={cid} onChange={e => setCid(e.target.value)}>{cs.map(c => <option key={c.id} value={c.id}>{c.full_name} ({c.email})</option>)}</select>
          <select value={iid} onChange={e => setIid(e.target.value)}>{ivs.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select>
          <button onClick={assign} disabled={!cid || !iid}>Assign</button></div>
        <p className="err">{err}</p></div>
    </>
  );
}

export function Review({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<AdminAttemptDetail | null>(null); const [err, setErr] = useState('');
  const load = useCallback(() => api<AdminAttemptDetail>('GET', '/admin/attempts/' + id).then(setD).catch(e => setErr(errMsg(e))), [id]);
  useEffect(() => { void load(); }, [load]);
  const act = async (path: 'release' | 're-evaluate', delay = 0) => {
    setErr('');
    try { await api('POST', `/admin/attempts/${id}/${path}`); setTimeout(() => { void load(); }, delay); } catch (e) { setErr(errMsg(e)); }
  };
  if (!d) return <p className="err">{err || 'Loading…'}</p>;
  const { attempt: a, result: r } = d;
  return (
    <>
      <button className="sec" onClick={onBack}>← Back</button>
      <div className="card"><h2>Attempt {a.id.slice(0, 8)}</h2>
        <p>Status: <b>{a.status}</b> | Warnings: {a.warning_count} {a.termination_reason && `| ${a.termination_reason}`} | Released: {a.result_released_at ? 'yes' : 'no'}</p>
        <p className="muted">Skills: {d.skills.map(s => `${s.skill_name} (${s.proficiency})`).join(', ')}</p>
        {r ? <p><b>Evaluation ({r.status}): {r.overall_score} / {r.max_score}</b> <span className="muted">{r.evaluation_model}</span></p> : <p className="muted">No evaluation yet.</p>}
        <p className="err" role="alert">{err}</p>
        <div className="row"><button className="sec" onClick={() => act('re-evaluate', 1500)}>Re-evaluate</button>
          <button disabled={r?.status !== 'COMPLETED' || !!a.result_released_at} onClick={() => act('release')}>Release result</button></div></div>
      {d.questions.map(q => {
        const qr = r?.question_results.find(x => x.question_id === q.id);
        return (
          <div className="card" key={q.id}><b>Q{q.sequence_number} · {q.skill_name} · {q.question_type}</b><p>{q.prompt}</p>
            <pre>{q.answer ? q.answer.answer_payload : '(no answer)'}</pre>
            {q.private?.correct_option_id && <p className="muted">Key: {q.private.correct_option_id}</p>}
            {qr && <p>{qr.points}/{qr.max} — {qr.rationale}</p>}</div>);
      })}
      <div className="card"><h3>Monitoring events</h3>
        {d.events.length ? d.events.map(e => <div className="muted" key={e.id}>{e.occurred_at} · {e.event_type} · {e.action_taken} · warning {e.warning_number ?? '-'}</div>) : <p className="muted">None</p>}</div>
    </>
  );
}
