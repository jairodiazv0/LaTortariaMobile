/**
 * Configuration file for Expo.
 * Converted to app.config.js to allow custom android intentFilters with launchMode: singleTask
 * without requiring config plugins.
 */

module.exports = {
  expo: {
    name: "LaTortaria",
    slug: "LaTortariaMobile",
    // [ANALYTICS-GA4] Subida de versión OBLIGATORIA: Firebase es un módulo nativo y runtimeVersion
    // usa la política appVersion; así las apps 1.1.1 ya instaladas nunca reciben este JS por OTA.
    version: "1.2.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "latortariamobile",
    userInterfaceStyle: "automatic",
    runtimeVersion: {
      policy: "appVersion"
    },
    updates: {
      url: "https://u.expo.dev/6c414a2a-d0f3-48e4-b16d-f831176c09f3"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.jairodiazv0.LaTortariaMobile",
      googleServicesFile: "./GoogleService-Info.plist", // [ANALYTICS-GA4]
      infoPlist: {
        CFBundleURLTypes: [
          {
            CFBundleURLSchemes: ["latortariamobile"]
          }
        ]
      }
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#FAF7F2",
        foregroundImage: "./assets/images/android-icon-foreground.png"
      },
      predictiveBackGestureEnabled: false,
      package: "com.jairodiazv0.LaTortariaMobile",
      googleServicesFile: "./google-services.json", // [ANALYTICS-GA4]
      // [ANALYTICS-GA4] Sin ID de publicidad: la app no lo usa (Play Console lo declara así).
      blockedPermissions: ["com.google.android.gms.permission.AD_ID"],
      intentFilters: [
        {
          action: "VIEW",
          category: ["BROWSABLE", "DEFAULT"],
          data: {
            scheme: "latortariamobile",
            host: "checkout",
            path: "/result"
          },
          launchMode: "singleTask"
        },
        {
          action: "VIEW",
          category: ["BROWSABLE", "DEFAULT"],
          data: {
            scheme: "latortariamobile",
            host: "auth",
            path: "/reset-password"
          },
          launchMode: "singleTask"
        }
      ]
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/splash-icon.png",
          "resizeMode": "contain",
          "backgroundColor": "#FAF7F2"
        }
      ],
      "expo-image",
      "expo-font",          // ← nuevo
      "expo-status-bar",    // ← nuevo
      "expo-secure-store",
      "expo-web-browser",
      // [ANALYTICS-GA4] Firebase Analytics. disableSPM + useFrameworks static (CocoaPods) evita el
      // conflicto "SPM + static linkage" de React Native Firebase v26; withoutAdIdSupport = sin IDFA.
      [
        "@react-native-firebase/app",
        {
          "ios": {
            "disableSPM": true
          }
        }
      ],
      [
        "@react-native-firebase/analytics",
        {
          "ios": {
            "withoutAdIdSupport": true
          }
        }
      ],
      [
        "expo-notifications",
        {
          "icon": "./assets/images/icon.png" //Asegura que Android tenga el ícono de marca en las notificaciones push
        }
      ],
      [
        "expo-build-properties",
        {
          "android": {
            "enableProguardInReleaseBuilds": true,
            "enableShrinkResourcesInReleaseBuilds": true
          },
          "ios": {
            "useFrameworks": "static" // [ANALYTICS-GA4]
          }
        }
      ]
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      router: {},
      eas: {
        projectId: "6c414a2a-d0f3-48e4-b16d-f831176c09f3"
      }
    }
  }
};
