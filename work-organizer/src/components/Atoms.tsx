import type { Profile, Tag } from '../lib/types';

export function initials(p: Pick<Profile, 'full_name' | 'email'> | undefined | null): string {
  if (!p) return '?';
  const parts = (p.full_name || p.email).trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function firstName(p: Profile | undefined | null): string {
  if (!p) return 'Someone';
  return (p.full_name || p.email).split(/\s+/)[0];
}

export function Avatar({ person, size }: { person: Profile | undefined; size?: 'lg' }) {
  return (
    <span className={`av ${size ?? ''}`} style={{ background: person?.color ?? '#8E8E89' }} title={person?.full_name || person?.email}>
      {initials(person)}
    </span>
  );
}

export function Avatars({ ids, byId, max = 3 }: { ids: string[]; byId: Map<string, Profile>; max?: number }) {
  if (!ids.length) return null;
  const shown = ids.slice(0, max);
  return (
    <span className="avs">
      {shown.map((id) => <Avatar key={id} person={byId.get(id)} />)}
      {ids.length > max && <span className="av" style={{ background: 'var(--icon)' }}>+{ids.length - max}</span>}
    </span>
  );
}

export function TagChip({ tag }: { tag: Tag }) {
  return (
    <span className="tag" style={{ color: `var(--tag-${tag.color})`, background: `var(--tag-${tag.color}-bg)` }}>
      {tag.name}
    </span>
  );
}

export function tagDot(color: string) {
  return <span className="dot" style={{ background: `var(--tag-${color})` }} />;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
