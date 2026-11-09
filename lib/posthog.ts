import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';

type PostHogExtra = {
  posthogProjectToken?: string;
  posthogHost?: string;
};

const posthogExtra = Constants.expoConfig?.extra as PostHogExtra | undefined;
const projectToken = posthogExtra?.posthogProjectToken;
const host = posthogExtra?.posthogHost;
const isPostHogConfigured = Boolean(projectToken && host);

if (!isPostHogConfigured && __DEV__) {
  const missingVariable = projectToken ? 'POSTHOG_HOST' : 'POSTHOG_PROJECT_TOKEN';
  console.error(
    new Error(
      `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
    ),
  );
}

export const posthog = isPostHogConfigured
  ? new PostHog(projectToken!, {
      enableSessionReplay: true,
      sessionReplayConfig: {
        maskAllTextInputs: true,
        maskAllImages: true,
    },
      host,
      captureAppLifecycleEvents: true,
      errorTracking: {
        autocapture: {
          uncaughtExceptions: true,
          unhandledRejections: true,
        },
      },
      logs: {
        serviceName: 'fishingapp-mobile',
        environment: __DEV__ ? 'development' : 'production',
        serviceVersion: Constants.expoConfig?.version ?? undefined,
      },
    })
  : undefined;

export const posthogLog = {
  info: (message: string, attributes?: Record<string, string | number | boolean>) =>
    posthog?.logger.info(message, attributes),
};
