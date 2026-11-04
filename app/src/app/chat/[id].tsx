import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useReady } from '../../lib/store';
import { ChatScreen } from '../../views/Chat';

/** 대화방 (웹의 #/chat/12) */
export default function Chat() {
  const ready = useReady();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!ready) return null;
  return <ChatScreen key={id} id={Number(id)} />;
}
