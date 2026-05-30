import { useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewToken
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { resolveApiAssetUrl } from '@/src/api/client';
import { StudentVoice } from '@/src/api/landing';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';

const HORIZONTAL_PADDING = 16;

type Props = {
  voices: StudentVoice[];
};

export default function StudentVoiceCarousel({ voices }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const listRef = useRef<FlatList<StudentVoice>>(null);
  const [index, setIndex] = useState(0);
  const width = Dimensions.get('window').width - HORIZONTAL_PADDING * 2;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const active = viewableItems[0]?.index;
    if (typeof active === 'number') setIndex(active);
  }).current;

  if (!voices.length) return null;

  function go(delta: number) {
    const next = Math.max(0, Math.min(voices.length - 1, index + delta));
    setIndex(next);
    listRef.current?.scrollToIndex({ index: next, animated: true });
  }

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>What our students have to say</Text>
      <View style={styles.carouselRow}>
        <Pressable
          style={[styles.navBtn, index === 0 && styles.navBtnDisabled]}
          onPress={() => go(-1)}
          disabled={index === 0}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={20} color={index === 0 ? colors.muted : colors.text} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            data={voices}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item._id}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={{ viewAreaCoveragePercentThreshold: 60 }}
            onScrollToIndexFailed={() => {}}
            getItemLayout={(_, i) => ({ length: width - 72, offset: (width - 72) * i, index: i })}
            renderItem={({ item }) => (
              <View style={[styles.card, { width: width - 72 }]}>
                <Text style={styles.quoteMark}>“</Text>
                <Text style={styles.message}>{item.message}</Text>
                <View style={styles.profileRow}>
                  {item.avatarUrl ? (
                    <Image source={{ uri: resolveApiAssetUrl(item.avatarUrl) }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarLetter}>{String(item.name || 'S').charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    {item.role ? <Text style={styles.role}>{item.role}</Text> : null}
                  </View>
                </View>
              </View>
            )}
          />
          {voices.length > 1 ? (
            <View style={styles.dots}>
              {voices.map((voice, dotIndex) => (
                <View key={voice._id} style={[styles.dot, dotIndex === index && styles.dotActive]} />
              ))}
            </View>
          ) : null}
        </View>

        <Pressable
          style={[styles.navBtn, index >= voices.length - 1 && styles.navBtnDisabled]}
          onPress={() => go(1)}
          disabled={index >= voices.length - 1}
          hitSlop={8}
        >
          <Ionicons name="chevron-forward" size={20} color={index >= voices.length - 1 ? colors.muted : colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    section: { marginBottom: 22 },
    heading: { color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 12 },
    carouselRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    navBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border
    },
    navBtnDisabled: { opacity: 0.45 },
    card: {
      backgroundColor: '#FFF8E8',
      borderRadius: 18,
      padding: 18,
      minHeight: 210,
      borderWidth: 1,
      borderColor: '#F2DFB8'
    },
    quoteMark: {
      color: '#F59E0B',
      fontSize: 42,
      lineHeight: 42,
      fontWeight: '800',
      marginBottom: 4
    },
    message: {
      color: '#1F2937',
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '500',
      marginBottom: 16
    },
    profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 'auto' },
    avatarImage: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.cardAlt },
    avatarFallback: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center'
    },
    avatarLetter: { color: c.accent, fontWeight: '800', fontSize: 20 },
    name: { color: '#111827', fontWeight: '800', fontSize: 15 },
    role: { color: '#6B7280', fontSize: 13, marginTop: 2 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.border },
    dotActive: { width: 18, backgroundColor: c.accent }
  });
}
