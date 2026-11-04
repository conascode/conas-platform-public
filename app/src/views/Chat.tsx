/* 채널 · DM 목록 / 대화 상대 고르기 / 대화방 (채널 · DM 공용) */
import React, { useEffect, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, legacy, post, upload } from '../lib/api';
import { cacheGet, cacheSet, useActive, useLoad } from '../lib/hooks';
import { L, prefetchChat } from '../lib/loaders';
import { back, getState, go, me, mem, refresh, rememberConv, setState, useColors, useStore } from '../lib/store';
import { ago, hm, iso, md, roleLabel, ROLE } from '../lib/util';
import { Icon } from '../ui/Icon';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { AuthImage,
  Avatar,
  Btn,
  Card,
  CardH,
  ChanIc,
  CheckBox,
  Count,
  DescBox,
  Divided,
  Empty,
  ErrorView,
  Field,
  FileRow,
  GroupAv,
  Grow,
  Hint,
  IconBtn,
  ImageViewer,
  Input,
  LinkText,
  ListItem,
  NewBtn,
  PageH,
  Press,
  Row,
  SearchBox,
  St,
  Sub,
  T,
  Tag,
} from '../ui/kit';
import { ask, err, sheet, toast } from '../ui/overlay';
import { Page } from '../ui/Page';
import { Composer, SubHeader } from './Board';
import { startDm } from '../lib/actions';
import { openPerson } from './People';

async function loadChats() {
  const d = await api('chats');
  const types: Record<number, string> = { ...getState().convType };
  d.channels.forEach((c: any) => (types[c.id] = 'channel'));
  d.dms.forEach((c: any) => (types[c.id] = c.type));
  // 화면 전체를 다시 그리지 않도록 바뀐 것만 반영
  if (JSON.stringify(types) !== JSON.stringify(getState().convType)) setState({ convType: types });
  return d;
}

// ==================================================================
// 채널 목록
// ==================================================================
export function ChanView() {
  const c = useColors();
  const q = useLoad('chats', loadChats);
  return (
    <Page q={q} header={<PageH title="채널" sub="누구나 들어갈 수 있는 대화방이에요" right={<NewBtn icon="plus" title="채널 만들기" onPress={() => openChanEdit(null)} />} />}>
      {(d: any) => {
        const joined = d.channels.filter((x: any) => x.joined);
        const others = d.channels.filter((x: any) => !x.joined);
        const row = (ch: any) => (
          <ListItem key={ch.id} onPressIn={() => prefetchChat(ch.id)} onPress={() => go(`chat/${ch.id}?from=cm`)}>
            <ChanIc />
            <Grow>
              <T lines={1} style={{ fontWeight: '600' }}>
                {ch.name} <Text style={{ fontSize: 13, color: c.sub, fontWeight: '500' }}>{ch.member_count}명</Text>
              </T>
              <Sub lines={1}>{ch.joined && ch.preview ? ch.last_name + ': ' + ch.preview : ch.description || ''}</Sub>
            </Grow>
            {ch.unread ? <Count n={ch.unread} /> : ch.joined && ch.preview ? <Sub>{ago(ch.ts)}</Sub> : ch.joined ? null : <St kind="pri">참여하기</St>}
          </ListItem>
        );
        return (
          <>
            <Card>{joined.length ? <Divided>{joined.map(row)}</Divided> : <Empty>참여 중인 채널이 없어요</Empty>}</Card>
            {others.length ? (
              <Card>
                <CardH title="다른 채널" />
                <Divided>{others.map(row)}</Divided>
              </Card>
            ) : null}
          </>
        );
      }}
    </Page>
  );
}

function openChanEdit(info: any | null) {
  sheet.show(info ? '채널 수정' : '채널 만들기', <ChanEdit info={info} />);
}
function ChanEdit({ info }: { info: any | null }) {
  const [name, setName] = useState(info ? info.title : '');
  const [desc, setDesc] = useState(info ? info.description || '' : '');
  const save = async () => {
    if (!name.trim()) throw new Error('채널 이름을 입력해 주세요.');
    const r = await post('channel.save', info ? { id: info.id, name, description: desc } : { name, description: desc });
    rememberConv(r.c, 'channel');
    toast(info ? '채널을 수정했어요' : '채널을 만들었어요');
    if (info) {
      sheet.close();
      refresh();
    } else go(`chat/${r.c}?from=cm`);
  };
  return (
    <View>
      <Field label="채널 이름">
        <Input value={name} onChangeText={setName} maxLength={50} placeholder="예: 점심메뉴" autoFocus />
      </Field>
      <Field label="설명 (선택)">
        <Input value={desc} onChangeText={setDesc} maxLength={255} placeholder="어떤 이야기를 나누는 곳인가요?" />
      </Field>
      <Btn title={info ? '저장' : '만들기'} onPress={save} />
    </View>
  );
}

// ==================================================================
// DM 목록 (1:1 · 단체)
// ==================================================================
const DL = { q: '' };
export function DmView() {
  const [qs, setQs] = useState(DL.q);
  const active = useActive();
  const q = useLoad('chats', loadChats);
  // 목록 새로고침 (5초마다, 앱이 보이고 창이 닫혀 있을 때만)
  useEffect(() => {
    let t: any;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      if (active && AppState.currentState === 'active' && !sheet.open) {
        try {
          const n = await loadChats();
          if (alive && JSON.stringify(n.dms) !== JSON.stringify(q.data?.dms)) q.setData(n);
        } catch {
          /* 다음에 다시 */
        }
      }
      if (alive) t = setTimeout(tick, 5000);
    };
    t = setTimeout(tick, 5000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q.data, active]);
  // 제목 · 검색창은 데이터를 다시 받아도 그대로
  const header = (
    <>
      <PageH title="DM" sub="1:1 · 단체 대화" right={<NewBtn icon="pen" title="새 대화" onPress={() => openPicker('new')} />} />
      <SearchBox
        value={qs}
        onChange={(v) => {
          DL.q = v;
          setQs(v);
        }}
        placeholder="이름, 대화방 검색"
      />
    </>
  );
  return (
    <Page q={q} header={header}>
      {(d: any) => {
        const s = qs.trim().toLowerCase();
        const list = s ? d.dms.filter((x: any) => (x.title + ' ' + (x.sub || '')).toLowerCase().includes(s)) : d.dms;
        return (
          <>
            <Card style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
              {list.length ? list.map((x: any) => <DmRow key={x.id} c={x} />) : <Empty>{s ? '찾는 대화가 없어요' : '아직 대화가 없어요.\n새 대화를 눌러 시작해 보세요.'}</Empty>}
            </Card>
          </>
        );
      }}
    </Page>
  );
}

function DmRow({ c: x }: { c: any }) {
  const c = useColors();
  const who = x.last_mine ? '나: ' : x.type === 'group' && x.last_name ? x.last_name + ': ' : '';
  return (
    <Press
      onPressIn={() => prefetchChat(x.id)}
      onPress={() => go(`chat/${x.id}`)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10, borderRadius: 14 }}
      pressedStyle={{ backgroundColor: c.surface2 }}
    >
      {x.type === 'dm' ? <Avatar m={{ name: x.title, av: x.av, online: x.online }} size={50} /> : <GroupAv avs={x.avs} size={50} />}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Row gap={5}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: c.ink, flexShrink: 1 }} numberOfLines={1}>
            {x.title}
          </Text>
          {x.type === 'group' ? <Text style={{ fontSize: 13, color: c.faint, fontWeight: '600' }}>{x.member_count}</Text> : null}
          <View style={{ flex: 1 }} />
          <Text style={{ fontSize: 12, color: c.faint }}>{x.preview ? ago(x.ts) : ''}</Text>
        </Row>
        <Row gap={8}>
          <Text style={{ flex: 1, fontSize: 13, color: x.unread ? c.ink2 : c.sub, fontWeight: x.unread ? '600' : '400' }} numberOfLines={1}>
            {x.preview ? who + x.preview : x.sub ? x.sub : '대화를 시작해 보세요'}
          </Text>
          <Count n={x.unread} />
        </Row>
      </View>
    </Press>
  );
}

// ==================================================================
// 대화 상대 고르기 (새 대화 · 초대)
// ==================================================================

function openPicker(mode: 'new' | 'invite', info?: any) {
  sheet.show(mode === 'invite' ? '대화 상대 초대' : '새 대화', <Picker mode={mode} info={info} />);
}
function Picker({ mode, info }: { mode: 'new' | 'invite'; info?: any }) {
  const c = useColors();
  const [sel, setSel] = useState<number[]>([]);
  const [qs, setQs] = useState('');
  const [name, setName] = useState('');
  const exclude: number[] = mode === 'invite' ? info.members.map((m: any) => m.id) : [];
  const fromDm = mode === 'invite' && info.type === 'dm';
  const people = getState().data.members.filter((m: any) => m.id !== me().id && !exclude.includes(m.id));
  const s = qs.trim().toLowerCase();
  const shown = s ? people.filter((m: any) => [m.name, m.team, m.position, ROLE[m.role]].join(' ').toLowerCase().includes(s)) : people;
  const toggle = (id: number) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const n = sel.length;
  const label = !n ? (mode === 'invite' ? '초대할 사람을 골라 주세요' : '대화 상대를 골라 주세요') : mode === 'invite' ? `${n}명 초대하기` : n === 1 ? `${mem(sel[0]).name}님과 대화하기` : `${n + 1}명 단체 대화 만들기`;
  const goNow = async () => {
    if (!n) return;
    if (mode === 'invite') {
      const r = await post('chat.invite', { c: info.id, user_ids: sel });
      if (r.new) {
        toast('새 단체 대화방을 만들었어요');
        rememberConv(r.c, 'group');
        go('chat/' + r.c);
      } else {
        sheet.close();
        toast('초대했어요');
        refresh();
      }
      return;
    }
    if (n === 1) return startDm(sel[0]);
    const r = await post('chat.group', { user_ids: sel, name: name.trim() });
    rememberConv(r.c, 'group');
    go('chat/' + r.c);
  };
  return (
    <View>
      <SearchBox value={qs} onChange={setQs} placeholder="이름, 팀, 직급 검색" style={{ backgroundColor: c.surface2, marginBottom: 8 }} />
      {n ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 6 }}>
          {sel.map((id) => {
            const m = mem(id);
            return (
              <Press key={id} onPress={() => toggle(id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingLeft: 3, paddingRight: 9, borderRadius: 17, backgroundColor: c.primarySoft }}>
                <Avatar m={m} size={28} noDot />
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>{m.name}</Text>
                <Icon name="x" size={12} w={3} color={c.primary} />
              </Press>
            );
          })}
        </ScrollView>
      ) : null}
      {shown.length ? (
        shown.map((m: any) => (
          <Press key={m.id} onPress={() => toggle(m.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 12 }}>
            <Avatar m={m} />
            <Grow>
              <T style={{ fontWeight: '600' }}>{m.name}</T>
              <Sub>{roleLabel(m)}</Sub>
            </Grow>
            <CheckBox on={sel.includes(m.id)} round />
          </Press>
        ))
      ) : (
        <Empty>{people.length ? '찾는 사람이 없어요' : '초대할 수 있는 사람이 없어요'}</Empty>
      )}
      <View style={{ marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line }}>
        {mode === 'new' && n >= 2 ? (
          <View style={{ marginBottom: 10 }}>
            <Input value={name} onChangeText={setName} maxLength={100} placeholder="단체방 이름 (선택)" />
          </View>
        ) : null}
        {fromDm ? (
          <Hint style={{ color: c.sub, marginTop: 0, marginBottom: 10 }}>지금 대화는 그대로 두고, 새 단체 대화방을 만들어요.</Hint>
        ) : mode === 'invite' ? (
          <Hint style={{ color: c.sub, marginTop: 0, marginBottom: 10 }}>초대된 사람은 초대 전 대화를 볼 수 없어요.</Hint>
        ) : null}
        <Btn title={label} onPress={goNow} disabled={!n} />
      </View>
    </View>
  );
}

// ==================================================================
// 대화방 (전체 화면)
// ==================================================================
function ChatHead({ info, onInfo }: { info: any; onInfo: () => void }) {
  const c = useColors();
  let av: React.ReactNode;
  let sub: string;
  let subColor = c.sub;
  let onPress = onInfo;
  if (info.type === 'channel') {
    av = <ChanIc size={36} />;
    sub = info.description || (info.members.length || info.member_count || 0) + '명 참여 중';
  } else if (info.type === 'dm' && info.other) {
    const o = info.other;
    av = <Avatar m={o} size={38} />;
    sub = o.left ? '대화방을 나갔어요 · 메시지를 보내면 다시 들어와요' : (o.online ? '● 접속 중' : '오프라인') + (o.team || o.role ? ' · ' + roleLabel(o) : '');
    if (o.online && !o.left) subColor = c.ok;
    onPress = () => openPerson(o.id);
  } else {
    av = <GroupAv avs={info.members.filter((m: any) => m.id !== me().id)} size={38} />;
    sub = (info.members.length || info.member_count || 0) + '명';
  }
  return (
    <Press onPress={onPress} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 12 }}>
      {av}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T style={{ fontSize: 16, fontWeight: '700' }} lines={1}>
          {info.title}
        </T>
        <Text style={{ fontSize: 12, color: subColor }} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </Press>
  );
}

type Msg = any;

/** 채널 · DM 목록에서 본 대화방 정보 (대화방 정보를 받기 전에 머리글용) */
function chatSeed(id: number) {
  const l = cacheGet('chats');
  if (!l) return null;
  const ch = l.channels.find((x: any) => x.id === id);
  if (ch) return { id, type: 'channel', title: ch.name, description: ch.description, member_count: ch.member_count, members: [], joined: ch.joined, seed: true };
  const dm = l.dms.find((x: any) => x.id === id);
  if (!dm) return null;
  if (dm.type === 'dm') return { id, type: 'dm', title: dm.title, other: { name: dm.title, av: dm.av, online: dm.online }, members: [], joined: true, seed: true };
  return { id, type: 'group', title: dm.title, member_count: dm.member_count, members: dm.avs || [], joined: true, seed: true };
}

export function ChatScreen({ id }: { id: number }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  // 전에 본 대화방이거나 미리 받아둔 게 있으면 바로 보여주고, 뒤에서 새로 받음
  const [c0] = useState(() => ({ info: cacheGet(L.chatInfo(id)[0]) || null, m: cacheGet(L.chatMsgs(id)[0]) || null }));
  const [real, setInfo] = useState<any>(c0.info);
  const [error, setError] = useState('');
  const [msgs, setMsgs] = useState<Msg[] | null>(c0.m ? c0.m.messages : null);
  const [reads, setReads] = useState<Record<string, number>>(c0.m ? c0.m.reads || {} : {});
  const [hasMore, setHasMore] = useState(c0.m ? !!c0.m.has_more : false);
  const [text, setText] = useState('');
  const [view, setView] = useState<any>(null);
  const S = useRef({
    since: c0.m ? c0.m.since || 0 : 0,
    msgs: (c0.m ? c0.m.messages : []) as Msg[],
    reads: (c0.m ? c0.m.reads || {} : {}) as Record<string, number>,
    pending: new Set<string>(),
    near: true,
    alive: true,
    info: c0.info as any,
  });
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const stick = useRef(true);
  const hasMoreRef = useRef(hasMore);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const setM = (l: Msg[]) => {
    S.current.msgs = l;
    setMsgs(l);
  };
  const setR = (r: Record<string, number>) => {
    S.current.reads = r;
    setReads(r);
  };
  const markRead = () => {
    const last = S.current.msgs.filter((m) => m.id > 0).pop();
    if (!last) return;
    setR({ ...S.current.reads, [me().id]: Math.max(S.current.reads[me().id] || 0, last.id) });
    legacy('read.php', { c: id, last_id: last.id }, true).catch(() => {});
  };
  const refreshInfo = async () => {
    try {
      const i = await api('chat.info', { c: id });
      if (S.current.alive) {
        S.current.info = i;
        setInfo(i);
      }
    } catch {
      /* ignore */
    }
  };

  const load = async () => {
    try {
      const i = await api('chat.info', { c: id });
      if (!S.current.alive) return;
      setError('');
      cacheSet(L.chatInfo(id)[0], i);
      S.current.info = i;
      setInfo(i);
      rememberConv(id, i.type);
      if (!i.joined) return;
      const d = await legacy('messages.php', { c: id });
      if (!S.current.alive) return;
      cacheSet(L.chatMsgs(id)[0], d);
      S.current.since = d.since || 0;
      setR(d.reads || {});
      setHasMore(d.has_more);
      stick.current = true;
      setM(d.messages);
      markRead();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const retry = () => {
    setError('');
    load();
  };
  useEffect(() => {
    const cur = S.current;
    cur.alive = true;
    // load는 서버 응답을 받은 뒤에만 상태를 바꿈 (바로 다시 그리지 않음)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return () => {
      cur.alive = false;
      // 다음에 열 때 바로 보이도록 마지막 모습을 기억 (보내는 중인 메시지는 빼고)
      if (cur.info && cur.info.joined) cacheSet(L.chatMsgs(id)[0], { messages: cur.msgs.filter((m) => m.id > 0), reads: cur.reads, since: cur.since, has_more: hasMoreRef.current });
    };
  }, [id]);
  // 초대 · 채널 수정 뒤 (refresh) 머리글 · 참여자 정보 새로
  const rk = useStore((s) => s.refreshKey);
  const firstRk = useRef(true);
  useEffect(() => {
    if (firstRk.current) {
      firstRk.current = false;
      return;
    }
    refreshInfo();
  }, [rk]);

  // 새 메시지 · 읽음 확인 (3초마다, 앱이 보일 때만)
  useEffect(() => {
    if (!real || !real.joined) return;
    let t: any;
    const tick = async () => {
      if (!S.current.alive) return;
      if (AppState.currentState === 'active') {
        try {
          const p = await legacy('poll.php', { since: S.current.since, c: id, active: 1 });
          if (!S.current.alive) return;
          if (p.messages && p.messages.length) {
            S.current.since = Math.max(S.current.since, ...p.messages.map((m: any) => m.id));
            const mine = p.messages.filter((m: any) => m.c === id && !S.current.msgs.some((x) => x.id === m.id) && !(m.cid && S.current.pending.has(m.cid)));
            if (mine.length) {
              // 누가 들어오거나 나가면 머리글 · 참여자 정보도 새로
              if (mine.some((m: any) => m.sys)) refreshInfo();
              stick.current = S.current.near;
              setM(S.current.msgs.concat(mine));
              markRead();
            }
          }
          if (p.reads) setR(p.reads);
        } catch {
          /* 다음에 다시 */
        }
      }
      t = setTimeout(tick, 3000);
    };
    t = setTimeout(tick, 3000);
    return () => clearTimeout(t);
  }, [real && real.joined, id]);

  const sendMsg = async (body: string, files: number[]) => {
    const cid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const temp: Msg = { id: -Date.now(), uid: me().id, body, files: [], ts: Math.floor(Date.now() / 1000), sending: true, cid };
    S.current.pending.add(cid);
    stick.current = true;
    setM([...S.current.msgs, temp]);
    try {
      const r = await legacy('send.php', { c: id, body, cid, files }, true);
      const l = [...S.current.msgs];
      const i = l.indexOf(temp);
      if (r.message && !l.some((m) => m.id === r.message.id)) l[i] = r.message;
      else l.splice(i, 1);
      setM(l);
      if (r.message) {
        S.current.since = Math.max(S.current.since, r.message.id);
        setR({ ...S.current.reads, [me().id]: r.message.id });
      }
      // 나간 상대가 다시 들어왔으면 머리글 새로
      if (S.current.info && S.current.info.other && S.current.info.other.left) refreshInfo();
    } catch (e) {
      setM(S.current.msgs.filter((m) => m !== temp));
      err(e);
    }
    S.current.pending.delete(cid);
  };
  const onSend = () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    sendMsg(body, []);
  };
  const attach = () =>
    sheet.show(
      '보내기',
      <Divided>
        <Press onPress={() => pickAndSend(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
          <Icon name="image" size={20} color={c.ink} />
          <T style={{ fontWeight: '600' }}>사진</T>
        </Press>
        <Press onPress={() => pickAndSend(false)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
          <Icon name="clip" size={20} color={c.ink} />
          <T style={{ fontWeight: '600' }}>파일</T>
        </Press>
      </Divided>,
    );
  const pickAndSend = async (images: boolean) => {
    sheet.close();
    await new Promise((r) => setTimeout(r, 400));
    let files: { uri: string; name: string; type?: string | null }[] = [];
    if (images) {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.9 });
      if (r.canceled) return;
      files = r.assets.map((a, i) => ({ uri: a.uri, name: a.fileName || `photo-${Date.now()}-${i}.jpg`, type: a.mimeType || 'image/jpeg' }));
    } else {
      const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (r.canceled) return;
      files = r.assets.map((a) => ({ uri: a.uri, name: a.name, type: a.mimeType }));
    }
    for (const f of files) {
      toast(`${f.name} 올리는 중…`);
      try {
        const r = await upload(f);
        await sendMsg('', [r.id]);
      } catch (e) {
        err(e);
      }
    }
  };
  const more = async () => {
    const first = S.current.msgs.find((m) => m.id > 0);
    const d = await legacy('messages.php', { c: id, before: first ? first.id : 0 });
    stick.current = false;
    setM(d.messages.concat(S.current.msgs));
    setHasMore(d.has_more);
  };
  const join = async () => {
    await post('chat.join', { c: id });
    toast('채널에 참여했어요');
    load();
  };
  // 받기 전에는 대화 목록에서 본 정보(이름 · 사진)로 머리글을 먼저 그림
  const info = real || chatSeed(id);
  const backTo = info && info.type === 'channel' ? 'cm/chan' : 'dm';
  const leave = () => {
    refresh();
    back(backTo);
  };

  if (!info) {
    return (
      <View style={{ flex: 1, backgroundColor: c.chatBg }}>
        <SubHeader onBack={() => back('dm')} title="대화" />
        {error ? <ErrorView message={error} onRetry={retry} /> : null}
      </View>
    );
  }

  // 이 메시지를 아직 안 읽은 사람 수 (보낸 사람 제외)
  const unreadOf = (m: Msg) => {
    if (m.sys || m.id <= 0) return 0;
    let n = 0;
    for (const uid in reads) if (Number(uid) !== m.uid && reads[uid] < m.id) n++;
    return n;
  };
  const list = msgs || [];
  const rows: React.ReactNode[] = [];
  let lastDay = '';
  list.forEach((m, i) => {
    const d = new Date(m.ts * 1000);
    const day = iso(d);
    const prev = list[i - 1];
    const next = list[i + 1];
    if (day !== lastDay) {
      rows.push(
        <View key={'d' + day} style={{ alignItems: 'center', marginTop: 12, marginBottom: 4 }}>
          <Text style={{ fontSize: 12, color: c.sub, backgroundColor: c.dark ? 'rgba(23,25,29,0.7)' : 'rgba(255,255,255,0.7)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' }}>
            {d.getFullYear()}년 {md(d)}
          </Text>
        </View>,
      );
      lastDay = day;
    }
    if (m.sys) {
      rows.push(
        <View key={m.id} style={{ alignItems: 'center', marginVertical: 8 }}>
          <Text
            style={{
              fontSize: 12,
              color: c.ink2,
              backgroundColor: c.dark ? 'rgba(23,25,29,0.7)' : 'rgba(255,255,255,0.7)',
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 12,
              overflow: 'hidden',
              textAlign: 'center',
              maxWidth: '86%',
            }}
          >
            {m.body}
          </Text>
        </View>,
      );
      return;
    }
    const sameDay = (x: Msg) => x && iso(new Date(x.ts * 1000)) === day;
    // 같은 사람이 1분 안에 이어서 보낸 메시지는 묶음
    const cont = prev && !prev.sys && prev.uid === m.uid && sameDay(prev) && hm(prev.ts) === hm(m.ts);
    const showTime = !(next && !next.sys && next.uid === m.uid && sameDay(next) && hm(next.ts) === hm(m.ts));
    const mine = m.uid === me().id;
    const n = unreadOf(m);
    const bubble = m.body ? (
      <View
        style={{ backgroundColor: mine ? c.primary : c.bubble, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 18, borderTopLeftRadius: !mine && !cont ? 5 : 18, borderTopRightRadius: mine && !cont ? 5 : 18 }}
      >
        <LinkText text={m.body} style={{ fontSize: 15, lineHeight: 22, color: mine ? '#fff' : c.ink }} linkColor={mine ? '#fff' : c.primary} />
      </View>
    ) : null;
    const files = (m.files || []).map((f: any, k: number) =>
      f.is_image ? (
        <Press key={k} onPress={() => setView(f)} style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: c.surface2 }} label={f.name}>
          <AuthImage url={f.view_url} style={{ width: 220, height: 220 }} resizeMode="cover" />
        </Press>
      ) : (
        <View key={k} style={{ maxWidth: 240 }}>
          <FileRow f={f} bg={c.bubble} />
        </View>
      ),
    );
    const side = (
      <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 1, paddingBottom: 1 }}>
        {n ? <Text style={{ fontSize: 11, fontWeight: '800', color: c.warn }}>{n}</Text> : null}
        {m.sending ? <Text style={{ fontSize: 11, color: c.sub }}>보내는 중</Text> : showTime ? <Text style={{ fontSize: 11, color: c.sub }}>{hm(m.ts)}</Text> : null}
      </View>
    );
    const row = (
      <View style={{ flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 5 }}>
        <View style={{ gap: 4, alignItems: mine ? 'flex-end' : 'flex-start', flexShrink: 1, opacity: m.sending ? 0.55 : 1 }}>
          {bubble}
          {files}
        </View>
        {side}
      </View>
    );
    if (mine) {
      rows.push(
        <View key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '84%', marginTop: cont ? 0 : 8 }}>
          {row}
        </View>,
      );
    } else if (cont) {
      rows.push(
        <View key={m.id} style={{ maxWidth: '84%', paddingLeft: 46 }}>
          {row}
        </View>,
      );
    } else {
      const who = mem(m.uid) || { name: m.name, av: m.av };
      rows.push(
        <View key={m.id} style={{ flexDirection: 'row', gap: 8, maxWidth: '84%', marginTop: 8 }}>
          <Press onPress={() => openPerson(m.uid)} label={`${m.name} 프로필`}>
            <Avatar m={{ ...who, online: false }} size={38} />
          </Press>
          <View style={{ flexShrink: 1 }}>
            <Press onPress={() => openPerson(m.uid)}>
              <Text style={{ fontSize: 12.5, color: c.ink2, fontWeight: '600', marginTop: 1, marginBottom: 4, marginLeft: 2 }}>{m.name}</Text>
            </Press>
            {row}
          </View>
        </View>,
      );
    }
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.chatBg }}>
      <SubHeader
        onBack={leave}
        title={<ChatHead info={info} onInfo={() => real && openChatInfo(real, refreshInfo)} />}
        right={info.joined ? <IconBtn name="more" label="대화방 정보" onPress={() => real && openChatInfo(real, refreshInfo)} /> : null}
      />
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 12, paddingBottom: 18, gap: 4, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          const { contentSize, contentOffset, layoutMeasurement } = e.nativeEvent;
          S.current.near = contentSize.height - contentOffset.y - layoutMeasurement.height < 120;
        }}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (stick.current) scroll.current?.scrollToEnd({ animated: false });
        }}
      >
        {!info.joined ? (
          <Empty style={{ marginVertical: 'auto' }}>{`${info.description || ''}\n참여하면 대화를 볼 수 있어요`}</Empty>
        ) : msgs === null ? (
          error ? (
            <ErrorView message={error} onRetry={retry} />
          ) : null
        ) : (
          <>
            {hasMore ? (
              <Press onPress={more} style={{ alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 }}>
                <Text style={{ fontSize: 13, color: c.primary }}>이전 메시지 더 보기</Text>
              </Press>
            ) : null}
            {rows}
            {!list.length ? <Empty style={{ marginVertical: 'auto' }}>{'아직 메시지가 없어요\n먼저 인사해 보세요 👋'}</Empty> : null}
          </>
        )}
      </ScrollView>
      {info.joined ? (
        <Composer
          value={text}
          onChange={setText}
          onSend={onSend}
          placeholder="메시지 입력"
          maxLength={5000}
          bottom={insets.bottom}
          left={
            <Press onPress={attach} label="파일 보내기" style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2 }}>
              <Icon name="plus" size={22} w={2.2} color={c.ink2} />
            </Press>
          }
        />
      ) : (
        <View style={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 14 + insets.bottom, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line }}>
          <Btn icon="plus" title={`#${info.title} 채널 참여하기`} onPress={join} />
        </View>
      )}
      <ImageViewer file={view} onClose={() => setView(null)} />
    </KeyboardAvoidingView>
  );
}

// 대화방 정보 시트: 참여자(누르면 프로필) · 초대 · 이름 바꾸기 · 나가기
function openChatInfo(info: any, onChanged: () => void) {
  const title = info.type === 'channel' ? '#' + info.title : info.type === 'dm' ? '대화 정보' : info.title;
  sheet.show(title, <ChatInfo info={info} onChanged={onChanged} />);
}
function ChatInfo({ info: ci, onChanged }: { info: any; onChanged: () => void }) {
  const c = useColors();
  const people = ci.type === 'dm' && ci.other && ci.other.left ? ci.members.concat([ci.other]) : ci.members;
  const leaveChat = async () => {
    const t = ci.type;
    const body =
      t === 'channel'
        ? '이 채널에서 나갈까요? 언제든 다시 참여할 수 있어요.'
        : t === 'dm'
          ? '내 대화 목록에서 사라지고 대화 내용도 더 볼 수 없어요.\n상대방의 대화방은 그대로 남아요.\n다시 대화하면 그 뒤 메시지부터 보여요.'
          : '나가면 이 방의 대화를 더 볼 수 없어요.\n다시 초대받으면 그 뒤 대화부터 보여요.';
    if (!(await ask({ title: '나가기', body, ok: '나가기', danger: true }))) return;
    await post('chat.leave', { c: ci.id });
    toast('대화방에서 나왔어요');
    go(t === 'channel' ? 'cm/chan' : 'dm');
  };
  return (
    <View>
      {ci.description ? <DescBox text={ci.description} style={{ marginTop: 0 }} /> : null}
      {ci.can_invite ? (
        <ListItem onPress={() => openPicker('invite', ci)}>
          <ChanIc size={44} icon="userPlus" t="primary" />
          <Grow>
            <T style={{ fontWeight: '700' }}>대화 상대 초대</T>
            {ci.type === 'dm' ? <Sub>새 단체 대화방이 만들어져요</Sub> : null}
          </Grow>
        </ListItem>
      ) : null}
      <Sub style={{ marginTop: 14, marginBottom: 4, fontWeight: '700' }}>대화 상대 {people.length}명</Sub>
      <Divided>
        {people.map((m: any) => (
          <ListItem key={m.id} onPress={() => openPerson(m.id)}>
            <Avatar m={m} />
            <Grow>
              <Row gap={4}>
                <T style={{ fontWeight: '600' }}>{m.name}</T>
                {m.id === me().id ? <Tag>나</Tag> : null}
              </Row>
              <Sub>{m.gone ? '퇴사 · 정지된 계정' : roleLabel(m)}</Sub>
            </Grow>
            <Icon name="chevR" size={18} color={c.ink} />
          </ListItem>
        ))}
      </Divided>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
        {ci.can_edit && ci.type === 'channel' ? (
          <View style={{ flex: 1 }}>
            <Btn kind="ghost" icon="pen" title="수정" onPress={() => openChanEdit(ci)} />
          </View>
        ) : null}
        {ci.can_edit && ci.type === 'group' ? (
          <View style={{ flex: 1 }}>
            <Btn kind="ghost" icon="pen" title="방 이름" onPress={() => sheet.show('방 이름', <Rename ci={ci} onChanged={onChanged} />)} />
          </View>
        ) : null}
        {ci.joined ? (
          <View style={{ flex: 1 }}>
            <Btn kind="danger" icon="logout" title="나가기" onPress={leaveChat} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
function Rename({ ci, onChanged }: { ci: any; onChanged: () => void }) {
  const [name, setName] = useState(ci.name || '');
  const save = async () => {
    await post('chat.rename', { c: ci.id, name });
    sheet.close();
    toast('방 이름을 바꿨어요');
    onChanged();
  };
  return (
    <View>
      <Field>
        <Input value={name} onChangeText={setName} maxLength={100} placeholder="비워두면 참여자 이름으로 보여요" autoFocus />
      </Field>
      <Btn title="저장" onPress={save} />
    </View>
  );
}
