import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import {
  deleteFreeStudyResource,
  fetchFreeStudyAdminCourses,
  fetchFreeStudyAdminLibrary,
  FreeStudyResource,
  FreeStudyResourceType,
  uploadFreeStudyResource
} from '@/src/api/freeStudyResources';
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

const TYPE_OPTIONS: { value: FreeStudyResourceType; label: string }[] = [
  { value: 'book', label: 'Book' },
  { value: 'material', label: 'Study material' },
  { value: 'job-notes', label: 'Job notes' }
];

export default function AdminStudyLibrary() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [courses, setCourses] = useState<{ courseName: string }[]>([]);
  const [groups, setGroups] = useState<{ courseName: string; items: FreeStudyResource[] }[]>([]);
  const [courseName, setCourseName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [resourceType, setResourceType] = useState<FreeStudyResourceType>('material');
  const [pickedFile, setPickedFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [courseRes, libraryRes] = await Promise.all([
        fetchFreeStudyAdminCourses(token),
        fetchFreeStudyAdminLibrary(token)
      ]);
      setCourses(courseRes.courses || []);
      setGroups(libraryRes.courses || []);
      if (!courseName && courseRes.courses?.length) {
        setCourseName(courseRes.courses[0].courseName);
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load study library.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['application/pdf', 'application/epub+zip', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPickedFile({
      uri: asset.uri,
      name: asset.name || 'resource.pdf',
      type: asset.mimeType || 'application/pdf'
    });
    if (!title.trim()) setTitle((asset.name || '').replace(/\.[^.]+$/, ''));
  }

  async function handleUpload() {
    setError('');
    setSuccess('');
    if (!courseName.trim() || !title.trim() || !pickedFile || !token) {
      setError('Course, title, and file are required.');
      return;
    }
    setUploading(true);
    try {
      const res = await uploadFreeStudyResource(token, {
        ...pickedFile,
        courseName: courseName.trim(),
        title: title.trim(),
        description: description.trim(),
        resourceType
      });
      setSuccess(res.message || 'Uploaded successfully.');
      setTitle('');
      setDescription('');
      setPickedFile(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  function confirmDelete(item: FreeStudyResource) {
    Alert.alert('Delete resource', `Remove "${item.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!token) return;
          try {
            await deleteFreeStudyResource(token, item._id);
            load();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Delete failed.');
          }
        }
      }
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}>
        <Eyebrow>Free library</Eyebrow>
        <Title>Books & study materials</Title>
        <Subtitle>Upload course-wise PDFs/books — free for every student.</Subtitle>
        <View style={{ height: 12 }} />

        <Card>
          <ErrorBanner message={error} />
          <SuccessBanner message={success} />

          <Text style={styles.label}>Course</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {courses.map((course) => (
              <Pressable
                key={course.courseName}
                onPress={() => setCourseName(course.courseName)}
                style={[styles.chip, courseName === course.courseName && styles.chipOn]}
              >
                <Text style={[styles.chipText, courseName === course.courseName && styles.chipTextOn]}>{course.courseName}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. CSIR NET Unit 1 Notes" />
          <Field label="Description (optional)" value={description} onChangeText={setDescription} placeholder="Short note for students" />

          <Text style={styles.label}>Type</Text>
          <View style={styles.typeRow}>
            {TYPE_OPTIONS.map((opt) => (
              <Pressable key={opt.value} onPress={() => setResourceType(opt.value)} style={[styles.typeBtn, resourceType === opt.value && styles.typeBtnOn]}>
                <Text style={[styles.typeBtnText, resourceType === opt.value && styles.typeBtnTextOn]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.filePick} onPress={pickFile}>
            <Ionicons name="cloud-upload-outline" size={22} color={colors.accent} />
            <Text style={styles.filePickText}>{pickedFile?.name || 'Choose PDF / EPUB / Word file'}</Text>
          </Pressable>

          <PrimaryButton label={uploading ? 'Uploading…' : 'Upload free resource'} onPress={handleUpload} disabled={uploading} />
        </Card>

        <View style={{ height: 16 }} />
        {loading ? <LoadingBlock /> : null}
        {groups.map((group) => (
          <Card key={group.courseName} style={styles.groupCard}>
            <Text style={styles.groupTitle}>{group.courseName}</Text>
            {group.items.map((item) => (
              <View key={item._id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemMeta}>{item.resourceType} · {item.isActive === false ? 'Hidden' : 'Live'}</Text>
                </View>
                <Badge label="FREE" tone="success" />
                <Pressable onPress={() => confirmDelete(item)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            ))}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 40 },
    label: { color: c.muted, marginBottom: 6, fontSize: 13, marginTop: 4 },
    chips: { gap: 8, marginBottom: 12, paddingVertical: 2 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardAlt },
    chipOn: { backgroundColor: c.accent, borderColor: c.accent },
    chipText: { color: c.text, fontWeight: '700', fontSize: 12 },
    chipTextOn: { color: c.accentText },
    typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    typeBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardAlt },
    typeBtnOn: { backgroundColor: c.accentSoft, borderColor: c.accent },
    typeBtnText: { color: c.text, fontWeight: '700', fontSize: 12 },
    typeBtnTextOn: { color: c.accent },
    filePick: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: c.border,
      borderStyle: 'dashed',
      borderRadius: 12,
      padding: 14,
      marginBottom: 14,
      backgroundColor: c.cardAlt
    },
    filePickText: { color: c.text, flex: 1, fontWeight: '600' },
    groupCard: { marginBottom: 12 },
    groupTitle: { color: c.text, fontWeight: '800', fontSize: 16, marginBottom: 8 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border },
    itemTitle: { color: c.text, fontWeight: '700' },
    itemMeta: { color: c.muted, fontSize: 12, marginTop: 2 }
  });
}
