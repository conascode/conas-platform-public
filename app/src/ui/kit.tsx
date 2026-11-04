/*
 * 공통 화면 조각 (웹 spa.css 의 .card, .btn, .tag, .st, .field … 와 같은 모양)
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageStyle,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch as RNSwitch,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { fetchAuthed, useAuthedUri } from '../lib/files';
import { useColors } from '../lib/store';
import { Colors, stTone, tone } from '../lib/theme';
import { avatarColor, iso, pad, splitLinks, toDate } from '../lib/util';
import { Icon } from './Icon';
import { err, toast } from './overlay';

type Kids = { children?: React.ReactNode };

// ------------------------------------------------------------------
// 글자
// ------------------------------------------------------------------
export function T({ style, children, lines, sel }: Kids & { style?: StyleProp<TextStyle>; lines?: number; sel?: boolean }) {
  const c = useColors();
  return (
    <Text style={[{ color: c.ink, fontSize: 15 }, style]} numberOfLines={lines} selectable={sel}>
      {children}
    </Text>
  );
}
/** 회색 작은 글자 (.t13.muted) */
export function Sub({ style, children, lines }: Kids & { style?: StyleProp<TextStyle>; lines?: number }) {
  const c = useColors();
  return (
    <Text style={[{ color: c.sub, fontSize: 13 }, style]} numberOfLines={lines}>
      {children}
    </Text>
  );
}

/** 주소는 눌러서 열 수 있게 */
export function LinkText({ text, style, linkColor }: { text: string; style?: StyleProp<TextStyle>; linkColor?: string }) {
  const c = useColors();
  return (
    <Text style={style} selectable>
      {splitLinks(text).map((p, i) =>
        p.url ? (
          <Text key={i} style={{ color: linkColor || c.primary, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(p.url!).catch(() => {})}>
            {p.t}
          </Text>
        ) : (
          <Text key={i}>{p.t}</Text>
        )
      )}
    </Text>
  );
}

// ------------------------------------------------------------------
// 누르기
// ------------------------------------------------------------------
/** 누르면 살짝 흐려지는 영역. onPress가 Promise를 돌려주면 끝날 때까지 다시 못 누름 */
export function Press({
  onPress,
  onPressIn,
  style,
  children,
  disabled,
  label,
  hit,
  pressedStyle,
}: Kids & { onPress?: () => any; onPressIn?: () => any; style?: StyleProp<ViewStyle>; disabled?: boolean; label?: string; hit?: number; pressedStyle?: ViewStyle }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!onPress || busy) return;
    const r = onPress();
    if (r && typeof r.then === 'function') {
      setBusy(true);
      try {
        await r;
      } catch (e) {
        err(e);
      } finally {
        setBusy(false);
      }
    }
  };
  return (
    <Pressable
      onPress={run}
      onPressIn={onPressIn}
      disabled={disabled || busy || !onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={hit}
      style={({ pressed }) => [style, pressed && (pressedStyle || { opacity: 0.6 }), (disabled || busy) && onPress ? { opacity: 0.5 } : null]}
    >
      {children}
    </Pressable>
  );
}

type BtnKind = 'primary' | 'ghost' | 'danger';
export function Btn({
  title,
  icon,
  kind = 'primary',
  sm,
  onPress,
  disabled,
  style,
  color,
}: {
  title: string;
  icon?: string;
  kind?: BtnKind;
  sm?: boolean;
  onPress?: () => any;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  color?: string;
}) {
  const c = useColors();
  const bg = kind === 'ghost' ? c.surface2 : kind === 'danger' ? c.dangerSoft : c.primary;
  const fg = color || (kind === 'ghost' ? c.ink : kind === 'danger' ? c.danger : c.onPrimary);
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      pressedStyle={{ transform: [{ scale: 0.98 }] }}
      style={[sm ? s.btnSm : s.btn, { backgroundColor: bg }, style]}
    >
      {icon ? <Icon name={icon} size={sm ? 16 : 18} w={2.2} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: sm ? 14 : 16, fontWeight: '700' }}>{title}</Text>
    </Press>
  );
}
export function BtnRow({ children, style }: Kids & { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', gap: 8 }, style]}>{React.Children.map(children, (ch) => (ch ? <View style={{ flex: 1 }}>{ch}</View> : null))}</View>;
}

export function IconBtn({ name, onPress, label, size = 22, w, color, style, badge }: { name: string; onPress?: () => any; label: string; size?: number; w?: number; color?: string; style?: StyleProp<ViewStyle>; badge?: number }) {
  const c = useColors();
  return (
    <Press onPress={onPress} label={label} style={[s.iconBtn, style]} hit={4}>
      <Icon name={name} size={size} w={w} color={color || c.ink} />
      {badge ? (
        <View style={[s.badge, { backgroundColor: c.danger, borderColor: c.surface }]}>
          <Text style={s.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Press>
  );
}

export function Fab({ title, icon, onPress, low }: { title: string; icon: string; onPress: () => any; low?: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Press onPress={onPress} style={[s.fab, { backgroundColor: c.ink, bottom: low ? 24 + insets.bottom : 20 }]} pressedStyle={{ transform: [{ scale: 0.96 }] }}>
      <Icon name={icon} size={18} w={2.4} color={c.surface} />
      <Text style={{ color: c.surface, fontWeight: '700', fontSize: 15 }}>{title}</Text>
    </Press>
  );
}

// ------------------------------------------------------------------
// 틀
// ------------------------------------------------------------------
export function Card({ children, style, review }: Kids & { style?: StyleProp<ViewStyle>; review?: boolean }) {
  const c = useColors();
  return <View style={[s.card, { backgroundColor: c.surface }, review && { borderWidth: 1.5, borderColor: c.leaveSoft }, style]}>{children}</View>;
}
export function CardH({ title, right, children }: Kids & { title?: React.ReactNode; right?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={s.cardH}>
      {typeof title === 'string' ? <Text style={{ fontSize: 16, fontWeight: '700', color: c.ink }}>{title}</Text> : title}
      {children}
      {right}
    </View>
  );
}
/** 카드 머리 오른쪽의 작은 버튼 (전체 ›, + 추가) */
export function More({ title, icon, onPress }: { title: string; icon?: string; onPress: () => any }) {
  const c = useColors();
  return (
    <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }} hit={8}>
      {icon === 'plus' ? <Icon name="plus" size={14} w={2.4} color={c.sub} /> : null}
      <Text style={{ fontSize: 13, color: c.sub }}>{title}</Text>
      {icon === 'chevR' ? <Icon name="chevR" size={14} w={2} color={c.sub} /> : null}
    </Press>
  );
}
export function PageH({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={s.pageH}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: c.ink, letterSpacing: -0.6 }}>{title}</Text>
        {sub ? typeof sub === 'string' ? <Text style={{ fontSize: 13, color: c.sub, marginTop: 2 }}>{sub}</Text> : sub : null}
      </View>
      {right}
    </View>
  );
}
/** 테두리 있는 작은 버튼 (.new-btn) */
export function NewBtn({ title, icon, onPress }: { title: string; icon: string; onPress: () => any }) {
  const c = useColors();
  return (
    <Press onPress={onPress} style={[s.newBtn, { backgroundColor: c.surface, borderColor: c.line }]}>
      <Icon name={icon} size={16} w={2.2} color={c.ink} />
      <Text style={{ fontSize: 13, fontWeight: '700', color: c.ink }}>{title}</Text>
    </Press>
  );
}

/** 항목 사이에 가는 줄 (.list-item + .list-item) */
export function Divided({ children, style, gap = 0 }: Kids & { style?: StyleProp<ViewStyle>; gap?: number }) {
  const c = useColors();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={style}>
      {items.map((ch, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <View style={{ height: 1, backgroundColor: c.line, marginVertical: gap }} /> : null}
          {ch}
        </React.Fragment>
      ))}
    </View>
  );
}
export function ListItem({ children, onPress, onPressIn, style, label }: Kids & { onPress?: () => any; onPressIn?: () => any; style?: StyleProp<ViewStyle>; label?: string }) {
  const inner = [s.listItem, style];
  if (!onPress) return <View style={inner}>{children}</View>;
  return (
    <Press onPress={onPress} onPressIn={onPressIn} style={inner} label={label}>
      {children}
    </Press>
  );
}
export const Grow = ({ children, style }: Kids & { style?: StyleProp<ViewStyle> }) => <View style={[{ flex: 1, minWidth: 0 }, style]}>{children}</View>;
export const Row = ({ children, style, gap = 12 }: Kids & { style?: StyleProp<ViewStyle>; gap?: number }) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;

export function KV({ k, v, children }: { k: string; v?: React.ReactNode } & Kids) {
  const c = useColors();
  const val = v ?? children;
  return (
    <View style={s.kv}>
      <Text style={{ color: c.sub, fontSize: 15 }}>{k}</Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{typeof val === 'string' || typeof val === 'number' ? <Text style={{ fontSize: 15, fontWeight: '600', color: c.ink, textAlign: 'right' }}>{val}</Text> : val}</View>
    </View>
  );
}

export function Empty({ children, style }: Kids & { style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ paddingVertical: 22, alignItems: 'center' }, style]}>
      {typeof children === 'string' ? <Text style={{ color: c.sub, fontSize: 14, textAlign: 'center', lineHeight: 22 }}>{children}</Text> : children}
    </View>
  );
}
export function Loading({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ paddingVertical: 60, alignItems: 'center' }, style]}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}
/** 화면을 불러오지 못했을 때 */
export function ErrorView({ message, onRetry }: { message: string; onRetry: () => any }) {
  return (
    <Empty style={{ paddingVertical: 60 }}>
      <Sub style={{ fontSize: 14, textAlign: 'center' }}>{message || '화면을 불러오지 못했어요.'}</Sub>
      <View style={{ height: 16 }} />
      <Btn sm kind="ghost" title="다시 시도" onPress={onRetry} />
    </Empty>
  );
}

// ------------------------------------------------------------------
// 꼬리표 · 상태 · 숫자
// ------------------------------------------------------------------
export function Tag({ kind, children, onPress }: Kids & { kind?: 'primary' | 'danger' | 'warn' | 'leave'; onPress?: () => any }) {
  const c = useColors();
  const [fg, bg] = kind === 'primary' ? [c.primary, c.primarySoft] : kind === 'danger' ? [c.danger, c.dangerSoft] : kind === 'warn' ? [c.warn, c.warnSoft] : kind === 'leave' ? [c.leave, c.leaveSoft] : [c.ink2, c.surface2];
  const body = (
    <Text style={{ fontSize: 11, fontWeight: '700', color: fg }} numberOfLines={1}>
      {children}
    </Text>
  );
  if (onPress)
    return (
      <Press onPress={onPress} style={[s.tag, { backgroundColor: bg }]}>
        {body}
      </Press>
    );
  return <View style={[s.tag, { backgroundColor: bg }]}>{body}</View>;
}
export function St({ kind, children, style }: Kids & { kind: string; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const [fg, bg] = stTone(c, kind);
  return (
    <View style={[s.st, { backgroundColor: bg }, style]}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: fg }}>{children}</Text>
    </View>
  );
}
export function Count({ n, style }: { n: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  if (!n) return null;
  return (
    <View style={[s.count, { backgroundColor: c.danger }, style]}>
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{n > 99 ? '99+' : n}</Text>
    </View>
  );
}
/** 둥근 네모 안의 아이콘 (.doc-ic.c-primary) */
export function DocIc({ icon, t = 'gray', size = 38, iconSize = 18 }: { icon: string; t?: string; size?: number; iconSize?: number }) {
  const c = useColors();
  const [fg, bg] = tone(c, t);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.29, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={iconSize} w={2} color={fg} />
    </View>
  );
}
export function ChanIc({ size = 40, icon = 'hash', t }: { size?: number; icon?: string; t?: string }) {
  const c = useColors();
  const [fg, bg] = t ? tone(c, t) : [c.ink2, c.surface2];
  return (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size / 2} w={2} color={fg} />
    </View>
  );
}

// ------------------------------------------------------------------
// 선택 칩 · 세그먼트
// ------------------------------------------------------------------
export function Chips({ items, value, onChange }: { items: { v: any; label: string }[]; value: any; onChange: (v: any) => void }) {
  const c = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }} contentContainerStyle={{ gap: 6 }}>
      {items.map((it) => {
        const on = it.v === value;
        return (
          <Press key={String(it.v)} onPress={() => onChange(it.v)} style={[s.chip, { backgroundColor: on ? c.ink : c.surface, borderColor: on ? c.ink : c.line }]}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: on ? c.surface : c.ink2 }}>{it.label}</Text>
          </Press>
        );
      })}
    </ScrollView>
  );
}
export function Seg({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  const c = useColors();
  return (
    <View style={[s.seg, { backgroundColor: c.surface2 }]}>
      {options.map(([v, l]) => {
        const on = v === value;
        return (
          <Press key={v} onPress={() => onChange(v)} style={[s.segBtn, on && { backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }]}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: on ? c.ink : c.sub }}>{l}</Text>
          </Press>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------
// 사람 사진
// ------------------------------------------------------------------
export function Avatar({ m, size = 40, ring, noDot }: { m: any; size?: number; ring?: string; noDot?: boolean }) {
  const c = useColors();
  const ringStyle = ring ? { borderWidth: 2, borderColor: ring } : null;
  if (!m || m.anon) {
    return (
      <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }, ringStyle]}>
        <Icon name="user" size={Math.round(size * 0.45)} color={c.sub} />
      </View>
    );
  }
  const name = String(m.name || '?');
  const dot = m.online && !noDot ? (
    <View style={{ position: 'absolute', right: 0, bottom: 0, width: Math.max(11, size * 0.22), height: Math.max(11, size * 0.22), borderRadius: 99, backgroundColor: c.ok, borderWidth: size > 60 ? 3 : 2, borderColor: c.surface }} />
  ) : null;
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: m.av ? c.surface2 : avatarColor(name), alignItems: 'center', justifyContent: 'center' }, ringStyle]}>
      {m.av ? (
        <AuthImage url={m.av} style={{ width: '100%', height: '100%', borderRadius: size / 2 }} />
      ) : (
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: Math.round(size * 0.38) }}>{[...name][0]}</Text>
      )}
      {dot}
    </View>
  );
}

/** 단체방 사진: 참여자 최대 4명을 겹쳐서 */
export function GroupAv({ avs, size = 46 }: { avs?: any[]; size?: number }) {
  const c = useColors();
  const list = (avs || []).slice(0, 4);
  if (!list.length) return <ChanIc size={size} icon="users" />;
  if (list.length === 1) return <Avatar m={list[0]} size={size} noDot />;
  const a = Math.round(size * (list.length === 4 ? 0.48 : 0.58));
  const pos: ViewStyle[] =
    list.length === 2
      ? [{ left: 0, top: 0 }, { right: -2, bottom: -2 }]
      : list.length === 3
        ? [{ left: size * 0.21, top: -2 }, { left: -2, bottom: -2 }, { right: -2, bottom: -2 }]
        : [{ left: -1, top: -1 }, { right: -1, top: -1 }, { left: -1, bottom: -1 }, { right: -1, bottom: -1 }];
  return (
    <View style={{ width: size, height: size }}>
      {list.map((m, i) => (
        <View key={i} style={[{ position: 'absolute' }, pos[i]]}>
          <Avatar m={{ ...m, online: false }} size={a} ring={c.surface} />
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------
// 입력
// ------------------------------------------------------------------
export function Field({ label, small, children, style }: Kids & { label?: React.ReactNode; small?: string; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ marginBottom: 14 }, style]}>
      {label ? typeof label === 'string' ? <Text style={{ fontSize: 13, fontWeight: '600', color: c.sub, marginBottom: 6 }}>{label}</Text> : label : null}
      {children}
      {small ? <Text style={{ fontSize: 12, color: c.sub, marginTop: 6 }}>{small}</Text> : null}
    </View>
  );
}
export const FieldRow = ({ children }: Kids) => (
  <View style={{ flexDirection: 'row', gap: 8 }}>{React.Children.map(children, (ch) => (ch ? <View style={{ flex: 1, minWidth: 0 }}>{ch}</View> : null))}</View>
);

const inputBox = (c: Colors, focus: boolean): TextStyle => ({
  minHeight: 48,
  borderWidth: 1,
  borderColor: focus ? c.primary : c.line,
  borderRadius: 12,
  paddingHorizontal: 14,
  backgroundColor: c.surface,
  fontSize: 16,
  color: c.ink,
});

export function Input(props: TextInputProps & { tall?: boolean; area?: boolean; big?: boolean }) {
  const c = useColors();
  const [focus, setFocus] = useState(false);
  const { area, tall, style, big, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={c.faint}
      {...rest}
      multiline={area || tall || rest.multiline}
      textAlignVertical={area || tall ? 'top' : 'center'}
      onFocus={(e) => {
        setFocus(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocus(false);
        rest.onBlur?.(e);
      }}
      style={[inputBox(c, focus), (area || tall) && { height: tall ? (big ? 280 : 200) : 96, paddingTop: 12, paddingBottom: 12, lineHeight: 22 }, style]}
    />
  );
}

export type Opt = { value: string; label: string };
/** 고르기 (웹의 select). 누르면 목록 창이 뜸 */
export function Select({ value, options, onChange, placeholder, small }: { value: string; options: Opt[]; onChange: (v: string) => void; placeholder?: string; small?: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value);
  return (
    <>
      <Press onPress={() => setOpen(true)} style={[inputBox(c, open), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, small && { minHeight: 42, paddingHorizontal: 10 }]}>
        <Text style={{ fontSize: small ? 14 : 16, color: cur ? c.ink : c.faint, flex: 1 }} numberOfLines={1}>
          {cur ? cur.label : placeholder || '선택'}
        </Text>
        <View style={{ transform: [{ rotate: '90deg' }] }}>
          <Icon name="chevR" size={16} color={c.sub} />
        </View>
      </Press>
      <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: c.backdrop, justifyContent: 'flex-end' }} onPress={() => setOpen(false)}>
          <Pressable style={{ backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', paddingBottom: insets.bottom + 12 }} onPress={() => {}}>
            <ScrollView contentContainerStyle={{ padding: 12 }}>
              {options.map((o) => {
                const on = o.value === value;
                return (
                  <Press
                    key={o.value}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, backgroundColor: on ? c.primarySoft : 'transparent' }}
                  >
                    <Text style={{ flex: 1, fontSize: 16, fontWeight: on ? '700' : '500', color: on ? c.primary : c.ink }}>{o.label}</Text>
                    {on ? <Icon name="check" size={18} w={2.6} color={c.primary} /> : null}
                  </Press>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** 날짜(YYYY-MM-DD) · 시간(HH:MM) 고르기 */
export function DateInput({ value, onChange, mode = 'date', placeholder, clearable }: { value: string; onChange: (v: string) => void; mode?: 'date' | 'time'; placeholder?: string; clearable?: boolean }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const toObj = (): Date => {
    if (mode === 'time') {
      const [h, m] = (value || '09:00').split(':').map(Number);
      const d = new Date();
      d.setHours(h || 0, m || 0, 0, 0);
      return d;
    }
    return value ? toDate(value) : new Date();
  };
  const fmt = (d: Date) => (mode === 'time' ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : iso(d));
  const label = value ? (mode === 'time' ? value : value.replace(/-/g, '. ')) : placeholder || (mode === 'time' ? '시간 선택' : '날짜 선택');
  const show = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: toObj(),
        mode,
        is24Hour: true,
        onChange: (e, d) => {
          if (e.type === 'set' && d) onChange(fmt(d));
        },
      });
    } else setOpen(true);
  };
  const [tmp, setTmp] = useState<Date>(toObj());
  return (
    <>
      <Press onPress={show} style={[inputBox(c, open), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 16, color: value ? c.ink : c.faint }}>{label}</Text>
        {clearable && value ? (
          <Press onPress={() => onChange('')} hit={8} label="지우기">
            <Icon name="x" size={16} color={c.sub} />
          </Press>
        ) : (
          <Icon name={mode === 'time' ? 'clock' : 'calendar'} size={18} color={c.sub} />
        )}
      </Press>
      {Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="fade" onShow={() => setTmp(toObj())} onRequestClose={() => setOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: c.backdrop, justifyContent: 'center', padding: 20 }} onPress={() => setOpen(false)}>
            <Pressable style={{ backgroundColor: c.surface, borderRadius: 20, padding: 12 }} onPress={() => {}}>
              <DateTimePicker value={tmp} mode={mode} display={mode === 'date' ? 'inline' : 'spinner'} locale="ko-KR" themeVariant={c.dark ? 'dark' : 'light'} onChange={(_, d) => d && setTmp(d)} />
              <BtnRow style={{ marginTop: 8 }}>
                <Btn kind="ghost" title="취소" onPress={() => setOpen(false)} />
                <Btn
                  title="확인"
                  onPress={() => {
                    onChange(fmt(tmp));
                    setOpen(false);
                  }}
                />
              </BtnRow>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

/** 월(YYYY-MM) 고르기: ‹ 2026년 11월 › */
export function MonthInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useColors();
  const [y, m] = value.split('-').map(Number);
  const move = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };
  return (
    <View style={[inputBox(c, false), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }]}>
      <IconBtn name="chevL" label="이전 달" size={20} onPress={() => move(-1)} />
      <Text style={{ fontSize: 16, fontWeight: '600', color: c.ink }}>
        {y}년 {m}월
      </Text>
      <IconBtn name="chevR" label="다음 달" size={20} onPress={() => move(1)} />
    </View>
  );
}

export function Hint({ children, warn, style }: Kids & { warn?: boolean; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return <Text style={[{ marginTop: -4, marginHorizontal: 2, marginBottom: 14, fontSize: 13, color: warn ? c.warn : c.primary, lineHeight: 20 }, style]}>{children}</Text>;
}

export function Switch({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const c = useColors();
  return <RNSwitch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: c.primary, false: c.line2 }} thumbColor="#fff" ios_backgroundColor={c.line2} />;
}
export function SwitchRow({ title, sub, value, onChange }: { title: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: c.ink }}>{title}</Text>
        {sub ? <Text style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      <Switch value={value} onChange={onChange} />
    </View>
  );
}
/** 세 칸 중 하나 고르기 (.opt-group) */
export function OptGroup({ options, value, onChange }: { options: string[]; value: number; onChange: (i: number) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 8 }}>
      {options.map((o, i) => {
        const on = i === value;
        return (
          <Press key={i} onPress={() => onChange(i)} style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: on ? c.primary : c.line, backgroundColor: on ? c.primarySoft : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: on ? '700' : '600', color: on ? c.primary : c.ink2 }}>{o}</Text>
          </Press>
        );
      })}
    </View>
  );
}
/** 체크 상자 (.pick-box) */
export function CheckBox({ on, round }: { on: boolean; round?: boolean }) {
  const c = useColors();
  return (
    <View style={{ width: 24, height: 24, borderRadius: round ? 12 : 8, borderWidth: 2, borderColor: on ? c.primary : c.line2, backgroundColor: on ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {on ? <Icon name="check" size={14} w={3} color="#fff" /> : null}
    </View>
  );
}

export function SearchBox({ value, onChange, placeholder, style }: { value: string; onChange: (v: string) => void; placeholder: string; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const [focus, setFocus] = useState(false);
  return (
    <View style={[s.search, { backgroundColor: c.surface, borderColor: focus ? c.primary : 'transparent' }, style]}>
      <Icon name="search" size={20} color={c.sub} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.faint}
        autoCorrect={false}
        autoCapitalize="none"
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{ flex: 1, fontSize: 16, color: c.ink, paddingVertical: 0 }}
      />
      {value ? (
        <Press onPress={() => onChange('')} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }} label="지우기">
          <Icon name="x" size={16} w={2.4} color={c.sub} />
        </Press>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------
// 통계 · 진행 줄 · 타임라인
// ------------------------------------------------------------------
export function Stats({ children, style }: Kids & { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', gap: 8, marginBottom: 12 }, style]}>{children}</View>;
}
export function Stat({ label, value, unit, color, flat }: { label: string; value: React.ReactNode; unit?: string; color?: string; flat?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: flat ? c.surface3 : c.surface, borderRadius: 16, padding: 14 }}>
      <Text style={{ fontSize: 12, color: c.sub, fontWeight: '600' }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '800', marginTop: 4, letterSpacing: -0.6, color: color || c.ink }}>
        {value}
        {unit ? <Text style={{ fontSize: 13, fontWeight: '600', color: c.sub }}>{unit}</Text> : null}
      </Text>
    </View>
  );
}
export function Bar({ pct, state }: { pct: number; state: string }) {
  const c = useColors();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: c.line, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', borderRadius: 4, backgroundColor: state === 'late' ? c.danger : state === 'warn' ? c.warn : c.ok }} />
    </View>
  );
}
/** 타임라인 한 줄 (.tl.done / .tl.now / .tl.rej) */
export function TL({ state, title, sub, last }: { state?: string; title: string; sub?: string; last?: boolean }) {
  const c = useColors();
  const dot: ViewStyle =
    state === 'done'
      ? { backgroundColor: c.ok, borderColor: c.ok }
      : state === 'rej'
        ? { backgroundColor: c.danger, borderColor: c.danger }
        : state === 'now'
          ? { backgroundColor: c.surface, borderColor: c.warn, shadowColor: c.warn }
          : { backgroundColor: c.surface, borderColor: c.line2 };
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 16, alignItems: 'center' }}>
        <View style={[{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, marginTop: 2 }, dot, state === 'now' && { borderWidth: 3 }]} />
        {!last ? <View style={{ width: 2, flex: 1, backgroundColor: c.line, marginTop: 2 }} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 20 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: c.ink }}>{title}</Text>
        {sub ? <Text style={{ fontSize: 13, color: c.sub, marginTop: 2 }}>{sub}</Text> : null}
      </View>
    </View>
  );
}
export function Timeline({ items, style }: { items: { state?: string; title: string; sub?: string }[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: 18 }, style]}>
      {items.map((it, i) => (
        <TL key={i} {...it} last={i === items.length - 1} />
      ))}
    </View>
  );
}
/** 회색 상자 안 긴 글 (.desc-box) */
export function DescBox({ text, style }: { text: string; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ marginTop: 12, marginBottom: 4, padding: 14, borderRadius: 12, backgroundColor: c.surface3 }, style]}>
      <LinkText text={text} style={{ fontSize: 14, lineHeight: 22, color: c.ink2 }} />
    </View>
  );
}

// ------------------------------------------------------------------
// 첨부파일 · 사진 크게 보기 · 받기
// ------------------------------------------------------------------
/** 파일을 받아서 휴대폰의 열기/공유 창으로 넘김 (로그인 쿠키가 함께 감) */
export async function openFile(url: string, name?: string) {
  const safe = String(name || 'file').replace(/[\\/:*?"<>|\s]+/g, '_').slice(-80) || 'file';
  try {
    toast('파일을 받는 중이에요…');
    // 로그인 쿠키를 붙여 받아서 저장한 뒤, 휴대폰의 열기/공유 창으로 넘김
    const uri = await fetchAuthed(url, safe);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { dialogTitle: name });
    else await Linking.openURL(uri);
  } catch (e: any) {
    err(e);
  }
}

/** 로그인해야 볼 수 있는 사진 (받는 동안은 회색 자리) */
export function AuthImage({ url, style, resizeMode, spinner }: { url?: string | null; style?: StyleProp<ImageStyle>; resizeMode?: 'cover' | 'contain'; spinner?: boolean }) {
  const c = useColors();
  const uri = useAuthedUri(url);
  if (!uri) {
    const box = StyleSheet.flatten(style) as ViewStyle;
    return <View style={[box, { backgroundColor: spinner ? 'transparent' : c.surface2, alignItems: 'center', justifyContent: 'center' }]}>{spinner ? <ActivityIndicator color="#fff" /> : null}</View>;
  }
  return <Image source={{ uri }} style={style} resizeMode={resizeMode} />;
}

export function ImageViewer({ file, onClose }: { file: any | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  if (!file) return null;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}
          maximumZoomScale={5}
          minimumZoomScale={1}
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={onClose} style={{ width: '100%', height: '100%', position: 'absolute' }} />
          <AuthImage url={file.view_url || file.url} style={{ width: '100%', height: '80%' }} resizeMode="contain" spinner />
        </ScrollView>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: insets.top + 8, paddingHorizontal: 8, paddingLeft: 16, paddingBottom: 8 }}>
          <Text style={{ flex: 1, color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
            {file.name || ''}
          </Text>
          {file.url ? (
            <Press onPress={() => openFile(file.url, file.name)} style={s.viewerBtn} label="다운로드">
              <Icon name="download" size={22} w={2} color="#fff" />
            </Press>
          ) : null}
          <Press onPress={onClose} style={s.viewerBtn} label="닫기">
            <Icon name="x" size={24} w={2.2} color="#fff" />
          </Press>
        </View>
      </View>
    </Modal>
  );
}

/** 사진은 크게, 나머지는 파일 줄로 (.files) */
export function Files({ files, style }: { files?: any[]; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const [view, setView] = useState<any>(null);
  if (!files || !files.length) return null;
  return (
    <View style={[{ gap: 8, marginTop: 16 }, style]}>
      {files.map((f, i) =>
        f.is_image ? (
          <Press key={i} onPress={() => setView(f)} style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: c.surface2 }} label={f.name}>
            <AuthImage url={f.view_url} style={{ width: '100%', height: 260 }} resizeMode="contain" />
          </Press>
        ) : (
          <FileRow key={i} f={f} />
        )
      )}
      <ImageViewer file={view} onClose={() => setView(null)} />
    </View>
  );
}
export function FileRow({ f, bg }: { f: any; bg?: string }) {
  const c = useColors();
  return (
    <Press onPress={() => openFile(f.url, f.name)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: bg || c.surface3 }}>
      <Icon name="file" size={18} color={c.ink} />
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: c.ink }} numberOfLines={1}>
        {f.name}
      </Text>
      <Text style={{ fontSize: 13, color: c.sub }}>{f.size_text || ''}</Text>
    </Press>
  );
}

/** 올린 파일 목록 (이름 + 빼기 버튼) */
export function UpList({ list, onRemove }: { list: { name: string; id: number | null }[]; onRemove: (i: number) => void }) {
  const c = useColors();
  if (!list.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
      {list.map((x, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingLeft: 12, paddingRight: 6, borderRadius: 10, backgroundColor: c.surface2, opacity: x.id ? 1 : 0.6, maxWidth: '100%' }}>
          <Text style={{ fontSize: 13, color: c.ink, maxWidth: 180 }} numberOfLines={1}>
            {x.name}
            {x.id ? '' : ' (올리는 중…)'}
          </Text>
          <Press onPress={() => onRemove(i)} style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }} label="빼기">
            <Icon name="x" size={14} color={c.sub} />
          </Press>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  btn: { height: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnSm: { height: 38, borderRadius: 11, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start' },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 5, right: 4, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 20,
    height: 50,
    paddingHorizontal: 20,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 5,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  card: { borderRadius: 18, padding: 18, marginBottom: 12 },
  cardH: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14 },
  pageH: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 4, marginHorizontal: 2, marginBottom: 14 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  tag: { height: 20, paddingHorizontal: 7, borderRadius: 6, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  st: { height: 24, paddingHorizontal: 9, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  count: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  segBtn: { height: 28, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, paddingLeft: 14, paddingRight: 8, borderRadius: 14, marginBottom: 12, borderWidth: 1 },
  viewerBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
});
