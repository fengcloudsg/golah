import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "sg.golah.app",
  appName: "GoLah!",
  webDir: "dist",
  server: {
    androidScheme: "https",
    iosScheme: "https",
  },
  plugins: {
    Geolocation: {
      permissionDescription: "GoLah! uses your location to show nearby campaign stalls.",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    LocalNotifications: {
      iconColor: "#0f766e",
    },
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#0f766e",
    },
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
  },
};

export default config;
