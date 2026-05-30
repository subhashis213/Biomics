import { useEffect, useState } from 'react';
import {
  Image,
  ImageLoadEventData,
  NativeSyntheticEvent,
  StyleSheet,
  View,
  ViewStyle
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';

type Props = {
  uri?: string;
  /** When set, caps box height and letterboxes inside. Omit on batch cards so the box matches the poster exactly. */
  maxHeight?: number;
  minHeight?: number;
  style?: ViewStyle;
  fallbackIcon?: React.ComponentProps<typeof Ionicons>['name'];
  rounded?: boolean | 'top';
};

function readRatio(width: number, height: number) {
  if (width > 0 && height > 0) return width / height;
  return null;
}

export default function PosterImage({
  uri,
  maxHeight,
  minHeight = 72,
  style,
  fallbackIcon = 'image-outline',
  rounded = true
}: Props) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [frameWidth, setFrameWidth] = useState(0);
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!uri) {
      setRatio(null);
      return;
    }
    let cancelled = false;
    setRatio(null);
    Image.getSize(
      uri,
      (width, height) => {
        if (cancelled) return;
        const next = readRatio(width, height);
        if (next) setRatio(next);
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  function handleImageLoad(event: NativeSyntheticEvent<ImageLoadEventData>) {
    const { width, height } = event.nativeEvent.source;
    const next = readRatio(width, height);
    if (next) setRatio(next);
  }

  const naturalHeight = frameWidth && ratio ? frameWidth / ratio : minHeight;
  const computedHeight = maxHeight
    ? Math.max(minHeight, Math.min(naturalHeight, maxHeight))
    : frameWidth && ratio
      ? naturalHeight
      : minHeight;

  const roundedStyle =
    rounded === 'top'
      ? {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0
        }
      : rounded
        ? { borderRadius: 12 }
        : {};

  return (
    <View
      style={[styles.frame, roundedStyle, style, { height: computedHeight }]}
      onLayout={(event) => setFrameWidth(event.nativeEvent.layout.width)}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode="contain"
          onLoad={handleImageLoad}
          accessibilityRole="image"
        />
      ) : (
        <View style={styles.fallback}>
          <Ionicons name={fallbackIcon} size={32} color={colors.accent} />
        </View>
      )}
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    frame: {
      width: '100%',
      backgroundColor: c.cardAlt,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center'
    },
    image: {
      width: '100%',
      height: '100%'
    },
    fallback: {
      flex: 1,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accentSoft
    }
  });
}
