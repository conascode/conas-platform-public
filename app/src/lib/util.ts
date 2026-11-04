/* 글자 · 날짜 도우미 (웹 spa-core.js 와 같은 규칙) */

export const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toDate = (s: string) => {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => toDate(iso(new Date()));
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const md = (d: Date | string) => {
  const x = typeof d === 'string' ? toDate(d) : d;
  return `${x.getMonth() + 1}월 ${x.getDate()}일 (${DOW[x.getDay()]})`;
};
export const ddayLabel = (n: number) => (n < 0 ? `D+${-n}` : n === 0 ? 'D-Day' : `D-${n}`);
export const ddayCls = (n: number, done?: boolean) => (done ? 'off' : n < 0 ? 'no' : n === 0 ? 'late' : n <= 3 ? 'pri' : 'off');
export const hm = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const ago = (ts: number) => {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60) return '방금';
  if (s < 3600) return Math.floor(s / 60) + '분 전';
  const d = new Date(ts * 1000);
  if (iso(d) === iso(new Date())) return Math.floor(s / 3600) + '시간 전';
  if (iso(d) === iso(addDays(new Date(), -1))) return '어제';
  return d.getFullYear() === new Date().getFullYear() ? `${d.getMonth() + 1}.${d.getDate()}` : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
};
/** 1234567 → 1,234,567원 (기기 언어 설정과 상관없이 같은 모양) */
export const won = (n: any) => String(Math.round(Number(n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원';

export const ROLE: Record<string, string> = { ceo: '대표', lead: '팀장', member: '팀원' };
/** 예: '프로덕트팀 · 팀장', '프로덕트팀 · 사원', '대표' */
export const roleLabel = (m: any) => {
  if (!m) return '';
  if (m.role === 'ceo') return '대표';
  const team = m.team || '소속 없음';
  return `${team} · ${m.role === 'lead' ? '팀장' : m.position || '팀원'}`;
};

const AV_COLORS = ['#2f5bea', '#7b3ff2', '#0ca678', '#f08c00', '#e64980', '#1098ad', '#495057'];
export const avatarColor = (name: string) => AV_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];

/** 글을 일반 글자와 주소(링크)로 나누기 */
export function splitLinks(s: string): { t: string; url?: string }[] {
  const out: { t: string; url?: string }[] = [];
  const re = /\bhttps?:\/\/[^\s<]+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const str = String(s ?? '');
  while ((m = re.exec(str))) {
    const raw = m[0];
    const u = raw.replace(/[.,);!?]+$/, '');
    if (m.index > last) out.push({ t: str.slice(last, m.index) });
    out.push({ t: u, url: u });
    last = m.index + u.length;
    re.lastIndex = last;
  }
  if (last < str.length) out.push({ t: str.slice(last) });
  return out;
}

export const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
