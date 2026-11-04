/* 여러 화면에서 같이 쓰는 동작 (화면 파일끼리 서로 불러오지 않도록 여기에 둠) */
import { post } from './api';
import { go, rememberConv } from './store';

/** 이 사람과의 1:1 대화방을 열기 (없으면 만듦) */
export async function startDm(uid: number) {
  const r = await post('chat.dm', { user_id: uid });
  rememberConv(r.c, 'dm');
  go('chat/' + r.c);
}
