/* 워크스페이스 > 내 정보: 프로필 · 계약서 · 급여 명세 · 화면 모드 · 비밀번호 · 로그아웃 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { avatarPost, post } from '../lib/api';
import { useLoad } from '../lib/hooks';
import { L } from '../lib/loaders';
import { loadData, me, mem, refresh, setTheme, useColors, useStore } from '../lib/store';
import { md, roleLabel, won } from '../lib/util';
import { Icon } from '../ui/Icon';
import { Avatar, Btn, Card, CardH, Chips, Divided, DocIc, Empty, Field, Grow, Input, KV, openFile, Press, Sub, T } from '../ui/kit';
import { ask, sheet, toast } from '../ui/overlay';
import { Page } from '../ui/Page';
import { doLogout } from './Auth';

const done = (msg?: string) => {
  sheet.close();
  if (msg) toast(msg);
  refresh();
};

/** 급여 명세 카드 (내 정보, 임직원 화면에서 같이 씀) */
export function PayCard({ pay, start = 0 }: { pay: any; start?: number }) {
  const c = useColors();
  const [idx, setIdx] = useState(start);
  if (!pay.slips.length) return <Empty>아직 올라온 급여 명세가 없어요</Empty>;
  const i = Math.min(idx, pay.slips.length - 1);
  const s = pay.slips[i];
  const lines = (kind: string) =>
    s.items
      .filter((x: any) => x.kind === kind)
      .map((x: any, k: number) => (
        <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
          <Text style={{ fontSize: 14, color: c.ink2 }}>{x.label}</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: kind === 'deduct' ? c.danger : c.ink }}>
            {kind === 'deduct' ? '−' : ''}
            {won(x.amount)}
          </Text>
        </View>
      ));
  const sec = (title: string, amount: number, body: React.ReactNode) => (
    <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.line, borderStyle: 'dashed' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 13, color: c.sub, fontWeight: '700' }}>{title}</Text>
        <Text style={{ fontSize: 13, color: c.sub, fontWeight: '700' }}>{won(amount)}</Text>
      </View>
      {body}
    </View>
  );
  const deducts = lines('deduct');
  return (
    <View>
      <Chips items={pay.slips.map((x: any, k: number) => ({ v: k, label: `${Number(x.month.slice(5))}월` }))} value={i} onChange={setIdx} />
      <Sub>
        {s.month.slice(0, 4)}년 {Number(s.month.slice(5))}월 실수령액
      </Sub>
      <T style={{ fontSize: 30, fontWeight: '800', letterSpacing: -0.9, marginTop: 2, marginBottom: 4 }}>{won(s.net)}</T>
      <Sub>
        지급 {won(s.gross)} − 공제 {won(s.deduct)}
      </Sub>
      {sec('지급', s.gross, lines('pay'))}
      {sec(
        '공제',
        s.deduct,
        deducts.length ? (
          deducts
        ) : (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
            <Text style={{ fontSize: 14, color: c.ink2 }}>공제 없음</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.ink }}>0원</Text>
          </View>
        )
      )}
      {s.memo ? (
        <View style={{ marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: c.surface3 }}>
          <Text style={{ fontSize: 14, lineHeight: 22, color: c.ink2 }}>{s.memo}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** 근로계약서 내용 */
export function ContractInfo({ c: ct }: { c: any }) {
  return (
    <View>
      <Divided>
        <KV k="계약 형태" v={ct.type || '-'} />
        <KV k="계약 기간" v={`${ct.start ? md(ct.start) : '-'}${ct.end ? ' ~ ' + md(ct.end) : ' ~'}`} />
        <KV k="근무 시간" v={ct.hours || '-'} />
        <KV k="급여" v={ct.salary || '-'} />
      </Divided>
      {ct.file ? (
        <View style={{ marginTop: 18 }}>
          <Btn icon="download" title="계약서 파일 받기" onPress={() => openFile(ct.file.url, ct.file.name || 'contract.pdf')} />
        </View>
      ) : (
        <Sub style={{ marginTop: 14 }}>계약서 파일은 아직 올라오지 않았어요.</Sub>
      )}
    </View>
  );
}

export function MeView() {
  const c = useColors();
  const m = useStore((s) => s.data.me);
  const theme = useStore((s) => s.theme);
  const q = useLoad(...L.pay());
  const menu = (icon: string, t: string, title: string, onPress: () => any, opt: { danger?: boolean; right?: React.ReactNode; chev?: boolean } = {}) => (
    <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
      <DocIc icon={icon} t={t} />
      <T style={{ flex: 1, fontWeight: '600', color: opt.danger ? c.danger : c.ink }}>{title}</T>
      {opt.right}
      {opt.chev !== false ? <Icon name="chevR" size={18} color={c.ink} /> : null}
    </Press>
  );
  return (
    <Page q={q}>
      {(pay: any) => (
        <>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Press onPress={() => avatarMenu()} label="프로필 사진 바꾸기">
                <Avatar m={{ ...m, online: false }} size={58} />
                <View style={{ position: 'absolute', right: -3, bottom: -3, width: 24, height: 24, borderRadius: 12, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.surface }}>
                  <Icon name="camera" size={13} w={2.2} color={c.surface} />
                </View>
              </Press>
              <Grow>
                <T style={{ fontSize: 19, fontWeight: '800' }}>{m.name}</T>
                <Sub style={{ fontSize: 14, marginTop: 2 }}>
                  {roleLabel(m)}
                  {m.is_admin ? ' · 관리자' : ''}
                </Sub>
              </Grow>
              <Btn sm kind="ghost" title="수정" onPress={() => sheet.show('내 정보 수정', <MeEdit />)} />
            </View>
          </Card>
          <Card style={{ paddingTop: 12, paddingBottom: 6 }}>
            <Divided>
              <KV k="이메일" v={m.email} />
              <KV k="연락처" v={m.phone || '없음'} />
              <KV k="입사일" v={m.joined_on ? md(m.joined_on) : '-'} />
              <KV k="결재 담당" v={m.approvers.map((id: number) => (mem(id) || {}).name || '').join(' → ') || '전결'} />
            </Divided>
          </Card>
          <Card style={{ paddingTop: 8, paddingBottom: 4 }}>
            {menu('file', 'primary', '내 계약서 확인하기', () => sheet.show(pay.contract ? pay.contract.title : '근로계약서', pay.contract ? <ContractInfo c={pay.contract} /> : <Empty>{'아직 등록된 계약서가 없어요.\n대표가 임직원 화면에서 등록할 수 있어요.'}</Empty>), {
              right: pay.contract ? null : <Sub>없음</Sub>,
            })}
          </Card>
          <Card>
            <CardH title="급여 명세" />
            <PayCard pay={pay} />
          </Card>
          <Card>
            <CardH title="화면 모드" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['light', 'dark'] as const).map((t) => (
                <Press key={t} onPress={() => setTheme(t)} style={{ flex: 1, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: theme === t ? c.primary : c.line, gap: 8 }}>
                  <View style={{ height: 42, borderRadius: 9, flexDirection: 'row', gap: 4, padding: 6, backgroundColor: t === 'light' ? '#f2f4f6' : '#08090b' }}>
                    <View style={{ flex: 1, borderRadius: 5, backgroundColor: t === 'light' ? '#fff' : '#202328' }} />
                    <View style={{ flex: 1, borderRadius: 5, backgroundColor: t === 'light' ? '#fff' : '#202328' }} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name={t === 'light' ? 'sun' : 'moon'} size={16} color={c.ink} />
                    <T style={{ fontSize: 14, fontWeight: '600' }}>{t === 'light' ? '밝은 화면' : '어두운 화면'}</T>
                  </View>
                </Press>
              ))}
            </View>
          </Card>
          <Card style={{ paddingTop: 8, paddingBottom: 4 }}>
            <Divided>
              <View style={{ paddingVertical: 12 }}>
                <T style={{ fontWeight: '600' }}>알림 받기</T>
                <Sub style={{ fontSize: 12, marginTop: 2 }}>앱 푸시 알림은 아직 준비 중이에요. 알림은 위쪽 종 아이콘에서 확인할 수 있어요.</Sub>
              </View>
              {menu('lock', 'gray', '비밀번호 바꾸기', () => sheet.show('비밀번호 바꾸기', <PasswordForm />))}
              {menu('logout', 'danger', '로그아웃', confirmLogout, { danger: true, chev: false })}
            </Divided>
          </Card>
        </>
      )}
    </Page>
  );
}

export async function confirmLogout() {
  if (!(await ask({ title: '로그아웃', body: '이 기기에서 로그아웃할까요?', ok: '로그아웃' }))) return;
  await doLogout();
}

function MeEdit() {
  const m = me();
  const [name, setName] = useState(m.name);
  const [phone, setPhone] = useState(m.phone || '');
  const save = async () => {
    if (!name.trim()) throw new Error('이름을 입력해 주세요.');
    await post('me.update', { display_name: name, phone });
    await loadData();
    done('저장했어요');
  };
  return (
    <View>
      <Field label="이름">
        <Input value={name} onChangeText={setName} maxLength={50} />
      </Field>
      <Field label="연락처 (선택)" small="비워두면 다른 사람에게 보이지 않아요">
        <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} placeholder="010-1234-5678" />
      </Field>
      <Btn title="저장" onPress={save} />
    </View>
  );
}

function PasswordForm() {
  const [f, setF] = useState({ current: '', new: '', new2: '' });
  const save = async () => {
    if (!f.current || !f.new) throw new Error('비밀번호를 입력해 주세요.');
    if (f.new.length < 8) throw new Error('새 비밀번호는 8자 이상이어야 해요.');
    if (f.new !== f.new2) throw new Error('새 비밀번호 확인이 일치하지 않아요.');
    await post('me.password', f);
    done('비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해야 해요.');
  };
  return (
    <View>
      <Sub style={{ marginBottom: 14 }}>conas.kr 메인 사이트 비밀번호도 함께 바뀌어요.</Sub>
      <Field label="현재 비밀번호">
        <Input value={f.current} onChangeText={(v) => setF({ ...f, current: v })} secureTextEntry autoComplete="current-password" />
      </Field>
      <Field label="새 비밀번호 (8자 이상)">
        <Input value={f.new} onChangeText={(v) => setF({ ...f, new: v })} secureTextEntry autoComplete="new-password" maxLength={72} />
      </Field>
      <Field label="새 비밀번호 확인">
        <Input value={f.new2} onChangeText={(v) => setF({ ...f, new2: v })} secureTextEntry autoComplete="new-password" maxLength={72} />
      </Field>
      <Btn title="바꾸기" onPress={save} />
    </View>
  );
}

// ------------------------------------------------------------------
// 프로필 사진: 휴대폰 기본 편집 화면에서 정사각형으로 잘라 올림 (화면에서는 동그랗게)
// ------------------------------------------------------------------
async function pickAvatar() {
  if (sheet.open) {
    sheet.close();
    // 창이 다 닫힌 뒤 사진 고르기를 띄워야 아이폰에서 안 막힘
    await new Promise((r) => setTimeout(r, 400));
  }
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.92 });
  if (r.canceled || !r.assets[0]) return;
  const a = r.assets[0];
  try {
    await avatarPost({ uri: a.uri, name: a.fileName || 'avatar.jpg', type: a.mimeType || 'image/jpeg' });
    await loadData();
    done('프로필 사진을 바꿨어요');
  } catch (e: any) {
    toast(e.message);
  }
}
function avatarMenu() {
  if (!me().av) return pickAvatar();
  sheet.show('프로필 사진', <AvatarMenu />);
}
function AvatarMenu() {
  const c = useColors();
  const del = async () => {
    if (!(await ask({ title: '사진 지우기', body: '프로필 사진을 지울까요?', ok: '지우기', danger: true }))) return;
    await avatarPost(null);
    await loadData();
    done('프로필 사진을 지웠어요');
  };
  return (
    <Divided>
      <Press onPress={pickAvatar} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
        <DocIc icon="image" t="primary" />
        <T style={{ flex: 1, fontWeight: '600' }}>새 사진 고르기</T>
        <Icon name="chevR" size={18} color={c.ink} />
      </Press>
      <Press onPress={del} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
        <DocIc icon="trash" t="danger" />
        <T style={{ flex: 1, fontWeight: '600', color: c.danger }}>사진 지우기</T>
      </Press>
    </Divided>
  );
}
