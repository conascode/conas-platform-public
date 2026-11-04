/* 커뮤니티: 게시판 목록 · 글 보기(댓글) · 글쓰기 */
import React, { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { abs, api, post } from '../lib/api';
import { cacheEntries, cacheGet, useLoad, useUploads } from '../lib/hooks';
import { L } from '../lib/loaders';
import { router } from 'expo-router';
import { back, getState, go, me, refresh, useColors, useStore } from '../lib/store';
import { ago } from '../lib/util';
import { Icon } from '../ui/Icon';
import { Avatar, Btn, Card, Chips, Divided, Empty, ErrorView, Fab, Files, Grow, IconBtn, Input, LinkText, Loading, PageH, Press, Row, Sub, T, Tag, UpList } from '../ui/kit';
import { ask, err, sheet, toast } from '../ui/overlay';
import { Page, Skeleton } from '../ui/Page';

const B = { board: null as number | null };

// ==================================================================
// 게시판 목록
// ==================================================================
export function BoardView({ id, nonce }: { id: number | null; nonce?: number }) {
  const c = useColors();
  const boards = useStore((s) => s.data.boards) as any[];
  const pick = (want: number | null) => (boards.find((b) => b.id === want) ? want : boards[0] ? boards[0].id : null);
  // 고른 게시판은 이 화면 안에서 바로 바꿈 (버튼 · 제목은 다시 그리지 않음)
  const [board, setBoard] = useState<number | null>(() => pick(id || B.board));
  // 링크로 다른 게시판(cm/board/2)이 열리면 그 게시판으로
  const [nav, setNav] = useState({ id, nonce });
  if (nav.id !== id || nav.nonce !== nonce) {
    setNav({ id, nonce });
    if (id) setBoard(pick(id));
  }
  useEffect(() => {
    B.board = board;
  }, [board]);
  const [more, setMore] = useState<{ board: number | null; posts: any[]; has_more: boolean } | null>(null);
  const loader = board ? L.posts(board) : null;
  const q = useLoad(loader ? loader[0] : null, loader ? loader[1] : async () => null);
  if (!boards.length)
    return (
      <Page>
        <Empty style={{ paddingVertical: 60 }}>아직 게시판이 없어요</Empty>
      </Page>
    );
  const info = boards.find((b) => b.id === board) || {};
  const d0: any = q.data;
  const mine = d0 && d0.board && d0.board.id === board;
  const extra = more && more.board === board && mine ? more : null;
  const posts = d0 ? (extra ? extra.posts : d0.posts) : [];
  const hasMore = d0 ? (extra ? extra.has_more : d0.has_more) : false;
  const loadMore = async () => {
    const d = await api('posts', { board_id: board, before: posts[posts.length - 1].id });
    setMore({ board, posts: posts.concat(d.posts), has_more: d.has_more });
  };
  const desc = mine ? d0.board.description || '' : info.description || (cacheGet(`posts:${board}`)?.board?.description ?? '');
  const anonymous = mine ? d0.board.anonymous : info.anonymous;
  const header = (
    <>
      <PageH title="게시판" sub={desc || ' '} />
      <Chips
        items={boards.map((x) => ({ v: x.id, label: x.name }))}
        value={board}
        onChange={(v) => {
          setMore(null);
          setBoard(v);
        }}
      />
      {anonymous ? (
        <Row gap={6} style={{ marginTop: -4, marginHorizontal: 2, marginBottom: 12 }}>
          <Icon name="eye" size={15} color={c.sub} />
          <Sub>익명 게시판이에요. 글과 댓글에 이름이 보이지 않아요.</Sub>
        </Row>
      ) : null}
    </>
  );
  const canWrite = mine ? d0.board.can_write : info.write_role !== 'admin' || me().is_admin;
  return (
    <Page q={q} header={header} fab={canWrite ? <Fab icon="pen" title="글쓰기" onPress={() => go(`cm/write/${board}`)} /> : null}>
      {() => (
        <Card>
          {posts.length ? (
            <Divided>
              {posts.map((p: any) => (
                <PostRow key={p.id} p={p} />
              ))}
            </Divided>
          ) : (
            <Empty>아직 글이 없어요. 첫 글을 써보세요!</Empty>
          )}
          {hasMore ? (
            <Press onPress={loadMore} style={{ marginTop: 10, padding: 11, borderRadius: 12, backgroundColor: c.surface2 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.sub, textAlign: 'center' }}>더 보기</Text>
            </Press>
          ) : null}
        </Card>
      )}
    </Page>
  );
}

function PostRow({ p }: { p: any }) {
  const c = useColors();
  const lk = (icon: string, n: any, hot?: boolean) => (
    <Row gap={3}>
      <Icon name={icon} size={13} w={2.2} color={hot ? c.danger : c.sub} />
      <Text style={{ fontSize: 12, color: hot ? c.danger : c.sub }}>{n}</Text>
    </Row>
  );
  return (
    <Press onPress={() => go(`cm/post/${p.id}`)} style={{ paddingVertical: 16, flexDirection: 'row', gap: 12 }}>
      <Grow>
        {p.pinned ? <Tag kind="primary">고정</Tag> : null}
        <T style={{ fontWeight: '700', marginTop: 6, marginBottom: 4 }}>{p.title}</T>
        <Text style={{ fontSize: 14, color: c.ink2, lineHeight: 20 }} numberOfLines={1}>
          {p.preview}
        </Text>
        <Row gap={10} style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <Sub style={{ fontSize: 12 }}>
            {p.author} · {ago(p.ts)}
          </Sub>
          {lk('heart', p.likes, p.likes >= 10)}
          {lk('comment', p.comments)}
          {p.files && !p.thumb ? lk('clip', p.files) : null}
        </Row>
      </Grow>
      {p.thumb ? <Image source={{ uri: abs(p.thumb) }} style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: c.surface2 }} /> : null}
    </Press>
  );
}

// ==================================================================
// 글 보기 (전체 화면)
// ==================================================================
export function SubHeader({ onBack, title, sub, right }: { onBack: () => any; title: React.ReactNode; sub?: string; right?: React.ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.subH, { backgroundColor: c.surface, borderBottomColor: c.line, paddingTop: insets.top }]}>
      <IconBtn name="back" size={24} w={2} label="뒤로" onPress={onBack} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? (
          <T style={{ fontSize: 16, fontWeight: '700' }} lines={1}>
            {title}
          </T>
        ) : (
          title
        )}
        {sub ? (
          <Sub style={{ fontSize: 12 }} lines={1}>
            {sub}
          </Sub>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function PostScreen({ id }: { id: number }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const q = useLoad(`post:${id}`, () => api('post', { id }));
  const [comments, setComments] = useState<any[] | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null);
  const [like, setLike] = useState<{ on: boolean; n: number } | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const d = q.data;
  // 받기 전에는 목록에서 본 정보(게시판 · 제목 · 글쓴이)로 위쪽을 먼저 그리고, 본문 자리만 회색 틀
  const p = d ? d.post : postSeed(id);
  const loading = !d;
  const boardBack = () => back(p ? 'cm/board/' + p.board_id : 'cm/board');
  if (!p) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface2 }}>
        <SubHeader onBack={boardBack} title={(getState().data.boards.find((b: any) => b.id === B.board) || {}).name || '게시판'} />
        {q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Skeleton cards={2} style={{ padding: 16 }} />}
      </View>
    );
  }
  const list: any[] = comments || (d ? d.comments : []);
  const liked = like ? like.on : !!p.liked;
  const likes = like ? like.n : p.likes || 0;

  const toggleLike = async () => {
    const on = !liked;
    setLike({ on, n: likes + (on ? 1 : -1) });
    try {
      const r = await post('post.like', { id: p.id, like: on });
      setLike({ on: r.liked, n: r.count });
    } catch (e) {
      setLike({ on: !on, n: likes });
      err(e);
    }
  };
  const cmtLike = async (cm: any) => {
    const r = await post('comment.like', { id: cm.id, like: !cm.liked });
    setComments(list.map((x) => (x.id === cm.id ? { ...x, liked: r.liked, likes: r.count } : x)));
  };
  const cmtDel = async (cm: any) => {
    if (!(await ask({ title: '댓글 삭제', body: '이 댓글을 지울까요?', ok: '삭제', danger: true }))) return;
    const r = await post('comment.delete', { id: cm.id });
    setComments(r.comments);
  };
  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const r = await post('comment.add', { post_id: p.id, body, parent_id: replyTo ? replyTo.id : 0 });
      setComments(r.comments);
      setReplyTo(null);
      setText('');
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      err(e);
    } finally {
      setSending(false);
    }
  };
  const menu = () =>
    sheet.show(
      '글 관리',
      <Divided>
        {p.can_edit ? (
          <Press onPress={() => go(`cm/edit/${p.id}`)} style={st.menuRow}>
            <Icon name="pen" size={18} color={c.ink} />
            <T style={{ fontWeight: '600', flex: 1 }}>글 수정</T>
          </Press>
        ) : null}
        {p.can_delete ? (
          <Press
            onPress={async () => {
              if (!(await ask({ title: '글 삭제', body: '이 글을 지울까요?', ok: '삭제', danger: true }))) return;
              await post('post.delete', { id: p.id });
              toast('글을 지웠어요');
              go('cm/board/' + p.board_id);
            }}
            style={st.menuRow}
          >
            <Icon name="trash" size={18} color={c.danger} />
            <T style={{ fontWeight: '600', flex: 1, color: c.danger }}>글 삭제</T>
          </Press>
        ) : null}
      </Divided>,
    );

  const top = list.filter((x) => !x.parent_id);
  const replies = (pid: number) => list.filter((x) => x.parent_id === pid);
  const one = (cm: any, reply?: boolean) => (
    <View key={cm.id} style={[{ flexDirection: 'row', gap: 10, paddingVertical: 12, paddingLeft: reply ? 34 : 0 }, replyTo && replyTo.id === cm.id && { backgroundColor: c.primarySoft, borderRadius: 12 }]}>
      <Avatar m={cm.deleted || !cm.user_id ? { anon: true } : { name: cm.name, av: cm.av }} size={32} />
      <Grow>
        {cm.deleted ? (
          <Text style={{ fontSize: 14, color: c.faint, marginTop: 3 }}>삭제된 댓글이에요</Text>
        ) : (
          <>
            <Row gap={6}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.ink }}>{cm.name}</Text>
              {cm.is_author && !p.anon ? <Tag kind="primary">글쓴이</Tag> : null}
              <Sub>{ago(cm.ts)}</Sub>
            </Row>
            <LinkText text={cm.body} style={{ fontSize: 14, color: c.ink2, marginTop: 3, lineHeight: 21 }} />
            <Row gap={12} style={{ marginTop: 6 }}>
              <Press onPress={() => cmtLike(cm)} style={st.cmtAct}>
                <Icon name="heart" size={13} w={2.2} color={cm.liked ? c.danger : c.sub} />
                <Text style={{ fontSize: 12, color: cm.liked ? c.danger : c.sub }}>{cm.likes || ''}</Text>
              </Press>
              {p.allow_comments ? (
                <Press
                  onPress={() => {
                    setReplyTo({ id: cm.parent_id || cm.id, name: cm.name });
                    input.current?.focus();
                  }}
                  style={st.cmtAct}
                >
                  <Icon name="reply" size={13} w={2.2} color={c.sub} />
                  <Text style={{ fontSize: 12, color: c.sub }}>답글</Text>
                </Press>
              ) : null}
              {cm.mine || me().is_admin ? (
                <Press onPress={() => cmtDel(cm)} style={st.cmtAct}>
                  <Icon name="trash" size={13} w={2.2} color={c.sub} />
                  <Text style={{ fontSize: 12, color: c.sub }}>삭제</Text>
                </Press>
              ) : null}
            </Row>
          </>
        )}
      </Grow>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.surface2 }}>
      <SubHeader onBack={boardBack} title={p.board} right={p.can_edit || p.can_delete ? <IconBtn name="settings" size={20} label="더보기" onPress={menu} /> : null} />
      <ScrollView ref={scroll} style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingTop: 18, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: c.surface }}>
          <Row gap={10}>
            <Avatar m={p.anon ? { anon: true } : { name: p.author, av: p.av }} />
            <Grow>
              <T style={{ fontWeight: '600' }}>{p.author}</T>
              <Sub>
                {ago(p.ts)}
                {p.edited ? ' · 수정됨' : ''}
                {p.views != null ? ` · 조회 ${p.views}` : ''}
              </Sub>
            </Grow>
          </Row>
          <T style={{ fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginTop: 10, marginBottom: 12, lineHeight: 27 }} sel>
            {p.title}
          </T>
          {loading ? (
            q.error ? (
              <ErrorView message={q.error} onRetry={q.reload} />
            ) : (
              <Skeleton cards={1} style={{ marginHorizontal: -18 }} />
            )
          ) : (
            <>
              <LinkText text={p.body} style={{ fontSize: 15, lineHeight: 25, color: c.ink2, marginTop: 4 }} />
              <Files files={p.files} />
            </>
          )}
          <Press
            onPress={loading ? undefined : toggleLike}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              height: 36,
              paddingHorizontal: 14,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: liked ? c.danger : c.line,
              backgroundColor: liked ? c.dangerSoft : 'transparent',
              alignSelf: 'flex-start',
              marginTop: 16,
              marginBottom: 6,
            }}
          >
            <Icon name="heart" size={16} w={2.2} color={liked ? c.danger : c.ink} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: liked ? c.danger : c.ink }}>공감 {likes}</Text>
          </Press>
        </View>
        <View style={{ backgroundColor: c.surface, marginTop: 8, paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12 }}>
          {loading ? (
            <Sub style={{ paddingTop: 10, paddingBottom: 12, fontWeight: '700' }}>댓글 {p.comments ?? ''}</Sub>
          ) : list.length ? (
            <>
              <Sub style={{ paddingTop: 10, paddingBottom: 2, fontWeight: '700' }}>댓글 {list.filter((x) => !x.deleted).length}</Sub>
              <Divided>{top.flatMap((cm) => [one(cm), ...replies(cm.id).map((x) => one(x, true))])}</Divided>
            </>
          ) : (
            <Empty>첫 댓글을 남겨보세요</Empty>
          )}
        </View>
      </ScrollView>
      {loading || p.allow_comments ? (
        <>
          {replyTo ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 16, backgroundColor: c.primarySoft }}>
              <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>{replyTo.name}님에게 답글</Text>
              <Press onPress={() => setReplyTo(null)} label="답글 취소" hit={8}>
                <Icon name="x" size={16} color={c.primary} />
              </Press>
            </View>
          ) : null}
          <Composer value={text} onChange={setText} onSend={send} placeholder={p.anon ? '익명으로 댓글 달기' : '댓글을 입력하세요'} maxLength={3000} inputRef={input} bottom={insets.bottom} />
        </>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** 게시판 목록에서 본 글 정보 (글 화면을 받기 전에 먼저 보여줄 것) */
function postSeed(id: number) {
  for (const [k, v] of cacheEntries('posts:')) {
    const x = v && v.posts && v.posts.find((p: any) => p.id === id);
    if (!x) continue;
    const boardId = Number(k.slice(6));
    const b = getState().data.boards.find((y: any) => y.id === boardId) || {};
    return { id, board_id: boardId, board: b.name || '게시판', title: x.title, author: x.author, ts: x.ts, likes: x.likes, comments: x.comments, anon: !!b.anonymous, views: null };
  }
  return null;
}

/** 아래 입력창 (댓글 · 채팅) */
export function Composer({
  value,
  onChange,
  onSend,
  placeholder,
  maxLength,
  inputRef,
  bottom,
  left,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => any;
  placeholder: string;
  maxLength: number;
  inputRef?: React.RefObject<React.ComponentRef<typeof TextInput> | null>;
  bottom: number;
  left?: React.ReactNode;
}) {
  const c = useColors();
  const can = !!value.trim();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 10 + bottom, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line }}>
      {left}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.faint}
        multiline
        maxLength={maxLength}
        style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: c.surface2, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 16, color: c.ink }}
      />
      <Press onPress={can ? onSend : undefined} label="보내기" style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: can ? c.primary : c.surface2 }}>
        <Icon name="send" size={18} w={2} color={can ? '#fff' : c.faint} />
      </Press>
    </View>
  );
}

// ==================================================================
// 글쓰기 · 수정 (전체 화면)
// ==================================================================
export function WriteScreen({ id, boardId }: { id: number | null; boardId: number | null }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const q = useLoad(id ? `edit:${id}` : null, async () => (await api('post', { id, no_view: 1 })).post);
  const p = q.data;
  const ready = !id || !!p;
  const bId = p ? p.board_id : boardId;
  const b = getState().data.boards.find((x: any) => x.id === bId);
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [keep, setKeep] = useState<any[] | null>(null);
  const up = useUploads();
  const tTitle = title ?? (p ? p.title : '');
  const tBody = body ?? (p ? p.body : '');
  const tKeep = keep ?? (p ? p.files.map((f: any) => ({ id: f.id, name: f.name })) : []);
  const to = p ? 'cm/post/' + p.id : 'cm/board/' + bId;

  const leave = async () => {
    const dirty = !id && (tTitle.trim() || tBody.trim());
    if (dirty && !(await ask({ title: '나가기', body: '작성 중인 내용이 사라져요. 나갈까요?', ok: '나가기', danger: true }))) return;
    back(to);
  };
  const save = async () => {
    if (!tTitle.trim() || !tBody.trim()) throw new Error('제목과 내용을 입력해 주세요.');
    if (up.busy()) throw new Error('파일을 올리는 중이에요. 잠시만 기다려 주세요.');
    const data: any = { board_id: bId, title: tTitle, body: tBody, files: up.ids(), keep_files: tKeep.map((x: any) => x.id) };
    if (id) data.id = id;
    const r = await post('post.save', data);
    toast(id ? '글을 수정했어요' : '글을 올렸어요');
    if (id) {
      // 수정: 글 보기 화면으로 돌아가 새 내용으로
      refresh();
      back(to);
    } else {
      // 새 글: 글쓰기 화면을 글 보기 화면으로 바꿈
      refresh();
      router.replace({ pathname: '/post/[id]', params: { id: String(r.id) } });
    }
  };
  const header = <SubHeader onBack={leave} title={id ? '글 수정' : '글쓰기'} sub={b ? b.name : ''} right={ready && b ? <Btn sm title={id ? '저장' : '올리기'} onPress={save} style={{ marginRight: 4 }} /> : null} />;
  if (!ready || !b) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        {header}
        {q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : !ready ? <Loading /> : <ErrorView message="게시판을 찾을 수 없어요." onRetry={() => back('cm/board')} />}
      </View>
    );
  }
  const max = b.max_files || 10;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.surface }}>
      {header}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }} keyboardShouldPersistTaps="handled">
        {b.anonymous ? (
          <Row gap={4} style={{ marginBottom: 14 }}>
            <Icon name="eye" size={14} color={c.primary} />
            <Text style={{ fontSize: 13, color: c.primary }}>익명으로 올라가요. 내 이름은 누구에게도 보이지 않아요.</Text>
          </Row>
        ) : null}
        <View style={{ marginBottom: 14 }}>
          <Input value={tTitle} onChangeText={setTitle} maxLength={200} placeholder="제목" style={{ fontSize: 17, fontWeight: '700' }} />
        </View>
        <View style={{ marginBottom: 14 }}>
          <Input tall big value={tBody} onChangeText={setBody} placeholder="내용을 입력하세요" />
        </View>
        {b.allow_attachments ? (
          <>
            <Row gap={8} style={{ marginBottom: 6 }}>
              <Btn sm kind="ghost" icon="image" title="사진" onPress={() => up.pick({ images: true, max: max - tKeep.length })} />
              <Btn sm kind="ghost" icon="clip" title="파일 첨부" onPress={() => up.pick({ max: max - tKeep.length })} />
            </Row>
            <Sub style={{ fontSize: 12, marginBottom: 14 }}>사진, 문서 최대 {max}개</Sub>
            <UpList list={tKeep} onRemove={(i) => setKeep(tKeep.filter((_: any, k: number) => k !== i))} />
            <UpList list={up.list} onRemove={up.remove} />
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  subH: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6, paddingRight: 8, borderBottomWidth: 1 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  cmtAct: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
