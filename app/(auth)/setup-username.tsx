import { useAuth } from '@/lib/auth';
import { pb } from '@/lib/pocketbase';
import { useLanguage } from '@/lib/language';
import { isProfane } from '@/lib/profanity';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SetupUsername() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const t = (ru: string, en: string) => language === 'ru' ? ru : en;

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmed = username.trim().toLowerCase();
    if (!trimmedName) {
      Alert.alert(t('Ошибка', 'Error'), t('Введите ваше имя', 'Enter your name'));
      return;
    }
    if (!trimmed) {
      Alert.alert(t('Ошибка', 'Error'), t('Введите имя пользователя', 'Enter a username'));
      return;
    }
    if (trimmed.length < 3) {
      Alert.alert(t('Ошибка', 'Error'), t('Минимум 3 символа', 'Minimum 3 characters'));
      return;
    }
    if (!/^[a-z0-9_]+$/.test(trimmed)) {
      Alert.alert(t('Ошибка', 'Error'), t('Только буквы, цифры и _', 'Only letters, numbers and _'));
      return;
    }
    if (isProfane(trimmed)) {
      Alert.alert(t('Ошибка', 'Error'), t('Недопустимое имя', 'Username not allowed'));
      return;
    }
    setLoading(true);
    try {
      await pb.collection('users').update(user.id, { username: trimmed, name: trimmedName });
      await pb.collection('users').authRefresh();
    } catch (e: any) {
      const isUnique = e?.response?.data?.username?.code === 'validation_not_unique';
      Alert.alert(
        t('Ошибка', 'Error'),
        isUnique
          ? t('Это имя уже занято', 'Username already taken')
          : t('Что-то пошло не так', 'Something went wrong'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/images/loginscreen.jpg')}
      style={styles.bg}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.heroText}>
              <Text style={styles.heading}>{t('Последний шаг', 'One last step')}</Text>
              <Text style={styles.subheading}>
                {t('Выберите имя пользователя', 'Choose a username for your profile')}
              </Text>
            </View>

            <View style={styles.form}>
              <Text style={styles.formTitle}>{t('Настройка профиля', 'Set up profile')}</Text>

              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('Ваше имя', 'Your name')}
                  placeholderTextColor="#4b5563"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  keyboardAppearance="dark"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="at-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('например: fisher123', 'e.g. fisher123')}
                  placeholderTextColor="#4b5563"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardAppearance="dark"
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
              </View>

              <Text style={styles.hint}>
                {t('Только буквы, цифры и _ · Минимум 3 символа', 'Letters, numbers and _ only · Min 3 characters')}
              </Text>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>{t('Продолжить', 'Continue')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5, 12, 26, 0.62)' },
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  heroText: { alignItems: 'center', marginBottom: 36 },
  heading: {
    color: '#ffffff', fontSize: 32, fontWeight: '800', letterSpacing: 1,
    textAlign: 'center', marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
  },
  subheading: {
    color: 'rgba(255,255,255,0.65)', fontSize: 15, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  form: {
    backgroundColor: 'rgba(7, 16, 35, 0.82)', borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  formTitle: { color: '#e6eef8', fontSize: 20, fontWeight: '700', marginBottom: 20 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.8)', borderRadius: 10,
    borderWidth: 1, borderColor: '#1f2937', marginBottom: 10, paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10, width: 20, textAlign: 'center' },
  input: { flex: 1, color: '#e6eef8', fontSize: 16, paddingVertical: 14 },
  hint: { color: '#64748b', fontSize: 12, marginBottom: 20 },
  button: {
    backgroundColor: '#0c4a6e', borderRadius: 10,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
