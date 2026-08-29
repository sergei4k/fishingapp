import { useEffect } from 'react';
import { theme } from '../lib/theme';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';

// Handles fishingapp://oauth2?code=xxx redirect from OAuth providers
export default function OAuth2Redirect() {
  const router = useRouter();

  useEffect(() => {
    // If opened via deep link (not captured by openAuthSessionAsync on Android),
    // just go back to login. openAuthSessionAsync handles the code extraction.
    const timer = setTimeout(() => {
      router.replace('/(auth)/login' as any);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#ffffff" />
    </View>
  );
}
