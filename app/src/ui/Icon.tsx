import React from 'react';
import { SvgXml } from 'react-native-svg';
import { FILLED, ICONS } from '../lib/icons-data';
import { useColors } from '../lib/store';

type Props = { name: string; size?: number; w?: number; color?: string; filled?: boolean };

/** 웹의 A.ic(이름, 크기, 굵기) / A.icF(이름) 와 같은 아이콘 */
export function Icon({ name, size = 22, w = 1.9, color, filled }: Props) {
  const c = useColors();
  const col = color || c.ink;
  let body: string;
  let stroke = w;
  if (filled && FILLED[name]) {
    body = FILLED[name].replace(/__SURF__/g, c.surface);
    stroke = 2;
  } else {
    body = ICONS[name] || '';
    if (filled) stroke = 2.7;
  }
  const xml = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} color={col} />;
}
