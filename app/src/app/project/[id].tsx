import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useReady } from '../../lib/store';
import { ProjectScreen } from '../../views/Task';

/** 프로젝트 (웹의 #/ws/project/3) */
export default function Project() {
  const ready = useReady();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!ready) return null;
  return <ProjectScreen key={id} id={Number(id)} />;
}
