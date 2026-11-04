/*
 * 하단바가 있는 화면들 (웹의 index.php 한 페이지 앱)
 *  - 위: 로고 · 알림 종 · 내 사진
 *  - 가운데: 홈 / WS(업무 · 근태 · 서류 · 공지 · 내 정보) / CM(게시판 · 채널 · 임직원) / DM / 전체
 *  - 아래: 홈 하단바, 또는 WS · CM 안에서는 뒤로가기 + 떠 있는 알약 모양 하단바
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { AppState, BackHandler, Image, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { go, refresh, setBadges, useColors, useStore } from '../lib/store';
import { Icon } from '../ui/Icon';
import { Avatar, IconBtn, Press } from '../ui/kit';
import { sheet } from '../ui/overlay';
import { AllView, openNoti } from '../views/All';
import { AttView } from '../views/Att';
import { BoardView } from '../views/Board';
import { ChanView, DmView } from '../views/Chat';
import { DocView } from '../views/Doc';
import { HomeView } from '../views/Home';
import { MeView } from '../views/Me';
import { NoticeView } from '../views/Notice';
import { PeopleView } from '../views/People';
import { TaskView } from '../views/Task';

const NAV: Record<string, [string, string, string, string?][]> = {
  home: [
    ['home', '홈', 'home', 'home'],
    ['ws', 'WS', 'briefcase', 'ws/task'],
    ['cm', 'CM', 'users', 'cm/board'],
    ['dm', 'DM', 'message', 'dm'],
    ['all', '전체', 'grid', 'all'],
  ],
  ws: [
    ['task', '업무', 'checkSq'],
    ['att', '근태', 'calendar'],
    ['doc', '서류', 'file'],
    ['notice', '공지', 'megaphone'],
  ],
  cm: [
    ['board', '게시판', 'board'],
    ['chan', '채널', 'hash'],
    ['people', '임직원', 'users'],
  ],
};

function TopBar() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const sec = useStore((s) => s.main.sec);
  const n = useStore((s) => s.badges.noti || 0);
  const m = useStore((s) => s.data.me);
  const label = ({ ws: 'WORKSPACE', cm: 'COMMUNITY' } as Record<string, string>)[sec];
  return (
    <View style={[st.top, { paddingTop: insets.top, height: 56 + insets.top, backgroundColor: c.surface, borderBottomColor: c.line }]}>
      <Press onPress={() => go('home')} label="홈으로" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Image source={require('../../assets/logo.png')} style={{ width: 28, height: 28, borderRadius: 9 }} />
        <Text style={{ fontWeight: '800', fontSize: 18, letterSpacing: -0.4, color: c.ink }}>CONAS</Text>
        {label ? (
          <Text style={{ fontSize: 10, fontWeight: '800', color: c.primary, letterSpacing: 0.8, backgroundColor: c.primarySoft, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' }}>{label}</Text>
        ) : null}
      </Press>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <IconBtn name="bell" label="알림" onPress={openNoti} badge={n} />
        <Press onPress={() => go('ws/me')} label="내 정보" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Avatar m={m} size={30} />
        </Press>
      </View>
    </View>
  );
}

function BottomNav() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const main = useStore((s) => s.main);
  const b = useStore((s) => s.badges);
  const group = ['home', 'dm', 'all'].includes(main.sec) ? 'home' : main.sec;
  const active = group === 'home' ? main.sec : main.tab;
  const dot = (key: string) => {
    if (group === 'home') return (key === 'ws' && (b.task || b.approval || b.notice)) || (key === 'cm' && b.channel) || (key === 'dm' && b.dm) || (key === 'all' && b.pending);
    if (group === 'ws') return (key === 'task' && b.task) || (key === 'doc' && b.approval) || (key === 'notice' && b.notice);
    if (group === 'cm') return key === 'chan' && b.channel;
    return false;
  };
  const sub = group !== 'home';
  return (
    <View
      style={[
        st.nav,
        { backgroundColor: c.surface, shadowColor: '#000' },
        sub
          ? { marginHorizontal: 12, marginBottom: 12 + insets.bottom, padding: 8, borderRadius: 40, shadowOpacity: c.dark ? 0.55 : 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 12 }, elevation: 10 }
          : { paddingTop: 10, paddingHorizontal: 8, paddingBottom: 10 + insets.bottom, borderTopLeftRadius: 28, borderTopRightRadius: 28, shadowOpacity: c.dark ? 0.4 : 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
      ]}
    >
      {sub ? (
        <Press onPress={() => go('home')} label="홈으로" style={[st.navBack, { backgroundColor: c.surface2 }]} pressedStyle={{ transform: [{ scale: 0.86 }] }}>
          <Icon name="arrowL" size={24} w={2.2} color={c.ink2} />
        </Press>
      ) : null}
      {NAV[group].map(([k, l, i, to]) => {
        const on = k === active;
        return (
          <Press key={k} onPress={() => go(to || `${group}/${k}`)} style={st.navItem} pressedStyle={{ transform: [{ scale: 0.9 }] }} label={l}>
            <View>
              <Icon name={i} size={24} w={1.9} filled={on} color={on ? c.ink : c.faint} />
              {dot(k) ? <View style={[st.navDot, { backgroundColor: c.danger, borderColor: c.surface }]} /> : null}
            </View>
            <Text style={{ fontSize: 12, fontWeight: on ? '700' : '600', color: on ? c.ink : c.faint }}>{l}</Text>
          </Press>
        );
      })}
    </View>
  );
}

function Content() {
  const main = useStore((s) => s.main);
  const key = `${main.sec}/${main.tab}`;
  switch (key) {
    case 'ws/task':
      return <TaskView />;
    case 'ws/att':
      return <AttView />;
    case 'ws/doc':
      return <DocView />;
    case 'ws/notice':
      return <NoticeView id={main.id} />;
    case 'ws/me':
      return <MeView />;
    case 'cm/board':
      return <BoardView id={main.id} />;
    case 'cm/chan':
      return <ChanView />;
    case 'cm/people':
      return <PeopleView />;
    case 'dm/dm':
      return <DmView />;
    case 'all/all':
      return <AllView />;
    default:
      return <HomeView />;
  }
}

export default function MainScreen() {
  const c = useColors();
  const ready = useStore((s) => s.auth === 'ready' && !!s.data);
  const main = useStore((s) => s.main);

  // 배지 숫자 갱신 (앱이 보이는 동안 20초마다)
  useEffect(() => {
    if (!ready) return;
    let t: any;
    const tick = async () => {
      clearTimeout(t);
      if (AppState.currentState === 'active') {
        try {
          const d = await api('badges');
          setBadges(d.badges);
        } catch {
          /* 다음에 다시 */
        }
      }
      t = setTimeout(tick, 20000);
    };
    t = setTimeout(tick, 20000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && tick());
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [ready]);

  // 다른 화면(글 · 대화방 등)에서 돌아오면 지금 화면을 새로
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      refresh();
    }, [])
  );

  // 안드로이드 뒤로가기: 시트 닫기 → WS·CM·DM·전체 → 홈 → 앱 종료
  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheet.open) {
        sheet.close();
        return true;
      }
      if (main.sec !== 'home') {
        go('home');
        return true;
      }
      return false;
    });
    return () => h.remove();
  }, [main.sec]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.surface2 }} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.surface2 }}>
      <TopBar />
      <View style={{ flex: 1 }}>
        <Content />
      </View>
      <BottomNav />
    </View>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 8, borderBottomWidth: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 2, zIndex: 6 },
  navItem: { flex: 1, alignItems: 'center', gap: 4, paddingTop: 6, paddingBottom: 4 },
  navBack: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  navDot: { position: 'absolute', top: -2, right: -5, width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
});
