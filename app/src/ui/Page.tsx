import React from 'react';
import { RefreshControl, ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../lib/store';
import { ErrorView, Loading } from './kit';

type Q = { data: any; error: string; reload: () => any; pull: () => any; refreshing: boolean };

/**
 * 하단바가 있는 화면의 스크롤 틀 (웹의 main)
 *  - 아래로 당기면 새로고침
 *  - 처음 불러오는 동안 빙글이, 실패하면 '다시 시도'
 */
export function Page({ q, children, fab, style, full }: { q?: Q; children?: React.ReactNode | ((d: any) => React.ReactNode); fab?: React.ReactNode; style?: StyleProp<ViewStyle>; full?: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  let body: React.ReactNode;
  if (q && !q.data) body = q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Loading />;
  else body = typeof children === 'function' ? (children as any)(q?.data) : children;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[{ padding: 16, paddingBottom: full ? 100 + insets.bottom : 96 }, style]}
        keyboardShouldPersistTaps="handled"
        refreshControl={q ? <RefreshControl refreshing={q.refreshing} onRefresh={q.pull} tintColor={c.primary} colors={[c.primary]} /> : undefined}
      >
        {body}
      </ScrollView>
      {q && q.data ? fab : !q ? fab : null}
    </View>
  );
}
