/* 워크스페이스 > 근태: 월간 달력 · 주간 목록 */
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { cacheGet, cacheSet, prefetch, useLoad } from '../lib/hooks';
import { L } from '../lib/loaders';
import { go, me, useColors } from '../lib/store';
import { dotColor } from '../lib/theme';
import { addDays, DOW, iso, md, monthKey, today } from '../lib/util';
import { Btn, Card, CardH, Divided, ErrorView, IconBtn, PageH, Press, Seg, St, Stat, Stats, Sub, T } from '../ui/kit';
import { Page, Skeleton } from '../ui/Page';

const ST_LABEL: Record<string, string> = { ok: '정상', late: '지각', leave: '연차', half: '반차', no: '결근' };
const AT = { view: 'month', off: 0, sel: null as string | null };

function diffH(a: string, b: string) {
  const [h1, m1] = a.split(':').map(Number);
  const [h2, m2] = b.split(':').map(Number);
  const t = Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1) - 60);
  return `${Math.floor(t / 60)}시간 ${t % 60}분`;
}

/** 월간이면 그 달 1일, 주간이면 그 주 월요일 */
function range(view: string, off: number) {
  const td = today();
  const base = new Date(td.getFullYear(), td.getMonth() + (view === 'month' ? off : 0), 1);
  const mon = addDays(td, -((td.getDay() + 6) % 7) + (view === 'week' ? off : 0) * 7);
  const weekDays = [...Array(5)].map((_, i) => addDays(mon, i));
  // 이번 달(위쪽 숫자용) + 보여줄 달
  const months = [monthKey(td), ...(view === 'month' ? [monthKey(base)] : weekDays.map(monthKey))].filter((k, i, a) => a.indexOf(k) === i);
  const end = addDays(mon, 4);
  const title = view === 'month' ? `${base.getFullYear()}년 ${base.getMonth() + 1}월` : `${mon.getMonth() + 1}.${mon.getDate()} – ${end.getMonth() + 1}.${end.getDate()}`;
  return { base, mon, weekDays, months, title };
}

/** 달마다 따로 기억해 둔 근태 기록을 모아서 (하나라도 없으면 null) */
const fromCache = (months: string[]) => (months.every((m) => cacheGet(L.att(m)[0])) ? Object.fromEntries(months.map((m) => [m, cacheGet(L.att(m)[0])])) : null);

export function AttView() {
  const c = useColors();
  const [view, setView] = useState(AT.view);
  const [off, setOff] = useState(AT.off);
  const [sel, setSel] = useState<string | null>(AT.sel);
  useEffect(() => {
    AT.view = view;
    AT.off = off;
    AT.sel = sel;
  }, [view, off, sel]);

  const req = range(view, off);
  const q = useLoad('attv:' + req.months.join(','), async () => {
    const rows = await Promise.all(
      req.months.map(async (m) => {
        const [k, load] = L.att(m);
        const d = await load();
        cacheSet(k, d);
        return [m, d] as const;
      })
    );
    return Object.fromEntries(rows);
  });

  // 지금 고른 달의 기록이 아직 없으면, 받을 때까지 마지막으로 보던 달을 흐리게 보여줌
  const have = q.data && req.months.every((m) => (q.data as any)[m]) ? (q.data as any) : fromCache(req.months);
  const [last, setLast] = useState<{ view: string; off: number; data: any } | null>(null);
  const same = (a: any, b: any) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);
  if (have && (!last || last.view !== view || last.off !== off || !same(last.data, have))) setLast({ view, off, data: have });
  const shown = have ? { view, off, data: have } : last;
  const stale = !have && !!shown;

  // 옆 달도 미리 받아둠
  useEffect(() => {
    if (!have || view !== 'month') return;
    [-1, 1].forEach((n) => range('month', off + n).months.forEach((m) => prefetch(...L.att(m))));
  }, [!!have, view, off]);

  const td = today();
  const cur = shown ? shown.data[monthKey(td)] : null;
  let body: React.ReactNode = null;
  if (!shown) body = q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Skeleton cards={1} style={{ marginTop: 4 }} />;
  else if (shown.view === 'month') {
    const { base } = range('month', shown.off);
    const data = shown.data[monthKey(base)];
    const y = base.getFullYear();
    const m = base.getMonth();
    const dim = new Date(y, m + 1, 0).getDate();
    const s = sel && sel.slice(0, 7) === monthKey(base) ? sel : monthKey(base) === monthKey(td) ? iso(td) : `${monthKey(base)}-01`;
    const cells: React.ReactNode[] = [];
    for (let i = 0; i < base.getDay(); i++) cells.push(<View key={'e' + i} style={{ width: `${100 / 7}%` }} />);
    for (let i = 1; i <= dim; i++) {
      const d = new Date(y, m, i);
      const dIso = iso(d);
      const rec = data.days[dIso];
      const wd = d.getDay();
      const isToday = dIso === iso(td);
      const color = d > td ? c.faint : wd === 0 ? c.danger : wd === 6 ? c.primary : c.ink;
      cells.push(
        <View key={dIso} style={{ width: `${100 / 7}%`, padding: 1 }}>
          <Press onPress={() => setSel(dIso)} style={{ height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: dIso === s ? c.primarySoft : 'transparent' }}>
            <View style={isToday ? { width: 26, height: 26, borderRadius: 13, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center', marginTop: -4 } : null}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: isToday ? c.surface : color }}>{i}</Text>
            </View>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: rec ? dotColor(c, rec.status) : 'transparent' }} />
          </Press>
        </View>
      );
    }
    const rec = data.days[s];
    body = (
      <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{cells}</View>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            [c.ok, '정상'],
            [c.warn, '지각'],
            [c.leave, '연차·반차'],
            [c.danger, '결근'],
          ].map(([col, l]) => (
            <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: col }} />
              <Sub style={{ fontSize: 12 }}>{l}</Sub>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: c.surface3, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <T style={{ fontSize: 14, fontWeight: '700' }}>{md(s)}</T>
          {rec ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {rec.in ? (
                <Sub>
                  {rec.in} – {rec.out || '근무 중'}
                </Sub>
              ) : null}
              <St kind={rec.status}>{ST_LABEL[rec.status]}</St>
            </View>
          ) : (
            <Sub>기록 없음</Sub>
          )}
        </View>
      </>
    );
  } else {
    const { weekDays } = range('week', shown.off);
    body = (
      <Divided>
        {weekDays.map((d) => {
          const rec = shown.data[monthKey(d)].days[iso(d)];
          let time: React.ReactNode;
          if (rec && rec.in)
            time = (
              <>
                <Text style={{ fontSize: 14, color: c.ink2 }}>
                  {rec.in} – {rec.out || '근무 중'}
                </Text>
                <Text style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>{rec.out ? '근무 ' + diffH(rec.in, rec.out) : '출근 완료'}</Text>
              </>
            );
          else if (rec && ['leave', 'half'].includes(rec.status)) time = <Text style={{ fontSize: 14, color: c.ink2 }}>{rec.note || ST_LABEL[rec.status]}</Text>;
          else time = <Sub style={{ fontSize: 14 }}>{d > td ? '예정' : '기록 없음'}</Sub>;
          return (
            <View key={iso(d)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
              <View style={{ width: 46, alignItems: 'center' }}>
                <T style={{ fontSize: 18, fontWeight: '800' }}>{d.getDate()}</T>
                <Sub style={{ fontSize: 12 }}>{DOW[d.getDay()]}</Sub>
              </View>
              <View style={{ flex: 1 }}>{time}</View>
              {rec ? <St kind={rec.status}>{ST_LABEL[rec.status]}</St> : <St kind="off">-</St>}
            </View>
          );
        })}
      </Divided>
    );
  }

  return (
    <Page q={{ ...q, data: true, error: '', stale: false }}>
      <PageH title="근태" sub={`${me().team || '소속 없음'} · ${cur ? `${cur.work_start} – ${cur.work_end} 근무` : '근무 시간'}`} />
      <Stats>
        <Stat label="이번 달 근무" value={cur ? cur.work_days : '-'} unit={cur ? '일' : ''} />
        <Stat label="지각" value={cur ? cur.late : '-'} unit={cur ? '회' : ''} color={cur && cur.late ? c.warn : undefined} />
        <Stat label="남은 연차" value={!cur || cur.leave_left === null ? '-' : cur.leave_left} unit={!cur || cur.leave_left === null ? '' : '일'} color={c.leave} />
      </Stats>
      <Card>
        {/* 이전 · 다음 · 월간/주간은 누르는 즉시 바뀌고, 아래 내용만 새로 받음 */}
        <CardH
          title={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <IconBtn name="chevL" size={20} label="이전" onPress={() => setOff(off - 1)} />
              <T style={{ fontSize: 16, fontWeight: '700', minWidth: 96, textAlign: 'center' }}>{req.title}</T>
              <IconBtn name="chevR" size={20} label="다음" onPress={() => setOff(off + 1)} />
            </View>
          }
          right={
            <Seg
              options={[
                ['month', '월간'],
                ['week', '주간'],
              ]}
              value={view}
              onChange={(v) => {
                setView(v);
                setOff(0);
              }}
            />
          }
        />
        {view === 'month' ? (
          <View style={{ flexDirection: 'row' }}>
            {DOW.map((d) => (
              <Text key={d} style={{ width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, color: c.sub, paddingTop: 4, paddingBottom: 8, fontWeight: '600' }}>
                {d}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={stale || (shown && shown.view !== view) ? { opacity: 0.5 } : null}>{body}</View>
      </Card>
      {cur && cur.leave_total === null ? <Sub style={{ marginHorizontal: 4, marginBottom: 12 }}>연차 일수는 대표가 임직원 화면에서 정해요.</Sub> : null}
      <Btn kind="ghost" icon="file" title="근태 사유서 · 연차 신청하기" onPress={() => go('ws/doc')} />
    </Page>
  );
}
