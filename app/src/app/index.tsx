/*
 * 하단바가 있는 화면들 (웹의 index.php 한 페이지 앱)
 *  - 위: 로고 · 알림 종 · 내 사진
 *  - 가운데: 홈 / WS(업무 · 근태 · 서류 · 공지 · 내 정보) / CM(게시판 · 채널 · 임직원) / DM / 전체
 *  - 아래: 홈 하단바, 또는 WS · CM 안에서는 뒤로가기 + 떠 있는 알약 모양 하단바
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, BackHandler, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { useAnim } from '../ui/anim';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { ActiveContext } from '../lib/hooks';
import { prefetchAll, prefetchPath } from '../lib/loaders';
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

// ------------------------------------------------------------------
// 하단바 (웹 spa.css 의 .nav 움직임과 같게)
//  - 홈 바 ↔ 떠 있는 알약: 여백 · 모서리가 통통 튀며 바뀜
//  - WS · CM에 들어가면 메뉴가 하나씩 차례로 올라오고, 뒤로 버튼은 돌면서 나타남
//  - 같은 묶음 안에서 탭을 바꾸면 새로 고른 아이콘이 작아졌다 커지며 튐
//  - 고른 아이콘 · 글자는 색이 부드럽게 바뀜
// ------------------------------------------------------------------
const SPRING = { friction: 6, tension: 90, useNativeDriver: true };

function NavItem({ label, icon, on, index, enter, dot, onPress, onPressIn }: { label: string; icon: string; on: boolean; index: number; enter: boolean; dot: boolean; onPress: () => void; onPressIn: () => void }) {
  const c = useColors();
  const appear = useAnim(enter ? 0 : 1);
  const pop = useAnim(1);
  const sel = useAnim(on ? 1 : 0);
  const wasOn = useRef(on);
  useEffect(() => {
    if (enter) Animated.spring(appear, { ...SPRING, toValue: 1, delay: index * 50 + 60 }).start();
  }, []);
  useEffect(() => {
    Animated.timing(sel, { toValue: on ? 1 : 0, duration: 250, useNativeDriver: true }).start();
    if (on && !wasOn.current) {
      Animated.sequence([
        Animated.timing(pop, { toValue: 0.74, duration: 190, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pop, { toValue: 1.14, duration: 190, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(pop, { ...SPRING, toValue: 1 }),
      ]).start();
    }
    wasOn.current = on;
  }, [on]);
  const off = sel.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: appear.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }, { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
      }}
    >
      <Press onPress={onPress} onPressIn={onPressIn} style={st.navItem} pressedStyle={{ transform: [{ scale: 0.9 }] }} label={label}>
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <Animated.View style={{ opacity: off }}>
            <Icon name={icon} size={24} w={1.9} color={c.faint} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: sel }]}>
            <Icon name={icon} size={24} filled color={c.ink} />
          </Animated.View>
          {dot ? <View style={[st.navDot, { backgroundColor: c.danger, borderColor: c.surface }]} /> : null}
        </Animated.View>
        <View>
          <Animated.Text style={{ fontSize: 12, fontWeight: '600', color: c.faint, opacity: off }}>{label}</Animated.Text>
          <Animated.Text style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 12, fontWeight: '700', color: c.ink, opacity: sel }}>{label}</Animated.Text>
        </View>
      </Press>
    </Animated.View>
  );
}

function NavBack({ enter }: { enter: boolean }) {
  const c = useColors();
  const a = useAnim(enter ? 0 : 1);
  useEffect(() => {
    if (enter) Animated.spring(a, { ...SPRING, toValue: 1 }).start();
  }, []);
  return (
    <Animated.View
      style={{
        opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [
          { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [-28, 0] }) },
          { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
          { rotate: a.interpolate({ inputRange: [0, 1], outputRange: ['-60deg', '0deg'] }) },
        ],
      }}
    >
      <Press onPress={() => go('home')} label="홈으로" style={[st.navBack, { backgroundColor: c.surface2 }]} pressedStyle={{ transform: [{ scale: 0.86 }] }}>
        <Icon name="arrowL" size={24} w={2.2} color={c.ink2} />
      </Press>
    </Animated.View>
  );
}

function BottomNav() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const main = useStore((s) => s.main);
  const b = useStore((s) => s.badges);
  const group = ['home', 'dm', 'all'].includes(main.sec) ? 'home' : main.sec;
  const active = group === 'home' ? main.sec : main.tab;
  // 묶음(홈 / WS / CM)이 바뀌었을 때만 메뉴가 차례로 올라옴 (앱을 처음 켤 때는 그대로)
  const [prevGroup, setPrevGroup] = useState(group);
  const [entered, setEntered] = useState<string | null>(null);
  if (prevGroup !== group) {
    setPrevGroup(group);
    setEntered(group);
  }
  const enter = entered === group;
  const sub = group !== 'home';
  const dot = (key: string) => {
    if (group === 'home') return !!((key === 'ws' && (b.task || b.approval || b.notice)) || (key === 'cm' && b.channel) || (key === 'dm' && b.dm) || (key === 'all' && b.pending));
    if (group === 'ws') return !!((key === 'task' && b.task) || (key === 'doc' && b.approval) || (key === 'notice' && b.notice));
    if (group === 'cm') return !!(key === 'chan' && b.channel);
    return false;
  };
  return (
    // 바 모양(여백 · 모서리)이 바뀌는 움직임은 store.ts 의 LayoutAnimation 이 맡음
    <View
      style={[
        st.nav,
        { backgroundColor: c.surface, shadowColor: '#000', paddingHorizontal: 8 },
        sub
          ? { marginHorizontal: 12, marginBottom: 12 + insets.bottom, paddingVertical: 8, borderRadius: 40 }
          : { paddingTop: 10, paddingBottom: 10 + insets.bottom, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
        sub
          ? { shadowOpacity: c.dark ? 0.55 : 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 12 }, elevation: 10 }
          : { shadowOpacity: c.dark ? 0.4 : 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
      ]}
    >
      {sub ? <NavBack key={'back:' + group} enter={enter} /> : null}
      {NAV[group].map(([k, l, i, to], n) => {
        const path = to || `${group}/${k}`;
        return (
          <NavItem
            key={group + ':' + k}
            label={l}
            icon={i}
            on={k === active}
            index={n}
            enter={enter}
            dot={dot(k)}
            onPressIn={() => prefetchPath(path)}
            onPress={() => go(path)}
          />
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------
// 가운데 화면: 한 번 연 탭은 지우지 않고 숨겨둠 (돌아오면 스크롤 위치까지 그대로)
// ------------------------------------------------------------------
type Nav = { id: number | null; nonce?: number };
const VIEWS: Record<string, (n: Nav) => React.ReactNode> = {
  'home/home': () => <HomeView />,
  'ws/task': () => <TaskView />,
  'ws/att': () => <AttView />,
  'ws/doc': () => <DocView />,
  'ws/notice': (n) => <NoticeView id={n.id} nonce={n.nonce} />,
  'ws/me': () => <MeView />,
  'cm/board': (n) => <BoardView id={n.id} nonce={n.nonce} />,
  'cm/chan': () => <ChanView />,
  'cm/people': () => <PeopleView />,
  'dm/dm': () => <DmView />,
  'all/all': () => <AllView />,
};

function Content() {
  const main = useStore((s) => s.main);
  const want = `${main.sec}/${main.tab}`;
  const key = VIEWS[want] ? want : 'home/home';
  const cur: Nav = { id: main.id, nonce: main.nonce };
  const [seen, setSeen] = useState<string[]>([key]);
  // 탭마다 마지막으로 받은 id (숨겨진 탭은 자기 것을 그대로 가짐)
  const [navs, setNavs] = useState<Record<string, Nav>>({ [key]: cur });
  if (!seen.includes(key)) setSeen([...seen, key]);
  const old = navs[key];
  if (!old || old.id !== cur.id || old.nonce !== cur.nonce) setNavs({ ...navs, [key]: cur });
  const list = seen.includes(key) ? seen : [...seen, key];
  return (
    <View style={{ flex: 1 }}>
      {list.map((k) => (
        <View key={k} style={[StyleSheet.absoluteFill, k !== key && st.hidden]}>
          <ActiveContext.Provider value={k === key}>{VIEWS[k](k === key ? cur : navs[k] || { id: null })}</ActiveContext.Provider>
        </View>
      ))}
    </View>
  );
}

export default function MainScreen() {
  const c = useColors();
  const ready = useStore((s) => s.auth === 'ready' && !!s.data);
  const main = useStore((s) => s.main);

  // 로그인하면 주요 화면 데이터를 뒤에서 미리 받아둠 (처음 여는 화면도 바로 보이게)
  useEffect(() => {
    if (ready) prefetchAll();
  }, [ready]);

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
  hidden: { display: 'none' },
  navDot: { position: 'absolute', top: -2, right: -5, width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
});
