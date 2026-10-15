import { useEffect, useState } from 'react';
import { api } from './api';
import type { Me } from './types';
import { Login, ChangePassword } from './Auth';
import CandidateApp from './candidate/CandidateApp';
import AdminApp from './admin/AdminApp';

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined = loading, null = signed out
  useEffect(() => { api<Me>('GET', '/auth/me').then(setMe).catch(() => setMe(null)); }, []);
  const logout = async () => { await api('POST', '/auth/logout').catch(() => {}); setMe(null); };
  if (me === undefined) return <main><p className="muted">Loading…</p></main>;
  if (!me) return <main><Login onLogin={setMe} /></main>;
  if (me.must_change_password) return <main><ChangePassword onDone={() => setMe({ ...me, must_change_password: false })} /></main>;
  return (
    <main>
      <div className="row between"><h1>Online Interview App</h1>
        <div className="row"><span className="muted">{me.email}</span><button className="sec" onClick={logout}>Sign out</button></div></div>
      {me.role === 'ADMIN' ? <AdminApp /> : <CandidateApp />}
    </main>
  );
}
