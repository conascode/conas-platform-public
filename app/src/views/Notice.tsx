/* 워크스페이스 > 공지 */
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { api, post } from '../lib/api';
import { useLoad } from '../lib/hooks';
import { go, refresh, setBadges, useColors } from '../lib/store';
import { ago } from '../lib/util';
import { Icon } from '../ui/Icon';
import { Btn, BtnRow, Card, Chips, Divided, Empty, Fab, Field, Hint, Input, LinkText, Loading, PageH, Press, Row, Select, St, Sub, SwitchRow, T, Tag } from '../ui/kit';
import { ask, sheet, toast } from '../ui/overlay';
import { Page } from '../ui/Page';

const N = { cat: '전체', data: null as any, current: null as any, set: null as null | ((d: any) => void) };

export function NoticeView({ id }: { id: number | null }) {
  const c = useColors();
  const [cat, setCat] = useState(N.cat);
  const q = useLoad(async () => {
    const d = await api('notices');
    setBadges(d.badges);
    N.data = d;
    return d;
  }, []);
  N.set = q.setData;
  useEffect(() => {
    if (id && q.data) openNotice(id);
  }, [id, !!q.data]);
  return (
    <Page q={q} fab={q.data && q.data.can_write ? <Fab icon="pen" title="공지 쓰기" onPress={() => openNoticeEdit(null)} /> : null}>
      {(d: any) => {
        const cats = ['전체', '필독', ...d.categories];
        const list = d.notices.filter((n: any) => cat === '전체' || (cat === '필독' ? n.must : n.category === cat));
        const pending = d.notices.filter((n: any) => n.need_confirm).length;
        return (
          <>
            <PageH title="공지" sub={pending ? <Text style={{ fontSize: 13, color: c.warn, fontWeight: '600', marginTop: 2 }}>확인이 필요한 필독 공지 {pending}건</Text> : '모든 필독 공지를 확인했어요'} />
            <Chips
              items={cats.map((x) => ({ v: x, label: x }))}
              value={cat}
              onChange={(v) => {
                N.cat = v;
                setCat(v);
              }}
            />
            <Card>
              {list.length ? (
                <Divided>
                  {list.map((n: any) => (
                    <Press key={n.id} onPress={() => openNotice(n.id)} style={{ paddingVertical: 16 }}>
                      <Row gap={6}>
                        {n.must ? <Tag kind="danger">필독</Tag> : null}
                        <Tag kind="primary">{n.category}</Tag>
                        {n.need_confirm ? <St kind="late" style={{ height: 20 }}>확인 필요</St> : null}
                      </Row>
                      <Row gap={7} style={{ marginTop: 6, marginBottom: 4 }}>
                        {!n.read ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.danger }} /> : null}
                        <T style={{ fontWeight: '700', flex: 1 }}>{n.title}</T>
                      </Row>
                      <Text style={{ fontSize: 14, color: c.ink2, lineHeight: 20 }} numberOfLines={1}>
                        {n.preview}
                      </Text>
                      <Row gap={10} style={{ marginTop: 8 }}>
                        <Sub style={{ fontSize: 12 }}>
                          {n.author} · {ago(n.ts)}
                        </Sub>
                        {n.must ? (
                          <Sub style={{ fontSize: 12 }}>
                            확인 {n.confirm_count}/{n.staff_count}명
                          </Sub>
                        ) : null}
                      </Row>
                    </Press>
                  ))}
                </Divided>
              ) : (
                <Empty>공지가 없어요</Empty>
              )}
            </Card>
          </>
        );
      }}
    </Page>
  );
}

async function openNotice(id: number) {
  sheet.show('공지', <Loading />);
  let d: any;
  try {
    d = await api('notice', { id });
  } catch (e: any) {
    sheet.close();
    return toast(e.message);
  }
  if (!sheet.open) return;
  setBadges(d.badges);
  N.current = d.notice;
  // 목록에서도 읽음으로
  if (N.data && N.set) {
    N.data = { ...N.data, notices: N.data.notices.map((x: any) => (x.id === id ? { ...x, read: true } : x)) };
    N.set(N.data);
  }
  sheet.show('공지', <NoticeDetail n={d.notice} />);
}

function NoticeDetail({ n }: { n: any }) {
  const c = useColors();
  const confirm = async () => {
    await post('notice.confirm', { id: n.id });
    toast('확인했어요');
    const d = await api('notices');
    N.data = d;
    N.set?.(d);
    openNotice(n.id);
  };
  const del = async () => {
    if (!(await ask({ title: '공지 삭제', body: '이 공지를 지울까요?', ok: '삭제', danger: true }))) return;
    await post('notice.delete', { id: n.id });
    go('ws/notice');
    toast('공지를 지웠어요');
  };
  return (
    <View>
      <Row gap={6}>
        {n.must ? <Tag kind="danger">필독</Tag> : null}
        <Tag kind="primary">{n.category}</Tag>
      </Row>
      <T style={{ fontSize: 19, fontWeight: '800', marginTop: 8, marginBottom: 4 }}>{n.title}</T>
      <Sub style={{ marginBottom: 16 }}>
        {n.author} · {ago(n.ts)}
      </Sub>
      <LinkText text={n.body} style={{ fontSize: 15, lineHeight: 25, color: c.ink2 }} />
      {!n.must ? null : n.need_confirm ? (
        <View style={{ marginTop: 22 }}>
          <Btn icon="check" title="확인했어요" onPress={confirm} />
        </View>
      ) : (
        <View style={{ marginTop: 22, padding: 14, borderRadius: 12, backgroundColor: c.okSoft }}>
          <Row gap={4}>
            <Icon name="check" size={16} w={2.6} color={c.ok} />
            <Text style={{ color: c.ok, fontSize: 14, fontWeight: '700' }}>
              {n.confirm_count}/{n.staff_count}명 확인
            </Text>
          </Row>
          <Text style={{ color: c.ink2, fontSize: 13, marginTop: 6 }}>{n.pending_names.length ? '아직 확인 안 함: ' + n.pending_names.join(', ') : '전원 확인했어요'}</Text>
        </View>
      )}
      {n.can_edit ? (
        <BtnRow style={{ marginTop: 14 }}>
          <Btn kind="ghost" icon="pen" title="수정" onPress={() => openNoticeEdit(n)} />
          <Btn kind="danger" icon="trash" title="삭제" onPress={del} />
        </BtnRow>
      ) : null}
    </View>
  );
}

function openNoticeEdit(n: any | null) {
  sheet.show(n ? '공지 수정' : '공지 쓰기', <NoticeEdit n={n} />);
}
function NoticeEdit({ n }: { n: any | null }) {
  const cats: string[] = (N.data && N.data.categories) || ['일반'];
  const [f, setF] = useState({ category: n ? n.category : cats[0], title: n ? n.title : '', body: n ? n.body : '', must: n ? !!n.must : false });
  const save = async () => {
    if (!f.title.trim() || !f.body.trim()) throw new Error('제목과 내용을 입력해 주세요.');
    await post('notice.save', n ? { id: n.id, ...f } : f);
    sheet.close();
    toast(n ? '공지를 수정했어요' : '공지를 올렸어요');
    refresh();
  };
  return (
    <View>
      <Field label="분류">
        <Select value={f.category} onChange={(v) => setF({ ...f, category: v })} options={cats.map((x) => ({ value: x, label: x }))} />
      </Field>
      <Field label="제목">
        <Input value={f.title} onChangeText={(v) => setF({ ...f, title: v })} maxLength={200} />
      </Field>
      <Field label="내용">
        <Input tall value={f.body} onChangeText={(v) => setF({ ...f, body: v })} />
      </Field>
      <SwitchRow title="필독 공지" sub="직원마다 '확인했어요'를 눌러야 해요" value={f.must} onChange={(v) => setF({ ...f, must: v })} />
      <Hint style={{ marginTop: 4 }}>{n ? '수정해도 알림은 다시 가지 않아요.' : '올리면 전 직원에게 알림이 가요.'}</Hint>
      <Btn title={n ? '저장' : '올리기'} onPress={save} />
    </View>
  );
}
