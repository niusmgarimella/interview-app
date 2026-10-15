import { useEffect, useState } from 'react';
import { api } from '../api';
import type { AttemptState, ResultView } from '../types';

export default function Status({ state, onExit }: { state: AttemptState; onExit: () => void }) {
  const [result, setResult] = useState<ResultView | null>(null);
  useEffect(() => { if (state.released) api<ResultView>('GET', `/attempts/${state.id}/result`).then(setResult).catch(() => {}); }, [state]);
  const msg = ({ TERMINATED: 'Your interview was terminated (window violation limit). Locked answers were preserved.',
    EXPIRED: 'Time expired. Locked answers were submitted.' } as Record<string, string>)[state.status] || 'Your interview was submitted successfully.';
  return (
    <div className="card"><h2>Interview status</h2><p>Status: <b>{state.status}</b></p><p>{msg}</p>
      {state.released
        ? result && (<><h3>Result: {result.overall_score} / {result.max_score}</h3><pre>{result.feedback}</pre></>)
        : <p className="muted">Scores and feedback stay hidden until an administrator releases the result.</p>}
      <button onClick={onExit}>Back to dashboard</button></div>
  );
}
