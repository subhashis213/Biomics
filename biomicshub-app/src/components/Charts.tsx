import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '@/src/theme/ThemeContext';

export type DonutSegment = { value: number; color: string; label: string };

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export function DonutChart({
  segments,
  size = 168,
  strokeWidth = 22,
  centerLabel,
  centerCaption
}: {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerCaption?: string;
}) {
  const { colors } = useTheme();
  const total = Math.max(1, segments.reduce((sum, seg) => sum + Math.max(0, seg.value), 0));
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  let cursor = 0;
  const arcs = segments
    .filter((seg) => seg.value > 0)
    .map((seg) => {
      const sweep = (seg.value / total) * 360;
      const start = cursor;
      const end = cursor + sweep;
      cursor = end;
      return { ...seg, start, end, path: describeArc(cx, cy, radius, start, end) };
    });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={radius} stroke={colors.cardAlt} strokeWidth={strokeWidth} fill="none" />
        <G>
          {arcs.map((arc, index) => (
            <Path
              key={`${arc.label}-${index}`}
              d={arc.path}
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              fill="none"
            />
          ))}
        </G>
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.ringCenter}>
          <Text style={[styles.ringValue, { color: colors.text }]}>{centerLabel}</Text>
          {centerCaption ? <Text style={[styles.ringCaption, { color: colors.muted }]}>{centerCaption}</Text> : null}
        </View>
      </View>
    </View>
  );
}

export function RingProgress({
  percentage,
  size = 132,
  strokeWidth = 14,
  label,
  caption
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  caption?: string;
}) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, Math.round(percentage)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;
  const ringColor = pct >= 80 ? colors.success : pct >= 50 ? colors.accent : pct >= 30 ? colors.warn : colors.danger;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={ringColor} stopOpacity="1" />
            <Stop offset="1" stopColor={ringColor} stopOpacity="0.6" />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.cardAlt} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ringGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
          fill="none"
        />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.ringCenter}>
          <Text style={[styles.ringValue, { color: colors.text }]}>{label ?? `${pct}%`}</Text>
          {caption ? <Text style={[styles.ringCaption, { color: colors.muted }]}>{caption}</Text> : null}
        </View>
      </View>
    </View>
  );
}

export type BarDatum = { label: string; value: number };

export function BarChart({ data, max = 100, unit = '%' }: { data: BarDatum[]; max?: number; unit?: string }) {
  const { colors } = useTheme();
  const maxValue = useMemo(() => Math.max(max, ...data.map((d) => d.value), 1), [data, max]);

  if (!data.length) {
    return <Text style={{ color: colors.muted }}>No data yet.</Text>;
  }

  return (
    <View style={styles.barWrap}>
      {data.map((d, i) => {
        const h = Math.max(6, (d.value / maxValue) * 120);
        const barColor = d.value >= 80 ? colors.success : d.value >= 50 ? colors.accent : d.value >= 30 ? colors.warn : colors.danger;
        return (
          <View key={`${d.label}-${i}`} style={styles.barCol}>
            <Text style={[styles.barValue, { color: colors.text }]}>{Math.round(d.value)}{unit}</Text>
            <View style={[styles.barTrack, { backgroundColor: colors.cardAlt }]}>
              <View style={[styles.bar, { height: h, backgroundColor: barColor }]}>
                <View style={[styles.barHighlight, { backgroundColor: 'rgba(255,255,255,0.25)' }]} />
              </View>
            </View>
            <Text style={[styles.barLabel, { color: colors.muted }]} numberOfLines={1}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  ringCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontSize: 26, fontWeight: '900' },
  ringCaption: { fontSize: 12, marginTop: 2 },
  barWrap: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', gap: 8, paddingTop: 8 },
  barCol: { flex: 1, alignItems: 'center', maxWidth: 70 },
  barValue: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
  barTrack: { width: 26, height: 132, borderRadius: 8, justifyContent: 'flex-end', overflow: 'hidden' },
  bar: { width: '100%', borderRadius: 8 },
  barHighlight: { position: 'absolute', top: 0, left: 0, width: 8, height: '100%', opacity: 0.5 },
  barLabel: { fontSize: 10, marginTop: 6, textAlign: 'center' }
});
