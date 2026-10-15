import { useState } from 'react';
import { Attempts, Review } from './Attempts';
import { Candidates, Interviews } from './Manage';

type Tab = 'attempts' | 'candidates' | 'interviews';
const TABS: Tab[] = ['attempts', 'candidates', 'interviews'];

export default function AdminApp() {
  const [tab, setTab] = useState<Tab>('attempts');
  const [reviewId, setReviewId] = useState<string | null>(null);
  if (reviewId) return <Review id={reviewId} onBack={() => setReviewId(null)} />;
  return (
    <>
      <div className="row" style={{ margin: '12px 0' }}>
        {TABS.map(t => <button key={t} className={t === tab ? '' : 'sec'} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
      </div>
      {tab === 'attempts' && <Attempts onReview={setReviewId} />}
      {tab === 'candidates' && <Candidates />}
      {tab === 'interviews' && <Interviews />}
    </>
  );
}
