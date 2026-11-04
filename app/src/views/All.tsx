/* 전체 메뉴 · 관리자(가입 승인, 게시판 설정) · 알림 목록 */
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { api, post } from '../lib/api';
import { useLoad } from '../lib/hooks';
import { back, go, loadData, me, refresh, setBadges, setTheme, useColors, useStore } from '../lib/store';
import { tone } from '../lib/theme';
import { ago, roleLabel } from '../lib/util';
import { Icon } from '../ui/Icon';
import { Avatar, Btn, Card, CardH, Count, Divided, DocIc, Empty, ErrorView, Field, Grow, Input, ListItem, Loading, More, PageH, Press, Row, Seg, Select, St, Sub, SwitchRow, T, Tag } from '../ui/kit';
import { ask, sheet, toast } from '../ui/overlay';
import { Page, Skeleton } from '../ui/Page';
import { SubHeader } from './Board';
import { confirmLogout } from './Me';

// ==================================================================
// 전체
// ==================================================================
export function AllView() {
  const c = useColors();
  const b = useStore((s) => s.badges);
  const m = useStore((s) => s.data.me);
  const theme = useStore((s) => s.theme);
  const grid = (title: string, items: [string, string, string, () => any, number?][]) => (
    <Card>
      <CardH title={title} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {items.map(([n, i, t, fn, cnt]) => {
          const [fg, bg] = tone(c, t);
          return (
            <View key={n} style={{ width: '33.33%', padding: 2 }}>
              <Press onPress={fn} style={{ alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 }} pressedStyle={{ backgroundColor: c.surface2 }}>
                <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
                  <Icon name={i} color={fg} />
                  {cnt ? <Count n={cnt} style={{ position: 'absolute', top: -4, right: -6 }} /> : null}
                </View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.ink }}>{n}</Text>
              </Press>
            </View>
          );
        })}
      </View>
    </Card>
  );
  return (
    <Page>
      <Card>
        <Press onPress={() => go('ws/me')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar m={m} size={58} />
          <Grow>
            <T style={{ fontSize: 19, fontWeight: '800' }}>{m.name}</T>
            <Sub style={{ fontSize: 14, marginTop: 2 }}>
              {roleLabel(m)}
              {m.is_admin ? ' · 관리자' : ''}
            </Sub>
          </Grow>
          <Icon name="chevR" size={18} color={c.ink} />
        </Press>
      </Card>
      {grid('워크스페이스', [
        ['업무', 'checkSq', 'c-primary', () => go('ws/task'), b.task],
        ['근태', 'calendar', 'c-cyan', () => go('ws/att')],
        ['서류·결재', 'file', 'c-ok', () => go('ws/doc'), b.approval],
        ['공지', 'megaphone', 'c-warn', () => go('ws/notice'), b.notice],
        ['내 정보', 'user', 'c-leave', () => go('ws/me')],
      ])}
      {grid('커뮤니티', [
        ['게시판', 'board', 'c-warn', () => go('cm/board')],
        ['채널', 'hash', 'c-cyan', () => go('cm/chan'), b.channel],
        ['임직원', 'users', 'c-pink', () => go('cm/people')],
        ['DM', 'message', 'c-primary', () => go('dm'), b.dm],
      ])}
      {grid('기타', [
        [theme === 'dark' ? '밝은 화면' : '어두운 화면', theme === 'dark' ? 'sun' : 'moon', 'c-gray', () => setTheme(theme === 'dark' ? 'light' : 'dark')],
        ...((m.is_admin ? [['관리자', 'shield', 'c-leave', () => go('admin/members'), b.pending]] : []) as any),
        ['로그아웃', 'logout', 'c-danger', confirmLogout],
      ])}
    </Page>
  );
}

// ==================================================================
// 관리자 (전체 화면)
// ==================================================================
const ST: Record<string, [string, string]> = { pending: ['wait', '승인 대기'], active: ['ok', '활성'], disabled: ['off', '중지됨'] };

export function AdminScreen({ sub: sub0 }: { sub: string }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const m = me();
  const [sub, setSub] = useState(sub0 === 'boards' ? 'boards' : 'members');
  const q = useLoad(m.is_admin ? `admin:${sub}` : null, () => api(sub === 'boards' ? 'admin.boards' : 'admin.members'));
  return (
    <View style={{ flex: 1, backgroundColor: c.surface2 }}>
      <SubHeader onBack={() => back('all')} title="관리자" />
      {!m.is_admin ? (
        <Empty style={{ paddingVertical: 60 }}>관리자만 볼 수 있어요</Empty>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 + insets.bottom }}>
          <PageH
            title="관리자"
            sub="가입 승인과 게시판 설정"
            right={
              <Seg
                options={[
                  ['members', '회원'],
                  ['boards', '게시판'],
                ]}
                value={sub}
                onChange={(v) => {
                  setSub(v);
                  router.setParams({ sub: v });
                }}
              />
            }
          />
          {!q.data ? (
            q.error ? (
              <ErrorView message={q.error} onRetry={q.reload} />
            ) : (
              <Skeleton />
            )
          ) : (
            // 회원 ↔ 게시판을 바꾸는 동안은 이전 내용을 흐리게
            <View style={q.stale ? { opacity: 0.5 } : null}>
              {q.data.members && sub === 'members' ? <Members list={q.data.members} /> : q.data.boards && sub === 'boards' ? <Boards boards={q.data.boards} /> : <Skeleton />}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Members({ list }: { list: any[] }) {
  return (
    <>
      {(['pending', 'active', 'disabled'] as const).map((s) => {
        const l = list.filter((m) => m.status === s);
        if (!l.length && s !== 'pending') return null;
        return (
          <Card key={s}>
            <CardH title={ST[s][1]} right={<Sub>{l.length}명</Sub>} />
            {l.length ? (
              <Divided>
                {l.map((m) => (
                  <ListItem key={m.id}>
                    <Avatar m={m} />
                    <Grow>
                      <Row gap={4} style={{ flexWrap: 'wrap' }}>
                        <T style={{ fontWeight: '600' }}>{m.name}</T>
                        {m.is_admin ? <Tag kind="leave">관리자</Tag> : null}
                        {m.role === 'ceo' ? <Tag kind="primary">대표</Tag> : null}
                      </Row>
                      <Sub lines={1}>
                        {m.username} · {m.email}
                      </Sub>
                      <Sub>
                        가입 {ago(m.created_ts)}
                        {m.seen_ts ? ' · 최근 접속 ' + ago(m.seen_ts) : ''}
                      </Sub>
                    </Grow>
                    <Btn sm kind="ghost" title="관리" onPress={() => sheet.show(m.name, <MemberAct m={m} />)} />
                  </ListItem>
                ))}
              </Divided>
            ) : (
              <Empty>승인을 기다리는 사람이 없어요</Empty>
            )}
          </Card>
        );
      })}
    </>
  );
}

const ADMIN_MSG: Record<string, string> = { approve: '승인했어요', enable: '다시 이용할 수 있게 했어요', disable: '이용을 중지했어요', make_admin: '관리자로 지정했어요', revoke_admin: '관리자 권한을 해제했어요' };
function MemberAct({ m }: { m: any }) {
  const self = m.id === me().id;
  const run = async (a: string) => {
    if (['disable', 'revoke_admin'].includes(a) && !(await ask({ title: '확인', body: a === 'disable' ? '이 회원이 더 이상 로그인할 수 없게 돼요. 계속할까요?' : '관리자 권한을 해제할까요?', ok: '계속', danger: true })))
      return;
    await post('admin.member', { user_id: m.id, action: a });
    sheet.close();
    toast(ADMIN_MSG[a]);
    await loadData();
    refresh();
  };
  const btn = (a: string, label: string, kind: 'primary' | 'ghost' | 'danger' = 'ghost') => (
    <View key={a} style={{ marginBottom: 8 }}>
      <Btn kind={kind} title={label} onPress={() => run(a)} />
    </View>
  );
  const acts: React.ReactNode[] = [];
  if (m.status === 'pending') acts.push(btn('approve', '승인하기', 'primary'), btn('disable', '거절하기', 'danger'));
  else if (m.status === 'active' && !self && m.role !== 'ceo') acts.push(btn('disable', '이용 중지', 'danger'));
  else if (m.status === 'disabled') acts.push(btn('enable', '다시 이용하게 하기', 'primary'));
  if (m.status === 'active' && !self) acts.push(m.is_admin ? btn('revoke_admin', '관리자 권한 해제') : btn('make_admin', '관리자로 지정'));
  return (
    <View>
      <View style={{ alignItems: 'center', gap: 4, paddingBottom: 18 }}>
        <View style={{ marginBottom: 6 }}>
          <Avatar m={m} size={72} />
        </View>
        <T style={{ fontSize: 20, fontWeight: '800' }}>{m.name}</T>
        <Sub style={{ fontSize: 14 }}>
          {m.username} · {m.email}
        </Sub>
        <St kind={ST[m.status][0]}>{ST[m.status][1]}</St>
      </View>
      {acts.length ? acts : <Sub>바꿀 수 있는 항목이 없어요.</Sub>}
      {m.status === 'pending' ? <Sub style={{ marginTop: 6 }}>승인하면 공개 채널에 자동으로 들어가요. 팀과 직책은 대표가 임직원 화면에서 정해요.</Sub> : null}
    </View>
  );
}

function Boards({ boards }: { boards: any[] }) {
  return (
    <>
      <Card>
        <CardH title="게시판" right={<More title="새 게시판" icon="plus" onPress={() => sheet.show('새 게시판', <BoardEdit b={null} />)} />} />
        <Divided>
          {boards.map((b) => (
            <ListItem key={b.id} onPress={() => sheet.show('게시판 설정', <BoardEdit b={b} />)}>
              <DocIc icon={b.anonymous ? 'eye' : 'board'} t={b.anonymous ? 'c-leave' : 'c-primary'} />
              <Grow>
                <Row gap={4}>
                  <T style={{ fontWeight: '600' }}>{b.name}</T>
                  {b.visible ? null : <Tag>숨김</Tag>}
                </Row>
                <Sub>
                  {b.anonymous ? '익명' : '실명'} · 글 {b.post_count}개{b.write_role === 'admin' ? ' · 관리자만 글쓰기' : ''}
                </Sub>
              </Grow>
              <Icon name="chevR" size={18} />
            </ListItem>
          ))}
        </Divided>
      </Card>
      <Sub style={{ paddingHorizontal: 4, lineHeight: 22 }}>익명/실명을 바꾸면 새 글부터 적용돼요. 예전 익명 글의 작성자는 바꾼 뒤에도 드러나지 않아요.</Sub>
    </>
  );
}

function BoardEdit({ b }: { b: any | null }) {
  const [f, setF] = useState({
    name: b ? b.name : '',
    description: b ? b.description || '' : '',
    write_role: b ? b.write_role : 'user',
    anonymous: b ? !!b.anonymous : false,
    allow_comments: b ? !!b.allow_comments : true,
    allow_attachments: b ? !!b.allow_attachments : true,
    visible: b ? !!b.visible : true,
  });
  const set = (k: string) => (v: any) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) throw new Error('이름을 입력해 주세요.');
    await post('admin.board', b ? { id: b.id, ...f } : f);
    sheet.close();
    toast(b ? '게시판 설정을 저장했어요' : '게시판을 만들었어요');
    await loadData();
    refresh();
  };
  return (
    <View>
      <Field label="이름">
        <Input value={f.name} onChangeText={set('name')} maxLength={50} />
      </Field>
      <Field label="설명 (선택)">
        <Input value={f.description} onChangeText={set('description')} maxLength={255} />
      </Field>
      <Field label="글쓰기">
        <Select
          value={f.write_role}
          onChange={set('write_role')}
          options={[
            { value: 'user', label: '모든 직원' },
            { value: 'admin', label: '관리자만' },
          ]}
        />
      </Field>
      <Divided>
        <SwitchRow title="익명 게시판" sub="글과 댓글에 이름이 보이지 않아요 (새 글부터 적용)" value={f.anonymous} onChange={set('anonymous')} />
        <SwitchRow title="댓글 허용" sub="글에 댓글을 달 수 있어요" value={f.allow_comments} onChange={set('allow_comments')} />
        <SwitchRow title="파일 첨부 허용" sub="사진, 문서를 올릴 수 있어요" value={f.allow_attachments} onChange={set('allow_attachments')} />
        <SwitchRow title="게시판 보이기" sub="끄면 직원들에게 보이지 않아요" value={f.visible} onChange={set('visible')} />
      </Divided>
      <View style={{ height: 14 }} />
      <Btn title={b ? '저장' : '만들기'} onPress={save} />
    </View>
  );
}

// ==================================================================
// 알림 목록 (상단 종)
// ==================================================================
const NOTI_IC: Record<string, [string, string]> = {
  task: ['checkSq', 'c-primary'],
  review: ['checkSq', 'c-leave'],
  approval: ['file', 'c-ok'],
  notice: ['megaphone', 'c-warn'],
  comment: ['comment', 'c-cyan'],
  org: ['user', 'c-leave'],
  pay: ['card', 'c-ok'],
  deadline: ['flag', 'c-danger'],
};
export async function openNoti() {
  sheet.show('알림', <Loading />);
  try {
    const d = await api('noti.list');
    if (!sheet.open) return;
    sheet.show('알림', <NotiList items={d.items} />);
    if (d.items.some((n: any) => !n.read)) {
      const r = await post('noti.read');
      setBadges(r.badges);
    }
  } catch (e: any) {
    sheet.close();
    toast(e.message);
  }
}
function NotiList({ items }: { items: any[] }) {
  const c = useColors();
  if (!items.length) return <Empty>새 알림이 없어요</Empty>;
  return (
    <Divided>
      {items.map((n, i) => {
        const [ic, t] = NOTI_IC[n.kind] || ['bell', 'c-gray'];
        return (
          <Press key={i} onPress={n.link ? () => go(n.link.replace(/^\//, '')) : undefined} style={{ flexDirection: 'row', gap: 12, paddingVertical: 14 }}>
            <DocIc icon={ic} t={t} />
            <Grow>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.ink, paddingRight: 14 }}>{n.title}</Text>
              <Sub style={{ marginTop: 2 }}>
                {n.body || ''}
                {n.body ? ' · ' : ''}
                {ago(n.ts)}
              </Sub>
            </Grow>
            {!n.read ? <View style={{ position: 'absolute', right: 0, top: 20, width: 7, height: 7, borderRadius: 4, backgroundColor: c.danger }} /> : null}
          </Press>
        );
      })}
    </Divided>
  );
}
