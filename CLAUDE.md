# KRUX — Hybrid App Architect (PWA + Capacitor)

## ROLE
Principal Software Architect. Priorities: robust/clean code, cross-platform consistency.
A root-file change must ALWAYS be synced to `www/` before testing on mobile. A `www/` change alone is never the source of truth.

## STACK
- **Runtime:** Vanilla JS (ES2020+) + Capacitor 6 — NO framework (no React, no Vue)
- **Lang:** JavaScript (vanilla). Solo `capacitor.config.ts` usa TypeScript.
- **Styles:** Vanilla CSS (`app_2.css` principal, `app-mobile.css` overrides mobile)
- **Maps:** MapLibre GL JS (reemplazó Google Maps)
- **Backend:** Firebase v8 compat SDK (Firestore, Auth, Storage, Hosting, Functions)
- **Mobile wrapper:** Capacitor 6 (iOS + Android), `webDir: "www"`
- **Auth:** Google Sign-In (`@codetrix-studio/capacitor-google-auth` en móvil, popup en web)
- **Pkg mgr:** npm

---

## ESTRUCTURA DE CARPETAS

```
/                          ← raíz = fuente de verdad
├── index.html             ← entrada PWA
├── app_3.js               ← módulo principal (~12k líneas): nav, feed, perfiles, mensajes
├── maplibre-map.js        ← mapa MapLibre (~11k líneas): sectores, rutas, escuelas, 3D
├── user-features.js       ← favoritos, ascensos, proyectos, follow system, toasts
├── auth.js                ← Google Auth (web + Capacitor) + onAuthStateChanged
├── mobile-auth.js         ← auth específica de móvil
├── firebase-config.js     ← inicialización Firebase
├── capacitor-init.js      ← inicialización Capacitor (SafeArea, StatusBar, etc.)
├── maplibre-config.js     ← config de capas y estilos del mapa
├── sector-images.js       ← galería de fotos de sector + visor + zoom
├── route-drawing.js       ← editor de trazados de vías sobre imágenes
├── dev-route-editor.js    ← herramienta Spotter/Admin: crear vías, sectores, POIs
├── admin.js               ← panel unificado super-admin
├── admin-routes.js        ← gestión de rutas (admin)
├── admin-users.js         ← gestión de usuarios (admin)
├── sw.js                  ← Service Worker (PWA offline)
├── app_2.css              ← estilos principales
├── app-mobile.css         ← overrides móvil (safe-area, notch, etc.)
├── route-drawing.css      ← estilos del editor de trazados
├── components/
│   └── RouteMarker.jsx    ← único componente JSX (render estático)
├── scripts/
│   ├── sync-www.sh        ← copia raíz → www/ y hace commit+push
│   ├── sync-all-platforms.sh
│   ├── sync-geojson.sh
│   └── Personal/          ← scripts personales (git, clean, deploy)
├── www/                   ← MIRROR de raíz, webDir de Capacitor (NO editar aquí)
├── Cartografia/           ← datos GeoJSON/MBTiles por zona (Valeria, Cuenca, etc.)
├── functions/             ← Firebase Cloud Functions
├── icons/                 ← iconos PWA y app
├── assets/                ← assets estáticos
└── data/                  ← datos de app
```

---

## FLUJO DE TRABAJO OBLIGATORIO

```
1. EDITAR archivos en la RAÍZ (nunca en www/)
2. npm run build          → copia raíz → www/  (build-www.sh)
3. npx cap sync           → sincroniza www/ → iOS + Android
4. npx cap run ios        → probar en iOS
5. npx cap run android    → probar en Android
```

**Atajo rápido (JS-only, sin cambios nativos):**
```bash
npm run build && npx cap sync
```

**Atajo completo con commit:**
```bash
bash scripts/sync-www.sh   # copia a www/, commit y push automático
```

---

## FIREBASE — COLECCIONES FIRESTORE

### Colecciones principales
| Colección | Descripción |
|-----------|-------------|
| `users/{uid}` | Perfil de usuario. Subcols: `favorites`, `projects`, `ascents`, `following`, `followers`, `notifications` |
| `ascents/{id}` | Ascensos públicos (`userId`, `schoolId`, `routeId`, `date`, `style`) |
| `posts/{id}` | Posts de la comunidad. Subcol: `comments/{id}/replies/{id}` |
| `comments/{id}` | Comentarios globales (no subcol de post) |
| `route-photos/{id}` | Fotos de vías |
| `sector_images/{id}` | Metadatos de fotos de sector |
| `sector_route_drawings/{id}` | Trazados de vías sobre imágenes de sector |
| `pending_routes/{id}` | Vías pendientes de aprobación (status: pending/approved/rejected) |
| `pending_poi/{id}` | Puntos de interés pendientes |
| `pending_sectors/{id}` | Sectores pendientes |
| `pending_schools/{id}` | Escuelas pendientes |
| `aleje_votes/{id}` | Votos de aleje por ruta |
| `estado_votes/{id}` | Votos de estado de la vía |
| `grade_votes/{id}` | Votos de grado consensuado |
| `routeSuggestions/{id}` | Sugerencias de usuarios |
| `admins/{uid}` | Roles de admin (`role: 'admin' \| 'spotter'`) |
| `spotter_requests/{uid}` | Solicitudes de rol spotter |
| `conversations/{id}` | Conversaciones DM. Subcol: `messages/{id}` |

### Roles de usuario
- **super-admin:** email `krux.app.info@gmail.com` (hardcoded en reglas)
- **admin:** doc en `/admins/{uid}` con `role: 'admin'`
- **spotter:** doc en `/admins/{uid}` con `role: 'spotter'`
- **user:** cualquier usuario autenticado

### SDK — Firebase v8 compat (NO modular)
```js
// CORRECTO — siempre así
db.collection('users').doc(uid).get()
firebase.auth().currentUser
firebase.storage().ref(path)

// INCORRECTO — no usar SDK modular
import { getDoc, doc } from 'firebase/firestore'
```

---

## PATRONES DE CÓDIGO

### Detección de plataforma
```js
const isCapacitor = window.Capacitor !== undefined;
const isIOS = isCapacitor && window.Capacitor.getPlatform() === 'ios';
const isAndroid = isCapacitor && window.Capacitor.getPlatform() === 'android';
```

### Estructura de módulos
Cada archivo JS sigue este patrón:
```js
// ================== NOMBRE DEL MÓDULO ==================
// Descripción de responsabilidad

// ============================================
// SECCIÓN
// ============================================
async function miFunction() { ... }
```

### Logging de desarrollo
```js
const DEBUG_MODE = false;
const log = DEBUG_MODE ? console.log.bind(console) : () => {};
```

### Async/await — siempre con try/catch en operaciones Firestore
```js
async function loadData() {
    try {
        const doc = await db.collection('users').doc(uid).get();
        return doc.data();
    } catch (e) {
        console.error('Error:', e);
    }
}
```

---

## EXECUTION ALGORITHM (obligatorio antes de cualquier código)

**A. IMPACT** → ¿Qué archivo se toca?
- `app_3.js / user-features.js / auth.js` → CORE (alto riesgo, afecta web + móvil)
- `maplibre-map.js / maplibre-config.js` → MAPA (web + móvil)
- `capacitor-init.js / mobile-auth.js` → MOBILE only
- `index.html / app_2.css` → WEB + build Capacitor
- `admin.js / admin-*.js` → ADMIN only

**B. REGLAS por área**

### [CORE] Archivos compartidos
- NO usar `window.*` sin guard `if (!isCapacitor)`
- NO jQuery. Usar vanilla JS / Firestore SDK v8.
- No introducir dependencias npm sin consenso (el proyecto es intencionalmente sin bundler).

### [WEB] HTML/CSS
- Mobile-first. Unidades `rem`/`%`/`vw` — evitar `px` fijos salvo bordes/sombras.
- `viewport-fit=cover` ya configurado. Usar `env(safe-area-inset-*)` para notch.
- Sin SSR — todo es client-side rendering sobre `index.html`.

### [MOBILE] Capacitor
- Safe area ya gestionada en `capacitor-init.js` y `app-mobile.css`.
- Touch targets ≥ 44×44px.
- Tras cambios en `capacitor.config.ts` o plugins nativos: `pod install` en iOS.

---

## RESPONSE FORMAT

### Impact Analysis
> **Archivo(s):** [nombre]
> **Afecta:** [Core | Mapa | Mobile only | Admin]
> **Integridad:** [confirmar que no rompe web ni móvil]

### Code
*(ruta de archivo + implementación)*

### Sync Commands
```bash
# Cambios solo JS/CSS (rápido)
npm run build && npx cap sync

# Cambios con plugins nativos (lento)
npm run build && npx cap sync
cd ios && pod install && cd ..   # solo si cambiaron plugins
npx cap run ios
npx cap run android
```
