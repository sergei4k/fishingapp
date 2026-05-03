import { useAuth } from '@/lib/auth';
import { useLanguage, type Language } from '@/lib/language';
import { FontAwesome6 as FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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

export default function Login() {
  const { signIn } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);

    if (error) {
      Alert.alert(t('error'), error.message);
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.langRow}>
              <TouchableOpacity
                style={[styles.langBtn, language === 'ru' && styles.langBtnActive]}
                onPress={() => setLanguage('ru' as Language)}
              >
                <Text style={[styles.langBtnText, language === 'ru' && styles.langBtnTextActive]}>🇷🇺 RU</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langBtn, language === 'en' && styles.langBtnActive]}
                onPress={() => setLanguage('en' as Language)}
              >
                <Text style={[styles.langBtnText, language === 'en' && styles.langBtnTextActive]}>🇬🇧 EN</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.heroText}>
              <Text style={styles.heading}>{t('welcome')}</Text>
              <Text style={styles.subheading}>{t('welcomeSubtitle')}</Text>
            </View>

            <View style={styles.form}>
              <Text style={styles.formTitle}>{t('login')}</Text>

              <View style={styles.inputWrapper}>
                <FontAwesome name="envelope" size={16} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('emailPlaceholder')}
                  placeholderTextColor="#4b5563"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  keyboardAppearance="dark"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.inputWrapper}>
                <FontAwesome name="lock" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder={t('passwordPlaceholder')}
                  placeholderTextColor="#4b5563"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  keyboardAppearance="dark"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                  <FontAwesome name={showPassword ? 'eye-slash' : 'eye'} size={18} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>{t('loginButton')}</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t('noAccount')}</Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                <Text style={styles.footerLink}>{t('registerLink')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 12, 26, 0.62)',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  langRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 16,
  },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(7, 16, 35, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  langBtnActive: {
    borderColor: '#60a5fa',
    backgroundColor: 'rgba(15, 34, 54, 0.8)',
  },
  langBtnText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  langBtnTextActive: {
    color: '#60a5fa',
  },
  heroText: {
    alignItems: 'center',
    marginBottom: 36,
  },
  heading: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  subheading: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 15,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  form: {
    backgroundColor: 'rgba(7, 16, 35, 0.82)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  formTitle: {
    color: '#e6eef8',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    marginBottom: 14,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
    width: 20,
    textAlign: 'center',
  },
  input: {
    flex: 1,
    color: '#e6eef8',
    fontSize: 16,
    paddingVertical: 14,
  },
  eyeButton: {
    padding: 8,
  },
  button: {
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
    gap: 6,
  },
  footerText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
  },
  footerLink: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: '600',
  },
});
