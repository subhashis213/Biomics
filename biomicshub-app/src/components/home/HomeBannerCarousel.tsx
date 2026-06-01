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
const MIN_SLIDE_HEIGHT = 140;
const MAX_SLIDE_HEIGHT_RATIO = 0.62;

type Props = {
  banners: HomeBanner[];
};

function measureBannerHeight(uri: string, slideWidth: number): Promise<number> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => {
        if (width > 0 && height > 0) {
          resolve(Math.max(MIN_SLIDE_HEIGHT, slideWidth * (height / width)));
          return;
        }
        resolve(MIN_SLIDE_HEIGHT);
      },
      () => resolve(MIN_SLIDE_HEIGHT)
    );
  });
}

export default function HomeBannerCarousel({ banners }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const listRef = useRef<FlatList<HomeBanner>>(null);
  const [index, setIndex] = useState(0);
  const [slideHeight, setSlideHeight] = useState(MIN_SLIDE_HEIGHT);
  const slideWidth = Dimensions.get('window').width - HORIZONTAL_PADDING * 2;
  const maxSlideHeight = Dimensions.get('window').height * MAX_SLIDE_HEIGHT_RATIO;

  useEffect(() => {
    if (!banners.length) return;
    let cancelled = false;

    (async () => {
      const heights = await Promise.all(
        banners.map((banner) => measureBannerHeight(resolveApiAssetUrl(banner.imageUrl), slideWidth))
      );
      if (cancelled) return;
      const tallest = Math.min(Math.max(...heights, MIN_SLIDE_HEIGHT), maxSlideHeight);
      setSlideHeight(tallest);
    })();

    return () => {
      cancelled = true;
    };
  }, [banners, slideWidth, maxSlideHeight]);

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
        getItemLayout={(_, i) => ({ length: slideWidth, offset: slideWidth * i, index: i })}
        onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          const next = Math.round(event.nativeEvent.contentOffset.x / slideWidth);
          if (Number.isFinite(next)) setIndex(next);
        }}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.slide, { width: slideWidth, height: slideHeight }]}
            onPress={() => openBanner(item)}
          >
            <Image
              source={{ uri: resolveApiAssetUrl(item.imageUrl) }}
              style={styles.image}
              resizeMode="contain"
              accessibilityRole="image"
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
    wrap: { marginBottom: 14 },
    slide: {
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: c.cardAlt,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center'
    },
    image: { width: '100%', height: '100%' },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.border },
    dotActive: { width: 18, backgroundColor: c.accent }
  });
}
