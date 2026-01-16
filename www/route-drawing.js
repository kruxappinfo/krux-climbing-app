/**
 * Route Drawing Module - Dibujo de Vías en Imágenes de Sector
 *
 * Funcionalidades:
 * - Dibujar líneas de vías sobre imágenes de sectores
 * - Vincular vías de Firestore con dibujos en la imagen
 * - Editor visual estilo La Pirca / Climb Around
 * - Solo disponible para administradores
 */

// ============================================
// VARIABLES GLOBALES
// ============================================
let rdCanvas = null;                    // Canvas para dibujar
let rdCtx = null;                       // Contexto 2D del canvas
let rdImage = null;                     // Imagen del sector cargada
let rdCurrentSector = null;             // {schoolId, sectorName}
let rdDrawingMode = false;              // Modo de dibujo activo
let rdCurrentRoute = null;              // Vía actual siendo dibujada/editada
let rdRouteDrawings = [];               // Array de dibujos guardados
let rdDrawingPoints = [];               // Array de puntos del dibujo actual
let rdRoutesList = [];                  // Lista de vías del sector
let rdPendingRouteInfo = null;          // Info de vía pendiente {routeName, docId} - para modo obligatorio
let rdMandatoryDrawingMode = false;     // Modo dibujo obligatorio (no se puede cerrar sin dibujar)

// Colores para el dibujo
const RD_COLORS = {
  normal: '#10b981',        // Verde para vías normales
  selected: '#f59e0b',      // Ámbar para vía seleccionada
  highlight: '#ef4444',     // Rojo para highlight
  point: '#ffffff',         // Blanco para puntos
  number: '#ffffff'         // Blanco para números
};

// ============================================
// VERIFICACIÓN DE ADMIN
// ============================================

/**
 * Verifica si el usuario actual es admin
 */
async function isRouteDrawingAdmin() {
  try {
    const user = auth.currentUser;
    if (!user) return false;

    const adminDoc = await db.collection('admins').doc(user.uid).get();
    return adminDoc.exists && adminDoc.data().role === 'admin';
  } catch (error) {
    console.error('[RouteDrawing] Error verificando admin:', error);
    return false;
  }
}

// ============================================
// ABRIR EDITOR DE DIBUJO
// ============================================

/**
 * Abre el editor de dibujo para un sector
 * @param {string} schoolId - ID de la escuela
 * @param {string} sectorName - Nombre del sector
 * @param {string} imageId - ID de la imagen específica (opcional, para galería)
 */
async function openRouteDrawingEditor(schoolId, sectorName, imageId = null) {
  // Verificar permisos
  const isAdmin = await isRouteDrawingAdmin();
  if (!isAdmin) {
    showRDToast('Solo los administradores pueden dibujar vías', 'error');
    return;
  }

  let imageUrl = null;

  // Si hay imageId, obtener la imagen específica de la galería
  if (imageId && typeof getSectorGalleryImages === 'function') {
    const images = await getSectorGalleryImages(schoolId, sectorName);
    const targetImage = images.find(img => img.id === imageId);
    if (targetImage) {
      imageUrl = targetImage.url;
    }
  }

  // Si no hay imageId o no se encontró, obtener la primera imagen
  if (!imageUrl) {
    imageUrl = await getSectorImageUrl(schoolId, sectorName);
  }

  if (!imageUrl) {
    showRDToast('No hay imagen disponible para este sector', 'error');
    return;
  }

  rdCurrentSector = { schoolId, sectorName, imageId };

  // Cargar vías del sector
  await loadSectorRoutes(schoolId, sectorName);

  // Cargar dibujos existentes (filtrados por imagen si hay imageId)
  await loadRouteDrawings(schoolId, sectorName, imageId);

  // Crear el editor
  createDrawingEditor(imageUrl);
}

/**
 * Abre el editor desde un popup de vía (para vincular vía específica)
 * @param {string} routeName - Nombre de la vía
 */
async function openDrawingEditorForRoute(routeName) {
  if (!mlCurrentSchool) {
    showRDToast('No se puede determinar la escuela actual', 'error');
    return;
  }

  // Obtener datos de la vía
  const routeData = await getRouteData(mlCurrentSchool, routeName);
  if (!routeData || !routeData.sector) {
    showRDToast('No se pudo obtener información de la vía', 'error');
    return;
  }

  // Abrir editor para ese sector
  await openRouteDrawingEditor(mlCurrentSchool, routeData.sector);

  // Seleccionar la vía automáticamente
  setTimeout(() => {
    selectRouteForDrawing(routeName);
  }, 500);
}

/**
 * Abre el editor de dibujo para una vía PENDIENTE recién creada (modo obligatorio)
 * En este modo el usuario DEBE dibujar la vía, si cancela se elimina la vía pendiente
 * @param {string} schoolId - ID de la escuela
 * @param {string} sectorName - Nombre del sector
 * @param {string} routeName - Nombre de la vía
 * @param {string} docId - ID del documento en Firestore
 */
async function openRouteDrawingEditorForPendingRoute(schoolId, sectorName, routeName, docId) {
  // Verificar permisos
  const isAdmin = await isRouteDrawingAdmin();
  if (!isAdmin) {
    showRDToast('Solo los administradores pueden dibujar vías', 'error');
    return;
  }

  // Verificar que existe imagen del sector
  const imageUrl = await getSectorImageUrl(schoolId, sectorName);
  if (!imageUrl) {
    showRDToast('No hay imagen disponible para este sector', 'error');
    return;
  }

  // Guardar info de la vía pendiente
  rdPendingRouteInfo = {
    routeName: routeName,
    docId: docId,
    schoolId: schoolId,
    sectorName: sectorName
  };
  rdMandatoryDrawingMode = true;

  rdCurrentSector = { schoolId, sectorName };

  // Cargar vías del sector (incluyendo la pendiente)
  await loadSectorRoutesWithPending(schoolId, sectorName, routeName);

  // Cargar dibujos existentes
  await loadRouteDrawings(schoolId, sectorName);

  // Crear el editor con modo obligatorio
  createDrawingEditorMandatory(imageUrl, routeName);
}

/**
 * Carga vías del sector incluyendo una vía pendiente específica
 */
async function loadSectorRoutesWithPending(schoolId, sectorName, pendingRouteName) {
  rdRoutesList = [];

  const school = MAPLIBRE_SCHOOLS[schoolId];
  if (!school || !school.geojson || !school.geojson.vias) {
    // Solo añadir la vía pendiente
    rdRoutesList = [{
      nombre: pendingRouteName,
      grado: '?',
      sector: sectorName,
      isPending: true
    }];
    return;
  }

  try {
    const response = await fetch(school.geojson.vias + '?v=' + Date.now());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const geojson = await response.json();

    if (geojson.features) {
      rdRoutesList = geojson.features
        .filter(f => f.properties.sector === sectorName)
        .map(f => ({
          nombre: f.properties.nombre,
          grado: f.properties.grado1 || '?',
          sector: f.properties.sector,
          coordinates: f.geometry.coordinates[0] || f.geometry.coordinates
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
    }

    // Añadir la vía pendiente si no está ya en la lista
    const existingRoute = rdRoutesList.find(r => r.nombre === pendingRouteName);
    if (!existingRoute) {
      // Obtener datos de la vía pendiente desde Firestore
      const pendingDoc = await db.collection('pending_routes').doc(rdPendingRouteInfo.docId).get();
      if (pendingDoc.exists) {
        const pendingData = pendingDoc.data();
        rdRoutesList.unshift({
          nombre: pendingRouteName,
          grado: pendingData.grado1 || '?',
          sector: sectorName,
          isPending: true
        });
      }
    }

    console.log('[RouteDrawing] Vías cargadas (con pendiente):', rdRoutesList.length);
  } catch (error) {
    console.error('[RouteDrawing] Error cargando vías:', error);
    // Añadir al menos la vía pendiente
    rdRoutesList = [{
      nombre: pendingRouteName,
      grado: '?',
      sector: sectorName,
      isPending: true
    }];
  }
}

/**
 * Crea el editor de dibujo en modo obligatorio (para vías pendientes)
 * Solo muestra la vía nueva, sin panel lateral de otras vías
 */
function createDrawingEditorMandatory(imageUrl, pendingRouteName) {
  // Cerrar visor de sector si está abierto
  if (typeof closeSectorImageViewer === 'function') {
    closeSectorImageViewer();
  }

  // Obtener el grado de la vía pendiente
  const pendingRoute = rdRoutesList.find(r => r.nombre === pendingRouteName);
  const gradeColor = pendingRoute ? getGradeColor(pendingRoute.grado) : '#10b981';
  const gradeText = pendingRoute ? pendingRoute.grado : '?';

  const editor = document.createElement('div');
  editor.id = 'rd-editor';
  editor.className = 'rd-editor-overlay';
  editor.innerHTML = `
    <div class="rd-editor-container rd-editor-mandatory-simple">
      <!-- Header simplificado con info de la vía -->
      <div class="rd-editor-header rd-mandatory-header">
        <div class="rd-header-left">
          <h2>${pendingRouteName}</h2>
          <span class="rd-route-grade-header" style="background-color: ${gradeColor}">${gradeText}</span>
          <span class="rd-mandatory-badge">Dibujo obligatorio</span>
        </div>
        <div class="rd-header-actions">
          <button class="rd-btn-icon" onclick="rdResetView()" title="Resetear vista">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="1 4 1 10 7 10"/>
              <polyline points="23 20 23 14 17 14"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
          </button>
          <button class="rd-btn-icon rd-btn-cancel-mandatory" onclick="rdCancelMandatoryDrawing()" title="Cancelar (eliminará la vía)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Canvas Container (ocupa todo el ancho) -->
      <div class="rd-canvas-container rd-canvas-full" id="rd-canvas-container">
        <canvas id="rd-canvas"></canvas>
      </div>

      <!-- Instrucciones flotantes con énfasis -->
      <div class="rd-instructions rd-instructions-mandatory" id="rd-instructions">
        <p>Toca en la imagen para dibujar la línea de la vía. Mínimo 2 puntos.</p>
      </div>

      <!-- Controles de dibujo -->
      <div class="rd-drawing-controls" id="rd-drawing-controls" style="display: flex;">
        <button class="rd-btn-control rd-btn-undo" onclick="rdUndoLastPoint()" id="rd-btn-undo" disabled title="Deshacer último punto">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 7v6h6"/>
            <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
          </svg>
          Deshacer
        </button>
        <button class="rd-btn-control rd-btn-finish" onclick="rdFinishDrawing()" id="rd-btn-finish" disabled title="Terminar y guardar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Terminar
        </button>
        <button class="rd-btn-control rd-btn-cancel" onclick="rdCancelDrawing()" title="Borrar puntos">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Borrar puntos
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(editor);

  // Cargar imagen y configurar canvas
  setupCanvas(imageUrl);

  // Auto-seleccionar la vía pendiente para empezar a dibujar inmediatamente
  setTimeout(() => {
    selectRouteForDrawingMandatory(pendingRouteName);
  }, 300);
}

/**
 * Renderiza la lista de vías con la pendiente destacada
 */
function renderRoutesListMandatory(pendingRouteName) {
  if (rdRoutesList.length === 0) {
    return '<p class="rd-empty-message">No hay vías en este sector</p>';
  }

  return rdRoutesList.map(route => {
    const hasDrawing = rdRouteDrawings.find(d => d.routeName === route.nombre);
    const gradeColor = getGradeColor(route.grado);
    const isPendingRoute = route.nombre === pendingRouteName;

    return `
      <div class="rd-route-item ${hasDrawing ? 'rd-has-drawing' : ''} ${isPendingRoute ? 'rd-pending-route' : ''}"
           onclick="selectRouteForDrawingMandatory('${encodeURIComponent(route.nombre)}')">
        <div class="rd-route-info">
          <span class="rd-route-name">${route.nombre}</span>
          <span class="rd-route-grade" style="background-color: ${gradeColor}">${route.grado}</span>
          ${isPendingRoute ? '<span class="rd-new-badge">NUEVA</span>' : ''}
        </div>
        ${hasDrawing && !isPendingRoute ? `
          <button class="rd-btn-delete" onclick="event.stopPropagation(); deleteRouteDrawing('${encodeURIComponent(route.nombre)}')" title="Eliminar dibujo">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        ` : ''}
      </div>
    `;
  }).join('');
}

/**
 * Selecciona una vía para dibujar en modo obligatorio
 */
function selectRouteForDrawingMandatory(encodedName) {
  const routeName = decodeURIComponent(encodedName);
  const route = rdRoutesList.find(r => r.nombre === routeName);

  if (!route) return;

  // En modo obligatorio solo permitir dibujar la vía pendiente
  if (rdMandatoryDrawingMode && rdPendingRouteInfo && route.nombre !== rdPendingRouteInfo.routeName) {
    showRDToast('Primero debes dibujar la vía nueva antes de poder dibujar otras', 'warning');
    return;
  }

  // Verificar si ya existe un dibujo
  const existingDrawing = rdRouteDrawings.find(d => d.routeName === routeName);
  if (existingDrawing) {
    showRDToast('Esta vía ya tiene un dibujo. Elimínalo primero para redibujar.', 'warning');
    rdCurrentRoute = route;
    redrawCanvas();
    return;
  }

  // Activar modo de dibujo
  rdCurrentRoute = route;
  rdDrawingMode = true;
  rdDrawingPoints = [];

  updateInstructions(`Dibujando: ${route.nombre} (${route.grado}). Toca para añadir el primer punto.`);
  updateDrawingControls();

  console.log('[RouteDrawing] Vía seleccionada (modo obligatorio):', routeName);
}

/**
 * Cancela el modo de dibujo obligatorio y elimina la vía pendiente
 */
async function rdCancelMandatoryDrawing() {
  if (!rdMandatoryDrawingMode || !rdPendingRouteInfo) {
    closeRouteDrawingEditor();
    return;
  }

  // Confirmar cancelación
  const confirmed = confirm(`¿Estás seguro de cancelar?\n\nLa vía "${rdPendingRouteInfo.routeName}" será ELIMINADA porque no se ha dibujado en la imagen.`);

  if (!confirmed) return;

  const routeNameToRemove = rdPendingRouteInfo.routeName;

  try {
    // Eliminar la vía pendiente de Firestore
    await db.collection('pending_routes').doc(rdPendingRouteInfo.docId).delete();

    // También eliminar del mapa temporal si existe
    removePendingRouteFromMap(routeNameToRemove);

    showRDToast('Vía eliminada porque no se dibujó', 'warning');

    console.log('[RouteDrawing] Vía pendiente eliminada:', routeNameToRemove);
  } catch (error) {
    console.error('[RouteDrawing] Error eliminando vía pendiente:', error);
    showRDToast('Error al eliminar la vía: ' + error.message, 'error');
  }

  // Limpiar y cerrar
  rdPendingRouteInfo = null;
  rdMandatoryDrawingMode = false;
  closeRouteDrawingEditor();
}

/**
 * Elimina una vía pendiente del mapa temporal
 */
function removePendingRouteFromMap(routeName) {
  if (!mlMap) return;

  const sourceId = 'dev-temp-routes';
  const source = mlMap.getSource(sourceId);

  if (!source) return;

  try {
    const data = source._data || { type: 'FeatureCollection', features: [] };

    // Filtrar para remover la vía por nombre
    data.features = data.features.filter(f => f.properties.nombre !== routeName);

    source.setData(data);
    console.log('[RouteDrawing] Vía removida del mapa temporal:', routeName);
  } catch (error) {
    console.error('[RouteDrawing] Error removiendo vía del mapa:', error);
  }
}

// ============================================
// CARGA DE DATOS
// ============================================

/**
 * Carga todas las vías de un sector
 */
async function loadSectorRoutes(schoolId, sectorName) {
  rdRoutesList = [];

  const school = MAPLIBRE_SCHOOLS[schoolId];
  if (!school || !school.geojson || !school.geojson.vias) return;

  try {
    const response = await fetch(school.geojson.vias + '?v=' + Date.now());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const geojson = await response.json();

    if (geojson.features) {
      rdRoutesList = geojson.features
        .filter(f => f.properties.sector === sectorName)
        .map(f => ({
          nombre: f.properties.nombre,
          grado: f.properties.grado1 || '?',
          sector: f.properties.sector,
          coordinates: f.geometry.coordinates[0] || f.geometry.coordinates
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
    }

    console.log('[RouteDrawing] Vías cargadas:', rdRoutesList.length);
  } catch (error) {
    console.error('[RouteDrawing] Error cargando vías:', error);
  }
}

/**
 * Obtiene datos de una vía específica
 */
async function getRouteData(schoolId, routeName) {
  const school = MAPLIBRE_SCHOOLS[schoolId];
  if (!school || !school.geojson || !school.geojson.vias) return null;

  try {
    const response = await fetch(school.geojson.vias + '?v=' + Date.now());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const geojson = await response.json();
    const feature = geojson.features.find(f => f.properties.nombre === routeName);

    return feature ? {
      nombre: feature.properties.nombre,
      grado: feature.properties.grado1 || '?',
      sector: feature.properties.sector,
      coordinates: feature.geometry.coordinates[0] || feature.geometry.coordinates
    } : null;
  } catch (error) {
    console.error('[RouteDrawing] Error obteniendo vía:', error);
    return null;
  }
}

/**
 * Carga dibujos existentes de Firestore
 * @param {string} imageId - ID de imagen específica para filtrar (opcional)
 */
async function loadRouteDrawings(schoolId, sectorName, imageId = null) {
  rdRouteDrawings = [];

  try {
    const docId = `${schoolId}_${normalizeSectorName(sectorName)}`;
    const doc = await db.collection('sector_route_drawings').doc(docId).get();

    if (doc.exists) {
      const data = doc.data();
      let allDrawings = data.drawings || [];

      // Si hay imageId, filtrar solo los dibujos de esa imagen
      if (imageId) {
        rdRouteDrawings = allDrawings.filter(d => {
          // Dibujos con imageId coincidente
          if (d.imageId) {
            return d.imageId === imageId;
          }
          // Dibujos sin imageId pertenecen a 'legacy_0' (primera imagen)
          return imageId === 'legacy_0';
        });
        console.log('[RouteDrawing] Dibujos filtrados para imagen', imageId, ':', rdRouteDrawings.length);
      } else {
        rdRouteDrawings = allDrawings;
        console.log('[RouteDrawing] Todos los dibujos cargados:', rdRouteDrawings.length);
      }
    }
  } catch (error) {
    console.error('[RouteDrawing] Error cargando dibujos:', error);
  }
}

// ============================================
// CREAR EDITOR
// ============================================

/**
 * Crea el editor de dibujo
 */
function createDrawingEditor(imageUrl) {
  // Cerrar visor de sector si está abierto
  if (typeof closeSectorImageViewer === 'function') {
    closeSectorImageViewer();
  }

  const editor = document.createElement('div');
  editor.id = 'rd-editor';
  editor.className = 'rd-editor-overlay';
  editor.innerHTML = `
    <div class="rd-editor-container">
      <!-- Header -->
      <div class="rd-editor-header">
        <div class="rd-header-left">
          <h2>${rdCurrentSector.sectorName}</h2>
          <span class="rd-route-count">${rdRoutesList.length} vías</span>
        </div>
        <div class="rd-header-actions">
          <button class="rd-btn-icon" onclick="rdToggleRouteList()" title="Lista de vías">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6"/>
              <line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/>
              <line x1="3" y1="12" x2="3.01" y2="12"/>
              <line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </button>
          <button class="rd-btn-icon" onclick="rdResetView()" title="Resetear vista">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="1 4 1 10 7 10"/>
              <polyline points="23 20 23 14 17 14"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
          </button>
          <button class="rd-btn-icon" onclick="closeRouteDrawingEditor()" title="Cerrar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Canvas Container -->
      <div class="rd-canvas-container" id="rd-canvas-container">
        <canvas id="rd-canvas"></canvas>
      </div>

      <!-- Panel lateral de vías (colapsable) -->
      <div class="rd-routes-panel" id="rd-routes-panel">
        <div class="rd-panel-header">
          <h3>Vías del Sector</h3>
          <button class="rd-btn-icon" onclick="rdToggleRouteList()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        </div>
        <div class="rd-panel-search">
          <input type="text" id="rd-route-search" placeholder="Buscar vía..." oninput="rdFilterRoutes()">
        </div>
        <div class="rd-panel-list" id="rd-route-list">
          ${renderRoutesList()}
        </div>
      </div>

      <!-- Instrucciones flotantes -->
      <div class="rd-instructions" id="rd-instructions">
        <p>Selecciona una vía de la lista para dibujar su línea en la imagen</p>
      </div>

      <!-- Controles de dibujo (ocultos por defecto) -->
      <div class="rd-drawing-controls" id="rd-drawing-controls" style="display: none;">
        <button class="rd-btn-control rd-btn-undo" onclick="rdUndoLastPoint()" id="rd-btn-undo" disabled title="Deshacer último punto">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 7v6h6"/>
            <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
          </svg>
          Deshacer
        </button>
        <button class="rd-btn-control rd-btn-finish" onclick="rdFinishDrawing()" id="rd-btn-finish" disabled title="Terminar y guardar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Terminar
        </button>
        <button class="rd-btn-control rd-btn-cancel" onclick="rdCancelDrawing()" title="Cancelar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Cancelar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(editor);

  // Cargar imagen y configurar canvas
  setupCanvas(imageUrl);
}

/**
 * Renderiza la lista de vías
 */
function renderRoutesList() {
  if (rdRoutesList.length === 0) {
    return '<p class="rd-empty-message">No hay vías en este sector</p>';
  }

  return rdRoutesList.map(route => {
    const hasDrawing = rdRouteDrawings.find(d => d.routeName === route.nombre);
    const gradeColor = getGradeColor(route.grado);

    return `
      <div class="rd-route-item ${hasDrawing ? 'rd-has-drawing' : ''}" onclick="selectRouteForDrawing('${encodeURIComponent(route.nombre)}')">
        <div class="rd-route-info">
          <span class="rd-route-name">${route.nombre}</span>
          <span class="rd-route-grade" style="background-color: ${gradeColor}">${route.grado}</span>
        </div>
        ${hasDrawing ? `
          <button class="rd-btn-delete" onclick="event.stopPropagation(); deleteRouteDrawing('${encodeURIComponent(route.nombre)}')" title="Eliminar dibujo">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        ` : ''}
      </div>
    `;
  }).join('');
}

// ============================================
// SETUP CANVAS
// ============================================

/**
 * Configura el canvas y carga la imagen
 */
function setupCanvas(imageUrl) {
  rdCanvas = document.getElementById('rd-canvas');
  rdCtx = rdCanvas.getContext('2d');

  // Cargar imagen
  rdImage = new Image();
  rdImage.crossOrigin = 'anonymous';
  rdImage.onload = () => {
    initializeCanvas();
    redrawCanvas();
  };
  rdImage.onerror = () => {
    showRDToast('Error cargando la imagen', 'error');
  };
  rdImage.src = imageUrl;

  // Event listeners del canvas
  rdCanvas.addEventListener('mousedown', handleCanvasMouseDown);
  rdCanvas.addEventListener('touchstart', handleCanvasTouchStart, { passive: false });
}

/**
 * Inicializa el tamaño del canvas
 */
function initializeCanvas() {
  const container = document.getElementById('rd-canvas-container');
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;

  // Ajustar canvas al tamaño del contenedor manteniendo aspect ratio
  const imgAspect = rdImage.width / rdImage.height;
  const containerAspect = containerWidth / containerHeight;

  if (containerAspect > imgAspect) {
    // Contenedor más ancho - ajustar por altura
    rdCanvas.height = containerHeight;
    rdCanvas.width = containerHeight * imgAspect;
  } else {
    // Contenedor más alto - ajustar por ancho
    rdCanvas.width = containerWidth;
    rdCanvas.height = containerWidth / imgAspect;
  }

  console.log('[RouteDrawing] Canvas inicializado:', rdCanvas.width, 'x', rdCanvas.height);
}

// ============================================
// DIBUJO EN CANVAS
// ============================================

/**
 * Redibuja todo el canvas
 */
function redrawCanvas() {
  if (!rdCanvas || !rdCtx || !rdImage) return;

  // Limpiar
  rdCtx.clearRect(0, 0, rdCanvas.width, rdCanvas.height);

  // Dibujar imagen de fondo
  rdCtx.drawImage(rdImage, 0, 0, rdCanvas.width, rdCanvas.height);

  // PASO 1: Dibujar TODAS las líneas primero
  rdRouteDrawings.forEach((drawing, index) => {
    const isSelected = rdCurrentRoute && drawing.routeName === rdCurrentRoute.nombre;
    drawRouteLineOnly(drawing, isSelected);
  });

  // PASO 2: Dibujar TODOS los puntos encima (para que no queden tapados)
  rdRouteDrawings.forEach((drawing, index) => {
    const isSelected = rdCurrentRoute && drawing.routeName === rdCurrentRoute.nombre;
    drawRoutePointOnly(drawing, isSelected);
  });

  // Dibujar línea temporal si estamos dibujando
  if (rdDrawingMode && rdDrawingPoints.length > 0) {
    drawTemporaryLine();
  }
}

/**
 * Obtiene los puntos escalados y el color de un dibujo
 */
function getRouteDrawingData(drawing, isSelected) {
  const scaleX = rdCanvas.width / rdImage.width;
  const scaleY = rdCanvas.height / rdImage.height;

  const route = rdRoutesList.find(r => r.nombre === drawing.routeName);
  const gradeColor = route && typeof getGradeColor === 'function'
    ? getGradeColor(route.grado)
    : RD_COLORS.normal;

  const color = isSelected ? RD_COLORS.selected : gradeColor;

  let points = [];
  if (drawing.points && drawing.points.length > 0) {
    points = drawing.points;
  } else if (drawing.startPoint && drawing.endPoint) {
    points = [drawing.startPoint, drawing.endPoint];
  } else {
    return null;
  }

  const scaledPoints = points.map(p => ({
    x: p.x * scaleX,
    y: p.y * scaleY
  }));

  return { scaledPoints, color, isSelected };
}

/**
 * Dibuja solo la LÍNEA de una vía (sin el punto)
 */
function drawRouteLineOnly(drawing, isSelected) {
  const data = getRouteDrawingData(drawing, isSelected);
  if (!data) return;

  const { scaledPoints, color } = data;

  // Dibujar borde/sombra para mejor visibilidad
  rdCtx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  rdCtx.lineWidth = isSelected ? 7 : 6;
  rdCtx.lineCap = 'round';
  rdCtx.lineJoin = 'round';
  rdCtx.setLineDash([]);

  rdCtx.beginPath();
  rdCtx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
  for (let i = 1; i < scaledPoints.length; i++) {
    rdCtx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
  }
  rdCtx.stroke();

  // Dibujar línea principal con color del grado
  rdCtx.strokeStyle = color;
  rdCtx.lineWidth = isSelected ? 4 : 3;
  rdCtx.lineCap = 'round';
  rdCtx.lineJoin = 'round';
  rdCtx.setLineDash([]);

  rdCtx.beginPath();
  rdCtx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
  for (let i = 1; i < scaledPoints.length; i++) {
    rdCtx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
  }
  rdCtx.stroke();
}

/**
 * Dibuja solo el PUNTO de inicio de una vía
 */
function drawRoutePointOnly(drawing, isSelected) {
  const data = getRouteDrawingData(drawing, isSelected);
  if (!data) return;

  const { scaledPoints, color } = data;
  drawNumber(scaledPoints[0].x, scaledPoints[0].y, 0, color);
}

/**
 * Dibuja un punto circular
 */
function drawPoint(x, y, color, radius) {
  rdCtx.fillStyle = RD_COLORS.point;
  rdCtx.strokeStyle = color;
  rdCtx.lineWidth = 3;

  rdCtx.beginPath();
  rdCtx.arc(x, y, radius, 0, Math.PI * 2);
  rdCtx.fill();
  rdCtx.stroke();
}

/**
 * Dibuja un punto pequeño de inicio (sin número)
 */
function drawNumber(x, y, number, bgColor) {
  const radius = 6; // Punto pequeño

  // Borde oscuro para contraste
  rdCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  rdCtx.beginPath();
  rdCtx.arc(x, y, radius + 2, 0, Math.PI * 2);
  rdCtx.fill();

  // Punto de color
  rdCtx.fillStyle = bgColor;
  rdCtx.beginPath();
  rdCtx.arc(x, y, radius, 0, Math.PI * 2);
  rdCtx.fill();
}

// ============================================
// INTERACCIÓN CON CANVAS
// ============================================

/**
 * Maneja clic del mouse en el canvas
 */
function handleCanvasMouseDown(e) {
  if (!rdDrawingMode || !rdCurrentRoute) return;

  const rect = rdCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (rdCanvas.width / rect.width);
  const y = (e.clientY - rect.top) * (rdCanvas.height / rect.height);

  handleDrawingPoint(x, y);
}

/**
 * Maneja toque táctil en el canvas
 */
function handleCanvasTouchStart(e) {
  if (!rdDrawingMode || !rdCurrentRoute) return;

  e.preventDefault();
  const rect = rdCanvas.getBoundingClientRect();
  const touch = e.touches[0];
  const x = (touch.clientX - rect.left) * (rdCanvas.width / rect.width);
  const y = (touch.clientY - rect.top) * (rdCanvas.height / rect.height);

  handleDrawingPoint(x, y);
}

/**
 * Maneja un punto de dibujo
 */
function handleDrawingPoint(x, y) {
  // Normalizar coordenadas a escala de imagen original
  const normalizedX = x / rdCanvas.width * rdImage.width;
  const normalizedY = y / rdCanvas.height * rdImage.height;

  // Añadir punto al array
  rdDrawingPoints.push({ x: normalizedX, y: normalizedY });

  // Actualizar UI
  updateDrawingControls();

  if (rdDrawingPoints.length === 1) {
    updateInstructions(`Punto ${rdDrawingPoints.length} añadido. Toca para añadir más puntos o haz click en "Terminar".`);
  } else {
    updateInstructions(`Punto ${rdDrawingPoints.length} añadido. Continúa añadiendo puntos o haz click en "Terminar".`);
  }

  // Redibujar para mostrar preview
  redrawCanvas();
}

/**
 * Dibuja la línea temporal mientras se está dibujando
 */
function drawTemporaryLine() {
  if (rdDrawingPoints.length === 0) return;

  const scaleX = rdCanvas.width / rdImage.width;
  const scaleY = rdCanvas.height / rdImage.height;

  const scaledPoints = rdDrawingPoints.map(p => ({
    x: p.x * scaleX,
    y: p.y * scaleY
  }));

  const color = RD_COLORS.selected; // Usar color de selección para preview

  // Dibujar línea temporal
  rdCtx.strokeStyle = color;
  rdCtx.lineWidth = 3;
  rdCtx.lineCap = 'round';
  rdCtx.lineJoin = 'round';
  rdCtx.setLineDash([5, 5]); // Línea punteada para indicar que es temporal

  rdCtx.beginPath();
  rdCtx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
  for (let i = 1; i < scaledPoints.length; i++) {
    rdCtx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
  }
  rdCtx.stroke();

  // Dibujar puntos
  scaledPoints.forEach((point, index) => {
    drawPoint(point.x, point.y, color, index === 0 ? 8 : 6);
  });

  // Reset line dash
  rdCtx.setLineDash([]);
}

/**
 * Actualiza el estado de los botones de control
 */
function updateDrawingControls() {
  const controlsDiv = document.getElementById('rd-drawing-controls');
  const undoBtn = document.getElementById('rd-btn-undo');
  const finishBtn = document.getElementById('rd-btn-finish');

  if (rdDrawingMode) {
    controlsDiv.style.display = 'flex';
    undoBtn.disabled = rdDrawingPoints.length === 0;
    finishBtn.disabled = rdDrawingPoints.length < 2; // Mínimo 2 puntos
  } else {
    controlsDiv.style.display = 'none';
  }
}

/**
 * Deshace el último punto añadido
 */
function rdUndoLastPoint() {
  if (rdDrawingPoints.length > 0) {
    rdDrawingPoints.pop();
    updateDrawingControls();

    if (rdDrawingPoints.length === 0) {
      updateInstructions(`Dibujando: ${rdCurrentRoute.nombre} (${rdCurrentRoute.grado}). Toca para añadir el primer punto.`);
    } else {
      updateInstructions(`Punto eliminado. Tienes ${rdDrawingPoints.length} punto(s). Continúa o haz click en "Terminar".`);
    }

    redrawCanvas();
  }
}

/**
 * Termina el dibujo y lo guarda
 */
async function rdFinishDrawing() {
  if (rdDrawingPoints.length < 2) {
    showRDToast('Se requieren al menos 2 puntos para guardar', 'warning');
    return;
  }

  const drawing = {
    routeName: rdCurrentRoute.nombre,
    points: rdDrawingPoints, // Nuevo formato: array de puntos
    createdAt: new Date().toISOString(),
    createdBy: auth.currentUser?.uid
  };

  // Guardar dibujo
  await saveRouteDrawing(drawing);

  // Resetear estado de dibujo
  rdDrawingPoints = [];
  rdDrawingMode = false;
  rdCurrentRoute = null;
  updateDrawingControls();

  // Si estábamos en modo obligatorio, cerrar el editor después de guardar exitosamente
  if (rdMandatoryDrawingMode && rdPendingRouteInfo) {
    showRDToast('Vía añadida correctamente con su dibujo', 'success');

    // Limpiar estado de modo obligatorio
    rdPendingRouteInfo = null;
    rdMandatoryDrawingMode = false;

    // Cerrar el editor después de un breve delay para que el usuario vea el mensaje
    setTimeout(() => {
      closeRouteDrawingEditor();
    }, 1500);
  } else {
    updateInstructions('Dibujo guardado. Selecciona otra vía para continuar.');
  }
}

/**
 * Cancela el dibujo actual
 */
function rdCancelDrawing() {
  rdDrawingPoints = [];
  rdDrawingMode = false;
  rdCurrentRoute = null;
  updateDrawingControls();

  updateInstructions('Dibujo cancelado. Selecciona una vía para comenzar.');
  redrawCanvas();
}

// ============================================
// SELECCIÓN DE VÍAS
// ============================================

/**
 * Selecciona una vía para dibujar
 */
function selectRouteForDrawing(encodedName) {
  const routeName = decodeURIComponent(encodedName);
  const route = rdRoutesList.find(r => r.nombre === routeName);

  if (!route) return;

  // Verificar si ya existe un dibujo
  const existingDrawing = rdRouteDrawings.find(d => d.routeName === routeName);
  if (existingDrawing) {
    showRDToast('Esta vía ya tiene un dibujo. Elimínalo primero para redibujar.', 'warning');
    rdCurrentRoute = route;
    redrawCanvas();
    return;
  }

  // Activar modo de dibujo
  rdCurrentRoute = route;
  rdDrawingMode = true;
  rdDrawingPoints = [];

  updateInstructions(`Dibujando: ${route.nombre} (${route.grado}). Toca para añadir el primer punto.`);
  updateDrawingControls();

  console.log('[RouteDrawing] Vía seleccionada:', routeName);
}

// ============================================
// GUARDAR Y ELIMINAR DIBUJOS
// ============================================

/**
 * Guarda un dibujo en Firestore
 * Ahora incluye imageId para soportar múltiples imágenes por sector
 */
async function saveRouteDrawing(drawing) {
  try {
    const docId = `${rdCurrentSector.schoolId}_${normalizeSectorName(rdCurrentSector.sectorName)}`;

    // Añadir imageId al dibujo si estamos editando una imagen específica
    if (rdCurrentSector.imageId) {
      drawing.imageId = rdCurrentSector.imageId;
    }

    // Añadir a array local
    rdRouteDrawings.push(drawing);

    // Obtener TODOS los dibujos existentes (de todas las imágenes)
    const docRef = db.collection('sector_route_drawings').doc(docId);
    const doc = await docRef.get();

    let allDrawings = [];
    if (doc.exists) {
      const data = doc.data();
      allDrawings = data.drawings || [];

      // Si hay imageId, reemplazar solo los dibujos de esta imagen
      if (rdCurrentSector.imageId) {
        // Mantener dibujos de otras imágenes
        allDrawings = allDrawings.filter(d => d.imageId !== rdCurrentSector.imageId);
        // Añadir los dibujos actuales de esta imagen
        allDrawings = allDrawings.concat(rdRouteDrawings);
      } else {
        // Modo legacy: reemplazar todos
        allDrawings = rdRouteDrawings;
      }
    } else {
      allDrawings = rdRouteDrawings;
    }

    // Guardar en Firestore
    await docRef.set({
      schoolId: rdCurrentSector.schoolId,
      sectorName: rdCurrentSector.sectorName,
      drawings: allDrawings,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: auth.currentUser?.uid
    }, { merge: true });

    showRDToast('Dibujo guardado correctamente', 'success');

    // Actualizar lista de vías
    document.getElementById('rd-route-list').innerHTML = renderRoutesList();

    // Redibujar
    redrawCanvas();

  } catch (error) {
    console.error('[RouteDrawing] Error guardando dibujo:', error);
    showRDToast('Error al guardar: ' + error.message, 'error');
    // Revertir cambio local
    rdRouteDrawings.pop();
  }
}

/**
 * Elimina un dibujo
 */
async function deleteRouteDrawing(encodedName) {
  const routeName = decodeURIComponent(encodedName);

  if (!confirm(`¿Eliminar dibujo de "${routeName}"?`)) return;

  try {
    const docId = `${rdCurrentSector.schoolId}_${normalizeSectorName(rdCurrentSector.sectorName)}`;

    // Remover del array local
    rdRouteDrawings = rdRouteDrawings.filter(d => d.routeName !== routeName);

    // Actualizar Firestore
    await db.collection('sector_route_drawings').doc(docId).set({
      schoolId: rdCurrentSector.schoolId,
      sectorName: rdCurrentSector.sectorName,
      drawings: rdRouteDrawings,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: auth.currentUser?.uid
    }, { merge: true });

    showRDToast('Dibujo eliminado', 'success');

    // Actualizar lista
    document.getElementById('rd-route-list').innerHTML = renderRoutesList();

    // Redibujar
    redrawCanvas();

  } catch (error) {
    console.error('[RouteDrawing] Error eliminando dibujo:', error);
    showRDToast('Error al eliminar: ' + error.message, 'error');
  }
}

// ============================================
// FUNCIONES DE UI
// ============================================

/**
 * Cierra el editor
 */
function closeRouteDrawingEditor() {
  const editor = document.getElementById('rd-editor');
  if (editor) {
    editor.remove();
  }

  // Limpiar estado
  rdCanvas = null;
  rdCtx = null;
  rdImage = null;
  rdCurrentSector = null;
  rdDrawingMode = false;
  rdCurrentRoute = null;
  rdRouteDrawings = [];
  rdDrawingPoints = [];
  rdRoutesList = [];
  rdPendingRouteInfo = null;
  rdMandatoryDrawingMode = false;
}

/**
 * Toggle del panel de vías
 */
function rdToggleRouteList() {
  const panel = document.getElementById('rd-routes-panel');
  panel.classList.toggle('rd-panel-collapsed');
}

/**
 * Filtra las vías por búsqueda
 */
function rdFilterRoutes() {
  const searchTerm = document.getElementById('rd-route-search').value.toLowerCase();
  const items = document.querySelectorAll('.rd-route-item');

  items.forEach(item => {
    const routeName = item.querySelector('.rd-route-name').textContent.toLowerCase();
    if (routeName.includes(searchTerm)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

/**
 * Resetea la vista del canvas
 */
function rdResetView() {
  initializeCanvas();
  redrawCanvas();
  showRDToast('Vista reseteada', 'info');
}

/**
 * Actualiza las instrucciones
 */
function updateInstructions(text) {
  const instructions = document.getElementById('rd-instructions');
  if (instructions) {
    instructions.innerHTML = `<p>${text}</p>`;
  }
}

/**
 * Muestra toast de notificación
 */
function showRDToast(message, type = 'info') {
  const existing = document.querySelector('.rd-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `rd-toast rd-toast-${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('rd-toast-hide');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================
// INTEGRACIÓN CON VISOR DE SECTOR
// ============================================

/**
 * Agrega botón "Dibujar Vías" al visor de imagen de sector
 * Esta función debe ser llamada desde sector-images.js
 */
function addDrawingButtonToSectorViewer(schoolId, sectorName, isAdmin) {
  if (!isAdmin) return '';

  return `
    <button class="sector-viewer-draw-btn" onclick="openRouteDrawingEditor('${schoolId}', '${encodeURIComponent(sectorName)}')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
      Dibujar Vías
    </button>
  `;
}

/**
 * Agrega botón "Vincular con Imagen" al popup de vía
 * Esta función debe ser llamada desde maplibre-map.js
 */
function addLinkDrawingButtonToRoutePopup(routeName, isAdmin) {
  if (!isAdmin) return '';

  return `
    <button class="ml-route-dev-btn" onclick="openDrawingEditorForRoute('${encodeURIComponent(routeName)}')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
      Vincular con imagen
    </button>
  `;
}

// ============================================
// EXPORTAR FUNCIONES
// ============================================

window.openRouteDrawingEditor = openRouteDrawingEditor;
window.openDrawingEditorForRoute = openDrawingEditorForRoute;
window.openRouteDrawingEditorForPendingRoute = openRouteDrawingEditorForPendingRoute;
window.closeRouteDrawingEditor = closeRouteDrawingEditor;
window.selectRouteForDrawing = selectRouteForDrawing;
window.selectRouteForDrawingMandatory = selectRouteForDrawingMandatory;
window.deleteRouteDrawing = deleteRouteDrawing;
window.rdToggleRouteList = rdToggleRouteList;
window.rdFilterRoutes = rdFilterRoutes;
window.rdResetView = rdResetView;
window.rdUndoLastPoint = rdUndoLastPoint;
window.rdFinishDrawing = rdFinishDrawing;
window.rdCancelDrawing = rdCancelDrawing;
window.rdCancelMandatoryDrawing = rdCancelMandatoryDrawing;
window.removePendingRouteFromMap = removePendingRouteFromMap;
window.addDrawingButtonToSectorViewer = addDrawingButtonToSectorViewer;
window.addLinkDrawingButtonToRoutePopup = addLinkDrawingButtonToRoutePopup;

console.log('[RouteDrawing] Módulo cargado');
