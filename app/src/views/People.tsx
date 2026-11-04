/* 임직원: 조직도 · 검색 · 사람 정보 · 대표 인사 변경 · 팀 관리 · 급여 명세 · 계약서 입력 */
import React, { useState } from 'react';
import { Linking, Text, TextInput, View } from 'react-native';
import { api, post } from '../lib/api';
import { useLoad, useUploads } from '../lib/hooks';
import { getState, isCeo, loadData, me, mem, useColors, useStore } from '../lib/store';
import { md, pad, roleLabel, ROLE } from '../lib/util';
import { Icon } from '../ui/Icon';
import {
  Avatar,
  Btn,
  BtnRow,
  Card,
  CardH,
  DateInput,
  Divided,
  Empty,
  Field,
  FieldRow,
  Grow,
  Hint,
  IconBtn,
  Input,
  KV,
  ListItem,
  Loading,
  MonthInput,
  NewBtn,
  PageH,
  Press,
  Row,
  SearchBox,
  Select,
  Sub,
  T,
  Tag,
  UpList,
} from '../ui/kit';
import { ask, sheet, toast } from '../ui/overlay';
import { Page } from '../ui/Page';
import { startDm } from './Chat';
import { ContractInfo, PayCard } from './Me';

const PP = { q: '' };

export function PeopleView() {
  const c = useColors();
  const [qs, setQs] = useState(PP.q);
  // 들어올 때마다 최신 인사 정보로
  const q = useLoad(() => loadData(), []);
  const data = useStore((s) => s.data);
  const all: any[] = data.members;
  const s = qs.trim().toLowerCase();
  const personRow = (m: any) => (
    <ListItem key={m.id} onPress={() => openPerson(m.id)}>
      <Avatar m={m} />
      <Grow>
        <Row gap={4}>
          <T style={{ fontWeight: '600' }}>{m.name}</T>
          <Sub>{m.position || ''}</Sub>
          {m.id === me().id ? <Tag>나</Tag> : null}
        </Row>
        <Sub lines={1}>
          {m.team || (m.role === 'ceo' ? '대표' : '소속 없음')}
          {m.phone ? ' · ' + m.phone : ''}
        </Sub>
      </Grow>
      {m.role !== 'member' ? <Tag kind="primary">{ROLE[m.role]}</Tag> : null}
    </ListItem>
  );
  let res: React.ReactNode;
  if (s) {
    const r = all.filter((m) => [m.name, m.team, ROLE[m.role], m.position, m.email, m.phone, m.username].join(' ').toLowerCase().includes(s));
    res = (
      <Card>
        <CardH title="검색 결과" right={<Sub>{r.length}명</Sub>} />
        {r.length ? <Divided>{r.map(personRow)}</Divided> : <Empty>찾는 사람이 없어요</Empty>}
      </Card>
    );
  } else {
    const ceo = all.filter((m) => m.role === 'ceo');
    const noTeam = all.filter((m) => m.role !== 'ceo' && !m.team_id);
    const teams = data.teams.map((t: any) => ({ ...t, ms: all.filter((m) => m.team_id === t.id && m.role !== 'ceo') }));
    const team = (key: string, name: string, ms: any[]) => (
      <View key={key} style={{ flexDirection: 'row' }}>
        <View style={{ width: 18 }}>
          <View style={{ position: 'absolute', left: 7, top: 32, width: 11, height: 2, backgroundColor: c.line }} />
        </View>
        <View style={{ flex: 1, marginTop: 10, paddingTop: 6, paddingHorizontal: 14, paddingBottom: 4, borderRadius: 16, backgroundColor: c.surface3 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
            <T style={{ fontWeight: '700' }}>{name}</T>
            <Sub>{ms.length}명</Sub>
          </View>
          {ms.length ? (
            <View style={{ borderTopWidth: 1, borderTopColor: c.line }}>
              <Divided>{ms.map(personRow)}</Divided>
            </View>
          ) : (
            <Empty style={{ paddingVertical: 10 }}>아직 팀원이 없어요</Empty>
          )}
        </View>
      </View>
    );
    res = (
      <>
        <Card>
          <CardH title="조직도" right={<Sub>팀 {teams.length}개</Sub>} />
          {ceo.map((x) => (
            <Press key={x.id} onPress={() => openPerson(x.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: c.primarySoft }}>
              <Avatar m={x} />
              <Grow>
                <T style={{ fontWeight: '600' }}>CONAS</T>
                <Sub>대표 {x.name}</Sub>
              </Grow>
              <Icon name="chevR" size={18} color={c.ink} />
            </Press>
          ))}
          <View>
            <View style={{ position: 'absolute', left: 7, top: 0, bottom: 28, width: 2, backgroundColor: c.line }} />
            {teams.map((t: any) => team('t' + t.id, t.name, t.ms))}
            {noTeam.length ? team('none', '소속 없음', noTeam) : null}
          </View>
        </Card>
        <Sub style={{ paddingHorizontal: 4, lineHeight: 22 }}>업무 배정은 대표 → 전원, 팀장 → 자기 팀원 · 결재는 팀장 → 대표</Sub>
      </>
    );
  }
  return (
    <Page q={{ ...q, data: q.data || (q.error ? null : data) }}>
      <PageH
        title="임직원"
        sub={`CONAS · ${all.length}명${isCeo() ? ' · 직원을 누르면 직책을 바꿀 수 있어요' : ''}`}
        right={isCeo() ? <NewBtn icon="settings" title="팀 관리" onPress={openTeams} /> : null}
      />
      <SearchBox
        value={qs}
        onChange={(v) => {
          PP.q = v;
          setQs(v);
        }}
        placeholder="이름, 팀, 직책, 연락처로 검색"
      />
      {res}
    </Page>
  );
}

// ==================================================================
// 사람 정보 (어디서나 열 수 있음)
// ==================================================================
export function openPerson(id: number) {
  const m = mem(id);
  if (!m) return;
  sheet.show('', <Person id={id} />);
}

function Person({ id }: { id: number }) {
  const c = useColors();
  const m = useStore((s) => s.data.memberMap[id]);
  if (!m) return <Empty>정보를 찾을 수 없어요</Empty>;
  const ceo = isCeo() && m.role !== 'ceo';
  const tel = m.phone ? 'tel:' + m.phone.replace(/[^0-9+]/g, '') : '';
  return (
    <View>
      <View style={{ alignItems: 'center', gap: 4, paddingBottom: 18 }}>
        <View style={{ marginBottom: 6 }}>
          <Avatar m={m} size={72} />
        </View>
        <T style={{ fontSize: 20, fontWeight: '800' }}>{m.name}</T>
        <Sub style={{ fontSize: 14 }}>{roleLabel(m)}</Sub>
        <Text style={{ fontSize: 13, color: m.online ? c.ok : c.sub }}>{m.online ? '● 접속 중' : '오프라인'}</Text>
      </View>
      <Divided>
        <KV k="소속" v={m.team || (m.role === 'ceo' ? 'CONAS' : '소속 없음')} />
        <KV k="직급 · 직책" v={`${m.position || '-'} · ${ROLE[m.role]}`} />
        <KV k="이메일">
          <Text style={{ fontSize: 15, fontWeight: '600', color: c.ink, textAlign: 'right' }} onPress={() => Linking.openURL('mailto:' + m.email)}>
            {m.email}
          </Text>
        </KV>
        <KV k="연락처">
          {m.phone ? (
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.ink }} onPress={() => Linking.openURL(tel)}>
              {m.phone}
            </Text>
          ) : (
            <Text style={{ fontSize: 15, color: c.sub }}>없음</Text>
          )}
        </KV>
        {m.joined_on ? <KV k="입사일" v={md(m.joined_on)} /> : null}
      </Divided>
      {m.id !== me().id ? (
        <BtnRow style={{ marginTop: 18 }}>
          <Btn icon="message" title="DM 보내기" onPress={() => startDm(m.id)} />
          {m.phone ? <Btn kind="ghost" icon="phone" title="전화" onPress={() => Linking.openURL(tel)} /> : null}
        </BtnRow>
      ) : null}
      {ceo ? <MemberAdmin m={m} /> : null}
    </View>
  );
}

function AdminBox({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ marginTop: 20, padding: 16, borderRadius: 16, backgroundColor: c.surface3, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line2 }}>
      <Row gap={6} style={{ marginBottom: 14 }}>
        <Icon name={icon} size={16} w={2} color={c.leave} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: c.leave }}>{title}</Text>
      </Row>
      {children}
    </View>
  );
}

function MemberAdmin({ m }: { m: any }) {
  const data = getState().data;
  const [f, setF] = useState({
    team_id: m.team_id ? String(m.team_id) : '',
    role: m.role,
    position: m.position || '',
    joined_on: m.joined_on || '',
    annual_leave: m.annual_leave === null || m.annual_leave === undefined ? '' : String(m.annual_leave),
  });
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const team = Number(f.team_id) || null;
  const prev = f.role === 'lead' ? data.members.find((x: any) => x.team_id === team && x.role === 'lead' && x.id !== m.id) : null;
  let hint = f.role === 'lead' ? '팀원에게 업무를 배정하고, 결재와 완료 검토를 맡게 돼요.' : '직책을 바꾸면 업무 배정과 결재 권한이 바로 바뀌어요.';
  let warn = false;
  if (f.role === 'lead' && !team) {
    warn = true;
    hint = '팀장은 소속 팀이 있어야 해요.';
  } else if (prev) {
    warn = true;
    hint = `기존 팀장 ${prev.name}님은 팀원으로 바뀌어요. 팀장은 팀에 한 명이에요.`;
  } else if (m.role === 'lead' && (f.role === 'member' || team !== m.team_id)) {
    warn = true;
    hint = `${m.team || '팀'}에 팀장이 없어져요. 결재와 검토는 대표에게 바로 가요.`;
  }
  const save = async () => {
    const body = { user_id: m.id, team_id: Number(f.team_id) || 0, role: f.role, position: f.position, joined_on: f.joined_on, annual_leave: f.annual_leave };
    const r = await post('member.update', body);
    await loadData();
    const nm = mem(m.id);
    toast(`${nm.name}님을 ${roleLabel(nm)}(으)로 바꿨어요${r.demoted ? ` · ${mem(r.demoted).name}님은 팀원` : ''}`);
    openPerson(m.id);
  };
  return (
    <AdminBox title="대표 전용 · 인사 변경" icon="settings">
      <Field label="소속 팀">
        <Select value={f.team_id} onChange={set('team_id')} options={[{ value: '', label: '소속 없음' }, ...data.teams.map((t: any) => ({ value: String(t.id), label: t.name }))]} />
      </Field>
      <FieldRow>
        <Field label="직책 (권한)">
          <Select
            value={f.role}
            onChange={set('role')}
            options={[
              { value: 'member', label: '팀원' },
              { value: 'lead', label: '팀장' },
            ]}
          />
        </Field>
        <Field label="직급">
          <Select value={f.position} onChange={set('position')} options={[{ value: '', label: '없음' }, ...data.positions.filter((p: string) => p !== '대표이사').map((p: string) => ({ value: p, label: p }))]} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="입사일">
          <DateInput value={f.joined_on} onChange={set('joined_on')} clearable placeholder="없음" />
        </Field>
        <Field label="올해 연차 (일)">
          <Input value={f.annual_leave} onChangeText={(v) => set('annual_leave')(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="예: 15" />
        </Field>
      </FieldRow>
      <Hint warn={warn}>{hint}</Hint>
      <Btn title="변경 저장" onPress={save} />
      <BtnRow style={{ marginTop: 10 }}>
        <Btn kind="ghost" icon="card" title="급여 명세" onPress={() => openPayAdmin(m.id)} />
        <Btn kind="ghost" icon="file" title="계약서" onPress={() => openContractAdmin(m.id)} />
      </BtnRow>
    </AdminBox>
  );
}

// ==================================================================
// 팀 관리 (대표)
// ==================================================================
function openTeams() {
  sheet.show('팀 관리', <Teams />);
}
function Teams() {
  const c = useColors();
  const teams = useStore((s) => s.data.teams) as any[];
  const [names, setNames] = useState<Record<number, string>>({});
  const [newName, setNewName] = useState('');
  const save = async (id: number | null, name: string) => {
    if (!name.trim()) throw new Error('팀 이름을 입력해 주세요.');
    await post('team.save', id ? { id, name } : { name });
    await loadData();
    toast(id ? '팀 이름을 바꿨어요' : '팀을 추가했어요');
    if (!id) setNewName('');
  };
  const del = async (id: number) => {
    if (!(await ask({ title: '팀 삭제', body: '이 팀을 지울까요?', ok: '삭제', danger: true }))) return;
    await post('team.delete', { id });
    await loadData();
    toast('팀을 지웠어요');
  };
  const inputStyle = { flex: 1, minWidth: 0, height: 44, borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingHorizontal: 12, backgroundColor: c.surface, fontSize: 15, color: c.ink };
  return (
    <View>
      {teams.map((t) => (
        <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <TextInput value={names[t.id] ?? t.name} onChangeText={(v) => setNames({ ...names, [t.id]: v })} maxLength={50} style={inputStyle} />
          <Btn sm kind="ghost" title="저장" onPress={() => save(t.id, names[t.id] ?? t.name)} />
          <Btn sm kind="danger" title="삭제" onPress={() => del(t.id)} />
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }}>
        <TextInput value={newName} onChangeText={setNewName} maxLength={50} placeholder="새 팀 이름" placeholderTextColor={c.faint} style={inputStyle} />
        <Btn sm icon="plus" title="추가" onPress={() => save(null, newName)} />
      </View>
      <Sub style={{ marginTop: 14 }}>사람이 있는 팀은 지울 수 없어요. 먼저 다른 팀으로 옮겨 주세요.</Sub>
    </View>
  );
}

// ==================================================================
// 급여 명세 입력 (대표)
// ==================================================================
const PAY_TEMPLATE: [string, string][] = [
  ['기본급', 'pay'],
  ['식대 (비과세)', 'pay'],
  ['국민연금', 'deduct'],
  ['건강보험', 'deduct'],
  ['장기요양보험', 'deduct'],
  ['고용보험', 'deduct'],
  ['소득세', 'deduct'],
  ['지방소득세', 'deduct'],
];
async function openPayAdmin(uid: number) {
  const m = mem(uid);
  sheet.show('급여 명세', <Loading />);
  try {
    const pay = await api('pay', { user_id: uid });
    if (sheet.open) sheet.show(`${m.name} · 급여 명세`, <PayAdmin uid={uid} pay0={pay} />);
  } catch (e: any) {
    sheet.close();
    toast(e.message);
  }
}
let rowKey = 0;
function PayAdmin({ uid, pay0 }: { uid: number; pay0: any }) {
  const c = useColors();
  const [pay, setPay] = useState(pay0);
  const [shown, setShown] = useState({ idx: 0, n: 0 });
  const last = pay0.slips[0];
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
  const [memo, setMemo] = useState('');
  const [rows, setRows] = useState<{ k: number; label: string; amount: string; kind: string }[]>(
    (last ? last.items : PAY_TEMPLATE.map(([label, kind]) => ({ label, kind, amount: '' }))).map((it: any) => ({ k: ++rowKey, label: it.label, amount: String(it.amount ?? ''), kind: it.kind }))
  );
  const upd = (i: number, p: any) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const save = async () => {
    const items = rows.map((r) => ({ label: r.label, amount: Number(r.amount) || 0, kind: r.kind })).filter((x) => x.label && x.amount > 0);
    const r = await post('pay.save', { user_id: uid, month, memo, items });
    setPay(r);
    setShown({ idx: Math.max(0, r.slips.findIndex((x: any) => x.month === month)), n: shown.n + 1 });
    toast('급여 명세를 저장했어요');
  };
  const cell = { height: 42, borderWidth: 1, borderColor: c.line, borderRadius: 10, paddingHorizontal: 10, backgroundColor: c.surface, fontSize: 14, color: c.ink };
  return (
    <View>
      <PayCard key={shown.n} pay={pay} start={shown.idx} />
      <AdminBox title="명세 입력 · 같은 달이 있으면 덮어써요" icon="pen">
        <Field label="지급 월">
          <MonthInput value={month} onChange={setMonth} />
        </Field>
        <Sub style={{ marginBottom: 8 }}>급여 프로그램이나 세무사가 계산한 금액을 그대로 옮겨 적어 주세요.</Sub>
        {rows.map((r, i) => (
          <View key={r.k} style={{ flexDirection: 'row', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <TextInput value={r.label} onChangeText={(v) => upd(i, { label: v })} placeholder="항목" placeholderTextColor={c.faint} maxLength={50} style={[cell, { flex: 1, minWidth: 0 }]} />
            <TextInput value={r.amount} onChangeText={(v) => upd(i, { amount: v.replace(/[^0-9]/g, '') })} placeholder="금액" placeholderTextColor={c.faint} keyboardType="number-pad" style={[cell, { width: 100 }]} />
            <Press onPress={() => upd(i, { kind: r.kind === 'pay' ? 'deduct' : 'pay' })} style={[cell, { width: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 0 }]}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: r.kind === 'pay' ? c.ink : c.danger }}>{r.kind === 'pay' ? '지급' : '공제'}</Text>
            </Press>
            <IconBtn name="x" size={16} label="줄 삭제" style={{ width: 32, height: 42 }} onPress={() => setRows(rows.filter((_, k) => k !== i))} />
          </View>
        ))}
        <Btn sm kind="ghost" icon="plus" title="항목 추가" onPress={() => setRows([...rows, { k: ++rowKey, label: '', amount: '', kind: 'pay' }])} style={{ marginTop: 4, marginBottom: 14 }} />
        <Field label="메모 (선택)">
          <Input value={memo} onChangeText={setMemo} maxLength={255} />
        </Field>
        <Btn title="저장하고 알리기" onPress={save} />
      </AdminBox>
    </View>
  );
}

// ==================================================================
// 근로계약서 등록 (대표)
// ==================================================================
async function openContractAdmin(uid: number) {
  sheet.show('근로계약서', <Loading />);
  try {
    const pay = await api('pay', { user_id: uid });
    if (sheet.open) sheet.show(`${mem(uid).name} · 근로계약서`, <ContractAdmin uid={uid} c={pay.contract} />);
  } catch (e: any) {
    sheet.close();
    toast(e.message);
  }
}
function ContractAdmin({ uid, c: ct }: { uid: number; c: any }) {
  const m = mem(uid);
  const [f, setF] = useState({
    type: ct ? ct.type || '정규직' : '정규직',
    title: ct ? ct.title : '근로계약서',
    start: ct && ct.start ? ct.start : m.joined_on || '',
    end: ct && ct.end ? ct.end : '',
    hours: ct ? ct.hours || '' : '09:00 – 18:00 (휴게 1시간)',
    salary: ct ? ct.salary || '' : '',
  });
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const up = useUploads();
  const save = async () => {
    if (up.busy()) throw new Error('파일을 올리는 중이에요. 잠시만 기다려 주세요.');
    const ids = up.ids();
    await post('contract.save', { user_id: uid, ...f, file_id: ids[0] || 0 });
    sheet.close();
    toast('계약서를 등록했어요');
  };
  return (
    <View>
      {ct ? <ContractInfo c={ct} /> : <Sub>아직 등록된 계약서가 없어요.</Sub>}
      <AdminBox title={ct ? '새로 등록 (가장 최근 계약서가 보여요)' : '계약서 등록'} icon="pen">
        <FieldRow>
          <Field label="계약 형태">
            <Select value={f.type} onChange={set('type')} options={['정규직', '계약직', '인턴', '파트타임'].map((x) => ({ value: x, label: x }))} />
          </Field>
          <Field label="제목">
            <Input value={f.title} onChangeText={set('title')} maxLength={100} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="시작일">
            <DateInput value={f.start} onChange={set('start')} clearable placeholder="없음" />
          </Field>
          <Field label="종료일 (선택)">
            <DateInput value={f.end} onChange={set('end')} clearable placeholder="없음" />
          </Field>
        </FieldRow>
        <Field label="근무 시간">
          <Input value={f.hours} onChangeText={set('hours')} maxLength={50} />
        </Field>
        <Field label="급여">
          <Input value={f.salary} onChangeText={set('salary')} maxLength={100} placeholder="예: 연봉 40,000,000원" />
        </Field>
        <Field>
          <Btn
            sm
            kind="ghost"
            icon="clip"
            title="계약서 파일 (PDF)"
            onPress={() => {
              up.set([]);
              return up.pick({ multiple: false, types: ['application/pdf', 'image/*'] });
            }}
          />
        </Field>
        <UpList list={up.list} onRemove={up.remove} />
        <Btn title="등록하고 알리기" onPress={save} />
      </AdminBox>
    </View>
  );
}
