import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import {
  createHomeBannerAdmin,
  deleteHomeBannerAdmin,
  fetchHomeBannersAdmin,
  HomeBanner,
  updateHomeBannerAdmin,
  uploadHomeBannerImage
} from '@/src/api/landing';
import { resolveApiAssetUrl } from '@/src/api/client';
import {
  Badge,
  Card,
  ErrorBanner,
  Eyebrow,
  Field,
  LoadingBlock,
  PrimaryButton,
  Screen,
  Subtitle,
  SuccessBanner,
  Title
} from '@/src/components/ui';

export default function AdminBanners() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [title, setTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [localPreview, setLocalPreview] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchHomeBannersAdmin(token);
      setBanners(res.banners || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load banners.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function pickBannerImage() {
    setError('');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85
    });
    if (result.canceled || !result.assets?.length || !token) return;
    const asset = result.assets[0];
    setLocalPreview(asset.uri);
    setSaving(true);
    try {
      const uploaded = await uploadHomeBannerImage(token, asset.uri);
      setImageUrl(uploaded.imageUrl);
      setSuccess('Banner image uploaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setLocalPreview('');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    setError('');
    setSuccess('');
    if (!imageUrl.trim()) {
      setError('Upload a banner poster first.');
      return;
    }
    setSaving(true);
    try {
      const res = await createHomeBannerAdmin(token!, {
        title: title.trim(),
        linkUrl: linkUrl.trim(),
        imageUrl: imageUrl.trim(),
        active: true,
        sortOrder: banners.length
      });
      setBanners(res.banners || []);
      setTitle('');
      setLinkUrl('');
      setImageUrl('');
      setLocalPreview('');
      setSuccess('Banner published to student home.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save banner.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(banner: HomeBanner) {
    if (!token) return;
    try {
      const res = await updateHomeBannerAdmin(token, banner._id, { active: banner.active === false });
      setBanners(res.banners || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update banner.');
    }
  }

  async function handleDelete(banner: HomeBanner) {
    Alert.alert('Delete banner?', 'This removes it from the student home carousel.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!token) return;
          try {
            const res = await deleteHomeBannerAdmin(token, banner._id);
            setBanners(res.banners || []);
            setSuccess('Banner deleted.');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Delete failed.');
          }
        }
      }
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Eyebrow>Student home</Eyebrow>
        <Title>Home banners</Title>
        <Subtitle>Posters shown in the top carousel on the student home screen.</Subtitle>
        <View style={{ height: 12 }} />

        <Card>
          <ErrorBanner message={error} />
          <SuccessBanner message={success} />
          <Field label="Title (optional)" value={title} onChangeText={setTitle} placeholder="e.g. Rank Booster Crash Course" />
          <Field label="Link URL (optional)" value={linkUrl} onChangeText={setLinkUrl} placeholder="https://..." autoCapitalize="none" />

          <Text style={styles.label}>Banner poster</Text>
          <Pressable style={styles.uploadBox} onPress={pickBannerImage}>
            {localPreview || imageUrl ? (
              <Image
                source={{ uri: localPreview || resolveApiAssetUrl(imageUrl) }}
                style={styles.preview}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.uploadPlaceholder}>
                <Ionicons name="image-outline" size={28} color={colors.accent} />
                <Text style={styles.uploadText}>Tap to upload poster</Text>
              </View>
            )}
          </Pressable>

          <PrimaryButton
            label={saving ? 'Saving…' : 'Publish banner'}
            onPress={handleCreate}
            disabled={saving}
          />
        </Card>

        {loading ? <LoadingBlock label="Loading banners…" /> : null}
        {!loading && banners.map((banner) => (
          <Card key={banner._id}>
            <Image source={{ uri: resolveApiAssetUrl(banner.imageUrl) }} style={styles.listPreview} resizeMode="cover" />
            {banner.title ? <Text style={styles.listTitle}>{banner.title}</Text> : null}
            <View style={styles.listActions}>
              <Badge label={banner.active === false ? 'HIDDEN' : 'LIVE'} tone={banner.active === false ? 'warn' : 'success'} />
              <Pressable onPress={() => toggleActive(banner)} style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>{banner.active === false ? 'Show' : 'Hide'}</Text>
              </Pressable>
              <Pressable onPress={() => handleDelete(banner)} style={styles.smallBtnDanger}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </Pressable>
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 40 },
    label: { color: c.muted, marginBottom: 8, fontSize: 13, fontWeight: '600' },
    uploadBox: {
      height: 160,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.cardAlt,
      marginBottom: 14
    },
    preview: { width: '100%', height: '100%' },
    uploadPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    uploadText: { color: c.muted, fontWeight: '600' },
    listPreview: { width: '100%', height: 120, borderRadius: 12, marginBottom: 10 },
    listTitle: { color: c.text, fontWeight: '700', marginBottom: 8 },
    listActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    smallBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border
    },
    smallBtnText: { color: c.text, fontWeight: '700', fontSize: 13 },
    smallBtnDanger: {
      marginLeft: 'auto',
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border
    }
  });
}
