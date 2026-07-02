/**
 * Configuration file for Expo.
 * Converted to app.config.js to allow custom android intentFilters with launchMode: singleTask
 * without requiring config plugins.
 */

module.exports = {
  expo: {
    name: "LaTortariaMobile",
    slug: "LaTortariaMobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "latortariamobile",
    userInterfaceStyle: "automatic",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.jairodiazv0.LaTortariaMobile",
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
      "expo-secure-store",
      "expo-web-browser"
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
