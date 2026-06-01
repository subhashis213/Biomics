import React, { useMemo } from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';

type TagName = 'b' | 'red' | 'big' | 'h' | 'accent' | 'blue' | 'green';

const TAG_PATTERN = /\[(b|red|big|h|accent|blue|green)\]([\s\S]*?)\[\/\1\]/i;

function tagStyle(tag: TagName, colors: ThemeColors): TextStyle {
  switch (tag) {
    case 'b':
      return { fontWeight: '800' };
    case 'red':
      return { color: colors.danger, fontWeight: '700' };
    case 'blue':
      return { color: '#2563eb', fontWeight: '700' };
    case 'green':
      return { color: colors.success, fontWeight: '700' };
    case 'big':
      return { fontSize: 17, lineHeight: 24, fontWeight: '700' };
    case 'h':
      return { fontSize: 20, lineHeight: 28, fontWeight: '800' };
    case 'accent':
      return { color: colors.accent, fontWeight: '800' };
    default:
      return {};
  }
}

function buildNodes(input: string, colors: ThemeColors, keyPrefix = 'n'): React.ReactNode[] {
  const text = String(input || '');
  if (!text) return [];

  const match = text.match(TAG_PATTERN);
  if (!match || match.index === undefined) return [text];

  const tag = match[1].toLowerCase() as TagName;
  const inner = match[2];
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);

  return [
    ...(before ? [before] : []),
    <Text key={`${keyPrefix}-${match.index}`} style={tagStyle(tag, colors)}>
      {buildNodes(inner, colors, `${keyPrefix}-${match.index}-i`)}
    </Text>,
    ...buildNodes(after, colors, `${keyPrefix}-${match.index}-a`)
  ];
}

type Props = {
  text?: string;
  style?: TextStyle;
  numberOfLines?: number;
};

/** Renders admin push markup: [b], [red], [big], [h], [accent], [blue], [green] */
export default function RichNotificationText({ text, style, numberOfLines }: Props) {
  const { colors } = useTheme();
  const nodes = useMemo(() => buildNodes(text || '', colors), [text, colors]);
  return (
    <Text style={[styles.base, style]} numberOfLines={numberOfLines}>
      {nodes.length ? nodes : text}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { fontSize: 15, lineHeight: 22 }
});

export { stripRichMarkup, wrapRichTag } from '@/src/utils/notificationFormat';
