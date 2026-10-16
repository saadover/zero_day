import type { ReactNode } from 'react';
import type { DateField, DateRange, Filters, GroupKey, SortKey } from '../lib/tasks';
import { DATE_FIELD_LABELS, DEFAULT_FILTERS, GROUP_LABELS, RANGE_LABELS, SORT_LABELS } from '../lib/tasks';
import { CATEGORIES, GIVEN_BY, PRIORITIES, STATUSES } from '../lib/types';
import { useData } from '../store/data';
import { Avatar, tagDot } from './Atoms';
import { IconSearch, PriorityIcon, StatusIcon } from './Icons';
import { SelectMenu, useAnchor, type Option } from './Popover';

function Pill<T extends string>({ label, value, options, onPick, isSet, search }: {
  label: string; value: T; options: Option<T>[]; onPick: (v: T) => void; isSet: boolean; search?: boolean;
}) {
  const m = useAnchor();
  const current = options.find((o) => o.value === value);
  return (
    <>
      <button className={`pill ${isSet ? 'set' : ''}`} onClick={m.open} aria-haspopup="listbox">
        {label} <b>{current?.label ?? value}</b>
      </button>
      {m.anchor && <SelectMenu<T> anchor={m.anchor} onClose={m.close} options={options} value={value} onPick={onPick} search={search} />}
    </>
  );
}

export function FilterBar({ f, set, defaults, hide = [], extra }: {
  f: Filters; set: (f: Filters) => void; defaults: Filters; hide?: (keyof Filters)[]; extra?: ReactNode;
}) {
  const { people, meId, db } = useData();
  const patch = (p: Partial<Filters>) => set({ ...f, ...p });
  const differs = (k: keyof Filters) => f[k] !== DEFAULT_FILTERS[k];
  const changed = (Object.keys(f) as (keyof Filters)[]).some((k) => f[k] !== defaults[k]);
  const show = (k: keyof Filters) => !hide.includes(k);

  return (
    <div className="filters">
      <label className="pill" style={{ cursor: 'text', paddingRight: 4 }}>
        <IconSearch size={13} />
        <span className="sr-only">Search</span>
        <input value={f.q} onChange={(e) => patch({ q: e.target.value })} placeholder="Search"
          style={{ border: 0, outline: 'none', background: 'transparent', width: 110, fontSize: 12.5 }} />
      </label>

      {show('range') && (
        <>
          <Pill<DateField> label="Date" value={f.dateField} isSet={f.range !== 'any'}
            options={(Object.keys(DATE_FIELD_LABELS) as DateField[]).map((k) => ({ value: k, label: DATE_FIELD_LABELS[k] }))}
            onPick={(v) => patch({ dateField: v })} />
          <Pill<DateRange> label="Range" value={f.range} isSet={differs('range')}
            options={(Object.keys(RANGE_LABELS) as DateRange[]).map((k) => ({ value: k, label: RANGE_LABELS[k] }))}
            onPick={(v) => patch({ range: v })} />
          {f.range === 'custom' && (
            <span className="pill set" style={{ gap: 4 }}>
              <input type="date" aria-label="From" value={f.from} onChange={(e) => patch({ from: e.target.value })} style={{ border: 0, background: 'transparent', fontSize: 12 }} />
              –
              <input type="date" aria-label="To" value={f.to} onChange={(e) => patch({ to: e.target.value })} style={{ border: 0, background: 'transparent', fontSize: 12 }} />
            </span>
          )}
        </>
      )}

      {show('person') && (
        <Pill label="Person" value={f.person} isSet={differs('person')} search
          options={[
            { value: 'any', label: 'Anyone' }, { value: 'me', label: 'Me' }, { value: 'none', label: 'Nobody (unassigned)' },
            ...people.filter((p) => p.id !== meId).map((p) => ({ value: p.id, label: p.full_name || p.email, icon: <Avatar person={p} /> })),
          ]}
          onPick={(v) => patch({ person: v })} />
      )}
      {show('priority') && (
        <Pill label="Priority" value={f.priority} isSet={differs('priority')}
          options={[{ value: 'any', label: 'Any' }, ...PRIORITIES.map((p) => ({ value: p, label: p, icon: <PriorityIcon priority={p} /> }))]}
          onPick={(v) => patch({ priority: v })} />
      )}
      {show('category') && (
        <Pill label="Category" value={f.category} isSet={differs('category')}
          options={[{ value: 'any', label: 'Any' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
          onPick={(v) => patch({ category: v })} />
      )}
      {show('tag') && db.tags.length > 0 && (
        <Pill label="Tag" value={f.tag} isSet={differs('tag')} search
          options={[{ value: 'any', label: 'Any' }, ...db.tags.map((t) => ({ value: t.id, label: t.name, icon: tagDot(t.color) }))]}
          onPick={(v) => patch({ tag: v })} />
      )}
      {show('givenBy') && (
        <Pill label="Given by" value={f.givenBy} isSet={differs('givenBy')}
          options={[{ value: 'any', label: 'Anyone' }, ...GIVEN_BY.map((g) => ({ value: g, label: g }))]}
          onPick={(v) => patch({ givenBy: v })} />
      )}
      {show('status') && (
        <Pill label="Status" value={f.status} isSet={differs('status')}
          options={[
            { value: 'open', label: 'Not done' }, { value: 'all', label: 'Any' },
            ...STATUSES.map((s) => ({ value: s, label: s, icon: <StatusIcon status={s} /> })),
          ]}
          onPick={(v) => patch({ status: v })} />
      )}
      {show('sort') && (
        <Pill<SortKey> label="Sort" value={f.sort} isSet={false}
          options={(Object.keys(SORT_LABELS) as SortKey[]).map((k) => ({ value: k, label: SORT_LABELS[k] }))}
          onPick={(v) => patch({ sort: v })} />
      )}
      {show('group') && (
        <Pill<GroupKey> label="Group" value={f.group} isSet={false}
          options={(Object.keys(GROUP_LABELS) as GroupKey[]).map((k) => ({ value: k, label: GROUP_LABELS[k] }))}
          onPick={(v) => patch({ group: v })} />
      )}
      {extra}
      {changed && <button className="clear" onClick={() => set(defaults)}>Reset</button>}
    </div>
  );
}
