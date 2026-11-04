/*
 * 워크스페이스 > 업무 · 프로젝트
 *  - 업무 탭: 검토 요청, 내 할 일(지연/오늘/이번 주/나중에), 프로젝트 카드, 회사 마감
 *  - 프로젝트 화면: 위쪽 단계 줄(옆으로 밀기, 현재 단계가 가운데), 단계별 업무
 *  - 업무는 프로젝트의 특정 단계에 추가할 수 있음
 */
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, post } from '../lib/api';
import { useLoad } from '../lib/hooks';
import { back, getState, go, isCeo, me, mem, refresh, setBadges, useColors, useStore } from '../lib/store';
import { addDays, ddayCls, ddayLabel, iso, md, roleLabel, ROLE, today } from '../lib/util';
import { Icon } from '../ui/Icon';
import {
  Avatar,
  Bar,
  Btn,
  BtnRow,
  Card,
  CardH,
  CheckBox,
  DateInput,
  DescBox,
  Divided,
  DocIc,
  Empty,
  ErrorView,
  Fab,
  Field,
  FieldRow,
  Grow,
  Hint,
  IconBtn,
  Input,
  KV,
  ListItem,
  Loading,
  More,
  OptGroup,
  PageH,
  Press,
  Row,
  Seg,
  Select,
  St,
  Stat,
  Stats,
  Sub,
  SwitchRow,
  T,
  Tag,
  Timeline,
} from '../ui/kit';
import { ask, err, sheet, toast } from '../ui/overlay';
import { Page } from '../ui/Page';
import { openPerson } from './People';

const done = (msg?: string) => {
  sheet.close();
  if (msg) toast(msg);
  refresh();
};

/** 완료한 업무 수정 규칙: [선택지 이름, 프로젝트 화면 표시, 설명] */
const EDIT_DONE = [
  ['수정 불가', '', '완료된 업무는 배정한 사람만 고칠 수 있어요'],
  ['자기 업무만', '완료한 자기 업무 수정 가능', '담당자가 이미 완료한 자기 업무를 고칠 수 있어요'],
  ['누구나', '완료한 업무 누구나 수정 가능', '이 프로젝트를 볼 수 있는 사람이면 완료된 업무를 누구 것이든 고칠 수 있어요'],
];

// 업무 탭 · 프로젝트 화면이 받은 데이터 (업무 상세 · 추가 창에서 같이 씀)
const T_ = { view: 'mine', showDone: false, data: null as any };
const PJ = { id: null as number | null, data: null as any, open: false };

// ==================================================================
// 업무 탭
// ==================================================================
export function TaskView() {
  const c = useColors();
  const leader = me().role !== 'member';
  const [view, setView] = useState(leader ? T_.view : 'mine');
  const [showDone, setShowDone] = useState(T_.showDone);
  useEffect(() => {
    T_.view = view;
    T_.showDone = showDone;
  }, [view, showDone]);
  // 다른 사람에게 업무를 배정하면 '팀 전체'로 바꿔 보여줌
  const rk = useStore((s) => s.refreshKey);
  useEffect(() => {
    if (leader && T_.view !== view) setView(T_.view);
  }, [rk]);
  const q = useLoad(async () => {
    const d = await api('tasks', { view });
    setBadges(d.badges);
    T_.data = d;
    return d;
  }, [view]);

  return (
    <Page q={q} fab={<Fab icon="plus" title={me().assignable.length ? '업무 추가' : '할 일 추가'} onPress={() => openTaskNew()} />}>
      {(d: any) => {
        const open = d.tasks.filter((t: any) => t.status !== 'done');
        const finished = d.tasks.filter((t: any) => t.status === 'done');
        const active = open.filter((t: any) => t.status === 'todo');
        const reviewIds = new Set(d.reviews.map((t: any) => t.id));
        const waiting = open.filter((t: any) => t.status === 'review' && !reviewIds.has(t.id));
        const endWeek = 6 - new Date().getDay();
        const groups: [string, (t: any) => boolean][] = [
          ['지연', (t) => t.dday < 0],
          ['오늘', (t) => t.dday === 0],
          ['이번 주', (t) => t.dday > 0 && t.dday <= endWeek],
          ['나중에', (t) => t.dday > endWeek],
        ];
        const cnt = (i: number) => active.filter(groups[i][1]).length;
        const hasList = active.length > 0 || waiting.length > 0;
        return (
          <>
            <PageH
              title="업무"
              sub={isCeo() ? '전체 프로젝트' : (me().team || '소속 없음') + ' · 참여 프로젝트'}
              right={
                leader ? (
                  <Seg
                    options={[
                      ['mine', '내 업무'],
                      ['team', isCeo() ? '전체' : '팀 전체'],
                    ]}
                    value={view}
                    onChange={setView}
                  />
                ) : null
              }
            />
            <Stats>
              <Stat label="지연" value={cnt(0)} unit="건" color={cnt(0) ? c.danger : undefined} />
              <Stat label="오늘 마감" value={cnt(1)} unit="건" color={cnt(1) ? c.warn : undefined} />
              <Stat label="이번 주" value={cnt(2)} unit="건" />
            </Stats>
            {d.reviews.length ? (
              <Card review>
                <CardH
                  title={
                    <T style={{ fontSize: 16, fontWeight: '700' }}>
                      검토 요청 <Text style={{ color: c.leave }}>{d.reviews.length}</Text>
                    </T>
                  }
                  right={<Sub>확정하거나 반려해 주세요</Sub>}
                />
                {d.reviews.map((t: any) => (
                  <TaskRow key={t.id} t={t} />
                ))}
              </Card>
            ) : null}
            <Card>
              <CardH title={view === 'mine' ? '내 할 일' : '팀 업무'} right={<Sub>남은 {open.length}건</Sub>} />
              {groups.map(([g, f], gi) => {
                const l = active.filter(f);
                if (!l.length) return null;
                return (
                  <View key={g}>
                    <Grp label={g} n={l.length} first={gi === 0} />
                    {l.map((t: any) => (
                      <TaskRow key={t.id} t={t} />
                    ))}
                  </View>
                );
              })}
              {waiting.length ? (
                <View>
                  <Grp label="검토 기다리는 중" n={waiting.length} />
                  {waiting.map((t: any) => (
                    <TaskRow key={t.id} t={t} />
                  ))}
                </View>
              ) : null}
              {!hasList ? <Empty>남은 업무가 없어요 🎉</Empty> : null}
              {finished.length ? (
                <>
                  <Press onPress={() => setShowDone(!showDone)} style={[st.doneToggle, { backgroundColor: c.surface2 }]}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: c.sub, textAlign: 'center' }}>
                      완료한 업무 {finished.length}건 {showDone ? '접기' : '보기'}
                    </Text>
                  </Press>
                  {showDone ? finished.map((t: any) => <TaskRow key={t.id} t={t} />) : null}
                </>
              ) : null}
            </Card>
            <Card>
              <CardH title="프로젝트" right={leader ? <More title="새 프로젝트" icon="plus" onPress={() => openProjectEdit(null)} /> : <Sub>{d.projects.length}개</Sub>} />
              {d.projects.length ? (
                <View style={{ gap: 8 }}>
                  {d.projects.map((p: any) => (
                    <ProjectCard key={p.id} p={p} />
                  ))}
                </View>
              ) : (
                <Empty>볼 수 있는 프로젝트가 없어요</Empty>
              )}
            </Card>
            <Card>
              <CardH title="회사 전체 마감" right={d.can_manage ? <More title="추가" icon="plus" onPress={openDeadlineNew} /> : null} />
              {d.deadlines.length ? (
                <Divided>
                  {d.deadlines.map((x: any) => (
                    <ListItem key={x.id}>
                      <DocIc icon="flag" t="leave" />
                      <Grow>
                        <T style={{ fontWeight: '600' }}>{x.title}</T>
                        <Sub>
                          {md(x.due)}
                          {x.description ? ' · ' + x.description : ''}
                        </Sub>
                      </Grow>
                      <St kind={ddayCls(x.dday)}>{ddayLabel(x.dday)}</St>
                      {d.can_manage ? <IconBtn name="x" size={16} label="삭제" onPress={() => delDeadline(x.id)} /> : null}
                    </ListItem>
                  ))}
                </Divided>
              ) : (
                <Empty>등록된 마감이 없어요</Empty>
              )}
            </Card>
          </>
        );
      }}
    </Page>
  );
}

function Grp({ label, n, first }: { label: string; n: number; first?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: first ? 0 : 14, marginBottom: 2 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: c.sub }}>{label}</Text>
      <Text style={{ fontSize: 11, fontWeight: '700', color: c.sub, backgroundColor: c.surface2, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1, overflow: 'hidden' }}>{n}</Text>
    </View>
  );
}

function StateChip({ t }: { t: any }) {
  if (t.status === 'done') return <St kind="ok">완료</St>;
  if (t.status === 'review') return <St kind="rv">검토 중</St>;
  return <St kind={ddayCls(t.dday)}>{ddayLabel(t.dday)}</St>;
}

/** noProject: 프로젝트 화면 안에서는 프로젝트 이름을 빼고 보여줌 */
function TaskRow({ t, noProject }: { t: any; noProject?: boolean }) {
  const c = useColors();
  const sub = !t.mine ? `${t.assignee} 담당` : t.assigner_id === me().id ? '직접 등록' : `${t.assigner || ''} 배정`;
  const isDone = t.status === 'done';
  const isRv = t.status === 'review';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <Press
        onPress={() => openTask(t.id)}
        label="업무 상세"
        style={[st.tchk, { borderColor: isDone ? c.ok : isRv ? c.leave : c.line2, backgroundColor: isDone ? c.ok : isRv ? c.leaveSoft : 'transparent' }]}
      >
        {isRv ? <Icon name="clock" size={14} w={2.6} color={c.leave} /> : isDone ? <Icon name="check" size={14} w={3} color="#fff" /> : null}
      </Press>
      <Press onPress={() => openTask(t.id)} style={{ flex: 1, minWidth: 0 }}>
        <T lines={1} style={[{ fontWeight: '600' }, isDone && { color: c.faint, textDecorationLine: 'line-through' }]}>
          {t.title}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {!noProject ? (
            <Tag>
              {t.project_short || t.project || '개인'}
              {t.stage ? ' · ' + t.stage : ''}
            </Tag>
          ) : null}
          {t.reject_note && t.status === 'todo' ? <Tag kind="danger">반려됨</Tag> : null}
          <Text style={{ fontSize: 12, color: c.sub, flexShrink: 1 }} numberOfLines={1}>
            {sub}
          </Text>
        </View>
      </Press>
      <StateChip t={t} />
    </View>
  );
}

function ProjectCard({ p }: { p: any }) {
  const c = useColors();
  const stg = p.stages[p.current_index] || p.stages[0] || { name: '' };
  const label: Record<string, [string, string]> = { late: ['no', '지연'], warn: ['late', '주의'], ok: ['ok', '순조'] };
  const [k, l] = label[p.state] || label.ok;
  return (
    <Press onPress={() => go(`ws/project/${p.id}`)} style={{ padding: 16, borderRadius: 16, backgroundColor: c.surface3 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T style={{ fontWeight: '600', flex: 1 }} lines={1}>
          {p.name}
        </T>
        <St kind={k}>{l}</St>
      </Row>
      <Sub style={{ marginTop: 4, marginBottom: 12 }}>
        {stg.name} 단계 ({p.current_index + 1}/{p.stages.length}){p.due ? ' · 마감 ' + ddayLabel(p.dday) : ''}
        {p.team ? ' · ' + p.team : ''}
      </Sub>
      <Bar pct={p.pct} state={p.state} />
      <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
        <Text style={{ fontSize: 13, color: c.ink }}>
          <Text style={{ fontWeight: '700' }}>{p.pct}%</Text>
          <Text style={{ color: c.sub }}>
            {' '}
            · 업무 {p.done}/{p.total}
          </Text>
        </Text>
        <View style={{ flexDirection: 'row' }}>
          {p.people.slice(0, 6).map((id: number, i: number) => (
            <View key={id} style={{ marginLeft: i ? -7 : 0 }}>
              <Avatar m={mem(id) || { name: '?' }} size={26} ring={c.surface3} noDot />
            </View>
          ))}
        </View>
      </Row>
    </Press>
  );
}

// ==================================================================
// 프로젝트 화면 (전체 화면)
// ==================================================================
export function ProjectScreen({ id }: { id: number }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<string | null>(null);
  const q = useLoad(async () => {
    const d = await api('project', { id });
    PJ.id = id;
    PJ.data = d;
    return d;
  }, [id]);
  useEffect(() => {
    PJ.open = true;
    return () => {
      PJ.open = false;
    };
  }, []);
  const bar = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [barW, setBarW] = useState(0);
  const PILL = 92;

  const d = q.data;
  const p = d && d.project;
  const cur = p ? p.current_index : 0;
  const center = (sid: string | null, animated: boolean) => {
    if (!p || !barW) return;
    const i = Math.max(0, p.stages.findIndex((s: any) => s.id === (sid || p.current)));
    bar.current?.scrollTo({ x: i * PILL, animated });
  };
  useEffect(() => {
    center(filter, false);
  }, [p && p.id, barW]);

  const head = (
    <View style={[st.subH, { backgroundColor: c.surface, borderBottomColor: c.line, paddingTop: insets.top }]}>
      <IconBtn name="back" size={24} w={2} label="뒤로" onPress={() => back('ws/task')} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T style={{ fontSize: 16, fontWeight: '700' }} lines={1}>
          {p ? p.name : '프로젝트'}
        </T>
        {p ? (
          <Sub style={{ fontSize: 12 }} lines={1}>
            {p.team || '팀 없음'}
            {p.due ? ` · 마감 ${md(p.due)} (${ddayLabel(p.dday)})` : ''}
          </Sub>
        ) : null}
      </View>
      {p && p.can_edit ? <IconBtn name="settings" size={20} label="프로젝트 설정" onPress={() => openProjectEdit(p)} /> : null}
    </View>
  );
  if (!p) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface2 }}>
        {head}
        {q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Loading />}
      </View>
    );
  }
  const tasks = d.tasks;
  const sel = filter;
  const selStage = sel ? p.stages.find((s: any) => s.id === sel) : null;
  const ids = new Set(p.stages.map((s: any) => s.id));
  const noStage = tasks.filter((t: any) => !t.stage_id || !ids.has(t.stage_id));
  // 단계별 업무: 전체 보기면 업무가 있는 단계 + 현재 단계만, 단계를 고르면 그 단계만
  const shown = sel ? p.stages.filter((s: any) => s.id === sel) : p.stages.filter((s: any, i: number) => s.total > 0 || i === cur);
  const pick = (sid: string) => {
    const nf = !sid || filter === sid ? null : sid;
    setFilter(nf);
    center(nf, true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface2 }}>
      {head}
      <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line }} onLayout={(e) => setBarW(e.nativeEvent.layout.width)}>
        <ScrollView ref={bar} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: Math.max(0, barW / 2 - PILL / 2), paddingTop: 14, paddingBottom: 10 }}>
          {p.stages.map((s: any, i: number) => {
            const isDone = i < cur;
            const now = i === cur;
            const on = sel === s.id;
            return (
              <Press key={s.id} onPress={() => pick(s.id)} style={{ width: PILL, alignItems: 'center', gap: 5, paddingHorizontal: 4 }}>
                {i > 0 ? <View style={{ position: 'absolute', top: 6, left: -PILL / 2, width: PILL, height: 2, backgroundColor: isDone || now ? c.primary : c.line }} /> : null}
                <View
                  style={[
                    { width: 14, height: 14, borderRadius: 7, backgroundColor: isDone ? c.primary : c.line2 },
                    now && { backgroundColor: c.surface, borderWidth: 3, borderColor: c.primary, transform: [{ scale: 1.15 }] },
                  ]}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    maxWidth: 84,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 10,
                    overflow: 'hidden',
                    color: on ? c.surface : now ? c.primary : isDone ? c.ink2 : c.sub,
                    backgroundColor: on ? c.ink : 'transparent',
                  }}
                >
                  {s.name}
                </Text>
                <Text style={{ fontSize: 11, color: c.faint, fontWeight: '600' }}>{s.total ? `${s.done}/${s.total}` : '-'}</Text>
              </Press>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 100 + insets.bottom }}>
        {sel && selStage ? (
          <View style={[st.filterBar, { backgroundColor: c.primarySoft }]}>
            <Text style={{ color: c.primary, fontSize: 13, fontWeight: '700' }}>{selStage.name} 단계만 보는 중</Text>
            <Press onPress={() => pick('')}>
              <Text style={{ color: c.primary, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' }}>전체 보기</Text>
            </Press>
          </View>
        ) : null}
        <Card>
          <Stats>
            <Stat flat label="진행률" value={p.pct} unit="%" />
            <Stat flat label="남은 업무" value={p.total - p.done} unit="건" />
            <Stat flat label="지연" value={p.late} unit="건" color={p.late ? c.danger : undefined} />
          </Stats>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Tag kind={p.require_review ? 'leave' : 'primary'}>{p.require_review ? '완료할 때 승인 필요' : '승인 없이 바로 완료'}</Tag>
            {p.edit_done ? <Tag>{EDIT_DONE[p.edit_done][1]}</Tag> : null}
            <Tag>
              단계 {cur + 1}/{p.stages.length}
            </Tag>
          </View>
          <View style={{ marginTop: 14 }}>
            <Grp label="참여 인원" n={p.members.length} first />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, marginBottom: 4 }}>
            {p.members.map((mid: number) => mem(mid)).filter(Boolean).length ? (
              p.members
                .map((mid: number) => mem(mid))
                .filter(Boolean)
                .map((m: any) => (
                  <Press key={m.id} onPress={() => openPerson(m.id)} style={[st.memberChip, { backgroundColor: c.surface2 }]}>
                    <Avatar m={m} size={26} noDot />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: c.ink }}>{m.name}</Text>
                  </Press>
                ))
            ) : (
              <Sub>아직 정하지 않았어요</Sub>
            )}
          </View>
        </Card>
        <Card>
          {shown.length || (!sel && noStage.length) ? (
            <>
              {shown.map((s: any, k: number) => {
                const i = p.stages.indexOf(s);
                const list = tasks.filter((t: any) => t.stage_id === s.id);
                return (
                  <View key={s.id} style={k > 0 ? [st.stageGrpSep, { borderTopColor: c.line }] : null}>
                    <View style={st.stageGrpH}>
                      <StageNo n={i + 1} />
                      <T style={{ fontWeight: '700' }}>{s.name}</T>
                      {i === cur ? <Tag kind="primary">현재</Tag> : i < cur ? <Tag>지난 단계</Tag> : null}
                      <Grow />
                      <Sub>
                        {s.done}/{s.total}
                      </Sub>
                      <IconBtn name="plus" size={18} w={2.2} color={c.primary} label="이 단계에 업무 추가" style={{ width: 32, height: 32 }} onPress={() => openTaskNew(p.id, s.id)} />
                    </View>
                    {list.length ? list.map((t: any) => <TaskRow key={t.id} t={t} noProject />) : <Sub style={{ paddingTop: 6, paddingBottom: 10 }}>이 단계에는 아직 업무가 없어요</Sub>}
                  </View>
                );
              })}
              {!sel && noStage.length ? (
                <View style={shown.length ? [st.stageGrpSep, { borderTopColor: c.line }] : null}>
                  <View style={st.stageGrpH}>
                    <T style={{ fontWeight: '700' }}>단계 없음</T>
                    <Grow />
                    <Sub>{noStage.length}</Sub>
                  </View>
                  {noStage.map((t: any) => (
                    <TaskRow key={t.id} t={t} noProject />
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <Empty>아직 업무가 없어요</Empty>
          )}
        </Card>
      </ScrollView>
      <Fab low icon="plus" title={`${sel && selStage ? selStage.name + '에 ' : ''}업무 추가`} onPress={() => openTaskNew(p.id, sel || p.current)} />
    </View>
  );
}

function StageNo({ n }: { n: number | string }) {
  const c = useColors();
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.primary, fontSize: 12, fontWeight: '800' }}>{n}</Text>
    </View>
  );
}


// ==================================================================
// 업무 상세 · 완료 흐름
// ==================================================================
const allTasks = () => [...((T_.data && T_.data.tasks) || []), ...((T_.data && T_.data.reviews) || []), ...((PJ.data && PJ.data.tasks) || [])];
const findTask = (id: number) => allTasks().find((t: any) => t.id === id);

function openTask(id: number) {
  const t = findTask(id);
  if (!t) return;
  sheet.show('업무 상세', <TaskSheet t={t} />);
}

const ACT_MSG: Record<string, string> = {
  submit: '완료를 요청했어요',
  cancel: '완료 요청을 취소했어요',
  approve: '업무를 확정했어요 👏',
  reject: '반려했어요',
  reopen: '다시 진행 중으로 바꿨어요',
  done: '업무를 완료했어요 👏',
  delete: '업무를 지웠어요',
};

function TaskSheet({ t }: { t: any }) {
  const c = useColors();
  const s = t.status;
  const id = t.id;
  const rvName = t.reviewer || '';
  const [note, setNote] = useState('');
  const [rej, setRej] = useState<string | null>(null);
  const act = async (a: string) => {
    if (a === 'delete' && !(await ask({ title: '업무 삭제', body: '이 업무를 지울까요? 되돌릴 수 없어요.', ok: '삭제', danger: true }))) return;
    const body: any = { id, action: a };
    if (a === 'submit') body.note = note;
    await post('task.act', body);
    done(ACT_MSG[a]);
  };
  const reject = async () => {
    if (rej === null) return setRej('');
    if (!rej.trim()) return toast('반려 사유를 적어주세요');
    await post('task.act', { id, action: 'reject', note: rej.trim() });
    done('반려했어요');
  };
  const flow = t.self
    ? [
        { state: 'done', title: t.assigner_id === t.assignee_id ? '등록 · ' + t.assignee : '배정 · ' + (t.assigner || ''), sub: t.no_review_project ? '이 프로젝트는 승인 없이 완료해요' : '직접 등록한 할 일이에요' },
        { state: s === 'done' ? 'done' : 'now', title: s === 'done' ? '완료' : '진행 중', sub: '검토 없이 바로 완료할 수 있어요' },
      ]
    : [
        {
          state: 'done',
          title: t.assigner_id === t.assignee_id ? '직접 추가 · ' + t.assignee : '배정 · ' + (t.assigner || ''),
          sub: t.assigner_id === t.assignee_id ? '프로젝트 업무라 완료할 때 확인을 받아요' : t.assignee + '님에게 배정',
        },
        { state: s === 'todo' ? 'now' : 'done', title: '완료 요청 · ' + t.assignee, sub: s === 'todo' ? (t.reject_note ? '반려돼서 다시 진행 중이에요' : '진행 중이에요') : t.submit_note || '메모 없이 요청했어요' },
        { state: s === 'done' ? 'done' : s === 'review' ? 'now' : '', title: '검토 · ' + rvName, sub: s === 'done' ? '확정했어요' : s === 'review' ? '검토를 기다리는 중이에요' : '완료 요청이 오면 검토해요' },
      ];

  let actions: React.ReactNode = null;
  if (t.self && t.mine) {
    actions = s === 'done' ? <Btn kind="ghost" title="완료 취소" onPress={() => act('reopen')} /> : <Btn icon="check" title="완료로 표시" onPress={() => act('done')} />;
  } else if (t.mine && s === 'todo') {
    actions = (
      <>
        <Field label="완료 메모 (선택)">
          <Input area value={note} onChangeText={setNote} placeholder="결과물 링크나 작업 내용을 적어주세요" />
        </Field>
        <Btn icon="send" title={`${rvName}님께 완료 요청`} onPress={() => act('submit')} />
      </>
    );
  } else if (t.mine && s === 'review') {
    actions = <Btn kind="ghost" title="완료 요청 취소" onPress={() => act('cancel')} />;
  } else if (t.can_review && s === 'review') {
    actions = (
      <>
        {rej !== null ? (
          <Field label="반려 사유">
            <Input area value={rej} onChangeText={setRej} placeholder="무엇을 고치면 되는지 적어주세요" autoFocus />
          </Field>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Btn kind="ghost" title={rej !== null ? '반려 보내기' : '반려'} onPress={reject} />
          </View>
          <View style={{ flex: 2 }}>
            <Btn icon="check" title="확정" onPress={() => act('approve')} />
          </View>
        </View>
      </>
    );
  } else if ((t.can_review || t.can_edit_due) && s === 'done') {
    actions = <Btn kind="ghost" title="완료 취소" onPress={() => act('reopen')} />;
  }
  return (
    <View>
      {t.project_id ? (
        <Tag kind="primary" onPress={() => go(`ws/project/${t.project_id}`)}>
          {t.project}
          {t.stage ? ' · ' + t.stage : ''} ›
        </Tag>
      ) : (
        <Tag>개인 할 일</Tag>
      )}
      <T style={{ fontSize: 19, fontWeight: '800', marginTop: 8, marginBottom: 14 }}>{t.title}</T>
      <Divided>
        <KV k="담당" v={t.assignee} />
        {t.project_id ? <KV k="단계" v={t.stage || '단계 없음'} /> : null}
        <KV k="마감">
          <Row gap={6}>
            <T style={{ fontWeight: '600' }}>{md(t.due)}</T>
            <StateChip t={t} />
          </Row>
        </KV>
      </Divided>
      {t.description ? <DescBox text={t.description} /> : null}
      {t.reject_note && s === 'todo' ? (
        <View style={{ marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: c.dangerSoft }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.danger }}>반려 사유 · {rvName}</Text>
          <Text style={{ fontSize: 14, color: c.ink2, marginTop: 4, lineHeight: 21 }}>{t.reject_note}</Text>
        </View>
      ) : null}
      <Timeline items={flow} />
      {actions ? <View style={{ marginTop: 20 }}>{actions}</View> : null}
      {t.can_edit || t.can_delete ? (
        <BtnRow style={{ marginTop: 8 }}>
          {t.can_edit ? <Btn kind="ghost" icon="pen" title="수정" onPress={() => openTaskEdit(t)} /> : null}
          {t.can_delete ? <Btn kind="ghost" icon="trash" title="삭제" color={c.danger} onPress={() => act('delete')} /> : null}
        </BtnRow>
      ) : null}
      {s === 'done' && !t.can_edit && t.project_id ? <Sub style={{ marginTop: 10, textAlign: 'center' }}>이 프로젝트는 완료한 업무를 고칠 수 없게 되어 있어요.</Sub> : null}
      {s === 'done' && t.can_edit && !t.mine && !t.can_edit_due ? <Sub style={{ marginTop: 10, textAlign: 'center' }}>이 프로젝트는 완료된 업무를 누구나 고칠 수 있어요.</Sub> : null}
    </View>
  );
}

// ==================================================================
// 업무 추가 · 수정 (프로젝트 + 단계 선택)
// ==================================================================
/** 고를 수 있는 프로젝트 목록 (업무 탭 + 지금 보고 있는 프로젝트) */
function projectChoices(): any[] {
  const map = new Map<number, any>();
  if (PJ.data && PJ.open) map.set(PJ.data.project.id, PJ.data.project);
  ((T_.data && T_.data.projects) || []).forEach((p: any) => map.set(p.id, p));
  return [...map.values()];
}
function stageOpts(p: any) {
  return p.stages.map((s: any, i: number) => ({ value: String(s.id), label: `${i + 1}. ${s.name}${i === p.current_index ? ' (현재)' : ''}` }));
}
const pickStage = (p: any, sid?: string) => (sid && p.stages.some((s: any) => s.id === sid) ? sid : p.current);

function openTaskNew(pid?: number, sid?: string) {
  const people = me().assignable.map(mem).filter(Boolean);
  sheet.show(people.length ? '업무 추가' : '할 일 추가', <TaskNew pid={pid} sid={sid} />);
}
function TaskNew({ pid, sid }: { pid?: number; sid?: string }) {
  const projs = projectChoices();
  const people = me().assignable.map(mem).filter(Boolean);
  const rv = me().approvers[0] ? mem(me().approvers[0]) : null;
  const pre = projs.find((p) => p.id === pid);
  const [f, setF] = useState({
    assignee_id: String(me().id),
    project_id: pre ? String(pre.id) : '',
    stage_id: pre ? pickStage(pre, sid) : '',
    title: '',
    due: iso(addDays(today(), 3)),
    description: '',
  });
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const p = projs.find((x) => x.id === Number(f.project_id));
  const to = Number(f.assignee_id);
  let hint: string;
  if (p && !p.require_review) hint = '이 프로젝트는 승인 없이 담당자가 바로 완료해요.';
  else if (to !== me().id) hint = `${(mem(to) || {}).name}님이 완료를 요청하면 내가 확정하거나 반려해요.`;
  else if (!p) hint = '개인 할 일은 검토 없이 바로 완료할 수 있어요.';
  else hint = rv ? `프로젝트 업무는 완료할 때 ${rv.name + ' ' + ROLE[rv.role]}님이 확인해요.` : '검토 없이 바로 완료할 수 있어요.';
  const save = async () => {
    if (!f.title.trim()) throw new Error('업무명을 입력해 주세요.');
    const body: any = { ...f, stage_id: p ? f.stage_id : '' };
    if (!people.length) delete body.assignee_id;
    await post('task.save', body);
    if (to !== me().id && !PJ.open && getState().main.tab === 'task') T_.view = 'team';
    done(to === me().id ? '할 일을 추가했어요' : `${(mem(to) || {}).name}님에게 업무를 배정했어요`);
  };
  return (
    <View>
      {people.length ? (
        <Field label="담당자">
          <Select
            value={f.assignee_id}
            onChange={set('assignee_id')}
            options={[{ value: String(me().id), label: '나 (내 할 일)' }, ...people.map((m: any) => ({ value: String(m.id), label: `${m.name} (${roleLabel(m)})` }))]}
          />
        </Field>
      ) : null}
      <FieldRow>
        <Field label="프로젝트">
          <Select
            value={f.project_id}
            onChange={(v) => {
              const np = projs.find((x) => x.id === Number(v));
              setF((x) => ({ ...x, project_id: v, stage_id: np ? pickStage(np, x.stage_id) : '' }));
            }}
            options={[{ value: '', label: '개인 할 일' }, ...projs.map((x) => ({ value: String(x.id), label: x.name }))]}
          />
        </Field>
        {p ? (
          <Field label="단계">
            <Select value={String(f.stage_id)} onChange={set('stage_id')} options={stageOpts(p)} />
          </Field>
        ) : null}
      </FieldRow>
      <Hint>{hint}</Hint>
      <Field label="업무명">
        <Input value={f.title} onChangeText={set('title')} maxLength={200} placeholder="예: 로그인 화면 개발" />
      </Field>
      <Field label="마감일">
        <DateInput value={f.due} onChange={set('due')} />
      </Field>
      <Field label="설명 (선택)">
        <Input area value={f.description} onChangeText={set('description')} placeholder="무엇을, 어디까지 하면 되는지 적어주세요" />
      </Field>
      <Btn title={to !== me().id ? '배정하기' : '추가하기'} onPress={save} />
    </View>
  );
}

function openTaskEdit(t: any) {
  sheet.show('업무 수정', <TaskEdit t={t} />);
}
function TaskEdit({ t }: { t: any }) {
  const projs = projectChoices();
  const [f, setF] = useState({ title: t.title, project_id: t.project_id ? String(t.project_id) : '', stage_id: t.stage_id || '', due: t.due, description: t.description || '' });
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const p = projs.find((x) => x.id === Number(f.project_id));
  const save = async () => {
    if (!f.title.trim()) throw new Error('업무명을 입력해 주세요.');
    const body: any = { id: t.id, title: f.title, description: f.description };
    if (t.can_move) {
      body.project_id = f.project_id;
      body.stage_id = p ? f.stage_id : '';
    } else if (p) body.stage_id = f.stage_id;
    if (t.can_edit_due) body.due = f.due;
    await post('task.save', body);
    done('업무를 고쳤어요');
  };
  return (
    <View>
      <Field label="업무명">
        <Input value={f.title} onChangeText={set('title')} maxLength={200} />
      </Field>
      {t.can_move ? (
        <FieldRow>
          <Field label="프로젝트">
            <Select
              value={f.project_id}
              onChange={(v) => {
                const np = projs.find((x) => x.id === Number(v));
                setF((x) => ({ ...x, project_id: v, stage_id: np ? pickStage(np, x.stage_id) : '' }));
              }}
              options={[{ value: '', label: '개인 할 일' }, ...projs.map((x) => ({ value: String(x.id), label: x.name }))]}
            />
          </Field>
          {p ? (
            <Field label="단계">
              <Select value={String(pickStage(p, f.stage_id))} onChange={set('stage_id')} options={stageOpts(p)} />
            </Field>
          ) : null}
        </FieldRow>
      ) : p ? (
        <Field label="단계">
          <Select value={String(pickStage(p, f.stage_id))} onChange={set('stage_id')} options={stageOpts(p)} />
        </Field>
      ) : null}
      {t.can_edit_due ? (
        <Field label="마감일">
          <DateInput value={f.due} onChange={set('due')} />
        </Field>
      ) : (
        <Sub style={{ marginBottom: 14 }}>마감일은 배정한 사람만 바꿀 수 있어요. ({md(t.due)})</Sub>
      )}
      <Field label="설명">
        <Input area value={f.description} onChangeText={set('description')} />
      </Field>
      {t.status === 'done' ? <Hint>완료 상태는 그대로 두고 내용만 고쳐요.</Hint> : null}
      <Btn title="저장" onPress={save} />
    </View>
  );
}

// ==================================================================
// 프로젝트 만들기 · 설정 (단계, 참여 인원, 승인 · 수정 규칙)
// ==================================================================
const MAX_STAGES = 50;
const defaultStages = (): { id: string; name: string }[] =>
  ((T_.data && T_.data.default_stages) || (PJ.data && PJ.data.default_stages) || ['기획', '디자인', '개발', 'QA', '출시']).map((n: string) => ({ id: '', name: n }));

function openProjectEdit(p: any | null) {
  sheet.show(p ? '프로젝트 설정' : '새 프로젝트', <ProjectForm p={p} />);
}

let stageKey = 0;
function ProjectForm({ p }: { p: any | null }) {
  const c = useColors();
  const data = getState().data;
  const myTeam = p ? p.team_id : me().team_id;
  const [f, setF] = useState({ name: p ? p.name : '', short_name: p ? p.short || '' : '', due: p && p.due ? p.due : '', team_id: myTeam ? String(myTeam) : '' });
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const [stages, setStages] = useState<{ id: string; name: string; k: number }[]>((p ? p.stages : defaultStages()).map((s: any) => ({ id: s.id || '', name: s.name, k: ++stageKey })));
  const [cur, setCur] = useState<number>(p ? p.current_index : 0);
  const [review, setReview] = useState<boolean>(p ? !!p.require_review : true);
  const [editDone, setEditDone] = useState<number>(p ? p.edit_done || 0 : 0);
  const [archive, setArchive] = useState(false);
  const [members, setMembers] = useState<Set<number>>(
    new Set(p ? p.members : data.members.filter((m: any) => m.id === me().id || (me().team_id && m.team_id === me().team_id && m.role !== 'ceo')).map((m: any) => m.id))
  );
  const people = [...data.members].sort((a: any, b: any) => Number(b.team_id === myTeam) - Number(a.team_id === myTeam));
  const curIdx = Math.min(cur, stages.length - 1);

  const add = () => {
    if (stages.length >= MAX_STAGES) return toast(`단계는 ${MAX_STAGES}개까지 만들 수 있어요`);
    setStages([...stages, { id: '', name: '', k: ++stageKey }]);
  };
  const del = (i: number) => {
    if (stages.length <= 1) return toast('단계는 1개 이상이어야 해요');
    if (i < cur) setCur(cur - 1);
    setStages(stages.filter((_, k) => k !== i));
  };
  const up = (i: number) => {
    if (i === 0) return;
    const n = [...stages];
    [n[i - 1], n[i]] = [n[i], n[i - 1]];
    // 현재 단계로 고른 단계가 함께 움직이도록
    if (cur === i) setCur(i - 1);
    else if (cur === i - 1) setCur(i);
    setStages(n);
  };
  const reset = () => {
    setStages(defaultStages().map((s) => ({ ...s, k: ++stageKey })));
    setCur(0);
    toast('기본 단계로 바꿨어요. 저장해야 반영돼요');
  };
  const toggle = (id: number) => {
    const n = new Set(members);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setMembers(n);
  };
  const save = async () => {
    if (!f.name.trim()) throw new Error('프로젝트 이름을 입력해 주세요.');
    const st2 = stages.map((s) => ({ id: s.id || '', name: s.name.trim() })).filter((s) => s.name);
    if (!st2.length) throw new Error('단계를 1개 이상 입력해 주세요.');
    const body: any = {
      id: p ? p.id : undefined,
      name: f.name,
      short_name: f.short_name,
      due: f.due,
      team_id: isCeo() ? f.team_id : undefined,
      archive: p ? archive : undefined,
      require_review: review,
      edit_done: editDone,
      stages: st2,
      current: curIdx,
      member_ids: [...members],
    };
    const r = await post('project.save', body);
    if (!p) {
      sheet.close();
      toast('프로젝트를 만들었어요');
      go('ws/project/' + r.id);
      return;
    }
    done('프로젝트를 저장했어요');
  };
  return (
    <View>
      <Field label="프로젝트 이름">
        <Input value={f.name} onChangeText={set('name')} maxLength={100} />
      </Field>
      <FieldRow>
        <Field label="짧은 이름 (태그)">
          <Input value={f.short_name} onChangeText={set('short_name')} maxLength={20} placeholder="예: 홈페이지" />
        </Field>
        <Field label="마감일">
          <DateInput value={f.due} onChange={set('due')} clearable placeholder="없음" />
        </Field>
      </FieldRow>
      {isCeo() ? (
        <Field label="담당 팀">
          <Select value={f.team_id} onChange={set('team_id')} options={[{ value: '', label: '팀 없음' }, ...data.teams.map((t: any) => ({ value: String(t.id), label: t.name }))]} />
        </Field>
      ) : null}

      <Field
        label={
          <Text style={{ fontSize: 13, fontWeight: '600', color: c.sub, marginBottom: 6 }}>
            단계 <Text style={{ fontWeight: '500' }}>순서대로 진행돼요 · 최대 {MAX_STAGES}개</Text>
          </Text>
        }
        small={p ? "단계를 지우면 그 단계의 업무는 '단계 없음'으로 옮겨져요." : undefined}
      >
        {stages.map((s, i) => (
          <View key={s.k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <StageNo n={i + 1} />
            <TextInput
              value={s.name}
              onChangeText={(v) => setStages(stages.map((x, k) => (k === i ? { ...x, name: v } : x)))}
              maxLength={20}
              placeholder="단계 이름"
              placeholderTextColor={c.faint}
              style={{ flex: 1, minWidth: 0, height: 44, borderWidth: 1, borderColor: c.line, borderRadius: 11, paddingHorizontal: 12, backgroundColor: c.surface, fontSize: 15, color: c.ink }}
            />
            <View style={{ transform: [{ rotate: '90deg' }], opacity: i === 0 ? 0 : 1 }}>
              <IconBtn name="chevL" size={16} color={c.sub} label="위로" style={{ width: 34, height: 34 }} onPress={i === 0 ? undefined : () => up(i)} />
            </View>
            <IconBtn name="x" size={16} color={c.sub} label="단계 삭제" style={{ width: 34, height: 34 }} onPress={() => del(i)} />
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          <Btn sm kind="ghost" icon="plus" title="단계 추가" onPress={add} />
          <Btn sm kind="ghost" title="기본 단계로" onPress={reset} />
        </View>
      </Field>
      <Field label="현재 단계">
        <Select value={String(curIdx)} onChange={(v) => setCur(Number(v))} options={stages.map((s, i) => ({ value: String(i), label: `${i + 1}. ${s.name.trim() || `단계 ${i + 1}`}` }))} />
      </Field>

      <Field label="업무 규칙">
        <Divided>
          <SwitchRow title="완료할 때 승인 받기" sub="끄면 담당자가 검토 없이 혼자 완료해요" value={review} onChange={setReview} />
          <View style={{ paddingVertical: 12 }}>
            <T style={{ fontWeight: '600' }}>완료한 업무 수정</T>
            <OptGroup options={EDIT_DONE.map((x) => x[0])} value={editDone} onChange={setEditDone} />
            <Text style={{ fontSize: 12, color: c.sub }}>{EDIT_DONE[editDone][2]}</Text>
          </View>
        </Divided>
      </Field>

      <Field
        label={
          <Text style={{ fontSize: 13, fontWeight: '600', color: c.sub, marginBottom: 6 }}>
            참여 인원 <Text style={{ fontWeight: '500' }}>{members.size}명 선택</Text>
          </Text>
        }
      >
        <Sub style={{ marginBottom: 8 }}>참여 인원은 다른 팀이어도 이 프로젝트를 볼 수 있어요.</Sub>
        <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 2 }}>
          <Divided>
            {people.map((m: any) => (
              <Press key={m.id} onPress={() => toggle(m.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                <Avatar m={m} />
                <Grow>
                  <T style={{ fontWeight: '600' }}>{m.name}</T>
                  <Sub>{roleLabel(m)}</Sub>
                </Grow>
                <CheckBox on={members.has(m.id)} />
              </Press>
            ))}
          </Divided>
        </View>
      </Field>
      {p ? <SwitchRow title="보관하기" sub="끝난 프로젝트는 목록에서 숨겨요" value={archive} onChange={setArchive} /> : null}
      <View style={{ height: 8 }} />
      <Btn title={p ? '저장' : '만들기'} onPress={save} />
    </View>
  );
}

// ==================================================================
// 회사 마감
// ==================================================================
function openDeadlineNew() {
  sheet.show('회사 마감 추가', <DeadlineNew />);
}
function DeadlineNew() {
  const [f, setF] = useState({ title: '', due: iso(addDays(today(), 7)), description: '' });
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!f.title.trim()) throw new Error('내용을 입력해 주세요.');
    await post('deadline.save', f);
    done('회사 마감을 등록했어요');
  };
  return (
    <View>
      <Field label="내용">
        <Input value={f.title} onChangeText={set('title')} maxLength={200} placeholder="예: 연말정산 서류 제출" autoFocus />
      </Field>
      <Field label="마감일">
        <DateInput value={f.due} onChange={set('due')} />
      </Field>
      <Field label="설명 (선택)">
        <Input value={f.description} onChangeText={set('description')} maxLength={255} placeholder="예: 홈택스 간소화 자료 PDF" />
      </Field>
      <Hint>등록하면 전 직원에게 알림이 가요.</Hint>
      <Btn title="등록하기" onPress={save} />
    </View>
  );
}
async function delDeadline(id: number) {
  try {
    if (!(await ask({ title: '마감 삭제', body: '이 마감을 지울까요?', ok: '삭제', danger: true }))) return;
    await post('deadline.delete', { id });
    done('지웠어요');
  } catch (e) {
    err(e);
  }
}

const st = StyleSheet.create({
  tchk: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  doneToggle: { marginTop: 10, padding: 11, borderRadius: 12 },
  subH: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6, paddingRight: 8, borderBottomWidth: 1 },
  filterBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12, borderRadius: 12 },
  memberChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingLeft: 4, paddingRight: 12, borderRadius: 17 },
  stageGrpH: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2, paddingBottom: 4 },
  stageGrpSep: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderStyle: 'dashed' },
});
