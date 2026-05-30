import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
  ViewToken
} from 'react-native';
import { resolveApiAssetUrl } from '@/src/api/client';
import { HomeBanner } from '@/src/api/landing';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';

const SLIDE_INTERVAL_MS = 4500;
const HORIZONTAL_PADDING = 16;

type Props = {
  banners: HomeBanner[];
};

export default function HomeBannerCarousel({ banners }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const listRef = useRef<FlatList<HomeBanner>>(null);
  const [index, setIndex] = useState(0);
  const width = Dimensions.get('window').width - HORIZONTAL_PADDING * 2;

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % banners.length;
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [banners.length]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const active = viewableItems[0]?.index;
    if (typeof active === 'number') setIndex(active);
  }).current;

  if (!banners.length) return null;

  function openBanner(banner: HomeBanner) {
    const url = String(banner.linkUrl || '').trim();
    if (url) Linking.openURL(url).catch(() => {});
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        data={banners}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item._id}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 60 }}
        onScrollToIndexFailed={() => {}}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          const next = Math.round(event.nativeEvent.contentOffset.x / width);
          if (Number.isFinite(next)) setIndex(next);
        }}
        renderItem={({ item }) => (
          <Pressable style={[styles.slide, { width }]} onPress={() => openBanner(item)}>
            <Image
              source={{ uri: resolveApiAssetUrl(item.imageUrl) }}
              style={styles.image}
              resizeMode="cover"
            />
          </Pressable>
        )}
      />
      {banners.length > 1 ? (
        <View style={styles.dots}>
          {banners.map((banner, dotIndex) => (
            <View key={banner._id} style={[styles.dot, dotIndex === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { marginBottom: 18 },
    slide: {
      height: 168,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: c.cardAlt,
      borderWidth: 1,
      borderColor: c.border
    },
    image: { width: '100%', height: '100%' },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.border },
    dotActive: { width: 18, backgroundColor: c.accent }
  });
}
