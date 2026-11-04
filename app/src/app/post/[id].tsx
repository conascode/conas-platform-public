import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useReady } from '../../lib/store';
import { PostScreen } from '../../views/Board';

/** 글 보기 (웹의 #/cm/post/5) */
export default function Post() {
  const ready = useReady();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!ready) return null;
  return <PostScreen id={Number(id)} />;
}
