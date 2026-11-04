/* 색 (웹 spa.css 의 :root 값과 같음). 기본은 밝은 화면 */

export const LIGHT = {
  canvas: '#e9ecf0',
  surface: '#ffffff',
  surface2: '#f2f4f6',
  surface3: '#f7f8fa',
  ink: '#191f28',
  ink2: '#333d4b',
  sub: '#8b95a1',
  faint: '#b0b8c1',
  line: '#e5e8eb',
  line2: '#d1d6db',
  primary: '#2f5bea',
  primarySoft: '#eaf0ff',
  onPrimary: '#ffffff',
  ok: '#12b886',
  okSoft: '#e6fcf5',
  warn: '#f08c00',
  warnSoft: '#fff4e6',
  danger: '#f04452',
  dangerSoft: '#fff0f1',
  leave: '#7b3ff2',
  leaveSoft: '#f3edff',
  cyan: '#1098ad',
  cyanSoft: '#e3fafc',
  pink: '#e64980',
  pinkSoft: '#fff0f6',
  chatBg: '#e8ecf2',
  bubble: '#ffffff',
  backdrop: 'rgba(15,18,24,0.45)',
  toastBg: 'rgba(25,31,40,0.94)',
  toastInk: '#ffffff',
  dark: false,
};

export type Colors = typeof LIGHT;

export const DARK: Colors = {
  canvas: '#08090b',
  surface: '#17191d',
  surface2: '#202328',
  surface3: '#1c1f24',
  ink: '#eef0f3',
  ink2: '#c9cfd6',
  sub: '#8b95a1',
  faint: '#5e6670',
  line: '#2a2e34',
  line2: '#3a3f46',
  primary: '#5b7cff',
  primarySoft: 'rgba(91,124,255,0.16)',
  onPrimary: '#ffffff',
  ok: '#20c997',
  okSoft: 'rgba(32,201,151,0.14)',
  warn: '#ffa94d',
  warnSoft: 'rgba(255,169,77,0.14)',
  danger: '#ff6b76',
  dangerSoft: 'rgba(255,107,118,0.14)',
  leave: '#a47bff',
  leaveSoft: 'rgba(164,123,255,0.16)',
  cyan: '#3bc9db',
  cyanSoft: 'rgba(59,201,219,0.14)',
  pink: '#f783ac',
  pinkSoft: 'rgba(247,131,172,0.14)',
  chatBg: '#101215',
  bubble: '#23262c',
  backdrop: 'rgba(0,0,0,0.6)',
  toastBg: '#e9ecef',
  toastInk: '#191f28',
  dark: true,
};

/** 아이콘 상자 색 (c-primary, c-ok …) → [글자색, 배경색] */
export const tone = (c: Colors, name: string): [string, string] => {
  switch (name.replace(/^c-/, '')) {
    case 'primary':
      return [c.primary, c.primarySoft];
    case 'ok':
      return [c.ok, c.okSoft];
    case 'warn':
      return [c.warn, c.warnSoft];
    case 'danger':
      return [c.danger, c.dangerSoft];
    case 'leave':
      return [c.leave, c.leaveSoft];
    case 'cyan':
      return [c.cyan, c.cyanSoft];
    case 'pink':
      return [c.pink, c.pinkSoft];
    default:
      return [c.ink2, c.surface2];
  }
};

/** 상태 칩 (.st.ok, .st.late …) → [글자색, 배경색] */
export const stTone = (c: Colors, kind: string): [string, string] => {
  switch (kind) {
    case 'ok':
      return [c.ok, c.okSoft];
    case 'late':
    case 'wait':
      return [c.warn, c.warnSoft];
    case 'leave':
    case 'rv':
    case 'half':
      return [c.leave, c.leaveSoft];
    case 'no':
      return [c.danger, c.dangerSoft];
    case 'pri':
      return [c.primary, c.primarySoft];
    default:
      return [c.sub, c.surface2];
  }
};

/** 점 색 (근태 달력, 일정 막대) */
export const dotColor = (c: Colors, kind: string) =>
  ({ ok: c.ok, late: c.warn, leave: c.leave, half: c.leave, no: c.danger, warn: c.warn, danger: c.danger, primary: c.primary } as Record<string, string>)[kind] || c.primary;
