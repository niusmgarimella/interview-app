import { FormEvent, useState } from 'react';
import { api, errMsg } from './api';
import type { Me } from './types';

export function Login({ onLogin }: { onLogin: (me: Me) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { onLogin(await api<Me>('POST', '/auth/login', { email, password })); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h1>Online Interview App | Sign in</h1>
      <label htmlFor="em">Email address</label>
      <input id="em" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
      <label htmlFor="pw">Password</label>
      <input id="pw" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
      <p className="err" role="alert">{err}</p>
      <button disabled={busy}>Sign in</button>
      <p className="muted">Contact your administrator if you cannot sign in.</p>
    </form>
  );
}

export function ChangePassword({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    try { await api('POST', '/auth/change-password', { current, next }); onDone(); } catch (x) { setErr(errMsg(x)); }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h1>Set a new password</h1><p className="muted">Choose a new password (10+ characters).</p>
      <label>Temporary password</label><input type="password" value={current} onChange={e => setCurrent(e.target.value)} required />
      <label>New password</label><input type="password" value={next} onChange={e => setNext(e.target.value)} required minLength={10} />
      <p className="err" role="alert">{err}</p><button>Save password</button>
    </form>
  );
}
