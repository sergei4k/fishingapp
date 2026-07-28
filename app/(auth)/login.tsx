import { useAuth } from '@/lib/auth';
import { theme } from '../../lib/theme';
import { useLanguage, type Language } from '@/lib/language';
import { pb } from '@/lib/pocketbase';
import Constants from 'expo-constants';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ImageBackground, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import * as AppleAuthentication from 'expo-apple-authentication';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Login() {
  const { signIn, signInWithGoogle, signInWithYandex, signInWithApple } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotVisible, setForgotVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const appleSignInInFlight = useRef(false);

  const handleResetPassword = async () => {
    if (!resetEmail.trim()) return;
    setResetLoading(true);
    try {
      await pb.collection('users').requestPasswordReset(resetEmail.trim());
      Alert.alert(t('resetPasswordSent'), t('resetPasswordSentMessage'));
      setForgotVisible(false);
      setResetEmail('');
    } catch {
      Alert.alert(t('error'), t('resetPasswordError'));
    } finally {
      setResetLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await signInWithGoogle();
    setLoading(false);
    if (error && error.message === 'GOOGLE_FAILED') {
      Alert.alert(
        t('error'),
        language === 'ru'
          ? 'Не удалось войти через Google. Попробуйте войти по email и паролю.'
          : 'Google sign-in failed. Please try email and password instead.',
      );
    }
  };

  const handleYandexLogin = async () => {
    setLoading(true);
    const { error } = await signInWithYandex();
    setLoading(false);
    if (error && error.message === 'YANDEX_FAILED') {
      Alert.alert(
        t('error'),
        language === 'ru'
          ? 'Не удалось войти через Яндекс. Попробуйте войти по email и паролю.'
          : 'Yandex sign-in failed. Please try email and password instead.',
      );
    }
  };

  const handleAppleLogin = async () => {
    // AppleAuthenticationButton has no disabled prop. Guard repeat taps while
    // the native sheet or server exchange is active.
    if (appleSignInInFlight.current) return;
    appleSignInInFlight.current = true;
    setLoading(true);
    try {
      const { error } = await signInWithApple();
      if (error && error.message === 'APPLE_FAILED') {
        Alert.alert(
          t('error'),
          language === 'ru'
            ? 'Не удалось войти через Apple. Попробуйте войти по email и паролю.'
            : 'Apple sign-in failed. Please try email and password instead.',
        );
      }
    } finally {
      appleSignInInFlight.current = false;
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);

    if (error) {
      const msg = error.message === 'OFFLINE' ? t('offlineError')
        : error.message === 'WRONG_PASSWORD' ? t('wrongPassword')
        : t('wrongPassword');
      Alert.alert(t('error'), msg);
    }
  };

  // Return to guest browsing without logging in.
  const handleClose = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as any);
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
              <TouchableOpacity style={styles.backBtn} onPress={handleClose} hitSlop={10}>
                <Ionicons name="arrow-back" size={20} color="#ffffff" />
                <Text style={styles.backBtnText}>{language === 'ru' ? 'Назад' : 'Back'}</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[styles.langBtn, language === 'ru' && styles.langBtnActive]}
                  onPress={() => setLanguage('ru' as Language)}
                >
                  <Text style={[styles.langBtnText, language === 'ru' && styles.langBtnTextActive]}>RU</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.langBtn, language === 'en' && styles.langBtnActive]}
                  onPress={() => setLanguage('en' as Language)}
                >
                  <Text style={[styles.langBtnText, language === 'en' && styles.langBtnTextActive]}>EN</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.heroText}>
              <Text style={styles.heading}>{t('welcome')}</Text>
              <Text style={styles.subheading}>{t('welcomeSubtitle')}</Text>
            </View>

            <View style={styles.form}>
              <Text style={styles.formTitle}>{t('login')}</Text>

              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={16} color="#94a3b8" style={styles.inputIcon} />
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
                <Ionicons name="lock-closed-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
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
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#94a3b8" />
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

              <TouchableOpacity onPress={() => { setResetEmail(email); setForgotVisible(true); }} style={styles.forgotBtn}>
                <Text style={styles.forgotText}>{t('forgotPassword')}</Text>
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{language === 'ru' ? 'или' : 'or'}</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity style={styles.googleBtn} onPress={handleGoogleLogin} disabled={loading} activeOpacity={0.85}>
                <Image source={require('../../assets/images/google-logo.png')} style={styles.googleLogo} />
                <Text style={styles.googleBtnText}>{language === 'ru' ? 'Войти через Google' : 'Continue with Google'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.oauthBtn, styles.yandexBtn]}
                onPress={handleYandexLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                <View style={styles.yandexLogo}>
                  <FontAwesome5 name="yandex" size={18} color="#fc3f1d" />
                </View>
                <Text style={styles.oauthBtnText}>{t('signInWithYandex')}</Text>
              </TouchableOpacity>

              {Platform.OS === 'ios' && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={10}
                  style={[styles.appleBtn, loading && styles.appleBtnDisabled]}
                  onPress={handleAppleLogin}
                />
              )}

              <Text style={styles.privacyText}>
                {t('loginAgree')}{' '}
                <Text
                  style={styles.privacyLink}
                  onPress={() => Linking.openURL('https://sergei4k.github.io/fishingapp/terms.html')}
                >
                  {t('termsOfUse')}
                </Text>
                {' '}{t('and')}{' '}
                <Text
                  style={styles.privacyLink}
                  onPress={() => Linking.openURL('https://sergei4k.github.io/fishingapp/privacy-policy.html')}
                >
                  {t('privacyPolicy')}
                </Text>
                .
              </Text>

            </View>

            <Modal visible={forgotVisible} transparent animationType="fade" onRequestClose={() => setForgotVisible(false)}>
              <View style={styles.modalOverlay}>
                <View style={styles.modalBox}>
                  <Text style={styles.modalTitle}>{t('resetPassword')}</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="mail-outline" size={16} color="#94a3b8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder={t('resetEmailPlaceholder')}
                      placeholderTextColor="#4b5563"
                      value={resetEmail}
                      onChangeText={setResetEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      keyboardAppearance="dark"
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.button, resetLoading && styles.buttonDisabled]}
                    onPress={handleResetPassword}
                    disabled={resetLoading}
                  >
                    {resetLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('resetPassword')}</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setForgotVisible(false)} style={styles.forgotBtn}>
                    <Text style={styles.forgotText}>{t('cancel') ?? 'Cancel'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t('noAccount')}</Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                <Text style={styles.footerLink}>{t('registerLink')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.versionText}>v{Constants.expoConfig?.version ?? ''}</Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingRight: 8,
  },
  backBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
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
    borderColor: '#ffffff',
    backgroundColor: 'rgba(15, 34, 54, 0.8)',
  },
  langBtnText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  langBtnTextActive: {
    color: '#ffffff',
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
    backgroundColor: theme.colors.primaryDark,
    borderRadius: theme.radius.control,
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
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  versionText: {
    color: 'rgb(218, 218, 218)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
  },
  forgotBtn: {
    alignItems: 'center',
    marginTop: 14,
  },
  forgotText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  privacyText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
    textAlign: 'center',
  },
  privacyLink: {
    color: '#e6eef8',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#0f1b2d',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dividerText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  vkBtn: {
    backgroundColor: '#0077FF',
    borderRadius: 10,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  oauthBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  yandexBtn: {
    backgroundColor: '#fc3f1d',
    marginTop: 10,
  },
  yandexLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  oauthLogo: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  oauthLogoText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  oauthBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  googleBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleLogo: {
    width: 22,
    height: 22,
  },
  googleBtnText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },
  appleBtn: {
    height: 46,
    width: '100%',
    marginTop: 10,
  },
  appleBtnDisabled: {
    opacity: 0.6,
  },
});
