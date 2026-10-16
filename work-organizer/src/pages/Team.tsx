import { useEffect, useState } from 'react';
import { Avatar, formatBytes, TagChip } from '../components/Atoms';
import { IconCopy, IconDownload, IconPlus, IconTrash } from '../components/Icons';
import { useToast } from '../components/Toast';
import { timeAgo } from '../lib/dates';
import { callApi, supabase } from '../lib/supabase';
import type { TagColor } from '../lib/types';
import { TAG_COLORS } from '../lib/types';
import { useData } from '../store/data';

const STORAGE_LIMIT = 1024 * 1024 * 1024; // free plan: ~1 GB

function tempPassword(): string {
  const words = ['river', 'maple', 'orbit', 'cedar', 'lunar', 'amber', 'delta', 'pixel', 'coral', 'ember'];
  const w = () => words[Math.floor(Math.random() * words.length)];
  return `${w()}-${w()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function AddMember() {
  const toast = useToast();
  const { reload } = useData();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(tempPassword);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const submit = async () => {
    if (!email.trim() || password.length < 8) { toast.error('Email and a password of at least 8 characters are needed.'); return; }
    setBusy(true);
    try {
      await callApi('/api/add-member', { email: email.trim(), full_name: name.trim(), password });
      setCreated({ email: email.trim(), password });
      setName(''); setEmail(''); setPassword(tempPassword());
      await reload('profiles');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const message = created ? `You now have access to our Work Organizer.\n\nOpen: ${location.origin}\nEmail: ${created.email}\nTemporary password: ${created.password}\n\nYou'll be asked to choose your own password when you log in.` : '';

  return (
    <div className="card-box">
      <h2>Add a teammate</h2>
      <p className="muted" style={{ fontSize: 12.5 }}>Creates their login. They'll choose their own password the first time they sign in.</p>
      <div className="grid-2">
        <label className="field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lina Haddad" /></label>
        <label className="field">Email<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="lina@company.com" /></label>
        <label className="field">Temporary password<input className="input mono" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn primary" disabled={busy} onClick={submit}><IconPlus size={14} /> {busy ? 'Creating…' : 'Create login'}</button>
        </div>
      </div>
      {created && (
        <div className="notice" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <strong style={{ fontWeight: 600 }}>Login created — send them this:</strong>
          <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12.5 }}>{message}</pre>
          <div className="row-gap">
            <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(message); toast.show('Copied'); }}><IconCopy size={13} /> Copy message</button>
            <button className="btn ghost sm" onClick={() => setCreated(null)}>Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Tags() {
  const { db, update, remove, insert } = useData();
  const [name, setName] = useState('');
  const counts = (id: string) => db.task_tags.filter((t) => t.tag_id === id).length;
  return (
    <div className="card-box">
      <h2>Tags</h2>
      <p className="muted" style={{ fontSize: 12.5 }}>Shared by the whole team. Click a colour to change it.</p>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {db.tags.map((t) => (
          <div className="chk" key={t.id}>
            <TagChip tag={t} />
            <span className="muted mono" style={{ fontSize: 11.5 }}>{counts(t.id)} tasks</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
              {TAG_COLORS.map((c) => (
                <button key={c} aria-label={`Colour ${c}`} onClick={() => update('tags', { id: t.id }, { color: c as TagColor })}
                  style={{ width: 16, height: 16, borderRadius: 4, border: t.color === c ? '2px solid var(--text)' : '1px solid var(--line-strong)', background: `var(--tag-${c})`, cursor: 'pointer', padding: 0 }} />
              ))}
            </span>
            <button className="btn ghost sm icon" aria-label={`Delete tag ${t.name}`} onClick={() => { if (confirm(`Delete tag "${t.name}"? It's removed from all tasks.`)) remove('tags', { id: t.id }); }}><IconTrash size={13} /></button>
          </div>
        ))}
      </div>
      <div className="row-gap">
        <input className="input grow" placeholder="New tag" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={async (e) => { if (e.key === 'Enter' && name.trim()) { await insert('tags', { name: name.trim().toLowerCase(), color: TAG_COLORS[db.tags.length % TAG_COLORS.length] }); setName(''); } }} />
      </div>
    </div>
  );
}

function StorageAndExport() {
  const { db, tasks } = useData();
  const [used, setUsed] = useState<number | null>(null);
  useEffect(() => {
    supabase.rpc('storage_used').then(({ data }) => setUsed(Number(data ?? 0)));
  }, [db.attachments.length]);
  const pct = used === null ? 0 : Math.min(100, (used / STORAGE_LIMIT) * 100);

  const download = (name: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportJson = () => download(`work-organizer-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db, null, 2), 'application/json');
  const exportCsv = () => {
    const name = (id: string) => db.profiles.find((p) => p.id === id)?.full_name ?? '';
    const tagName = (id: string) => db.tags.find((t) => t.id === id)?.name ?? '';
    const cols = ['number', 'title', 'status', 'priority', 'given_by', 'category', 'assignees', 'tags', 'do_date', 'deadline', 'follow_up_date', 'follow_up_with', 'notes', 'created_at', 'completed_at'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = tasks.map((t) => [t.number, t.title, t.status, t.priority, t.given_by, t.category, t.assignees.map(name).join('; '),
      t.tags.map(tagName).join('; '), t.do_date, t.deadline, t.follow_up_date, t.follow_up_with, t.notes, t.created_at, t.completed_at].map(esc).join(','));
    download(`tasks-${new Date().toISOString().slice(0, 10)}.csv`, [cols.join(','), ...rows].join('\n'), 'text/csv');
  };

  return (
    <div className="card-box">
      <h2>Storage & backup</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="row-gap" style={{ fontSize: 13 }}>
          <span>PDF storage</span>
          <span className="mono muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{used === null ? '…' : `${formatBytes(used)} of 1 GB`}</span>
        </div>
        <div className={`meter ${pct > 80 ? 'warn' : ''}`}><div style={{ width: `${pct}%` }} /></div>
        {pct > 80 && <span className="late" style={{ fontSize: 12.5 }}>Storage is getting full — delete old PDFs or ask to move files to a bigger free service.</span>}
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>The free plan has no automatic backups. Download a copy every now and then.</p>
      <div className="row-gap">
        <button className="btn" onClick={exportCsv}><IconDownload size={14} /> Tasks as CSV (Excel)</button>
        <button className="btn" onClick={exportJson}><IconDownload size={14} /> Everything as JSON</button>
      </div>
    </div>
  );
}

export function TeamPage() {
  const { people, meId, online, tasks, reload } = useData();
  const toast = useToast();
  const onlineIds = new Set(online.map((o) => o.userId));

  const removeMember = async (id: string, label: string) => {
    if (!confirm(`Remove ${label}? They can no longer log in. Their tasks stay.`)) return;
    try { await callApi('/api/remove-member', { user_id: id }); await reload('profiles'); toast.show(`${label} removed`); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="page" style={{ maxWidth: 920 }}>
      <div className="page-head">
        <h1>Team</h1>
        <span className="sub">{people.length} {people.length === 1 ? 'person' : 'people'} · everyone has the same rights</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Email</th><th>Open tasks</th><th>Joined</th><th /></tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar person={p} />{p.full_name || '—'}{p.id === meId && <span className="muted">(you)</span>}
                    {onlineIds.has(p.id) && <span className="dot" style={{ background: 'var(--ok)' }} title="Online" />}</span></td>
                  <td className="muted">{p.email}</td>
                  <td className="mono">{tasks.filter((t) => t.status !== 'Done' && t.assignees.includes(p.id)).length}</td>
                  <td className="muted">{timeAgo(p.created_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {p.id !== meId && <button className="btn ghost sm danger" onClick={() => removeMember(p.id, p.full_name || p.email)}>Remove</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AddMember />
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <Tags />
          <StorageAndExport />
        </div>
      </div>
    </div>
  );
}
