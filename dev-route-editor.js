/**
 * Spotter Tool — Menú de creación para Spotters/Admins
 *
 * Herramienta para agregar nuevas vías, sectores, puntos de interés y escuelas.
 * Solo disponible para usuarios con rol 'admin' o 'spotter' en Firestore.
 *
 * Funcionalidades:
 * - Menú desplegable con opciones: + Vía, + Sector, + Punto de Interés, + Escuela
 * - Dibujar puntos de vías en el mapa
 * - Dibujar contorno de sectores en el mapa
 * - Añadir puntos de interés con tipo seleccionable
 * - Proponer nuevas escuelas de escalada
 * - Sincronización con Firestore (pendientes de aprobación)
 * - Descarga de GeoJSON actualizado
 */

// ============================================
// VARIABLES GLOBALES
// ============================================

// --- Modo Vía (existente) ---
let devModeActive = false;
let devCurrentSchoolSectors = [];
let devPendingSectorNames = new Set(); // Sectores propios aún pendientes de aprobación
let devPendingRouteCoords = null;
let devRouteMarker = null;
let devPendingRouteDocId = null;

// --- Menú Spotter ---
let devSpotterMenuOpen = false;

// --- Modo Punto de Interés ---
let devPOIMode = false;
let devPOICoords = null;
let devPOIMarker = null;
let devPOIType = null;

// --- Modo Escuela ---
let devSchoolMode = false;
let devSchoolCoords = null;
let devSchoolMarker = null;

// --- Modo Sector (dibujo polígono) ---
let devSectorMode = false;
let devSectorVertices = [];
const DEV_SECTOR_SOURCE = 'dev-sector-draw-source';
const DEV_SECTOR_LINE_LAYER = 'dev-sector-draw-line';
const DEV_SECTOR_VERTEX_LAYER = 'dev-sector-draw-vertices';

// ============================================
// VERIFICACIÓN DE PERMISOS
// ============================================

/**
 * Verifica si el usuario actual es administrador o spotter verificado
 */
async function isDevAdminOrSpotter() {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.log('[DevEditor] isDevAdminOrSpotter: sin auth.currentUser');
      return false;
    }

    const adminDoc = await db.collection('admins').doc(user.uid).get();
    if (!adminDoc.exists) {
      console.log('[DevEditor] isDevAdminOrSpotter: admins/' + user.uid + ' no existe');
      return false;
    }

    const role = adminDoc.data().role;
    const ok = role === 'admin' || role === 'spotter';
    console.log('[DevEditor] isDevAdminOrSpotter: role="' + role + '" → ' + ok);
    return ok;
  } catch (error) {
    console.error('[DevEditor] Error verificando admin/spotter:', error && error.code, error && error.message);
    return false;
  }
}

/**
 * Devuelve 'approved' si el usuario actual tiene rol 'admin', 'pending' en caso contrario.
 * Los admins no necesitan pasar por el flujo de aprobación.
 */
async function getInitialStatus() {
  try {
    const user = auth.currentUser;
    if (!user) return 'pending';
    const adminDoc = await db.collection('admins').doc(user.uid).get();
    if (!adminDoc.exists) return 'pending';
    return adminDoc.data().role === 'admin' ? 'approved' : 'pending';
  } catch (e) {
    return 'pending';
  }
}

// ============================================
// INICIALIZACIÓN DEL BOTÓN
// ============================================

/**
 * Añade el botón de herramienta de desarrollador al mapa
 * Se posiciona justo encima del botón 3D
 */
// Caché simple del rol para evitar re-consultas durante la creación del botón.
let _devEditorRoleCache = { ts: 0, hasAccess: false };
const _DEV_EDITOR_ROLE_TTL = 60000;

async function _getDevEditorAccess() {
  const now = Date.now();
  if (now - _devEditorRoleCache.ts < _DEV_EDITOR_ROLE_TTL && _devEditorRoleCache.hasAccess) {
    return true;
  }
  const ok = await isDevAdminOrSpotter();
  _devEditorRoleCache = { ts: now, hasAccess: ok };
  return ok;
}

let _devEditorButtonCreating = false;

async function addDevEditorButton() {
  if (_devEditorButtonCreating) return;
  // Si ya existe, asegurar visibilidad y salir.
  const existing = document.getElementById('btn-dev-editor');
  if (existing) {
    existing.style.display = 'flex';
    return;
  }
  if (!auth || !auth.currentUser) {
    console.log('[DevEditor] addDevEditorButton: sin usuario autenticado');
    return;
  }
  _devEditorButtonCreating = true;
  try {
    let hasAccess = await _getDevEditorAccess();
    if (!hasAccess) {
      // Reintentar una vez tras 2s por si fue fallo de red transitorio
      await new Promise(r => setTimeout(r, 2000));
      hasAccess = await _getDevEditorAccess();
    }
    if (!hasAccess) {
      console.log('[DevEditor] Usuario sin rol admin/spotter — botón no añadido');
      return;
    }
    // Si entre tanto otra invocación creó el botón, salir
    if (document.getElementById('btn-dev-editor')) return;

    // Anclar al body para no depender de la integridad del contenedor del mapa.
    const host = document.body;
    if (!host) {
      setTimeout(addDevEditorButton, 500);
      return;
    }

    const btn = document.createElement('button');
    btn.id = 'btn-dev-editor';
    btn.className = 'map-control-btn';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v4"/>
      <path d="M12 18v4"/>
      <path d="M4.93 4.93l2.83 2.83"/>
      <path d="M16.24 16.24l2.83 2.83"/>
      <path d="M2 12h4"/>
      <path d="M18 12h4"/>
      <path d="M4.93 19.07l2.83-2.83"/>
      <path d="M16.24 7.76l2.83-2.83"/>
    </svg>`;
    btn.title = 'Herramienta de desarrollador: Añadir vías';
    btn.style.cssText = `
      position: fixed;
      bottom: 306px;
      right: 10px;
      width: 36px;
      height: 36px;
      background: white;
      border: none;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.15);
      font-size: 13px;
      font-weight: 600;
      color: #333;
      cursor: pointer;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    `;

    btn.addEventListener('click', toggleDevMode);
    host.appendChild(btn);

    if (typeof mlMap !== 'undefined' && mlMap) {
      mlMap.on('zoom', updateDevButtonVisibility);
      mlMap.on('zoomend', updateDevButtonVisibility);
      mlMap.on('moveend', updateDevButtonVisibility);
    }

    // Si el usuario es spotter, intercambiar posiciones de los botones 3D y Spotter
    const btn3d = document.getElementById('btn-3d-toggle');
    if (btn3d) {
      btn3d.style.bottom = '306px';
      btn.style.bottom = '250px';
    }

    console.log('[DevEditor] Botón Spotter añadido');
  } catch (err) {
    console.error('[DevEditor] Error añadiendo botón:', err);
  } finally {
    _devEditorButtonCreating = false;
  }
}

/**
 * Actualiza visibilidad del botón Spotter.
 * Visible siempre que el usuario sea admin/spotter (sin restricción de proximidad).
 */
function updateDevButtonVisibility() {
  const btn = document.getElementById('btn-dev-editor');
  if (!btn) return;

  // Visible siempre — los permisos se verificaron al crear el botón
  if (true) {
    btn.style.display = 'flex';
    // Las vías pendientes NO se muestran en el mapa - solo se ven en el panel de admin
  } else {
    btn.style.display = 'none';
    if (devModeActive) {
      deactivateDevMode();
    }
  }
}

// ============================================
// MODO DESARROLLADOR
// ============================================

/**
 * Toggle del menú Spotter — reemplaza el antiguo toggleDevMode
 */
function toggleDevMode() {
  // Si hay algún modo activo, desactivarlo
  if (devModeActive || devPOIMode || devSchoolMode || devSectorMode) {
    deactivateAllModes();
    return;
  }
  toggleSpotterMenu();
}

/**
 * Abre/cierra el menú desplegable del Spotter
 */
function toggleSpotterMenu() {
  const existing = document.getElementById('dev-spotter-menu');
  if (existing) {
    closeSpotterMenu();
    return;
  }

  devSpotterMenuOpen = true;

  const poiSections = [
    {
      label: 'Alojamientos', color: '#F9A825',
      items: [
        { key: 'hotel',     label: 'Hotel',     emoji: '🏨' },
        { key: 'camping',   label: 'Camping',   emoji: '⛺' },
        { key: 'refugio',   label: 'Refugio',   emoji: '🏠' },
        { key: 'albergue',  label: 'Albergue',  emoji: '🛏️' },
        { key: 'vivac',     label: 'Vivac',     emoji: '🏕️' },
      ]
    },
    {
      label: 'Naturaleza', color: '#2e7d32',
      items: [
        { key: 'cumbre',  label: 'Cumbre',  emoji: '🏔️' },
        { key: 'rio',     label: 'Río',     emoji: '🌊' },
        { key: 'cueva',   label: 'Cueva',   emoji: '🕳️' },
      ]
    },
    {
      label: 'Patrimonio', color: '#795548',
      items: [
        { key: 'iglesia', label: 'Iglesia', emoji: '⛪' },
        { key: 'ermita',  label: 'Ermita',  emoji: '🛕' },
        { key: 'ruina',   label: 'Ruina',   emoji: '🏚️' },
      ]
    },
    {
      label: 'Importante', color: '#cc2200',
      items: [
        { key: 'hospital',  label: 'Hospital',  emoji: '🏥' },
        { key: 'farmacia',  label: 'Farmacia',  emoji: '💊' },
        { key: 'policia',   label: 'Policía',   emoji: '👮' },
        { key: 'bomberos',  label: 'Bomberos',  emoji: '🚒' },
      ]
    },
    {
      label: 'Servicios', color: '#e65100',
      items: [
        { key: 'restaurante',  label: 'Restaurante',  emoji: '🍽️' },
        { key: 'bar',          label: 'Bar',          emoji: '🍺' },
        { key: 'gasolinera',   label: 'Gasolinera',   emoji: '⛽' },
        { key: 'tienda',       label: 'Tienda',       emoji: '🛒' },
        { key: 'merendero',    label: 'Merendero',    emoji: '🧺' },
        { key: 'banco',        label: 'Banco',        emoji: '🏦' },
        { key: 'correos',      label: 'Correos',      emoji: '📮' },
        { key: 'informacion',  label: 'Información',  emoji: 'ℹ️' },
      ]
    },
    {
      label: 'Infraestructuras', color: '#6a1b9a',
      items: [
        { key: 'parking',    label: 'Parking',    emoji: '🅿️' },
        { key: 'puente',     label: 'Puente',     emoji: '🌉' },
        { key: 'escalera',   label: 'Escalera',   emoji: '🪜' },
        { key: 'mirador',    label: 'Mirador',    emoji: '👁️' },
      ]
    },
    {
      label: 'Instalaciones', color: '#0277BD',
      items: [
        { key: 'fuente',  label: 'Fuente',  emoji: '🚰' },
        { key: 'wc',      label: 'WC',      emoji: '🚻' },
        { key: 'ducha',   label: 'Ducha',   emoji: '🚿' },
        { key: 'piscina', label: 'Piscina', emoji: '🏊' },
      ]
    },
  ];

  const poiItemsHTML = poiSections.map((section, i) => `
    <button class="dev-poi-section-header" style="--section-color:${section.color}" onclick="togglePOISection(${i})">
      <span style="color:${section.color}">${section.label}</span>
      <span class="dev-poi-section-chevron" id="dev-poi-sec-chevron-${i}">›</span>
    </button>
    <div class="dev-poi-section-items" id="dev-poi-sec-${i}">
      ${section.items.map(t =>
        `<button class="dev-spotter-poi-type" onclick="selectPOIType('${t.key}')">
          <span class="dev-spotter-poi-emoji">${t.emoji}</span>${t.label}
        </button>`
      ).join('')}
    </div>
  `).join('');

  const menu = document.createElement('div');
  menu.id = 'dev-spotter-menu';
  menu.className = 'dev-spotter-menu';
  menu.innerHTML = `
    <button class="dev-spotter-menu-item" onclick="selectSpotterOption('via')">
      <span class="dev-spotter-menu-icon">📍</span> Via
    </button>
    <button class="dev-spotter-menu-item" onclick="selectSpotterOption('sector')">
      <span class="dev-spotter-menu-icon">📐</span> Sector
    </button>
    <button class="dev-spotter-menu-item dev-spotter-menu-item-poi" onclick="togglePOIAccordion(event)">
      <span class="dev-spotter-menu-icon">📌</span> Punto de Interes
      <span class="dev-spotter-poi-chevron" id="dev-poi-chevron">›</span>
    </button>
    <div class="dev-spotter-poi-submenu" id="dev-poi-submenu">
      ${poiItemsHTML}
    </div>
    <button class="dev-spotter-menu-item" onclick="selectSpotterOption('escuela')">
      <span class="dev-spotter-menu-icon">🏔️</span> Escuela
    </button>
  `;

  document.getElementById('map').appendChild(menu);

  // Cerrar al hacer clic fuera (con delay para no cerrar inmediatamente)
  setTimeout(() => {
    document.addEventListener('click', handleSpotterMenuOutsideClick);
  }, 10);
}

function handleSpotterMenuOutsideClick(e) {
  const menu = document.getElementById('dev-spotter-menu');
  const btn = document.getElementById('btn-dev-editor');
  if (menu && !menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
    closeSpotterMenu();
  }
}

function closeSpotterMenu() {
  const menu = document.getElementById('dev-spotter-menu');
  if (menu) menu.remove();
  devSpotterMenuOpen = false;
  document.removeEventListener('click', handleSpotterMenuOutsideClick);
}

/**
 * Expande/colapsa el acordeón de tipos de POI
 */
function togglePOIAccordion(e) {
  e.stopPropagation();
  const submenu = document.getElementById('dev-poi-submenu');
  const chevron = document.getElementById('dev-poi-chevron');
  if (submenu) {
    const isOpen = submenu.classList.toggle('open');
    if (chevron) chevron.textContent = isOpen ? '⌄' : '›';
  }
}

function togglePOISection(index) {
  const items = document.getElementById(`dev-poi-sec-${index}`);
  const chevron = document.getElementById(`dev-poi-sec-chevron-${index}`);
  if (items) {
    const isOpen = items.classList.toggle('open');
    if (chevron) chevron.textContent = isOpen ? '⌄' : '›';
  }
}

/**
 * Selecciona un tipo de POI desde el acordeón
 */
function selectPOIType(poiType) {
  closeSpotterMenu();
  devPOIType = poiType;
  activatePOIMode(poiType);
}

/**
 * Maneja la selección de una opción del menú Spotter
 */
function selectSpotterOption(option) {
  closeSpotterMenu();
  switch (option) {
    case 'via':
      activateDevMode();
      break;
    case 'sector':
      activateSectorMode();
      break;
    case 'escuela':
      activateSchoolMode();
      break;
  }
}

/**
 * Desactiva todos los modos activos
 */
function deactivateAllModes() {
  if (devModeActive) deactivateDevMode();
  if (devPOIMode) deactivatePOIMode();
  if (devSchoolMode) deactivateSchoolMode();
  if (devSectorMode) deactivateSectorMode();
  closeSpotterMenu();
}

/**
 * Activa el modo desarrollador
 */
async function activateDevMode() {
  devModeActive = true;

  const btn = document.getElementById('btn-dev-editor');
  if (btn) {
    btn.style.background = '#10b981';
    btn.style.color = 'white';
    btn.title = 'Desactivar herramienta de desarrollador';
  }

  // Cargar sectores de la escuela actual
  await loadSchoolSectors();

  // Mostrar instrucciones
  showDevToast('Modo desarrollador activo. Haz clic en el mapa para añadir una vía.', 'info');

  // Añadir listener de clic en el mapa
  if (mlMap) {
    mlMap.on('click', handleDevMapClick);
    mlMap.getCanvas().style.cursor = 'crosshair';
  }

  console.log('[DevEditor] Modo desarrollador activado');
}

/**
 * Desactiva el modo desarrollador
 */
function deactivateDevMode() {
  devModeActive = false;

  const btn = document.getElementById('btn-dev-editor');
  if (btn) {
    btn.style.background = 'white';
    btn.style.color = '#333';
    btn.title = 'Herramienta de desarrollador: Añadir vías';
  }

  // Remover listener
  if (mlMap) {
    mlMap.off('click', handleDevMapClick);
    mlMap.getCanvas().style.cursor = '';
  }

  // Limpiar marcador temporal
  if (devRouteMarker) {
    devRouteMarker.remove();
    devRouteMarker = null;
  }

  // Cerrar modal si está abierto
  closeDevRouteModal();

  console.log('[DevEditor] Modo desarrollador desactivado');
}

// ============================================
// CARGA DE SECTORES
// ============================================

/**
 * Carga los sectores de la escuela actual
 */
async function loadSchoolSectors() {
  devCurrentSchoolSectors = [];

  if (!mlCurrentSchool) {
    console.warn('[DevEditor] No hay escuela cargada');
    return;
  }

  const school = MAPLIBRE_SCHOOLS[mlCurrentSchool];
  const sectorNames = new Set();

  // 1. Sectores del GeoJSON estático
  if (school?.geojson?.sectores) {
    try {
      const response = await fetch(school.geojson.sectores + '?v=' + Date.now());
      if (response.ok) {
        const geojson = await response.json();
        if (geojson.features) {
          geojson.features
            .map(f => f.properties.nombre)
            .filter(name => name && name.trim() !== '')
            .forEach(name => sectorNames.add(name));
        }
      }
    } catch (error) {
      console.warn('[DevEditor] Error cargando GeoJSON sectores:', error);
    }
  }

  // 2. Sectores aprobados en Firestore para esta escuela
  try {
    const user = typeof firebase !== 'undefined' && firebase.auth?.().currentUser;
    if (user && firebase.firestore) {
      const snap = await firebase.firestore().collection('pending_sectors')
        .where('schoolId', '==', mlCurrentSchool)
        .where('status', '==', 'approved')
        .get();
      snap.forEach(doc => {
        const nombre = doc.data().nombre?.trim();
        if (nombre) sectorNames.add(nombre);
      });
    }
  } catch (error) {
    console.warn('[DevEditor] Error cargando sectores aprobados:', error);
  }

  // 3. Sectores propios pendientes de aprobación (solo los del usuario actual)
  devPendingSectorNames = new Set();
  try {
    const user = typeof firebase !== 'undefined' && firebase.auth?.().currentUser;
    if (user && firebase.firestore) {
      const snap = await firebase.firestore().collection('pending_sectors')
        .where('schoolId', '==', mlCurrentSchool)
        .where('createdBy', '==', user.uid)
        .where('status', '==', 'pending')
        .get();
      snap.forEach(doc => {
        const nombre = doc.data().nombre?.trim();
        if (nombre) {
          devPendingSectorNames.add(nombre);
          sectorNames.add(nombre);
        }
      });
    }
  } catch (error) {
    console.warn('[DevEditor] Error cargando sectores propios pendientes:', error);
  }

  devCurrentSchoolSectors = [...sectorNames].sort();
  console.log('[DevEditor] Sectores cargados:', devCurrentSchoolSectors, '| Pendientes propios:', [...devPendingSectorNames]);
}

// ============================================
// MANEJO DE CLICS EN EL MAPA
// ============================================

/**
 * Maneja el clic en el mapa para añadir una vía
 */
function handleDevMapClick(e) {
  // Ignorar si el clic fue en una vía existente o en un control
  if (e.originalEvent && e.originalEvent.target !== mlMap.getCanvas()) return;

  // Verificar que no hay features de vías en ese punto
  const features = mlMap.queryRenderedFeatures(e.point, { layers: ['vias-layer'] });
  if (features.length > 0) {
    showDevToast('Haz clic en un área vacía del mapa', 'warning');
    return;
  }

  const coords = e.lngLat;
  devPendingRouteCoords = [coords.lng, coords.lat];

  // Crear o mover marcador temporal
  if (devRouteMarker) {
    devRouteMarker.setLngLat(coords);
  } else {
    // Crear elemento del marcador
    const el = document.createElement('div');
    el.className = 'dev-route-marker';
    el.style.cssText = `
      width: 24px;
      height: 24px;
      background: #10b981;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      cursor: pointer;
    `;

    devRouteMarker = new maplibregl.Marker({ element: el, draggable: true })
      .setLngLat(coords)
      .addTo(mlMap);

    // Actualizar coords al arrastrar
    devRouteMarker.on('dragend', () => {
      const lngLat = devRouteMarker.getLngLat();
      devPendingRouteCoords = [lngLat.lng, lngLat.lat];
    });
  }

  // Mostrar modal de formulario
  showDevRouteModal();
}

// ============================================
// MODAL DE FORMULARIO
// ============================================

/**
 * Muestra el modal para completar datos de la vía
 */
async function showDevRouteModal() {
  // Remover modal existente si hay
  closeDevRouteModal();

  // Detectar sector por proximidad antes de mostrar el modal
  const detectedSector = await detectSectorByProximity();

  const modal = document.createElement('div');
  modal.id = 'dev-route-modal';
  modal.className = 'dev-route-modal-overlay';
  modal.innerHTML = `
    <div class="dev-route-modal">
      <div class="dev-route-modal-header">
        <h3>Nueva Vía</h3>
        <button class="dev-modal-close" onclick="closeDevRouteModal()">&times;</button>
      </div>

      <div class="dev-route-modal-body">
        <div class="dev-form-group">
          <label for="dev-route-name">Nombre de la vía *</label>
          <input type="text" id="dev-route-name" placeholder="Ej: El gran diedro" required>
        </div>

        <div class="dev-form-row">
          <div class="dev-form-group">
            <label for="dev-route-grade">Grado *</label>
            <select id="dev-route-grade" required>
              <option value="">Seleccionar...</option>
              <optgroup label="Fácil (3-5)">
                <option value="3a">3a</option>
                <option value="3b">3b</option>
                <option value="3c">3c</option>
                <option value="4a">4a</option>
                <option value="4b">4b</option>
                <option value="4c">4c</option>
                <option value="5a">5a</option>
                <option value="5a+">5a+</option>
                <option value="5b">5b</option>
                <option value="5b+">5b+</option>
                <option value="5c">5c</option>
                <option value="5c+">5c+</option>
              </optgroup>
              <optgroup label="Medio (6a-6c)">
                <option value="6a">6a</option>
                <option value="6a+">6a+</option>
                <option value="6b">6b</option>
                <option value="6b+">6b+</option>
                <option value="6c">6c</option>
                <option value="6c+">6c+</option>
              </optgroup>
              <optgroup label="Difícil (7a-7c)">
                <option value="7a">7a</option>
                <option value="7a+">7a+</option>
                <option value="7b">7b</option>
                <option value="7b+">7b+</option>
                <option value="7c">7c</option>
                <option value="7c+">7c+</option>
              </optgroup>
              <optgroup label="Muy Difícil (8+)">
                <option value="8a">8a</option>
                <option value="8a+">8a+</option>
                <option value="8b">8b</option>
                <option value="8b+">8b+</option>
                <option value="8c">8c</option>
                <option value="8c+">8c+</option>
                <option value="9a">9a</option>
                <option value="9a+">9a+</option>
                <option value="9b">9b</option>
                <option value="9b+">9b+</option>
                <option value="9c">9c</option>
              </optgroup>
            </select>
          </div>

          <div class="dev-form-group">
            <label for="dev-route-sector">Sector *</label>
            <select id="dev-route-sector" required>
              <option value="">Seleccionar...</option>
              ${devCurrentSchoolSectors.map(s => `<option value="${s}" ${s === detectedSector ? 'selected' : ''}>${s}${devPendingSectorNames.has(s) ? ' ⏳' : ''}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="dev-form-row">
          <div class="dev-form-group">
            <label for="dev-route-express">Express</label>
            <input type="number" id="dev-route-express" placeholder="Ej: 8" min="0" max="50">
          </div>

          <div class="dev-form-group">
            <label for="dev-route-meters">Metros</label>
            <input type="number" id="dev-route-meters" placeholder="Ej: 25" min="1" max="500">
          </div>
        </div>

        <div class="dev-form-group">
          <label for="dev-route-description">Descripción (tipo de roca/técnica)</label>
          <input type="text" id="dev-route-description" placeholder="Ej: Placa, Fisura, Diedro...">
        </div>

        <div class="dev-form-group">
          <label for="dev-route-modality">Modalidad</label>
          <select id="dev-route-modality">
            <option value="Simple">Simple</option>
            <option value="Multilargo">Multilargo</option>
            <option value="Boulder">Boulder</option>
          </select>
        </div>
      </div>

      <div class="dev-route-modal-footer">
        <button class="dev-btn-cancel" onclick="closeDevRouteModal()">Cancelar</button>
        <button class="dev-btn-save" onclick="saveDevRoute()">Guardar Vía</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Focus en el primer campo
  setTimeout(() => {
    document.getElementById('dev-route-name')?.focus();
  }, 100);
}

/**
 * Detecta el sector más probable basándose en la proximidad
 * a otras vías existentes en el mapa
 * @returns {string|null} Nombre del sector detectado o null
 */
async function detectSectorByProximity() {
  if (!devPendingRouteCoords || !mlCurrentSchool) {
    return null;
  }

  try {
    const school = MAPLIBRE_SCHOOLS[mlCurrentSchool];
    if (!school || !school.geojson || !school.geojson.vias) {
      return null;
    }

    // Cargar todas las vías de la escuela
    const response = await fetch(school.geojson.vias + '?v=' + Date.now());
    if (!response.ok) return null;

    const geojson = await response.json();
    if (!geojson.features || geojson.features.length === 0) {
      return null;
    }

    const clickCoords = devPendingRouteCoords; // [lng, lat]

    // Calcular distancia a cada vía y guardar su sector
    const distances = geojson.features
      .filter(f => f.properties.sector && f.geometry.coordinates)
      .map(f => {
        const routeCoords = f.geometry.coordinates[0] || f.geometry.coordinates;
        // Distancia euclidiana simple
        const dist = Math.sqrt(
          Math.pow(clickCoords[0] - routeCoords[0], 2) +
          Math.pow(clickCoords[1] - routeCoords[1], 2)
        );
        return {
          sector: f.properties.sector,
          distance: dist
        };
      });

    if (distances.length === 0) {
      return null;
    }

    // Ordenar por distancia
    distances.sort((a, b) => a.distance - b.distance);

    // Tomar las 5 vías más cercanas y contar votos por sector
    const topN = distances.slice(0, 5);
    const sectorVotes = {};

    topN.forEach(item => {
      sectorVotes[item.sector] = (sectorVotes[item.sector] || 0) + 1;
    });

    // Encontrar el sector con más votos
    let bestSector = null;
    let maxVotes = 0;

    for (const [sector, votes] of Object.entries(sectorVotes)) {
      if (votes > maxVotes) {
        maxVotes = votes;
        bestSector = sector;
      }
    }

    // Si la vía más cercana está muy cerca (< ~100m en grados ≈ 0.001)
    // confiar en su sector directamente
    const closestDistance = distances[0].distance;
    const isVeryClose = closestDistance < 0.001;

    if (isVeryClose) {
      bestSector = distances[0].sector;
    }

    console.log('[DevEditor] Sector detectado por proximidad:', {
      clickCoords,
      topRoutes: topN.slice(0, 3),
      sectorVotes,
      bestSector,
      closestDistance,
      isVeryClose
    });

    return bestSector;

  } catch (error) {
    console.error('[DevEditor] Error detectando sector por proximidad:', error);
    return null;
  }
}

/**
 * Cierra el modal de formulario
 */
function closeDevRouteModal() {
  const modal = document.getElementById('dev-route-modal');
  if (modal) {
    modal.remove();
  }
}

// ============================================
// GUARDADO DE VÍAS
// ============================================

/**
 * Guarda la nueva vía en Firestore
 */
async function saveDevRoute() {
  // Obtener valores del formulario
  const name = document.getElementById('dev-route-name')?.value?.trim();
  const grade = document.getElementById('dev-route-grade')?.value;
  const sector = document.getElementById('dev-route-sector')?.value;
  const express = parseInt(document.getElementById('dev-route-express')?.value) || null;
  const meters = parseInt(document.getElementById('dev-route-meters')?.value) || null;
  const description = document.getElementById('dev-route-description')?.value?.trim() || null;
  const modality = document.getElementById('dev-route-modality')?.value || 'Simple';

  // Validar campos requeridos
  if (!name) {
    showDevToast('El nombre de la vía es obligatorio', 'error');
    return;
  }
  if (!grade) {
    showDevToast('El grado es obligatorio', 'error');
    return;
  }
  if (!sector) {
    showDevToast('El sector es obligatorio', 'error');
    return;
  }
  if (!devPendingRouteCoords) {
    showDevToast('No se ha definido la ubicación', 'error');
    return;
  }

  try {
    const user = auth.currentUser;
    const schoolId = mlCurrentSchool;
    const schoolName = MAPLIBRE_SCHOOLS[schoolId]?.name || schoolId;
    const initialStatus = await getInitialStatus();

    // Crear documento en Firestore
    const routeData = {
      // Datos de la vía
      nombre: name,
      grado1: grade,
      sector: sector,
      exp1: express,
      long1: meters,
      descripcion: description,
      modalidad: modality,
      variante: 'NO',

      // Coordenadas (formato GeoJSON)
      coordinates: devPendingRouteCoords,

      // Metadatos
      schoolId: schoolId,
      schoolName: schoolName,
      createdBy: user.uid,
      createdByEmail: user.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: initialStatus,

      // GeoJSON Feature data para exportar (sin arrays anidados para Firestore)
      geojsonFeature: {
        type: 'Feature',
        properties: {
          nombre: name,
          grado1: grade,
          sector: sector,
          exp1: express,
          long1: meters,
          descripcion: description,
          modalidad: modality,
          variante: 'NO'
        },
        geometry: {
          type: 'Point',
          // Guardamos lng y lat por separado para evitar arrays anidados en Firestore
          lng: devPendingRouteCoords[0],
          lat: devPendingRouteCoords[1]
        }
      }
    };

    // Guardar en colección de vías pendientes
    const docRef = await db.collection('pending_routes').add(routeData);
    devPendingRouteDocId = docRef.id;

    // NO añadir al mapa temporal - la vía solo será visible cuando se complete el dibujo
    // y sea aprobada por un admin

    // Limpiar marcador y modal
    closeDevRouteModal();
    if (devRouteMarker) {
      devRouteMarker.remove();
      devRouteMarker = null;
    }
    devPendingRouteCoords = null;

    console.log('[DevEditor] Vía guardada:', routeData);

    // Desactivar modo dev temporalmente para evitar conflictos
    deactivateDevMode();

    const openDrawing = () => {
      showDevToast('Ahora dibuja la vía en la imagen del sector', 'info');
      setTimeout(() => {
        openDrawingEditorForPendingRoute(routeData.nombre, routeData.sector, docRef.id);
      }, 500);
    };

    // Verificar si el sector tiene foto; si no, preguntar antes de abrir el editor
    const photoSchoolId = schoolId || routeData.schoolId;
    const hasSectorPhoto = typeof window.sectorHasImage === 'function'
      ? await window.sectorHasImage(photoSchoolId, routeData.sector)
      : true;

    if (!hasSectorPhoto) {
      promptSectorPhoto(photoSchoolId, routeData.sector, openDrawing);
    } else {
      openDrawing();
    }

  } catch (error) {
    console.error('[DevEditor] Error guardando vía:', error);
    showDevToast('Error al guardar: ' + error.message, 'error');
  }
}

/**
 * Añade una vía temporal al mapa para visualización
 */
function addTempRouteToMap(routeData) {
  if (!mlMap) return;

  const sourceId = 'dev-temp-routes';
  const layerId = 'dev-temp-routes-layer';

  // Crear source si no existe
  if (!mlMap.getSource(sourceId)) {
    mlMap.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });

    // Añadir capa
    mlMap.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 8,
        'circle-color': '#10b981',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-opacity': 0.9
      }
    });
  }

  // Añadir feature
  const source = mlMap.getSource(sourceId);
  const data = source._data || { type: 'FeatureCollection', features: [] };

  data.features.push({
    type: 'Feature',
    properties: {
      nombre: routeData.nombre,
      grado1: routeData.grado1,
      sector: routeData.sector,
      isPending: true
    },
    geometry: {
      type: 'Point',
      coordinates: routeData.coordinates
    }
  });

  source.setData(data);
}

// ============================================
// CARGAR VÍAS PENDIENTES
// ============================================

/**
 * Carga las vías pendientes de Firestore y las muestra en el mapa
 * Se llama cuando el admin está cerca de una escuela
 */
async function loadPendingRoutesFromFirestore() {
  if (!mlMap || !mlCurrentSchool) return;

  // Verificar si es admin o spotter
  const hasAccess = await isDevAdminOrSpotter();
  if (!hasAccess) return;

  try {
    const snapshot = await db.collection('pending_routes')
      .where('schoolId', '==', mlCurrentSchool)
      .where('status', '==', 'pending')
      .get();

    if (snapshot.empty) {
      console.log('[DevEditor] No hay vías pendientes para esta escuela');
      return;
    }

    const sourceId = 'dev-temp-routes';
    const layerId = 'dev-temp-routes-layer';

    // Crear source si no existe
    if (!mlMap.getSource(sourceId)) {
      mlMap.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Añadir capa
      mlMap.addLayer({
        id: layerId,
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-radius': 8,
          'circle-color': '#10b981',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.9
        }
      });
    }

    // Construir features desde Firestore
    const features = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      features.push({
        type: 'Feature',
        properties: {
          nombre: data.nombre,
          grado1: data.grado1,
          sector: data.sector,
          isPending: true,
          docId: doc.id
        },
        geometry: {
          type: 'Point',
          coordinates: data.coordinates
        }
      });
    });

    // Actualizar source
    const source = mlMap.getSource(sourceId);
    source.setData({
      type: 'FeatureCollection',
      features: features
    });

    console.log(`[DevEditor] Cargadas ${features.length} vías pendientes`);

  } catch (error) {
    console.error('[DevEditor] Error cargando vías pendientes:', error);
  }
}

// ============================================
// ABRIR EDITOR DE DIBUJO PARA VÍA PENDIENTE
// ============================================

/**
 * Abre el editor de dibujo para una vía pendiente recién creada
 * @param {string} routeName - Nombre de la vía
 * @param {string} sectorName - Nombre del sector
 * @param {string} docId - ID del documento en Firestore
 */
async function openDrawingEditorForPendingRoute(routeName, sectorName, docId) {
  if (!mlCurrentSchool) {
    showDevToast('No se puede determinar la escuela actual', 'error');
    return;
  }

  // Verificar que existe imagen del sector
  const imageUrl = await getSectorImageUrl(mlCurrentSchool, sectorName);
  if (!imageUrl) {
    showDevToast('No hay imagen disponible para este sector. La vía se guardará sin dibujo.', 'warning');
    return;
  }

  // Llamar a la función del módulo route-drawing con la información de la vía pendiente
  if (typeof openRouteDrawingEditorForPendingRoute === 'function') {
    await openRouteDrawingEditorForPendingRoute(mlCurrentSchool, sectorName, routeName, docId);
  } else {
    // Fallback: usar la función normal
    showDevToast('Abre el editor de dibujo manualmente para dibujar la vía', 'warning');
  }
}

// ============================================
// EXPORTAR GEOJSON
// ============================================

/**
 * Descarga las vías pendientes como GeoJSON
 * (Para integrar manualmente con los archivos existentes)
 */
async function exportPendingRoutesAsGeoJSON() {
  try {
    const snapshot = await db.collection('pending_routes')
      .where('schoolId', '==', mlCurrentSchool)
      .where('status', '==', 'pending')
      .get();

    if (snapshot.empty) {
      showDevToast('No hay vías pendientes para exportar', 'info');
      return;
    }

    const features = [];
    let fid = 1000; // Empezar con FID alto para evitar conflictos

    snapshot.forEach(doc => {
      const data = doc.data();
      const storedFeature = data.geojsonFeature;

      // Reconstruir el GeoJSON con el formato correcto de coordenadas
      const feature = {
        type: 'Feature',
        properties: {
          ...storedFeature.properties,
          fid: fid++
        },
        geometry: {
          type: 'MultiPoint',
          coordinates: [[storedFeature.geometry.lng, storedFeature.geometry.lat]]
        }
      };

      features.push(feature);
    });

    const geojson = {
      type: 'FeatureCollection',
      name: `${mlCurrentSchool}_Vias_Nuevas`,
      features: features
    };

    // Descargar archivo
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mlCurrentSchool}_vias_nuevas_${Date.now()}.geojson`;
    a.click();
    URL.revokeObjectURL(url);

    showDevToast(`Exportadas ${features.length} vías`, 'success');

  } catch (error) {
    console.error('[DevEditor] Error exportando:', error);
    showDevToast('Error al exportar: ' + error.message, 'error');
  }
}

// ============================================
// MODO PUNTO DE INTERÉS
// ============================================

/**
 * Activa el modo de creación de POI
 */
function activatePOIMode(poiType) {
  deactivateAllModes();
  devPOIMode = true;
  devPOIType = poiType;

  const btn = document.getElementById('btn-dev-editor');
  if (btn) {
    btn.style.background = '#f59e0b';
    btn.style.color = 'white';
  }

  const emoji = (typeof getPOIEmoji === 'function') ? getPOIEmoji(poiType) : '📌';
  showDevToast(`${emoji} Haz clic en el mapa para colocar: ${poiType}`, 'info');

  if (mlMap) {
    mlMap.on('click', handlePOIMapClick);
    mlMap.getCanvas().style.cursor = 'crosshair';
  }
}

/**
 * Desactiva el modo POI
 */
function deactivatePOIMode() {
  devPOIMode = false;
  devPOIType = null;
  devPOICoords = null;

  const btn = document.getElementById('btn-dev-editor');
  if (btn) {
    btn.style.background = 'white';
    btn.style.color = '#333';
  }

  if (mlMap) {
    mlMap.off('click', handlePOIMapClick);
    mlMap.getCanvas().style.cursor = '';
  }

  if (devPOIMarker) {
    devPOIMarker.remove();
    devPOIMarker = null;
  }

  closePOIModal();
}

/**
 * Maneja clic en mapa para colocar POI
 */
function handlePOIMapClick(e) {
  if (e.originalEvent && e.originalEvent.target !== mlMap.getCanvas()) return;

  const coords = e.lngLat;
  devPOICoords = [coords.lng, coords.lat];

  if (devPOIMarker) {
    devPOIMarker.setLngLat(coords);
  } else {
    const el = document.createElement('div');
    el.style.cssText = `
      width: 28px; height: 28px;
      background: #f59e0b; border: 3px solid white; border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px;
    `;
    const emoji = (typeof getPOIEmoji === 'function') ? getPOIEmoji(devPOIType) : '📌';
    el.textContent = emoji;

    devPOIMarker = new maplibregl.Marker({ element: el, draggable: true })
      .setLngLat(coords)
      .addTo(mlMap);

    devPOIMarker.on('dragend', () => {
      const lngLat = devPOIMarker.getLngLat();
      devPOICoords = [lngLat.lng, lngLat.lat];
    });
  }

  showPOIModal();
}

/**
 * Muestra modal para completar datos del POI
 */
function showPOIModal() {
  closePOIModal();

  const emoji = (typeof getPOIEmoji === 'function') ? getPOIEmoji(devPOIType) : '📌';

  const modal = document.createElement('div');
  modal.id = 'dev-poi-modal';
  modal.className = 'dev-route-modal-overlay';
  modal.innerHTML = `
    <div class="dev-route-modal">
      <div class="dev-route-modal-header">
        <h3>${emoji} Nuevo Punto de Interes</h3>
        <button class="dev-modal-close" onclick="closePOIModal()">&times;</button>
      </div>
      <div class="dev-route-modal-body">
        <div class="dev-form-group">
          <label>Tipo</label>
          <input type="text" value="${devPOIType}" readonly style="background:#f5f5f5;color:#888;">
        </div>
        <div class="dev-form-group">
          <label for="dev-poi-name">Nombre (opcional)</label>
          <input type="text" id="dev-poi-name" placeholder="Ej: Fuente del rio">
        </div>
        <div class="dev-form-group">
          <label for="dev-poi-link">Link (opcional)</label>
          <input type="url" id="dev-poi-link" placeholder="https://...">
        </div>
      </div>
      <div class="dev-route-modal-footer">
        <button class="dev-btn-cancel" onclick="closePOIModal()">Cancelar</button>
        <button class="dev-btn-save" onclick="savePOI()">Guardar POI</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('dev-poi-name')?.focus(), 100);
}

function closePOIModal() {
  const modal = document.getElementById('dev-poi-modal');
  if (modal) modal.remove();
}

/**
 * Guarda el POI en Firestore
 */
async function savePOI() {
  if (!devPOICoords) {
    showDevToast('No se ha definido la ubicacion', 'error');
    return;
  }

  try {
    const user = auth.currentUser;
    const nombre = document.getElementById('dev-poi-name')?.value?.trim() || null;
    const link = document.getElementById('dev-poi-link')?.value?.trim() || null;
    const initialStatus = await getInitialStatus();

    const poiData = {
      descripcio: devPOIType,
      nombre: nombre,
      link: link,
      coordinates: devPOICoords,
      schoolId: mlCurrentSchool || null,
      createdBy: user.uid,
      createdByEmail: user.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: initialStatus
    };

    await db.collection('pending_poi').add(poiData);

    showDevToast('Punto de interes guardado correctamente', 'success');
    deactivatePOIMode();
  } catch (error) {
    console.error('[Spotter] Error guardando POI:', error);
    showDevToast('Error al guardar: ' + error.message, 'error');
  }
}

// ============================================
// MODO ESCUELA
// ============================================

/**
 * Activa el modo de creación de escuela
 */
function activateSchoolMode() {
  deactivateAllModes();
  devSchoolMode = true;

  const btn = document.getElementById('btn-dev-editor');
  if (btn) {
    btn.style.background = '#8b5cf6';
    btn.style.color = 'white';
  }

  showDevToast('Haz clic en el mapa para marcar la ubicacion de la nueva escuela', 'info');

  if (mlMap) {
    mlMap.on('click', handleSchoolMapClick);
    mlMap.getCanvas().style.cursor = 'crosshair';
  }
}

/**
 * Desactiva el modo escuela
 */
function deactivateSchoolMode() {
  devSchoolMode = false;
  devSchoolCoords = null;

  const btn = document.getElementById('btn-dev-editor');
  if (btn) {
    btn.style.background = 'white';
    btn.style.color = '#333';
  }

  if (mlMap) {
    mlMap.off('click', handleSchoolMapClick);
    mlMap.getCanvas().style.cursor = '';
  }

  if (devSchoolMarker) {
    devSchoolMarker.remove();
    devSchoolMarker = null;
  }

  closeSchoolModal();
}

/**
 * Maneja clic en mapa para colocar escuela
 */
function handleSchoolMapClick(e) {
  if (e.originalEvent && e.originalEvent.target !== mlMap.getCanvas()) return;

  const coords = e.lngLat;
  devSchoolCoords = [coords.lng, coords.lat];

  if (devSchoolMarker) {
    devSchoolMarker.setLngLat(coords);
  } else {
    const el = document.createElement('div');
    el.style.cssText = `
      width: 28px; height: 28px;
      background: #8b5cf6; border: 3px solid white; border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px;
    `;
    el.textContent = '🏔️';

    devSchoolMarker = new maplibregl.Marker({ element: el, draggable: true })
      .setLngLat(coords)
      .addTo(mlMap);

    devSchoolMarker.on('dragend', () => {
      const lngLat = devSchoolMarker.getLngLat();
      devSchoolCoords = [lngLat.lng, lngLat.lat];
    });
  }

  showSchoolModal();
}

/**
 * Muestra modal para completar datos de la escuela
 */
function showSchoolModal() {
  closeSchoolModal();

  const modal = document.createElement('div');
  modal.id = 'dev-school-modal';
  modal.className = 'dev-route-modal-overlay';
  modal.innerHTML = `
    <div class="dev-route-modal">
      <div class="dev-route-modal-header">
        <h3>Nueva Escuela</h3>
        <button class="dev-modal-close" onclick="closeSchoolModal()">&times;</button>
      </div>
      <div class="dev-route-modal-body">
        <div class="dev-form-group">
          <label for="dev-school-name">Nombre de la escuela *</label>
          <input type="text" id="dev-school-name" placeholder="Ej: Los Cahorros" required>
        </div>
        <div class="dev-form-group">
          <label for="dev-school-desc">Descripcion (opcional)</label>
          <input type="text" id="dev-school-desc" placeholder="Ej: Escuela de roca caliza...">
        </div>
      </div>
      <div class="dev-route-modal-footer">
        <button class="dev-btn-cancel" onclick="closeSchoolModal()">Cancelar</button>
        <button class="dev-btn-save" onclick="saveSchool()">Guardar Escuela</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('dev-school-name')?.focus(), 100);
}

function closeSchoolModal() {
  const modal = document.getElementById('dev-school-modal');
  if (modal) modal.remove();
}

/**
 * Guarda la escuela en Firestore
 */
async function saveSchool() {
  const name = document.getElementById('dev-school-name')?.value?.trim();
  if (!name) {
    showDevToast('El nombre de la escuela es obligatorio', 'error');
    return;
  }
  if (!devSchoolCoords) {
    showDevToast('No se ha definido la ubicacion', 'error');
    return;
  }

  try {
    const user = auth.currentUser;
    const descripcion = document.getElementById('dev-school-desc')?.value?.trim() || null;
    const initialStatus = await getInitialStatus();

    const schoolData = {
      nombre: name,
      descripcion: descripcion,
      coordinates: devSchoolCoords,
      createdBy: user.uid,
      createdByEmail: user.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: initialStatus
    };

    await db.collection('pending_schools').add(schoolData);

    showDevToast('Escuela propuesta correctamente', 'success');
    deactivateSchoolMode();
  } catch (error) {
    console.error('[Spotter] Error guardando escuela:', error);
    showDevToast('Error al guardar: ' + error.message, 'error');
  }
}

// ============================================
// MODO SECTOR (DIBUJO DE POLÍGONO)
// ============================================

/**
 * Activa el modo de dibujo de sector
 */
function activateSectorMode() {
  deactivateAllModes();
  devSectorMode = true;
  devSectorVertices = [];

  const btn = document.getElementById('btn-dev-editor');
  if (btn) {
    btn.style.background = '#06b6d4';
    btn.style.color = 'white';
  }

  showDevToast('Haz clic en el mapa para dibujar el contorno del sector. Doble clic para cerrar.', 'info');

  if (mlMap) {
    mlMap.on('click', handleSectorMapClick);
    mlMap.on('dblclick', handleSectorMapDblClick);
    mlMap.getCanvas().style.cursor = 'crosshair';

    // Crear source y capas para preview
    if (!mlMap.getSource(DEV_SECTOR_SOURCE)) {
      mlMap.addSource(DEV_SECTOR_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      mlMap.addLayer({
        id: DEV_SECTOR_LINE_LAYER,
        type: 'line',
        source: DEV_SECTOR_SOURCE,
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': '#06b6d4',
          'line-width': 3,
          'line-dasharray': [3, 2]
        }
      });

      mlMap.addLayer({
        id: DEV_SECTOR_VERTEX_LAYER,
        type: 'circle',
        source: DEV_SECTOR_SOURCE,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 6,
          'circle-color': 'white',
          'circle-stroke-color': '#06b6d4',
          'circle-stroke-width': 2
        }
      });
    }

    showSectorToolbar();
  }
}

/**
 * Desactiva el modo sector
 */
function deactivateSectorMode() {
  devSectorMode = false;
  devSectorVertices = [];

  const btn = document.getElementById('btn-dev-editor');
  if (btn) {
    btn.style.background = 'white';
    btn.style.color = '#333';
  }

  if (mlMap) {
    mlMap.off('click', handleSectorMapClick);
    mlMap.off('dblclick', handleSectorMapDblClick);
    mlMap.getCanvas().style.cursor = '';

    // Limpiar capas
    if (mlMap.getLayer(DEV_SECTOR_LINE_LAYER)) mlMap.removeLayer(DEV_SECTOR_LINE_LAYER);
    if (mlMap.getLayer(DEV_SECTOR_VERTEX_LAYER)) mlMap.removeLayer(DEV_SECTOR_VERTEX_LAYER);
    if (mlMap.getSource(DEV_SECTOR_SOURCE)) mlMap.removeSource(DEV_SECTOR_SOURCE);
  }

  hideSectorToolbar();
  closeSectorModal();
}

/**
 * Maneja clic para añadir vértice del sector
 */
function handleSectorMapClick(e) {
  if (e.originalEvent && e.originalEvent.target !== mlMap.getCanvas()) return;

  const coords = [e.lngLat.lng, e.lngLat.lat];
  devSectorVertices.push(coords);
  updateSectorDrawPreview();
}

/**
 * Maneja doble clic para cerrar el polígono
 */
function handleSectorMapDblClick(e) {
  e.preventDefault();
  if (devSectorVertices.length < 3) {
    showDevToast('Se necesitan al menos 3 puntos para cerrar el sector', 'warning');
    return;
  }
  finishSectorDraw();
}

/**
 * Actualiza la preview del contorno en el mapa
 */
function updateSectorDrawPreview() {
  if (!mlMap || !mlMap.getSource(DEV_SECTOR_SOURCE)) return;

  const features = [];

  // Línea del contorno
  if (devSectorVertices.length >= 2) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: devSectorVertices
      },
      properties: {}
    });
  }

  // Puntos de vértices
  devSectorVertices.forEach((v, i) => {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: v },
      properties: { index: i }
    });
  });

  mlMap.getSource(DEV_SECTOR_SOURCE).setData({
    type: 'FeatureCollection',
    features: features
  });
}

/**
 * Cierra el polígono y muestra el formulario
 */
function finishSectorDraw() {
  if (devSectorVertices.length < 3) return;

  mlMap.getSource(DEV_SECTOR_SOURCE).setData({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: devSectorVertices },
      properties: {}
    }]
  });

  // Desactivar listeners de dibujo
  mlMap.off('click', handleSectorMapClick);
  mlMap.off('dblclick', handleSectorMapDblClick);
  mlMap.getCanvas().style.cursor = '';

  hideSectorToolbar();
  showSectorModal();
}

/**
 * Deshace el último vértice dibujado
 */
function undoSectorVertex() {
  if (devSectorVertices.length > 0) {
    devSectorVertices.pop();
    updateSectorDrawPreview();
  }
}

/**
 * Muestra la toolbar flotante durante el dibujo del sector
 */
function showSectorToolbar() {
  hideSectorToolbar();
  const toolbar = document.createElement('div');
  toolbar.id = 'dev-sector-toolbar';
  toolbar.className = 'dev-sector-toolbar';
  toolbar.innerHTML = `
    <button onclick="undoSectorVertex()">Deshacer punto</button>
    <button onclick="finishSectorDraw()">Cerrar poligono</button>
    <button onclick="deactivateSectorMode()">Cancelar</button>
  `;
  document.getElementById('map').appendChild(toolbar);
}

function hideSectorToolbar() {
  const toolbar = document.getElementById('dev-sector-toolbar');
  if (toolbar) toolbar.remove();
}

/**
 * Muestra modal para datos del sector
 */
function showSectorModal() {
  closeSectorModal();

  const modal = document.createElement('div');
  modal.id = 'dev-sector-modal';
  modal.className = 'dev-route-modal-overlay';
  modal.innerHTML = `
    <div class="dev-route-modal">
      <div class="dev-route-modal-header">
        <h3>Nuevo Sector</h3>
        <button class="dev-modal-close" onclick="closeSectorModal()">&times;</button>
      </div>
      <div class="dev-route-modal-body">
        <div class="dev-form-group">
          <label for="dev-sector-name">Nombre del sector *</label>
          <input type="text" id="dev-sector-name" placeholder="Ej: Sector Norte" required>
        </div>
        <div class="dev-form-row">
          <div class="dev-form-group">
            <label for="dev-sector-restr">Restriccion</label>
            <select id="dev-sector-restr" onchange="toggleSectorDates()">
              <option value="NO">NO</option>
              <option value="SI">SI</option>
            </select>
          </div>
          <div class="dev-form-group">
            <label for="dev-sector-expo">Exposicion</label>
            <select id="dev-sector-expo">
              <option value="">Sin especificar</option>
              <option value="Sol mañana">Sol mañana</option>
              <option value="Sol tarde">Sol tarde</option>
              <option value="Sol total">Sol total</option>
              <option value="Sombra">Sombra</option>
            </select>
          </div>
        </div>
        <div class="dev-form-row" id="dev-sector-dates" style="display:none;">
          <div class="dev-form-group">
            <label for="dev-sector-date-start">Fecha inicio (DD-MM)</label>
            <input type="text" id="dev-sector-date-start" placeholder="Ej: 01-02">
          </div>
          <div class="dev-form-group">
            <label for="dev-sector-date-end">Fecha fin (DD-MM)</label>
            <input type="text" id="dev-sector-date-end" placeholder="Ej: 30-06">
          </div>
        </div>
      </div>
      <div class="dev-route-modal-footer">
        <button class="dev-btn-cancel" onclick="closeSectorModal()">Cancelar</button>
        <button class="dev-btn-save" onclick="saveSector()">Guardar Sector</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('dev-sector-name')?.focus(), 100);
}

function closeSectorModal() {
  const modal = document.getElementById('dev-sector-modal');
  if (modal) modal.remove();
}

/**
 * Muestra/oculta campos de fechas según restricción
 */
function toggleSectorDates() {
  const restr = document.getElementById('dev-sector-restr')?.value;
  const dates = document.getElementById('dev-sector-dates');
  if (dates) dates.style.display = restr === 'SI' ? 'grid' : 'none';
}

/**
 * Guarda el sector en Firestore
 */
async function saveSector() {
  const name = document.getElementById('dev-sector-name')?.value?.trim();
  if (!name) {
    showDevToast('El nombre del sector es obligatorio', 'error');
    return;
  }
  if (devSectorVertices.length < 3) {
    showDevToast('Se necesitan al menos 3 puntos para definir un sector', 'error');
    return;
  }

  try {
    const user = auth.currentUser;
    const restr = document.getElementById('dev-sector-restr')?.value || 'NO';
    const expo = document.getElementById('dev-sector-expo')?.value || null;
    const dateStart = document.getElementById('dev-sector-date-start')?.value?.trim() || null;
    const dateEnd = document.getElementById('dev-sector-date-end')?.value?.trim() || null;
    const initialStatus = await getInitialStatus();

    // Guardar vértices como array de objetos {lng, lat}
    // (Firestore no soporta arrays anidados como [[[lng,lat],...]])
    const closedVertices = devSectorVertices
      .map(v => ({ lng: v[0], lat: v[1] }));

    const sectorData = {
      nombre: name,
      restr: restr,
      exposicion: expo,
      Fecha_inicio: restr === 'SI' ? dateStart : null,
      Fecha_fin: restr === 'SI' ? dateEnd : null,
      geometryType: 'MultiLineString',
      vertices: closedVertices,
      schoolId: mlCurrentSchool || null,
      createdBy: user.uid,
      createdByEmail: user.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: initialStatus
    };

    await db.collection('pending_sectors').add(sectorData);

    showDevToast('Sector propuesto correctamente', 'success');
    deactivateSectorMode();

    // Preguntar si quiere añadir foto (sector nuevo → sin imagen seguro)
    const schoolId = mlCurrentSchool || sectorData.schoolId;
    promptSectorPhoto(schoolId, name, null);

  } catch (error) {
    console.error('[Spotter] Error guardando sector:', error);
    showDevToast('Error al guardar: ' + error.message, 'error');
  }
}

// ============================================
// FOTO DEL SECTOR — PROMPT AL SPOTTER
// ============================================

/**
 * Muestra un diálogo preguntando si el Spotter quiere añadir foto al sector.
 * @param {string} schoolId
 * @param {string} sectorName
 * @param {Function|null} onNo  Callback ejecutado si el usuario dice No
 */
function promptSectorPhoto(schoolId, sectorName, onNo) {
  const existing = document.getElementById('spotter-sector-photo-prompt');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'spotter-sector-photo-prompt';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;
    display:flex;align-items:center;justify-content:center;padding:20px;
  `;

  overlay.innerHTML = `
    <div style="
      background:#fff;border-radius:16px;padding:24px 20px;max-width:340px;width:100%;
      box-shadow:0 8px 32px rgba(0,0,0,0.18);text-align:center;
    ">
      <div style="font-size:36px;margin-bottom:12px;">📷</div>
      <h3 style="margin:0 0 8px;font-size:17px;font-weight:700;color:#111827;">
        Este sector no tiene foto
      </h3>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.5;">
        ¿Quieres añadir una imagen para el sector <strong>${sectorName}</strong>?
      </p>
      <div style="display:flex;gap:10px;">
        <button id="spotter-photo-no"
          style="flex:1;padding:12px;border:1.5px solid #d1d5db;border-radius:10px;background:#fff;
                 font-size:15px;font-weight:600;color:#374151;cursor:pointer;">
          No, gracias
        </button>
        <button id="spotter-photo-yes"
          style="flex:1;padding:12px;border:none;border-radius:10px;
                 background:linear-gradient(135deg,#7c3aed,#a855f7);
                 font-size:15px;font-weight:600;color:#fff;cursor:pointer;">
          Sí, añadir
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  overlay.querySelector('#spotter-photo-yes').addEventListener('click', () => {
    close();
    if (typeof window.showSectorUploadModal === 'function') {
      window.showSectorUploadModal(schoolId, encodeURIComponent(sectorName));
    }
  });

  overlay.querySelector('#spotter-photo-no').addEventListener('click', () => {
    close();
    if (typeof onNo === 'function') onNo();
  });

  // Cerrar al tocar fuera del card
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { close(); if (typeof onNo === 'function') onNo(); }
  });
}

// ============================================
// UTILIDADES UI
// ============================================

/**
 * Muestra un toast de notificación
 */
function showDevToast(message, type = 'info') {
  // Remover toast existente
  const existing = document.querySelector('.dev-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `dev-toast dev-toast-${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  // Auto-remover después de 4 segundos
  setTimeout(() => {
    toast.classList.add('dev-toast-hide');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================
// INICIALIZACIÓN
// ============================================

/**
 * Inicializa la herramienta de desarrollador
 */
let _devEditorInitialized = false;
async function initDevRouteEditor() {
  if (_devEditorInitialized) return;
  if (typeof auth === 'undefined' || typeof db === 'undefined') {
    setTimeout(initDevRouteEditor, 500);
    return;
  }
  _devEditorInitialized = true;
  console.log('[DevEditor] init iniciado');

  // Esperar a que Firebase Auth termine de restaurar la sesión.
  try {
    if (typeof waitForAuthReady === 'function') {
      await waitForAuthReady();
      console.log('[DevEditor] waitForAuthReady resuelto, currentUser:', auth.currentUser ? auth.currentUser.uid : 'null');
    }
  } catch (e) {
    console.warn('[DevEditor] waitForAuthReady falló:', e);
  }

  // Intento inmediato si ya hay usuario.
  if (auth.currentUser) {
    await addDevEditorButton();
  }

  // Listener permanente de cambios de auth (login/logout/restauración tardía).
  auth.onAuthStateChanged(async (user) => {
    console.log('[DevEditor] onAuthStateChanged:', user ? user.uid : 'null');
    if (user) {
      // Invalidar caché de rol al cambiar de usuario
      _devEditorRoleCache = { ts: 0, hasAccess: false };
      await addDevEditorButton();
    } else {
      _devEditorRoleCache = { ts: 0, hasAccess: false };
      const btn = document.getElementById('btn-dev-editor');
      if (btn) btn.style.display = 'none';
    }
  });

  // Si el mapa se reinicializa, reasignar listeners y restaurar el botón.
  window.addEventListener('maplibre:ready', async () => {
    if (typeof mlMap !== 'undefined' && mlMap) {
      mlMap.on('zoom', updateDevButtonVisibility);
      mlMap.on('zoomend', updateDevButtonVisibility);
      mlMap.on('moveend', updateDevButtonVisibility);
    }
    if (auth.currentUser) {
      await addDevEditorButton();
    }
  });

  // Watchdog permanente: cada 5s comprueba que si hay usuario con acceso,
  // el botón existe en el DOM. Si no, lo recrea. Cubre cualquier flujo
  // raro (mapa reinicializado, error transitorio de Firestore, listener
  // de auth no disparado, etc.).
  setInterval(async () => {
    if (!auth.currentUser) return;
    if (document.getElementById('btn-dev-editor')) return;
    console.log('[DevEditor] Watchdog: botón ausente con usuario logueado, reintentando');
    await addDevEditorButton();
  }, 5000);
}

// Auto-inicializar cuando el DOM esté listo. No esperamos a mlMap porque
// addDevEditorButton solo necesita el div #map, y el listener maplibre:ready
// se encarga de los listeners de zoom cuando el mapa exista.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initDevRouteEditor());
} else {
  initDevRouteEditor();
}

// Exponer funciones globalmente
window.toggleDevMode = toggleDevMode;
window.closeDevRouteModal = closeDevRouteModal;
window.saveDevRoute = saveDevRoute;
window.exportPendingRoutesAsGeoJSON = exportPendingRoutesAsGeoJSON;
window.loadPendingRoutesFromFirestore = loadPendingRoutesFromFirestore;

// Menú Spotter
window.toggleSpotterMenu = toggleSpotterMenu;
window.selectSpotterOption = selectSpotterOption;
window.togglePOIAccordion = togglePOIAccordion;
window.togglePOISection = togglePOISection;
window.selectPOIType = selectPOIType;

// Modo POI
window.closePOIModal = closePOIModal;
window.savePOI = savePOI;

// Modo Escuela
window.closeSchoolModal = closeSchoolModal;
window.saveSchool = saveSchool;

// Modo Sector
window.closeSectorModal = closeSectorModal;
window.saveSector = saveSector;
window.undoSectorVertex = undoSectorVertex;
window.finishSectorDraw = finishSectorDraw;
window.toggleSectorDates = toggleSectorDates;

console.log('[Spotter] Modulo cargado');
