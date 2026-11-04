import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useReady } from '../lib/store';
import { WriteScreen } from '../views/Board';

/** 글쓰기 (웹의 #/cm/write/2) · 글 수정 (#/cm/edit/5) */
export default function Write() {
  const ready = useReady();
  const { id, board } = useLocalSearchParams<{ id?: string; board?: string }>();
  if (!ready) return null;
  return <WriteScreen id={id ? Number(id) : null} boardId={board ? Number(board) : null} />;
}
