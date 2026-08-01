// Dynamic wrapper around app.json. Exists for exactly one job: injecting
// the Google Maps Android API key from the environment at build time, so
// the key never lives in the repo. Locally it comes from .env; on EAS it
// comes from an EAS environment variable:
//
//   eas env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value <key> \
//     --environment production --visibility secret
//   (repeat for --environment preview / development)
//
// Why it's needed at all: react-native-maps on Android talks to the Google
// Maps SDK, which needs an API key in standalone builds. Expo Go ships its
// own key, which is why the map works there without one — and why a build
// WITHOUT this key shows a blank grey map on Android. iOS uses Apple Maps
// and needs nothing.
module.exports = ({ config }) => {
  const apiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (!apiKey) return config;
  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: { apiKey },
      },
    },
  };
};
