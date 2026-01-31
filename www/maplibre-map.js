/**
 * MapLibre GL JS - Inicialización del Mapa
 *
 * Reemplaza Google Maps con MapLibre GL JS
 * Soporta: PNOA, Terreno 3D, GeoJSON, Popups
 */

// ============================================
// VARIABLES GLOBALES
// ============================================
let mlMap = null;                    // Instancia del mapa MapLibre
let mlCurrentSchool = null;          // Escuela actualmente cargada
let mlRoutePopup = null;             // Popup para rutas
let mlUserMarker = null;             // Marcador de ubicación del usuario
let mlLoadedSources = new Set();     // Sources cargados
let mlIs3DEnabled = false;           // Estado del terreno 3D

// ============================================
// PALETA DE COLORES PARA SECTORES
// ============================================
// 20 colores vibrantes y distinguibles para sectores
const SECTOR_COLORS = [
  '#7ED957',  // Verde lima
  '#9B7EDE',  // Violeta
  '#FF6B9D',  // Rosa
  '#FFD93D',  // Amarillo
  '#6BCFFF',  // Azul cielo
  '#FF9F43',  // Naranja
  '#54E346',  // Verde brillante
  '#FF6B6B',  // Rojo coral
  '#4ECDC4',  // Turquesa
  '#A8E6CF',  // Verde menta
  '#DDA0DD',  // Ciruela
  '#87CEEB',  // Azul claro
  '#F0E68C',  // Khaki
  '#FF7F50',  // Coral
  '#98D8C8',  // Verde agua
  '#F7DC6F',  // Amarillo suave
  '#BB8FCE',  // Púrpura claro
  '#85C1E9',  // Azul pastel
  '#F8B500',  // Dorado
  '#2ECC71'   // Esmeralda
];

/**
 * Oscurece un color hex para crear el casing
 */
function darkenColor(hex, amount = 0.4) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.floor((num >> 16) * (1 - amount)));
  const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - amount)));
  const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - amount)));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

/**
 * Genera expresión MapLibre para colores de sectores basada en FID
 */
function generateSectorColorExpression() {
  // Usamos el operador % para ciclar a través de los colores
  // ['%', ['get', 'fid'], 20] obtiene el índice del color
  const cases = [];
  for (let i = 0; i < SECTOR_COLORS.length; i++) {
    cases.push(['==', ['%', ['to-number', ['get', 'fid']], SECTOR_COLORS.length], i]);
    cases.push(SECTOR_COLORS[i]);
  }
  cases.push(SECTOR_COLORS[0]); // default
  return ['case', ...cases];
}

/**
 * Genera expresión MapLibre para colores de casing (oscurecidos)
 */
function generateSectorCasingColorExpression() {
  const cases = [];
  for (let i = 0; i < SECTOR_COLORS.length; i++) {
    cases.push(['==', ['%', ['to-number', ['get', 'fid']], SECTOR_COLORS.length], i]);
    cases.push(darkenColor(SECTOR_COLORS[i]));
  }
  cases.push(darkenColor(SECTOR_COLORS[0])); // default
  return ['case', ...cases];
}

// ============================================
// CONFIGURACIÓN DE GESTOS TÁCTILES
// ============================================

// Estado del pinch-to-zoom + rotación
let pinch = {
  active: false,
  startDist: 0,
  startZoom: 0,
  startAngle: 0,
  startBearing: 0,
  focalLngLat: null
};

// Flag para saber si los handlers personalizados están activos
let customTouchHandlersActive = false;

// Referencias a los handlers para poder removerlos
let touchHandlers = {
  onTouchStart: null,
  onTouchMove: null,
  onTouchEnd: null
};

// Funciones auxiliares para gestos
function getTouchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTouchCenter(t1, t2, rect) {
  return {
    x: (t1.clientX + t2.clientX) / 2 - rect.left,
    y: (t1.clientY + t2.clientY) / 2 - rect.top
  };
}

function getTouchAngle(t1, t2) {
  return Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180 / Math.PI;
}

/**
 * Configura los gestos táctiles del mapa.
 *
 * Pinch-to-zoom manual con ROTACIÓN habilitada para iOS WebView.
 * Rotación disponible en cualquier parte del mapa (con y sin 3D).
 */
function setupTouchZoomFix() {
  if (!mlMap) return;

  const canvas = mlMap.getCanvas();

  // ===== VISTA 2D INICIAL =====
  mlMap.setPitch(0);
  mlMap.setBearing(0);
  mlMap.setMaxPitch(0);

  // ===== CONFIGURAR HANDLERS =====
  mlMap.touchZoomRotate.disable();
  mlMap.touchPitch.disable();
  mlMap.dragRotate.disable();
  mlMap.dragPan.enable();

  // Crear handlers
  touchHandlers.onTouchStart = function (e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      mlMap.dragPan.disable();

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const rect = canvas.getBoundingClientRect();
      const center = getTouchCenter(t1, t2, rect);

      pinch.active = true;
      pinch.startDist = getTouchDist(t1, t2);
      pinch.startZoom = mlMap.getZoom();
      pinch.startAngle = getTouchAngle(t1, t2);
      pinch.startBearing = mlMap.getBearing();
      pinch.focalLngLat = mlMap.unproject([center.x, center.y]);
    }
  };

  touchHandlers.onTouchMove = function (e) {
    if (!pinch.active || e.touches.length !== 2) return;
    e.preventDefault();

    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const rect = canvas.getBoundingClientRect();
    const currentDist = getTouchDist(t1, t2);
    const currentCenter = getTouchCenter(t1, t2, rect);
    const currentAngle = getTouchAngle(t1, t2);

    // Calcular nuevo zoom
    const scale = currentDist / pinch.startDist;
    const newZoom = Math.max(
      mlMap.getMinZoom(),
      Math.min(mlMap.getMaxZoom(), pinch.startZoom + Math.log2(scale))
    );

    // Calcular nueva rotación (bearing)
    const angleDelta = currentAngle - pinch.startAngle;
    const newBearing = pinch.startBearing - angleDelta;

    // Aplicar zoom y rotación centrado en el punto focal
    mlMap.jumpTo({
      zoom: newZoom,
      bearing: newBearing,
      around: pinch.focalLngLat
    });

    // Ajustar pan para seguir los dedos
    const focalScreen = mlMap.project(pinch.focalLngLat);
    const offsetX = currentCenter.x - focalScreen.x;
    const offsetY = currentCenter.y - focalScreen.y;

    if (Math.abs(offsetX) > 0.5 || Math.abs(offsetY) > 0.5) {
      const mapCenter = mlMap.project(mlMap.getCenter());
      const newCenter = mlMap.unproject([
        mapCenter.x - offsetX,
        mapCenter.y - offsetY
      ]);
      mlMap.setCenter(newCenter);
    }
  };

  touchHandlers.onTouchEnd = function (e) {
    if (pinch.active && e.touches.length < 2) {
      pinch.active = false;
      mlMap.dragPan.enable();
    }
  };

  // Añadir handlers personalizados
  enableCustomTouchHandlers();

  console.log('Gestos iOS: pinch-to-zoom + rotación activos');
}

/**
 * Habilita los handlers táctiles personalizados (para modo 2D)
 */
function enableCustomTouchHandlers() {
  if (customTouchHandlersActive || !mlMap) return;

  const canvas = mlMap.getCanvas();
  canvas.addEventListener('touchstart', touchHandlers.onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', touchHandlers.onTouchMove, { passive: false });
  canvas.addEventListener('touchend', touchHandlers.onTouchEnd, { passive: true });
  canvas.addEventListener('touchcancel', touchHandlers.onTouchEnd, { passive: true });

  customTouchHandlersActive = true;
  console.log('[Touch] Handlers personalizados habilitados');
}

/**
 * Deshabilita los handlers táctiles personalizados (para modo 3D nativo)
 */
function disableCustomTouchHandlers() {
  if (!customTouchHandlersActive || !mlMap) return;

  const canvas = mlMap.getCanvas();
  canvas.removeEventListener('touchstart', touchHandlers.onTouchStart);
  canvas.removeEventListener('touchmove', touchHandlers.onTouchMove);
  canvas.removeEventListener('touchend', touchHandlers.onTouchEnd);
  canvas.removeEventListener('touchcancel', touchHandlers.onTouchEnd);

  // Resetear estado del pinch
  pinch.active = false;

  customTouchHandlersActive = false;
  console.log('[Touch] Handlers personalizados deshabilitados');
}

// ============================================
// INICIALIZACIÓN PRINCIPAL
// ============================================

/**
 * Inicializa el mapa MapLibre
 * Esta función reemplaza a initMap() de Google Maps
 */
function initMapLibre() {
  console.log('Iniciando MapLibre GL JS...');

  // Verificar que MapLibre está cargado
  if (typeof maplibregl === 'undefined') {
    console.error('MapLibre GL JS no está cargado');
    return;
  }

  // Crear el mapa
  mlMap = new maplibregl.Map({
    container: 'map',
    style: createBaseStyle(),
    center: MAP_DEFAULTS.center,
    zoom: MAP_DEFAULTS.zoom,
    minZoom: MAP_DEFAULTS.minZoom,
    maxZoom: MAP_DEFAULTS.maxZoom,
    pitch: 0,             // Sin inclinación inicial
    bearing: 0,           // Sin rotación inicial
    maxPitch: 0,          // BLOQUEADO: Se cambia dinámicamente en zoom >= 14
    attributionControl: true,
    hash: false,
    touchPitch: false,    // DESACTIVADO: Se activa solo en zoom >= 14
    dragRotate: false     // DESACTIVADO: Se activa solo en zoom >= 14
  });

  // Añadir controles
  addMapControls();

  // Crear popup reutilizable
  mlRoutePopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    maxWidth: '340px',
    className: 'ml-route-popup'
  });

  // Eventos cuando el mapa esté listo
  mlMap.on('load', onMapLoad);

  // Evento de error
  mlMap.on('error', (e) => {
    console.error('Error en MapLibre:', e.error);
  });

  // Exponer globalmente para compatibilidad
  window.mlMap = mlMap;

  console.log('MapLibre inicializado correctamente');
}

/**
 * Crea el estilo base del mapa con PNOA
 */
function createBaseStyle() {
  return {
    version: 8,
    name: 'KRUX Base',
    sources: {
      // Capa base: PNOA via WMTS (más compatible que TMS)
      'pnoa-source': {
        type: 'raster',
        tiles: [
          'https://www.ign.es/wmts/pnoa-ma?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=OI.OrthoimageCoverage&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg'
        ],
        tileSize: 256,
        attribution: '© <a href="https://www.ign.es">IGN España</a> - PNOA',
        maxzoom: 20
      },
      // Etiquetas CartoDB
      'labels-source': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        attribution: TILE_SOURCES.labels.attribution,
        maxzoom: 20
      }
    },
    layers: [
      // Capa PNOA
      {
        id: 'pnoa-layer',
        type: 'raster',
        source: 'pnoa-source',
        minzoom: 0,
        maxzoom: 22
      },
      // Capa de etiquetas (encima de todo)
      {
        id: 'labels-layer',
        type: 'raster',
        source: 'labels-source',
        minzoom: 10,
        maxzoom: 22,
        paint: {
          'raster-opacity': 0.9
        }
      }
    ],
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
  };
}

/**
 * Añade controles al mapa
 */
function addMapControls() {
  // Control de navegación (zoom + rotación)
  mlMap.addControl(new maplibregl.NavigationControl({
    visualizePitch: true
  }), 'bottom-right');

  // Control de escala
  mlMap.addControl(new maplibregl.ScaleControl({
    maxWidth: 150,
    unit: 'metric'
  }), 'bottom-left');

  // Control de geolocalización
  const geolocateControl = new maplibregl.GeolocateControl({
    positionOptions: {
      enableHighAccuracy: true
    },
    trackUserLocation: true,
    showUserHeading: true
  });
  mlMap.addControl(geolocateControl, 'bottom-right');
}

// Estado del modo 3D
let is3DMode = false;
const MIN_ZOOM_FOR_3D = 14;
const MAX_PITCH_3D = 80; // Inclinación máxima en modo 3D (85%)

// Zoom mínimo para cargar geometrías automáticamente
const MIN_ZOOM_FOR_AUTO_LOAD = 12;

/**
 * Obtiene el ID de la escuela más cercana al centro del mapa
 * @returns {string|null} ID de la escuela o null si no hay ninguna cerca
 */
function getSchoolAtCurrentPosition() {
  if (!mlMap) return null;

  const center = mlMap.getCenter();
  const zoom = mlMap.getZoom();

  // Si zoom es menor al mínimo, no detectar escuelas
  if (zoom < MIN_ZOOM_FOR_AUTO_LOAD) return null;

  let closestSchool = null;
  let closestDistance = Infinity;

  // Umbral de proximidad dinámico basado en el zoom
  // A zoom 12: threshold más grande (~5km) para detectar escuelas desde lejos
  // A zoom 16+: threshold más pequeño (~1km) para precisión
  const baseThreshold = 0.05; // ~5km a zoom bajo
  const zoomFactor = Math.max(0.2, 1 - (zoom - MIN_ZOOM_FOR_AUTO_LOAD) * 0.1);
  const threshold = baseThreshold * zoomFactor;

  // Verificar proximidad a cada escuela configurada
  for (const schoolId in MAPLIBRE_SCHOOLS) {
    const school = MAPLIBRE_SCHOOLS[schoolId];
    const schoolCenter = school.center; // [lng, lat]

    // Calcular distancia aproximada en grados
    const dLng = Math.abs(center.lng - schoolCenter[0]);
    const dLat = Math.abs(center.lat - schoolCenter[1]);
    const distance = Math.sqrt(dLng * dLng + dLat * dLat);

    if (distance < threshold && distance < closestDistance) {
      closestSchool = schoolId;
      closestDistance = distance;
    }
  }

  console.log(`[AutoLoad] Zoom: ${zoom.toFixed(1)}, Threshold: ${threshold.toFixed(4)}, Escuela cercana: ${closestSchool || 'ninguna'}`);
  return closestSchool;
}

/**
 * Carga automáticamente las geometrías de una escuela cuando el usuario
 * hace zoom manual hacia ella
 */
function checkAndLoadSchoolOnZoom() {
  const nearbySchoolId = getSchoolAtCurrentPosition();

  // Si no hay escuela cerca, limpiar si había una cargada
  if (!nearbySchoolId) {
    // Solo limpiar si el zoom es bajo (el usuario se alejó)
    if (mlCurrentSchool && mlMap.getZoom() < MIN_ZOOM_FOR_AUTO_LOAD) {
      console.log('[AutoLoad] Usuario alejado de escuela, limpiando capas');
      mlClearSchoolLayers();
      mlCurrentSchool = null;
    }
    return;
  }

  // Si ya está cargada esta escuela, no hacer nada
  if (mlCurrentSchool === nearbySchoolId) {
    return;
  }

  // Cargar la nueva escuela (skipFlyTo = true para no mover el mapa)
  console.log(`[AutoLoad] Detectada escuela cercana: ${nearbySchoolId}, cargando geometrías...`);
  mlLoadSchool(nearbySchoolId, true);

  // Actualizar variables globales
  if (typeof window.currentSchoolId !== 'undefined') {
    window.currentSchoolId = nearbySchoolId;
  }
  const school = MAPLIBRE_SCHOOLS[nearbySchoolId];
  if (school && typeof window.currentSchoolName !== 'undefined') {
    window.currentSchoolName = school.name;
  }
}

/**
 * Verifica si el centro del mapa está cerca de alguna escuela
 * @returns {boolean} true si está cerca de una escuela
 */
function isNearSchool() {
  if (!mlMap) return false;

  const center = mlMap.getCenter();
  const zoom = mlMap.getZoom();

  // Si zoom es menor a MIN_ZOOM_FOR_3D, no está "cerca"
  if (zoom < MIN_ZOOM_FOR_3D) return false;

  // Verificar proximidad a cada escuela configurada
  for (const schoolId in MAPLIBRE_SCHOOLS) {
    const school = MAPLIBRE_SCHOOLS[schoolId];
    const schoolCenter = school.center; // [lng, lat]

    // Calcular distancia aproximada en grados
    const dLng = Math.abs(center.lng - schoolCenter[0]);
    const dLat = Math.abs(center.lat - schoolCenter[1]);

    // Umbral de proximidad (~2km aprox dependiendo de latitud)
    const threshold = 0.02;

    if (dLng < threshold && dLat < threshold) {
      return true;
    }
  }

  // También considerar "cerca" si hay una escuela cargada
  return mlCurrentSchool !== null;
}

/**
 * Añade botón de toggle 3D al mapa
 * Funciona tanto en web como en apps nativas (iOS/Android)
 */
function add3DToggleButton() {
  // Verificar si el botón ya existe para evitar duplicados
  if (document.getElementById('btn-3d-toggle')) {
    console.log('[3D] Botón 3D ya existe, omitiendo creación');
    return;
  }

  const isNative = window.Capacitor !== undefined;

  const btn = document.createElement('button');
  btn.id = 'btn-3d-toggle';
  btn.className = 'map-control-btn';
  btn.innerHTML = '3D';
  btn.title = 'Activar vista 3D';

  // Estilo que coincide con los controles nativos de MapLibre
  // Posición: encima del botón de ubicación (bottom-right)
  btn.style.cssText = `
    position: absolute;
    bottom: ${isNative ? '250px' : '250px'};
    right: 10px;
    width: 36px;
    height: 36px;
    background: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #333;
    cursor: pointer;
    z-index: 1000;
    display: none;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  `;

  btn.addEventListener('click', toggle3DMode);

  document.getElementById('map').appendChild(btn);

  // Mostrar/ocultar según proximidad a escuela
  mlMap.on('zoom', update3DButtonVisibility);
  mlMap.on('zoomend', update3DButtonVisibility);
  mlMap.on('moveend', update3DButtonVisibility);
  update3DButtonVisibility();

  // Auto-cargar geometrías de escuela al hacer zoom manual
  mlMap.on('moveend', checkAndLoadSchoolOnZoom);
  mlMap.on('zoomend', checkAndLoadSchoolOnZoom);

  console.log('[3D] Botón 3D añadido' + (isNative ? ' (móvil nativo)' : ' (web)'));
}

/**
 * Añade botón de creador de vías al mapa (solo admins)
 * Se posiciona encima del botón 3D, visible cuando hay sector seleccionado
 */
function addRouteCreatorButton() {
  // Verificar si el botón ya existe para evitar duplicados
  if (document.getElementById('btn-route-creator')) {
    console.log('[RouteCreator] Botón ya existe, omitiendo creación');
    return;
  }

  const isNative = window.Capacitor !== undefined;

  const btn = document.createElement('button');
  btn.id = 'btn-route-creator';
  btn.className = 'map-control-btn';
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>`;
  btn.title = 'Dibujar vías en el sector';

  // Posición: encima del botón 3D (bottom + altura del 3D + gap)
  btn.style.cssText = `
    position: absolute;
    bottom: ${isNative ? '295px' : '295px'};
    right: 10px;
    width: 36px;
    height: 36px;
    background: #10b981;
    border: none;
    border-radius: 8px;
    color: white;
    cursor: pointer;
    z-index: 1000;
    display: none;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  `;

  // En móvil, usar touchend para respuesta inmediata
  // En web, usar click normal
  if (isNative) {
    let touchHandled = false;
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!touchHandled) {
        touchHandled = true;
        console.log('[RouteCreator] Touch detectado en móvil');
        openRouteCreatorForCurrentSector();
        // Reset después de un breve delay para evitar doble disparo
        setTimeout(() => { touchHandled = false; }, 300);
      }
    });
  } else {
    btn.addEventListener('click', openRouteCreatorForCurrentSector);
  }

  document.getElementById('map').appendChild(btn);

  // Mostrar/ocultar según sector seleccionado y si es admin
  mlMap.on('zoom', updateRouteCreatorButtonVisibility);
  mlMap.on('zoomend', updateRouteCreatorButtonVisibility);
  mlMap.on('moveend', updateRouteCreatorButtonVisibility);

  console.log('[RouteCreator] Botón creador de vías añadido' + (isNative ? ' (móvil nativo)' : ' (web)'));
}

/**
 * Actualiza visibilidad del botón creador de vías
 * Solo visible cuando: (1) hay sector seleccionado, (2) usuario es admin, (3) zoom >= umbral de 3D
 */
async function updateRouteCreatorButtonVisibility() {
  const btn = document.getElementById('btn-route-creator');
  if (!btn) return;

  const nearSchool = isNearSchool();

  if (nearSchool) {
    // Verificar si es admin
    const isAdmin = await checkIsAdmin();
    if (isAdmin) {
      btn.style.display = 'flex';
    } else {
      btn.style.display = 'none';
    }
  } else {
    btn.style.display = 'none';
  }
}

/**
 * Verifica si el usuario actual es admin (caché para evitar llamadas repetidas)
 */
let _cachedIsAdmin = null;
let _cachedAdminCheckTime = 0;
const ADMIN_CACHE_DURATION = 60000; // 1 minuto

async function checkIsAdmin() {
  const now = Date.now();

  // Usar caché si está disponible y no ha expirado
  if (_cachedIsAdmin !== null && (now - _cachedAdminCheckTime) < ADMIN_CACHE_DURATION) {
    return _cachedIsAdmin;
  }

  try {
    if (typeof auth === 'undefined' || !auth.currentUser) {
      _cachedIsAdmin = false;
      _cachedAdminCheckTime = now;
      return false;
    }

    const adminDoc = await db.collection('admins').doc(auth.currentUser.uid).get();
    _cachedIsAdmin = adminDoc.exists && adminDoc.data().role === 'admin';
    _cachedAdminCheckTime = now;
    return _cachedIsAdmin;
  } catch (error) {
    console.error('[RouteCreator] Error verificando admin:', error);
    _cachedIsAdmin = false;
    _cachedAdminCheckTime = now;
    return false;
  }
}

/**
 * Abre el editor de vías para el sector actualmente visible
 */
async function openRouteCreatorForCurrentSector() {
  console.log('[RouteCreator] Función openRouteCreatorForCurrentSector iniciada');
  console.log('[RouteCreator] mlCurrentSchool:', mlCurrentSchool);

  if (!mlCurrentSchool) {
    console.warn('[RouteCreator] No hay escuela seleccionada');
    return;
  }

  // Verificar si es admin
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    if (typeof showRDToast === 'function') {
      showRDToast('Solo los administradores pueden dibujar vías', 'error');
    }
    return;
  }

  // Obtener el sector más cercano al centro del mapa
  const center = mlMap.getCenter();
  const sectorName = await findNearestSector(mlCurrentSchool, center.lng, center.lat);

  if (!sectorName) {
    if (typeof showRDToast === 'function') {
      showRDToast('No se encontró ningún sector cercano', 'error');
    } else {
      alert('No se encontró ningún sector cercano');
    }
    return;
  }

  // Verificar que existe imagen del sector
  const hasImage = await sectorHasImage(mlCurrentSchool, sectorName);
  if (!hasImage) {
    if (typeof showRDToast === 'function') {
      showRDToast(`El sector "${sectorName}" no tiene imagen. Sube una imagen primero.`, 'error');
    } else {
      alert(`El sector "${sectorName}" no tiene imagen. Sube una imagen primero.`);
    }
    return;
  }

  // Abrir el editor de dibujo
  if (typeof openRouteDrawingEditor === 'function') {
    openRouteDrawingEditor(mlCurrentSchool, sectorName);
  } else {
    console.error('[RouteCreator] openRouteDrawingEditor no está disponible');
  }
}

/**
 * Encuentra el sector más cercano a una coordenada
 */
async function findNearestSector(schoolId, lng, lat) {
  try {
    const school = MAPLIBRE_SCHOOLS[schoolId];
    if (!school || !school.geojson || !school.geojson.sectores) {
      return null;
    }

    const response = await fetch(school.geojson.sectores + '?v=' + Date.now());
    if (!response.ok) return null;

    const geojson = await response.json();
    if (!geojson.features || geojson.features.length === 0) return null;

    let nearestSector = null;
    let minDistance = Infinity;

    for (const feature of geojson.features) {
      if (!feature.geometry || !feature.geometry.coordinates) continue;

      // Para polígonos, usar el centroide
      let sectorLng, sectorLat;
      if (feature.geometry.type === 'Polygon') {
        const coords = feature.geometry.coordinates[0];
        sectorLng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
        sectorLat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
      } else if (feature.geometry.type === 'Point') {
        sectorLng = feature.geometry.coordinates[0];
        sectorLat = feature.geometry.coordinates[1];
      } else {
        continue;
      }

      const distance = Math.sqrt(
        Math.pow(lng - sectorLng, 2) + Math.pow(lat - sectorLat, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestSector = feature.properties.nombre || feature.properties.name;
      }
    }

    return nearestSector;
  } catch (error) {
    console.error('[RouteCreator] Error buscando sector:', error);
    return null;
  }
}

/**
 * Actualiza visibilidad del botón 3D según proximidad a escuela
 */
function update3DButtonVisibility() {
  const btn = document.getElementById('btn-3d-toggle');
  if (!btn) return;

  const nearSchool = isNearSchool();

  if (nearSchool) {
    btn.style.display = 'flex';
  } else {
    btn.style.display = 'none';
    // Si nos alejamos de la escuela, desactivar 3D
    if (is3DMode) {
      disable3DMode();
    }
  }

  // También actualizar el botón de creador de vías
  updateRouteCreatorButtonVisibility();
}

/**
 * Toggle modo 3D
 */
function toggle3DMode() {
  if (is3DMode) {
    disable3DMode();
  } else {
    enable3DMode();
  }
}

/**
 * Activa el modo 3D con vista inclinada
 * - Deshabilita handlers personalizados de pinch
 * - Habilita handlers nativos de MapLibre para pitch, zoom y rotación
 * - Permite inclinación hasta MAX_PITCH_3D (85%)
 */
function enable3DMode() {
  if (!isNearSchool()) return;

  is3DMode = true;

  // 1. DESHABILITAR handlers personalizados (para que no interfieran)
  disableCustomTouchHandlers();

  // 2. Configurar máximo pitch (85%)
  mlMap.setMaxPitch(MAX_PITCH_3D);

  // 3. HABILITAR handlers nativos de MapLibre para 3D
  mlMap.touchZoomRotate.enable();
  mlMap.touchPitch.enable();
  mlMap.dragRotate.enable();
  mlMap.dragPan.enable();

  // 4. Animar a vista 3D inicial
  mlMap.easeTo({
    pitch: 50,
    bearing: mlMap.getBearing(),
    duration: 500
  });

  const btn = document.getElementById('btn-3d-toggle');
  if (btn) {
    btn.style.background = '#4A90D9';
    btn.style.color = 'white';
    btn.title = 'Desactivar vista 3D';
  }

  console.log('[3D] Modo 3D activado - handlers nativos de MapLibre habilitados');
}

/**
 * Desactiva el modo 3D, vuelve a vista plana
 * - Deshabilita handlers nativos de MapLibre
 * - Restaura handlers personalizados de pinch-to-zoom
 * - Bloquea pitch
 */
function disable3DMode() {
  is3DMode = false;

  // 1. Animar vuelta a vista 2D
  mlMap.easeTo({
    pitch: 0,
    bearing: 0,
    duration: 500
  });

  // 2. Esperar a que termine la animación para restaurar handlers
  setTimeout(() => {
    if (!is3DMode) {
      // 3. Bloquear pitch
      mlMap.setMaxPitch(0);

      // 4. DESHABILITAR handlers nativos de 3D
      mlMap.touchZoomRotate.disable();
      mlMap.touchPitch.disable();
      mlMap.dragRotate.disable();

      // 5. RESTAURAR handlers personalizados
      enableCustomTouchHandlers();
      mlMap.dragPan.enable();
    }
  }, 550);

  const btn = document.getElementById('btn-3d-toggle');
  if (btn) {
    btn.style.background = 'white';
    btn.style.color = '#333';
    btn.title = 'Activar vista 3D';
  }

  console.log('[3D] Modo 3D desactivado - handlers personalizados restaurados');
}

/**
 * Callback cuando el mapa está listo
 */
function onMapLoad() {
  console.log('Mapa MapLibre cargado');

  // FIX: Configurar pinch-to-zoom para que el zoom se centre en el punto del gesto
  // Esto reemplaza el handler nativo de MapLibre que causa el "avance" del mapa
  setupTouchZoomFix();

  // Añadir botón de toggle 3D
  add3DToggleButton();

  // Botón de creador de vías desactivado
  // addRouteCreatorButton();

  // Añadir terreno 3D si hay API key de MapTiler
  if (MAPLIBRE_CONFIG.MAPTILER_KEY && MAPLIBRE_CONFIG.MAPTILER_KEY !== 'get_your_own_key') {
    add3DTerrain();
  } else {
    console.warn('Sin API key de MapTiler - Terreno 3D desactivado');
  }

  // Cargar icono de parking
  loadParkingIcon();

  // Cargar icono de tick para vías completadas
  loadAscentTickIcon();

  // Configurar actualización de ticks de ascensos
  setupAscentTicksUpdater();

  // Cargar markers de escuelas (vista general)
  loadSchoolMarkers();

  // NO cargar escuela por defecto - el usuario selecciona desde markers
  // mlLoadSchool('valeria');

  // Activar botón de centrar mapa (Spain Reset)
  setupResetViewButton();

  // Notificar que el mapa está listo
  window.dispatchEvent(new CustomEvent('maplibre:ready', { detail: { map: mlMap } }));
}

// ============================================
// TERRENO 3D
// ============================================

/**
 * Añade terreno 3D al mapa
 * Funciona tanto en web como en apps nativas (iOS/Android)
 */
function add3DTerrain() {
  if (!MAPLIBRE_CONFIG.MAPTILER_KEY || MAPLIBRE_CONFIG.MAPTILER_KEY === 'get_your_own_key') {
    console.warn('Necesitas una API key de MapTiler para el terreno 3D');
    return;
  }

  try {
    // Añadir fuente de terreno
    mlMap.addSource('terrain-source', {
      type: 'raster-dem',
      url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPLIBRE_CONFIG.MAPTILER_KEY}`,
      tileSize: 256
    });

    // Activar terreno
    mlMap.setTerrain({
      source: 'terrain-source',
      exaggeration: MAP_DEFAULTS.terrain.exaggeration
    });

    // Añadir capa de sombreado (hillshade)
    mlMap.addLayer({
      id: 'hillshade-layer',
      type: 'hillshade',
      source: 'terrain-source',
      paint: {
        'hillshade-exaggeration': 0.3,
        'hillshade-shadow-color': '#000000',
        'hillshade-highlight-color': '#ffffff'
      }
    }, 'pnoa-layer'); // Insertar debajo del PNOA

    mlIs3DEnabled = true;
    console.log('Terreno 3D activado');

  } catch (error) {
    console.error('Error al añadir terreno 3D:', error);
  }
}

/**
 * ============================================
 * CONTROL DE CÁMARA 3D POR GESTOS
 * ============================================
 * Cuando el modo 3D está activo, el drag controla:
 * - Vertical → Pitch (inclinación, máx 80°)
 * - Horizontal → Bearing (rotación, 360° libre)
 */

// Variables para el handler 3D
let ml3DModeActive = false;       // ¿Modo 3D activo?
let ml3DDragActive = false;       // ¿Arrastrando en modo 3D?
let ml3DStartX = 0;               // Posición inicial X
let ml3DStartY = 0;               // Posición inicial Y
let ml3DStartPitch = 0;           // Pitch al iniciar drag
let ml3DStartBearing = 0;         // Bearing al iniciar drag

// Sensibilidad del control (ajustar al gusto)
const ML3D_PITCH_SENSITIVITY = 0.5;    // Grados por píxel vertical
const ML3D_BEARING_SENSITIVITY = 0.5;  // Grados por píxel horizontal
const ML3D_MAX_PITCH = 80;             // Límite máximo de pitch

/**
 * Toggle terreno 3D con control por gestos
 */
function mlToggle3D() {
  if (!mlMap) return;

  ml3DModeActive = !ml3DModeActive;

  if (ml3DModeActive) {
    // Activar modo 3D
    console.log('🏔️ Modo 3D activado - Arrastra para controlar cámara');

    // Desactivar controles nativos de drag
    mlMap.dragRotate.disable();
    mlMap.dragPan.disable();

    // Activar handlers personalizados
    ml3DEnableHandlers();

    // Animar a vista inicial 3D
    mlMap.easeTo({
      pitch: 45,
      duration: 600
    });

  } else {
    // Desactivar modo 3D
    console.log('🗺️ Modo 2D activado - Control nativo');

    // Restaurar controles nativos
    mlMap.dragRotate.enable();
    mlMap.dragPan.enable();

    // Desactivar handlers personalizados
    ml3DDisableHandlers();

    // Volver a vista cenital
    mlMap.easeTo({
      pitch: 0,
      bearing: 0,
      duration: 600
    });
  }

  // Actualizar estado visual del botón (si existe)
  const btn3D = document.querySelector('.ml-terrain-btn, #btn-3d, [data-action="toggle3d"]');
  if (btn3D) {
    btn3D.classList.toggle('active', ml3DModeActive);
  }
}

/**
 * Activa los handlers de touch/mouse para control 3D
 */
function ml3DEnableHandlers() {
  const canvas = mlMap.getCanvas();

  // Touch events (móvil)
  canvas.addEventListener('touchstart', ml3DTouchStart, { passive: false });
  canvas.addEventListener('touchmove', ml3DTouchMove, { passive: false });
  canvas.addEventListener('touchend', ml3DTouchEnd, { passive: true });

  // Mouse events (desktop)
  canvas.addEventListener('mousedown', ml3DMouseDown);
  canvas.addEventListener('mousemove', ml3DMouseMove);
  canvas.addEventListener('mouseup', ml3DMouseUp);
  canvas.addEventListener('mouseleave', ml3DMouseUp);
}

/**
 * Desactiva los handlers de touch/mouse
 */
function ml3DDisableHandlers() {
  const canvas = mlMap.getCanvas();

  canvas.removeEventListener('touchstart', ml3DTouchStart);
  canvas.removeEventListener('touchmove', ml3DTouchMove);
  canvas.removeEventListener('touchend', ml3DTouchEnd);

  canvas.removeEventListener('mousedown', ml3DMouseDown);
  canvas.removeEventListener('mousemove', ml3DMouseMove);
  canvas.removeEventListener('mouseup', ml3DMouseUp);
  canvas.removeEventListener('mouseleave', ml3DMouseUp);
}

// ============================================
// HANDLERS TOUCH (Móvil)
// ============================================

function ml3DTouchStart(e) {
  if (!ml3DModeActive || e.touches.length !== 1) return;

  e.preventDefault();
  ml3DDragActive = true;

  ml3DStartX = e.touches[0].clientX;
  ml3DStartY = e.touches[0].clientY;
  ml3DStartPitch = mlMap.getPitch();
  ml3DStartBearing = mlMap.getBearing();
}

function ml3DTouchMove(e) {
  if (!ml3DDragActive || !ml3DModeActive) return;

  e.preventDefault();

  const deltaX = e.touches[0].clientX - ml3DStartX;
  const deltaY = e.touches[0].clientY - ml3DStartY;

  // Calcular nuevos valores
  // Drag hacia arriba (deltaY negativo) = aumentar pitch
  // Drag hacia derecha (deltaX positivo) = aumentar bearing
  let newPitch = ml3DStartPitch - (deltaY * ML3D_PITCH_SENSITIVITY);
  let newBearing = ml3DStartBearing + (deltaX * ML3D_BEARING_SENSITIVITY);

  // Limitar pitch entre 0 y máximo
  newPitch = Math.max(0, Math.min(ML3D_MAX_PITCH, newPitch));

  // Aplicar cambios sin animación (respuesta inmediata)
  mlMap.jumpTo({
    pitch: newPitch,
    bearing: newBearing
  });
}

function ml3DTouchEnd() {
  ml3DDragActive = false;
}

// ============================================
// HANDLERS MOUSE (Desktop)
// ============================================

function ml3DMouseDown(e) {
  if (!ml3DModeActive || e.button !== 0) return; // Solo botón izquierdo

  e.preventDefault();
  ml3DDragActive = true;

  ml3DStartX = e.clientX;
  ml3DStartY = e.clientY;
  ml3DStartPitch = mlMap.getPitch();
  ml3DStartBearing = mlMap.getBearing();
}

function ml3DMouseMove(e) {
  if (!ml3DDragActive || !ml3DModeActive) return;

  const deltaX = e.clientX - ml3DStartX;
  const deltaY = e.clientY - ml3DStartY;

  let newPitch = ml3DStartPitch - (deltaY * ML3D_PITCH_SENSITIVITY);
  let newBearing = ml3DStartBearing + (deltaX * ML3D_BEARING_SENSITIVITY);

  newPitch = Math.max(0, Math.min(ML3D_MAX_PITCH, newPitch));

  mlMap.jumpTo({
    pitch: newPitch,
    bearing: newBearing
  });
}

function ml3DMouseUp() {
  ml3DDragActive = false;
}

// Exponer estado para uso externo
window.ml3DModeActive = () => ml3DModeActive;

// ============================================
// CARGA DE ESCUELAS
// ============================================

/**
 * Carga una escuela (Vector Tiles o GeoJSON)
 * @param {string} schoolId - ID de la escuela
 * @param {boolean} skipFlyTo - Si es true, no hace flyTo (útil cuando ya se hizo antes)
 */
async function mlLoadSchool(schoolId, skipFlyTo = false) {
  const school = MAPLIBRE_SCHOOLS[schoolId];
  if (!school) {
    console.error('Escuela no encontrada:', schoolId);
    return;
  }

  console.log(`Cargando escuela: ${school.name}`);

  // Limpiar capas anteriores
  mlClearSchoolLayers();

  mlCurrentSchool = schoolId;

  // Decidir si usar Vector Tiles o GeoJSON
  const useVectorTiles = typeof USE_VECTOR_TILES !== 'undefined' && USE_VECTOR_TILES && school.tiles;

  try {
    if (useVectorTiles) {
      console.log('Usando Vector Tiles para mejor rendimiento');
      await mlLoadSchoolVectorTiles(school);
    } else {
      console.log('Usando GeoJSON (fallback)');
      await mlLoadSchoolGeoJSON(school);
    }

    // Centrar mapa en la escuela (solo si no se omitió)
    if (!skipFlyTo) {
      mlMap.flyTo({
        center: school.center,
        essential: true
      });
    }

    console.log(`Escuela ${school.name} cargada correctamente`);

  } catch (error) {
    console.error('Error cargando escuela:', error);
    // Fallback a GeoJSON si falla Vector Tiles
    if (useVectorTiles) {
      console.log('Fallback a GeoJSON...');
      await mlLoadSchoolGeoJSON(school);
    }
  }
}

/**
 * Carga escuela usando Vector Tiles (.pbf)
 */
async function mlLoadSchoolVectorTiles(school) {
  // Cargar sectores (líneas) con estilo casing (borde oscuro + línea principal)
  if (school.tiles.sectores) {
    mlMap.addSource('sectores-source', {
      type: 'vector',
      tiles: [window.location.origin + '/' + school.tiles.sectores],
      minzoom: school.zoomLevels.sectores,
      maxzoom: 20
    });
    mlLoadedSources.add('sectores-source');

    // Capa de casing (borde oscuro exterior) - color dinámico por sector
    mlMap.addLayer({
      id: 'sectores-casing-layer',
      type: 'line',
      source: 'sectores-source',
      'source-layer': 'sectores',
      minzoom: school.zoomLevels.sectores,
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': generateSectorCasingColorExpression(),
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          14, 6,
          16, 10,
          18, 14,
          20, 18
        ],
        'line-opacity': 0.9
      }
    });

    // Capa principal - color dinámico por sector
    mlMap.addLayer({
      id: 'sectores-layer',
      type: 'line',
      source: 'sectores-source',
      'source-layer': 'sectores',
      minzoom: school.zoomLevels.sectores,
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': generateSectorColorExpression(),
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          14, 4,
          16, 7,
          18, 10,
          20, 14
        ],
        'line-opacity': 1
      }
    });
  }

  // Cargar vías (círculos)
  if (school.tiles.vias) {
    mlMap.addSource('vias-source', {
      type: 'vector',
      tiles: [window.location.origin + '/' + school.tiles.vias],
      minzoom: school.zoomLevels.vias,
      maxzoom: 20
    });
    mlLoadedSources.add('vias-source');

    mlMap.addLayer({
      id: 'vias-layer',
      type: 'circle',
      source: 'vias-source',
      'source-layer': 'vias',
      minzoom: school.zoomLevels.vias,
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          14, isMobileDevice() ? 1.5 : 2,
          16, isMobileDevice() ? 2.5 : 3.5,
          18, isMobileDevice() ? 4 : 5.5,
          20, isMobileDevice() ? 6 : 9
        ],
        'circle-color': generateGradeColorExpression('grado1'),
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': isMobileDevice() ? 1 : 1.5,
        'circle-opacity': 0.95
      }
    });

    // Añadir interactividad
    setupViasInteraction();
    setupSectoresInteraction();
  }

  // Cargar parkings (símbolos)
  if (school.tiles.parkings) {
    mlMap.addSource('parkings-source', {
      type: 'vector',
      tiles: [window.location.origin + '/' + school.tiles.parkings],
      minzoom: school.zoomLevels.parkings,
      maxzoom: 20
    });
    mlLoadedSources.add('parkings-source');

    mlMap.addLayer({
      id: 'parkings-layer',
      type: 'symbol',
      source: 'parkings-source',
      'source-layer': 'parkings',
      minzoom: school.zoomLevels.parkings,
      layout: {
        'icon-image': 'parking-icon',
        'icon-size': 0.7,
        'icon-allow-overlap': true
      }
    });

    // Añadir interactividad a parkings
    setupParkingsInteraction();
  }
}

/**
 * Carga escuela usando GeoJSON (fallback)
 */
async function mlLoadSchoolGeoJSON(school) {
  // Cargar sectores con estilo casing
  if (school.geojson.sectores) {
    // Añadir timestamp para evitar caché
    const urlWithCache = `${school.geojson.sectores}?v=${Date.now()}`;

    try {
      const response = await fetch(urlWithCache);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const geojson = await response.json();

      // [FIX] Generar FIDs numéricos si no existen para permitir coloreado dinámico
      if (geojson.features) {
        geojson.features.forEach((f, i) => {
          if (f.properties.fid == null || f.properties.fid === '') {
            // Usar hash del nombre para mantener consistencia entre recargas
            const name = f.properties.nombre || f.properties.name || `sector-${i}`;
            let hash = 0;
            for (let j = 0; j < name.length; j++) {
              hash = ((hash << 5) - hash) + name.charCodeAt(j);
              hash |= 0;
            }
            f.properties.fid = Math.abs(hash);
          }
        });
      }

      // Añadir source
      mlMap.addSource('sectores-source', {
        type: 'geojson',
        data: geojson
      });
      mlLoadedSources.add('sectores-source');

      // Capa de casing (borde oscuro exterior) - color dinámico por sector
      mlMap.addLayer({
        id: 'sectores-casing-layer',
        type: 'line',
        source: 'sectores-source',
        minzoom: school.zoomLevels.sectores,
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': generateSectorCasingColorExpression(),
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            14, 6,
            16, 10,
            18, 14,
            20, 18
          ],
          'line-opacity': 0.9
        }
      });

      // Capa principal - color dinámico por sector
      mlMap.addLayer({
        id: 'sectores-layer',
        type: 'line',
        source: 'sectores-source',
        minzoom: school.zoomLevels.sectores,
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': generateSectorColorExpression(),
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            14, 4,
            16, 7,
            18, 10,
            20, 14
          ],
          'line-opacity': 1
        }
      });

      console.log(`Capa sectores cargada: ${geojson.features?.length || 0} elementos`);
    } catch (error) {
      console.error('Error cargando sectores:', error);
    }
  }

  // Cargar vías
  if (school.geojson.vias) {
    await mlLoadGeoJSONLayer(
      'vias',
      school.geojson.vias,
      'circle',
      {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          14, isMobileDevice() ? 2 : 3,
          16, isMobileDevice() ? 3.5 : 5,
          18, isMobileDevice() ? 5.5 : 8,
          20, isMobileDevice() ? 9 : 14
        ],
        'circle-color': generateGradeColorExpression('grado1'),
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': isMobileDevice() ? 1 : 1.5,
        'circle-opacity': 0.95
      },
      school.zoomLevels.vias
    );

    // Añadir interactividad a vías
    setupViasInteraction();
    setupSectoresInteraction();

    // Cargar vías aprobadas desde Firestore (usando el mismo minzoom que las vías oficiales)
    await loadApprovedRoutesFromFirestore(school.id, school.zoomLevels.vias);
  }

  // Cargar parkings
  if (school.geojson.parkings) {
    await mlLoadGeoJSONLayer(
      'parkings',
      school.geojson.parkings,
      'symbol',
      {},
      school.zoomLevels.parkings,
      {
        'icon-image': 'parking-icon',
        'icon-size': 0.7,
        'icon-allow-overlap': true
      }
    );

    // Añadir interactividad a parkings
    setupParkingsInteraction();
  }

  // Cargar rutas de acceso (línea naranja intermitente)
  if (school.geojson.rutasAcceso) {
    await mlLoadRutasAcceso(school.geojson.rutasAcceso);
  }
}

/**
 * Carga las rutas de acceso con estilo de línea naranja intermitente
 */
async function mlLoadRutasAcceso(url) {
  const sourceId = 'rutas-acceso-source';
  const layerId = 'rutas-acceso-layer';

  // Añadir timestamp para evitar caché
  const urlWithCache = `${url}?v=${Date.now()}`;

  try {
    const response = await fetch(urlWithCache);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const geojson = await response.json();

    // Añadir source
    if (mlMap.getSource(sourceId)) {
      mlMap.removeSource(sourceId);
    }
    mlMap.addSource(sourceId, {
      type: 'geojson',
      data: geojson
    });
    mlLoadedSources.add(sourceId);

    // Añadir capa con línea naranja intermitente (dashed)
    mlMap.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      minzoom: 12,
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': '#FF6B00',  // Naranja
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          12, 2,
          14, 3,
          16, 4,
          18, 5
        ],
        'line-opacity': 0.9,
        'line-dasharray': [2, 2]  // Línea intermitente (dash, gap)
      }
    });

    console.log(`Capa rutas de acceso cargada: ${geojson.features?.length || 0} elementos`);

  } catch (error) {
    console.error('Error cargando rutas de acceso:', error);
  }
}

/**
 * Carga una capa GeoJSON
 */
async function mlLoadGeoJSONLayer(layerId, url, type, paint, minzoom = 0, layout = {}) {
  const sourceId = `${layerId}-source`;
  const fullLayerId = `${layerId}-layer`;

  // Añadir timestamp para evitar caché
  const urlWithCache = `${url}?v=${Date.now()}`;

  try {
    // Cargar GeoJSON
    const response = await fetch(urlWithCache);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const geojson = await response.json();

    // Añadir source
    if (mlMap.getSource(sourceId)) {
      mlMap.removeSource(sourceId);
    }
    mlMap.addSource(sourceId, {
      type: 'geojson',
      data: geojson
    });
    mlLoadedSources.add(sourceId);

    // Añadir capa
    const layerConfig = {
      id: fullLayerId,
      type: type,
      source: sourceId,
      minzoom: minzoom,
      paint: paint
    };

    if (Object.keys(layout).length > 0) {
      layerConfig.layout = layout;
    }

    mlMap.addLayer(layerConfig);

    console.log(`Capa ${layerId} cargada: ${geojson.features?.length || 0} elementos`);

  } catch (error) {
    console.error(`Error cargando capa ${layerId}:`, error);
  }
}

/**
 * Limpia las capas de la escuela actual
 */
function mlClearSchoolLayers() {
  const layerIds = ['vias-layer', 'sectores-layer', 'sectores-casing-layer', 'parkings-layer', 'rutas-acceso-layer', 'ascent-ticks-layer'];
  const sourceIds = ['vias-source', 'sectores-source', 'parkings-source', 'rutas-acceso-source', 'ascent-ticks-source'];

  layerIds.forEach(id => {
    if (mlMap.getLayer(id)) {
      mlMap.removeLayer(id);
    }
  });

  sourceIds.forEach(id => {
    if (mlMap.getSource(id)) {
      mlMap.removeSource(id);
      mlLoadedSources.delete(id);
    }
  });
}

// ============================================
// INTERACTIVIDAD
// ============================================

/**
 * Configura interacción con capa de vías
 */
function setupViasInteraction() {
  // Clic en vía
  mlMap.on('click', 'vias-layer', (e) => {
    if (!e.features || e.features.length === 0) return;

    const feature = e.features[0];
    const props = feature.properties;
    const coords = e.lngLat;

    // Auto-centrar con padding para evitar que el popup quede cortado
    mlMap.flyTo({
      center: coords,
      zoom: mlMap.getZoom(),
      speed: 0.8,
      curve: 1,
      padding: { top: 450, bottom: 0, left: 0, right: 0 }
    });

    showRoutePopup(props, coords);
  });

  // Cursor pointer al hover
  mlMap.on('mouseenter', 'vias-layer', () => {
    mlMap.getCanvas().style.cursor = 'pointer';
  });

  mlMap.on('mouseleave', 'vias-layer', () => {
    mlMap.getCanvas().style.cursor = '';
  });
}

/**
 * Muestra popup de ruta con nuevo diseño
 */
async function showRoutePopup(props, coords) {
  const grade = props.grado1 || '?';
  const gradeColor = getGradeColor(grade);
  const routeName = props.nombre || 'Sin nombre';
  const encodedName = encodeURIComponent(routeName);
  const sectorName = props.sector || '';
  const encodedSector = encodeURIComponent(sectorName);
  const schoolId = mlCurrentSchool || 'valeria';

  // Verificar si es admin para mostrar botón de desarrollador
  const isAdmin = await isRoutePopupAdmin();

  // Verificar si la vía tiene dibujo en la imagen del sector (para mostrar botón "Ver vía")
  let hasDrawing = false;
  if (sectorName && typeof hasRouteDrawing === 'function') {
    hasDrawing = await hasRouteDrawing(schoolId, sectorName, routeName);
  }

  // Verificar si el usuario ya tiene un ascenso registrado en esta vía
  let hasAscent = false;
  let ascentInfo = null;
  if (typeof hasUserAscent === 'function') {
    hasAscent = hasUserAscent(schoolId, routeName);
    if (hasAscent && typeof getUserAscentInfo === 'function') {
      ascentInfo = getUserAscentInfo(schoolId, routeName);
    }
  }

  // Guardar datos de la vía actual para las funciones de los botones
  mlCurrentRouteGrade = grade;
  mlCurrentRouteSector = sectorName;

  // Iconos PNG para info (tamaño 32x32)
  const iconClimber = `<img src="icons/placa.png" alt="Tipo" width="32" height="32">`;
  const iconExpress = `<img src="icons/mosq.png" alt="Expresos" width="32" height="32">`;
  const iconRope = `<img src="icons/cuerda.png" alt="Cuerda" width="32" height="32">`;

  // Iconos SVG de la botonera (tamaño 32x32)
  const iconCheck = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  const iconBookmark = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;

  const iconComment = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;

  const iconShare = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

  // Icono de check para vía completada (más pequeño, para el header)
  const iconAscentCheck = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  // Calcular aleje si hay datos válidos (sumamos +1 express para la reunión)
  const alejeData = (props.long1 && props.exp1 && parseFloat(props.long1) > 0 && parseFloat(props.exp1) > 0) ? (() => {
    const metros = parseFloat(props.long1);
    const express = parseFloat(props.exp1) + 1; // +1 para contar la reunión
    const aleje = metros / express;

    // Determinar color y posición
    let alejePosition;
    if (aleje <= 2) {
      alejePosition = ((aleje - 1) / 1) * 33.33; // 1-2 ocupa primer tercio
    } else if (aleje <= 3) {
      alejePosition = 33.33 + ((aleje - 2) / 1) * 33.33; // 2-3 ocupa segundo tercio
    } else {
      alejePosition = 66.66 + Math.min(((aleje - 3) / 2) * 33.33, 33.33); // 3-5+ ocupa último tercio
    }
    alejePosition = Math.max(0, Math.min(100, alejePosition));

    return { aleje, alejePosition };
  })() : null;

  const html = `
    <div class="ml-route-popup-new">
      <!-- Header: Nombre + Grado + Check si completada -->
      <div class="ml-route-header">
        ${hasAscent ? `<span class="ml-route-ascent-check" title="Ya has encadenado esta vía">${iconAscentCheck}</span>` : ''}
        <span class="ml-route-name">${routeName}</span>
        <span class="ml-route-grade" style="background-color: ${gradeColor}">${grade}</span>
      </div>

      <!-- Info items con iconos -->
      <div class="ml-route-info">
        <div class="ml-route-item ${!props.descripcion ? 'ml-route-item-missing' : ''}">
          <span class="ml-route-icon">${iconClimber}</span>
          ${props.descripcion ? `
            <span class="ml-route-text">${props.descripcion}</span>
          ` : `
            <span class="ml-route-text ml-route-contribute" onclick="mlContributeField('${encodedName}', 'descripcion', '${schoolId}')">
              ¿Qué tipo de escalada es?
            </span>
          `}
        </div>

        <div class="ml-route-item ${!props.exp1 ? 'ml-route-item-missing' : ''}">
          <span class="ml-route-icon">${iconExpress}</span>
          ${props.exp1 ? `
            <span class="ml-route-text">${props.exp1} express</span>
          ` : `
            <span class="ml-route-text ml-route-contribute" onclick="mlContributeField('${encodedName}', 'exp1', '${schoolId}')">
              ¿Cuántos express tiene?
            </span>
          `}
        </div>

        <div class="ml-route-item ${!props.long1 ? 'ml-route-item-missing' : ''}">
          <span class="ml-route-icon">${iconRope}</span>
          ${props.long1 ? `
            <span class="ml-route-text">${props.long1} mts</span>
          ` : `
            <span class="ml-route-text ml-route-contribute" onclick="mlContributeField('${encodedName}', 'long1', '${schoolId}')">
              ¿Cuántos metros tiene?
            </span>
          `}
        </div>
      </div>

      <!-- Gráfica de Aleje (solo si hay metros y express válidos) -->
      ${alejeData ? `
        <div class="ml-route-aleje">
          <span class="ml-route-aleje-label">Aleje</span>
          <div class="ml-route-aleje-bar">
            <div class="ml-route-aleje-segment ml-route-aleje-green"></div>
            <div class="ml-route-aleje-segment ml-route-aleje-yellow"></div>
            <div class="ml-route-aleje-segment ml-route-aleje-red"></div>
            <div class="ml-route-aleje-marker" style="left: ${alejeData.alejePosition}%;">
              <div class="ml-route-aleje-line"></div>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Botonera -->
      <div class="ml-route-actions">
        <button class="ml-route-action-btn" onclick="mlRegisterAscent('${encodedName}')" title="Registrar ascenso">
          ${iconCheck}
        </button>
        <button class="ml-route-action-btn" onclick="mlToggleBookmark('${encodedName}')" title="Guardar">
          ${iconBookmark}
        </button>
        <button class="ml-route-action-btn" onclick="mlOpenComments('${encodedName}')" title="Comentarios">
          ${iconComment}
        </button>
        <button class="ml-route-action-btn" onclick="mlShareRoute('${encodedName}')" title="Compartir">
          ${iconShare}
        </button>
      </div>

      <!-- Botón Ver vía (solo si tiene dibujo en la imagen) -->
      ${hasDrawing ? `
        <div class="ml-route-view-section">
          <button class="ml-route-view-btn" onclick="mlViewRouteInSector('${schoolId}', '${encodedSector}', '${encodedName}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Ver vía
          </button>
        </div>
      ` : ''}

      <!-- Botón de desarrollador (solo admins) -->
      ${isAdmin ? `
        <div class="ml-route-dev-section">
          <button class="ml-route-dev-btn" onclick="mlOpenDrawingEditor('${encodedName}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            Vincular con imagen del sector
          </button>
        </div>
      ` : ''}
    </div>
  `;

  mlRoutePopup
    .setLngLat(coords)
    .setHTML(html)
    .addTo(mlMap);
}

// Funciones para los botones del popup - conectadas con user-features.js
function mlRegisterAscent(encodedName) {
  const name = decodeURIComponent(encodedName);
  console.log('Registrar ascenso:', name);

  // Cerrar popup
  if (mlRoutePopup) mlRoutePopup.remove();

  // Usar openAscentModal de user-features.js
  if (typeof openAscentModal === 'function') {
    // Obtener datos de la vía actual
    const schoolId = mlCurrentSchool || 'valeria';
    const schoolName = MAPLIBRE_SCHOOLS[schoolId]?.name || 'Escuela';
    const grade = mlCurrentRouteGrade || '?';
    const sector = mlCurrentRouteSector || '';
    openAscentModal(schoolId, schoolName, name, grade, sector);
  } else {
    showToast('Función de registro no disponible', 'info');
  }
}

function mlToggleFavorite(encodedName) {
  const name = decodeURIComponent(encodedName);
  console.log('Toggle favorito:', name);

  if (typeof addToFavorites === 'function') {
    const schoolId = mlCurrentSchool || 'valeria';
    addToFavorites(schoolId, name);
  } else {
    showToast('Función de favoritos no disponible', 'info');
  }
}

function mlToggleBookmark(encodedName) {
  const name = decodeURIComponent(encodedName);
  console.log('Toggle bookmark:', name);

  if (typeof addToProjects === 'function') {
    const schoolId = mlCurrentSchool || 'valeria';
    addToProjects(schoolId, name);
  } else if (typeof addToFavorites === 'function') {
    const schoolId = mlCurrentSchool || 'valeria';
    addToFavorites(schoolId, name);
  } else {
    showToast('Guardado en proyectos', 'success');
  }
}

function mlOpenComments(encodedName) {
  const name = decodeURIComponent(encodedName);
  console.log('Abrir comentarios:', name);

  // Cerrar popup
  if (mlRoutePopup) mlRoutePopup.remove();

  // Intentar abrir el modal de detalles que tiene comentarios
  if (typeof openRouteInfoWindow === 'function') {
    openRouteInfoWindow(name, mlCurrentSchool);
  } else if (typeof showRouteDetails === 'function') {
    showRouteDetails(name, mlCurrentSchool);
  } else {
    showToast('Comentarios no disponibles', 'info');
  }
}

function mlShareRoute(encodedName) {
  const name = decodeURIComponent(encodedName);
  console.log('Compartir ruta:', name);

  // Usar Web Share API si está disponible
  if (navigator.share) {
    navigator.share({
      title: name,
      text: `Mira esta vía de escalada: ${name}`,
      url: window.location.href
    }).catch(() => {
      // Si falla, copiar al portapapeles
      copyToClipboard(window.location.href);
    });
  } else {
    // Fallback: copiar URL al portapapeles
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('Enlace copiado al portapapeles', 'success');
      });
    }
  }
}

/**
 * Abre el visor del sector con la vía resaltada
 */
function mlViewRouteInSector(schoolId, encodedSector, encodedName) {
  const sectorName = decodeURIComponent(encodedSector);
  const routeName = decodeURIComponent(encodedName);
  console.log('Ver vía en sector:', routeName, 'en', sectorName);

  // Cerrar popup
  if (mlRoutePopup) mlRoutePopup.remove();

  // Abrir el visor del sector con la vía resaltada
  if (typeof openSectorImageViewerWithHighlight === 'function') {
    openSectorImageViewerWithHighlight(schoolId, sectorName, routeName);
  } else {
    // Fallback: abrir visor sin highlight
    if (typeof openSectorImageViewer === 'function') {
      openSectorImageViewer(schoolId, sectorName);
    } else {
      showToast('Visor de sector no disponible', 'info');
    }
  }
}

// Variables para almacenar datos de la vía actual
let mlCurrentRouteGrade = null;
let mlCurrentRouteSector = null;

/**
 * Abre detalles de ruta (conecta con sistema existente)
 */
function mlOpenRouteDetails(encodedName) {
  const name = decodeURIComponent(encodedName);

  // Cerrar popup
  mlRoutePopup.remove();

  // Intentar usar función existente de app_3.js
  if (typeof openRouteInfoWindow === 'function') {
    openRouteInfoWindow(name, mlCurrentSchool);
  } else if (typeof showRouteDetails === 'function') {
    showRouteDetails(name, mlCurrentSchool);
  } else {
    console.log('Abrir detalles de:', name);
    // Aquí puedes añadir tu propia lógica
  }
}

// ============================================
// SECTOR POPUP
// ============================================

// Variable para popup de sector
let mlSectorPopup = null;

/**
 * Verifica si la fecha actual está dentro del período de restricción
 * @param {string} fechaInicio - Formato "DD-MM"
 * @param {string} fechaFin - Formato "DD-MM"
 * @returns {boolean}
 */
function isCurrentlyRestricted(fechaInicio, fechaFin) {
  if (!fechaInicio || !fechaFin) return false;

  const now = new Date();
  const currentYear = now.getFullYear();

  // Parsear fechas (formato DD-MM)
  const [diaInicio, mesInicio] = fechaInicio.split('-').map(Number);
  const [diaFin, mesFin] = fechaFin.split('-').map(Number);

  const inicio = new Date(currentYear, mesInicio - 1, diaInicio);
  const fin = new Date(currentYear, mesFin - 1, diaFin);

  // Si el rango cruza el año (ej: 15-11 a 15-02)
  if (fin < inicio) {
    return now >= inicio || now <= fin;
  }

  return now >= inicio && now <= fin;
}

/**
 * Obtiene el icono de exposición según el valor
 * @param {string} exposicion
 * @returns {string} HTML del icono
 */
function getExposureIcon(exposicion) {
  if (!exposicion) return '';

  const exp = exposicion.toLowerCase().trim();

  if (exp.includes('mañana')) {
    return `<img src="icons/sol mañana.png" alt="Sol mañana" width="32" height="32">`;
  } else if (exp.includes('tarde')) {
    return `<img src="icons/sol tarde.png" alt="Sol tarde" width="32" height="32">`;
  } else if (exp === 'sombra') {
    return `<img src="icons/sombra.png" alt="Sombra" width="32" height="32">`;
  } else if (exp.includes('sol')) {
    return `<img src="icons/sol.png" alt="Sol" width="32" height="32">`;
  }

  return `<img src="icons/sol.png" alt="Sol" width="32" height="32">`;
}

/**
 * Cuenta las vías por grado para un sector específico
 * @param {string} sectorName - Nombre del sector
 * @returns {Object} Objeto con conteo por grado
 */
function countRoutesByGradeForSector(sectorName) {
  if (!mlMap || !mlMap.getSource('vias-source')) return {};

  try {
    const features = mlMap.querySourceFeatures('vias-source', {
      sourceLayer: 'vias'
    });

    // [FIX] Priorizar source._data (GeoJSON completo) sobre querySourceFeatures (solo visibles)
    // para asegurar estadísticas completas independientemente del zoom/viewport
    const source = mlMap.getSource('vias-source');
    let routeFeatures = [];

    if (source && source._data && source._data.features) {
      routeFeatures = source._data.features;
    } else {
      routeFeatures = features.length > 0 ? features : [];
    }

    const gradeCounts = {};

    routeFeatures.forEach(feature => {
      const props = feature.properties;
      // Normalizar nombre del sector para comparación
      const routeSector = (props.sector || '').toLowerCase().trim();
      const targetSector = sectorName.toLowerCase().trim();

      if (routeSector === targetSector) {
        const grade = props.grado1 || 'Sin grado';
        gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
      }
    });

    return gradeCounts;
  } catch (error) {
    console.error('Error counting routes by grade:', error);
    return {};
  }
}

/**
 * Ordena grados de escalada
 */
function sortGrades(grades) {
  const order = ['3', '4a', '4b', '4c', '4+', '5a', '5b', '5c', '5+', '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a', '7a+', '7b', '7b+', '7c', '7c+', '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a'];

  return grades.sort((a, b) => {
    const indexA = order.indexOf(a.toLowerCase());
    const indexB = order.indexOf(b.toLowerCase());
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
}

/**
 * Renderiza el gráfico de barras de grados
 * @param {string} containerId - ID del contenedor
 * @param {Object} gradeCounts - Conteo de vías por grado
 */
function renderGradeChart(containerId, gradeCounts) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const grades = sortGrades(Object.keys(gradeCounts));
  const total = Object.values(gradeCounts).reduce((sum, count) => sum + count, 0);

  if (grades.length === 0) {
    container.innerHTML = '<p style="color: #888; text-align: center;">No hay vías registradas</p>';
    return;
  }

  const maxCount = Math.max(...Object.values(gradeCounts));
  const barWidth = Math.min(30, Math.floor(280 / grades.length) - 4);

  let html = `
    <div style="text-align: center; font-weight: 600; color: #374151; margin-bottom: 20px; padding-bottom: 8px;">
      Vías por Grado <span style="font-weight: 400; color: #6b7280;">(${total} total)</span>
    </div>
    <div style="display: flex; align-items: flex-end; justify-content: center; height: 100px; gap: 3px;">
  `;

  grades.forEach(grade => {
    const count = gradeCounts[grade];
    const height = Math.max(10, (count / maxCount) * 80);
    const gradeColor = getGradeColor(grade);

    html += `
      <div style="display: flex; flex-direction: column; align-items: center;">
        <span style="font-size: 10px; color: #374151; font-weight: 600;">${count}</span>
        <div style="width: ${barWidth}px; height: ${height}px; background: ${gradeColor}; border-radius: 3px 3px 0 0;"></div>
        <span style="font-size: 9px; color: #6b7280; margin-top: 4px; transform: rotate(-45deg); white-space: nowrap;">${grade}</span>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

/**
 * Muestra popup de sector
 */
function showSectorPopup(props, coords) {
  // Cerrar popup de ruta si está abierto
  if (mlRoutePopup) mlRoutePopup.remove();

  const sectorName = props.nombre || 'Sector sin nombre';
  const restr = (props.restr || '').toUpperCase();
  const hasRestriction = restr === 'SI' || restr === 'SÍ';
  const fechaInicio = props.Fecha_inicio;
  const fechaFin = props.Fecha_fin;
  const exposicion = props.exposicion || '';

  // Verificar si está restringido ahora
  const isRestricted = hasRestriction && isCurrentlyRestricted(fechaInicio, fechaFin);

  // Iconos de restricción
  const restrictionIcon = isRestricted
    ? `<img src="icons/prohibido.png" alt="Prohibido" width="36" height="36">`
    : `<img src="icons/permitido.png" alt="Permitido" width="36" height="36">`;

  const restrictionText = isRestricted ? 'Prohibido' : 'Permitido';
  const restrictionColor = isRestricted ? '#dc2626' : '#16a34a';
  const restrictionDates = hasRestriction ? `(Restricción: ${fechaInicio} - ${fechaFin})` : '';

  // Icono de exposición
  const exposureIcon = getExposureIcon(exposicion);
  const exposureText = exposicion ? exposicion.replace(/_/g, ' ') : 'No especificada';

  // Generar ID único para el contenedor del gráfico
  const chartId = `sector-chart-${Date.now()}`;

  const html = `
    <div class="ml-sector-popup">
      <!-- Header: Nombre del sector -->
      <div class="ml-sector-header">${sectorName}</div>
      
      <!-- Fila de restricción -->
      <div class="ml-sector-row">
        <span class="ml-sector-icon">${restrictionIcon}</span>
        <div class="ml-sector-text">
          <span style="color: ${restrictionColor}; font-weight: 600;">${restrictionText}</span>
          <span style="color: #6b7280; font-size: 12px; margin-left: 6px;">${restrictionDates}</span>
        </div>
      </div>
      
      <!-- Fila de exposición -->
      <div class="ml-sector-row">
        <span class="ml-sector-icon">${exposureIcon}</span>
        <span class="ml-sector-text" style="color: #f59e0b; font-weight: 500;">${exposureText}</span>
      </div>
      
      <!-- Gráfico de vías por grado -->
      <div class="ml-sector-chart" id="${chartId}">
        <div style="text-align: center; color: #888;">Cargando...</div>
      </div>

      <!-- Botón Ver Sector -->
      <button class="ml-sector-view-btn" onclick="openSectorImageViewer('${mlCurrentSchool || 'valeria'}', '${sectorName.replace(/'/g, "\\'")}')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        Ver Sector
      </button>
    </div>
  `;

  // Crear popup si no existe
  if (!mlSectorPopup) {
    mlSectorPopup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '360px',
      className: 'ml-sector-popup-container'
    });
  }

  mlSectorPopup
    .setLngLat(coords)
    .setHTML(html)
    .addTo(mlMap);

  // Renderizar gráfico después de que el popup esté en el DOM
  setTimeout(() => {
    const gradeCounts = countRoutesByGradeForSector(sectorName);
    renderGradeChart(chartId, gradeCounts);
  }, 100);
}

/**
 * Configura interacción de click en sectores
 */
function setupSectoresInteraction() {
  if (!mlMap.getLayer('sectores-layer')) return;

  // Cursor pointer al pasar sobre sectores
  mlMap.on('mouseenter', 'sectores-layer', () => {
    mlMap.getCanvas().style.cursor = 'pointer';
  });

  mlMap.on('mouseleave', 'sectores-layer', () => {
    mlMap.getCanvas().style.cursor = '';
  });

  // Click en sector
  mlMap.on('click', 'sectores-layer', (e) => {
    if (!e.features || e.features.length === 0) return;

    const feature = e.features[0];
    const props = feature.properties;
    const coords = e.lngLat;

    // Auto-centrar con padding para evitar que el popup quede cortado
    mlMap.flyTo({
      center: coords,
      zoom: mlMap.getZoom(),
      speed: 0.8,
      curve: 1,
      padding: { top: 450, bottom: 0, left: 0, right: 0 }
    });

    showSectorPopup(props, [coords.lng, coords.lat]);
  });
}

// ============================================
// ICONOS
// ============================================

/**
 * Carga icono de parking
 */
function loadParkingIcon() {
  // Crear icono SVG como imagen
  const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="11" fill="#4285f4" stroke="#ffffff" stroke-width="2"/>
      <text x="12" y="17" text-anchor="middle" fill="white" font-size="14" font-weight="bold">P</text>
    </svg>
  `;

  const img = new Image(24, 24);
  img.onload = () => {
    if (!mlMap.hasImage('parking-icon')) {
      mlMap.addImage('parking-icon', img);
    }
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgIcon);
}

/**
 * Carga icono de tick para vías completadas
 */
function loadAscentTickIcon() {
  if (!mlMap) return;

  // Crear icono SVG de tick minimalista (solo check con contorno blanco, sin fondo)
  const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <polyline points="3 8 6.5 11.5 13 4.5" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="3 8 6.5 11.5 13 4.5" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const img = new Image(16, 16);
  img.onload = () => {
    if (!mlMap.hasImage('ascent-tick-icon')) {
      mlMap.addImage('ascent-tick-icon', img);
    }
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgIcon);
}

// ============================================
// TICKS DE VÍAS COMPLETADAS
// ============================================

/**
 * Actualiza la capa de ticks para mostrar vías completadas
 * Esta función obtiene las vías visibles y marca las que tienen ascenso
 */
function updateAscentTicksLayer() {
  if (!mlMap || !mlCurrentSchool) return;

  // Verificar que existe la función hasUserAscent
  if (typeof hasUserAscent !== 'function') return;

  // Asegurar que el icono está cargado
  if (!mlMap.hasImage('ascent-tick-icon')) {
    loadAscentTickIcon();
  }

  // Obtener todas las vías de la fuente (vector tiles o GeoJSON)
  const viasSourceId = mlMap.getSource('vias-source') ? 'vias-source' : 'vias-geojson';

  // Consultar features visibles de la capa de vías
  const viasFeatures = mlMap.querySourceFeatures(viasSourceId, {
    sourceLayer: mlMap.getSource('vias-source') ? 'vias' : undefined
  });

  if (!viasFeatures || viasFeatures.length === 0) return;

  // Filtrar vías que tienen ascenso del usuario
  const completedRoutes = [];
  const seenRoutes = new Set(); // Evitar duplicados

  viasFeatures.forEach(feature => {
    const routeName = feature.properties?.nombre;
    if (!routeName || seenRoutes.has(routeName)) return;

    if (hasUserAscent(mlCurrentSchool, routeName)) {
      seenRoutes.add(routeName);

      // Obtener coordenadas del punto
      let coords;
      if (feature.geometry.type === 'Point') {
        coords = feature.geometry.coordinates;
      }

      if (coords) {
        completedRoutes.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: coords
          },
          properties: {
            nombre: routeName
          }
        });
      }
    }
  });

  // Crear/actualizar fuente GeoJSON para los ticks
  const ticksGeoJSON = {
    type: 'FeatureCollection',
    features: completedRoutes
  };

  if (mlMap.getSource('ascent-ticks-source')) {
    // Actualizar fuente existente
    mlMap.getSource('ascent-ticks-source').setData(ticksGeoJSON);
  } else {
    // Crear nueva fuente y capa
    mlMap.addSource('ascent-ticks-source', {
      type: 'geojson',
      data: ticksGeoJSON
    });

    // Obtener el minzoom de las vías para que los ticks desaparezcan al mismo nivel
    const viasMinZoom = mlCurrentSchool?.zoomLevels?.vias || 17;

    mlMap.addLayer({
      id: 'ascent-ticks-layer',
      type: 'symbol',
      source: 'ascent-ticks-source',
      minzoom: viasMinZoom, // Mismo minzoom que las vías
      layout: {
        'icon-image': 'ascent-tick-icon',
        'icon-size': [
          'interpolate', ['linear'], ['zoom'],
          14, 0.6,
          16, 0.8,
          18, 1.0,
          20, 1.2
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-offset': [6, -6] // Desplazar hacia arriba-derecha del punto
      }
    });
  }

  console.log(`Ascent ticks updated: ${completedRoutes.length} completed routes`);
}

/**
 * Configura la actualización automática de ticks cuando cambia el viewport
 */
function setupAscentTicksUpdater() {
  if (!mlMap) return;

  // Actualizar ticks cuando termina de mover/hacer zoom
  mlMap.on('moveend', () => {
    updateAscentTicksLayer();
  });

  // También actualizar cuando se carga la data
  mlMap.on('sourcedata', (e) => {
    if (e.sourceId === 'vias-source' || e.sourceId === 'vias-geojson') {
      // Pequeño delay para asegurar que los datos están listos
      setTimeout(() => updateAscentTicksLayer(), 100);
    }
  });
}

// ============================================
// PARKING POPUP
// ============================================

let mlParkingPopup = null;

/**
 * Configura interacción con parkings
 */
function setupParkingsInteraction() {
  if (!mlMap.getLayer('parkings-layer')) return;

  // Cursor pointer
  mlMap.on('mouseenter', 'parkings-layer', () => {
    mlMap.getCanvas().style.cursor = 'pointer';
  });

  mlMap.on('mouseleave', 'parkings-layer', () => {
    mlMap.getCanvas().style.cursor = '';
  });

  // Click en parking
  mlMap.on('click', 'parkings-layer', (e) => {
    if (!e.features || e.features.length === 0) return;

    const feature = e.features[0];
    const props = feature.properties;
    const coords = e.lngLat;

    // Auto-centrar con padding para evitar que el popup quede cortado
    mlMap.flyTo({
      center: coords,
      zoom: mlMap.getZoom(),
      speed: 0.8,
      curve: 1,
      padding: { top: 450, bottom: 0, left: 0, right: 0 }
    });

    showParkingPopup(props, [coords.lng, coords.lat]);
  });
}

/**
 * Muestra popup de parking
 */
function showParkingPopup(props, coords) {
  // Cerrar otros popups
  if (mlRoutePopup) mlRoutePopup.remove();
  if (mlSectorPopup) mlSectorPopup.remove();

  const nombre = props.nombre || props.Nombre || 'Parking';
  const descripcion = props.descripcion || props.Descripcion || '';
  const plazas = props.plazas || props.Plazas || '';
  const tipo = props.tipo || props.Tipo || '';

  // URL para navegación
  const lat = coords[1];
  const lng = coords[0];
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  const html = `
    <div class="ml-parking-popup">
      <div class="ml-parking-header">
        <span class="ml-parking-icon">🅿️</span>
        <span class="ml-parking-name">${nombre}</span>
      </div>

      ${descripcion ? `<p class="ml-parking-desc">${descripcion}</p>` : ''}

      <div class="ml-parking-info">
        ${plazas ? `<span>🚗 ${plazas} plazas</span>` : ''}
        ${tipo ? `<span>📍 ${tipo}</span>` : ''}
      </div>

      <button class="ml-parking-btn" onclick="window.open('${gmapsUrl}', '_blank')">
        🧭 Cómo llegar
      </button>
    </div>
  `;

  // Crear popup si no existe
  if (!mlParkingPopup) {
    mlParkingPopup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '280px',
      className: 'ml-parking-popup-container'
    });
  }

  mlParkingPopup
    .setLngLat(coords)
    .setHTML(html)
    .addTo(mlMap);
}

// ============================================
// MARKERS DE ESCUELAS (Symbol Layer nativo)
// ============================================

let mlSchoolPopup = null;

/**
 * Carga los markers de escuelas como Symbol Layer nativo de MapLibre
 * Esto hace que los iconos escalen con el zoom como las líneas de sectores
 */
function loadSchoolMarkers() {
  if (!mlMap || typeof SCHOOL_MARKERS === 'undefined') {
    console.warn('No se pueden cargar markers: mapa o SCHOOL_MARKERS no disponible');
    return;
  }

  console.log('Cargando markers de escuelas como Symbol Layer:', SCHOOL_MARKERS.length);

  // Limpiar source/layers existentes si los hay
  if (mlMap.getLayer('school-labels-layer')) mlMap.removeLayer('school-labels-layer');
  if (mlMap.getLayer('school-markers-layer')) mlMap.removeLayer('school-markers-layer');
  if (mlMap.getSource('schools-source')) mlMap.removeSource('schools-source');

  // Crear popup compartido para escuelas
  if (!mlSchoolPopup) {
    mlSchoolPopup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '340px',
      className: 'ml-school-popup'
    });
  }

  // Crear GeoJSON con las escuelas
  const schoolsGeoJSON = {
    type: 'FeatureCollection',
    features: SCHOOL_MARKERS.map(school => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: school.coords
      },
      properties: {
        id: school.id,
        nombre: school.nombre,
        zoom: school.zoom,
        isOpen: school.isOpen,
        rockType: school.rockType || 'Caliza',
        coords: school.coords
      }
    }))
  };

  // Añadir source
  mlMap.addSource('schools-source', {
    type: 'geojson',
    data: schoolsGeoJSON
  });

  // Cargar iconos SVG como imágenes
  loadSchoolIcons().then(() => {
    // Añadir capa de símbolos (iconos)
    mlMap.addLayer({
      id: 'school-markers-layer',
      type: 'symbol',
      source: 'schools-source',
      minzoom: 5,
      maxzoom: 12,
      layout: {
        'icon-image': ['case',
          ['==', ['get', 'nombre'], 'Hoz del Río Gritos'], 'school-icon-green',
          ['==', ['get', 'nombre'], 'Mora'], 'school-icon-green',
          ['==', ['get', 'nombre'], 'Toledo'], 'school-icon-green',
          'school-icon-orange'
        ],
        // Tamaño que escala con el zoom
        'icon-size': [
          'interpolate', ['linear'], ['zoom'],
          5, 0.3,
          8, 0.5,
          10, 0.7,
          12, 0.9,
          14, 1.1
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': false,
        // Badge de desarrollo para escuelas no abiertas
        'icon-anchor': 'center'
      },
      paint: {
        'icon-opacity': 1
      }
    });

    // Añadir capa de etiquetas (texto)
    mlMap.addLayer({
      id: 'school-labels-layer',
      type: 'symbol',
      source: 'schools-source',
      minzoom: 7,
      maxzoom: 12,
      layout: {
        'text-field': ['get', 'nombre'],
        'text-font': ['Noto Sans Bold'],
        'text-size': [
          'interpolate', ['linear'], ['zoom'],
          7, 10,
          10, 12,
          12, 14,
          14, 16
        ],
        'text-offset': [0, 2.2],
        'text-anchor': 'top',
        'text-max-width': 10,
        'text-allow-overlap': false
      },
      paint: {
        'text-color': '#1f2937',
        'text-halo-color': 'rgba(255, 255, 255, 0.95)',
        'text-halo-width': 2,
        'text-halo-blur': 0
      }
    });

    // Configurar interactividad
    setupSchoolLayerInteraction();

    console.log('Markers de escuelas cargados como Symbol Layer');
  });
}

/**
 * Carga los iconos SVG de escuelas como imágenes para MapLibre
 */
async function loadSchoolIcons() {
  const iconSize = 96; // Tamaño base del icono (se escalará con icon-size)

  // Icono naranja (escuelas normales)
  const orangeSVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${iconSize}" height="${iconSize}">
      <circle cx="24" cy="24" r="22" fill="#f59e0b"/>
      <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2"/>
      <g fill="white">
        <path d="M24 10 L36 32 L12 32 Z" opacity="0.95"/>
        <path d="M16 20 L24 32 L8 32 Z" opacity="0.7"/>
      </g>
      <g transform="translate(36, 10)">
        <circle cx="0" cy="0" r="8" fill="#fff" stroke="#f59e0b" stroke-width="1.5"/>
        <text x="0" y="3" text-anchor="middle" font-size="10" fill="#333">🔨</text>
      </g>
    </svg>
  `;

  // Icono verde (Hoz del Río Gritos - abierta)
  const greenSVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${iconSize}" height="${iconSize}">
      <circle cx="24" cy="24" r="22" fill="#22c55e"/>
      <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2"/>
      <g fill="white">
        <path d="M24 10 L36 32 L12 32 Z" opacity="0.95"/>
        <path d="M16 20 L24 32 L8 32 Z" opacity="0.7"/>
      </g>
    </svg>
  `;

  // Cargar icono naranja
  await loadSVGAsImage('school-icon-orange', orangeSVG, iconSize);

  // Cargar icono verde
  await loadSVGAsImage('school-icon-green', greenSVG, iconSize);
}

/**
 * Helper para cargar un SVG como imagen en MapLibre
 */
function loadSVGAsImage(imageId, svgString, size) {
  return new Promise((resolve) => {
    if (mlMap.hasImage(imageId)) {
      resolve();
      return;
    }

    const img = new Image(size, size);
    img.onload = () => {
      if (!mlMap.hasImage(imageId)) {
        mlMap.addImage(imageId, img);
      }
      resolve();
    };
    img.onerror = () => {
      console.warn('Error cargando icono:', imageId);
      resolve();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  });
}

/**
 * Configura la interactividad de la capa de escuelas
 */
function setupSchoolLayerInteraction() {
  // Cursor pointer al hover
  mlMap.on('mouseenter', 'school-markers-layer', () => {
    mlMap.getCanvas().style.cursor = 'pointer';
  });

  mlMap.on('mouseleave', 'school-markers-layer', () => {
    mlMap.getCanvas().style.cursor = '';
  });

  // Click en marker de escuela
  mlMap.on('click', 'school-markers-layer', (e) => {
    if (!e.features || e.features.length === 0) return;

    const feature = e.features[0];
    const props = feature.properties;

    // Reconstruir objeto school desde properties
    const school = {
      id: props.id,
      nombre: props.nombre,
      coords: JSON.parse(props.coords),
      zoom: props.zoom,
      isOpen: props.isOpen,
      rockType: props.rockType
    };

    // Centrar instantáneamente sin animación de zoom
    mlMap.jumpTo({
      center: school.coords,
      padding: { top: 450, bottom: 0, left: 0, right: 0 }
    });

    showSchoolPopup(school, null);
  });
}

/**
 * Muestra popup de escuela con resumen
 */
async function showSchoolPopup(school, marker) {
  const lat = school.coords[1];
  const lng = school.coords[0];
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  // Generar ID único para el gráfico
  const chartId = `school-chart-${Date.now()}`;

  // HTML inicial del popup
  const initialHtml = buildSchoolPopupHtml(school, chartId, gmapsUrl);

  mlSchoolPopup
    .setLngLat(school.coords)
    .setHTML(initialHtml)
    .addTo(mlMap);

  // Configurar event listeners
  setTimeout(() => {
    setupSchoolPopupEvents(school, gmapsUrl);
    // Cargar estadísticas si la función existe
    loadSchoolStats(school.id, chartId);
  }, 100);
}

/**
 * Helper para comparar y ordenar grados de escalada (French grades)
 * @param {string} gradeA
 * @param {string} gradeB
 * @returns {number}
 */
function compareGrades(gradeA, gradeB) {
  const parseGrade = (grade) => {
    const match = grade.match(/(\d+)([a-c])?(\+)?/);
    if (!match) return { num: 0, letter: '', plus: false };
    return {
      num: parseInt(match[1]),
      letter: match[2] || '',
      plus: !!match[3]
    };
  };

  const a = parseGrade(gradeA);
  const b = parseGrade(gradeB);

  if (a.num !== b.num) return a.num - b.num;
  if (a.letter !== b.letter) return a.letter.localeCompare(b.letter);
  if (a.plus !== b.plus) return a.plus ? 1 : -1; // '+' comes after non-'+'
  return 0;
}

/**
 * Helper para ordenar un array de grados de escalada.
 * @param {string[]} grades
 * @returns {string[]}
 */
function sortGrades(grades) {
  return grades.sort(compareGrades);
}

/**
 * Helper para obtener un color basado en el grado de escalada.
 * Colores distintivos para cada grado y subgrado.
 * @param {string} grade
 * @returns {string} Hex color code
 */
function getGradeColor(grade) {
  const gradeLower = grade.toLowerCase();

  // Colores pastel por grado completo - respetando asignación manual
  const gradeColors = {
    // Grados 3-4: Azules/Cyan pastel
    '3': '#e0f7fa',      // Azul claro pastel
    '3a': '#e0f7fa',     // Azul claro pastel
    '3b': '#b2ebf2',     // Cyan claro
    '3c': '#80deea',     // Cyan
    '4a': '#4dd0e1',     // Cyan medio
    '4b': '#26c6da',     // Cyan
    '4c': '#00bcd4',     // Cyan oscuro
    '4+': '#00acc1',     // Cyan más oscuro

    // Grado 5: Verdes pastel
    '5a': '#d7ffaf',     // Verde lima pastel
    '5a+': '#c5f59a',    // Verde lima
    '5b': '#a8e68f',     // Verde claro
    '5b+': '#8cd97f',    // Verde
    '5c': '#46923a',     // Verde medio
    '5c+': '#3d8032',    // Verde oscuro
    '5+': '#3d8032',     // Verde oscuro

    // Grado 6a: Amarillos pastel
    '6a': '#fff48d',     // Amarillo pastel
    '6a+': '#ffeb3b',    // Amarillo

    // Grado 6b: Naranjas pastel
    '6b': '#ffd919',     // Amarillo-naranja pastel
    '6b+': '#ffc107',    // Naranja claro

    // Grado 6c: Naranjas-Rojos pastel
    '6c': '#fda750',     // Naranja pastel
    '6c+': '#ff9800',    // Naranja

    // Grado 7a: Rojos pastel
    '7a': '#ff6161',     // Rojo claro pastel
    '7a+': '#f44336',    // Rojo

    // Grado 7b: Rojos oscuros pastel
    '7b': '#e53935',     // Rojo medio
    '7b+': '#d32f2f',    // Rojo oscuro

    // Grado 7c: Rojos muy oscuros
    '7c': '#ce1616',     // Rojo muy oscuro
    '7c+': '#b71c1c',    // Rojo casi negro

    // Grado 8: Rosas/Magentas pastel
    '8a': '#f463ef',     // Rosa pastel
    '8a+': '#e91e63',    // Rosa
    '8b': '#d81b60',     // Rosa oscuro
    '8b+': '#c2185b',    // Rosa muy oscuro
    '8c': '#ad1457',     // Magenta oscuro
    '8c+': '#8b00d9',    // Púrpura

    // Grado 9: Púrpuras/Negro
    '9a': '#7b00b3',     // Púrpura oscuro
    '9a+': '#6a0080',    // Púrpura muy oscuro
    '9b': '#4a0066',     // Casi negro púrpura
    '9b+': '#2d004d',    // Casi negro
    '9c': '#1a0033',     // Negro púrpura
    '9c+': '#0d001a'     // Negro
  };

  // Buscar coincidencia exacta
  if (gradeColors[gradeLower]) {
    return gradeColors[gradeLower];
  }

  // Fallback por número de grado (colores pastel)
  const gradeNum = parseInt(grade.match(/(\d+)/)?.[1]);
  if (isNaN(gradeNum)) return '#d1d5db'; // Gris pastel

  if (gradeNum <= 3) return '#e0f7fa';   // Azul claro pastel
  if (gradeNum === 4) return '#4dd0e1';  // Cyan pastel
  if (gradeNum === 5) return '#a8e68f';  // Verde pastel
  if (gradeNum === 6) return '#ffd919';  // Amarillo-naranja pastel
  if (gradeNum === 7) return '#ff6161';  // Rojo pastel
  if (gradeNum >= 8) return '#f463ef';  // Rosa pastel

  return '#d1d5db'; // Gris pastel por defecto
}

/**
 * Obtiene la ruta del icono del clima según el código WMO
 * @param {number} code - WMO weather code
 * @returns {string} Ruta al icono
 */
function getWeatherIcon(code) {
  if (code === 0) return 'icons/weather/sunny.png';                    // Sol despejado
  if ([1, 2].includes(code)) return 'icons/weather/partly-cloudy.png'; // Parcialmente nublado
  if (code === 3) return 'icons/weather/cloudy.png';                   // Nublado
  if ([45, 48].includes(code)) return 'icons/weather/fog.png';         // Niebla
  if ([51, 53, 55].includes(code)) return 'icons/weather/light-rain.png'; // Llovizna
  if ([61, 63, 65].includes(code)) return 'icons/weather/rain.png';    // Lluvia
  if ([66, 67].includes(code)) return 'icons/weather/rain.png';        // Lluvia helada
  if ([71, 73, 75, 77].includes(code)) return 'icons/weather/snow.png'; // Nieve
  if ([80, 81, 82].includes(code)) return 'icons/weather/rain.png';    // Chubascos
  if ([85, 86].includes(code)) return 'icons/weather/snow.png';        // Nieve
  if ([95, 96, 99].includes(code)) return 'icons/weather/storm.png';   // Tormenta
  return 'icons/weather/partly-cloudy.png'; // Por defecto
}

/**
 * Formatea la fecha para mostrar día de la semana
 * @param {string} dateStr - Fecha en formato YYYY-MM-DD
 * @returns {string} Nombre del día y número
 */
function formatWeatherDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  const months = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}

/**
 * Obtiene dirección del viento desde grados
 * @param {number} degrees - Grados de dirección
 * @returns {string} Flecha de dirección
 */
function getWindDirection(degrees) {
  const directions = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}

/**
 * Carga el clima actual y pronóstico para una escuela
 * @param {object} school - Datos de la escuela
 */
async function loadWeatherData(school) {
  const lat = school.coords[1];
  const lng = school.coords[0];

  try {
    // Open-Meteo API (gratuita, sin key)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant&timezone=auto&forecast_days=7`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Weather API error');

    const data = await response.json();

    // Actualizar clima actual
    const current = data.current;

    // Buscar el contenedor correcto (puede tener timestamp diferente)
    const allWeatherSections = document.querySelectorAll('[id^="weather-' + school.id + '"]');
    if (allWeatherSections.length === 0) return;

    const section = allWeatherSections[allWeatherSections.length - 1];

    // Actualizar icono del clima
    const iconEl = section.querySelector('.ml-weather-icon');
    if (iconEl) {
      iconEl.src = getWeatherIcon(current.weather_code);
    }

    // Actualizar temperatura
    const tempEl = section.querySelector('.ml-weather-temp');
    if (tempEl) {
      tempEl.textContent = `${Math.round(current.temperature_2m)}°C`;
    }

    // Actualizar detalles
    const precipEl = section.querySelector('.ml-weather-precip');
    if (precipEl) {
      precipEl.textContent = `${current.precipitation_probability || 0}%`;
    }

    const humidityEl = section.querySelector('.ml-weather-humidity');
    if (humidityEl) {
      humidityEl.textContent = `${current.relative_humidity_2m}%`;
    }

    const windEl = section.querySelector('.ml-weather-wind');
    if (windEl) {
      windEl.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
    }

    // Guardar datos del pronóstico para el desplegable
    section.dataset.forecast = JSON.stringify(data.daily);

  } catch (error) {
    console.warn('Error cargando datos del clima:', error);
  }
}

/**
 * Renderiza el pronóstico semanal
 * @param {string} schoolId - ID de la escuela
 * @param {object} dailyData - Datos diarios del clima
 */
function renderWeatherForecast(schoolId, dailyData) {
  const forecastContainer = document.getElementById(`forecast-${schoolId}`);
  if (!forecastContainer || !dailyData) return;

  let html = '';

  // Mostrar los próximos 7 días (scrolleable, muestra 2 a la vez)
  for (let i = 0; i < Math.min(7, dailyData.time.length); i++) {
    const date = formatWeatherDate(dailyData.time[i]);
    const maxTemp = Math.round(dailyData.temperature_2m_max[i]);
    const minTemp = Math.round(dailyData.temperature_2m_min[i]);
    const precipProb = dailyData.precipitation_probability_max[i] || 0;
    const precipSum = dailyData.precipitation_sum[i] || 0;
    const windSpeed = Math.round(dailyData.wind_speed_10m_max[i]);
    const windDir = getWindDirection(dailyData.wind_direction_10m_dominant[i]);
    const weatherCode = dailyData.weather_code[i];
    const weatherIcon = getWeatherIcon(weatherCode);

    html += `
      <div class='ml-forecast-day'>
        <div class='ml-forecast-date'>${date}</div>
        <div class='ml-forecast-content'>
          <div class='ml-forecast-temps'>
            <span class='ml-temp-max'>↑ ${maxTemp}°</span>
            <span class='ml-temp-min'>↓ ${minTemp}°</span>
          </div>
          <img class='ml-forecast-icon' src='${weatherIcon}' alt='Clima'>
          <div class='ml-forecast-details'>
            <span class='ml-forecast-precip'><img src='icons/weather/Gota.png' alt='' class='ml-precip-icon'> ${precipProb}% | ${precipSum.toFixed(1)} mm</span>
            <span class='ml-forecast-wind'>${windDir} ${windSpeed} km/h</span>
          </div>
        </div>
      </div>
    `;
  }

  forecastContainer.innerHTML = html;
}

/**
 * Carga estadísticas de la escuela (Gráfico Donut SVG Interactivo)
 */
async function loadSchoolStats(schoolId, chartId) {
  const container = document.getElementById(chartId);
  if (!container) return;

  try {
    const schoolConfig = MAPLIBRE_SCHOOLS[schoolId];
    if (schoolConfig && schoolConfig.geojson && schoolConfig.geojson.vias) {
      const response = await fetch(schoolConfig.geojson.vias);
      if (response.ok) {
        const geojson = await response.json();

        // 1. Agrupar por grado específico
        const gradeCounts = {};
        let total = 0;

        geojson.features.forEach(feature => {
          let grade = (feature.properties.grado1 || '').toLowerCase().trim();
          if (!grade) return;
          // Normalizar grados si es necesario (ej: convertir '7a+' a '7a+')
          gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
          total++;
        });

        if (total === 0) {
          container.innerHTML = '<div style="color: #666; font-size: 13px;">Sin datos de vías</div>';
          return;
        }

        // 2. Ordenar grados
        const sortedGrades = sortGrades(Object.keys(gradeCounts));

        // 3. Generar SVG con segmentos gruesos
        // Radio ajustado para segmentos más anchos (el stroke-width es 6 en CSS)
        const radius = 15;
        const circumference = 2 * Math.PI * radius; // ~94.25
        let accumulatedLength = 0;
        let svgSegments = '';

        sortedGrades.forEach(grade => {
          const count = gradeCounts[grade];
          const percent = count / total;
          const segmentLength = percent * circumference;
          const color = getGradeColor(grade);

          // dasharray: longitud_segmento longitud_hueco
          // dashoffset: posición inicial (negativo para ir en sentido horario)
          const dashArray = `${segmentLength} ${circumference - segmentLength}`;
          const dashOffset = -accumulatedLength;

          svgSegments += `
            <circle class="ml-donut-segment"
              cx="20" cy="20" r="${radius}"
              stroke="${color}"
              stroke-dasharray="${dashArray}"
              stroke-dashoffset="${dashOffset}"
              data-grade="${grade.toUpperCase()}"
              data-count="${count}"
            />`;

          accumulatedLength += segmentLength;
        });

        // 4. Inyectar HTML con círculo central
        container.innerHTML = `
          <div class="ml-donut-chart">
            <svg viewBox="0 0 40 40">
              ${svgSegments}
            </svg>
            <div class="ml-chart-center"></div>
            <div class="ml-chart-center-text" id="center-text-${chartId}">
              <div class="ml-total-vias">${total}</div>
              <div class="ml-total-label">Vías</div>
            </div>
          </div>
        `;

        // 5. Añadir interactividad (Event Listeners)
        const segments = container.querySelectorAll('.ml-donut-segment');
        const centerText = document.getElementById(`center-text-${chartId}`);
        const defaultContent = centerText.innerHTML;

        segments.forEach(segment => {
          segment.addEventListener('mouseenter', () => {
            // Mover el segmento al frente (z-index visual en SVG depende del orden del DOM)
            segment.parentNode.appendChild(segment);

            const g = segment.getAttribute('data-grade');
            const c = segment.getAttribute('data-count');
            const color = segment.getAttribute('stroke');
            centerText.innerHTML = `
               <div class="ml-total-vias" style="color: ${color};">${g}</div>
               <div class="ml-total-label">${c} Vías</div>
             `;
          });

          segment.addEventListener('mouseleave', () => {
            centerText.innerHTML = defaultContent;
          });
        });

        return;
      }
    }
  } catch (e) {
    console.warn('Error cargando estadísticas SVG:', e);
  }

  container.innerHTML = '<div style="color: #888; text-align: center; font-size: 13px;">Estadísticas no disponibles</div>';
}

/**
 * Construye HTML del popup de escuela (Rediseño según mockup)
 */
function buildSchoolPopupHtml(school, chartId, gmapsUrl) {
  const weatherId = `weather-${school.id}-${Date.now()}`;
  const rockType = school.rockType || 'Caliza';

  return `
    <div class='ml-school-popup-content'>
      <button class='ml-popup-close-btn' id='btn-close-${school.id}'>&times;</button>

      <h3 class='ml-school-title'>${school.nombre}</h3>

      <div class='ml-grade-chart-section'>
        <div class='ml-chart-title'>Vías por Grado</div>
        <div class='ml-grade-chart-container' id='${chartId}'>
          <div style='padding: 20px; text-align: center; color: #888; font-size: 13px;'>
            Cargando vías...
          </div>
        </div>
      </div>

      <div class='ml-weather-section' id='${weatherId}'>
        <div class='ml-weather-current'>
          <img class='ml-weather-icon' src='icons/weather/partly-cloudy.png' alt='Clima'>
          <div class='ml-weather-temp-container'>
            <span class='ml-weather-temp'>--°C</span>
            <button class='ml-weather-toggle-btn' id='weather-toggle-${school.id}'>
              <svg width='12' height='12' viewBox='0 0 12 12' fill='none'>
                <path d='M2 4L6 8L10 4' stroke='currentColor' stroke-width='2' stroke-linecap='round'></path>
              </svg>
            </button>
          </div>
          <div class='ml-weather-details'>
            <div>Precipitaciones: <img src='icons/weather/Gota.png' alt='' class='ml-precip-icon'> <span class='ml-weather-precip'>--%</span></div>
            <div>Humedad: <span class='ml-weather-humidity'>--%</span></div>
            <div>Viento: <span class='ml-weather-wind'>-- km/h</span></div>
          </div>
        </div>
        <div class='ml-weather-forecast hidden' id='forecast-${school.id}'>
          <div class='ml-forecast-loading'>Cargando pronóstico...</div>
        </div>
      </div>

      <div class='ml-rock-type' id='rock-type-${school.id}'>
        <span class='ml-rock-icon'>🏔️</span>
        <span class='ml-rock-text'>${rockType}</span>
      </div>

      <div class='ml-school-actions'>
        <button class='ml-school-btn ml-school-btn-directions' id='btn-directions-${school.id}'>
          ¿Cómo ir?
        </button>
        <button class='ml-school-btn ml-school-btn-visit' id='btn-visit-${school.id}'>
          Visitar escuela
        </button>
      </div>
    </div>
  `;
}

/**
 * Configura eventos del popup de escuela
 */
function setupSchoolPopupEvents(school, gmapsUrl) {
  const btnDirections = document.getElementById(`btn-directions-${school.id}`);
  const btnVisit = document.getElementById(`btn-visit-${school.id}`);
  const btnClose = document.getElementById(`btn-close-${school.id}`);
  const weatherToggle = document.getElementById(`weather-toggle-${school.id}`);
  const forecast = document.getElementById(`forecast-${school.id}`);
  const rockType = document.getElementById(`rock-type-${school.id}`);

  // Botón cerrar
  if (btnClose) {
    btnClose.onclick = () => mlSchoolPopup.remove();
  }

  // Botón direcciones
  if (btnDirections) {
    btnDirections.onclick = () => window.open(gmapsUrl, '_blank');
  }

  // Toggle del pronóstico semanal
  if (weatherToggle && forecast) {
    let forecastExpanded = false;

    weatherToggle.onclick = () => {
      forecastExpanded = !forecastExpanded;

      if (forecastExpanded) {
        // Cargar pronóstico si no está cargado
        const weatherSections = document.querySelectorAll('[id^="weather-' + school.id + '"]');
        if (weatherSections.length > 0) {
          const section = weatherSections[weatherSections.length - 1];
          const forecastData = section.dataset.forecast;
          if (forecastData) {
            renderWeatherForecast(school.id, JSON.parse(forecastData));
          }
        }

        forecast.classList.remove('hidden');
        weatherToggle.classList.add('expanded');

        // Ocultar tipo de roca
        if (rockType) {
          rockType.classList.add('hidden');
        }
      } else {
        forecast.classList.add('hidden');
        weatherToggle.classList.remove('expanded');

        // Mostrar tipo de roca
        if (rockType) {
          rockType.classList.remove('hidden');
        }
      }
    };
  }

  // Cargar datos del clima
  loadWeatherData(school);

  // Botón visitar escuela
  if (btnVisit) {
    btnVisit.onclick = () => {
      mlSchoolPopup.remove();

      // Cargar la escuela si existe en MAPLIBRE_SCHOOLS
      if (MAPLIBRE_SCHOOLS[school.id]) {
        const schoolConfig = MAPLIBRE_SCHOOLS[school.id];

        // Usar coordenadas de MAPLIBRE_SCHOOLS directamente (no de SCHOOL_MARKERS)
        mlMap.flyTo({
          center: schoolConfig.center,
          zoom: schoolConfig.zoom,
          duration: 1500
        });

        // Cargar la escuela inmediatamente (skipFlyTo=true porque ya hicimos el flyTo arriba)
        mlLoadSchool(school.id, true);

        // Actualizar variables globales si existen
        if (typeof currentSchoolId !== 'undefined') {
          window.currentSchoolId = school.id;
        }
        if (typeof currentSchoolName !== 'undefined') {
          window.currentSchoolName = school.nombre;
        }
      } else {
        // Fallback para escuelas no configuradas en MAPLIBRE_SCHOOLS
        mlMap.flyTo({
          center: school.coords,
          zoom: school.zoom || 17,
          duration: 1500
        });
        console.warn('Escuela no configurada en MAPLIBRE_SCHOOLS:', school.id);
        if (typeof showToast === 'function') {
          showToast('Esta escuela aún no está disponible', 'info');
        }
      }
    };
  }
}

// ============================================
// UTILIDADES PÚBLICAS
// ============================================

/**
 * Centra el mapa en coordenadas
 */
function mlFlyTo(lng, lat, zoom = 16) {
  if (!mlMap) return;
  mlMap.flyTo({
    center: [lng, lat],
    zoom: zoom,
    duration: 1500
  });
}

/**
 * Obtiene el mapa actual
 */
function mlGetMap() {
  return mlMap;
}

/**
 * Obtiene la escuela actual
 */
function mlGetCurrentSchool() {
  return mlCurrentSchool;
}

// ============================================
// INICIALIZACIÓN AUTOMÁTICA
// ============================================

let mlMapInitialized = false;

// Función que será llamada por initMap si USE_MAPLIBRE es true
function initMap() {
  if (typeof USE_MAPLIBRE !== 'undefined' && USE_MAPLIBRE) {
    console.log('Usando MapLibre GL JS');
    // No inicializar inmediatamente, esperar a que el contenedor sea visible
    mlMapInitialized = false;
    console.log('MapLibre listo para inicializar cuando se muestre el mapa');
  } else {
    console.log('USE_MAPLIBRE está desactivado, se esperaba Google Maps');
  }
}

/**
 * Configura el botón de centrar mapa (Spain Reset)
 */
function setupResetViewButton() {
  const resetBtn = document.getElementById('resetViewBtn');
  if (!resetBtn) {
    console.warn('Botón resetViewBtn no encontrado');
    return;
  }

  // Función para actualizar visibilidad
  const updateVisibility = () => {
    if (!mlMap) return;
    const currentZoom = mlMap.getZoom();
    // Aparece solo cuando estamos "a la altura de una escuela" (zoom > 13.5)
    // El reset nos lleva a zoom 13, así que ahí desaparecerá
    if (currentZoom > 13.5) {
      resetBtn.style.display = 'flex'; // o 'block', dependiendo de tu CSS, flex es común para centrar iconos
    } else {
      resetBtn.style.display = 'none';
    }
  };

  // Listener para el click
  resetBtn.addEventListener('click', () => {
    if (!mlMap) {
      console.warn('Mapa no está inicializado');
      return;
    }

    // Centrar mapa en la vista general
    mlMap.flyTo({
      center: MAP_DEFAULTS.center,
      zoom: MAP_DEFAULTS.zoom,
      duration: 1500
    });

    // Cerrar popups abiertos
    if (mlRoutePopup) mlRoutePopup.remove();
    if (mlSectorPopup) mlSectorPopup.remove();
    if (mlParkingPopup) mlParkingPopup.remove();
    if (mlSchoolPopup) mlSchoolPopup.remove();
  });

  // Listeners para cambios de zoom
  if (mlMap) {
    mlMap.on('zoom', updateVisibility);
    // Ejecutar una vez al inicio para establecer estado inicial
    updateVisibility();
  } else {
    // Si el mapa aún no está listo, esperar al evento maplibre:ready o similar,
    // pero como esta función se llama desde onMapLoad, mlMap ya debería existir.
    console.warn('setupResetViewButton llamado sin mlMap listo');
  }

  console.log('Botón de centrar mapa (Spain Reset) activado con control de visibilidad');
}

/**
 * Inicializa o redimensiona el mapa cuando la vista se hace visible
 * Llamar desde switchView cuando viewId === 'map-view'
 */
function mlEnsureMapReady() {
  if (!USE_MAPLIBRE) return;

  if (!mlMapInitialized) {
    console.log('Inicializando MapLibre por primera vez...');
    initMapLibre();
    mlMapInitialized = true;
  } else if (mlMap) {
    // El mapa ya existe, solo redimensionar
    console.log('Redimensionando MapLibre...');
    setTimeout(() => {
      mlMap.resize();
    }, 100);
  }
}

// Exponer funciones globalmente
window.initMapLibre = initMapLibre;
window.mlLoadSchool = mlLoadSchool;
window.mlToggle3D = mlToggle3D;
window.mlFlyTo = mlFlyTo;
window.mlGetMap = mlGetMap;
window.mlOpenRouteDetails = mlOpenRouteDetails;
window.mlEnsureMapReady = mlEnsureMapReady;
window.getGradeColor = getGradeColor;

// ============================================
// BOTTOM SHEET - Escuelas (Mobile Only)
// Rediseñado según mockups de Flighty/Apple Maps
// ============================================

// Variables globales del Bottom Sheet
let bsCurrentSchool = null;
let bsCurrentState = 'hidden'; // 'hidden', 'summary', 'expanded'
let bsDragStartY = 0;
let bsCurrentY = 0;
let bsIsDragging = false;
let bsGradeData = null; // Cache de datos de grados

// Constantes de snap points (porcentaje de pantalla)
const BS_SUMMARY_PERCENT = 0.35; // 35% de la pantalla
const BS_EXPANDED_PERCENT = 0.90; // 90% de la pantalla

/**
 * Detecta si estamos en dispositivo móvil
 */
function isMobileDevice() {
  return window.innerWidth <= 768 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Inicializa el Bottom Sheet
 */
function initBottomSheet() {
  const bottomSheet = document.getElementById('school-bottom-sheet');
  const overlay = document.getElementById('bottom-sheet-overlay');
  const handle = bottomSheet?.querySelector('.bottom-sheet-handle');

  if (!bottomSheet || !overlay || !handle) {
    console.warn('Bottom Sheet elementos no encontrados');
    return;
  }

  // Event listeners para gestos táctiles en el handle
  handle.addEventListener('touchstart', bsHandleTouchStart, { passive: true });
  handle.addEventListener('touchmove', bsHandleTouchMove, { passive: false });
  handle.addEventListener('touchend', bsHandleTouchEnd, { passive: true });

  // También permitir drag desde el header
  const header = bottomSheet.querySelector('.bs-header');
  if (header) {
    header.addEventListener('touchstart', bsHandleTouchStart, { passive: true });
    header.addEventListener('touchmove', bsHandleTouchMove, { passive: false });
    header.addEventListener('touchend', bsHandleTouchEnd, { passive: true });
  }

  // Mouse events para desktop testing
  handle.addEventListener('mousedown', bsHandleMouseDown);
  document.addEventListener('mousemove', bsHandleMouseMove);
  document.addEventListener('mouseup', bsHandleMouseUp);

  // Click en overlay cierra el Bottom Sheet
  overlay.addEventListener('click', hideBottomSheet);

  // Botón direcciones
  const btnDirections = document.getElementById('bs-btn-directions');
  if (btnDirections) {
    btnDirections.addEventListener('click', () => {
      if (bsCurrentSchool) {
        const lat = bsCurrentSchool.coords[1];
        const lng = bsCurrentSchool.coords[0];
        const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
        window.open(gmapsUrl, '_blank');
      }
    });
  }

  // Botón visitar
  const btnVisit = document.getElementById('bs-btn-visit');
  if (btnVisit) {
    btnVisit.addEventListener('click', () => {
      console.log('Click en Visitar Escuela. bsCurrentSchool:', bsCurrentSchool);

      if (!bsCurrentSchool) {
        console.error('bsCurrentSchool es null');
        if (typeof showToast === 'function') {
          showToast('Error: No se pudo cargar la información de la escuela', 'error');
        }
        return;
      }

      if (!bsCurrentSchool.id) {
        console.error('bsCurrentSchool no tiene ID:', bsCurrentSchool);
        if (typeof showToast === 'function') {
          showToast('Error: Escuela sin identificador', 'error');
        }
        return;
      }

      if (!MAPLIBRE_SCHOOLS[bsCurrentSchool.id]) {
        console.warn('Escuela no configurada en MAPLIBRE_SCHOOLS:', bsCurrentSchool.id);
        if (typeof showToast === 'function') {
          showToast('Esta escuela aún no está disponible', 'info');
        }
        return;
      }

      // Todo OK, proceder con la navegación
      const schoolId = bsCurrentSchool.id;
      const schoolName = bsCurrentSchool.nombre;
      const schoolConfig = MAPLIBRE_SCHOOLS[schoolId];

      hideBottomSheet();

      mlMap.flyTo({
        center: schoolConfig.center,
        zoom: schoolConfig.zoom,
        duration: 1500
      });

      mlLoadSchool(schoolId, true);

      if (typeof window.currentSchoolId !== 'undefined') {
        window.currentSchoolId = schoolId;
      }
      if (typeof window.currentSchoolName !== 'undefined') {
        window.currentSchoolName = schoolName;
      }
    });
  }

  console.log('Bottom Sheet inicializado');
}

/**
 * Muestra el Bottom Sheet con datos de la escuela
 */
function showBottomSheet(school) {
  console.log('showBottomSheet llamado con:', school);

  if (!isMobileDevice()) {
    return false;
  }

  const bottomSheet = document.getElementById('school-bottom-sheet');
  const overlay = document.getElementById('bottom-sheet-overlay');

  if (!bottomSheet || !overlay) {
    console.error('Bottom Sheet elementos no encontrados');
    return false;
  }

  bsCurrentSchool = school;
  bsGradeData = null;

  console.log('bsCurrentSchool establecido a:', bsCurrentSchool);

  // Actualizar contenido básico
  updateBottomSheetContent(school);

  // Reset del estado de favorito
  const btnFavorite = document.getElementById('bs-btn-favorite');
  if (btnFavorite) btnFavorite.classList.remove('active');

  // Mostrar elementos
  bottomSheet.classList.remove('hidden');
  overlay.classList.remove('hidden');

  // Abrir directamente en estado expandido
  requestAnimationFrame(() => {
    bottomSheet.classList.remove('snap-summary');
    bottomSheet.classList.add('snap-expanded');
    overlay.classList.add('visible');
  });

  bsCurrentState = 'expanded';

  // Cargar estadísticas (esto actualiza los gráficos)
  loadBottomSheetStats(school.id);

  // Cargar clima
  loadBottomSheetWeather(school);

  return true;
}

/**
 * Oculta el Bottom Sheet
 */
function hideBottomSheet() {
  const bottomSheet = document.getElementById('school-bottom-sheet');
  const overlay = document.getElementById('bottom-sheet-overlay');

  if (!bottomSheet || !overlay) return;

  bottomSheet.classList.remove('snap-summary', 'snap-expanded');
  overlay.classList.remove('visible');

  setTimeout(() => {
    bottomSheet.classList.add('hidden');
    overlay.classList.add('hidden');
  }, 400);

  bsCurrentState = 'hidden';
  bsCurrentSchool = null;
  bsGradeData = null;
}

/**
 * Expande el Bottom Sheet a vista completa
 */
function expandBottomSheet() {
  const bottomSheet = document.getElementById('school-bottom-sheet');
  if (!bottomSheet) return;

  bottomSheet.classList.remove('snap-summary');
  bottomSheet.classList.add('snap-expanded');
  bsCurrentState = 'expanded';
}

/**
 * Colapsa el Bottom Sheet a vista resumen
 */
function collapseBottomSheet() {
  const bottomSheet = document.getElementById('school-bottom-sheet');
  if (!bottomSheet) return;

  bottomSheet.classList.remove('snap-expanded');
  bottomSheet.classList.add('snap-summary');
  bsCurrentState = 'summary';
}

/**
 * Actualiza el contenido del Bottom Sheet
 */
function updateBottomSheetContent(school) {
  // Título (mayúsculas)
  const titleEl = document.getElementById('bs-school-name');
  if (titleEl) titleEl.textContent = school.nombre.toUpperCase();

  // Tipo de roca
  const rockEl = document.getElementById('bs-rock-type');
  if (rockEl) rockEl.textContent = school.rockType || 'Caliza';

  // Reset del total (se actualizará con loadBottomSheetStats)
  const totalEl = document.getElementById('bs-total-vias');
  if (totalEl) totalEl.textContent = '';
}

// ============================================
// GESTOS TÁCTILES
// ============================================

function bsHandleTouchStart(e) {
  bsIsDragging = true;
  bsDragStartY = e.touches[0].clientY;
  bsCurrentY = bsDragStartY;

  const bottomSheet = document.getElementById('school-bottom-sheet');
  if (bottomSheet) {
    bottomSheet.style.transition = 'none';
  }
}

function bsHandleTouchMove(e) {
  if (!bsIsDragging) return;
  e.preventDefault();

  const deltaY = e.touches[0].clientY - bsDragStartY;
  bsCurrentY = e.touches[0].clientY;

  const bottomSheet = document.getElementById('school-bottom-sheet');
  if (!bottomSheet) return;

  // Calcular posición actual como porcentaje
  const windowHeight = window.innerHeight;
  let currentPercent;

  if (bsCurrentState === 'summary') {
    currentPercent = 100 - (BS_SUMMARY_PERCENT * 100);
  } else {
    currentPercent = 100 - (BS_EXPANDED_PERCENT * 100);
  }

  const deltaPercent = (deltaY / windowHeight) * 100;
  const newPercent = Math.max(10, Math.min(100, currentPercent + deltaPercent));

  bottomSheet.style.transform = `translateY(${newPercent}%)`;
}

function bsHandleTouchEnd() {
  if (!bsIsDragging) return;
  bsIsDragging = false;

  const bottomSheet = document.getElementById('school-bottom-sheet');
  if (!bottomSheet) return;

  bottomSheet.style.transition = '';
  bottomSheet.style.transform = '';

  const deltaY = bsCurrentY - bsDragStartY;

  // Swipe down cierra el Bottom Sheet (solo hay un estado: expandido)
  if (deltaY > 40) {
    hideBottomSheet();
  }
  // Swipe up no hace nada (ya está expandido)
}

// Mouse events para testing en desktop
function bsHandleMouseDown(e) {
  bsIsDragging = true;
  bsDragStartY = e.clientY;
  bsCurrentY = bsDragStartY;

  const bottomSheet = document.getElementById('school-bottom-sheet');
  if (bottomSheet) {
    bottomSheet.style.transition = 'none';
  }
  e.preventDefault();
}

function bsHandleMouseMove(e) {
  if (!bsIsDragging) return;

  const deltaY = e.clientY - bsDragStartY;
  bsCurrentY = e.clientY;

  const bottomSheet = document.getElementById('school-bottom-sheet');
  if (!bottomSheet) return;

  const windowHeight = window.innerHeight;
  let currentPercent;

  if (bsCurrentState === 'summary') {
    currentPercent = 100 - (BS_SUMMARY_PERCENT * 100);
  } else {
    currentPercent = 100 - (BS_EXPANDED_PERCENT * 100);
  }

  const deltaPercent = (deltaY / windowHeight) * 100;
  const newPercent = Math.max(10, Math.min(100, currentPercent + deltaPercent));

  bottomSheet.style.transform = `translateY(${newPercent}%)`;
}

function bsHandleMouseUp() {
  if (!bsIsDragging) return;
  bsIsDragging = false;

  const bottomSheet = document.getElementById('school-bottom-sheet');
  if (!bottomSheet) return;

  bottomSheet.style.transition = '';
  bottomSheet.style.transform = '';

  const deltaY = bsCurrentY - bsDragStartY;

  // Swipe down cierra el Bottom Sheet (solo hay un estado: expandido)
  if (deltaY > 40) {
    hideBottomSheet();
  }
}

// ============================================
// GRÁFICO DE BARRAS (Vista Resumen)
// Colores según mockup: verde → amarillo → naranja → rojo
// ============================================

/**
 * Renderiza el gráfico de barras de vías por grado
 */
function renderBarChart(gradeData, total) {
  const container = document.getElementById('bs-bar-chart');
  const totalEl = document.getElementById('bs-total-vias');

  if (!container) return;

  // Actualizar total
  if (totalEl && total > 0) {
    totalEl.textContent = `(${total} total)`;
  }

  if (!gradeData || Object.keys(gradeData).length === 0) {
    container.innerHTML = '<div style="color: #9ca3af; text-align: center; font-size: 13px; width: 100%; padding: 20px;">Cargando datos...</div>';
    return;
  }

  // Ordenar grados
  const sortedGrades = sortGrades(Object.keys(gradeData));
  const maxCount = Math.max(...Object.values(gradeData));
  const maxHeight = 90; // px máximo de altura

  let html = '';
  sortedGrades.forEach((grade, index) => {
    const count = gradeData[grade];
    const heightPx = Math.max(8, (count / maxCount) * maxHeight);
    const color = getGradeColor(grade);
    const delay = index * 0.03;

    html += `
      <div class="bs-bar-item">
        <span class="bs-bar-count">${count}</span>
        <div class="bs-bar" style="
          height: ${heightPx}px;
          background: ${color};
          --bar-delay: ${delay}s;
        "></div>
        <span class="bs-bar-label">${grade}</span>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ============================================
// GRÁFICO CIRCULAR DONUT (Vista Expandida)
// ============================================

/**
 * Renderiza el gráfico donut con total de vías
 */
function renderDonutChart(gradeData) {
  const container = document.getElementById('bs-donut-chart');
  if (!container) return;

  if (!gradeData || Object.keys(gradeData).length === 0) {
    container.innerHTML = '<div style="color: #9ca3af; text-align: center; font-size: 14px; padding: 40px;">Sin datos</div>';
    return;
  }

  const total = Object.values(gradeData).reduce((a, b) => a + b, 0);
  const sortedGrades = sortGrades(Object.keys(gradeData));

  const size = 200;
  const center = size / 2;
  const radius = 75;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;

  let segments = '';
  let currentOffset = 0;

  sortedGrades.forEach((grade, index) => {
    const count = gradeData[grade];
    const percent = count / total;
    const segmentLength = circumference * percent;
    const color = getGradeColor(grade);
    const delay = index * 0.05;

    segments += `
      <circle
        class="bs-donut-segment"
        data-grade="${grade}"
        data-count="${count}"
        cx="${center}"
        cy="${center}"
        r="${radius}"
        fill="none"
        stroke="${color}"
        stroke-width="${strokeWidth}"
        stroke-dasharray="${segmentLength} ${circumference}"
        stroke-dashoffset="${-currentOffset}"
        stroke-linecap="butt"
        style="--circumference: ${circumference}; --final-offset: ${-currentOffset}; --segment-delay: ${delay}s; cursor: pointer;"
      />
    `;

    currentOffset += segmentLength;
  });

  const defaultCenterContent = `
    <div class="bs-donut-total">${total}</div>
    <div class="bs-donut-label">Vías</div>
  `;

  container.innerHTML = `
    <svg viewBox="0 0 ${size} ${size}">
      <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="#e5e7eb" stroke-width="${strokeWidth}" />
      ${segments}
    </svg>
    <div class="bs-donut-center" id="bs-donut-center">
      ${defaultCenterContent}
    </div>
  `;

  // Añadir interactividad a los segmentos
  const svgSegments = container.querySelectorAll('.bs-donut-segment');
  const centerText = document.getElementById('bs-donut-center');

  svgSegments.forEach(segment => {
    segment.addEventListener('mouseenter', () => {
      const grade = segment.getAttribute('data-grade');
      const count = segment.getAttribute('data-count');
      const color = segment.getAttribute('stroke');

      centerText.innerHTML = `
        <div class="bs-donut-total" style="color: ${color};">${grade}</div>
        <div class="bs-donut-label">${count} Vías</div>
      `;
    });

    segment.addEventListener('mouseleave', () => {
      centerText.innerHTML = defaultCenterContent;
    });
  });
}

// ============================================
// CARGA DE DATOS
// ============================================

/**
 * Carga estadísticas de la escuela para el Bottom Sheet
 */
async function loadBottomSheetStats(schoolId) {
  const schoolConfig = MAPLIBRE_SCHOOLS[schoolId];

  // Referencias a elementos
  const barSkeleton = document.getElementById('bs-bar-skeleton');
  const barContainer = document.getElementById('bs-bar-chart');
  const donutSkeleton = document.getElementById('bs-donut-skeleton');
  const donutContainer = document.getElementById('bs-donut-chart');

  // Mostrar skeletons, ocultar gráficos
  if (barSkeleton) barSkeleton.classList.remove('hidden');
  if (barContainer) barContainer.classList.add('hidden');
  if (donutSkeleton) donutSkeleton.classList.remove('hidden');
  if (donutContainer) donutContainer.classList.add('hidden');

  if (!schoolConfig) {
    console.warn('Escuela no configurada en MAPLIBRE_SCHOOLS:', schoolId);
    hideSkeletonsShowCharts();
    renderBarChart({}, 0);
    renderDonutChart({});
    return;
  }

  try {
    // Usar la ruta del GeoJSON de vías desde la configuración
    const viasPath = schoolConfig.geojson?.vias;
    if (!viasPath) {
      throw new Error('No hay ruta de vías configurada');
    }

    const response = await fetch(viasPath);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const geojson = await response.json();

    if (!geojson.features || geojson.features.length === 0) {
      hideSkeletonsShowCharts();
      renderBarChart({}, 0);
      renderDonutChart({});
      return;
    }

    // Contar vías por grado
    const gradeCount = {};
    let totalVias = 0;

    geojson.features.forEach(feature => {
      const grade = feature.properties?.grado1;
      if (grade) {
        const normalizedGrade = grade.toLowerCase().trim();
        gradeCount[normalizedGrade] = (gradeCount[normalizedGrade] || 0) + 1;
        totalVias++;
      }
    });

    // Guardar en cache
    bsGradeData = gradeCount;

    // Ocultar skeletons, mostrar gráficos
    hideSkeletonsShowCharts();

    // Renderizar gráficos
    renderBarChart(gradeCount, totalVias);
    renderDonutChart(gradeCount);

  } catch (error) {
    console.warn('Error cargando stats para Bottom Sheet:', error);
    hideSkeletonsShowCharts();
    renderBarChart({}, 0);
    renderDonutChart({});
  }
}

/**
 * Oculta los skeletons y muestra los contenedores de gráficos
 */
function hideSkeletonsShowCharts() {
  const barSkeleton = document.getElementById('bs-bar-skeleton');
  const barContainer = document.getElementById('bs-bar-chart');
  const donutSkeleton = document.getElementById('bs-donut-skeleton');
  const donutContainer = document.getElementById('bs-donut-chart');

  if (barSkeleton) barSkeleton.classList.add('hidden');
  if (barContainer) barContainer.classList.remove('hidden');
  if (donutSkeleton) donutSkeleton.classList.add('hidden');
  if (donutContainer) donutContainer.classList.remove('hidden');
}

/**
 * Variable global para almacenar datos del pronóstico semanal del Bottom Sheet
 */
let bsWeatherForecastData = null;

/**
 * Carga datos meteorológicos para el Bottom Sheet (actual + 7 días)
 */
async function loadBottomSheetWeather(school) {
  const tempEl = document.getElementById('bs-weather-temp');
  const precipEl = document.getElementById('bs-weather-precip');
  const rainEl = document.getElementById('bs-weather-rain');
  const windDirEl = document.getElementById('bs-weather-wind-dir');
  const windSpeedEl = document.getElementById('bs-weather-wind-speed');
  const iconEl = document.getElementById('bs-weather-icon');
  const forecastPanel = document.getElementById('bs-forecast-panel');
  const forecastScroll = document.getElementById('bs-forecast-scroll');

  if (!tempEl || !precipEl || !rainEl) return;

  // Mostrar loading state
  tempEl.textContent = '--°C';
  precipEl.textContent = '--%';
  rainEl.textContent = '-- mm';
  if (windDirEl) windDirEl.textContent = '-';
  if (windSpeedEl) windSpeedEl.textContent = '--';

  // Resetear panel de pronóstico
  bsWeatherForecastData = null;
  if (forecastPanel) {
    forecastPanel.classList.add('hidden');
    forecastPanel.classList.remove('visible');
  }
  const weatherCard = document.getElementById('bs-weather-widget');
  if (weatherCard) {
    weatherCard.classList.remove('expanded');
  }
  if (forecastScroll) {
    forecastScroll.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;">Cargando pronóstico...</div>';
  }

  try {
    const lat = school.coords[1];
    const lng = school.coords[0];
    // Solicitar datos actuales + pronóstico de 7 días
    const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant&timezone=auto&forecast_days=7`;

    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error('Weather API error');

    const data = await response.json();
    const current = data.current;

    if (current) {
      tempEl.textContent = `${Math.round(current.temperature_2m)}°C`;
      precipEl.textContent = `${current.precipitation_probability || 0}%`;
      rainEl.textContent = `${current.precipitation || 0} mm`;
      if (windDirEl) windDirEl.textContent = getWindDirection(current.wind_direction_10m || 0);
      if (windSpeedEl) windSpeedEl.textContent = `${Math.round(current.wind_speed_10m)}`;

      // Actualizar icono según código del tiempo
      const weatherCode = current.weather_code;
      const iconName = getWeatherIconName(weatherCode);
      if (iconEl && iconName) {
        iconEl.src = `icons/weather/${iconName}.png`;
        iconEl.onerror = () => {
          iconEl.src = 'icons/weather/partly-cloudy.png';
        };
      }
    }

    // Guardar datos del pronóstico y renderizar
    if (data.daily) {
      bsWeatherForecastData = data.daily;
      renderBottomSheetForecast(data.daily);
    }
  } catch (error) {
    console.warn('Error cargando clima para Bottom Sheet:', error);
    if (forecastScroll) {
      forecastScroll.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;">No se pudo cargar el pronóstico</div>';
    }
  }
}

/**
 * Renderiza el pronóstico semanal en el panel del Bottom Sheet
 */
function renderBottomSheetForecast(dailyData) {
  const forecastScroll = document.getElementById('bs-forecast-scroll');
  if (!forecastScroll || !dailyData) return;

  let html = '';
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  for (let i = 0; i < Math.min(7, dailyData.time.length); i++) {
    const dateObj = new Date(dailyData.time[i] + 'T00:00:00');
    const dayName = days[dateObj.getDay()];
    const dateStr = `${dateObj.getDate()} ${months[dateObj.getMonth()]}`;
    const maxTemp = Math.round(dailyData.temperature_2m_max[i]);
    const minTemp = Math.round(dailyData.temperature_2m_min[i]);
    const precipProb = dailyData.precipitation_probability_max[i] || 0;
    const precipSum = dailyData.precipitation_sum[i] || 0;
    const windSpeed = Math.round(dailyData.wind_speed_10m_max[i]);
    const windDir = getWindDirection(dailyData.wind_direction_10m_dominant[i]);
    const weatherCode = dailyData.weather_code[i];
    const iconName = getWeatherIconName(weatherCode);

    // Destacar "Hoy" si es el primer día
    const isToday = i === 0;
    const displayDayName = isToday ? 'Hoy' : dayName;

    html += `
      <div class="bs-forecast-day">
        <div class="bs-forecast-day-info">
          <div class="bs-forecast-day-name">${displayDayName}</div>
          <div class="bs-forecast-day-date">${dateStr}</div>
        </div>
        <div class="bs-forecast-icon-wrap">
          <img src="icons/weather/${iconName}.png" alt="Clima" onerror="this.src='icons/weather/partly-cloudy.png'">
        </div>
        <div class="bs-forecast-temps">
          <span class="bs-forecast-temp-max">${maxTemp}°</span>
          <span class="bs-forecast-temp-min">${minTemp}°</span>
        </div>
        <div class="bs-forecast-details">
          <span class="bs-forecast-precip">
            <img src="icons/weather/Gota.png" alt="" onerror="this.style.display='none'">
            ${precipProb}%|${precipSum} mm
          </span>
          <span class="bs-forecast-wind">${windDir} ${windSpeed} km/h</span>
        </div>
      </div>
    `;
  }

  forecastScroll.innerHTML = html;
}

/**
 * Toggle del panel de pronóstico semanal en el Bottom Sheet
 */
function toggleBottomSheetForecast() {
  const forecastPanel = document.getElementById('bs-forecast-panel');
  const weatherCard = document.getElementById('bs-weather-widget');

  if (!forecastPanel || !weatherCard) return;

  const isHidden = forecastPanel.classList.contains('hidden');

  if (isHidden) {
    // Mostrar panel
    forecastPanel.classList.remove('hidden');
    weatherCard.classList.add('expanded');
    // Pequeño delay para la animación
    requestAnimationFrame(() => {
      forecastPanel.classList.add('visible');
    });
  } else {
    // Ocultar panel
    forecastPanel.classList.remove('visible');
    weatherCard.classList.remove('expanded');
    // Esperar animación antes de ocultar
    setTimeout(() => {
      forecastPanel.classList.add('hidden');
    }, 300);
  }
}

/**
 * Inicializa los eventos del panel de pronóstico
 */
function initBottomSheetForecastEvents() {
  const weatherCard = document.getElementById('bs-weather-widget');
  const forecastClose = document.getElementById('bs-forecast-close');

  if (weatherCard) {
    weatherCard.addEventListener('click', (e) => {
      // Evitar toggle si no hay datos
      if (bsWeatherForecastData) {
        toggleBottomSheetForecast();
      }
    });
  }

  if (forecastClose) {
    forecastClose.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBottomSheetForecast();
    });
  }
}

// Inicializar eventos cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBottomSheetForecastEvents);
} else {
  initBottomSheetForecastEvents();
}

/**
 * Obtiene el nombre del icono según el código WMO
 */
function getWeatherIconName(code) {
  if (code === 0) return 'clear-day';
  if (code >= 1 && code <= 3) return 'partly-cloudy';
  if (code >= 45 && code <= 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'rain';
  if (code >= 85 && code <= 86) return 'snow';
  if (code >= 95 && code <= 99) return 'thunderstorm';
  return 'partly-cloudy';
}

// ============================================
// INTEGRACIÓN CON MAPA
// ============================================

/**
 * Modifica setupSchoolLayerInteraction para usar Bottom Sheet en móvil
 */
const originalSetupSchoolLayerInteraction = setupSchoolLayerInteraction;

setupSchoolLayerInteraction = function () {
  // Cursor pointer al hover
  mlMap.on('mouseenter', 'school-markers-layer', () => {
    mlMap.getCanvas().style.cursor = 'pointer';
  });

  mlMap.on('mouseleave', 'school-markers-layer', () => {
    mlMap.getCanvas().style.cursor = '';
  });

  // Click en marker de escuela
  mlMap.on('click', 'school-markers-layer', (e) => {
    if (!e.features || e.features.length === 0) return;

    const feature = e.features[0];
    const props = feature.properties;

    // Reconstruir objeto school desde properties
    const school = {
      id: props.id,
      nombre: props.nombre,
      coords: JSON.parse(props.coords),
      zoom: props.zoom,
      isOpen: props.isOpen,
      rockType: props.rockType
    };

    // En móvil, usar Bottom Sheet
    if (isMobileDevice()) {
      // Cerrar popup existente si hay
      if (mlSchoolPopup) mlSchoolPopup.remove();

      // Mostrar Bottom Sheet (sin centrar el mapa)
      showBottomSheet(school);
    } else {
      // En desktop, usar popup tradicional
      mlMap.flyTo({
        center: school.coords,
        zoom: mlMap.getZoom(),
        speed: 0.8,
        curve: 1,
        padding: { top: 450, bottom: 0, left: 0, right: 0 }
      });

      showSchoolPopup(school, null);
    }
  });
};

// Inicializar Bottom Sheet cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBottomSheet);
} else {
  initBottomSheet();
}

// Exponer funciones del Bottom Sheet
window.showBottomSheet = showBottomSheet;
window.hideBottomSheet = hideBottomSheet;
window.expandBottomSheet = expandBottomSheet;
window.collapseBottomSheet = collapseBottomSheet;

// ============================================
// FUNCIONES AUXILIARES PARA ROUTE DRAWING
// ============================================

/**
 * Verifica si el usuario es admin (para popup de vía)
 */
async function isRoutePopupAdmin() {
  try {
    const user = auth.currentUser;
    if (!user) return false;

    const adminDoc = await db.collection('admins').doc(user.uid).get();
    return adminDoc.exists && adminDoc.data().role === 'admin';
  } catch (error) {
    console.error('[RoutePopup] Error verificando admin:', error);
    return false;
  }
}

/**
 * Abre el editor de dibujo desde el popup de vía
 */
function mlOpenDrawingEditor(encodedName) {
  const routeName = decodeURIComponent(encodedName);

  // Cerrar popup
  if (mlRoutePopup) mlRoutePopup.remove();

  // Llamar a función de route-drawing.js
  if (typeof openDrawingEditorForRoute === 'function') {
    openDrawingEditorForRoute(routeName);
  } else {
    console.error('[RoutePopup] openDrawingEditorForRoute no está disponible');
  }
}

// Exponer función
window.mlOpenDrawingEditor = mlOpenDrawingEditor;

// ============================================
// CARGA DE VÍAS APROBADAS DESDE FIRESTORE
// ============================================

/**
 * Carga las vías aprobadas desde Firestore y las añade al mapa
 * @param {string} schoolId - ID de la escuela
 * @param {number} minZoom - Nivel de zoom mínimo para mostrar las vías (mismo que vías oficiales)
 */
async function loadApprovedRoutesFromFirestore(schoolId, minZoom = 14) {
  try {
    // Verificar que Firebase esté disponible
    if (typeof firebase === 'undefined' || !firebase.firestore) {
      console.log('[ApprovedRoutes] Firebase no disponible');
      return;
    }

    const db = firebase.firestore();

    // Buscar vías aprobadas para esta escuela
    const snapshot = await db.collection('pending_routes')
      .where('schoolId', '==', schoolId)
      .where('status', '==', 'approved')
      .get();

    if (snapshot.empty) {
      console.log(`[ApprovedRoutes] No hay vías aprobadas para ${schoolId}`);
      return;
    }

    // Convertir a formato GeoJSON
    const features = [];
    snapshot.forEach(doc => {
      const data = doc.data();

      // Obtener coordenadas (pueden estar en diferentes formatos)
      let coordinates = null;
      if (data.coordinates && Array.isArray(data.coordinates)) {
        coordinates = data.coordinates;
      } else if (data.geojsonFeature?.geometry) {
        const geom = data.geojsonFeature.geometry;
        if (geom.coordinates) {
          coordinates = geom.coordinates;
        } else if (geom.lng !== undefined && geom.lat !== undefined) {
          coordinates = [geom.lng, geom.lat];
        }
      }

      if (!coordinates) {
        console.warn(`[ApprovedRoutes] Ruta sin coordenadas: ${doc.id}`);
        return;
      }

      features.push({
        type: 'Feature',
        properties: {
          fid: `user_${doc.id}`,
          nombre: data.nombre || data.geojsonFeature?.properties?.nombre || 'Sin nombre',
          grado1: data.grado1 || data.geojsonFeature?.properties?.grado1 || '?',
          sector: data.sector || data.geojsonFeature?.properties?.sector || '',
          exp1: data.exp1 || data.geojsonFeature?.properties?.exp1 || '',
          long1: data.long1 || data.geojsonFeature?.properties?.long1 || '',
          descripcion: data.descripcion || data.geojsonFeature?.properties?.descripcion || '',
          modalidad: data.modalidad || data.geojsonFeature?.properties?.modalidad || 'Simple',
          variante: data.variante || data.geojsonFeature?.properties?.variante || 'NO',
          isUserRoute: true,
          approvedBy: data.approvedBy || '',
          createdByEmail: data.createdByEmail || ''
        },
        geometry: {
          type: 'Point',
          coordinates: coordinates
        }
      });
    });

    if (features.length === 0) {
      console.log(`[ApprovedRoutes] No se pudieron procesar vías para ${schoolId}`);
      return;
    }

    const geojson = {
      type: 'FeatureCollection',
      features: features
    };

    console.log(`[ApprovedRoutes] Cargando ${features.length} vías de usuarios para ${schoolId}`);

    // Añadir source y layer al mapa
    const sourceId = 'vias-usuarios-source';
    const layerId = 'vias-usuarios-layer';

    // Remover si ya existe
    if (mlMap.getLayer(layerId)) {
      mlMap.removeLayer(layerId);
    }
    if (mlMap.getSource(sourceId)) {
      mlMap.removeSource(sourceId);
    }

    // Añadir source
    mlMap.addSource(sourceId, {
      type: 'geojson',
      data: geojson
    });

    // Añadir layer con estilo similar a las vías oficiales pero con borde diferente
    mlMap.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      minzoom: minZoom,
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          14, isMobileDevice() ? 2 : 3,
          16, isMobileDevice() ? 3.5 : 5,
          18, isMobileDevice() ? 5.5 : 8,
          20, isMobileDevice() ? 9 : 14
        ],
        'circle-color': generateGradeColorExpression('grado1'),
        'circle-stroke-color': '#FFD700', // Borde dorado para distinguir vías de usuarios
        'circle-stroke-width': isMobileDevice() ? 2 : 2.5,
        'circle-opacity': 0.95
      }
    });

    // Añadir interactividad
    setupUserViasInteraction();

    console.log(`[ApprovedRoutes] ✅ Capa de vías de usuarios añadida para ${schoolId}`);

  } catch (error) {
    console.error('[ApprovedRoutes] Error cargando vías aprobadas:', error);
  }
}

/**
 * Configura la interactividad para las vías de usuarios
 */
function setupUserViasInteraction() {
  const layerId = 'vias-usuarios-layer';

  // Cursor pointer al hover
  mlMap.on('mouseenter', layerId, () => {
    mlMap.getCanvas().style.cursor = 'pointer';
  });

  mlMap.on('mouseleave', layerId, () => {
    mlMap.getCanvas().style.cursor = '';
  });

  // Click en vía de usuario
  mlMap.on('click', layerId, (e) => {
    if (!e.features || e.features.length === 0) return;

    const feature = e.features[0];
    const props = feature.properties;
    const coords = feature.geometry.coordinates;

    // Mostrar popup con el mismo estilo que las vías oficiales
    showUserRoutePopup(props, coords);
  });
}

/**
 * Muestra popup de ruta de usuario con el mismo diseño que las oficiales
 */
async function showUserRoutePopup(props, coords) {
  const grade = props.grado1 || '?';
  const gradeColor = getGradeColor(grade);
  const routeName = props.nombre || 'Sin nombre';
  const encodedName = encodeURIComponent(routeName);
  const sectorName = props.sector || '';
  const encodedSector = encodeURIComponent(sectorName);
  const schoolId = mlCurrentSchool || 'valeria';

  // Verificar si la vía tiene dibujo en la imagen del sector (para mostrar botón "Ver vía")
  let hasDrawing = false;
  if (sectorName && typeof hasRouteDrawing === 'function') {
    hasDrawing = await hasRouteDrawing(schoolId, sectorName, routeName);
  }

  // Guardar datos de la vía actual para las funciones de los botones
  mlCurrentRouteGrade = grade;
  mlCurrentRouteSector = sectorName;

  // Iconos PNG para info (tamaño 32x32)
  const iconClimber = `<img src="icons/placa.png" alt="Tipo" width="32" height="32">`;
  const iconExpress = `<img src="icons/mosq.png" alt="Expresos" width="32" height="32">`;
  const iconRope = `<img src="icons/cuerda.png" alt="Cuerda" width="32" height="32">`;

  // Iconos SVG de la botonera (tamaño 32x32)
  const iconCheck = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const iconBookmark = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
  const iconComment = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
  const iconShare = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

  const html = `
    <div class="ml-route-popup-new">
      <!-- Header: Nombre + Grado + Badge Usuario -->
      <div class="ml-route-header">
        <span class="ml-route-name">${routeName}</span>
        <span class="ml-route-grade" style="background-color: ${gradeColor}">${grade}</span>
      </div>

      <!-- Info items con iconos -->
      <div class="ml-route-info">
        <div class="ml-route-item ${!props.descripcion ? 'ml-route-item-missing' : ''}">
          <span class="ml-route-icon">${iconClimber}</span>
          ${props.descripcion ? `
            <span class="ml-route-text">${props.descripcion}</span>
          ` : `
            <span class="ml-route-text ml-route-contribute" onclick="mlContributeField('${encodedName}', 'descripcion', '${schoolId}')">
              ¿Qué tipo de escalada es?
            </span>
          `}
        </div>

        <div class="ml-route-item ${!props.exp1 ? 'ml-route-item-missing' : ''}">
          <span class="ml-route-icon">${iconExpress}</span>
          ${props.exp1 ? `
            <span class="ml-route-text">${props.exp1} express</span>
          ` : `
            <span class="ml-route-text ml-route-contribute" onclick="mlContributeField('${encodedName}', 'exp1', '${schoolId}')">
              ¿Cuántos express tiene?
            </span>
          `}
        </div>

        <div class="ml-route-item ${!props.long1 ? 'ml-route-item-missing' : ''}">
          <span class="ml-route-icon">${iconRope}</span>
          ${props.long1 ? `
            <span class="ml-route-text">${props.long1} mts</span>
          ` : `
            <span class="ml-route-text ml-route-contribute" onclick="mlContributeField('${encodedName}', 'long1', '${schoolId}')">
              ¿Cuántos metros tiene?
            </span>
          `}
        </div>
      </div>

      <!-- Botonera -->
      <div class="ml-route-actions">
        <button class="ml-route-action-btn" onclick="mlRegisterAscent('${encodedName}')" title="Registrar ascenso">
          ${iconCheck}
        </button>
        <button class="ml-route-action-btn" onclick="mlToggleBookmark('${encodedName}')" title="Guardar">
          ${iconBookmark}
        </button>
        <button class="ml-route-action-btn" onclick="mlOpenComments('${encodedName}')" title="Comentarios">
          ${iconComment}
        </button>
        <button class="ml-route-action-btn" onclick="mlShareRoute('${encodedName}')" title="Compartir">
          ${iconShare}
        </button>
      </div>

      <!-- Botón Ver vía (solo si tiene dibujo en la imagen) -->
      ${hasDrawing ? `
        <div class="ml-route-view-section">
          <button class="ml-route-view-btn" onclick="mlViewRouteInSector('${schoolId}', '${encodedSector}', '${encodedName}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Ver vía
          </button>
        </div>
      ` : ''}

      <!-- Usuario que subió la vía -->
      ${props.createdByEmail ? `
        <div class="ml-route-uploaded-by">
          Subida por: ${props.createdByEmail}
        </div>
      ` : ''}
    </div>
  `;

  if (mlRoutePopup) mlRoutePopup.remove();

  mlRoutePopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    maxWidth: '340px',
    className: 'ml-route-popup'
  })
    .setLngLat(coords)
    .setHTML(html)
    .addTo(mlMap);
}

// Exponer función para uso externo
window.loadApprovedRoutesFromFirestore = loadApprovedRoutesFromFirestore;

// ============================================
// CONTRIBUCIÓN DE USUARIOS - Sugerencias de info de vías
// ============================================

/**
 * Abre modal para que el usuario contribuya información faltante
 */
function mlContributeField(encodedName, fieldName, schoolId) {
  const routeName = decodeURIComponent(encodedName);

  // Cerrar popup actual
  if (mlRoutePopup) mlRoutePopup.remove();

  // Verificar que el usuario esté logueado
  const user = firebase.auth().currentUser;
  if (!user) {
    alert('Debes iniciar sesión para contribuir información');
    return;
  }

  // Configuración según el campo
  const fieldConfig = {
    descripcion: {
      title: 'Tipo de escalada',
      question: '¿Qué tipo de escalada es esta vía?',
      placeholder: 'Ej: Placa, Desplome, Fisura...',
      inputType: 'select',
      options: ['Placa', 'Vertical', 'Desplome', 'Extraplomo', 'Fisura', 'Diedro', 'Travesía', 'Técnica', 'Atlética', 'Continuidad']
    },
    exp1: {
      title: 'Número de express',
      question: '¿Cuántos express necesitas para esta vía?',
      placeholder: 'Ej: 8',
      inputType: 'number',
      min: 1,
      max: 30
    },
    long1: {
      title: 'Metros de la vía',
      question: '¿Cuántos metros tiene esta vía?',
      placeholder: 'Ej: 25',
      inputType: 'number',
      min: 5,
      max: 100
    }
  };

  const config = fieldConfig[fieldName];
  if (!config) return;

  // Crear modal
  const overlay = document.createElement('div');
  overlay.className = 'ml-contribute-modal-overlay';
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  let inputHtml;
  if (config.inputType === 'select') {
    inputHtml = `
      <select class="ml-contribute-select" id="ml-contribute-value">
        <option value="">Selecciona una opción</option>
        ${config.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
      </select>
    `;
  } else {
    inputHtml = `
      <input
        type="${config.inputType}"
        class="ml-contribute-input"
        id="ml-contribute-value"
        placeholder="${config.placeholder}"
        ${config.min ? `min="${config.min}"` : ''}
        ${config.max ? `max="${config.max}"` : ''}
      >
    `;
  }

  overlay.innerHTML = `
    <div class="ml-contribute-modal">
      <h3>${config.title}</h3>
      <p><strong>${routeName}</strong></p>
      <p>${config.question}</p>
      ${inputHtml}
      <div class="ml-contribute-actions">
        <button class="ml-contribute-btn ml-contribute-btn-cancel" onclick="this.closest('.ml-contribute-modal-overlay').remove()">
          Cancelar
        </button>
        <button class="ml-contribute-btn ml-contribute-btn-submit" id="ml-contribute-submit">
          Enviar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Focus en el input
  const inputEl = document.getElementById('ml-contribute-value');
  if (inputEl) inputEl.focus();

  // Manejar envío
  const submitBtn = document.getElementById('ml-contribute-submit');
  submitBtn.onclick = async () => {
    const value = inputEl.value.trim();

    if (!value) {
      inputEl.style.borderColor = '#ef4444';
      return;
    }

    // Validar números
    if (config.inputType === 'number') {
      const numValue = parseInt(value);
      if (isNaN(numValue) || numValue < config.min || numValue > config.max) {
        inputEl.style.borderColor = '#ef4444';
        return;
      }
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    try {
      // Guardar sugerencia en Firestore
      await saveRouteSuggestion(schoolId, routeName, fieldName, value, user);

      // Mostrar éxito
      const modal = overlay.querySelector('.ml-contribute-modal');
      modal.innerHTML = `
        <div class="ml-contribute-success">
          <div class="ml-contribute-success-icon">✓</div>
          <h3>¡Gracias por contribuir!</h3>
          <p>Tu sugerencia ha sido enviada y será revisada por un administrador.</p>
        </div>
      `;

      // Cerrar automáticamente
      setTimeout(() => overlay.remove(), 2000);

    } catch (error) {
      console.error('Error al guardar sugerencia:', error);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar';
      alert('Error al enviar la sugerencia. Inténtalo de nuevo.');
    }
  };

  // Enviar con Enter
  inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitBtn.click();
  });
}

/**
 * Guarda una sugerencia de usuario en Firestore
 */
async function saveRouteSuggestion(schoolId, routeName, fieldName, value, user) {
  const db = firebase.firestore();

  const suggestion = {
    schoolId: schoolId,
    routeName: routeName,
    field: fieldName,
    suggestedValue: value,
    userId: user.uid,
    userEmail: user.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'pending' // pending, approved, rejected
  };

  await db.collection('routeSuggestions').add(suggestion);

  console.log('Sugerencia guardada:', suggestion);
}

// Exponer función globalmente
window.mlContributeField = mlContributeField;

console.log('MapLibre Map JS cargado');
