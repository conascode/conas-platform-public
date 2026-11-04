/* 홈: 출근 QR(데모) · 오늘 할 일 · 공지 · 이번 주 일정 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { post } from '../lib/api';
import { useLoad } from '../lib/hooks';
import { L } from '../lib/loaders';
import { go, me, refresh, setBadges, useColors, useStore } from '../lib/store';
import { dotColor } from '../lib/theme';
import { addDays, ago, DOW, iso, md, toDate, today } from '../lib/util';
import { Icon } from '../ui/Icon';
import { Btn, Card, CardH, DateInput, Divided, DocIc, Empty, Field, FieldRow, Grow, Hint, Input, KV, ListItem, More, Press, Select, St, Sub, T, Tag } from '../ui/kit';
import { ask, sheet, toast } from '../ui/overlay';
import { Page } from '../ui/Page';

let selDay: number | null = null;

export function HomeView() {
  const c = useColors();
  const pending = useStore((s) => s.badges.pending || 0);
  const [key, load] = L.home();
  const q = useLoad(key, async () => {
    const d = await load();
    setBadges(d.badges);
    return d;
  });
  const [day, setDay] = useState<number>(selDay ?? new Date().getDay());
  useEffect(() => {
    selDay = day;
  }, [day]);

  return (
    <Page q={q}>
      {(home: any) => {
        const start = toDate(home.week_start);
        const days = [...Array(7)].map((_, i) => addDays(start, i));
        const sel = days[day] || days[0];
        const selIso = iso(sel);
        const evs = home.events.filter((e: any) => e.date === selIso);
        const hasEv = new Set(home.events.map((e: any) => e.date));
        return (
          <>
            <QrCard home={home} />
            {pending ? (
              <Card>
                <Press onPress={() => go('admin/members')} style={st.todayTask}>
                  <DocIc icon="user" t="warn" iconSize={20} />
                  <Grow>
                    <T style={{ fontWeight: '600' }}>가입 승인을 기다리는 사람이 {pending}명 있어요</T>
                    <Sub>눌러서 승인하기</Sub>
                  </Grow>
                  <Icon name="chevR" size={18} color={c.ink} />
                </Press>
              </Card>
            ) : null}
            <Card>
              <Press onPress={() => go('ws/task')} style={st.todayTask}>
                <DocIc icon="checkSq" t="primary" iconSize={20} />
                <Grow>
                  <T style={{ fontWeight: '600' }}>오늘 할 일 {home.today_tasks}건</T>
                  <Sub lines={1}>
                    {home.first_task ? (
                      <>
                        {home.late_tasks ? <Text style={{ color: c.danger }}>지연 {home.late_tasks}건 · </Text> : null}
                        {home.first_task}
                        {home.open_tasks > 1 ? ` 외 ${home.open_tasks - 1}건` : ''}
                      </>
                    ) : (
                      '남은 업무가 없어요'
                    )}
                  </Sub>
                </Grow>
                <Icon name="chevR" size={18} color={c.ink} />
              </Press>
            </Card>

            <Card>
              <CardH title="공지" right={<More title="전체" icon="chevR" onPress={() => go('ws/notice')} />} />
              {home.notices.length ? (
                <Divided>
                  {home.notices.map((n: any) => (
                    <ListItem key={n.id} onPress={() => go(`ws/notice/${n.id}`)}>
                      <Tag kind={n.must ? 'danger' : 'primary'}>{n.must ? '필독' : n.category}</Tag>
                      <Grow>
                        <T lines={1} style={[{ fontWeight: '600' }, n.read && !n.need_confirm ? { fontWeight: '500', color: c.ink2 } : null]}>
                          {n.title}
                        </T>
                      </Grow>
                      {n.need_confirm ? <St kind="late">확인 필요</St> : <Sub>{ago(n.ts)}</Sub>}
                    </ListItem>
                  ))}
                </Divided>
              ) : (
                <Empty>아직 공지가 없어요</Empty>
              )}
            </Card>

            <Card>
              <CardH title="일정" right={<More title="일정 추가" icon="plus" onPress={() => openEventNew(home, day)} />} />
              <View style={st.week}>
                {days.map((d, i) => {
                  const on = i === day;
                  const has = hasEv.has(iso(d));
                  return (
                    <Press key={i} onPress={() => setDay(i)} style={[st.weekBtn, on && { backgroundColor: c.ink }]}>
                      <Text style={{ fontSize: 12, color: on ? c.faint : c.sub }}>{DOW[i]}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: on ? c.surface : i === 0 ? c.danger : i === 6 ? c.primary : c.ink }}>{d.getDate()}</Text>
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: has ? (on ? c.surface : c.primary) : 'transparent' }} />
                    </Press>
                  );
                })}
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.sub, marginBottom: 4 }}>
                {md(sel)}
                {selIso === iso(today()) ? ' · 오늘' : ''}
              </Text>
              {evs.length ? (
                evs.map((e: any) => (
                  <Press key={e.id} onPress={() => openEvent(e)} style={st.ev}>
                    <Text style={{ width: 44, fontSize: 13, fontWeight: '700', color: c.ink2, paddingTop: 2 }}>{e.time}</Text>
                    <View style={{ width: 3, borderRadius: 2, backgroundColor: dotColor(c, e.color) }} />
                    <Grow>
                      <T style={{ fontWeight: '600' }}>{e.title}</T>
                      <Sub>
                        {e.place || ''}
                        {e.place ? ' · ' : ''}
                        {e.team ? e.team : '전사'}
                      </Sub>
                    </Grow>
                  </Press>
                ))
              ) : (
                <Empty>일정이 없어요</Empty>
              )}
            </Card>
          </>
        );
      }}
    </Page>
  );
}

// ---------- 출근 QR (데모) ----------
function QrCard({ home }: { home: any }) {
  const c = useColors();
  const a = home.att;
  if (a && ['leave', 'half_am', 'half_pm'].includes(a.kind) && !a.in) {
    return (
      <View style={[st.qr, { backgroundColor: c.surface }]}>
        <View style={[st.qrIc, { backgroundColor: c.surface2 }]}>
          <Icon name="moon" size={26} w={2} color={c.ink} />
        </View>
        <Grow>
          <Text style={[st.qrTitle, { color: c.ink }]}>오늘은 {a.kind === 'leave' ? '연차' : '반차'}예요</Text>
          <Text style={{ fontSize: 13, color: c.ink, opacity: 0.85 }}>푹 쉬세요!</Text>
        </Grow>
      </View>
    );
  }
  const doneDay = a && a.out;
  const working = a && a.in && !a.out;
  const title = doneDay ? '오늘 근무 끝!' : working ? '퇴근 QR' : '출근 QR';
  const sub = doneDay ? `${a.in} 출근 · ${a.out} 퇴근` : working ? `${a.in} 출근 · 근무 중` : `${md(today())} · 아직 출근 전이에요`;
  const fg = doneDay ? c.ink : '#fff';
  const bg = doneDay ? c.surface : working ? '#0ca678' : '#2f5bea';
  return (
    <Press onPress={doneDay ? undefined : () => openQr(home)} style={[st.qr, { backgroundColor: bg }, !doneDay && st.qrShadow]}>
      {!doneDay ? <Gradient from={working ? '#0ca678' : '#2f5bea'} to={working ? '#2f5bea' : '#5b3fe0'} /> : null}
      <View style={[st.qrIc, { backgroundColor: doneDay ? c.surface2 : 'rgba(255,255,255,0.18)' }]}>
        <Icon name={doneDay ? 'check' : 'qr'} size={28} w={2} color={fg} />
      </View>
      <Grow>
        <Text style={[st.qrTitle, { color: fg }]}>{title}</Text>
        <Text style={{ fontSize: 13, color: fg, opacity: 0.85 }}>{sub}</Text>
      </Grow>
      {!doneDay ? <Icon name="chevR" size={22} w={2.2} color={fg} /> : null}
    </Press>
  );
}

/** 135도 그라데이션 배경 (웹의 linear-gradient) */
function Gradient({ from, to }: { from: string; to: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="qrg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#qrg)" />
    </Svg>
  );
}

const QN = 25;
/** 데모 QR 점 무늬 (모서리 세 곳의 네모 자리는 비움) */
function randomDots(): [number, number][] {
  const inF = (x: number, y: number) => (x < 8 && y < 8) || (x >= QN - 8 && y < 8) || (x < 8 && y >= QN - 8);
  const out: [number, number][] = [];
  for (let y = 0; y < QN; y++) for (let x = 0; x < QN; x++) if (!inF(x, y) && Math.random() < 0.47) out.push([x, y]);
  return out;
}

function FakeQr({ dots }: { dots: [number, number][] }) {
  const N = QN;
  const cells = dots.map(([x, y]) => <Rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />);
  const fin = (x: number, y: number) => [
    <Rect key={`a${x}${y}`} x={x} y={y} width={7} height={7} />,
    <Rect key={`b${x}${y}`} x={x + 1} y={y + 1} width={5} height={5} fill="#fff" />,
    <Rect key={`c${x}${y}`} x={x + 2} y={y + 2} width={3} height={3} />,
  ];
  return (
    <Svg viewBox={`0 0 ${N} ${N}`} width={196} height={196} fill="#191f28">
      {cells}
      {fin(0, 0)}
      {fin(N - 7, 0)}
      {fin(0, N - 7)}
    </Svg>
  );
}

function QrSheet({ out }: { out: boolean }) {
  const c = useColors();
  const [sec, setSec] = useState(30);
  const [dots, setDots] = useState(randomDots);
  const t = useRef<any>(null);
  useEffect(() => {
    t.current = setInterval(() => {
      setSec((s) => {
        if (s <= 1) {
          setDots(randomDots());
          return 30;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t.current);
  }, []);
  const check = async () => {
    const action = out ? 'out' : 'in';
    const r = await post('att.check', { action });
    sheet.close();
    toast(action === 'in' ? `${r.time} 출근했어요${r.late ? ' (지각)' : ''}` : `${r.time} 퇴근했어요. 수고하셨어요!`);
    refresh();
  };
  return (
    <View>
      <View style={{ alignItems: 'center', gap: 14, paddingTop: 6, paddingBottom: 18 }}>
        <Text style={{ fontSize: 12, color: c.warn, backgroundColor: c.warnSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, fontWeight: '600', overflow: 'hidden' }}>
          데모 화면이에요 · 실제 QR 인식은 아직 없어요
        </Text>
        <View style={{ padding: 14, borderRadius: 20, borderWidth: 1, borderColor: c.line, backgroundColor: '#fff' }}>
          <FakeQr dots={dots} />
        </View>
        <Text style={{ fontSize: 13, color: c.sub }}>
          <Text style={{ color: c.primary, fontWeight: '700' }}>{sec}</Text>초 후 새 QR로 바뀌어요
        </Text>
      </View>
      <Btn icon="check" title={`${out ? '퇴근' : '출근'} 기록하기`} onPress={check} />
    </View>
  );
}
function openQr(home: any) {
  const out = !!(home.att && home.att.in);
  sheet.show(out ? '퇴근 QR' : '출근 QR', <QrSheet out={out} />);
}

// ---------- 일정 ----------
function openEvent(e: any) {
  sheet.show('일정', <EventSheet e={e} />);
}
function EventSheet({ e }: { e: any }) {
  const del = async () => {
    if (!(await ask({ title: '일정 삭제', body: '이 일정을 지울까요?', ok: '삭제', danger: true }))) return;
    await post('event.delete', { id: e.id });
    toast('일정을 지웠어요');
    refresh();
  };
  return (
    <View>
      <T style={{ fontSize: 19, fontWeight: '800', marginBottom: 12 }}>{e.title}</T>
      <Divided>
        <KV k="날짜" v={`${md(e.date)} ${e.time}`} />
        <KV k="장소" v={e.place || '-'} />
        <KV k="범위" v={e.team ? e.team : '전사'} />
      </Divided>
      {e.can_delete ? (
        <View style={{ marginTop: 18 }}>
          <Btn kind="danger" icon="trash" title="일정 삭제" onPress={del} />
        </View>
      ) : null}
    </View>
  );
}

function openEventNew(home: any, day: number) {
  sheet.show('일정 추가', <EventNew date={iso(addDays(toDate(home.week_start), day))} />);
}
function EventNew({ date: d0 }: { date: string }) {
  const m = me();
  const canCompany = !!m.can_manage;
  const hasTeam = !!m.team_id;
  const scopes = [...(hasTeam ? [{ value: 'team', label: `우리 팀 (${m.team})` }] : []), ...(canCompany ? [{ value: 'company', label: '전사' }] : [])];
  const [f, setF] = useState({ title: '', date: d0, time: '10:00', place: '', scope: scopes[0]?.value || '', color: 'primary' });
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!f.title.trim()) throw new Error('제목을 입력해 주세요.');
    await post('event.save', f);
    sheet.close();
    toast('일정을 추가했어요');
    refresh();
  };
  return (
    <View>
      <Field label="제목">
        <Input value={f.title} onChangeText={set('title')} maxLength={200} placeholder="예: 주간 회의" autoFocus />
      </Field>
      <FieldRow>
        <Field label="날짜">
          <DateInput value={f.date} onChange={set('date')} />
        </Field>
        <Field label="시간">
          <DateInput mode="time" value={f.time} onChange={set('time')} />
        </Field>
      </FieldRow>
      <Field label="장소 (선택)">
        <Input value={f.place} onChangeText={set('place')} maxLength={100} placeholder="예: 회의실 A" />
      </Field>
      <Field label="범위">
        <Select value={f.scope} options={scopes} onChange={set('scope')} />
      </Field>
      <Field label="색">
        <Select
          value={f.color}
          onChange={set('color')}
          options={[
            { value: 'primary', label: '파랑' },
            { value: 'ok', label: '초록' },
            { value: 'warn', label: '주황' },
            { value: 'danger', label: '빨강' },
            { value: 'leave', label: '보라' },
          ]}
        />
      </Field>
      <Btn title="추가하기" onPress={save} disabled={!scopes.length} />
      {!scopes.length ? <Hint warn style={{ marginTop: 10 }}>소속 팀이 없어서 일정을 추가할 수 없어요.</Hint> : null}
    </View>
  );
}

const st = StyleSheet.create({
  todayTask: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qr: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 18, marginBottom: 12, overflow: 'hidden' },
  qrShadow: { shadowColor: '#2f5bea', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  qrIc: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  qrTitle: { fontSize: 18, fontWeight: '800' },
  week: { flexDirection: 'row', gap: 4, marginBottom: 14 },
  weekBtn: { flex: 1, alignItems: 'center', gap: 4, paddingTop: 8, paddingBottom: 4, borderRadius: 12 },
  ev: { flexDirection: 'row', gap: 12, paddingVertical: 10, alignItems: 'stretch' },
});
