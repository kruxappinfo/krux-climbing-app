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
let mlFilterPanelOpen = false;        // Estado del panel de filtro
let mlGradeRangeMin = 0;              // Índice mínimo del rango de grado (0 = primer grado)
let mlGradeRangeMax = -1;             // Índice máximo del rango de grado (-1 = se inicializa al total)
let mlShowOnlyMyRoutes = false;       // Mostrar solo vías realizadas por el usuario

// ============================================
// VARIANT GROUPS STATE
// ============================================
let mlVariantGroups = new Map();       // groupKey → [{ props, coords }, ...]
let mlVariantFeatureIndex = new Map(); // featureId → groupKey (reverse lookup)
let mlCurrentVariantGroup = null;      // Array of variant data for active carousel
let mlCurrentVariantSlide = 0;         // Active slide index in carousel
let mlVariantSwipeStartX = 0;         // Touch swipe tracking

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
      // Capa de etiquetas (encima de todo) - minzoom 7 para mostrar ciudades antes
      {
        id: 'labels-layer',
        type: 'raster',
        source: 'labels-source',
        minzoom: 7,
        maxzoom: 22,
        paint: {
          'raster-opacity': [
            'interpolate', ['linear'], ['zoom'],
            7, 0.6,
            9, 0.8,
            10, 0.9
          ]
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

  // Botón de filtro por grado (esquina superior derecha)
  addGradeFilterButton();
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

  // Verificar proximidad a cada escuela configurada
  for (const schoolId in MAPLIBRE_SCHOOLS) {
    const school = MAPLIBRE_SCHOOLS[schoolId];
    const schoolCenter = school.center; // [lng, lat]

    // Calcular distancia aproximada en grados
    const dLng = Math.abs(center.lng - schoolCenter[0]);
    const dLat = Math.abs(center.lat - schoolCenter[1]);
    const distance = Math.sqrt(dLng * dLng + dLat * dLat);

    // Umbral de proximidad (~2km aprox dependiendo de latitud)
    const threshold = 0.02;

    if (dLng < threshold && dLat < threshold && distance < closestDistance) {
      closestSchool = schoolId;
      closestDistance = distance;
    }
  }

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
    _cachedIsAdmin = adminDoc.exists && (adminDoc.data().role === 'admin' || adminDoc.data().role === 'spotter');
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

  // Cargar límites autonómicos
  loadAutonomousBoundaries();

  // Cargar icono de parking
  loadParkingIcon();

  // Listener para actualizar ticks de ascensos al moverse/zoom
  mlMap.on('moveend', scheduleTicksUpdate);
  mlMap.on('sourcedata', (e) => {
    if (e.sourceId === 'vias-source' && e.isSourceLoaded) {
      scheduleTicksUpdate();
    }
  });

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
// LÍMITES AUTONÓMICOS
// ============================================

/**
 * Carga los límites de comunidades autónomas como capa de líneas
 * GeoJSON simplificado (~89KB, solo península), visible zoom 6-12
 * Sin interacción, sin fill, solo línea sutil
 */
function loadAutonomousBoundaries() {
  if (!mlMap) return;

  function addBoundaryLayers(geojson) {
    try {
      if (mlMap.getSource('ccaa-boundaries-source')) return; // Ya cargado

      mlMap.addSource('ccaa-boundaries-source', {
        type: 'geojson',
        data: geojson
      });

      // Determinar dónde insertar la capa (debajo de labels si existe)
      const beforeLayer = mlMap.getLayer('labels-layer') ? 'labels-layer' : undefined;

      // Capa de casing (borde exterior oscuro para contraste sobre satélite)
      mlMap.addLayer({
        id: 'ccaa-boundaries-casing',
        type: 'line',
        source: 'ccaa-boundaries-source',
        minzoom: 6,
        maxzoom: 12,
        paint: {
          'line-color': '#000000',
          'line-opacity': [
            'interpolate', ['linear'], ['zoom'],
            6, 0.25,
            8, 0.35,
            10, 0.3,
            12, 0.15
          ],
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            6, 2.5,
            8, 3.5,
            10, 4,
            12, 3
          ]
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        }
      }, beforeLayer);

      // Capa principal (línea interior clara)
      mlMap.addLayer({
        id: 'ccaa-boundaries-layer',
        type: 'line',
        source: 'ccaa-boundaries-source',
        minzoom: 6,
        maxzoom: 12,
        paint: {
          'line-color': '#e0e0e0',
          'line-opacity': [
            'interpolate', ['linear'], ['zoom'],
            6, 0.5,
            8, 0.7,
            10, 0.6,
            12, 0.3
          ],
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            6, 1,
            8, 1.5,
            10, 2,
            12, 1.5
          ]
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        }
      }, beforeLayer);

      console.log('[CCAA] Límites autonómicos cargados correctamente');
    } catch (err) {
      console.warn('[CCAA] Error añadiendo capas de límites:', err);
    }
  }

  fetch('data/spain_ccaa_boundaries.geojson')
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(geojson => {
      console.log('[CCAA] GeoJSON cargado:', geojson.features.length, 'features');
      if (mlMap.isStyleLoaded()) {
        addBoundaryLayers(geojson);
      } else {
        mlMap.once('styledata', () => addBoundaryLayers(geojson));
      }
    })
    .catch(err => {
      console.warn('[CCAA] Error cargando límites autonómicos:', err);
    });
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

    // Re-aplicar filtro de grados si había uno activo
    applyGradeFilter();

  } catch (error) {
    console.error('Error cargando escuela:', error);
    // Fallback a GeoJSON si falla Vector Tiles
    if (useVectorTiles) {
      console.log('Fallback a GeoJSON...');
      await mlLoadSchoolGeoJSON(school);
      applyGradeFilter();
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

    // Cargar GeoJSON en paralelo solo para construir el índice de variantes
    // (las tiles PBF no permiten pre-procesamiento de features)
    if (school.geojson && school.geojson.vias) {
      fetch(school.geojson.vias + '?v=' + Date.now())
        .then(r => r.ok ? r.json() : null)
        .then(geojson => {
          if (geojson && geojson.features) {
            mlBuildVariantGroupsIndex(geojson.features);
          }
        })
        .catch(e => console.warn('Error loading variant index for tiles path:', e));
    }
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
      school.zoomLevels.vias,
      {},
      mlProcessVariantsForGeoJSON
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

  // Cargar puntos de interés
  if (school.geojson.puntosInteres) {
    await mlLoadPuntosInteres(school.geojson.puntosInteres);
  }

  // Cargar rutas de acceso (línea naranja intermitente)
  if (school.geojson.rutasAcceso) {
    await mlLoadRutasAcceso(school.geojson.rutasAcceso);
  }

  // Cargar puntos de interés (emojis diferenciados por tipo)
  if (school.geojson.puntosInteres) {
    await mlLoadPuntosInteres(school.geojson.puntosInteres);
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

// ============================================
// MAPA DE EMOJIS PARA PUNTOS DE INTERÉS
// ============================================
const POI_EMOJI_MAP = {
  'fuente': '🚰',
  'ducha': '🚿',
  'hospital': '🏥',
  'parking': '🅿️',
  'refugio': '🏠',
  'mirador': '👁️',
  'cueva': '🕳️',
  'bar': '🍺',
  'restaurante': '🍽️',
  'tienda': '🛒',
  'farmacia': '💊',
  'gasolinera': '⛽',
  'camping': '⛺',
  'wc': '🚻',
  'baño': '🚻',
  'escalera': '🪜',
  'puente': '🌉',
  'peligro': '⚠️',
  'informacion': 'ℹ️',
  'telefono': '📞',
  'iglesia': '⛪',
  'ermita': '⛪',
  'ruina': '🏚️',
  'agua': '💧',
  'rio': '🏞️',
  'arroyo': '🏞️',
  'piscina': '🏊',
  'bomberos': '🚒',
  'policia': '🚔',
  'supermercado': '🛒',
  'albergue': '🛏️',
  'hotel': '🏨',
  'correos': '📮',
  'merendero': '🧺'
};

/**
 * Obtiene el emoji correspondiente a un tipo de punto de interés
 */
function getPOIEmoji(descripcion) {
  if (!descripcion) return '📍';
  const desc = descripcion.toLowerCase().trim();
  return POI_EMOJI_MAP[desc] || '📍';
}

/**
 * Genera una imagen de emoji en un canvas para usar como icono en MapLibre.
 * MapLibre SDF fonts no soportan emojis, así que los renderizamos como imágenes.
 */
function createEmojiImage(emoji, size = 48) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(size * 0.75)}px sans-serif`;
  ctx.fillText(emoji, size / 2, size / 2);
  return { data: ctx.getImageData(0, 0, size, size).data, width: size, height: size };
}

/**
 * Carga los puntos de interés con emojis diferenciados por tipo.
 * Usa icon-image con imágenes generadas por canvas (los SDF glyphs no soportan emoji).
 */
async function mlLoadPuntosInteres(url) {
  const sourceId = 'puntos-interes-source';
  const layerId = 'puntos-interes-layer';

  const urlWithCache = `${url}?v=${Date.now()}`;

  try {
    const response = await fetch(urlWithCache);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const geojson = await response.json();

    // Verificar que hay features
    if (!geojson.features || geojson.features.length === 0) {
      console.log('Puntos de interés: sin elementos');
      return;
    }

    // Recoger emojis únicos y registrar como imágenes en el mapa
    const usedEmojis = new Set();
    geojson.features.forEach(f => {
      const desc = f.properties.descripcio || f.properties.descripcion || f.properties.Descripcion || f.properties.tipo || '';
      const emoji = getPOIEmoji(desc);
      f.properties._emoji = emoji;
      f.properties._poiType = desc;
      f.properties._emojiIcon = 'poi-emoji-' + desc.toLowerCase().trim();
      usedEmojis.add(emoji);
    });

    // Registrar cada emoji único como imagen en el mapa
    for (const emoji of usedEmojis) {
      const imgId = 'poi-emoji-' + emoji;
      if (!mlMap.hasImage(imgId)) {
        const img = createEmojiImage(emoji, 48);
        mlMap.addImage(imgId, img, { sdf: false });
      }
    }
    // Registrar el fallback
    if (!mlMap.hasImage('poi-emoji-📍')) {
      const fallbackImg = createEmojiImage('📍', 48);
      mlMap.addImage('poi-emoji-📍', fallbackImg, { sdf: false });
    }

    // Asignar el id de imagen a cada feature
    geojson.features.forEach(f => {
      f.properties._emojiIcon = 'poi-emoji-' + f.properties._emoji;
    });

    // Remover si ya existe
    if (mlMap.getLayer(layerId)) {
      mlMap.removeLayer(layerId);
    }
    if (mlMap.getSource(sourceId)) {
      mlMap.removeSource(sourceId);
    }

    mlMap.addSource(sourceId, {
      type: 'geojson',
      data: geojson
    });
    mlLoadedSources.add(sourceId);

    // Capa de iconos con emojis renderizados como imágenes
    mlMap.addLayer({
      id: layerId,
      type: 'symbol',
      source: sourceId,
      minzoom: 14,
      layout: {
        'icon-image': ['get', '_emojiIcon'],
        'icon-size': [
          'interpolate', ['linear'], ['zoom'],
          14, 0.45,
          16, 0.65,
          18, 0.85,
          20, 1.0
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-anchor': 'center'
      }
    });

    // Interactividad: mostrar popup con descripción al hacer click
    let mlPoiPopup = null;
    let mlPoiPopupCoords = null;

    // Auto-cerrar POI popup al alejarse (zoom out o desplazamiento)
    function checkPoiPopupDistance() {
      if (!mlPoiPopup || !mlPoiPopupCoords) return;
      const popupPoint = mlMap.project(mlPoiPopupCoords);
      const center = mlMap.project(mlMap.getCenter());
      const dx = popupPoint.x - center.x;
      const dy = popupPoint.y - center.y;
      const distPx = Math.sqrt(dx * dx + dy * dy);
      // Cerrar si el POI queda fuera del viewport visible (margen generoso)
      const canvas = mlMap.getCanvas();
      const maxDist = Math.max(canvas.width, canvas.height) * 0.45;
      if (distPx > maxDist || mlMap.getZoom() < 13.5) {
        mlPoiPopup.remove();
        mlPoiPopup = null;
        mlPoiPopupCoords = null;
      }
    }

    mlMap.on('moveend', checkPoiPopupDistance);
    mlMap.on('zoomend', checkPoiPopupDistance);

    mlMap.on('click', layerId, (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      const coords = e.features[0].geometry.coordinates.slice();
      const desc = props._poiType || 'Punto de interés';
      const nombre = props.Nombre || props.nombre || '';
      const emoji = props._emoji || '📍';

      // Ajustar coordenadas si es MultiPoint
      while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
        coords[0] += e.lngLat.lng > coords[0] ? 360 : -360;
      }

      // Cerrar popup anterior si existe
      if (mlPoiPopup) {
        mlPoiPopup.remove();
        mlPoiPopup = null;
      }

      const descCapitalized = desc.charAt(0).toUpperCase() + desc.slice(1);
      const poiLat = coords[1];
      const poiLng = coords[0];
      const poiGmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${poiLat},${poiLng}`;
      const poiBtnId = `poi-directions-${Date.now()}`;

      mlPoiPopup = new maplibregl.Popup({ offset: 18, closeButton: false, className: 'poi-popup' })
        .setLngLat(coords)
        .setHTML(`
          <div class="poi-popup-content">
            <div class="poi-popup-icon">${emoji}</div>
            <div class="poi-popup-info">
              <div class="poi-popup-type">${descCapitalized}</div>
              ${nombre ? `<div class="poi-popup-name">${nombre}</div>` : ''}
            </div>
          </div>
          <button class="poi-popup-directions-btn" id="${poiBtnId}">
            🧭 ¿Cómo llegar?
          </button>
        `)
        .addTo(mlMap);

      // Asignar evento al botón de direcciones
      setTimeout(() => {
        const btnDir = document.getElementById(poiBtnId);
        if (btnDir) btnDir.onclick = () => window.open(poiGmapsUrl, '_blank');
      }, 50);

      mlPoiPopupCoords = [coords[0], coords[1]];

      // Cerrar al hacer click fuera
      mlPoiPopup.on('close', () => {
        mlPoiPopup = null;
        mlPoiPopupCoords = null;
      });
    });

    // Cursor pointer al hover
    mlMap.on('mouseenter', layerId, () => {
      mlMap.getCanvas().style.cursor = 'pointer';
    });
    mlMap.on('mouseleave', layerId, () => {
      mlMap.getCanvas().style.cursor = '';
    });

    console.log(`Capa puntos de interés cargada: ${geojson.features.length} elementos`);

  } catch (error) {
    console.error('Error cargando puntos de interés:', error);
  }
}

/**
 * Carga una capa GeoJSON
 */
async function mlLoadGeoJSONLayer(layerId, url, type, paint, minzoom = 0, layout = {}, preprocessFn = null) {
  const sourceId = `${layerId}-source`;
  const fullLayerId = `${layerId}-layer`;

  // Añadir timestamp para evitar caché
  const urlWithCache = `${url}?v=${Date.now()}`;

  try {
    // Cargar GeoJSON
    const response = await fetch(urlWithCache);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const geojson = await response.json();

    // Pre-procesar GeoJSON si se proporciona callback (ej. variantes)
    if (typeof preprocessFn === 'function') {
      preprocessFn(geojson);
    }

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
  const layerIds = ['vias-ticks-circle-layer', 'vias-ticks-layer', 'vias-layer', 'sectores-layer', 'sectores-casing-layer', 'parkings-layer', 'rutas-acceso-layer', 'puntos-interes-layer', 'vias-variant-connector-layer'];
  const sourceIds = ['vias-ticks-source', 'vias-source', 'sectores-source', 'parkings-source', 'rutas-acceso-source', 'puntos-interes-source', 'vias-variant-connector-source'];

  // Limpiar estado de variantes
  mlVariantGroups.clear();
  mlVariantFeatureIndex.clear();
  mlCurrentVariantGroup = null;
  mlCurrentVariantSlide = 0;

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
// CAPA DE TICKS (CHECKS) EN VÍAS COMPLETADAS
// ============================================

/**
 * Crea o actualiza la capa de ticks (checks) sobre las vías que el usuario ha ascendido.
 * Usa userAscentsCache de user-features.js para determinar qué vías marcar.
 */
function updateAscentTicksLayer() {
  if (!mlMap || !mlCurrentSchool) return;
  if (typeof userAscentsCache === 'undefined' || !userAscentsCache.size) return;

  const tickSourceId = 'vias-ticks-source';
  const tickLayerId = 'vias-ticks-layer';

  // Recopilar features de vías visibles que el usuario ha completado
  const tickFeatures = [];

  // Intentar obtener features del source de vías (vector tiles o geojson)
  let viasFeatures = [];
  try {
    if (mlMap.getSource('vias-source')) {
      viasFeatures = mlMap.querySourceFeatures('vias-source', {
        sourceLayer: 'vias'
      });
      // Fallback: si no hay sourceLayer (geojson mode)
      if (!viasFeatures.length) {
        viasFeatures = mlMap.querySourceFeatures('vias-source');
      }
    }
  } catch (e) {
    // querySourceFeatures puede fallar si los tiles no están cargados
  }

  const addedRoutes = new Set();

  viasFeatures.forEach(feature => {
    const routeId = feature.properties?.id;
    if (!routeId && routeId !== 0) return;

    const routeName = feature.properties?.nombre;
    const grado1 = feature.properties?.grado1 || null;
    const key = `${mlCurrentSchool}:${routeId}`;
    if (userAscentsCache.has(key) && !addedRoutes.has(routeId)) {
      addedRoutes.add(routeId);

      // Obtener coordenadas del feature
      let coords;
      if (feature.geometry.type === 'Point') {
        coords = feature.geometry.coordinates;
      } else if (feature.geometry.type === 'MultiPoint') {
        coords = feature.geometry.coordinates[0];
      } else {
        return;
      }

      tickFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coords },
        properties: { nombre: routeName, id: routeId, grado1, gradeColor: getGradeColor(grado1 || '') }
      });
    }
  });

  const tickGeoJSON = {
    type: 'FeatureCollection',
    features: tickFeatures
  };

  // Actualizar o crear source/layer
  if (mlMap.getSource(tickSourceId)) {
    mlMap.getSource(tickSourceId).setData(tickGeoJSON);
  } else {
    // Cargar icono de check si no existe
    loadTickIcon().then(() => {
      if (mlMap.getSource(tickSourceId)) {
        mlMap.getSource(tickSourceId).setData(tickGeoJSON);
        return;
      }

      mlMap.addSource(tickSourceId, {
        type: 'geojson',
        data: tickGeoJSON
      });

      // Círculo de fondo con el color del grado de la vía
      mlMap.addLayer({
        id: 'vias-ticks-circle-layer',
        type: 'circle',
        source: tickSourceId,
        minzoom: 16,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            16, isMobileDevice() ? 5 : 7,
            18, isMobileDevice() ? 8 : 11,
            20, isMobileDevice() ? 12 : 15
          ],
          'circle-color': ['get', 'gradeColor'],
          'circle-stroke-color': 'white',
          'circle-stroke-width': 1.5
        }
      });

      // Check blanco encima del círculo
      mlMap.addLayer({
        id: tickLayerId,
        type: 'symbol',
        source: tickSourceId,
        minzoom: 16,
        layout: {
          'icon-image': 'tick-icon',
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            16, isMobileDevice() ? 0.22 : 0.28,
            18, isMobileDevice() ? 0.34 : 0.44,
            20, isMobileDevice() ? 0.48 : 0.60
          ],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-anchor': 'center',
          'icon-offset': [0, 0]
        }
      });
    });
  }
}

/**
 * Carga el icono de tick/check para la capa de vías completadas
 */
function loadTickIcon() {
  return new Promise((resolve) => {
    if (mlMap.hasImage('tick-icon')) {
      resolve();
      return;
    }

    const size = 48;
    const svgIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
        <polyline points="10,26 20,36 38,14" fill="none" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    const img = new Image(size, size);
    img.onload = () => {
      if (!mlMap.hasImage('tick-icon')) {
        mlMap.addImage('tick-icon', img);
      }
      resolve();
    };
    img.onerror = () => {
      console.warn('Error cargando tick-icon');
      resolve();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgIcon);
  });
}

// Escuchar eventos de movimiento del mapa para actualizar ticks
// (los tiles se cargan progresivamente, hay que refrescar al moverse)
let mlTicksUpdateTimer = null;
function scheduleTicksUpdate() {
  if (mlTicksUpdateTimer) clearTimeout(mlTicksUpdateTimer);
  mlTicksUpdateTimer = setTimeout(() => {
    updateAscentTicksLayer();
  }, 500);
}

// ============================================
// VARIANT GROUPS PROCESSING
// ============================================

/**
 * Construye el índice de grupos de variantes a partir de los features GeoJSON.
 * Procesa los campos `variante` y `Union` según la matriz de casos:
 *   A: variante=null → sin cambios
 *   B1: variante=SI, Union=null, modalidad=Simple → trinomios como variantes
 *   B2: variante=SI, Union!=null → agrupar por IDs del Union
 *   C: variante=NO, Union!=null → igual que B2
 */
function mlBuildVariantGroupsIndex(features) {
  mlVariantGroups.clear();
  mlVariantFeatureIndex.clear();

  // Map feature id → feature (for Union cross-referencing)
  const featureById = new Map();
  for (const f of features) {
    const fId = f.properties.id;
    if (fId != null) {
      featureById.set(Number(fId), f);
    }
  }

  // --- Paso 1: Procesar grupos Union (Casos B2 y C) ---
  // Collect all Union strings to find groups
  const unionGroupsRaw = new Map(); // normalizedKey → { originalUnion, features[] }

  for (const f of features) {
    const props = f.properties;
    const union = props.union;
    const variante = props.variante;

    if (!union) continue;
    // B2: variante=SI con Union, o C: variante=NO con Union
    if (variante !== 'SI' && variante !== 'NO') continue;

    const ids = union.split('_').map(Number).filter(n => !isNaN(n));
    if (ids.length < 2) continue;

    // Normalizar key ordenando los IDs
    const normalizedKey = ids.slice().sort((a, b) => a - b).join('_');

    if (!unionGroupsRaw.has(normalizedKey)) {
      unionGroupsRaw.set(normalizedKey, { originalUnion: union, featureIds: new Set() });
    }
    // Añadir todos los IDs referenciados por este Union string
    for (const id of ids) {
      unionGroupsRaw.get(normalizedKey).featureIds.add(id);
    }
  }

  // Construir grupos finales con features reales
  for (const [key, groupData] of unionGroupsRaw) {
    const orderedIds = groupData.originalUnion.split('_').map(Number).filter(n => !isNaN(n));
    const groupFeatures = [];

    for (const id of orderedIds) {
      const f = featureById.get(id);
      if (!f) continue; // ID referenciado no existe en dataset
      const coords = f.geometry && f.geometry.coordinates
        ? (f.geometry.type === 'MultiPoint' ? f.geometry.coordinates[0] : f.geometry.coordinates)
        : null;
      groupFeatures.push({ props: { ...f.properties }, coords: coords });
    }

    if (groupFeatures.length < 2) continue; // Solo agrupar si hay 2+ features

    // Asignar metadata de grupo a cada feature
    groupFeatures.forEach((gf, idx) => {
      gf.props._variantGroupKey = key;
      gf.props._variantIndex = idx;
      // Actualizar el feature original
      const origFeature = featureById.get(Number(gf.props.id));
      if (origFeature) {
        origFeature.properties._variantGroupKey = key;
        origFeature.properties._variantIndex = idx;
      }
      mlVariantFeatureIndex.set(Number(gf.props.id), key);
    });

    mlVariantGroups.set(key, groupFeatures);
  }

  // --- Paso 2: Procesar Caso B1 (trinomios internos) ---
  for (const f of features) {
    const props = f.properties;
    // Solo para: variante=SI, sin Union, modalidad Simple
    if (props.variante !== 'SI') continue;
    if (props.union) continue;
    if (props._variantGroupKey) continue; // Ya fue procesado en un grupo Union

    // Recoger trinomios con datos
    const trinomials = [];
    for (let i = 1; i <= 5; i++) {
      const grado = props['grado' + i];
      if (grado != null && grado !== '') {
        trinomials.push({
          index: i,
          grado: grado,
          exp: props['exp' + i],
          long: props['long' + i]
        });
      }
    }

    if (trinomials.length < 2) continue; // Se necesitan al menos 2 variantes

    const groupKey = 'b1_' + props.id;
    const coords = f.geometry && f.geometry.coordinates
      ? (f.geometry.type === 'MultiPoint' ? f.geometry.coordinates[0] : f.geometry.coordinates)
      : null;

    // Crear un "slide" por cada trinomio
    const groupFeatures = trinomials.map((t, idx) => ({
      props: {
        ...props,
        _variantGroupKey: groupKey,
        _variantIndex: idx,
        _isTrinomialGroup: true,
        _trinomialIndex: t.index,
        // Override de grado/exp/long con datos del trinomio
        _displayGrado: t.grado,
        _displayExp: t.exp,
        _displayLong: t.long,
        _variantLabel: 'Variante ' + (idx + 1)
      },
      coords: coords
    }));

    f.properties._variantGroupKey = groupKey;
    f.properties._variantIndex = 0;
    f.properties._isTrinomialGroup = true;
    mlVariantFeatureIndex.set(Number(props.id), groupKey);
    mlVariantGroups.set(groupKey, groupFeatures);
  }

  console.log(`Variant groups index built: ${mlVariantGroups.size} groups, ${mlVariantFeatureIndex.size} features indexed`);
}

/**
 * Aplica offsets geográficos laterales a features de grupos Union (B2/C)
 * para que se dibujen separados en el mapa en lugar de apilados.
 * Offset: ~2.5m por step en latitud de España.
 */
function mlApplyLateralOffsets(features) {
  const OFFSET_STEP = 0.000025; // ~2.5m en latitud

  for (const [key, group] of mlVariantGroups) {
    // No aplicar offset a grupos B1 (trinomios de un solo punto)
    if (key.startsWith('b1_')) continue;
    if (group.length < 2) continue;

    // Calcular centroide
    let sumLng = 0, sumLat = 0, count = 0;
    for (const gf of group) {
      if (gf.coords) {
        sumLng += gf.coords[0];
        sumLat += gf.coords[1];
        count++;
      }
    }
    if (count === 0) continue;
    const centerLat = sumLat / count;

    // Distribuir offsets laterales (N-S) centrados en el centroide
    const n = group.length;
    group.forEach((gf, idx) => {
      const offset = OFFSET_STEP * (idx - (n - 1) / 2);
      const targetLat = centerLat + offset;

      // Encontrar y modificar el feature original en el array
      const origFeature = features.find(f => Number(f.properties.id) === Number(gf.props.id));
      if (origFeature && origFeature.geometry && origFeature.geometry.coordinates) {
        if (origFeature.geometry.type === 'MultiPoint') {
          origFeature.geometry.coordinates[0][1] = targetLat;
        } else {
          origFeature.geometry.coordinates[1] = targetLat;
        }
        // Actualizar coords en el grupo también
        gf.coords = origFeature.geometry.type === 'MultiPoint'
          ? origFeature.geometry.coordinates[0]
          : origFeature.geometry.coordinates;
      }
    });
  }
}

/**
 * Genera GeoJSON de líneas conectoras entre features de cada grupo Union.
 * Las líneas unen visualmente las variantes agrupadas.
 */
function mlBuildVariantConnectorGeoJSON(features) {
  const connectorFeatures = [];

  for (const [key, group] of mlVariantGroups) {
    if (key.startsWith('b1_')) continue; // B1 no tiene conectores
    if (group.length < 2) continue;

    // Coordenadas ordenadas de cada feature del grupo
    const coords = group
      .filter(gf => gf.coords)
      .map(gf => [gf.coords[0], gf.coords[1]]);

    if (coords.length < 2) continue;

    connectorFeatures.push({
      type: 'Feature',
      properties: {
        groupKey: key,
        primaryGrade: group[0].props.grado1 || ''
      },
      geometry: {
        type: 'LineString',
        coordinates: coords
      }
    });
  }

  return {
    type: 'FeatureCollection',
    features: connectorFeatures
  };
}

/**
 * Añade la capa de líneas conectoras de variantes al mapa
 */
function mlLoadVariantConnectorLayer(connectorGeoJSON) {
  const sourceId = 'vias-variant-connector-source';
  const layerId = 'vias-variant-connector-layer';

  // Limpiar si ya existe
  if (mlMap.getLayer(layerId)) mlMap.removeLayer(layerId);
  if (mlMap.getSource(sourceId)) mlMap.removeSource(sourceId);

  if (!connectorGeoJSON.features || connectorGeoJSON.features.length === 0) return;

  mlMap.addSource(sourceId, {
    type: 'geojson',
    data: connectorGeoJSON
  });
  mlLoadedSources.add(sourceId);

  mlMap.addLayer({
    id: layerId,
    type: 'line',
    source: sourceId,
    minzoom: 17,
    paint: {
      'line-color': generateGradeColorExpression('primaryGrade'),
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        17, 1.5,
        19, 2.5,
        20, 3
      ],
      'line-opacity': 0.6,
      'line-dasharray': [2, 1.5]
    }
  });

  console.log(`Variant connector layer loaded: ${connectorGeoJSON.features.length} connectors`);
}

/**
 * Procesa variantes tras cargar un GeoJSON de vías:
 * construye índice, aplica offsets y carga capa de conectores.
 */
function mlProcessVariantsForGeoJSON(geojson) {
  if (!geojson || !geojson.features) return;
  mlBuildVariantGroupsIndex(geojson.features);
  mlApplyLateralOffsets(geojson.features);
  const connectorGeoJSON = mlBuildVariantConnectorGeoJSON(geojson.features);
  mlLoadVariantConnectorLayer(connectorGeoJSON);
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

    // Normalizar campo descripcio → descripcion (GeoJSON usa "descripcio")
    if (!props.descripcion && props.descripcio) {
      props.descripcion = props.descripcio;
    }

    // --- Detección de grupo de variantes ---
    const featureId = Number(props.id);
    const variantGroupKey = props._variantGroupKey || mlVariantFeatureIndex.get(featureId);
    const variantGroup = variantGroupKey ? mlVariantGroups.get(variantGroupKey) : null;

    if (variantGroup && variantGroup.length >= 2) {
      // Encontrar el índice del feature clickeado dentro del grupo
      let clickedIndex = variantGroup.findIndex(gf => Number(gf.props.id) === featureId);
      if (clickedIndex < 0) clickedIndex = 0;

      if (isMobileDevice()) {
        adaptiveMapPanForBottomSheet(coords);
        mlShowVariantGroupBottomSheet(variantGroup, clickedIndex, coords);
      } else {
        mlMap.flyTo({
          center: coords,
          zoom: mlMap.getZoom(),
          speed: 0.8,
          curve: 1,
          padding: { top: 450, bottom: 0, left: 0, right: 0 }
        });
        mlShowVariantGroupPopup(variantGroup, clickedIndex, coords);
      }
      return;
    }

    // --- Comportamiento estándar (sin variantes) ---
    if (isMobileDevice()) {
      adaptiveMapPanForBottomSheet(coords);
      showRouteBottomSheet(props, coords);
    } else {
      mlMap.flyTo({
        center: coords,
        zoom: mlMap.getZoom(),
        speed: 0.8,
        curve: 1,
        padding: { top: 450, bottom: 0, left: 0, right: 0 }
      });
      showRoutePopup(props, coords);
    }
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
  const routeId = Number(props.id);
  const routeName = props.nombre || 'Sin nombre';
  const sectorName = props.sector || '';
  const encodedSector = encodeURIComponent(sectorName);
  const schoolId = mlCurrentSchool || 'valeria';

  // Verificar si es admin para mostrar botón de desarrollador
  const isAdmin = await isRoutePopupAdmin();

  // Verificar si la vía tiene dibujo en la imagen del sector (para mostrar botón "Ver vía")
  let hasDrawing = false;
  if (sectorName && typeof hasRouteDrawing === 'function') {
    hasDrawing = await hasRouteDrawing(schoolId, sectorName, routeId);
  }

  // Verificar si el usuario ha completado esta vía
  const hasAscent = (typeof hasUserAscent === 'function') && hasUserAscent(schoolId, routeId);
  const ascentInfo = hasAscent && (typeof getUserAscentInfo === 'function') ? getUserAscentInfo(schoolId, routeId) : null;

  // Guardar datos de la vía actual para las funciones de los botones
  mlCurrentRouteGrade = grade;
  mlCurrentRouteSector = sectorName;
  mlCurrentRouteId = routeId;
  mlCurrentRouteName = routeName;

  // Obtener número de comentarios
  let commentCount = 0;
  try {
    if (typeof db !== 'undefined' && typeof normalizeId === 'function') {
      const commentRouteId = `${schoolId}_${normalizeId(routeName)}`;
      const commentsSnap = await db.collection('comments').where('routeId', '==', commentRouteId).get();
      commentCount = commentsSnap.size;
    }
  } catch (e) {
    console.warn('Error fetching comment count:', e);
  }
  const commentBadge = commentCount > 0 ? `<span class="ml-comment-count">${commentCount}</span>` : '';

  // Iconos PNG para info (tamaño 32x32)
  const iconClimber = `<img src="icons/placa.png" alt="Tipo" width="32" height="32">`;
  const iconExpress = `<img src="icons/mosq.png" alt="Expresos" width="32" height="32">`;
  const iconRope = `<img src="icons/cuerda.png" alt="Cuerda" width="32" height="32">`;

  // Iconos SVG de la botonera (tamaño 32x32)
  const iconCheck = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  const iconBookmark = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;

  const iconComment = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;

  const iconShare = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

  // Check de ascenso + icono de estilo para el header
  const ascentStyleSVG = ascentInfo && ascentInfo.style && (typeof getAscentStyleSVG === 'function') ? getAscentStyleSVG(ascentInfo.style) : '';
  const ascentCheckHTML = hasAscent ? `
    <span class="ml-route-ascent-check">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </span>
    ${ascentStyleSVG ? `<span class="ml-route-ascent-style ascent-style-${ascentInfo.style}">${ascentStyleSVG}</span>` : ''}
  ` : '';

  // Detectar campos vacíos para sugerir contribuir (sugerencias independientes por campo)
  const hasDescripcion = props.descripcion && props.descripcion.trim();
  const hasExp = props.exp1;
  const hasLong = props.long1;

  // Obtener votaciones de aleje desde Firestore
  const alejeData = await getAlejeVotes(schoolId, routeId);
  const alejeHTML = generateAlejeBarHTML(routeId, schoolId, alejeData.avg, alejeData.userVote);

  // Obtener votaciones de estado de la vía desde Firestore
  const estadoData = await getEstadoVotes(schoolId, routeId);
  const estadoHTML = generateEstadoStarsHTML(routeId, schoolId, estadoData.avg, estadoData.userVote);

  const html = `
    <div class="ml-route-popup-new">
      <!-- Header: Check + Nombre + Grado -->
      <div class="ml-route-header">
        ${ascentCheckHTML}
        <span class="ml-route-name">${routeName}</span>
        <span class="ml-route-grade" style="background-color: ${gradeColor}">${grade}</span>
      </div>

      <!-- Info items con iconos + sugerencias independientes por campo -->
      <div class="ml-route-info">
        ${hasDescripcion ? `
          <div class="ml-route-item">
            <span class="ml-route-icon">${iconClimber}</span>
            <span class="ml-route-text">${props.descripcion}</span>
          </div>
        ` : `
          <div class="ml-route-item ml-route-item-missing" onclick="mlContributeField(${routeId}, '${schoolId}', 'tipo')">
            <span class="ml-route-icon">${iconClimber}</span>
            <span class="ml-route-text ml-route-contribute">&iquest;Qu&eacute; tipo de escalada es?</span>
          </div>
        `}

        ${hasExp ? `
          <div class="ml-route-item">
            <span class="ml-route-icon">${iconExpress}</span>
            <span class="ml-route-text">${props.exp1} express</span>
          </div>
        ` : `
          <div class="ml-route-item ml-route-item-missing" onclick="mlContributeField(${routeId}, '${schoolId}', 'express')">
            <span class="ml-route-icon">${iconExpress}</span>
            <span class="ml-route-text ml-route-contribute">&iquest;Cu&aacute;ntos express tiene?</span>
          </div>
        `}

        ${hasLong ? `
          <div class="ml-route-item">
            <span class="ml-route-icon">${iconRope}</span>
            <span class="ml-route-text">${props.long1} mts</span>
          </div>
        ` : `
          <div class="ml-route-item ml-route-item-missing" onclick="mlContributeField(${routeId}, '${schoolId}', 'metros')">
            <span class="ml-route-icon">${iconRope}</span>
            <span class="ml-route-text ml-route-contribute">&iquest;Cu&aacute;ntos metros mide?</span>
          </div>
        `}
      </div>

      <!-- Indicador de Aleje -->
      ${alejeHTML}

      <!-- Estado de la Vía (estrellas) -->
      ${estadoHTML}

      <!-- Botonera -->
      <div class="ml-route-actions">
        <button class="ml-route-action-btn" onclick="mlRegisterAscent(${routeId}, '${encodeURIComponent(routeName)}')" title="Registrar ascenso">
          ${iconCheck}
        </button>
        <button class="ml-route-action-btn" onclick="mlToggleBookmark(${routeId}, '${encodeURIComponent(routeName)}')" title="Guardar">
          ${iconBookmark}
        </button>
        <button class="ml-route-action-btn ml-comment-btn" onclick="mlOpenComments(${routeId}, '${encodeURIComponent(routeName)}')" title="Comentarios">
          ${iconComment}
          ${commentBadge}
        </button>
        <button class="ml-route-action-btn" onclick="mlShareRoute(${routeId}, '${encodeURIComponent(routeName)}')" title="Compartir">
          ${iconShare}
        </button>
      </div>

      <!-- Botón Ver vía (solo si tiene dibujo en la imagen) -->
      ${hasDrawing ? `
        <div class="ml-route-view-section">
          <button class="ml-route-view-btn" onclick="mlViewRouteInSector('${schoolId}', '${encodedSector}', ${routeId})">
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
          <button class="ml-route-dev-btn" onclick="mlOpenDrawingEditor(${routeId})">
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

// ============================================
// VARIANT GROUP CAROUSEL - POPUP (DESKTOP)
// ============================================

/**
 * Muestra un popup con carrusel de variantes (desktop).
 * @param {Array} groupFeatures - Array de { props, coords } del grupo
 * @param {number} startIndex - Índice de la variante clickeada
 * @param {Object} coords - lngLat del click
 */
async function mlShowVariantGroupPopup(groupFeatures, startIndex, coords) {
  mlCurrentVariantGroup = groupFeatures;
  mlCurrentVariantSlide = startIndex >= 0 ? startIndex : 0;

  const n = groupFeatures.length;
  const isTrinomial = groupFeatures[0].props._isTrinomialGroup;

  // Generar dots
  let dotsHTML = '';
  for (let i = 0; i < n; i++) {
    dotsHTML += `<span class="ml-variant-dot${i === mlCurrentVariantSlide ? ' active' : ''}"></span>`;
  }

  // Generar contenido del slide actual
  const slideHTML = await mlBuildVariantSlideHTML(groupFeatures[mlCurrentVariantSlide], isTrinomial);

  const html = `
    <div class="ml-route-popup-new ml-variant-popup">
      <div class="ml-variant-nav-bar">
        <button class="ml-variant-nav-btn" onclick="mlVariantNav(-1)">&#8249;</button>
        <span class="ml-variant-indicator" id="ml-variant-indicator">
          ${isTrinomial ? 'Variante' : ''} ${mlCurrentVariantSlide + 1} de ${n}
        </span>
        <button class="ml-variant-nav-btn" onclick="mlVariantNav(1)">&#8250;</button>
      </div>
      <div class="ml-variant-dots-bar" id="ml-variant-dots">${dotsHTML}</div>
      <div id="ml-variant-content">${slideHTML}</div>
    </div>
  `;

  // Cerrar popup existente
  if (mlRoutePopup) mlRoutePopup.remove();
  mlRoutePopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    maxWidth: '380px'
  });

  mlRoutePopup
    .setLngLat(coords)
    .setHTML(html)
    .addTo(mlMap);

  // Añadir soporte de swipe al popup
  setTimeout(() => {
    const container = document.getElementById('ml-variant-content');
    if (container) {
      container.addEventListener('touchstart', (e) => {
        mlVariantSwipeStartX = e.changedTouches[0].screenX;
      }, { passive: true });
      container.addEventListener('touchend', (e) => {
        const diff = mlVariantSwipeStartX - e.changedTouches[0].screenX;
        if (Math.abs(diff) > 50) {
          mlVariantNav(diff > 0 ? 1 : -1);
        }
      }, { passive: true });
    }
  }, 100);

  // Cargar datos asíncronos (aleje, estado)
  mlLoadVariantSlideAsyncData(groupFeatures[mlCurrentVariantSlide], isTrinomial);
}

/**
 * Construye el HTML de un slide individual del carrusel de variantes.
 * Reutiliza el mismo layout que showRoutePopup pero con datos de la variante.
 */
async function mlBuildVariantSlideHTML(variantData, isTrinomial) {
  const props = variantData.props;
  const schoolId = mlCurrentSchool || 'valeria';

  // Para B1 (trinomios), usar los campos _display*; para B2/C usar grado1/exp1/long1
  let grade, exp, longM;
  if (isTrinomial) {
    grade = props._displayGrado || props.grado1 || '?';
    exp = props._displayExp;
    longM = props._displayLong;
  } else {
    grade = props.grado1 || '?';
    exp = props.exp1;
    longM = props.long1;
  }

  const gradeColor = getGradeColor(grade);
  const routeId = Number(props.id);
  const routeName = props.nombre || 'Sin nombre';

  // Check de ascenso
  const hasAscent = (typeof hasUserAscent === 'function') && hasUserAscent(schoolId, routeId);
  const ascentInfo = hasAscent && (typeof getUserAscentInfo === 'function') ? getUserAscentInfo(schoolId, routeId) : null;
  const ascentStyleSVG = ascentInfo && ascentInfo.style && (typeof getAscentStyleSVG === 'function') ? getAscentStyleSVG(ascentInfo.style) : '';
  const ascentCheckHTML = hasAscent ? `
    <span class="ml-route-ascent-check">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </span>
    ${ascentStyleSVG ? `<span class="ml-route-ascent-style ascent-style-${ascentInfo.style}">${ascentStyleSVG}</span>` : ''}
  ` : '';

  // Normalizar descripcio → descripcion
  if (!props.descripcion && props.descripcio) {
    props.descripcion = props.descripcio;
  }

  const hasDescripcion = props.descripcion && props.descripcion.trim();
  const hasExp = exp != null && exp !== '';
  const hasLong = longM != null && longM !== '';

  // Iconos PNG
  const iconClimber = `<img src="icons/placa.png" alt="Tipo" width="32" height="32">`;
  const iconExpress = `<img src="icons/mosq.png" alt="Expresos" width="32" height="32">`;
  const iconRope = `<img src="icons/cuerda.png" alt="Cuerda" width="32" height="32">`;

  // Iconos SVG botonera
  const iconCheck = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const iconBookmark = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
  const iconComment = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
  const iconShare = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

  return `
    <!-- Header: Check + Nombre + Grado -->
    <div class="ml-route-header">
      ${ascentCheckHTML}
      <span class="ml-route-name">${routeName}</span>
      <span class="ml-route-grade" style="background-color: ${gradeColor}">${grade}</span>
    </div>

    <!-- Info items -->
    <div class="ml-route-info">
      ${hasDescripcion ? `
        <div class="ml-route-item">
          <span class="ml-route-icon">${iconClimber}</span>
          <span class="ml-route-text">${props.descripcion}</span>
        </div>
      ` : ''}

      ${hasExp ? `
        <div class="ml-route-item">
          <span class="ml-route-icon">${iconExpress}</span>
          <span class="ml-route-text">${exp} express</span>
        </div>
      ` : ''}

      ${hasLong ? `
        <div class="ml-route-item">
          <span class="ml-route-icon">${iconRope}</span>
          <span class="ml-route-text">${longM} mts</span>
        </div>
      ` : ''}
    </div>

    <!-- Aleje (cargado asíncronamente) -->
    <div id="ml-variant-aleje-${routeId}"><div style="text-align:center;color:#888;font-size:13px;">Cargando...</div></div>

    <!-- Estado (cargado asíncronamente) -->
    <div id="ml-variant-estado-${routeId}"><div style="text-align:center;color:#888;font-size:13px;">Cargando...</div></div>

    <!-- Botonera -->
    <div class="ml-route-actions">
      <button class="ml-route-action-btn" onclick="mlRegisterAscent(${routeId}, '${encodeURIComponent(routeName)}')" title="Registrar ascenso">
        ${iconCheck}
      </button>
      <button class="ml-route-action-btn" onclick="mlToggleBookmark(${routeId}, '${encodeURIComponent(routeName)}')" title="Guardar">
        ${iconBookmark}
      </button>
      <button class="ml-route-action-btn ml-comment-btn" onclick="mlOpenComments(${routeId}, '${encodeURIComponent(routeName)}')" title="Comentarios">
        ${iconComment}
      </button>
      <button class="ml-route-action-btn" onclick="mlShareRoute(${routeId}, '${encodeURIComponent(routeName)}')" title="Compartir">
        ${iconShare}
      </button>
    </div>
  `;
}

/**
 * Carga datos asíncronos (aleje, estado) para el slide de variante actual.
 */
function mlLoadVariantSlideAsyncData(variantData, isTrinomial) {
  const props = variantData.props;
  const schoolId = mlCurrentSchool || 'valeria';
  const routeId = Number(props.id);

  // Aleje
  if (typeof getAlejeVotes === 'function') {
    getAlejeVotes(schoolId, routeId).then(alejeData => {
      const el = document.getElementById(`ml-variant-aleje-${routeId}`);
      if (el && typeof generateAlejeBarHTML === 'function') {
        el.innerHTML = generateAlejeBarHTML(routeId, schoolId, alejeData.avg, alejeData.userVote);
      }
    }).catch(() => {});
  }

  // Estado
  if (typeof getEstadoVotes === 'function') {
    getEstadoVotes(schoolId, routeId).then(estadoData => {
      const el = document.getElementById(`ml-variant-estado-${routeId}`);
      if (el && typeof generateEstadoStarsHTML === 'function') {
        el.innerHTML = generateEstadoStarsHTML(routeId, schoolId, estadoData.avg, estadoData.userVote);
      }
    }).catch(() => {});
  }
}

/**
 * Navega entre slides del carrusel de variantes.
 * @param {number} direction - -1 para anterior, +1 para siguiente
 */
async function mlVariantNav(direction) {
  if (!mlCurrentVariantGroup || mlCurrentVariantGroup.length === 0) return;

  const n = mlCurrentVariantGroup.length;
  mlCurrentVariantSlide = (mlCurrentVariantSlide + direction + n) % n;
  const isTrinomial = mlCurrentVariantGroup[0].props._isTrinomialGroup;

  // Actualizar indicador
  const indicator = document.getElementById('ml-variant-indicator');
  if (indicator) {
    indicator.textContent = `${isTrinomial ? 'Variante ' : ''}${mlCurrentVariantSlide + 1} de ${n}`;
  }

  // Actualizar dots
  const dotsContainer = document.getElementById('ml-variant-dots');
  if (dotsContainer) {
    const dots = dotsContainer.querySelectorAll('.ml-variant-dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === mlCurrentVariantSlide);
    });
  }

  // Transición fade del contenido
  const contentEl = document.getElementById('ml-variant-content');
  if (contentEl) {
    contentEl.classList.add('fading');
    await new Promise(resolve => setTimeout(resolve, 150));

    const slideHTML = await mlBuildVariantSlideHTML(mlCurrentVariantGroup[mlCurrentVariantSlide], isTrinomial);
    contentEl.innerHTML = slideHTML;
    contentEl.classList.remove('fading');

    // Cargar datos asíncronos del nuevo slide
    mlLoadVariantSlideAsyncData(mlCurrentVariantGroup[mlCurrentVariantSlide], isTrinomial);
  }

  // Actualizar estado global de ruta para funciones externas
  const currentProps = mlCurrentVariantGroup[mlCurrentVariantSlide].props;
  mlCurrentRouteGrade = isTrinomial ? (currentProps._displayGrado || currentProps.grado1) : currentProps.grado1;
  mlCurrentRouteSector = currentProps.sector || '';
  mlCurrentRouteId = Number(currentProps.id);
  mlCurrentRouteName = currentProps.nombre || 'Sin nombre';
}

// ============================================
// VARIANT GROUP CAROUSEL - BOTTOM SHEET (MOBILE)
// ============================================

/**
 * Muestra un bottom sheet con carrusel de variantes (móvil).
 * Reutiliza el bottom sheet existente pero le prepone navegación de variantes.
 */
async function mlShowVariantGroupBottomSheet(groupFeatures, startIndex, coords) {
  mlCurrentVariantGroup = groupFeatures;
  mlCurrentVariantSlide = startIndex >= 0 ? startIndex : 0;

  const isTrinomial = groupFeatures[0].props._isTrinomialGroup;
  const currentVariant = groupFeatures[mlCurrentVariantSlide];

  // Primero mostrar el bottom sheet estándar con los datos de la variante actual
  const propsForSheet = { ...currentVariant.props };
  if (isTrinomial) {
    // Para B1, sobrescribir grado1/exp1/long1 con los del trinomio
    propsForSheet.grado1 = propsForSheet._displayGrado || propsForSheet.grado1;
    propsForSheet.exp1 = propsForSheet._displayExp;
    propsForSheet.long1 = propsForSheet._displayLong;
  }

  await showRouteBottomSheet(propsForSheet, coords);

  // Añadir barra de navegación de variantes al inicio del bottom sheet
  const sheet = document.getElementById('route-bottom-sheet');
  if (!sheet) return;

  // Eliminar barra de variantes previa si existe
  const existingNav = sheet.querySelector('.rbs-variant-nav-bar');
  if (existingNav) existingNav.remove();
  const existingDots = sheet.querySelector('.rbs-variant-dots-bar');
  if (existingDots) existingDots.remove();

  const n = groupFeatures.length;

  // Generar dots
  let dotsHTML = '';
  for (let i = 0; i < n; i++) {
    dotsHTML += `<span class="ml-variant-dot${i === mlCurrentVariantSlide ? ' active' : ''}"></span>`;
  }

  // Insertar barra de navegación después del handle del bottom sheet
  const handle = sheet.querySelector('.rbs-handle') || sheet.firstElementChild;
  if (handle) {
    const navBar = document.createElement('div');
    navBar.className = 'rbs-variant-nav-bar';
    navBar.innerHTML = `
      <button class="ml-variant-nav-btn" onclick="mlVariantNavBottomSheet(-1)">&#8249;</button>
      <span class="ml-variant-indicator" id="rbs-variant-indicator">
        ${isTrinomial ? 'Variante ' : ''}${mlCurrentVariantSlide + 1} de ${n}
      </span>
      <button class="ml-variant-nav-btn" onclick="mlVariantNavBottomSheet(1)">&#8250;</button>
    `;
    handle.insertAdjacentElement('afterend', navBar);

    const dotsBar = document.createElement('div');
    dotsBar.className = 'rbs-variant-dots-bar';
    dotsBar.id = 'rbs-variant-dots';
    dotsBar.innerHTML = dotsHTML;
    navBar.insertAdjacentElement('afterend', dotsBar);
  }

  // Añadir swipe horizontal al contenido del bottom sheet
  const sheetContent = sheet.querySelector('.rbs-content') || sheet;
  sheetContent.addEventListener('touchstart', mlBottomSheetSwipeStart, { passive: true });
  sheetContent.addEventListener('touchend', mlBottomSheetSwipeEnd, { passive: true });
}

function mlBottomSheetSwipeStart(e) {
  mlVariantSwipeStartX = e.changedTouches[0].screenX;
}

function mlBottomSheetSwipeEnd(e) {
  const diff = mlVariantSwipeStartX - e.changedTouches[0].screenX;
  if (Math.abs(diff) > 50 && mlCurrentVariantGroup) {
    mlVariantNavBottomSheet(diff > 0 ? 1 : -1);
  }
}

/**
 * Navega entre variantes en el bottom sheet móvil.
 * Recarga el contenido del bottom sheet con la nueva variante.
 */
async function mlVariantNavBottomSheet(direction) {
  if (!mlCurrentVariantGroup || mlCurrentVariantGroup.length === 0) return;

  const n = mlCurrentVariantGroup.length;
  mlCurrentVariantSlide = (mlCurrentVariantSlide + direction + n) % n;
  const isTrinomial = mlCurrentVariantGroup[0].props._isTrinomialGroup;
  const currentVariant = mlCurrentVariantGroup[mlCurrentVariantSlide];

  // Actualizar indicador
  const indicator = document.getElementById('rbs-variant-indicator');
  if (indicator) {
    indicator.textContent = `${isTrinomial ? 'Variante ' : ''}${mlCurrentVariantSlide + 1} de ${n}`;
  }

  // Actualizar dots
  const dotsContainer = document.getElementById('rbs-variant-dots');
  if (dotsContainer) {
    const dots = dotsContainer.querySelectorAll('.ml-variant-dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === mlCurrentVariantSlide);
    });
  }

  // Preparar props para el bottom sheet
  const propsForSheet = { ...currentVariant.props };
  if (isTrinomial) {
    propsForSheet.grado1 = propsForSheet._displayGrado || propsForSheet.grado1;
    propsForSheet.exp1 = propsForSheet._displayExp;
    propsForSheet.long1 = propsForSheet._displayLong;
  }

  // Actualizar datos del bottom sheet sin cerrar/reabrir
  mlUpdateBottomSheetContent(propsForSheet, isTrinomial);
}

/**
 * Actualiza el contenido del bottom sheet de ruta con datos de una nueva variante.
 * Modifica directamente los elementos DOM existentes del bottom sheet.
 */
function mlUpdateBottomSheetContent(props, isTrinomial) {
  const schoolId = mlCurrentSchool || 'valeria';
  const grade = props.grado1 || '?';
  const gradeColor = getGradeColor(grade);
  const routeId = Number(props.id);
  const routeName = props.nombre || 'Sin nombre';

  // Actualizar estado global
  mlCurrentRouteGrade = grade;
  mlCurrentRouteSector = props.sector || '';
  mlCurrentRouteId = routeId;
  mlCurrentRouteName = routeName;

  // --- Header ---
  const nameEl = document.getElementById('rbs-route-name');
  if (nameEl) nameEl.textContent = routeName;

  const gradeEl = document.getElementById('rbs-route-grade');
  if (gradeEl) {
    gradeEl.textContent = grade;
    gradeEl.style.backgroundColor = gradeColor;
  }

  // Check de ascenso
  const hasAscent = (typeof hasUserAscent === 'function') && hasUserAscent(schoolId, routeId);
  const checkEl = document.getElementById('rbs-ascent-check');
  if (checkEl) checkEl.classList.toggle('hidden', !hasAscent);

  const styleEl = document.getElementById('rbs-ascent-style');
  if (styleEl) {
    if (hasAscent && typeof getUserAscentInfo === 'function' && typeof getAscentStyleSVG === 'function') {
      const ascentInfo = getUserAscentInfo(schoolId, routeId);
      if (ascentInfo && ascentInfo.style) {
        styleEl.innerHTML = getAscentStyleSVG(ascentInfo.style);
        styleEl.className = 'rbs-ascent-style ascent-style-' + ascentInfo.style;
        styleEl.classList.remove('hidden');
      } else {
        styleEl.classList.add('hidden');
      }
    } else {
      styleEl.classList.add('hidden');
    }
  }

  // --- Info items ---
  const infoContainer = document.getElementById('rbs-info-items');
  if (infoContainer) {
    if (!props.descripcion && props.descripcio) {
      props.descripcion = props.descripcio;
    }

    const iconClimber = `<img src="icons/placa.png" alt="Tipo" width="32" height="32">`;
    const iconExpress = `<img src="icons/mosq.png" alt="Expresos" width="32" height="32">`;
    const iconRope = `<img src="icons/cuerda.png" alt="Cuerda" width="32" height="32">`;

    const hasDescripcion = props.descripcion && props.descripcion.trim();
    const hasExp = props.exp1 != null && props.exp1 !== '';
    const hasLong = props.long1 != null && props.long1 !== '';

    let infoHTML = '';
    if (hasDescripcion) {
      infoHTML += `<div class="ml-route-item"><span class="ml-route-icon">${iconClimber}</span><span class="ml-route-text">${props.descripcion}</span></div>`;
    }
    if (hasExp) {
      infoHTML += `<div class="ml-route-item"><span class="ml-route-icon">${iconExpress}</span><span class="ml-route-text">${props.exp1} express</span></div>`;
    }
    if (hasLong) {
      infoHTML += `<div class="ml-route-item"><span class="ml-route-icon">${iconRope}</span><span class="ml-route-text">${props.long1} mts</span></div>`;
    }
    infoContainer.innerHTML = infoHTML;
  }

  // --- Aleje (async) ---
  const alejeContainer = document.getElementById('rbs-aleje-container');
  if (alejeContainer && typeof getAlejeVotes === 'function') {
    alejeContainer.innerHTML = '<div style="text-align:center;color:#888;font-size:13px;">Cargando...</div>';
    getAlejeVotes(schoolId, routeId).then(alejeData => {
      if (typeof generateAlejeBarHTML === 'function') {
        alejeContainer.innerHTML = generateAlejeBarHTML(routeId, schoolId, alejeData.avg, alejeData.userVote);
      }
    }).catch(() => { alejeContainer.innerHTML = ''; });
  }

  // --- Estado (async) ---
  const estadoContainer = document.getElementById('rbs-estado-container');
  if (estadoContainer && typeof getEstadoVotes === 'function') {
    estadoContainer.innerHTML = '<div style="text-align:center;color:#888;font-size:13px;">Cargando...</div>';
    getEstadoVotes(schoolId, routeId).then(estadoData => {
      if (typeof generateEstadoStarsHTML === 'function') {
        estadoContainer.innerHTML = generateEstadoStarsHTML(routeId, schoolId, estadoData.avg, estadoData.userVote);
      }
    }).catch(() => { estadoContainer.innerHTML = ''; });
  }

  // --- Botonera ---
  const actionsContainer = document.getElementById('rbs-actions');
  if (actionsContainer) {
    const iconCheck = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const iconBookmark = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
    const iconComment = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
    const iconShare = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

    actionsContainer.innerHTML = `
      <button class="ml-route-action-btn" onclick="mlRegisterAscent(${routeId}, '${encodeURIComponent(routeName)}')" title="Registrar ascenso">${iconCheck}</button>
      <button class="ml-route-action-btn" onclick="mlToggleBookmark(${routeId}, '${encodeURIComponent(routeName)}')" title="Guardar">${iconBookmark}</button>
      <button class="ml-route-action-btn ml-comment-btn" onclick="mlOpenComments(${routeId}, '${encodeURIComponent(routeName)}')" title="Comentarios">${iconComment}</button>
      <button class="ml-route-action-btn" onclick="mlShareRoute(${routeId}, '${encodeURIComponent(routeName)}')" title="Compartir">${iconShare}</button>
    `;
  }
}

/**
 * Genera el HTML del indicador de aleje con 5 segmentos iguales y votación por click.
 * Cada segmento representa un nivel discreto (1-5). Los usuarios votan clickando un segmento.
 * El marcador indica la media de las votaciones.
 * @param {number} routeId - ID numérico de la ruta (from GeoJSON properties.id)
 * @param {string} schoolId - ID de la escuela
 * @param {number|null} avgVote - Media actual de votaciones (1-5), null si no hay votos
 * @param {number|null} userVote - Voto del usuario actual (1-5), null si no ha votado
 * @returns {string} HTML string
 */
function generateAlejeBarHTML(routeId, schoolId, avgVote, userVote) {
  const segments = [
    { level: 1, cls: 'ml-route-aleje-g1' },
    { level: 2, cls: 'ml-route-aleje-g2' },
    { level: 3, cls: 'ml-route-aleje-y' },
    { level: 4, cls: 'ml-route-aleje-o' },
    { level: 5, cls: 'ml-route-aleje-r' }
  ];

  const segmentsHTML = segments.map(s => {
    const activeClass = userVote === s.level ? 'ml-route-aleje-active' : '';
    return `<div class="ml-route-aleje-segment ${s.cls} ${activeClass}" onclick="mlVoteAleje(${routeId}, '${schoolId}', ${s.level})" data-level="${s.level}"></div>`;
  }).join('');

  // Marcador de media: posicionar en % sobre la barra (cada segmento = 20%)
  let markerHTML = '';
  if (avgVote !== null && avgVote > 0) {
    const pct = ((avgVote - 1) / 4) * 100;
    markerHTML = `<div class="ml-route-aleje-marker" style="left: ${pct}%"><div class="ml-route-aleje-line"></div></div>`;
  }

  return `
    <div class="ml-route-aleje">
      <span class="ml-route-aleje-label">Aleje ${userVote === null ? '<span class="ml-route-aleje-hint">(vota)</span>' : ''}</span>
      <div class="ml-route-aleje-bar">
        ${segmentsHTML}
        ${markerHTML}
      </div>
    </div>
  `;
}

/**
 * Vota el aleje de una ruta. Guarda en Firestore y actualiza la barra visualmente.
 * @param {number} routeId - ID numérico de la ruta
 * @param {string} schoolId - ID de la escuela
 * @param {number} level - Nivel votado (1-5)
 */
async function mlVoteAleje(routeId, schoolId, level) {
  try {
    if (typeof auth === 'undefined' || !auth.currentUser) {
      if (typeof showToast === 'function') showToast('Inicia sesión para votar el aleje');
      return;
    }

    const userId = auth.currentUser.uid;
    const docId = `${schoolId}_${routeId}`;

    const db = firebase.firestore();
    const alejeRef = db.collection('aleje_votes').doc(docId);
    const doc = await alejeRef.get();

    let votes = {};
    if (doc.exists) {
      votes = doc.data().votes || {};
    }

    // Toggle: si el usuario ya votó este mismo nivel, cancelar voto
    const isUnvote = votes[userId] === level;

    if (isUnvote) {
      // Usar FieldValue.delete() para eliminar la clave del mapa en Firestore
      // (delete local no basta con merge:true, Firestore no borra claves ausentes)
      await alejeRef.set({
        schoolId: schoolId,
        routeId: routeId,
        votes: { [userId]: firebase.firestore.FieldValue.delete() },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      delete votes[userId];
    } else {
      votes[userId] = level;
      await alejeRef.set({
        schoolId: schoolId,
        routeId: routeId,
        votes: votes,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    // Calcular nueva media (o null si no quedan votos)
    const values = Object.values(votes);
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

    // Actualizar barra visualmente sin recargar popup
    const bar = document.querySelector('.ml-route-aleje-bar');
    if (bar) {
      // Actualizar segmento activo (ninguno si se canceló)
      bar.querySelectorAll('.ml-route-aleje-segment').forEach(seg => {
        const segLevel = parseInt(seg.getAttribute('data-level'));
        seg.classList.toggle('ml-route-aleje-active', !isUnvote && segLevel === level);
      });

      // Actualizar o eliminar marcador
      let marker = bar.querySelector('.ml-route-aleje-marker');
      if (avg !== null) {
        const pct = ((avg - 1) / 4) * 100;
        if (marker) {
          marker.style.left = pct + '%';
        } else {
          marker = document.createElement('div');
          marker.className = 'ml-route-aleje-marker';
          marker.style.left = pct + '%';
          marker.innerHTML = '<div class="ml-route-aleje-line"></div>';
          bar.appendChild(marker);
        }
      } else if (marker) {
        marker.remove();
      }
    }

    // Mostrar "(vota)" solo cuando el usuario no tiene voto activo
    const label = document.querySelector('.ml-route-aleje-label');
    if (label) {
      label.innerHTML = isUnvote
        ? 'Aleje <span class="ml-route-aleje-hint">(vota)</span>'
        : 'Aleje';
    }

    if (typeof showToast === 'function') showToast(isUnvote ? 'Voto de aleje cancelado' : 'Aleje actualizado');

  } catch (e) {
    console.error('[Aleje] Error votando:', e);
    if (typeof showToast === 'function') showToast('Error al votar aleje');
  }
}

/**
 * Obtiene los datos de votación de aleje para una ruta desde Firestore.
 * @param {string} schoolId - ID de la escuela
 * @param {number} routeId - ID numérico de la ruta
 * @returns {Promise<{avg: number|null, userVote: number|null}>}
 */
async function getAlejeVotes(schoolId, routeId) {
  try {
    if (typeof firebase === 'undefined' || !firebase.firestore) {
      return { avg: null, userVote: null };
    }

    const db = firebase.firestore();
    const docId = `${schoolId}_${routeId}`;
    const doc = await db.collection('aleje_votes').doc(docId).get();

    if (!doc.exists) return { avg: null, userVote: null };

    const votes = doc.data().votes || {};
    const values = Object.values(votes);

    if (values.length === 0) return { avg: null, userVote: null };

    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    let userVote = null;
    if (typeof auth !== 'undefined' && auth.currentUser) {
      userVote = votes[auth.currentUser.uid] || null;
    }

    return { avg, userVote };
  } catch (e) {
    console.error('[Aleje] Error obteniendo votos:', e);
    return { avg: null, userVote: null };
  }
}

/**
 * Genera el HTML del sistema de estrellas para votar el estado de la vía.
 * 5 estrellas clicables. El usuario puede votar, cambiar o cancelar su voto.
 * Se muestra la media de todas las votaciones.
 * @param {number} routeId - ID numérico de la ruta (from GeoJSON properties.id)
 * @param {string} schoolId - ID de la escuela
 * @param {number|null} avgVote - Media actual de votaciones (1-5), null si no hay votos
 * @param {number|null} userVote - Voto del usuario actual (1-5), null si no ha votado
 * @returns {string} HTML string
 */
function generateEstadoStarsHTML(routeId, schoolId, avgVote, userVote) {
  let starsHTML = '';
  for (let i = 1; i <= 5; i++) {
    const filledClass = (userVote !== null && i <= userVote) ? 'ml-estado-star-filled' : '';
    const avgClass = (userVote === null && avgVote !== null && i <= Math.round(avgVote)) ? 'ml-estado-star-avg' : '';
    starsHTML += `<span class="ml-estado-star ${filledClass} ${avgClass}" onclick="mlVoteEstado(${routeId}, '${schoolId}', ${i})" data-star="${i}" data-avg="${avgVote !== null ? avgVote : 0}" onmouseenter="mlEstadoHover(${i})" onmouseleave="mlEstadoHover(0)">&#9733;</span>`;
  }

  let avgHTML = '';
  if (avgVote !== null && avgVote > 0) {
    avgHTML = `<span class="ml-estado-avg">${avgVote.toFixed(1)}</span>`;
  }

  return `
    <div class="ml-route-estado">
      <span class="ml-route-estado-label">Estado de la v&iacute;a ${userVote === null ? '<span class="ml-route-estado-hint">(vota)</span>' : ''}</span>
      <div class="ml-estado-stars-row">
        <div class="ml-estado-stars">${starsHTML}</div>
        ${avgHTML}
      </div>
    </div>
  `;
}

/**
 * Efecto hover en estrellas de estado: rellena dorado las estrellas 1..level.
 * Al salir (level=0), restaura el estado real del voto del usuario.
 * @param {number} level - Estrella sobre la que se hace hover (0 = salir)
 */
function mlEstadoHover(level) {
  const stars = document.querySelectorAll('.ml-estado-star');
  stars.forEach(star => {
    const starLevel = parseInt(star.getAttribute('data-star'));
    if (level > 0) {
      // Estrellas dentro del rango hover: dorado sólido (ocultar avg atenuado)
      if (starLevel <= level) {
        star.classList.add('ml-estado-hovering');
        star.classList.add('ml-estado-star-hover');
      } else {
        // Estrellas fuera del rango hover: mantener estado base (avg atenuado si aplica)
        star.classList.remove('ml-estado-hovering');
        star.classList.remove('ml-estado-star-hover');
      }
    } else {
      // Al salir, restaurar estado: mostrar avg de nuevo si no hay voto propio
      star.classList.remove('ml-estado-star-hover');
      star.classList.remove('ml-estado-hovering');
    }
  });
}

/**
 * Vota el estado de una ruta. Guarda en Firestore y actualiza las estrellas visualmente.
 * Si el usuario vota el mismo nivel que ya tenía, se cancela el voto.
 * @param {number} routeId - ID numérico de la ruta
 * @param {string} schoolId - ID de la escuela
 * @param {number} level - Nivel votado (1-5)
 */
async function mlVoteEstado(routeId, schoolId, level) {
  try {
    if (typeof auth === 'undefined' || !auth.currentUser) {
      if (typeof showToast === 'function') showToast('Inicia sesión para votar el estado');
      return;
    }

    const userId = auth.currentUser.uid;
    const docId = `${schoolId}_${routeId}`;

    const db = firebase.firestore();
    const estadoRef = db.collection('estado_votes').doc(docId);
    const doc = await estadoRef.get();

    let votes = {};
    if (doc.exists) {
      votes = doc.data().votes || {};
    }

    // Toggle: si el usuario ya votó este mismo nivel, cancelar voto
    const isUnvote = votes[userId] === level;

    if (isUnvote) {
      await estadoRef.set({
        schoolId: schoolId,
        routeId: routeId,
        votes: { [userId]: firebase.firestore.FieldValue.delete() },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      delete votes[userId];
    } else {
      votes[userId] = level;
      await estadoRef.set({
        schoolId: schoolId,
        routeId: routeId,
        votes: votes,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    // Calcular nueva media
    const values = Object.values(votes);
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const newUserVote = isUnvote ? null : level;

    // Actualizar estrellas visualmente
    const starsContainer = document.querySelector('.ml-estado-stars');
    if (starsContainer) {
      const roundedAvg = avg !== null ? Math.round(avg) : 0;
      starsContainer.querySelectorAll('.ml-estado-star').forEach(star => {
        const starLevel = parseInt(star.getAttribute('data-star'));
        star.setAttribute('data-avg', avg !== null ? avg : 0);
        star.classList.toggle('ml-estado-star-filled', newUserVote !== null && starLevel <= newUserVote);
        // Si el usuario quita su voto, mostrar la media atenuada
        star.classList.toggle('ml-estado-star-avg', newUserVote === null && starLevel <= roundedAvg);
      });
    }

    // Actualizar media
    const avgEl = document.querySelector('.ml-estado-avg');
    if (avg !== null) {
      if (avgEl) {
        avgEl.textContent = avg.toFixed(1);
      } else {
        const row = document.querySelector('.ml-estado-stars-row');
        if (row) {
          const span = document.createElement('span');
          span.className = 'ml-estado-avg';
          span.textContent = avg.toFixed(1);
          row.appendChild(span);
        }
      }
    } else if (avgEl) {
      avgEl.remove();
    }

    // Actualizar label "(vota)"
    const label = document.querySelector('.ml-route-estado-label');
    if (label) {
      label.innerHTML = isUnvote
        ? 'Estado de la v&iacute;a <span class="ml-route-estado-hint">(vota)</span>'
        : 'Estado de la v&iacute;a';
    }

    if (typeof showToast === 'function') showToast(isUnvote ? 'Voto de estado cancelado' : 'Estado actualizado');

  } catch (e) {
    console.error('[Estado] Error votando:', e);
    if (typeof showToast === 'function') showToast('Error al votar estado');
  }
}

/**
 * Obtiene los datos de votación de estado para una ruta desde Firestore.
 * @param {string} schoolId - ID de la escuela
 * @param {number} routeId - ID numérico de la ruta
 * @returns {Promise<{avg: number|null, userVote: number|null}>}
 */
async function getEstadoVotes(schoolId, routeId) {
  try {
    if (typeof firebase === 'undefined' || !firebase.firestore) {
      return { avg: null, userVote: null };
    }

    const db = firebase.firestore();
    const docId = `${schoolId}_${routeId}`;
    const doc = await db.collection('estado_votes').doc(docId).get();

    if (!doc.exists) return { avg: null, userVote: null };

    const votes = doc.data().votes || {};
    const values = Object.values(votes);

    if (values.length === 0) return { avg: null, userVote: null };

    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    let userVote = null;
    if (typeof auth !== 'undefined' && auth.currentUser) {
      userVote = votes[auth.currentUser.uid] || null;
    }

    return { avg, userVote };
  } catch (e) {
    console.error('[Estado] Error obteniendo votos:', e);
    return { avg: null, userVote: null };
  }
}

/**
 * Obtiene los IDs de todas las vías de un sector a partir de la fuente GeoJSON del mapa.
 * @param {string} sectorName - Nombre del sector
 * @returns {number[]} Array de IDs numéricos de las vías del sector
 */
function getRouteIdsForSector(sectorName) {
  if (!mlMap || !mlMap.getSource('vias-source')) return [];

  const source = mlMap.getSource('vias-source');
  let routeFeatures = [];

  if (source && source._data && source._data.features) {
    routeFeatures = source._data.features;
  } else {
    routeFeatures = mlMap.querySourceFeatures('vias-source', { sourceLayer: 'vias' });
  }

  const targetSector = sectorName.toLowerCase().trim();
  const routeIds = [];

  routeFeatures.forEach(feature => {
    const props = feature.properties;
    const routeSector = (props.sector || '').toLowerCase().trim();
    if (routeSector === targetSector) {
      const id = Number(props.id);
      if (!isNaN(id)) routeIds.push(id);
    }
  });

  return routeIds;
}

/**
 * Calcula el estado medio de un sector a partir de los votos de estado de sus vías.
 * Solo muestra resultado si al menos el 40% de las vías tienen valoración.
 * @param {string} schoolId - ID de la escuela
 * @param {string} sectorName - Nombre del sector
 * @returns {Promise<{avg: number|null, ratedCount: number, totalCount: number}>}
 */
async function getSectorEstadoAverage(schoolId, sectorName) {
  try {
    if (typeof firebase === 'undefined' || !firebase.firestore) {
      return { avg: null, ratedCount: 0, totalCount: 0 };
    }

    const routeIds = getRouteIdsForSector(sectorName);
    const totalCount = routeIds.length;

    if (totalCount === 0) return { avg: null, ratedCount: 0, totalCount: 0 };

    const db = firebase.firestore();
    const BATCH_SIZE = 10; // Firestore 'in' queries limited to 10
    const allAvgs = [];

    // Batch query estado_votes documents
    for (let i = 0; i < routeIds.length; i += BATCH_SIZE) {
      const batch = routeIds.slice(i, i + BATCH_SIZE);
      const docIds = batch.map(id => `${schoolId}_${id}`);

      // Fetch each doc individually (doc IDs, not field queries)
      const promises = docIds.map(docId =>
        db.collection('estado_votes').doc(docId).get()
      );
      const docs = await Promise.all(promises);

      docs.forEach(doc => {
        if (doc.exists) {
          const votes = doc.data().votes || {};
          const values = Object.values(votes);
          if (values.length > 0) {
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            allAvgs.push(avg);
          }
        }
      });
    }

    const ratedCount = allAvgs.length;
    const minRequired = Math.ceil(totalCount * 0.4);

    if (ratedCount < minRequired) {
      return { avg: null, ratedCount, totalCount };
    }

    const sectorAvg = allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length;
    return { avg: sectorAvg, ratedCount, totalCount };
  } catch (e) {
    console.error('[SectorEstado] Error calculando media del sector:', e);
    return { avg: null, ratedCount: 0, totalCount: 0 };
  }
}

/**
 * Genera HTML de estrellas de solo lectura para el estado del sector.
 * @param {number} avgVote - Media del estado (1-5)
 * @param {number} ratedCount - Número de vías valoradas
 * @param {number} totalCount - Total de vías en el sector
 * @returns {string} HTML del indicador
 */
function generateSectorEstadoHTML(avgVote, ratedCount, totalCount) {
  let starsHTML = '';
  const roundedAvg = Math.round(avgVote);

  for (let i = 1; i <= 5; i++) {
    const filledClass = i <= roundedAvg ? 'ml-sector-estado-star-filled' : '';
    starsHTML += `<span class="ml-sector-estado-star ${filledClass}">&#9733;</span>`;
  }

  return `
    <div class="ml-sector-estado">
      <div class="ml-sector-estado-header">
        <span class="ml-sector-estado-label">Estado del Sector</span>
        <span class="ml-sector-estado-count">${ratedCount}/${totalCount} v&iacute;as valoradas</span>
      </div>
      <div class="ml-sector-estado-row">
        <div class="ml-sector-estado-stars">${starsHTML}</div>
        <span class="ml-sector-estado-avg">${avgVote.toFixed(1)}</span>
      </div>
    </div>
  `;
}

/**
 * Abre modal para que el usuario contribuya datos faltantes de una vía
 */
function mlContributeField(routeId, schoolId, field) {
  const routeName = mlCurrentRouteName || 'Sin nombre';

  // Cerrar popup / bottom sheet
  if (mlRoutePopup) mlRoutePopup.remove();
  hideRouteBottomSheet();

  // Si hay una función de contribución disponible en user-features, usarla
  if (typeof openContributeModal === 'function') {
    openContributeModal(schoolId, routeName, field);
    return;
  }

  // Generar solo el campo correspondiente al tipo de sugerencia
  let fieldHTML = '';
  if (field === 'tipo') {
    fieldHTML = `
      <label style="display:block; margin-bottom:8px; font-size:14px; color:#374151;">Tipo de escalada</label>
      <select class="ml-contribute-select" id="ml-contribute-tipo">
        <option value="">Selecciona...</option>
        <option value="Placa">Placa</option>
        <option value="Fisura">Fisura</option>
        <option value="Diedro">Diedro</option>
        <option value="Desplome">Desplome</option>
        <option value="Bavaresa">Bavaresa</option>
        <option value="Chimenea">Chimenea</option>
      </select>`;
  } else if (field === 'express') {
    fieldHTML = `
      <label style="display:block; margin-bottom:8px; font-size:14px; color:#374151;">N&uacute;mero de express</label>
      <input type="number" class="ml-contribute-input" id="ml-contribute-exp" placeholder="Ej: 8" min="0" max="50">`;
  } else if (field === 'metros') {
    fieldHTML = `
      <label style="display:block; margin-bottom:8px; font-size:14px; color:#374151;">Metros de la v&iacute;a</label>
      <input type="number" class="ml-contribute-input" id="ml-contribute-long" placeholder="Ej: 25" min="0" max="500">`;
  } else {
    // Fallback: mostrar todos los campos si no se especifica campo
    fieldHTML = `
      <label style="display:block; margin-bottom:8px; font-size:14px; color:#374151;">Tipo de escalada</label>
      <select class="ml-contribute-select" id="ml-contribute-tipo">
        <option value="">Selecciona...</option>
        <option value="Placa">Placa</option>
        <option value="Fisura">Fisura</option>
        <option value="Diedro">Diedro</option>
        <option value="Desplome">Desplome</option>
        <option value="Bavaresa">Bavaresa</option>
        <option value="Chimenea">Chimenea</option>
      </select>
      <label style="display:block; margin-top:12px; margin-bottom:8px; font-size:14px; color:#374151;">N&uacute;mero de express</label>
      <input type="number" class="ml-contribute-input" id="ml-contribute-exp" placeholder="Ej: 8" min="0" max="50">
      <label style="display:block; margin-top:12px; margin-bottom:8px; font-size:14px; color:#374151;">Metros de la v&iacute;a</label>
      <input type="number" class="ml-contribute-input" id="ml-contribute-long" placeholder="Ej: 25" min="0" max="500">`;
  }

  // Fallback: Mostrar modal básico de contribución
  const overlay = document.createElement('div');
  overlay.className = 'ml-contribute-modal-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div class="ml-contribute-modal">
      <h3>Contribuir datos</h3>
      <p>Ayuda a completar la información de <strong>${routeName}</strong></p>
      ${fieldHTML}
      <div class="ml-contribute-actions">
        <button class="ml-contribute-btn ml-contribute-btn-cancel" onclick="this.closest('.ml-contribute-modal-overlay').remove()">Cancelar</button>
        <button class="ml-contribute-btn ml-contribute-btn-submit" onclick="mlSubmitContribution(${routeId}, '${schoolId}')">Enviar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

/**
 * Envía la contribución de datos de vía a Firestore
 */
async function mlSubmitContribution(routeId, schoolId) {
  const routeName = mlCurrentRouteName || 'Sin nombre';
  const tipo = document.getElementById('ml-contribute-tipo')?.value;
  const exp = document.getElementById('ml-contribute-exp')?.value;
  const long = document.getElementById('ml-contribute-long')?.value;

  if (!tipo && !exp && !long) {
    if (typeof showToast === 'function') showToast('Rellena al menos un campo', 'info');
    return;
  }

  if (typeof db === 'undefined' || typeof currentUser === 'undefined' || !currentUser) {
    if (typeof showToast === 'function') showToast('Inicia sesión para contribuir', 'info');
    return;
  }

  const contribution = {
    routeId: routeId,
    routeName: routeName,
    schoolId: schoolId,
    userId: currentUser.uid,
    userEmail: currentUser.email,
    status: 'pending',
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    data: {}
  };
  if (tipo) contribution.data.descripcion = tipo;
  if (exp) contribution.data.exp1 = parseInt(exp);
  if (long) contribution.data.long1 = parseInt(long);

  try {
    await db.collection('routeSuggestions').add(contribution);

    // Mostrar éxito
    const modal = document.querySelector('.ml-contribute-modal');
    if (modal) {
      modal.innerHTML = `
        <div class="ml-contribute-success">
          <div class="ml-contribute-success-icon">&#10004;&#65039;</div>
          <h3>Gracias</h3>
          <p>Tu contribuci&oacute;n ser&aacute; revisada por un administrador.</p>
        </div>
      `;
      setTimeout(() => {
        document.querySelector('.ml-contribute-modal-overlay')?.remove();
      }, 2000);
    }
  } catch (error) {
    console.error('Error enviando contribución:', error);
    if (typeof showToast === 'function') showToast('Error al enviar', 'error');
  }
}
window.mlContributeField = mlContributeField;
window.mlSubmitContribution = mlSubmitContribution;

// Funciones para los botones del popup - conectadas con user-features.js
function mlRegisterAscent(routeId, encodedName) {
  const name = decodeURIComponent(encodedName);
  console.log('Registrar ascenso:', name, 'routeId:', routeId);

  // Cerrar popup
  if (mlRoutePopup) mlRoutePopup.remove();

  // Usar openAscentModal de user-features.js
  if (typeof openAscentModal === 'function') {
    // Obtener datos de la vía actual
    const schoolId = mlCurrentSchool || 'valeria';
    const schoolName = MAPLIBRE_SCHOOLS[schoolId]?.name || 'Escuela';
    const grade = mlCurrentRouteGrade || '?';
    const sector = mlCurrentRouteSector || '';
    openAscentModal(schoolId, schoolName, routeId, name, grade, sector);
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

function mlToggleBookmark(routeId, encodedName) {
  const name = decodeURIComponent(encodedName);
  console.log('Toggle bookmark:', name, 'routeId:', routeId);

  if (typeof addToProjects === 'function') {
    const schoolId = mlCurrentSchool || 'valeria';
    addToProjects(schoolId, routeId, name);
  } else if (typeof addToFavorites === 'function') {
    const schoolId = mlCurrentSchool || 'valeria';
    addToFavorites(schoolId, routeId, name);
  } else {
    showToast('Guardado en proyectos', 'success');
  }
}

function mlOpenComments(routeId, encodedName) {
  const name = decodeURIComponent(encodedName);
  console.log('Abrir comentarios:', name, 'routeId:', routeId);

  // Cerrar popup
  if (mlRoutePopup) mlRoutePopup.remove();

  // Abrir modal de comentarios directamente
  if (typeof openCommentsModal === 'function') {
    openCommentsModal(mlCurrentSchool, routeId, name);
  } else {
    showToast('Comentarios no disponibles', 'info');
  }
}

function mlShareRoute(routeId, encodedName) {
  const name = decodeURIComponent(encodedName);
  console.log('Compartir ruta:', name, 'routeId:', routeId);

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
function mlViewRouteInSector(schoolId, encodedSector, routeId) {
  routeId = Number(routeId);
  const sectorName = decodeURIComponent(encodedSector);
  console.log('Ver vía en sector:', routeId, 'en', sectorName);

  // Cerrar popup
  if (mlRoutePopup) mlRoutePopup.remove();

  // Abrir el visor del sector con la vía resaltada
  if (typeof openSectorImageViewerWithHighlight === 'function') {
    openSectorImageViewerWithHighlight(schoolId, sectorName, routeId);
  } else {
    // Fallback: abrir visor sin highlight
    if (typeof openSectorImageViewer === 'function') {
      openSectorImageViewer(schoolId, sectorName);
    } else {
      showToast('Visor de sector no disponible', 'info');
    }
  }
}

// ============================================
// HIGHLIGHT DE VÍA EN EL MAPA (desde visor de sector)
// ============================================

let mlHighlightTimer = null;

/**
 * Encuentra la coordenada de una vía por su routeId.
 * Busca primero en el source de vector tiles y luego en el GeoJSON.
 */
async function mlFindRouteCoords(routeId) {
  // 1. Intentar querySourceFeatures (vector tiles cargados)
  if (mlMap && mlMap.getSource('vias-source')) {
    try {
      let features = mlMap.querySourceFeatures('vias-source', { sourceLayer: 'vias' });
      if (!features.length) {
        features = mlMap.querySourceFeatures('vias-source');
      }
      for (const f of features) {
        if (f.properties && Number(f.properties.id) === Number(routeId)) {
          if (f.geometry.type === 'Point') return f.geometry.coordinates;
          if (f.geometry.type === 'MultiPoint') return f.geometry.coordinates[0];
        }
      }
    } catch (e) { /* tiles may not be loaded */ }

    // 1b. Intentar source._data (GeoJSON mode)
    try {
      const source = mlMap.getSource('vias-source');
      if (source && source._data && source._data.features) {
        for (const f of source._data.features) {
          if (f.properties && Number(f.properties.id) === Number(routeId)) {
            if (f.geometry.type === 'Point') return f.geometry.coordinates;
            if (f.geometry.type === 'MultiPoint') return f.geometry.coordinates[0];
          }
        }
      }
    } catch (e) { /* no _data */ }
  }

  // 2. Fallback: fetch GeoJSON directamente
  const schoolId = mlCurrentSchool || 'valeria';
  const school = typeof MAPLIBRE_SCHOOLS !== 'undefined' ? MAPLIBRE_SCHOOLS[schoolId] : null;
  if (school && school.geojson && school.geojson.vias) {
    try {
      const resp = await fetch(school.geojson.vias + '?v=' + Date.now());
      if (resp.ok) {
        const geojson = await resp.json();
        for (const f of (geojson.features || [])) {
          if (f.properties && Number(f.properties.id) === Number(routeId)) {
            if (f.geometry.type === 'Point') return f.geometry.coordinates;
            if (f.geometry.type === 'MultiPoint') return f.geometry.coordinates[0];
          }
        }
      }
    } catch (e) { /* fetch failed */ }
  }

  return null;
}

/**
 * Navega al mapa, centra en la vía y la resalta visualmente.
 * Llamada desde el visor de sector (svNavigateToRouteOnMap).
 * Compatible con Web y App Nativa (Capacitor WebView).
 */
async function mlHighlightRouteOnMap(routeId) {
  if (!mlMap) return;

  const coords = await mlFindRouteCoords(routeId);
  if (!coords) {
    if (typeof showToast === 'function') showToast('No se encontró la vía en el mapa', 'info');
    return;
  }

  const mobile = typeof isMobileDevice === 'function' && isMobileDevice();
  const targetZoom = Math.max(mlMap.getZoom(), 18);

  // Volar a la ubicación de la vía (parámetros ajustados para móvil)
  mlMap.flyTo({
    center: coords,
    zoom: targetZoom,
    speed: mobile ? 1.6 : 1.2,
    curve: 1,
    padding: { top: mobile ? 60 : 100, bottom: 0, left: 0, right: 0 }
  });

  // Aplicar highlight tras la animación de vuelo
  mlMap.once('moveend', () => {
    mlApplyRouteHighlight(coords, routeId);
  });
}

// ID del requestAnimationFrame activo para la animación de pulso
let mlPulseAnimId = null;

/**
 * Aplica un highlight visual temporal (anillo pulsante) en la posición de la vía.
 * Usa requestAnimationFrame para rendimiento fluido en WebView móvil.
 */
function mlApplyRouteHighlight(coords, routeId) {
  // Limpiar highlight anterior
  mlClearRouteHighlight();

  const mobile = typeof isMobileDevice === 'function' && isMobileDevice();
  const highlightSourceId = 'vias-highlight-source';
  const highlightLayerId = 'vias-highlight-layer';
  const highlightPulseLayerId = 'vias-highlight-pulse-layer';

  // Crear source con la vía destacada
  mlMap.addSource(highlightSourceId, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coords },
        properties: { id: routeId }
      }]
    }
  });

  // Radios base ajustados a plataforma
  const baseRadius = mobile ? 16 : 20;
  const maxRadius = mobile ? 28 : 35;
  const innerRadius = mobile ? 10 : 12;

  // Capa de anillo exterior (pulso)
  mlMap.addLayer({
    id: highlightPulseLayerId,
    type: 'circle',
    source: highlightSourceId,
    paint: {
      'circle-radius': baseRadius,
      'circle-color': 'transparent',
      'circle-stroke-color': '#f59e0b',
      'circle-stroke-width': mobile ? 2.5 : 3,
      'circle-stroke-opacity': 0.8
    }
  });

  // Capa de punto interior (resaltado sólido)
  mlMap.addLayer({
    id: highlightLayerId,
    type: 'circle',
    source: highlightSourceId,
    paint: {
      'circle-radius': innerRadius,
      'circle-color': '#f59e0b',
      'circle-opacity': 0.35,
      'circle-stroke-color': '#f59e0b',
      'circle-stroke-width': 2.5,
      'circle-stroke-opacity': 1
    }
  });

  // Animación de pulso con requestAnimationFrame (más fluido que setInterval)
  const startTime = performance.now();
  const cycleDuration = 1200; // ms por ciclo completo

  function animatePulse(now) {
    if (!mlMap || !mlMap.getLayer(highlightPulseLayerId)) return;

    const elapsed = (now - startTime) % cycleDuration;
    const progress = elapsed / cycleDuration;

    // Curva sinusoidal suave para el radio
    const t = Math.sin(progress * Math.PI);
    const currentRadius = baseRadius + (maxRadius - baseRadius) * t;
    const currentOpacity = 0.8 - 0.5 * t;

    try {
      mlMap.setPaintProperty(highlightPulseLayerId, 'circle-radius', currentRadius);
      mlMap.setPaintProperty(highlightPulseLayerId, 'circle-stroke-opacity', currentOpacity);
    } catch (e) {
      return; // layer removed
    }

    mlPulseAnimId = requestAnimationFrame(animatePulse);
  }

  mlPulseAnimId = requestAnimationFrame(animatePulse);

  // Auto-eliminar el highlight después de 5 segundos
  mlHighlightTimer = setTimeout(() => {
    mlClearRouteHighlight();
  }, 5000);

  // En móvil: eliminar también al tocar el mapa
  // En web: eliminar al hacer clic
  const dismissEvent = mobile ? 'touchstart' : 'click';
  mlMap.once(dismissEvent, () => {
    mlClearRouteHighlight();
  });
}

/**
 * Elimina las capas y source del highlight de vía.
 */
function mlClearRouteHighlight() {
  if (mlHighlightTimer) {
    clearTimeout(mlHighlightTimer);
    mlHighlightTimer = null;
  }

  if (mlPulseAnimId) {
    cancelAnimationFrame(mlPulseAnimId);
    mlPulseAnimId = null;
  }

  const layers = ['vias-highlight-layer', 'vias-highlight-pulse-layer'];
  const source = 'vias-highlight-source';

  layers.forEach(id => {
    if (mlMap && mlMap.getLayer(id)) {
      try { mlMap.removeLayer(id); } catch (e) {}
    }
  });

  if (mlMap && mlMap.getSource(source)) {
    try { mlMap.removeSource(source); } catch (e) {}
  }
}

// Variables para almacenar datos de la vía actual
let mlCurrentRouteGrade = null;
let mlCurrentRouteSector = null;
let mlCurrentRouteId = null;
let mlCurrentRouteName = null;

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
        const grade = props.grado1 || '?';
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
  const containerWidth = container.clientWidth || 280;
  const availableWidth = containerWidth - 16;
  const numGrades = grades.length;
  const gap = numGrades > 15 ? 1 : numGrades > 10 ? 2 : 3;
  const barWidth = Math.max(8, Math.min(28, Math.floor((availableWidth - gap * (numGrades - 1)) / numGrades)));
  const labelFontSize = numGrades > 15 ? 7 : numGrades > 10 ? 8 : 9;

  let html = `
    <div style="text-align: center; font-weight: 600; color: #374151; margin-bottom: 12px; padding-bottom: 6px;">
      Vías por Grado <span style="font-weight: 400; color: #6b7280;">(${total} total)</span>
    </div>
    <div style="display: flex; align-items: flex-end; justify-content: center; height: 100px; gap: ${gap}px; width: 100%; box-sizing: border-box;">
  `;

  grades.forEach(grade => {
    const count = gradeCounts[grade];
    const height = Math.max(8, (count / maxCount) * 80);
    const gradeColor = getGradeColor(grade);

    html += `
      <div style="display: flex; flex-direction: column; align-items: center; flex: 0 0 ${barWidth}px; min-width: 0;">
        <span style="font-size: ${Math.min(10, labelFontSize + 1)}px; color: #374151; font-weight: 600; line-height: 1.2;">${count}</span>
        <div style="width: 100%; height: ${height}px; background: ${gradeColor}; border-radius: 3px 3px 0 0;"></div>
        <div style="position: relative; width: ${barWidth}px; height: 12px; margin-top: 2px;">
          <span style="position: absolute; left: 50%; top: 0; font-size: ${labelFontSize}px; color: #6b7280; white-space: nowrap; transform: translateX(-50%) rotate(-45deg); transform-origin: top center;">${grade}</span>
        </div>
      </div>
    `;
  });

  html += '</div>';
  // Espacio extra para las etiquetas rotadas
  html += `<div style="height: ${numGrades > 10 ? 20 : 16}px;"></div>`;
  container.innerHTML = html;
}

/**
 * Muestra popup de sector
 */
function showSectorPopup(props, coords) {
  // Cerrar popup/bottom sheet de ruta si está abierto
  if (mlRoutePopup) mlRoutePopup.remove();
  hideRouteBottomSheet();

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

  // Generar IDs únicos para contenedores dinámicos
  const chartId = `sector-chart-${Date.now()}`;
  const estadoId = `sector-estado-${Date.now()}`;

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

      <!-- Estado del Sector (se carga asincrónicamente) -->
      <div id="${estadoId}"></div>

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

  // Cargar estado del sector asincrónicamente
  const schoolId = mlCurrentSchool || 'valeria';
  getSectorEstadoAverage(schoolId, sectorName).then(result => {
    const container = document.getElementById(estadoId);
    if (!container) return;
    if (result.avg !== null) {
      container.innerHTML = generateSectorEstadoHTML(result.avg, result.ratedCount, result.totalCount);
    }
  });
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

    if (isMobileDevice()) {
      // En móvil, usar bottom sheet
      if (mlSectorPopup) mlSectorPopup.remove();
      // Desplazamiento adaptativo: solo mover si el sector queda tapado por el bottom sheet
      adaptiveMapPanForBottomSheet(coords);
      showSectorBottomSheet(props, [coords.lng, coords.lat]);
    } else {
      // En desktop, usar popup tradicional de MapLibre
      mlMap.flyTo({
        center: coords,
        zoom: mlMap.getZoom(),
        speed: 0.8,
        curve: 1,
        padding: { top: 450, bottom: 0, left: 0, right: 0 }
      });
      showSectorPopup(props, [coords.lng, coords.lat]);
    }
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
  // Cerrar otros popups / bottom sheets
  if (mlRoutePopup) mlRoutePopup.remove();
  if (mlSectorPopup) mlSectorPopup.remove();
  hideRouteBottomSheet();

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
          ['==', ['get', 'nombre'], 'Cuenca'], 'school-icon-green',
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
 * Determina la comunidad autónoma actual según el centro del mapa.
 * Compara contra bounding boxes de CCAA_REGIONS.
 * Devuelve el objeto de la comunidad (con center, zoom, name).
 * Fallback: Madrid.
 */
function getCurrentCCAA() {
  if (!mlMap) return CCAA_REGIONS[CCAA_DEFAULT];

  const { lng, lat } = mlMap.getCenter();

  for (const key of Object.keys(CCAA_REGIONS)) {
    const region = CCAA_REGIONS[key];
    const [minLng, minLat, maxLng, maxLat] = region.bbox;
    if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) {
      // Si la región tiene resetTo, redirigir al reset a esa otra región
      return region.resetTo ? CCAA_REGIONS[region.resetTo] : region;
    }
  }

  return CCAA_REGIONS[CCAA_DEFAULT];
}

/**
 * Crea y configura el botón "Volver a vista regional"
 * Se posiciona debajo del botón de filtro en la esquina superior derecha
 */
function setupResetViewButton() {
  if (document.getElementById('resetViewBtn')) return;

  const container = document.getElementById('map');
  if (!container) return;

  // Crear botón dinámicamente (mismo patrón que addGradeFilterButton)
  const btn = document.createElement('button');
  btn.id = 'resetViewBtn';
  btn.className = 'map-control-btn reset-view-btn';
  btn.title = 'Volver a vista general';
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;

  container.appendChild(btn);

  // Función para actualizar visibilidad según zoom
  const updateVisibility = () => {
    if (!mlMap) return;
    // Visible cuando el zoom es mayor que el de la comunidad actual + margen
    const ccaa = getCurrentCCAA();
    btn.style.display = mlMap.getZoom() > ccaa.zoom + 1 ? 'flex' : 'none';
  };

  // Click: volver a vista regional de la comunidad autónoma actual
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!mlMap) return;

    // 1. Detectar comunidad autónoma según posición actual del mapa
    const ccaa = getCurrentCCAA();

    // 2. Cerrar panel de filtro si está abierto
    closeGradeFilterPanel();

    // 3. Cerrar todos los popups
    if (mlRoutePopup) mlRoutePopup.remove();
    if (mlSectorPopup) mlSectorPopup.remove();
    if (mlParkingPopup) mlParkingPopup.remove();
    if (mlSchoolPopup) mlSchoolPopup.remove();

    // 4. Cerrar bottom sheet
    hideRouteBottomSheet();

    // 5. Resetear escuela activa
    mlCurrentSchool = null;

    // 6. Volar a vista regional de la comunidad autónoma
    mlMap.flyTo({
      center: ccaa.center,
      zoom: ccaa.zoom,
      pitch: 0,
      bearing: 0,
      duration: 1200
    });
  });

  // Listener de zoom para mostrar/ocultar
  mlMap.on('zoom', updateVisibility);
  updateVisibility();
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

// === Sector Bottom Sheet state ===
let secBsCurrentSector = null;   // { name, props, coords }
let secBsCurrentState = 'hidden';
let secBsDragStartY = 0;
let secBsCurrentY = 0;
let secBsIsDragging = false;

// === Route Bottom Sheet state ===
let rbsCurrentState = 'hidden';
let rbsDragStartY = 0;
let rbsCurrentY = 0;
let rbsIsDragging = false;

// Constantes de snap points (porcentaje de pantalla)
const BS_SUMMARY_PERCENT = 0.35; // 35% de la pantalla
const BS_EXPANDED_PERCENT = 0.90; // 90% de la pantalla

/**
 * Desplazamiento adaptativo del mapa al abrir un bottom sheet.
 *
 * Comportamiento:
 * - Solo mueve el mapa si el punto queda tapado por el bottom sheet.
 * - Si el punto ya está en zona visible, no hace nada.
 * - Nunca desplaza el punto fuera del viewport (protección superior).
 * - Recalcula todo dinámicamente en cada invocación (sin caché ni estado).
 *
 * CSS del bottom sheet expandido: translateY(3%), max-height: 95vh
 * → El borde superior del sheet está a ~5% desde arriba del viewport.
 * → La zona visible libre queda entre y=0 y y≈5% del viewport.
 *
 * Estrategia: posicionar el punto en el centro del tercio superior
 * visible (por encima del bottom sheet), con protección de bordes.
 *
 * @param {Object} coords - {lng, lat} o [lng, lat]
 */
function adaptiveMapPanForBottomSheet(coords) {
  if (!mlMap) return;

  // --- Recalcular todo dinámicamente ---
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  // El bottom sheet expandido: translateY(3%) con max-height 95vh
  // El borde superior del sheet queda a aproximadamente 3% del viewport desde arriba.
  // Pero el sheet tiene un handle (~30px) que es semi-transparente.
  // Zona libre real para ver el mapa: desde y=0 hasta y = (tope del sheet)
  const sheetTopY = Math.round(vh * 0.08); // ~8% del viewport = zona segura visible
  // Usamos 8% (no 3%) para dar margen al handle y asegurar visibilidad clara

  const marginTop = 20;  // No acercar demasiado al borde superior
  const marginSide = 15;

  // Posición ideal: centrar el punto en la zona visible (entre marginTop y sheetTopY)
  const idealY = Math.round((marginTop + sheetTopY) / 2);

  // --- Proyectar coordenadas a pantalla ---
  const lngLat = Array.isArray(coords)
    ? { lng: coords[0], lat: coords[1] }
    : coords;
  const pointScreen = mlMap.project([lngLat.lng, lngLat.lat]);

  // --- Verificar si el punto ya está en zona segura ---
  const isInSafeZoneY = pointScreen.y >= marginTop && pointScreen.y <= sheetTopY;
  const isInSafeZoneX = pointScreen.x >= marginSide && pointScreen.x <= vw - marginSide;

  if (isInSafeZoneY && isInSafeZoneX) {
    // Punto ya visible por encima del bottom sheet — no mover
    return;
  }

  // --- Calcular desplazamiento vertical ---
  let deltaY = 0;

  if (pointScreen.y > sheetTopY) {
    // Punto tapado por el bottom sheet — subir hasta posición ideal
    deltaY = pointScreen.y - idealY;
  } else if (pointScreen.y < marginTop) {
    // Punto por encima del viewport visible — bajar hasta posición ideal
    deltaY = pointScreen.y - idealY; // Será negativo → panBy moverá mapa hacia abajo
  }

  // --- Protección contra sobre-desplazamiento ---
  // Verificar que tras el pan, el punto no salga por arriba
  const resultY = pointScreen.y - deltaY;
  if (resultY < marginTop) {
    deltaY = pointScreen.y - marginTop;
  } else if (resultY > sheetTopY) {
    deltaY = pointScreen.y - sheetTopY;
  }

  // --- Desplazamiento horizontal (protección lateral) ---
  let deltaX = 0;
  if (pointScreen.x < marginSide) {
    deltaX = pointScreen.x - marginSide;
  } else if (pointScreen.x > vw - marginSide) {
    deltaX = pointScreen.x - (vw - marginSide);
  }

  // --- Umbral mínimo: no mover si el delta es despreciable ---
  if (Math.abs(deltaY) < 5 && Math.abs(deltaX) < 5) {
    return;
  }

  // --- Aplicar desplazamiento mínimo necesario ---
  mlMap.panBy([deltaX, deltaY], {
    duration: 400,
    easing: function(t) { return t * (2 - t); } // ease-out cuadrático
  });
}

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

// ============================================
// SECTOR BOTTOM SHEET
// ============================================

/**
 * Inicializa el Sector Bottom Sheet
 */
function initSectorBottomSheet() {
  const sheet = document.getElementById('sector-bottom-sheet');
  const overlay = document.getElementById('bottom-sheet-overlay');
  const handle = sheet?.querySelector('.bottom-sheet-handle');

  if (!sheet || !overlay || !handle) {
    console.warn('Sector Bottom Sheet elementos no encontrados');
    return;
  }

  // Touch listeners en el handle
  handle.addEventListener('touchstart', secBsHandleTouchStart, { passive: true });
  handle.addEventListener('touchmove', secBsHandleTouchMove, { passive: false });
  handle.addEventListener('touchend', secBsHandleTouchEnd, { passive: true });

  // Touch listeners en el header (también arrastrable)
  const header = sheet.querySelector('.bs-header');
  if (header) {
    header.addEventListener('touchstart', secBsHandleTouchStart, { passive: true });
    header.addEventListener('touchmove', secBsHandleTouchMove, { passive: false });
    header.addEventListener('touchend', secBsHandleTouchEnd, { passive: true });
  }

  // Mouse events para testing en desktop
  handle.addEventListener('mousedown', secBsHandleMouseDown);
  document.addEventListener('mousemove', secBsHandleMouseMove);
  document.addEventListener('mouseup', secBsHandleMouseUp);

  // Click en "Ver Sector"
  const btnView = document.getElementById('secbs-btn-view');
  if (btnView) {
    btnView.addEventListener('click', () => {
      if (secBsCurrentSector) {
        const schoolId = mlCurrentSchool || 'valeria';
        const sectorName = secBsCurrentSector.name;
        hideSectorBottomSheet();
        openSectorImageViewer(schoolId, sectorName);
      }
    });
  }

  // Click en overlay cierra el sector bottom sheet
  overlay.addEventListener('click', () => {
    if (secBsCurrentState !== 'hidden') {
      hideSectorBottomSheet();
    }
  });

  console.log('Sector Bottom Sheet inicializado');
}

/**
 * Muestra el Sector Bottom Sheet con datos del sector
 */
function showSectorBottomSheet(props, coords) {
  if (!isMobileDevice()) return false;

  const sheet = document.getElementById('sector-bottom-sheet');
  const overlay = document.getElementById('bottom-sheet-overlay');
  if (!sheet || !overlay) return false;

  // Cerrar otros bottom sheets si están abiertos
  hideBottomSheet();
  hideRouteBottomSheet();
  // Cerrar popups de MapLibre
  if (mlSectorPopup) mlSectorPopup.remove();
  if (mlRoutePopup) mlRoutePopup.remove();

  const sectorName = props.nombre || 'Sector sin nombre';
  const restr = (props.restr || '').toUpperCase();
  const hasRestriction = restr === 'SI' || restr === 'SÍ';
  const fechaInicio = props.Fecha_inicio;
  const fechaFin = props.Fecha_fin;
  const exposicion = props.exposicion || '';
  const isRestricted = hasRestriction && isCurrentlyRestricted(fechaInicio, fechaFin);

  // Guardar estado actual del sector
  secBsCurrentSector = { name: sectorName, props: props, coords: coords };

  // --- Título ---
  const titleEl = document.getElementById('secbs-sector-name');
  if (titleEl) titleEl.textContent = sectorName.toUpperCase();

  // --- Fila de restricción ---
  const restrictionIconEl = document.getElementById('secbs-restriction-icon');
  if (restrictionIconEl) {
    restrictionIconEl.innerHTML = isRestricted
      ? '<img src="icons/prohibido.png" alt="Prohibido" width="36" height="36">'
      : '<img src="icons/permitido.png" alt="Permitido" width="36" height="36">';
  }

  const restrictionStatusEl = document.getElementById('secbs-restriction-status');
  if (restrictionStatusEl) {
    restrictionStatusEl.textContent = isRestricted ? 'Prohibido' : 'Permitido';
    restrictionStatusEl.style.color = isRestricted ? '#dc2626' : '#16a34a';
    restrictionStatusEl.style.fontWeight = '600';
  }

  const restrictionDatesEl = document.getElementById('secbs-restriction-dates');
  if (restrictionDatesEl) {
    restrictionDatesEl.textContent = hasRestriction
      ? `(Restricción: ${fechaInicio} - ${fechaFin})`
      : '';
  }

  // --- Fila de exposición ---
  const exposureIconEl = document.getElementById('secbs-exposure-icon');
  if (exposureIconEl) {
    exposureIconEl.innerHTML = getExposureIcon(exposicion);
  }

  const exposureTextEl = document.getElementById('secbs-exposure-text');
  if (exposureTextEl) {
    exposureTextEl.textContent = exposicion ? exposicion.replace(/_/g, ' ') : 'No especificada';
    exposureTextEl.style.color = '#f59e0b';
    exposureTextEl.style.fontWeight = '500';
  }

  // --- Reset contenedores async ---
  const estadoContainer = document.getElementById('secbs-estado-container');
  if (estadoContainer) estadoContainer.innerHTML = '';

  const chartContainer = document.getElementById('secbs-grade-chart');
  if (chartContainer) {
    chartContainer.innerHTML = '<div style="text-align: center; color: #888;">Cargando...</div>';
  }

  // --- Mostrar sheet ---
  sheet.classList.remove('hidden');
  overlay.classList.remove('hidden');

  requestAnimationFrame(() => {
    sheet.classList.add('snap-expanded');
    overlay.classList.add('visible');
  });

  secBsCurrentState = 'expanded';

  // --- Cargar datos async ---
  // Gráfico de grados
  setTimeout(() => {
    const gradeCounts = countRoutesByGradeForSector(sectorName);
    renderGradeChart('secbs-grade-chart', gradeCounts);
  }, 150);

  // Estado del sector
  const schoolId = mlCurrentSchool || 'valeria';
  getSectorEstadoAverage(schoolId, sectorName).then(result => {
    const container = document.getElementById('secbs-estado-container');
    if (!container) return;
    if (result.avg !== null) {
      container.innerHTML = generateSectorEstadoHTML(result.avg, result.ratedCount, result.totalCount);
    }
  });

  return true;
}

/**
 * Oculta el Sector Bottom Sheet
 */
function hideSectorBottomSheet() {
  const sheet = document.getElementById('sector-bottom-sheet');
  const overlay = document.getElementById('bottom-sheet-overlay');
  if (!sheet || !overlay) return;
  if (secBsCurrentState === 'hidden') return;

  sheet.classList.remove('snap-expanded');
  overlay.classList.remove('visible');

  setTimeout(() => {
    sheet.classList.add('hidden');
    overlay.classList.add('hidden');
  }, 400);

  // Resetear padding del mapa al cerrar el bottom sheet
  if (mlMap) {
    mlMap.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 300 });
  }

  secBsCurrentState = 'hidden';
  secBsCurrentSector = null;
}

// ============================================
// SECTOR BOTTOM SHEET - GESTOS TÁCTILES
// ============================================

function secBsHandleTouchStart(e) {
  secBsIsDragging = true;
  secBsDragStartY = e.touches[0].clientY;
  secBsCurrentY = secBsDragStartY;
  const sheet = document.getElementById('sector-bottom-sheet');
  if (sheet) sheet.style.transition = 'none';
}

function secBsHandleTouchMove(e) {
  if (!secBsIsDragging) return;
  e.preventDefault();
  secBsCurrentY = e.touches[0].clientY;
  const deltaY = secBsCurrentY - secBsDragStartY;
  const sheet = document.getElementById('sector-bottom-sheet');
  if (!sheet) return;
  const windowHeight = window.innerHeight;
  const currentPercent = 100 - (BS_EXPANDED_PERCENT * 100);
  const deltaPercent = (deltaY / windowHeight) * 100;
  const newPercent = Math.max(10, Math.min(100, currentPercent + deltaPercent));
  sheet.style.transform = `translateY(${newPercent}%)`;
}

function secBsHandleTouchEnd() {
  if (!secBsIsDragging) return;
  secBsIsDragging = false;
  const sheet = document.getElementById('sector-bottom-sheet');
  if (!sheet) return;
  sheet.style.transition = '';
  sheet.style.transform = '';
  const deltaY = secBsCurrentY - secBsDragStartY;
  if (deltaY > 40) {
    hideSectorBottomSheet();
  }
}

function secBsHandleMouseDown(e) {
  secBsIsDragging = true;
  secBsDragStartY = e.clientY;
  secBsCurrentY = secBsDragStartY;
  const sheet = document.getElementById('sector-bottom-sheet');
  if (sheet) sheet.style.transition = 'none';
  e.preventDefault();
}

function secBsHandleMouseMove(e) {
  if (!secBsIsDragging) return;
  secBsCurrentY = e.clientY;
  const deltaY = secBsCurrentY - secBsDragStartY;
  const sheet = document.getElementById('sector-bottom-sheet');
  if (!sheet) return;
  const windowHeight = window.innerHeight;
  const currentPercent = 100 - (BS_EXPANDED_PERCENT * 100);
  const deltaPercent = (deltaY / windowHeight) * 100;
  const newPercent = Math.max(10, Math.min(100, currentPercent + deltaPercent));
  sheet.style.transform = `translateY(${newPercent}%)`;
}

function secBsHandleMouseUp() {
  if (!secBsIsDragging) return;
  secBsIsDragging = false;
  const sheet = document.getElementById('sector-bottom-sheet');
  if (!sheet) return;
  sheet.style.transition = '';
  sheet.style.transform = '';
  const deltaY = secBsCurrentY - secBsDragStartY;
  if (deltaY > 40) {
    hideSectorBottomSheet();
  }
}

// ============================================
// ROUTE BOTTOM SHEET (Vías - solo móvil)
// ============================================

/**
 * Inicializa el Route Bottom Sheet
 */
function initRouteBottomSheet() {
  const sheet = document.getElementById('route-bottom-sheet');
  const overlay = document.getElementById('bottom-sheet-overlay');
  const handle = sheet?.querySelector('.bottom-sheet-handle');

  if (!sheet || !overlay || !handle) {
    console.warn('Route Bottom Sheet elementos no encontrados');
    return;
  }

  // Touch listeners en el handle
  handle.addEventListener('touchstart', rbsHandleTouchStart, { passive: true });
  handle.addEventListener('touchmove', rbsHandleTouchMove, { passive: false });
  handle.addEventListener('touchend', rbsHandleTouchEnd, { passive: true });

  // Touch listeners en el header (también arrastrable)
  const header = sheet.querySelector('.rbs-header');
  if (header) {
    header.addEventListener('touchstart', rbsHandleTouchStart, { passive: true });
    header.addEventListener('touchmove', rbsHandleTouchMove, { passive: false });
    header.addEventListener('touchend', rbsHandleTouchEnd, { passive: true });
  }

  // Mouse events para testing en desktop
  handle.addEventListener('mousedown', rbsHandleMouseDown);
  document.addEventListener('mousemove', rbsHandleMouseMove);
  document.addEventListener('mouseup', rbsHandleMouseUp);

  // Click en overlay cierra el route bottom sheet
  overlay.addEventListener('click', () => {
    if (rbsCurrentState !== 'hidden') {
      hideRouteBottomSheet();
    }
  });

  console.log('Route Bottom Sheet inicializado');
}

/**
 * Muestra el Route Bottom Sheet con datos de la vía (solo móvil)
 */
async function showRouteBottomSheet(props, coords) {
  if (!isMobileDevice()) return false;

  const sheet = document.getElementById('route-bottom-sheet');
  const overlay = document.getElementById('bottom-sheet-overlay');
  if (!sheet || !overlay) return false;

  // Cerrar otros bottom sheets y popups
  hideBottomSheet();
  hideSectorBottomSheet();
  if (mlRoutePopup) mlRoutePopup.remove();

  const grade = props.grado1 || '?';
  const gradeColor = getGradeColor(grade);
  const routeId = Number(props.id);
  const routeName = props.nombre || 'Sin nombre';
  const sectorName = props.sector || '';
  const encodedSector = encodeURIComponent(sectorName);
  const schoolId = mlCurrentSchool || 'valeria';

  // Guardar datos de la vía actual para las funciones de los botones
  mlCurrentRouteGrade = grade;
  mlCurrentRouteSector = sectorName;
  mlCurrentRouteId = routeId;
  mlCurrentRouteName = routeName;

  // --- Header ---
  const nameEl = document.getElementById('rbs-route-name');
  if (nameEl) nameEl.textContent = routeName;

  const gradeEl = document.getElementById('rbs-route-grade');
  if (gradeEl) {
    gradeEl.textContent = grade;
    gradeEl.style.backgroundColor = gradeColor;
  }

  // Check de ascenso + icono de estilo
  const hasAscent = (typeof hasUserAscent === 'function') && hasUserAscent(schoolId, routeId);
  const checkEl = document.getElementById('rbs-ascent-check');
  if (checkEl) {
    checkEl.classList.toggle('hidden', !hasAscent);
  }
  const styleEl = document.getElementById('rbs-ascent-style');
  if (styleEl) {
    if (hasAscent && typeof getUserAscentInfo === 'function' && typeof getAscentStyleSVG === 'function') {
      const ascentInfo = getUserAscentInfo(schoolId, routeId);
      if (ascentInfo && ascentInfo.style) {
        styleEl.innerHTML = getAscentStyleSVG(ascentInfo.style);
        styleEl.className = 'rbs-ascent-style ascent-style-' + ascentInfo.style;
        styleEl.classList.remove('hidden');
      } else {
        styleEl.classList.add('hidden');
      }
    } else {
      styleEl.classList.add('hidden');
    }
  }

  // --- Info items ---
  const infoContainer = document.getElementById('rbs-info-items');
  if (infoContainer) {
    // Normalizar descripcio → descripcion
    if (!props.descripcion && props.descripcio) {
      props.descripcion = props.descripcio;
    }

    const iconClimber = `<img src="icons/placa.png" alt="Tipo" width="32" height="32">`;
    const iconExpress = `<img src="icons/mosq.png" alt="Expresos" width="32" height="32">`;
    const iconRope = `<img src="icons/cuerda.png" alt="Cuerda" width="32" height="32">`;

    const hasDescripcion = props.descripcion && props.descripcion.trim();
    const hasExp = props.exp1;
    const hasLong = props.long1;

    let infoHTML = '';

    if (hasDescripcion) {
      infoHTML += `<div class="ml-route-item"><span class="ml-route-icon">${iconClimber}</span><span class="ml-route-text">${props.descripcion}</span></div>`;
    } else {
      infoHTML += `<div class="ml-route-item ml-route-item-missing" onclick="mlContributeField(${routeId}, '${schoolId}', 'tipo')"><span class="ml-route-icon">${iconClimber}</span><span class="ml-route-text ml-route-contribute">&iquest;Qu&eacute; tipo de escalada es?</span></div>`;
    }

    if (hasExp) {
      infoHTML += `<div class="ml-route-item"><span class="ml-route-icon">${iconExpress}</span><span class="ml-route-text">${props.exp1} express</span></div>`;
    } else {
      infoHTML += `<div class="ml-route-item ml-route-item-missing" onclick="mlContributeField(${routeId}, '${schoolId}', 'express')"><span class="ml-route-icon">${iconExpress}</span><span class="ml-route-text ml-route-contribute">&iquest;Cu&aacute;ntos express tiene?</span></div>`;
    }

    if (hasLong) {
      infoHTML += `<div class="ml-route-item"><span class="ml-route-icon">${iconRope}</span><span class="ml-route-text">${props.long1} mts</span></div>`;
    } else {
      infoHTML += `<div class="ml-route-item ml-route-item-missing" onclick="mlContributeField(${routeId}, '${schoolId}', 'metros')"><span class="ml-route-icon">${iconRope}</span><span class="ml-route-text ml-route-contribute">&iquest;Cu&aacute;ntos metros mide?</span></div>`;
    }

    infoContainer.innerHTML = infoHTML;
  }

  // --- Aleje ---
  const alejeContainer = document.getElementById('rbs-aleje-container');
  if (alejeContainer) {
    alejeContainer.innerHTML = '<div style="text-align:center;color:#888;font-size:13px;">Cargando...</div>';
    getAlejeVotes(schoolId, routeId).then(alejeData => {
      alejeContainer.innerHTML = generateAlejeBarHTML(routeId, schoolId, alejeData.avg, alejeData.userVote);
    }).catch(() => { alejeContainer.innerHTML = ''; });
  }

  // --- Estado ---
  const estadoContainer = document.getElementById('rbs-estado-container');
  if (estadoContainer) {
    estadoContainer.innerHTML = '<div style="text-align:center;color:#888;font-size:13px;">Cargando...</div>';
    getEstadoVotes(schoolId, routeId).then(estadoData => {
      estadoContainer.innerHTML = generateEstadoStarsHTML(routeId, schoolId, estadoData.avg, estadoData.userVote);
    }).catch(() => { estadoContainer.innerHTML = ''; });
  }

  // --- Botonera ---
  const actionsContainer = document.getElementById('rbs-actions');
  if (actionsContainer) {
    const iconCheck = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const iconBookmark = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
    const iconComment = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
    const iconShare = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

    // Obtener número de comentarios
    let commentBadge = '';
    try {
      if (typeof db !== 'undefined' && typeof normalizeId === 'function') {
        const commentRouteId = `${schoolId}_${normalizeId(routeName)}`;
        const commentsSnap = await db.collection('comments').where('routeId', '==', commentRouteId).get();
        if (commentsSnap.size > 0) {
          commentBadge = `<span class="ml-comment-count">${commentsSnap.size}</span>`;
        }
      }
    } catch (e) {
      console.warn('Error fetching comment count:', e);
    }

    actionsContainer.innerHTML = `
      <button class="ml-route-action-btn" onclick="mlRegisterAscent(${routeId}, '${encodeURIComponent(routeName)}')" title="Registrar ascenso">${iconCheck}</button>
      <button class="ml-route-action-btn" onclick="mlToggleBookmark(${routeId}, '${encodeURIComponent(routeName)}')" title="Guardar">${iconBookmark}</button>
      <button class="ml-route-action-btn ml-comment-btn" onclick="mlOpenComments(${routeId}, '${encodeURIComponent(routeName)}')" title="Comentarios">${iconComment}${commentBadge}</button>
      <button class="ml-route-action-btn" onclick="mlShareRoute(${routeId}, '${encodeURIComponent(routeName)}')" title="Compartir">${iconShare}</button>
    `;
  }

  // --- Botón Ver vía ---
  const viewSection = document.getElementById('rbs-view-section');
  const btnView = document.getElementById('rbs-btn-view');
  if (viewSection && btnView) {
    let hasDrawing = false;
    if (sectorName && typeof hasRouteDrawing === 'function') {
      hasDrawing = await hasRouteDrawing(schoolId, sectorName, routeId);
    }
    if (hasDrawing) {
      viewSection.classList.remove('hidden');
      btnView.onclick = () => {
        hideRouteBottomSheet();
        mlViewRouteInSector(schoolId, encodedSector, routeId);
      };
    } else {
      viewSection.classList.add('hidden');
    }
  }

  // --- Botón Dev (admin) ---
  const devSection = document.getElementById('rbs-dev-section');
  const btnDev = document.getElementById('rbs-btn-dev');
  if (devSection && btnDev) {
    const isAdmin = await isRoutePopupAdmin();
    if (isAdmin) {
      devSection.classList.remove('hidden');
      btnDev.onclick = () => {
        hideRouteBottomSheet();
        mlOpenDrawingEditor(routeId);
      };
    } else {
      devSection.classList.add('hidden');
    }
  }

  // --- Mostrar sheet ---
  sheet.classList.remove('hidden');
  overlay.classList.remove('hidden');

  requestAnimationFrame(() => {
    sheet.classList.add('snap-expanded');
    overlay.classList.add('visible');
  });

  rbsCurrentState = 'expanded';
  return true;
}

/**
 * Oculta el Route Bottom Sheet
 */
function hideRouteBottomSheet() {
  const sheet = document.getElementById('route-bottom-sheet');
  const overlay = document.getElementById('bottom-sheet-overlay');
  if (!sheet || !overlay) return;
  if (rbsCurrentState === 'hidden') return;

  sheet.classList.remove('snap-expanded');
  overlay.classList.remove('visible');

  setTimeout(() => {
    sheet.classList.add('hidden');
    overlay.classList.add('hidden');
  }, 400);

  // Resetear padding del mapa al cerrar el bottom sheet
  if (mlMap) {
    mlMap.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 300 });
  }

  rbsCurrentState = 'hidden';
}

// ============================================
// ROUTE BOTTOM SHEET - GESTOS TÁCTILES
// ============================================

function rbsHandleTouchStart(e) {
  rbsIsDragging = true;
  rbsDragStartY = e.touches[0].clientY;
  rbsCurrentY = rbsDragStartY;
  const sheet = document.getElementById('route-bottom-sheet');
  if (sheet) sheet.style.transition = 'none';
}

function rbsHandleTouchMove(e) {
  if (!rbsIsDragging) return;
  e.preventDefault();
  rbsCurrentY = e.touches[0].clientY;
  const deltaY = rbsCurrentY - rbsDragStartY;
  const sheet = document.getElementById('route-bottom-sheet');
  if (!sheet) return;
  const windowHeight = window.innerHeight;
  const currentPercent = 100 - (BS_EXPANDED_PERCENT * 100);
  const deltaPercent = (deltaY / windowHeight) * 100;
  const newPercent = Math.max(10, Math.min(100, currentPercent + deltaPercent));
  sheet.style.transform = `translateY(${newPercent}%)`;
}

function rbsHandleTouchEnd() {
  if (!rbsIsDragging) return;
  rbsIsDragging = false;
  const sheet = document.getElementById('route-bottom-sheet');
  if (!sheet) return;
  sheet.style.transition = '';
  sheet.style.transform = '';
  const deltaY = rbsCurrentY - rbsDragStartY;
  if (deltaY > 40) {
    hideRouteBottomSheet();
  }
}

function rbsHandleMouseDown(e) {
  rbsIsDragging = true;
  rbsDragStartY = e.clientY;
  rbsCurrentY = rbsDragStartY;
  const sheet = document.getElementById('route-bottom-sheet');
  if (sheet) sheet.style.transition = 'none';
  e.preventDefault();
}

function rbsHandleMouseMove(e) {
  if (!rbsIsDragging) return;
  rbsCurrentY = e.clientY;
  const deltaY = rbsCurrentY - rbsDragStartY;
  const sheet = document.getElementById('route-bottom-sheet');
  if (!sheet) return;
  const windowHeight = window.innerHeight;
  const currentPercent = 100 - (BS_EXPANDED_PERCENT * 100);
  const deltaPercent = (deltaY / windowHeight) * 100;
  const newPercent = Math.max(10, Math.min(100, currentPercent + deltaPercent));
  sheet.style.transform = `translateY(${newPercent}%)`;
}

function rbsHandleMouseUp() {
  if (!rbsIsDragging) return;
  rbsIsDragging = false;
  const sheet = document.getElementById('route-bottom-sheet');
  if (!sheet) return;
  sheet.style.transition = '';
  sheet.style.transform = '';
  const deltaY = rbsCurrentY - rbsDragStartY;
  if (deltaY > 40) {
    hideRouteBottomSheet();
  }
}

/**
 * Muestra el Bottom Sheet con datos de la escuela
 */
function showBottomSheet(school) {
  console.log('showBottomSheet llamado con:', school);

  if (!isMobileDevice()) {
    return false;
  }

  // Cerrar otros bottom sheets si están abiertos
  hideSectorBottomSheet();
  hideRouteBottomSheet();

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

  // Resetear padding del mapa al cerrar el bottom sheet
  if (mlMap) {
    mlMap.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 300 });
  }

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

      // Desplazamiento adaptativo: solo mover si la escuela queda tapada por el bottom sheet
      adaptiveMapPanForBottomSheet(school.coords);

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

// Inicializar Bottom Sheets cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initBottomSheet();
    initSectorBottomSheet();
    initRouteBottomSheet();
  });
} else {
  initBottomSheet();
  initSectorBottomSheet();
  initRouteBottomSheet();
}

// Exponer funciones del Bottom Sheet
window.showBottomSheet = showBottomSheet;
window.hideBottomSheet = hideBottomSheet;
window.expandBottomSheet = expandBottomSheet;
window.collapseBottomSheet = collapseBottomSheet;

// Exponer funciones del Sector Bottom Sheet
window.showSectorBottomSheet = showSectorBottomSheet;
window.hideSectorBottomSheet = hideSectorBottomSheet;

// Exponer funciones del Route Bottom Sheet
window.showRouteBottomSheet = showRouteBottomSheet;
window.hideRouteBottomSheet = hideRouteBottomSheet;

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
    return adminDoc.exists && (adminDoc.data().role === 'admin' || adminDoc.data().role === 'spotter');
  } catch (error) {
    console.error('[RoutePopup] Error verificando admin:', error);
    return false;
  }
}

/**
 * Abre el editor de dibujo desde el popup de vía
 */
function mlOpenDrawingEditor(routeId) {
  // Cerrar popup
  if (mlRoutePopup) mlRoutePopup.remove();

  // Llamar a función de route-drawing.js
  if (typeof openDrawingEditorForRoute === 'function') {
    openDrawingEditorForRoute(routeId);
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
  const routeId = Number(props.id);
  const routeName = props.nombre || 'Sin nombre';
  const sectorName = props.sector || '';
  const encodedSector = encodeURIComponent(sectorName);
  const schoolId = mlCurrentSchool || 'valeria';

  // Verificar si la vía tiene dibujo en la imagen del sector (para mostrar botón "Ver vía")
  let hasDrawing = false;
  if (sectorName && typeof hasRouteDrawing === 'function') {
    hasDrawing = await hasRouteDrawing(schoolId, sectorName, routeId);
  }

  // Verificar si el usuario ha completado esta vía
  const hasAscent = (typeof hasUserAscent === 'function') && hasUserAscent(schoolId, routeId);
  const ascentInfo = hasAscent && (typeof getUserAscentInfo === 'function') ? getUserAscentInfo(schoolId, routeId) : null;

  // Guardar datos de la vía actual para las funciones de los botones
  mlCurrentRouteGrade = grade;
  mlCurrentRouteSector = sectorName;
  mlCurrentRouteId = routeId;
  mlCurrentRouteName = routeName;

  // Obtener número de comentarios
  let commentCount = 0;
  try {
    if (typeof db !== 'undefined' && typeof normalizeId === 'function') {
      const commentRouteId = `${schoolId}_${normalizeId(routeName)}`;
      const commentsSnap = await db.collection('comments').where('routeId', '==', commentRouteId).get();
      commentCount = commentsSnap.size;
    }
  } catch (e) {
    console.warn('Error fetching comment count:', e);
  }
  const commentBadge = commentCount > 0 ? `<span class="ml-comment-count">${commentCount}</span>` : '';

  // Iconos PNG para info (tamaño 32x32)
  const iconClimber = `<img src="icons/placa.png" alt="Tipo" width="32" height="32">`;
  const iconExpress = `<img src="icons/mosq.png" alt="Expresos" width="32" height="32">`;
  const iconRope = `<img src="icons/cuerda.png" alt="Cuerda" width="32" height="32">`;

  // Iconos SVG de la botonera (tamaño 32x32)
  const iconCheck = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const iconBookmark = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
  const iconComment = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
  const iconShare = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

  // Check de ascenso + icono de estilo para el header
  const ascentStyleSVG = ascentInfo && ascentInfo.style && (typeof getAscentStyleSVG === 'function') ? getAscentStyleSVG(ascentInfo.style) : '';
  const ascentCheckHTML = hasAscent ? `
    <span class="ml-route-ascent-check">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </span>
    ${ascentStyleSVG ? `<span class="ml-route-ascent-style ascent-style-${ascentInfo.style}">${ascentStyleSVG}</span>` : ''}
  ` : '';

  // Detectar campos vacíos para sugerir contribuir
  const hasDescripcion = props.descripcion && props.descripcion.trim();
  const hasExp = props.exp1;
  const hasLong = props.long1;

  // Obtener votaciones de aleje desde Firestore
  const alejeData = await getAlejeVotes(schoolId, routeId);
  const alejeHTML = generateAlejeBarHTML(routeId, schoolId, alejeData.avg, alejeData.userVote);

  // Obtener votaciones de estado de la vía desde Firestore
  const estadoData = await getEstadoVotes(schoolId, routeId);
  const estadoHTML = generateEstadoStarsHTML(routeId, schoolId, estadoData.avg, estadoData.userVote);

  const html = `
    <div class="ml-route-popup-new">
      <!-- Header: Check + Nombre + Grado + Badge Usuario -->
      <div class="ml-route-header">
        ${ascentCheckHTML}
        <span class="ml-route-name">${routeName}</span>
        <span class="ml-route-grade" style="background-color: ${gradeColor}">${grade}</span>
      </div>

      <!-- Info items con iconos + sugerencias independientes por campo -->
      <div class="ml-route-info">
        ${hasDescripcion ? `
          <div class="ml-route-item">
            <span class="ml-route-icon">${iconClimber}</span>
            <span class="ml-route-text">${props.descripcion}</span>
          </div>
        ` : `
          <div class="ml-route-item ml-route-item-missing" onclick="mlContributeField(${routeId}, '${schoolId}', 'tipo')">
            <span class="ml-route-icon">${iconClimber}</span>
            <span class="ml-route-text ml-route-contribute">&iquest;Qu&eacute; tipo de escalada es?</span>
          </div>
        `}

        ${hasExp ? `
          <div class="ml-route-item">
            <span class="ml-route-icon">${iconExpress}</span>
            <span class="ml-route-text">${props.exp1} express</span>
          </div>
        ` : `
          <div class="ml-route-item ml-route-item-missing" onclick="mlContributeField(${routeId}, '${schoolId}', 'express')">
            <span class="ml-route-icon">${iconExpress}</span>
            <span class="ml-route-text ml-route-contribute">&iquest;Cu&aacute;ntos express tiene?</span>
          </div>
        `}

        ${hasLong ? `
          <div class="ml-route-item">
            <span class="ml-route-icon">${iconRope}</span>
            <span class="ml-route-text">${props.long1} mts</span>
          </div>
        ` : `
          <div class="ml-route-item ml-route-item-missing" onclick="mlContributeField(${routeId}, '${schoolId}', 'metros')">
            <span class="ml-route-icon">${iconRope}</span>
            <span class="ml-route-text ml-route-contribute">&iquest;Cu&aacute;ntos metros mide?</span>
          </div>
        `}
      </div>

      <!-- Indicador de Aleje -->
      ${alejeHTML}

      <!-- Estado de la Vía (estrellas) -->
      ${estadoHTML}

      <!-- Botonera -->
      <div class="ml-route-actions">
        <button class="ml-route-action-btn" onclick="mlRegisterAscent(${routeId}, '${encodeURIComponent(routeName)}')" title="Registrar ascenso">
          ${iconCheck}
        </button>
        <button class="ml-route-action-btn" onclick="mlToggleBookmark(${routeId}, '${encodeURIComponent(routeName)}')" title="Guardar">
          ${iconBookmark}
        </button>
        <button class="ml-route-action-btn ml-comment-btn" onclick="mlOpenComments(${routeId}, '${encodeURIComponent(routeName)}')" title="Comentarios">
          ${iconComment}
          ${commentBadge}
        </button>
        <button class="ml-route-action-btn" onclick="mlShareRoute(${routeId}, '${encodeURIComponent(routeName)}')" title="Compartir">
          ${iconShare}
        </button>
      </div>

      <!-- Botón Ver vía (solo si tiene dibujo en la imagen) -->
      ${hasDrawing ? `
        <div class="ml-route-view-section">
          <button class="ml-route-view-btn" onclick="mlViewRouteInSector('${schoolId}', '${encodedSector}', ${routeId})">
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

// ============================================
// FILTRO DE GRADOS (RANGE SLIDER) Y LEYENDA
// ============================================

// Lista ordenada de todos los grados (de menor a mayor dificultad)
const ALL_GRADES_ORDERED = [
  '3a','3b','3c',
  '4a','4b','4c',
  '5a','5a+','5b','5b+','5c','5c+',
  '6a','6a+','6b','6b+',
  '6c','6c+',
  '7a','7a+','7b','7b+','7c','7c+',
  '8a','8a+','8b','8b+','8c','8c+',
  '9a','9a+','9b','9b+','9c','9c+'
];

// Inicializar rango completo
mlGradeRangeMax = ALL_GRADES_ORDERED.length - 1;

/**
 * Comprueba si el rango actual cubre todos los grados (sin filtro activo)
 */
function isFullGradeRange() {
  return mlGradeRangeMin === 0 && mlGradeRangeMax === ALL_GRADES_ORDERED.length - 1;
}

/**
 * Añade el botón de filtro/leyenda en la esquina superior derecha del mapa
 */
function addGradeFilterButton() {
  if (document.getElementById('btn-grade-filter')) return;

  const container = document.getElementById('map');
  if (!container) return;

  // Botón principal
  const btn = document.createElement('button');
  btn.id = 'btn-grade-filter';
  btn.className = 'map-control-btn';
  btn.title = 'Filtrar por grado';
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>`;
  btn.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    width: 40px;
    height: 40px;
    background: white;
    border: none;
    border-radius: 10px;
    color: #333;
    cursor: pointer;
    z-index: 1000;
    display: none;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    transition: background 0.2s ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  `;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleGradeFilterPanel();
  });

  container.appendChild(btn);

  // Panel desplegable
  const panel = document.createElement('div');
  panel.id = 'grade-filter-panel';
  panel.className = 'grade-filter-panel';
  panel.innerHTML = buildGradeFilterPanelHTML();
  container.appendChild(panel);

  // Inicializar sliders después de insertar en el DOM
  initRangeSliders();

  // Mostrar/ocultar sincronizado con resetViewBtn (mismo umbral de zoom)
  const updateFilterVisibility = () => {
    if (!mlMap) return;
    const ccaa = getCurrentCCAA();
    const visible = mlMap.getZoom() > ccaa.zoom + 1;
    btn.style.display = visible ? 'flex' : 'none';
    if (!visible) closeGradeFilterPanel();
  };
  mlMap.on('zoom', updateFilterVisibility);
  updateFilterVisibility();

  // Cerrar panel al hacer clic fuera
  document.addEventListener('click', (e) => {
    const panelEl = document.getElementById('grade-filter-panel');
    const btnEl = document.getElementById('btn-grade-filter');
    if (panelEl && btnEl && !panelEl.contains(e.target) && !btnEl.contains(e.target)) {
      closeGradeFilterPanel();
    }
  });
}

/**
 * Genera el HTML del panel de filtro por grado (range slider)
 */
function buildGradeFilterPanelHTML() {
  const maxIdx = ALL_GRADES_ORDERED.length - 1;

  return `
    <div class="gfp-header">
      <span class="gfp-title">Filtrar por grado</span>
      <button class="gfp-reset-btn" onclick="resetGradeFilter()" title="Mostrar todos">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        Todos
      </button>
    </div>

    <div class="gfp-range-labels">
      <span class="gfp-range-label" id="gfp-label-min">${ALL_GRADES_ORDERED[0]}</span>
      <span class="gfp-range-separator">—</span>
      <span class="gfp-range-label" id="gfp-label-max">${ALL_GRADES_ORDERED[maxIdx]}</span>
    </div>

    <div class="gfp-range-container" id="gfp-range-container">
      <div class="gfp-range-track" id="gfp-range-track"></div>
      <div class="gfp-range-selected" id="gfp-range-selected"></div>
      <div class="gfp-range-thumb gfp-thumb-min" id="gfp-thumb-min" role="slider" aria-label="Grado mínimo" tabindex="0"></div>
      <div class="gfp-range-thumb gfp-thumb-max" id="gfp-thumb-max" role="slider" aria-label="Grado máximo" tabindex="0"></div>
    </div>

    <div class="gfp-range-ticks" id="gfp-range-ticks"></div>

    <div class="gfp-divider"></div>

    <label class="gfp-myvias-row" id="gfp-myvias-label">
      <input type="checkbox" id="gfp-myvias-checkbox" onchange="toggleShowOnlyMyRoutes(this.checked)">
      <span class="gfp-myvias-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      </span>
      <span class="gfp-myvias-text">Solo vías hechas</span>
    </label>

    <div class="gfp-divider"></div>
    <button class="gfp-legend-btn" onclick="openGradeLegendModal()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      Leyenda de colores
    </button>
  `;
}

/**
 * Inicializa los event listeners para los thumbs del range slider
 */
function initRangeSliders() {
  const container = document.getElementById('gfp-range-container');
  const thumbMin = document.getElementById('gfp-thumb-min');
  const thumbMax = document.getElementById('gfp-thumb-max');
  if (!container || !thumbMin || !thumbMax) return;

  // Generar ticks de referencia
  buildRangeTicks();

  // Posicionar thumbs según estado actual
  updateSliderPositions();

  // --- Drag para thumb min ---
  setupThumbDrag(thumbMin, 'min');
  setupThumbDrag(thumbMax, 'max');
}

/**
 * Genera las marcas de referencia debajo del slider
 */
function buildRangeTicks() {
  const ticksEl = document.getElementById('gfp-range-ticks');
  if (!ticksEl) return;

  // Mostrar solo grados principales (sin +) para no saturar
  const tickGrades = ['3a','4a','5a','5c','6a','6b','6c','7a','7b','7c','8a','8c','9a'];
  const maxIdx = ALL_GRADES_ORDERED.length - 1;

  let html = '';
  tickGrades.forEach(grade => {
    const idx = ALL_GRADES_ORDERED.indexOf(grade);
    if (idx === -1) return;
    const pct = (idx / maxIdx) * 100;
    html += `<span class="gfp-tick" style="left:${pct}%">${grade}</span>`;
  });

  ticksEl.innerHTML = html;
}

/**
 * Configura el drag (mouse + touch) para un thumb
 */
function setupThumbDrag(thumbEl, which) {
  let dragging = false;

  const onStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    thumbEl.classList.add('active');
    document.body.style.userSelect = 'none';
  };

  const onMove = (e) => {
    if (!dragging) return;
    e.preventDefault();
    const container = document.getElementById('gfp-range-container');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let pct = (clientX - rect.left) / rect.width;
    pct = Math.max(0, Math.min(1, pct));

    const maxIdx = ALL_GRADES_ORDERED.length - 1;
    let idx = Math.round(pct * maxIdx);

    if (which === 'min') {
      idx = Math.min(idx, mlGradeRangeMax);
      mlGradeRangeMin = idx;
    } else {
      idx = Math.max(idx, mlGradeRangeMin);
      mlGradeRangeMax = idx;
    }

    updateSliderPositions();
    updateRangeLabels();
    applyGradeFilter();
    updateFilterButtonBadge();
  };

  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    thumbEl.classList.remove('active');
    document.body.style.userSelect = '';
  };

  // Mouse events
  thumbEl.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);

  // Touch events
  thumbEl.addEventListener('touchstart', onStart, { passive: false });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
}

/**
 * Actualiza las posiciones visuales de los thumbs y la barra seleccionada
 */
function updateSliderPositions() {
  const thumbMin = document.getElementById('gfp-thumb-min');
  const thumbMax = document.getElementById('gfp-thumb-max');
  const selected = document.getElementById('gfp-range-selected');
  if (!thumbMin || !thumbMax || !selected) return;

  const maxIdx = ALL_GRADES_ORDERED.length - 1;
  const pctMin = (mlGradeRangeMin / maxIdx) * 100;
  const pctMax = (mlGradeRangeMax / maxIdx) * 100;

  thumbMin.style.left = pctMin + '%';
  thumbMax.style.left = pctMax + '%';
  selected.style.left = pctMin + '%';
  selected.style.width = (pctMax - pctMin) + '%';

  // Gradiente de color en la barra seleccionada
  const colorMin = MAPLIBRE_GRADE_COLORS[ALL_GRADES_ORDERED[mlGradeRangeMin]] || '#888';
  const colorMax = MAPLIBRE_GRADE_COLORS[ALL_GRADES_ORDERED[mlGradeRangeMax]] || '#888';
  selected.style.background = `linear-gradient(to right, ${colorMin}, ${colorMax})`;
}

/**
 * Actualiza las etiquetas min/max
 */
function updateRangeLabels() {
  const labelMin = document.getElementById('gfp-label-min');
  const labelMax = document.getElementById('gfp-label-max');
  if (!labelMin || !labelMax) return;

  const gradeMin = ALL_GRADES_ORDERED[mlGradeRangeMin];
  const gradeMax = ALL_GRADES_ORDERED[mlGradeRangeMax];

  labelMin.textContent = gradeMin;
  labelMax.textContent = gradeMax;

  // Color de las etiquetas según el grado
  labelMin.style.background = MAPLIBRE_GRADE_COLORS[gradeMin] || '#888';
  labelMax.style.background = MAPLIBRE_GRADE_COLORS[gradeMax] || '#888';

  // Texto claro u oscuro según luminosidad del fondo
  labelMin.style.color = isLightColor(MAPLIBRE_GRADE_COLORS[gradeMin]) ? '#1f2937' : '#fff';
  labelMax.style.color = isLightColor(MAPLIBRE_GRADE_COLORS[gradeMax]) ? '#1f2937' : '#fff';
}

/**
 * Determina si un color hex es claro (para decidir texto oscuro o blanco)
 */
function isLightColor(hex) {
  if (!hex) return true;
  hex = hex.replace('#', '').substring(0, 6);
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Luminancia relativa
  return (r * 0.299 + g * 0.587 + b * 0.114) > 160;
}

/**
 * Abre/cierra el panel de filtro
 */
function toggleGradeFilterPanel() {
  const panel = document.getElementById('grade-filter-panel');
  const btn = document.getElementById('btn-grade-filter');
  if (!panel) return;

  mlFilterPanelOpen = !mlFilterPanelOpen;

  if (mlFilterPanelOpen) {
    panel.classList.add('open');
    btn.classList.add('active');
    // Asegurar posiciones correctas al abrir
    updateSliderPositions();
    updateRangeLabels();
  } else {
    panel.classList.remove('open');
    btn.classList.remove('active');
  }
}

function closeGradeFilterPanel() {
  const panel = document.getElementById('grade-filter-panel');
  const btn = document.getElementById('btn-grade-filter');
  if (!panel) return;

  mlFilterPanelOpen = false;
  panel.classList.remove('open');
  if (btn) btn.classList.remove('active');
}

/**
 * Reset: mostrar todos los grados (rango completo)
 */
function resetGradeFilter() {
  mlGradeRangeMin = 0;
  mlGradeRangeMax = ALL_GRADES_ORDERED.length - 1;
  mlShowOnlyMyRoutes = false;

  const cb = document.getElementById('gfp-myvias-checkbox');
  if (cb) cb.checked = false;

  updateSliderPositions();
  updateRangeLabels();
  applyGradeFilter();
  updateFilterButtonBadge();
}

/**
 * Activa/desactiva el filtro "solo mis vías"
 */
function toggleShowOnlyMyRoutes(checked) {
  mlShowOnlyMyRoutes = checked;
  applyGradeFilter();
  updateFilterButtonBadge();
}

/**
 * Aplica el filtro de grados (y opcionalmente "solo mis vías") a la capa vias-layer
 */
function applyGradeFilter() {
  if (!mlMap) return;
  if (!mlMap.getLayer('vias-layer')) return;

  const gradeActive = !isFullGradeRange();

  // Construir filtro de grados
  let gradeExpr = null;
  if (gradeActive) {
    const selectedGrades = ALL_GRADES_ORDERED.slice(mlGradeRangeMin, mlGradeRangeMax + 1);
    gradeExpr = ['in', ['get', 'grado1'], ['literal', selectedGrades]];
  }

  // Construir filtro de "mis vías"
  let myViasExpr = null;
  if (mlShowOnlyMyRoutes && mlCurrentSchool && typeof userAscentsCache !== 'undefined' && userAscentsCache.size > 0) {
    const myRouteIds = [];
    const prefix = mlCurrentSchool + ':';
    for (const key of userAscentsCache.keys()) {
      if (key.startsWith(prefix)) {
        const id = parseInt(key.slice(prefix.length), 10);
        if (!isNaN(id)) myRouteIds.push(id);
      }
    }
    if (myRouteIds.length > 0) {
      myViasExpr = ['in', ['get', 'id'], ['literal', myRouteIds]];
    } else {
      // Usuario sin ascensiones en esta escuela: no mostrar nada
      myViasExpr = ['literal', false];
    }
  }

  // Combinar filtros para vias-layer
  if (!gradeExpr && !myViasExpr) {
    mlMap.setFilter('vias-layer', null);
  } else if (gradeExpr && myViasExpr) {
    mlMap.setFilter('vias-layer', ['all', gradeExpr, myViasExpr]);
  } else {
    mlMap.setFilter('vias-layer', gradeExpr || myViasExpr);
  }

  // Sincronizar ticks con el filtro de grado (el filtro de "mis vías" no aplica:
  // los ticks ya son solo vías del usuario por construcción)
  if (mlMap.getLayer('vias-ticks-circle-layer')) {
    mlMap.setFilter('vias-ticks-circle-layer', gradeExpr || null);
  }
  if (mlMap.getLayer('vias-ticks-layer')) {
    mlMap.setFilter('vias-ticks-layer', gradeExpr || null);
  }
}

/**
 * Actualiza el indicador visual del botón de filtro
 */
function updateFilterButtonBadge() {
  const btn = document.getElementById('btn-grade-filter');
  if (!btn) return;

  if (!isFullGradeRange() || mlShowOnlyMyRoutes) {
    btn.classList.add('has-filter');
  } else {
    btn.classList.remove('has-filter');
  }
}

/**
 * Abre la modal de leyenda completa de colores y grados
 */
function openGradeLegendModal() {
  closeGradeFilterPanel();

  // Si ya existe, eliminar
  const existing = document.getElementById('grade-legend-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'grade-legend-modal';
  overlay.className = 'grade-legend-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  let legendHTML = `
    <div class="grade-legend-content">
      <div class="grade-legend-header">
        <h3>Leyenda de grados</h3>
        <button class="grade-legend-close" onclick="document.getElementById('grade-legend-modal').remove()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="grade-legend-body">
  `;

  const legendGroups = [
    { title: 'Principiante', icon: '3-4', grades: ['3a','3b','3c','4a','4b','4c'] },
    { title: 'Fácil', icon: '5', grades: ['5a','5a+','5b','5b+','5c','5c+'] },
    { title: 'Medio', icon: '6a-6b', grades: ['6a','6a+','6b','6b+'] },
    { title: 'Medio-Alto', icon: '6c-7a', grades: ['6c','6c+','7a','7a+'] },
    { title: 'Difícil', icon: '7b-7c', grades: ['7b','7b+','7c','7c+'] },
    { title: 'Muy difícil', icon: '8', grades: ['8a','8a+','8b','8b+','8c','8c+'] },
    { title: 'Élite', icon: '9', grades: ['9a','9a+','9b','9b+','9c','9c+'] }
  ];

  legendGroups.forEach(group => {
    legendHTML += `<div class="grade-legend-group">
      <div class="grade-legend-group-title">${group.title} (${group.icon})</div>
      <div class="grade-legend-items">`;

    group.grades.forEach(grade => {
      const color = MAPLIBRE_GRADE_COLORS[grade] || '#888';
      legendHTML += `
        <div class="grade-legend-item">
          <span class="grade-legend-dot" style="background:${color}"></span>
          <span class="grade-legend-label">${grade}</span>
        </div>
      `;
    });

    legendHTML += `</div></div>`;
  });

  legendHTML += `
      </div>
    </div>
  `;

  overlay.innerHTML = legendHTML;
  document.body.appendChild(overlay);
}

// Exponer funciones para uso desde HTML onclick
window.resetGradeFilter = resetGradeFilter;
window.openGradeLegendModal = openGradeLegendModal;

// Exponer función para uso externo
window.loadApprovedRoutesFromFirestore = loadApprovedRoutesFromFirestore;
window.updateAscentTicksLayer = updateAscentTicksLayer;

console.log('MapLibre Map JS cargado');
