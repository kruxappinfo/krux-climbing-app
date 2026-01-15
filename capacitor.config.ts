import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.krux.climbing',
  appName: 'KRUX',
  webDir: 'www',

  // Configuración del servidor
  server: {
    // En desarrollo, puedes apuntar a tu servidor local
    // url: 'http://localhost:8080',
    // cleartext: true,

    // En producción, usa los archivos locales
    androidScheme: 'https',
    iosScheme: 'https'
  },

  // Plugins configuration
  plugins: {
    // Google Auth
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '627029956398-56bejmgdu7vacv4foaqop0n2ogvgjbm7.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },

    // Splash Screen

    SplashScreen: {

      launchShowDuration: 3000,  // Mínimo 3 segundos

      launchAutoHide: false,     // Control manual del hide

      backgroundColor: '#12161c',

      androidSplashResourceName: 'splash',

      androidScaleType: 'CENTER_CROP',

      showSpinner: false,

      splashFullScreen: true,

      splashImmersive: true,

      iosSpinnerStyle: 'small',

      androidSpinnerStyle: 'small'
    },

    // Status Bar
    StatusBar: {
      backgroundColor: '#000000',
      style: 'LIGHT', // LIGHT = iconos claros sobre fondo oscuro
      overlaysWebView: true // Edge-to-edge
    },

    // Keyboard
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    },

    // Push Notifications
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },

    // Geolocation
    Geolocation: {
      // Configuración específica si es necesaria
    }
  },

  // Configuración específica de iOS
  ios: {
    contentInset: 'never', // Edge-to-edge
    backgroundColor: '#000000',
    preferredContentMode: 'mobile',
    allowsZoom: false, // Deshabilita pinch-to-zoom en iOS
    // Para permitir HTTP en desarrollo
    // allowsLinkPreview: true,
    // scheme: 'krux' // Comentado para usar el scheme por defecto (capacitor://)
  },

  // Configuración específica de Android
  android: {
    backgroundColor: '#ffffff',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false, // Poner true para desarrollo
    allowZoom: false // Deshabilita pinch-to-zoom en Android
  }
};

export default config;
