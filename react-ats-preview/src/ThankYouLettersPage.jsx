import { useEffect, useState } from 'react';

const labels = { pending: 'Pending admin approval', sending: 'Sending / check delivery', sent: 'Sent', needs_review: 'Delivery needs review' };
export default function ThankYouLettersPage({ backendActions, currentRole }) {
  const [letters, setLetters] = useState([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState('pending');
  const load = async () => {
    setLoading(true);
    try { const data = await backendActions.listThankYouLetters(); setLetters(data.letters); setConfigured(data.emailConfigured); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const confirm = async () => {
    setSending(true); setError('');
    try {
      const result = await backendActions.confirmThankYouLetter(selected.id, selected.preview.token);
      setSelected(null);
      await load();
      if (result.message) setError(result.message);
    } catch (e) { setError(e.message); setSelected(null); await load(); }
    finally { setSending(false); }
  };
  const shown = letters.filter(letter => filter === 'all' || (filter === 'pending' ? letter.status === 'pending' : filter === 'attention' ? ['needs_review', 'sending'].includes(letter.status) : letter.status === 'sent'));
  return <>
    <div className="page-header"><div><div className="page-title">Thank You Letters</div><div className="page-sub">Rejected applications awaiting an admin-reviewed email</div></div><button className="btn btn-ghost" onClick={load} disabled={loading || sending}>Refresh</button></div>
    <div className="page-content">
      {error && <div role="alert" className="alert alert-amber" style={{ marginBottom: 16 }}>{error}</div>}
      {!loading && !configured && <div className="alert alert-amber" style={{ marginBottom: 16 }}>Email service is unavailable. Letters will remain pending until it is configured.</div>}
      <div className="toolbar"><label>Show <select aria-label="Letter status" className="form-select" value={filter} onChange={e => setFilter(e.target.value)}><option value="pending">Pending approval</option><option value="sent">Sent</option><option value="attention">Needs attention</option><option value="all">All letters</option></select></label><span>{shown.length} letters</span></div>
      <div className="card"><div className="table-wrap"><table><thead><tr><th>Candidate</th><th>Position</th><th>Email</th><th>Status</th><th>Sent date</th><th></th></tr></thead><tbody>
        {shown.map(letter => <tr key={letter.id}><td>{letter.candidateName}</td><td>{letter.position}</td><td>{letter.preview.to || 'Missing email'}</td><td>{labels[letter.status] || letter.status}</td><td>{letter.sentAt ? new Date(letter.sentAt).toLocaleString() : '—'}</td><td><button className="btn btn-ghost btn-sm" onClick={() => setSelected(letter)}>{letter.status === 'pending' ? 'Review letter' : 'View letter'}</button></td></tr>)}
        {!shown.length && <tr><td colSpan={6} style={{ padding: 24 }}>{loading ? 'Loading letters…' : 'No letters in this view. Newly rejected applications will appear here for admin approval.'}</td></tr>}
      </tbody></table></div></div>
    </div>
    {selected && <div className="modal-overlay"><div className="modal modal-lg"><div className="modal-header"><div className="modal-title">Thank You Letter</div><button className="modal-close" onClick={() => setSelected(null)} disabled={sending}>×</button></div><div className="modal-body">
      <p><strong>To:</strong> {selected.preview.to || 'Missing email'}</p><p style={{ marginTop: 12 }}><strong>Subject:</strong> {selected.preview.subject}</p><div style={{ whiteSpace: 'pre-wrap', marginTop: 20, lineHeight: 1.7 }}>{selected.preview.text}</div>
      {selected.status === 'pending' && !selected.preview.validEmail && <div className="alert alert-amber">A valid candidate email is required. Update the candidate in Talent Database, then refresh this queue.</div>}
      {currentRole !== 'Admin' && selected.status === 'pending' && <p style={{ marginTop: 16 }}>Only an admin can confirm and send this letter.</p>}
      {['sending', 'needs_review'].includes(selected.status) && <p style={{ marginTop: 16 }}>Check mail delivery records before any manual resend. Automatic retries are disabled to avoid duplicate emails.</p>}
    </div><div className="modal-footer"><button className="btn btn-ghost" onClick={() => setSelected(null)} disabled={sending}>Close</button>{currentRole === 'Admin' && selected.status === 'pending' && <button className="btn btn-primary" onClick={confirm} disabled={sending || !configured || !selected.preview.validEmail}>{sending ? 'Sending…' : 'Confirm & send email'}</button>}</div></div></div>}
  </>;
}
