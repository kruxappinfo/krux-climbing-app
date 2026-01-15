/**
 * KRUX Capacitor Integration
 * Este archivo inicializa los plugins de Capacitor cuando la app corre como nativa
 */

// Detectar si estamos corriendo en Capacitor (nativo) o en web
const isNative = window.Capacitor !== undefined;
const isIOS = isNative && window.Capacitor.getPlatform() === 'ios';
const isAndroid = isNative && window.Capacitor.getPlatform() === 'android';

console.log('[Capacitor] Plataforma:', isNative ? window.Capacitor.getPlatform() : 'web');

// Añadir clases de plataforma al HTML inmediatamente
if (isNative) {
  document.documentElement.classList.add('platform-mobile');
  if (isIOS) document.documentElement.classList.add('platform-ios');
  if (isAndroid) document.documentElement.classList.add('platform-android');

  // Cargar CSS específico de móvil
  const mobileCSS = document.createElement('link');
  mobileCSS.rel = 'stylesheet';
  mobileCSS.href = './app-mobile.css?v=1';
  document.head.appendChild(mobileCSS);
  console.log('[Capacitor] CSS móvil cargado');
} else {
  document.documentElement.classList.add('platform-web');
}
console.log('[Capacitor] Clases de plataforma añadidas al HTML');

// Inicializar Google Auth inmediatamente si estamos en Capacitor
if (isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.GoogleAuth) {
  console.log('[Capacitor] Inicializando Google Auth plugin...');
  // El plugin se inicializa automáticamente, solo verificamos que existe
  window.GoogleAuth = window.Capacitor.Plugins.GoogleAuth;
  console.log('[Capacitor] Google Auth plugin disponible');
}

/**
 * Inicializar Capacitor cuando el DOM esté listo
 */
document.addEventListener('DOMContentLoaded', async () => {
  if (!isNative) {
    console.log('[Capacitor] Ejecutando en modo web (PWA)');
    return;
  }

  console.log('[Capacitor] Inicializando plugins nativos...');

  try {
    // Inicializar Status Bar
    await initStatusBar();

    // Inicializar Splash Screen
    await initSplashScreen();

    // Inicializar Keyboard
    await initKeyboard();

    // Inicializar App events
    await initAppEvents();

    // Inicializar Push Notifications (si el usuario lo permite)
    // await initPushNotifications();

    console.log('[Capacitor] Plugins inicializados correctamente');
  } catch (error) {
    console.error('[Capacitor] Error inicializando plugins:', error);
  }
});

/**
 * Configurar Status Bar
 */
async function initStatusBar() {
  if (!window.Capacitor.Plugins.StatusBar) return;

  const { StatusBar, Style } = window.Capacitor.Plugins;

  try {
    // Estilo de la barra de estado
    await StatusBar.setStyle({ style: Style.Dark }); // Iconos oscuros

    if (isAndroid) {
      // En Android, configurar color de fondo
      await StatusBar.setBackgroundColor({ color: '#ffffff' });
    }

    console.log('[Capacitor] StatusBar configurado');
  } catch (error) {
    console.error('[Capacitor] Error en StatusBar:', error);
  }
}

/**
 * Configurar Splash Screen
 */
async function initSplashScreen() {
  if (!window.Capacitor.Plugins.SplashScreen) return;

  const { SplashScreen } = window.Capacitor.Plugins;

  try {
    // NO ocultar el splash inmediatamente
    // Esperar a que la app esté completamente lista
    console.log('[Capacitor] SplashScreen configurado - esperando señal de app lista');

    // Exponer función global para ocultar el splash cuando la app esté lista
    window.hideSplashScreen = async () => {
      try {
        await SplashScreen.hide({
          fadeOutDuration: 300
        });
        console.log('[Capacitor] SplashScreen ocultado');
      } catch (error) {
        console.error('[Capacitor] Error ocultando SplashScreen:', error);
      }
    };

    // Timeout de seguridad: ocultar después de 5 segundos máximo
    setTimeout(async () => {
      if (window.hideSplashScreen) {
        console.log('[Capacitor] Timeout - ocultando splash por seguridad');
        await window.hideSplashScreen();
      }
    }, 5000);

  } catch (error) {
    console.error('[Capacitor] Error en SplashScreen:', error);
  }
}

/**
 * Configurar Keyboard
 */
async function initKeyboard() {
  if (!window.Capacitor.Plugins.Keyboard) return;

  const { Keyboard } = window.Capacitor.Plugins;

  try {
    // Listeners para el teclado
    Keyboard.addListener('keyboardWillShow', (info) => {
      document.body.classList.add('keyboard-open');
      document.body.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
    });

    Keyboard.addListener('keyboardWillHide', () => {
      document.body.classList.remove('keyboard-open');
      document.body.style.setProperty('--keyboard-height', '0px');
    });

    // En iOS, configurar accesorio del teclado
    if (isIOS) {
      await Keyboard.setAccessoryBarVisible({ isVisible: true });
    }

    console.log('[Capacitor] Keyboard configurado');
  } catch (error) {
    console.error('[Capacitor] Error en Keyboard:', error);
  }
}

/**
 * Configurar eventos de la App
 */
async function initAppEvents() {
  if (!window.Capacitor.Plugins.App) return;

  const { App } = window.Capacitor.Plugins;

  try {
    // Detectar cuando la app va a background
    App.addListener('appStateChange', ({ isActive }) => {
      console.log('[Capacitor] App estado:', isActive ? 'activa' : 'background');

      if (isActive) {
        // La app volvió al foreground
        document.dispatchEvent(new CustomEvent('app:resume'));
      } else {
        // La app va al background
        document.dispatchEvent(new CustomEvent('app:pause'));
      }
    });

    // Manejar el botón "back" en Android
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        // Preguntar si quiere salir o minimizar
        App.minimizeApp();
      }
    });

    // Deep links
    App.addListener('appUrlOpen', (event) => {
      console.log('[Capacitor] Deep link:', event.url);
      // Manejar deep links aquí
      handleDeepLink(event.url);
    });

    console.log('[Capacitor] App events configurados');
  } catch (error) {
    console.error('[Capacitor] Error en App events:', error);
  }
}

/**
 * Manejar deep links
 */
function handleDeepLink(url) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    // Ejemplos de deep links:
    // krux://route/123 -> Abrir ruta específica
    // krux://profile/username -> Abrir perfil
    // krux://map?lat=40&lng=-3 -> Abrir mapa en ubicación

    if (path.startsWith('/route/')) {
      const routeId = path.split('/')[2];
      console.log('[DeepLink] Abrir ruta:', routeId);
      // TODO: Implementar navegación a ruta
    } else if (path.startsWith('/profile/')) {
      const username = path.split('/')[2];
      console.log('[DeepLink] Abrir perfil:', username);
      // TODO: Implementar navegación a perfil
    } else if (path.startsWith('/map')) {
      const params = urlObj.searchParams;
      const lat = params.get('lat');
      const lng = params.get('lng');
      console.log('[DeepLink] Abrir mapa:', lat, lng);
      // TODO: Implementar navegación al mapa
    }
  } catch (error) {
    console.error('[DeepLink] Error procesando URL:', error);
  }
}

/**
 * Inicializar Push Notifications
 */
async function initPushNotifications() {
  if (!window.Capacitor.Plugins.PushNotifications) return;

  const { PushNotifications } = window.Capacitor.Plugins;

  try {
    // Solicitar permisos
    const permission = await PushNotifications.requestPermissions();

    if (permission.receive === 'granted') {
      // Registrar para recibir notificaciones
      await PushNotifications.register();

      // Listener para el token
      PushNotifications.addListener('registration', (token) => {
        console.log('[Push] Token:', token.value);
        // Enviar token al servidor
        sendTokenToServer(token.value);
      });

      // Listener para errores
      PushNotifications.addListener('registrationError', (error) => {
        console.error('[Push] Error de registro:', error);
      });

      // Listener para notificaciones recibidas (app en foreground)
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[Push] Notificación recibida:', notification);
        // Mostrar notificación local o actualizar UI
      });

      // Listener para cuando el usuario toca una notificación
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('[Push] Acción:', action);
        // Navegar a la pantalla correspondiente
        if (action.notification.data?.url) {
          handleDeepLink(action.notification.data.url);
        }
      });

      console.log('[Capacitor] Push Notifications configuradas');
    } else {
      console.log('[Capacitor] Permisos de notificaciones denegados');
    }
  } catch (error) {
    console.error('[Capacitor] Error en Push Notifications:', error);
  }
}

/**
 * Enviar token de push al servidor
 */
async function sendTokenToServer(token) {
  // TODO: Implementar envío al backend
  console.log('[Push] Token a enviar al servidor:', token);
}

// ====================================
// APIs Nativas expuestas globalmente
// ====================================

/**
 * Usar la cámara nativa
 */
window.kruxCamera = {
  async takePicture() {
    if (!isNative || !window.Capacitor.Plugins.Camera) {
      // Fallback a input file en web
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => resolve({ dataUrl: reader.result });
            reader.readAsDataURL(file);
          }
        };
        input.click();
      });
    }

    const { Camera, CameraResultType, CameraSource } = window.Capacitor.Plugins;

    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera
    });

    return { dataUrl: image.dataUrl };
  },

  async pickFromGallery() {
    if (!isNative || !window.Capacitor.Plugins.Camera) {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => resolve({ dataUrl: reader.result });
            reader.readAsDataURL(file);
          }
        };
        input.click();
      });
    }

    const { Camera, CameraResultType, CameraSource } = window.Capacitor.Plugins;

    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos
    });

    return { dataUrl: image.dataUrl };
  }
};

/**
 * Geolocalización nativa
 */
window.kruxGeolocation = {
  async getCurrentPosition(options = {}) {
    if (!isNative || !window.Capacitor.Plugins.Geolocation) {
      // Fallback a API web
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({
            coords: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy
            }
          }),
          reject,
          options
        );
      });
    }

    const { Geolocation } = window.Capacitor.Plugins;
    return await Geolocation.getCurrentPosition(options);
  },

  async watchPosition(callback, options = {}) {
    if (!isNative || !window.Capacitor.Plugins.Geolocation) {
      return navigator.geolocation.watchPosition(
        (pos) => callback({
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          }
        }),
        console.error,
        options
      );
    }

    const { Geolocation } = window.Capacitor.Plugins;
    return await Geolocation.watchPosition(options, callback);
  }
};

/**
 * Compartir nativo
 */
window.kruxShare = {
  async share(options) {
    if (!isNative || !window.Capacitor.Plugins.Share) {
      // Fallback a Web Share API
      if (navigator.share) {
        return navigator.share(options);
      }
      // Si no hay soporte, copiar al portapapeles
      if (options.url) {
        await navigator.clipboard.writeText(options.url);
        alert('Enlace copiado al portapapeles');
      }
      return;
    }

    const { Share } = window.Capacitor.Plugins;
    return await Share.share(options);
  }
};

/**
 * Haptics (vibración)
 */
window.kruxHaptics = {
  async impact(style = 'Medium') {
    if (!isNative || !window.Capacitor.Plugins.Haptics) return;

    const { Haptics, ImpactStyle } = window.Capacitor.Plugins;
    await Haptics.impact({ style: ImpactStyle[style] });
  },

  async notification(type = 'Success') {
    if (!isNative || !window.Capacitor.Plugins.Haptics) return;

    const { Haptics, NotificationType } = window.Capacitor.Plugins;
    await Haptics.notification({ type: NotificationType[type] });
  },

  async vibrate() {
    if (!isNative || !window.Capacitor.Plugins.Haptics) {
      // Fallback a Vibration API
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      return;
    }

    const { Haptics } = window.Capacitor.Plugins;
    await Haptics.vibrate();
  }
};

// Exportar estado de la plataforma
window.kruxPlatform = {
  isNative,
  isIOS,
  isAndroid,
  isWeb: !isNative
};

console.log('[Capacitor] APIs nativas disponibles: kruxCamera, kruxGeolocation, kruxShare, kruxHaptics, kruxPlatform');
