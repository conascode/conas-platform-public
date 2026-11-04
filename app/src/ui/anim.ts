import { useState } from 'react';
import { Animated } from 'react-native';

/** 화면이 다시 그려져도 그대로 유지되는 움직임 값 (React Native의 useAnimatedValue와 같음) */
export function useAnim(initial: number) {
  const [v] = useState(() => new Animated.Value(initial));
  return v;
}
