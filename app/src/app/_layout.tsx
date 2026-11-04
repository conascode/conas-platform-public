import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onAuthLost } from '../lib/api';
import { loadTheme, setState, useColors, useStore } from '../lib/store';
import { SheetHost, ToastHost } from '../ui/overlay';
import { LoginScreen, PendingScreen, SplashScreen, boot } from '../views/Auth';

export default function RootLayout() {
  const c = useColors();
  const auth = useStore((s) => s.auth);
  const authError = useStore((s) => s.authError);
  useEffect(() => {
    onAuthLost((st) => setState({ auth: st }));
    loadTheme().finally(boot);
  }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style={c.dark ? 'light' : 'dark'} />
      {/*
        화면 이동: 오른쪽에서 부드럽게 밀려 들어옴 (안드로이드도 아이폰처럼 뒤 화면이 살짝 따라 움직임)
        아이폰은 화면 어디서든 오른쪽으로 밀면 뒤로 가기
      */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.surface2 },
          animation: 'ios_from_right',
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      />
      {auth !== 'ready' ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: c.surface2 }]}>
          {auth === 'login' ? <LoginScreen /> : auth === 'pending' ? <PendingScreen /> : <SplashScreen error={auth === 'error' ? authError || '서버에 연결하지 못했어요.' : ''} />}
        </View>
      ) : null}
      <SheetHost />
      <ToastHost />
    </SafeAreaProvider>
  );
}
