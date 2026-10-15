import { useEffect, useRef, useState } from 'react';
import { api, errMsg } from '../api';
import type { AttemptState, MonitoringResponse, QuestionPayload, QuestionStub } from '../types';

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
interface Props { state: AttemptState; reload: () => Promise<void> }

export default function Workspace({ state, reload }: Props) {
  const [qs, setQs] = useState<QuestionStub[]>(state.questions);
  const [idx, setIdx] = useState<number>(() => { const f = state.questions.findIndex(q => !q.locked); return f < 0 ? state.questions.length : f; });
  const [data, setData] = useState<QuestionPayload | null>(null);
  const [answer, setAnswer] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState('');
  const [banner, setBanner] = useState('');
  const [warnings, setWarnings] = useState(state.warning_count);
  const [left, setLeft] = useState<number | null>(null);

  // Load the current question (the server refuses future questions)
  useEffect(() => {
    if (idx >= qs.length) return;
    let live = true; setData(null); setErr(''); setConfirming(false);
    api<QuestionPayload>('GET', `/attempts/${state.id}/questions/${qs[idx].id}`)
      .then(d => { if (live) { setData(d); setAnswer(d.answer?.payload ?? ''); } })
      .catch(e => { if (live) setErr(errMsg(e)); });
    return () => { live = false; };
  }, [idx, qs, state.id]);

  // Display-only countdown; the server enforces the real deadline
  useEffect(() => {
    if (!state.deadline_at) return;
    const deadline = Date.parse(state.deadline_at);
    const t = setInterval(() => {
      const s = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setLeft(s); if (s === 0) { clearInterval(t); void reload(); }
    }, 1000);
    return () => clearInterval(t);
  }, [state.deadline_at, reload]);

  // Best-effort window monitoring: one accepted violation per departure episode
  const ep = useRef<string | null>(null);
  useEffect(() => {
    const send = async (type: 'VISIBILITY_LOST' | 'WINDOW_BLUR' | 'VISIBILITY_RESTORED') => {
      const leaving = type !== 'VISIBILITY_RESTORED';
      if (leaving && !ep.current) ep.current = crypto.randomUUID(); else if (!leaving && !ep.current) return;
      const episode_id = ep.current; if (!leaving) ep.current = null;
      try {
        const r = await api<MonitoringResponse>('POST', `/attempts/${state.id}/monitoring-events`, { event_type: type, episode_id });
        setWarnings(r.warning_count);
        if (r.status !== 'IN_PROGRESS') void reload();
        else if (r.action === 'WARNED') setBanner(`Interview window left. Recorded warnings: ${r.warning_count} of ${state.max_warnings}. Return to the interview to continue.`);
      } catch { /* best effort */ }
    };
    const vis = () => { void send(document.hidden ? 'VISIBILITY_LOST' : 'VISIBILITY_RESTORED'); };
    const blur = () => { void send('WINDOW_BLUR'); };
    const focus = () => { void send('VISIBILITY_RESTORED'); };
    document.addEventListener('visibilitychange', vis); window.addEventListener('blur', blur); window.addEventListener('focus', focus);
    return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('blur', blur); window.removeEventListener('focus', focus); };
  }, [state.id, state.max_warnings, reload]);

  const lockAndNext = async () => {
    if (!data) return;
    if (!answer.trim()) { setConfirming(false); setErr('Provide an answer before continuing'); return; }
    try {
      await api('POST', `/attempts/${state.id}/answers/${data.question.id}/lock`, { payload: answer, request_id: crypto.randomUUID() });
      setQs(list => list.map((x, i) => (i === idx ? { ...x, locked: true } : x))); setBanner(''); setIdx(idx + 1);
    } catch (e) { setConfirming(false); setErr(errMsg(e)); }
  };

  if (idx >= qs.length) return <Review state={state} qs={qs} back={() => setIdx(qs.length - 1)} reload={reload} />;
  const q = data?.question, locked = !!data?.answer;
  return (
    <div className="card">
      <div className="row between"><strong>Question {idx + 1} of {qs.length}</strong>
        <span>Time remaining: <b>{state.deadline_at ? (left == null ? '…' : fmt(left)) : 'untimed'}</b></span>
        <span>Warnings: {warnings} / {state.max_warnings}</span></div>
      {banner && <div className="warn" role="alert">{banner}</div>}
      {err && <p className="err" role="alert">{err}</p>}
      {!q ? (!err && <p className="muted">Loading question…</p>) : (
        <>
          <p className="muted">Skill: {q.skill_name} | Level: {q.proficiency} | Type: {q.question_type} | {q.points_possible} pts</p>
          <p><b>{q.prompt}</b></p>
          {q.question_type === 'MCQ'
            ? (q.options ?? []).map(o => (
                <label key={o.id} className="opt"><input type="radio" name="ans" value={o.id} checked={answer === o.id} disabled={locked}
                  onChange={() => setAnswer(o.id)} /> {o.id}. {o.text}</label>))
            : <textarea value={answer} readOnly={locked} spellCheck={false} aria-label="Your answer" onChange={e => setAnswer(e.target.value)} />}
          {locked && <p className="ok">✓ Locked (read-only)</p>}
          {confirming && (
            <div className="warn">Lock this answer? It cannot be changed afterwards.
              <div className="row" style={{ marginTop: 8 }}><button onClick={lockAndNext}>Yes, lock it</button>
                <button className="sec" onClick={() => setConfirming(false)}>Cancel</button></div></div>)}
          <div className="row between" style={{ marginTop: 12 }}>
            <button className="sec" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Previous</button>
            {locked
              ? <button onClick={() => setIdx(idx + 1)}>Next</button>
              : <button disabled={confirming} onClick={() => { setErr(''); setConfirming(true); }}>Next — lock answer</button>}
          </div>
        </>)}
    </div>
  );
}

function Review({ state, qs, back, reload }: { state: AttemptState; qs: QuestionStub[]; back: () => void; reload: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false); const [err, setErr] = useState('');
  const submit = async () => { try { await api('POST', `/attempts/${state.id}/submit`); await reload(); } catch (e) { setErr(errMsg(e)); } };
  return (
    <div className="card"><h2>Review and submit</h2>
      {qs.map((q, i) => <div key={q.id}>Question {i + 1} — {q.locked ? '✓ Locked' : 'Not answered'}</div>)}
      <p className="muted">Locked answers cannot be edited. Unanswered questions may receive no credit.</p>
      <p className="err" role="alert">{err}</p>
      {confirming && (
        <div className="warn">Submit now? You cannot change answers after submission.
          <div className="row" style={{ marginTop: 8 }}><button onClick={submit}>Yes, submit</button>
            <button className="sec" onClick={() => setConfirming(false)}>Cancel</button></div></div>)}
      <div className="row"><button className="sec" onClick={back}>Back to interview</button>
        <button disabled={confirming} onClick={() => setConfirming(true)}>Submit interview</button></div>
    </div>
  );
}
