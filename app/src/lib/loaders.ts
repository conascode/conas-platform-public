/*
 * 화면별로 받는 데이터 (기억 이름 + 받는 방법)
 * 화면과 '미리 받기'가 같은 이름을 써야 미리 받은 데이터를 화면이 바로 씀
 */
import { api, legacy } from './api';
import { cacheGet, prefetch } from './hooks';
import { getState } from './store';
import { monthKey, today } from './util';

export const L = {
  home: () => ['home', () => api('home')] as const,
  tasks: (view: string) => [`tasks:${view}`, () => api('tasks', { view })] as const,
  project: (id: number) => [`project:${id}`, () => api('project', { id })] as const,
  att: (month: string) => [`att:${month}`, () => api('att', { month })] as const,
  approvals: () => ['approvals', () => api('approvals')] as const,
  notices: () => ['notices', () => api('notices')] as const,
  pay: () => ['pay', () => api('pay')] as const,
  posts: (boardId: number) => [`posts:${boardId}`, () => api('posts', { board_id: boardId })] as const,
  chats: () => ['chats', () => api('chats')] as const,
  chatInfo: (c: number) => [`chat.info:${c}`, () => api('chat.info', { c })] as const,
  chatMsgs: (c: number) => [`chat.msgs:${c}`, () => legacy('messages.php', { c })] as const,
};

const pre = (x: readonly [string, () => Promise<any>]) => prefetch(x[0], x[1]);

/** 하단바 화면 하나의 데이터를 미리 받기 (주소: 'ws/task', 'cm/board' …) */
export function prefetchPath(path: string) {
  const [a, b] = path.split('/');
  const boards: any[] = (getState().data && getState().data.boards) || [];
  if (a === 'home') pre(L.home());
  else if (a === 'dm' || (a === 'cm' && b === 'chan')) pre(L.chats());
  else if (a === 'ws') {
    if (!b || b === 'task') pre(L.tasks('mine'));
    else if (b === 'att') pre(L.att(monthKey(today())));
    else if (b === 'doc') pre(L.approvals());
    else if (b === 'notice') pre(L.notices());
    else if (b === 'me') pre(L.pay());
  } else if (a === 'cm' && (!b || b === 'board')) boards.forEach((x) => pre(L.posts(x.id)));
}

/** 대화방을 누르기 시작할 때 미리 받기 */
export function prefetchChat(c: number) {
  pre(L.chatInfo(c));
  pre(L.chatMsgs(c));
}

/** 앱이 켜진 뒤 주요 화면을 차례로 미리 받기 (한꺼번에 몰리지 않게 조금씩) */
export function prefetchAll() {
  const list = ['home', 'ws/task', 'ws/notice', 'dm', 'cm/board', 'ws/doc', 'ws/att', 'ws/me'];
  list.forEach((p, i) => setTimeout(() => prefetchPath(p), 300 + i * 250));
  // 대화 목록을 받은 뒤, 위쪽 대화방 몇 개는 메시지까지 미리 받아둠 (열면 바로 보이게)
  setTimeout(() => {
    const l = cacheGet('chats');
    if (!l) return;
    const top = [...l.dms.slice(0, 4), ...l.channels.filter((x: any) => x.joined).slice(0, 2)];
    top.forEach((x: any, i: number) => setTimeout(() => prefetchChat(x.id), i * 200));
  }, 3500);
}
