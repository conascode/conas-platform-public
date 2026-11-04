/* 워크스페이스 > 근태: 월간 달력 · 주간 목록 */
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../lib/api';
import { go, me, useColors, useStore } from '../lib/store';
import { dotColor } from '../lib/theme';
import { addDays, DOW, iso, md, monthKey, today } from '../lib/util';
import { Btn, Card, CardH, Divided, ErrorView, IconBtn, Loading, PageH, Press, Seg, St, Stat, Stats, Sub, T } from '../ui/kit';
import { Page } from '../ui/Page';

const ST_LABEL: Record<string, string> = { ok: '정상', late: '지각', leave: '연차', half: '반차', no: '결근' };
const AT = { view: 'month', off: 0, sel: null as string | null };

function diffH(a: string, b: string) {
  const [h1, m1] = a.split(':').map(Number);
  const [h2, m2] = b.split(':').map(Number);
  const t = Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1) - 60);
  return `${Math.floor(t / 60)}시간 ${t % 60}분`;
}

export function AttView() {
  const c = useColors();
  const rk = useStore((s) => s.refreshKey);
  const [view, setView] = useState(AT.view);
  const [off, setOff] = useState(AT.off);
  const [sel, setSel] = useState<string | null>(AT.sel);
  const [cache, setCache] = useState<Record<string, any>>({});
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    AT.view = view;
    AT.off = off;
    AT.sel = sel;
  }, [view, off, sel]);
  // 화면에 들어올 때마다 새로 받음
  useEffect(() => setCache({}), [rk]);

  const td = today();
  const base = new Date(td.getFullYear(), td.getMonth() + (view === 'month' ? off : 0), 1);
  const mon = addDays(td, -((td.getDay() + 6) % 7) + (view === 'week' ? off : 0) * 7);
  const weekDays = [...Array(5)].map((_, i) => addDays(mon, i));
  const need = [monthKey(td), ...(view === 'month' ? [monthKey(base)] : weekDays.map(monthKey))].filter((k, i, a) => a.indexOf(k) === i);
  const missing = need.filter((k) => !cache[k]);
  useEffect(() => {
    if (!missing.length) return;
    let ok = true;
    Promise.all(missing.map((k) => api('att', { month: k }).then((d) => [k, d] as const)))
      .then((rows) => {
        if (!ok) return;
        setCache((x) => ({ ...x, ...Object.fromEntries(rows) }));
        setError('');
      })
      .catch((e) => ok && setError(e.message));
    return () => {
      ok = false;
    };
  }, [missing.join(','), retry]);

  if (missing.length) {
    return <Page>{error ? <ErrorView message={error} onRetry={() => {
          setError('');
          setRetry(retry + 1);
        }} /> : <Loading />}</Page>;
  }
  const cur = cache[monthKey(td)];
  let body: React.ReactNode;
  let title: string;
  if (view === 'month') {
    const data = cache[monthKey(base)];
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
        <View style={{ flexDirection: 'row' }}>
          {DOW.map((d) => (
            <Text key={d} style={{ width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, color: c.sub, paddingTop: 4, paddingBottom: 8, fontWeight: '600' }}>
              {d}
            </Text>
          ))}
        </View>
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
    title = `${y}년 ${m + 1}월`;
  } else {
    body = (
      <Divided>
        {weekDays.map((d) => {
          const rec = cache[monthKey(d)].days[iso(d)];
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
    const end = addDays(mon, 4);
    title = `${mon.getMonth() + 1}.${mon.getDate()} – ${end.getMonth() + 1}.${end.getDate()}`;
  }

  return (
    <Page>
      <PageH title="근태" sub={`${me().team || '소속 없음'} · ${cur.work_start} – ${cur.work_end} 근무`} />
      <Stats>
        <Stat label="이번 달 근무" value={cur.work_days} unit="일" />
        <Stat label="지각" value={cur.late} unit="회" color={cur.late ? c.warn : undefined} />
        <Stat label="남은 연차" value={cur.leave_left === null ? '-' : cur.leave_left} unit={cur.leave_left === null ? '' : '일'} color={c.leave} />
      </Stats>
      <Card>
        <CardH
          title={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <IconBtn name="chevL" size={20} label="이전" onPress={() => setOff(off - 1)} />
              <T style={{ fontSize: 16, fontWeight: '700', minWidth: 96, textAlign: 'center' }}>{title}</T>
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
        {body}
      </Card>
      {cur.leave_total === null ? <Sub style={{ marginHorizontal: 4, marginBottom: 12 }}>연차 일수는 대표가 임직원 화면에서 정해요.</Sub> : null}
      <Btn kind="ghost" icon="file" title="근태 사유서 · 연차 신청하기" onPress={() => go('ws/doc')} />
    </Page>
  );
}
