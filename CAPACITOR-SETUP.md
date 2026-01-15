# KRUX - Configuración de Capacitor

Esta guía te ayudará a compilar KRUX como app nativa para iOS y Android.

## Requisitos Previos

### Para iOS:
- macOS (obligatorio)
- Xcode 15+ instalado desde App Store
- CocoaPods: `sudo gem install cocoapods`
- Cuenta de Apple Developer (para publicar)

### Para Android:
- Android Studio instalado
- Java JDK 17+
- Android SDK configurado

### General:
- Node.js 18+ y npm
- Git

## Instalación Paso a Paso

### 1. Arreglar permisos de npm (si hay errores)

```bash
sudo rm -rf ~/.npm/_cacache
sudo chown -R $(whoami) ~/.npm
```

### 2. Instalar dependencias

```bash
cd /Users/jaimelillo/Downloads/APP/00_APP1
npm install
```

### 3. Añadir plataformas nativas

```bash
# iOS
npx cap add ios

# Android
npx cap add android
```

### 4. Sincronizar proyecto web con nativos

```bash
npx cap sync
```

## Desarrollo

### Abrir en Xcode (iOS)

```bash
npx cap open ios
```

Luego en Xcode:
1. Selecciona tu dispositivo o simulador
2. Presiona ▶️ para ejecutar

### Abrir en Android Studio

```bash
npx cap open android
```

Luego en Android Studio:
1. Espera a que Gradle sincronice
2. Selecciona tu dispositivo o emulador
3. Presiona ▶️ para ejecutar

### Ejecutar directamente (sin IDE)

```bash
# iOS (requiere simulador o dispositivo)
npx cap run ios

# Android (requiere emulador o dispositivo)
npx cap run android
```

## Sincronización de Cambios

Cada vez que modifiques archivos web (HTML, CSS, JS):

```bash
npx cap sync
```

O para sincronización en vivo durante desarrollo:

```bash
npx cap run ios --livereload --external
npx cap run android --livereload --external
```

## Configuración de Iconos y Splash

Los recursos están pre-generados en `/resources/`. Para regenerarlos:

```bash
./resources/generate-resources.sh
```

### Copiar iconos a iOS

1. Abre `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
2. Copia los iconos de `/resources/icon/` con los nombres correctos

### Copiar iconos a Android

Los iconos deben ir en `android/app/src/main/res/`:
- `mipmap-mdpi/` → icon-48.png
- `mipmap-hdpi/` → icon-72.png
- `mipmap-xhdpi/` → icon-96.png
- `mipmap-xxhdpi/` → icon-144.png
- `mipmap-xxxhdpi/` → icon-192.png

## Configuración de Permisos

### iOS (ios/App/App/Info.plist)

Los permisos ya están configurados para:
- Cámara
- Galería de fotos
- Ubicación
- Notificaciones push

### Android (android/app/src/main/AndroidManifest.xml)

Añade estos permisos si no están:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.VIBRATE" />
```

## Compilación para Producción

### iOS

1. En Xcode: Product → Archive
2. Distribuir a App Store Connect
3. O exportar como IPA para TestFlight

### Android

```bash
# Generar APK de release
cd android
./gradlew assembleRelease

# O generar AAB para Play Store
./gradlew bundleRelease
```

El APK estará en: `android/app/build/outputs/apk/release/`
El AAB estará en: `android/app/build/outputs/bundle/release/`

## Solución de Problemas

### Error: "CocoaPods not installed"
```bash
sudo gem install cocoapods
cd ios/App && pod install
```

### Error: "Android SDK not found"
1. Abre Android Studio → Settings → SDK Manager
2. Instala el SDK correspondiente
3. Configura `ANDROID_SDK_ROOT` en tu PATH

### Error: "Gradle sync failed"
```bash
cd android
./gradlew clean
./gradlew build
```

### La app no refleja cambios web
```bash
npx cap sync
# O reinicia la app completamente
```

## APIs Nativas Disponibles

El archivo `capacitor-init.js` expone estas APIs globales:

```javascript
// Cámara
await kruxCamera.takePicture();
await kruxCamera.pickFromGallery();

// Geolocalización
await kruxGeolocation.getCurrentPosition();
await kruxGeolocation.watchPosition(callback);

// Compartir
await kruxShare.share({ title, text, url });

// Vibración/Haptics
await kruxHaptics.impact('Medium');
await kruxHaptics.vibrate();

// Info de plataforma
kruxPlatform.isNative  // true si es app nativa
kruxPlatform.isIOS     // true si es iOS
kruxPlatform.isAndroid // true si es Android
kruxPlatform.isWeb     // true si es web/PWA
```

## Estructura del Proyecto

```
00_APP1/
├── capacitor.config.ts    # Configuración de Capacitor
├── capacitor-init.js      # Inicialización de plugins
├── package.json           # Dependencias npm
├── resources/             # Iconos y splash generados
│   ├── icon/
│   ├── splash/
│   └── android/
├── ios/                   # Proyecto Xcode (generado)
└── android/               # Proyecto Android Studio (generado)
```

## Publicación en Stores

### App Store (iOS)
1. Necesitas cuenta Apple Developer ($99/año)
2. Configura certificates y provisioning profiles
3. Sube via Xcode o Transporter

### Play Store (Android)
1. Necesitas cuenta Google Play Developer ($25 único)
2. Firma el AAB con tu keystore
3. Sube via Play Console

---

Para más información: https://capacitorjs.com/docs
