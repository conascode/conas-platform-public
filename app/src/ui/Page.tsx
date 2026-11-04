import React, { useEffect } from 'react';
import { Animated, RefreshControl, ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { useAnim } from './anim';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../lib/store';
import { ErrorView } from './kit';

type Q = { data: any; error: string; stale?: boolean; reload: () => any; pull: () => any; refreshing: boolean };

/** 처음 불러오는 동안 보여줄 회색 틀 (빙글이 대신, 내용과 비슷한 모양) */
export function Skeleton({ cards = 3, style }: { cards?: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const pulse = useAnim(0.55);
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, [pulse]);
  const bar = (w: any, h = 12, mt = 10) => <View style={{ width: w, height: h, borderRadius: 6, backgroundColor: c.surface2, marginTop: mt }} />;
  return (
    <Animated.View style={[{ opacity: pulse }, style]} accessibilityLabel="불러오는 중">
      {[...Array(cards)].map((_, i) => (
        <View key={i} style={{ backgroundColor: c.surface, borderRadius: 18, padding: 18, marginBottom: 12 }}>
          {bar('35%', 16, 0)}
          {bar('90%')}
          {bar('75%')}
          {i === 0 ? bar('60%') : null}
        </View>
      ))}
    </Animated.View>
  );
}

/**
 * 하단바가 있는 화면의 스크롤 틀 (웹의 main)
 *  - header: 데이터와 상관없이 늘 그대로 있는 부분 (제목, 게시판 버튼 등)
 *  - children: 데이터로 그리는 부분. 처음엔 회색 틀, 새 데이터를 받는 중이면 이전 내용을 흐리게
 *  - 아래로 당기면 새로고침
 */
export function Page({
  q,
  header,
  children,
  fab,
  style,
  full,
}: {
  q?: Q;
  header?: React.ReactNode;
  children?: React.ReactNode | ((d: any) => React.ReactNode);
  fab?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  let body: React.ReactNode;
  if (q && !q.data) body = q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Skeleton />;
  else body = typeof children === 'function' ? (children as any)(q?.data) : children;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[{ padding: 16, paddingBottom: full ? 100 + insets.bottom : 96 }, style]}
        keyboardShouldPersistTaps="handled"
        refreshControl={q ? <RefreshControl refreshing={q.refreshing} onRefresh={q.pull} tintColor={c.primary} colors={[c.primary]} /> : undefined}
      >
        {header}
        <View style={q && q.stale ? { opacity: 0.5 } : null} pointerEvents={q && q.stale ? 'none' : 'auto'}>
          {body}
        </View>
      </ScrollView>
      {!q || q.data ? fab : null}
    </View>
  );
}
