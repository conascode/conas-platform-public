/*
 * 아래에서 올라오는 창(시트) · 알림 토스트 · 확인 창
 * 웹의 A.sheet.show / A.toast / A.ask 와 같은 방식으로 어디서나 부를 수 있음
 *   sheet.show('제목', <내용 />)   sheet.close()
 *   toast('저장했어요')   err(e)
 *   if (await ask({ title, body, ok, danger })) ...
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setCloseOverlays, useColors } from '../lib/store';
import { Icon } from './Icon';

// ------------------------------------------------------------------
// 토스트
// ------------------------------------------------------------------
type ToastState = { msg: string; key: number } | null;
let toastState: ToastState = null;
const toastSubs = new Set<(t: ToastState) => void>();
let toastTimer: any;
export function toast(msg: string) {
  toastState = { msg, key: Date.now() };
  toastSubs.forEach((f) => f(toastState));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastState = null;
    toastSubs.forEach((f) => f(null));
  }, 2200);
}
export const err = (e: any) => toast((e && e.message) || '문제가 생겼어요. 다시 시도해 주세요.');

/** 토스트 표시 자리. inSheet: 시트가 열려 있을 때 시트 위에 보여줌 */
export function ToastHost({ inSheet }: { inSheet?: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [t, setT] = useState<ToastState>(toastState);
  const [sheetOpen, setSheetOpen] = useState(!!sheetState);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const f = (x: ToastState) => setT(x);
    const g = (s: SheetState) => setSheetOpen(!!s);
    toastSubs.add(f);
    sheetSubs.add(g);
    return () => {
      toastSubs.delete(f);
      sheetSubs.delete(g);
    };
  }, []);
  useEffect(() => {
    if (t) {
      anim.setValue(0);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 6, tension: 120 }).start();
    }
  }, [t?.key]);
  if (!t || (!inSheet && sheetOpen)) return null;
  return (
    <View pointerEvents="none" style={[st.toastWrap, { top: insets.top + 68 }]}>
      <Animated.View
        style={[
          st.toast,
          { backgroundColor: c.toastBg, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] },
        ]}
      >
        <Text style={[st.toastText, { color: c.toastInk }]}>{t.msg}</Text>
      </Animated.View>
    </View>
  );
}

// ------------------------------------------------------------------
// 시트
// ------------------------------------------------------------------
type SheetState = { title: string; node: React.ReactNode; onClose?: () => void; key: number; nonce: number } | null;
let sheetState: SheetState = null;
const sheetSubs = new Set<(s: SheetState) => void>();
const emit = () => sheetSubs.forEach((f) => f(sheetState));

export const sheet = {
  get open() {
    return !!sheetState;
  },
  /** 이미 열려 있으면 내용만 바꿈 */
  show(title: string, node: React.ReactNode, opt: { onClose?: () => void } = {}) {
    const key = sheetState ? sheetState.key : Date.now();
    sheetState = { title, node, onClose: opt.onClose, key, nonce: Date.now() + Math.random() };
    emit();
  },
  close() {
    if (!sheetState) return;
    const cb = sheetState.onClose;
    sheetState = null;
    emit();
    if (cb) cb();
  },
};
setCloseOverlays(() => sheet.close());

export function SheetHost() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [s, setS] = useState<SheetState>(sheetState);
  const [visible, setVisible] = useState(!!sheetState);
  const shown = useRef<SheetState>(null);
  const y = useRef(new Animated.Value(0)).current;
  const isVisible = useRef(false);
  // 열 때마다 늘어남 → 올라오는 움직임을 (다시) 시작
  const [seq, setSeq] = useState(0);
  useEffect(() => {
    const f = (x: SheetState) => {
      if (x) {
        // 완전히 닫혀 있던 경우에만 아래에서부터. 열린 채 내용만 바뀌면 그대로 둠
        if (!isVisible.current) y.setValue(0);
        isVisible.current = true;
        shown.current = x;
        setS(x);
        setVisible(true);
        setSeq((n) => n + 1);
      } else {
        // 닫는 움직임이 끝난 뒤 내용을 비움 (그사이 다시 열리면 그대로 둠)
        Animated.timing(y, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
          if (!finished || sheetState) return;
          isVisible.current = false;
          setVisible(false);
          setS(null);
        });
      }
    };
    sheetSubs.add(f);
    return () => {
      sheetSubs.delete(f);
    };
  }, []);
  useEffect(() => {
    if (isVisible.current) Animated.spring(y, { toValue: 1, useNativeDriver: true, friction: 9, tension: 70 }).start();
  }, [seq]);
  const h = Dimensions.get('window').height;
  const cur = s || shown.current;
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => sheet.close()}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.backdrop, opacity: y }]}>
          <Pressable style={{ flex: 1 }} onPress={() => sheet.close()} accessibilityLabel="닫기" />
        </Animated.View>
        <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
          <Animated.View
            style={[
              st.sheet,
              { backgroundColor: c.surface, maxHeight: h * 0.9, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [h * 0.6, 0] }) }] },
            ]}
          >
            <View style={st.sheetHead}>
              <Text style={[st.sheetTitle, { color: c.ink }]} numberOfLines={1}>
                {cur?.title || ''}
              </Text>
              <Pressable style={st.iconBtn} onPress={() => sheet.close()} accessibilityLabel="닫기" hitSlop={6}>
                <Icon name="x" color={c.ink} />
              </Pressable>
            </View>
            <ScrollView
              key={cur?.nonce}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 + insets.bottom }}
            >
              <React.Fragment key={cur?.nonce}>{cur?.node}</React.Fragment>
            </ScrollView>
          </Animated.View>
        </View>
        <ToastHost inSheet />
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ------------------------------------------------------------------
// 확인 창
// ------------------------------------------------------------------
function AskBody({ body, ok, cancel, danger, done }: { body: string; ok: string; cancel: string; danger: boolean; done: (v: boolean) => void }) {
  const c = useColors();
  return (
    <View>
      <Text style={{ fontSize: 15, color: c.ink2, lineHeight: 24, marginBottom: 20 }}>{body}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable style={[st.askBtn, { backgroundColor: c.surface2 }]} onPress={() => done(false)}>
          <Text style={[st.askText, { color: c.ink }]}>{cancel}</Text>
        </Pressable>
        <Pressable style={[st.askBtn, { backgroundColor: danger ? c.dangerSoft : c.primary }]} onPress={() => done(true)}>
          <Text style={[st.askText, { color: danger ? c.danger : c.onPrimary }]}>{ok}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const ask = ({ title = '확인', body = '', ok = '확인', cancel = '취소', danger = false } = {}) =>
  new Promise<boolean>((resolve) => {
    let answered = false;
    const done = (v: boolean) => {
      if (answered) return;
      answered = true;
      resolve(v);
    };
    sheet.show(
      title,
      <AskBody
        body={body}
        ok={ok}
        cancel={cancel}
        danger={danger}
        done={(v) => {
          done(v);
          sheet.close();
        }}
      />,
      { onClose: () => done(false) }
    );
  });

const st = StyleSheet.create({
  toastWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 40 },
  toast: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14 },
  toastText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, paddingRight: 10, paddingBottom: 6, paddingLeft: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '800', flex: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  askBtn: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  askText: { fontSize: 16, fontWeight: '700' },
});
