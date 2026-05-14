# Instrucciones para Sincronizar Cambios con iOS

## Pasos para ver los cambios en la app de iPhone:

### 1. Sincronizar archivos con Capacitor
Ejecuta en la terminal (desde la carpeta del proyecto):
```bash
npx cap sync ios
```

Este comando copia los archivos de `www/` a la carpeta `ios/App/App/public/` de Xcode.

### 2. En Xcode:
- Abre el proyecto: `ios/App/App.xcworkspace` (NO el .xcodeproj)
- Limpia el build: Product → Clean Build Folder (⇧⌘K)
- Reconstruye: Product → Build (⌘B)
- Ejecuta en el simulador/dispositivo: Product → Run (⌘R)

### 3. Si aún no ves los cambios:
- **Limpiar cache del WebView**: En Xcode, ve a Product → Clean Build Folder
- **Reinstalar la app**: Elimina la app del simulador/dispositivo y vuelve a instalarla
- **Verificar que los archivos se copiaron**: Revisa que `ios/App/App/public/mobile-auth.js` tenga los cambios

### 4. Para desarrollo más rápido (Live Reload):
Puedes configurar Capacitor para apuntar a un servidor local durante desarrollo.
Edita `capacitor.config.ts` y descomenta:
```typescript
server: {
  url: 'http://localhost:8080',
  cleartext: true,
}
```
Luego ejecuta `npx cap sync ios` y reinicia la app.

### 5. Verificar cambios en tiempo real:
Abre la consola de Safari (Safari → Develop → [Tu dispositivo] → [Tu app]) para ver los logs de `[MobileAuth]`.

