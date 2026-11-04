/* 로그인 · 승인 대기 · 시작 화면 */
import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { login, logout, registerUrl } from '../lib/api';
import { cacheClear } from '../lib/hooks';
import { getState, loadData, setState, useColors } from '../lib/store';
import { Btn, Input } from '../ui/kit';

/** 앱을 켤 때: 로그인되어 있으면 바로 시작 */
export async function boot() {
  try {
    await loadData();
    setState({ auth: 'ready', authError: '' });
  } catch (e: any) {
    // 401 · 403(승인 대기)은 api.ts 가 auth 상태를 바꿔둠
    const st = getState().auth;
    if (st !== 'login' && st !== 'pending') setState({ auth: e?.status === 401 ? 'login' : 'error', authError: e?.message || '' });
  }
}

export async function doLogout() {
  try {
    await logout();
  } catch {
    /* 서버에 못 닿아도 이 기기에서는 로그아웃 */
  }
  if (router.canDismiss()) router.dismissAll();
  cacheClear();
  setState({ auth: 'login', data: null, badges: {}, main: { sec: 'home', tab: 'home', id: null } });
}

function AuthBox({ children }: { children: React.ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.surface2 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Logo() {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', marginBottom: 28 }}>
      <Image source={require('../../assets/logo.png')} style={{ width: 64, height: 64, borderRadius: 18 }} />
      <Text style={{ fontSize: 22, fontWeight: '800', color: c.ink, marginTop: 12, letterSpacing: -0.5 }}>CONAS 사내</Text>
    </View>
  );
}

export function LoginScreen() {
  const c = useColors();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    if (!id.trim() || !pw) return setError('아이디와 비밀번호를 입력해 주세요.');
    try {
      await login(id.trim(), pw);
    } catch (e: any) {
      return setError(e?.message || '로그인하지 못했어요.');
    }
    setPw('');
    setState({ auth: 'loading' });
    await boot();
  };
  return (
    <AuthBox>
      <Logo />
      {error ? (
        <View style={{ backgroundColor: c.dangerSoft, borderRadius: 12, padding: 14, marginBottom: 14 }} accessibilityRole="alert">
          <Text style={{ color: c.danger, fontWeight: '600', fontSize: 14 }}>{error}</Text>
        </View>
      ) : null}
      <View style={{ backgroundColor: c.surface, borderRadius: 18, padding: 18 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: c.sub, marginBottom: 6 }}>아이디 또는 이메일</Text>
        <Input value={id} onChangeText={setId} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" returnKeyType="next" />
        <Text style={{ fontSize: 13, fontWeight: '600', color: c.sub, marginBottom: 6, marginTop: 14 }}>비밀번호</Text>
        <Input value={pw} onChangeText={setPw} secureTextEntry autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} />
        <View style={{ height: 18 }} />
        <Btn title="로그인" onPress={submit} />
      </View>
      <Text style={{ textAlign: 'center', color: c.sub, fontSize: 14, marginTop: 20 }}>
        계정이 없나요?{' '}
        <Text style={{ color: c.primary, fontWeight: '700' }} onPress={() => Linking.openURL(registerUrl())}>
          회원가입
        </Text>
      </Text>
      <Text style={{ textAlign: 'center', color: c.sub, fontSize: 13, marginTop: 12, lineHeight: 20 }}>
        conas.kr 계정으로도 로그인할 수 있어요. 처음 로그인하면 관리자 승인 후 이용할 수 있어요.
      </Text>
    </AuthBox>
  );
}

export function PendingScreen() {
  const c = useColors();
  return (
    <AuthBox>
      <Text style={{ fontSize: 48, textAlign: 'center' }}>⏳</Text>
      <Text style={{ fontSize: 20, fontWeight: '800', color: c.ink, textAlign: 'center', marginTop: 12 }}>승인을 기다리고 있어요</Text>
      <Text style={{ fontSize: 14, color: c.sub, textAlign: 'center', marginTop: 8, lineHeight: 22 }}>
        이용 신청이 접수되었어요.{'\n'}관리자가 승인하면 바로 이용할 수 있어요.
      </Text>
      <View style={{ height: 24 }} />
      <Btn
        title="새로고침"
        onPress={async () => {
          setState({ auth: 'loading' });
          await boot();
        }}
      />
      <View style={{ height: 8 }} />
      <Btn kind="ghost" title="로그아웃" onPress={doLogout} />
    </AuthBox>
  );
}

export function SplashScreen({ error }: { error?: string }) {
  const c = useColors();
  return (
    <AuthBox>
      <Logo />
      {error ? (
        <>
          <Text style={{ color: c.sub, textAlign: 'center', fontSize: 14, marginBottom: 16 }}>{error}</Text>
          <Pressable
            onPress={async () => {
              setState({ auth: 'loading' });
              await boot();
            }}
            style={{ alignSelf: 'center', paddingHorizontal: 18, height: 40, borderRadius: 11, backgroundColor: c.surface, justifyContent: 'center' }}
          >
            <Text style={{ color: c.ink, fontWeight: '700' }}>다시 시도</Text>
          </Pressable>
        </>
      ) : null}
    </AuthBox>
  );
}
