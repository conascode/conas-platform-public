/* 워크스페이스 > 서류 (결재) */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { api, post } from '../lib/api';
import { useLoad, useUploads } from '../lib/hooks';
import { me, mem, refresh, useColors } from '../lib/store';
import { ago, iso, md, roleLabel, today, won } from '../lib/util';
import { Icon } from '../ui/Icon';
import {
  Avatar,
  Btn,
  Card,
  CardH,
  Chips,
  DateInput,
  Divided,
  DocIc,
  Empty,
  Field,
  Files,
  Grow,
  Input,
  KV,
  LinkText,
  ListItem,
  Loading,
  PageH,
  Press,
  Select,
  St,
  Sub,
  T,
  Timeline,
  UpList,
} from '../ui/kit';
import { ask, sheet, toast } from '../ui/overlay';
import { Page } from '../ui/Page';

const done = (msg?: string) => {
  sheet.close();
  if (msg) toast(msg);
  refresh();
};

type DocType = { id: string; name: string; desc: string; ic: string; c: string; fields: [string, string, string][]; files?: boolean | string; pick?: boolean };
const DOC_TYPES: DocType[] = [
  { id: 'reason', name: '근태 사유서', desc: '지각·조퇴·결근', ic: 'clock', c: 'c-warn', fields: [['date', '날짜', 'date'], ['kind', '유형', 'select:지각,조퇴,결근,외출'], ['reason', '사유', 'textarea']] },
  { id: 'leave', name: '연차·반차 신청', desc: '휴가 신청', ic: 'calendar', c: 'c-leave', fields: [['kind', '종류', 'select:연차,오전 반차,오후 반차,경조 휴가'], ['date', '시작일', 'date'], ['to', '종료일 (연차만)', 'date?'], ['reason', '사유 (선택)', 'textarea?']] },
  { id: 'ot', name: '연장근무 신청', desc: '야근·휴일근무', ic: 'moon', c: 'c-primary', fields: [['date', '날짜', 'date'], ['from', '시작 시간', 'time:18:00'], ['until', '종료 시간', 'time:21:00'], ['reason', '업무 내용', 'textarea']] },
  { id: 'exp', name: '지출결의서', desc: '경비·법인카드 정산', ic: 'card', c: 'c-ok', fields: [['date', '사용일', 'date'], ['item', '항목', 'select:식대,교통비,도서구입,장비구입,기타'], ['amount', '금액 (원)', 'number'], ['reason', '내용', 'textarea']], files: true },
  { id: 'cert', name: '증명서 발급', desc: '재직·경력증명서', ic: 'award', c: 'c-cyan', fields: [['kind', '종류', 'select:재직증명서,경력증명서,원천징수영수증'], ['purpose', '용도', 'text'], ['count', '매수', 'number:1']] },
  { id: 'supply', name: '비품 신청', desc: '사무용품·장비', ic: 'box', c: 'c-pink', fields: [['item', '품목', 'text'], ['count', '수량', 'number:1'], ['reason', '사유', 'textarea']] },
  // 업무 문서: 받을 사람(대표·팀장·관리자)을 한 명 골라 제출 → 승인 · 반려
  { id: 'propose', pick: true, name: '제안서', desc: '새 아이디어·개선 제안', ic: 'flag', c: 'c-primary', fields: [['subject', '제목', 'text'], ['background', '제안 배경', 'textarea'], ['content', '제안 내용', 'textarea'], ['effect', '기대 효과 (선택)', 'textarea?']], files: '참고 자료' },
  { id: 'suggest', pick: true, name: '건의서', desc: '불편한 점·바라는 점', ic: 'megaphone', c: 'c-warn', fields: [['subject', '제목', 'text'], ['content', '건의 내용', 'textarea'], ['solution', '개선 방안 (선택)', 'textarea?']], files: '참고 자료' },
  { id: 'request', pick: true, name: '품의서', desc: '구매·계약 등 사전 승인', ic: 'checkSq', c: 'c-ok', fields: [['subject', '제목', 'text'], ['content', '품의 내용', 'textarea'], ['amount', '금액 (원, 선택)', 'number?'], ['reason', '필요한 이유', 'textarea']], files: '견적서 · 참고 자료' },
];
const FIELD_LABEL: Record<string, string> = { date: '날짜', kind: '종류', reason: '사유', to: '종료일', from: '시작', until: '종료', item: '항목', amount: '금액', purpose: '용도', count: '수량', subject: '제목', background: '제안 배경', content: '내용', effect: '기대 효과', solution: '개선 방안' };
const LONG_FIELDS = ['background', 'content', 'effect', 'solution'];
const AP_ST: Record<string, [string, string]> = { pending: ['wait', '대기'], approved: ['ok', '승인'], rejected: ['no', '반려'], canceled: ['off', '취소'] };
const docType = (id: string) => DOC_TYPES.find((t) => t.id === id) || DOC_TYPES[0];

const D = { filter: '전체', data: null as any };

export function DocView() {
  const c = useColors();
  const [filter, setFilter] = useState(D.filter);
  const q = useLoad(async () => {
    const d = await api('approvals');
    D.data = d;
    return d;
  }, []);
  const changeFilter = (f: string) => {
    D.filter = f;
    setFilter(f);
  };
  return (
    <Page q={q}>
      {(d: any) => {
        const map: Record<string, string> = { 대기: 'pending', 승인: 'approved', 반려: 'rejected' };
        const list = d.mine.filter((a: any) => filter === '전체' || a.status === map[filter]);
        const tile = (t: DocType) => (
          <View key={t.id} style={{ width: '50%', padding: 4 }}>
            <Press onPress={() => openDocNew(t.id)} style={{ backgroundColor: c.surface, borderRadius: 16, padding: 16, gap: 10, minHeight: 112 }} pressedStyle={{ transform: [{ scale: 0.98 }] }}>
              <DocIc icon={t.ic} t={t.c} iconSize={20} />
              <View>
                <T style={{ fontWeight: '700' }}>{t.name}</T>
                <Sub style={{ fontSize: 12, marginTop: 4 }}>{t.id === 'leave' && d.leave_left !== null ? '남은 연차 ' + d.leave_left + '일' : t.desc}</Sub>
              </View>
            </Press>
          </View>
        );
        const groupH = (title: string, sub: string) => (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4, marginHorizontal: 4, marginBottom: 4 }}>
            <T style={{ fontSize: 14, fontWeight: '800' }}>{title}</T>
            <Sub style={{ fontSize: 12 }}>{sub}</Sub>
          </View>
        );
        return (
          <>
            <PageH title="서류" sub="작성할 서류를 고르세요" />
            {groupH('업무 문서', '받을 사람을 골라 제출해요')}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 18 }}>{DOC_TYPES.filter((t) => t.pick).map(tile)}</View>
            {groupH('신청 서류', '결재선을 따라 올라가요')}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>{DOC_TYPES.filter((t) => !t.pick).map(tile)}</View>
            {d.inbox.length ? (
              <Card review>
                <CardH
                  title={
                    <T style={{ fontSize: 16, fontWeight: '700' }}>
                      결재할 서류 <Text style={{ color: c.leave }}>{d.inbox.length}</Text>
                    </T>
                  }
                  right={<Sub>승인하거나 반려해 주세요</Sub>}
                />
                <Divided>
                  {d.inbox.map((a: any) => (
                    <ApRow key={a.id} a={a} showUser />
                  ))}
                </Divided>
              </Card>
            ) : null}
            <Card>
              <CardH title="내 결재 현황" right={<Sub>대기 {d.mine.filter((a: any) => a.status === 'pending').length}건</Sub>} />
              <Chips items={['전체', '대기', '승인', '반려'].map((x) => ({ v: x, label: x }))} value={filter} onChange={changeFilter} />
              {list.length ? (
                <Divided>
                  {list.map((a: any) => (
                    <ApRow key={a.id} a={a} />
                  ))}
                </Divided>
              ) : (
                <Empty>서류가 없어요</Empty>
              )}
            </Card>
            {d.handled.length ? (
              <Card>
                <CardH title="내가 처리한 서류" />
                <Divided>
                  {d.handled.slice(0, 10).map((a: any) => (
                    <ApRow key={a.id} a={a} showUser />
                  ))}
                </Divided>
              </Card>
            ) : null}
          </>
        );
      }}
    </Page>
  );
}

function ApRow({ a, showUser }: { a: any; showUser?: boolean }) {
  const t = docType(a.type);
  const [cls, label] = AP_ST[a.status] || AP_ST.pending;
  return (
    <ListItem onPress={() => openDoc(a.id)}>
      <DocIc icon={t.ic} t={t.c} />
      <Grow>
        <T lines={1} style={{ fontWeight: '600' }}>
          {a.title}
        </T>
        <Sub>
          {showUser ? a.user + ' · ' : ''}
          {ago(a.ts)} 제출
        </Sub>
      </Grow>
      <St kind={cls}>{label}</St>
    </ListItem>
  );
}

// ------------------------------------------------------------------
// 서류 작성
// ------------------------------------------------------------------
function openDocNew(type: string) {
  const t = docType(type);
  sheet.show(t.name, <DocNew t={t} />);
}

function DocNew({ t }: { t: DocType }) {
  const c = useColors();
  const td = iso(today());
  const init: Record<string, string> = {};
  t.fields.forEach(([n, , type]) => {
    const opt = type.endsWith('?');
    const ty = type.replace('?', '');
    if (ty.startsWith('select:')) init[n] = ty.slice(7).split(',')[0];
    else if (ty === 'date') init[n] = opt ? '' : td;
    else if (ty.startsWith('time')) init[n] = ty.split(':').slice(1).join(':');
    else if (ty.startsWith('number')) init[n] = ty.split(':')[1] || '';
    else init[n] = '';
  });
  const [f, setF] = useState(init);
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const data = D.data || { approvers: [], pick_ids: [] };
  const ap: any[] = data.approvers || [];
  const picks = (data.pick_ids || []).map((id: number) => mem(id)).filter(Boolean);
  const myLead = ap[0] ? ap[0].id : null;
  const [to, setTo] = useState<number | null>(t.pick && picks.some((m: any) => m.id === myLead) ? myLead : null);
  const up = useUploads();

  const submit = async () => {
    for (const [n, l, type] of t.fields) {
      const opt = type.endsWith('?');
      if (!opt && !String(f[n] ?? '').trim()) throw new Error(`${l.replace(/ \(.*\)$/, '')}을(를) 입력해 주세요.`);
    }
    if (t.pick && !to) throw new Error('받을 사람을 골라 주세요.');
    if (up.busy()) throw new Error('파일을 올리는 중이에요. 잠시만 기다려 주세요.');
    const r = await post('approval.create', { type: t.id, fields: f, approver_id: Number(to) || 0, files: up.ids() });
    D.filter = '전체';
    done(r.auto ? '바로 승인됐어요 (전결)' : t.pick ? `${t.name}를 제출했어요` : '결재를 요청했어요');
  };

  const fileLabel = typeof t.files === 'string' ? t.files + ' (선택)' : '영수증';
  return (
    <View>
      {t.fields.map(([n, l, type]) => {
        const opt = type.endsWith('?');
        const ty = type.replace('?', '');
        let input: React.ReactNode;
        if (ty.startsWith('select:'))
          input = (
            <Select
              value={f[n]}
              onChange={set(n)}
              options={ty
                .slice(7)
                .split(',')
                .map((o) => ({ value: o, label: o }))}
            />
          );
        else if (ty === 'textarea') input = <Input area value={f[n]} onChangeText={set(n)} placeholder="내용을 입력하세요" />;
        else if (ty === 'date') input = <DateInput value={f[n]} onChange={set(n)} clearable={opt} />;
        else if (ty.startsWith('time')) input = <DateInput mode="time" value={f[n]} onChange={set(n)} />;
        else if (ty.startsWith('number')) input = <Input value={f[n]} onChangeText={(v) => set(n)(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="0" />;
        else input = <Input value={f[n]} onChangeText={set(n)} maxLength={n === 'subject' ? 100 : 200} placeholder={n === 'subject' ? '한 줄로 요약해 주세요' : undefined} />;
        return (
          <Field key={n} label={l}>
            {input}
          </Field>
        );
      })}
      {t.files ? (
        <>
          <Field label={fileLabel} small={t.pick ? '사진, PDF, 문서 파일' : '사진이나 PDF를 올려주세요'}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn sm kind="ghost" icon="image" title="사진" onPress={() => up.pick({ images: true })} />
              <Btn sm kind="ghost" icon="clip" title="파일" onPress={() => up.pick({ types: t.pick ? ['*/*'] : ['image/*', 'application/pdf'] })} />
            </View>
          </Field>
          <UpList list={up.list} onRemove={up.remove} />
        </>
      ) : null}
      {t.pick ? (
        <Field label="받을 사람" small="고른 사람이 승인하거나 반려해요">
          <View style={{ gap: 8 }}>
            {picks.length ? (
              picks.map((m: any) => {
                const on = to === m.id;
                return (
                  <Press key={m.id} onPress={() => setTo(m.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5, borderColor: on ? c.primary : c.line, backgroundColor: on ? c.primarySoft : 'transparent' }}>
                    <Avatar m={m} size={36} noDot />
                    <View>
                      <T style={{ fontWeight: '700' }}>{m.name}</T>
                      <Sub style={{ fontSize: 12 }}>
                        {m.role === 'ceo' ? '대표' : roleLabel(m)}
                        {m.is_admin && m.role === 'member' ? ' · 관리자' : ''}
                      </Sub>
                    </View>
                  </Press>
                );
              })
            ) : (
              <Sub>받을 수 있는 사람이 없어요</Sub>
            )}
          </View>
        </Field>
      ) : (
        <>
          <Text style={{ fontSize: 13, fontWeight: '600', color: c.sub, marginBottom: 6 }}>결재선</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 14, backgroundColor: c.surface3, borderRadius: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <ApWho m={me()} name="나" role="기안" />
            {ap.length ? (
              ap.map((a: any) => (
                <React.Fragment key={a.id}>
                  <Icon name="chevR" size={18} color={c.faint} />
                  <ApWho m={mem(a.id) || { name: a.name }} name={a.name} role={a.role} />
                </React.Fragment>
              ))
            ) : (
              <Sub style={{ marginLeft: 6 }}>대표 전결로 바로 승인돼요</Sub>
            )}
          </View>
        </>
      )}
      <Btn title={t.pick ? '제출하기' : '결재 요청'} onPress={submit} />
    </View>
  );
}
function ApWho({ m, name, role }: { m: any; name: string; role: string }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Avatar m={m} noDot />
      <Text style={{ fontSize: 13, fontWeight: '600', color: c.ink }}>{name}</Text>
      <Text style={{ fontSize: 11, color: c.sub }}>{role}</Text>
    </View>
  );
}

// ------------------------------------------------------------------
// 결재 상세
// ------------------------------------------------------------------
async function openDoc(id: number) {
  sheet.show('결재 상세', <Loading />);
  try {
    const { approval } = await api('approval', { id });
    if (!sheet.open) return;
    sheet.show(docType(approval.type).pick ? docType(approval.type).name : '결재 상세', <DocDetail a={approval} />);
  } catch (e: any) {
    sheet.close();
    toast(e.message);
  }
}

function DocDetail({ a }: { a: any }) {
  const c = useColors();
  const [cls, label] = AP_ST[a.status] || AP_ST.pending;
  const t = docType(a.type);
  const [rej, setRej] = useState<string | null>(null);
  // 제목은 머리글에 이미 있으니 빼고, 긴 글은 문단으로. 서류 양식 순서대로 정렬
  const order = (k: string) => {
    const i = t.fields.findIndex((f) => f[0] === k);
    return i < 0 ? 99 : i;
  };
  const entries = Object.entries(a.fields || {})
    .filter(([k, v]) => v !== '' && v !== null && !(t.pick && k === 'subject'))
    .sort((x, y) => order(x[0]) - order(y[0]));
  const long = (k: string) => LONG_FIELDS.includes(k) || (t.pick && k === 'reason');
  const steps = a.steps.length
    ? a.steps.map((s: any) => {
        const st = ({ approved: 'done', rejected: 'rej', pending: 'now' } as any)[s.status] || '';
        const msg = ({ approved: '승인했어요', rejected: '반려 · ' + (s.note || ''), pending: '검토 중이에요', waiting: '이전 단계 대기 중', skipped: '진행 안 됨' } as any)[s.status];
        return { state: st, title: `${s.role} · ${s.approver}`, sub: `${msg}${s.status === 'approved' && s.note ? ' · ' + s.note : ''}` };
      })
    : [{ state: 'done', title: '대표 전결', sub: '바로 승인됐어요' }];

  const approve = async () => {
    await post('approval.act', { id: a.id, action: 'approve' });
    done('승인했어요');
  };
  const reject = async () => {
    if (rej === null) return setRej('');
    if (!rej.trim()) return toast('반려 사유를 적어주세요');
    await post('approval.act', { id: a.id, action: 'reject', note: rej.trim() });
    done('반려했어요');
  };
  const cancel = async () => {
    if (!(await ask({ title: '요청 취소', body: '결재 요청을 취소할까요?', ok: '요청 취소', danger: true }))) return;
    await post('approval.act', { id: a.id, action: 'cancel' });
    done('요청을 취소했어요');
  };
  let actions: React.ReactNode = null;
  if (a.my_turn)
    actions = (
      <>
        {rej !== null ? (
          <Field label="반려 사유">
            <Input area value={rej} onChangeText={setRej} placeholder="반려하는 이유를 적어주세요" autoFocus />
          </Field>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Btn kind="ghost" title={rej !== null ? '반려 보내기' : '반려'} onPress={reject} />
          </View>
          <View style={{ flex: 2 }}>
            <Btn icon="check" title="승인" onPress={approve} />
          </View>
        </View>
      </>
    );
  else if (a.can_cancel) actions = <Btn kind="ghost" title="요청 취소" onPress={cancel} />;
  else if (a.status === 'rejected' && a.user_id === me().id) actions = <Btn title="다시 작성하기" onPress={() => openDocNew(a.type)} />;

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <T style={{ fontWeight: '800', fontSize: 17, flex: 1 }}>{a.title}</T>
        <St kind={cls}>{label}</St>
      </View>
      <Sub style={{ marginTop: 4, marginBottom: 14 }}>
        {a.user} · {ago(a.ts)} 제출
      </Sub>
      <Divided>
        {entries
          .filter(([k]) => !long(k))
          .map(([k, v]) => (
            <KV key={k} k={FIELD_LABEL[k] || k} v={k === 'amount' ? won(v) : ['date', 'to'].includes(k) ? md(String(v)) : String(v)} />
          ))}
        {entries
          .filter(([k]) => long(k))
          .map(([k, v]) => (
            <View key={k} style={{ paddingVertical: 12 }}>
              <Sub style={{ marginBottom: 6 }}>{k === 'reason' ? '필요한 이유' : FIELD_LABEL[k] || k}</Sub>
              <LinkText text={String(v)} style={{ fontSize: 15, lineHeight: 25, color: c.ink }} />
            </View>
          ))}
      </Divided>
      <Files files={a.files} />
      <Timeline items={[{ state: 'done', title: '기안 · ' + a.user, sub: '제출 완료' }, ...steps]} />
      {actions ? <View style={{ marginTop: 20 }}>{actions}</View> : null}
    </View>
  );
}
