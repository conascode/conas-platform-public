import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useReady } from '../lib/store';
import { AdminScreen } from '../views/All';

/** 관리자 (웹의 #/admin/members, #/admin/boards) */
export default function Admin() {
  const ready = useReady();
  const { sub } = useLocalSearchParams<{ sub?: string }>();
  if (!ready) return null;
  return <AdminScreen sub={sub || 'members'} />;
}
