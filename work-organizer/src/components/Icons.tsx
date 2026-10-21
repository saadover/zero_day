import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: P) {
  return {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...rest,
  };
}

export const IconHome = (p: P) => <svg {...base(p)}><path d="M2.5 7 8 2.5 13.5 7v6.5h-4v-4h-3v4h-4z" /></svg>;
export const IconList = (p: P) => <svg {...base(p)}><path d="M5.5 4h8M5.5 8h8M5.5 12h8" /><circle cx="2.6" cy="4" r=".6" fill="currentColor" /><circle cx="2.6" cy="8" r=".6" fill="currentColor" /><circle cx="2.6" cy="12" r=".6" fill="currentColor" /></svg>;
export const IconBoard = (p: P) => <svg {...base(p)}><rect x="2" y="2.5" width="3.5" height="11" rx="1" /><rect x="6.5" y="2.5" width="3.5" height="7" rx="1" /><rect x="11" y="2.5" width="3" height="9" rx="1" /></svg>;
export const IconCalendar = (p: P) => <svg {...base(p)}><rect x="2" y="3" width="12" height="11" rx="1.5" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" /></svg>;
export const IconGrid = (p: P) => <svg {...base(p)}><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg>;
export const IconCheck = (p: P) => <svg {...base(p)}><path d="M3 8.5 6.5 12 13 4.5" /></svg>;
export const IconChecklist = (p: P) => <svg {...base(p)}><path d="m2.5 4 1.2 1.2L6 3M2.5 10l1.2 1.2L6 9M8.5 4.2h5M8.5 10.2h5" /></svg>;
export const IconNotes = (p: P) => <svg {...base(p)}><path d="M4 1.8h5.5L12.5 5v9.2H4z" /><path d="M9.5 1.8V5h3M6 8h4.5M6 10.8h4.5" /></svg>;
export const IconUsers = (p: P) => <svg {...base(p)}><circle cx="6" cy="5.5" r="2.3" /><path d="M1.8 13.5c.5-2.3 2.2-3.6 4.2-3.6s3.7 1.3 4.2 3.6M10.5 3.4a2.2 2.2 0 0 1 0 4.2M12 9.9c1.2.5 2 1.7 2.3 3.6" /></svg>;
export const IconSettings = (p: P) => <svg {...base(p)}><circle cx="8" cy="8" r="2" /><path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" /></svg>;
export const IconBell = (p: P) => <svg {...base(p)}><path d="M4 11V7a4 4 0 0 1 8 0v4l1.2 1.5H2.8zM6.5 14h3" /></svg>;
export const IconSearch = (p: P) => <svg {...base(p)}><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.5 3.5" /></svg>;
export const IconPlus = (p: P) => <svg {...base(p)}><path d="M8 3v10M3 8h10" /></svg>;
export const IconX = (p: P) => <svg {...base(p)}><path d="m4 4 8 8M12 4l-8 8" /></svg>;
export const IconMore = (p: P) => <svg {...base(p)}><circle cx="3.5" cy="8" r=".9" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r=".9" fill="currentColor" stroke="none" /><circle cx="12.5" cy="8" r=".9" fill="currentColor" stroke="none" /></svg>;
export const IconTrash = (p: P) => <svg {...base(p)}><path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4" /></svg>;
export const IconCopy = (p: P) => <svg {...base(p)}><rect x="5" y="5" width="8.5" height="8.5" rx="1.5" /><path d="M11 5V3.5A1 1 0 0 0 10 2.5H3.5a1 1 0 0 0-1 1V10a1 1 0 0 0 1 1H5" /></svg>;
export const IconLink = (p: P) => <svg {...base(p)}><path d="M6.8 9.2a2.5 2.5 0 0 0 3.6 0l2.2-2.2a2.5 2.5 0 0 0-3.6-3.6l-.6.6M9.2 6.8a2.5 2.5 0 0 0-3.6 0L3.4 9a2.5 2.5 0 0 0 3.6 3.6l.6-.6" /></svg>;
export const IconPaperclip = (p: P) => <svg {...base(p)}><path d="m13 7.5-5.3 5.3a3.2 3.2 0 0 1-4.5-4.5L8.8 2.7a2.1 2.1 0 0 1 3 3L6.3 11.2a1 1 0 0 1-1.5-1.5L9.5 5" /></svg>;
export const IconMenu = (p: P) => <svg {...base(p)}><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" /></svg>;
export const IconChevronLeft = (p: P) => <svg {...base(p)}><path d="M10 3.5 5.5 8l4.5 4.5" /></svg>;
export const IconChevronRight = (p: P) => <svg {...base(p)}><path d="M6 3.5 10.5 8 6 12.5" /></svg>;
export const IconChevronDown = (p: P) => <svg {...base(p)}><path d="M4 6.5 8 10.5l4-4" /></svg>;
export const IconArrowRight = (p: P) => <svg {...base(p)}><path d="M3 8h10M9 4l4 4-4 4" /></svg>;
export const IconLock = (p: P) => <svg {...base(p)}><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>;
export const IconClock = (p: P) => <svg {...base(p)}><circle cx="8" cy="8" r="5.75" /><path d="M8 4.75V8l2.25 1.5" /></svg>;
export const IconDownload = (p: P) => <svg {...base(p)}><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg>;
export const IconLogout = (p: P) => <svg {...base(p)}><path d="M6 2.5H3.5v11H6M10 5l3 3-3 3M13 8H6.5" /></svg>;
export const IconSun = (p: P) => <svg {...base(p)}><circle cx="8" cy="8" r="2.8" /><path d="M8 1.5v1.3M8 13.2v1.3M14.5 8h-1.3M2.8 8H1.5M12.6 3.4l-.9.9M4.3 11.7l-.9.9M12.6 12.6l-.9-.9M4.3 4.3l-.9-.9" /></svg>;
export const IconMoon = (p: P) => <svg {...base(p)}><path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" /></svg>;
export const IconFlag = (p: P) => <svg {...base(p)}><path d="M3.5 14V2.5M3.5 3h8l-1.5 3 1.5 3h-8" /></svg>;
export const IconBlock = (p: P) => <svg {...base(p)}><circle cx="8" cy="8" r="5.5" /><path d="m4.2 11.8 7.6-7.6" /></svg>;

/** Status: empty circle / half / dashed / filled check. */
export function StatusIcon({ status, size = 14 }: { status: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 14 14', 'aria-hidden': true as const };
  if (status === 'In progress')
    return <svg {...common}><circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--soon)" strokeWidth="1.5" /><path d="M7 3.5a3.5 3.5 0 0 1 0 7z" fill="var(--soon)" /></svg>;
  if (status === 'Waiting on someone')
    return <svg {...common}><circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="2.2 2" /></svg>;
  if (status === 'Done')
    return <svg {...common}><circle cx="7" cy="7" r="6.2" fill="var(--ok)" /><path d="m4.4 7.2 1.8 1.8 3.5-3.7" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg {...common}><circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--icon)" strokeWidth="1.5" /></svg>;
}

/** Priority as 1–3 bars. */
export function PriorityIcon({ priority, size = 14 }: { priority: string; size?: number }) {
  const o2 = priority === 'Low' ? 0.22 : 1;
  const o3 = priority === 'High' ? 1 : 0.22;
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" role="img" aria-label={`${priority} priority`}>
      <rect x="1" y="8" width="3" height="5" rx="1" fill="var(--text-2)" />
      <rect x="5.5" y="5" width="3" height="8" rx="1" fill="var(--text-2)" opacity={o2} />
      <rect x="10" y="2" width="3" height="11" rx="1" fill="var(--text-2)" opacity={o3} />
    </svg>
  );
}
