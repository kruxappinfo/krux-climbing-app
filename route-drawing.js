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
let rdEditMode = false;                 // Modo edición (editando un dibujo existente)
let rdOriginalDrawing = null;           // Dibujo original siendo editado (para restaurar si se cancela)
let rdDraggingPointIndex = -1;          // Índice del punto siendo arrastrado (-1 = ninguno)
let rdIsDragging = false;               // Si estamos arrastrando un punto
let rdSelectedPointIndex = -1;          // Índice del punto seleccionado para eliminar (-1 = ninguno)

// Constantes para interacción
const RD_POINT_HIT_RADIUS = 20;         // Radio en píxeles para detectar clic en un punto

// Colores para el dibujo
const RD_COLORS = {
  normal: '#10b981',        // Verde para vías normales
  selected: '#f59e0b',      // Ámbar para vía seleccionada
  highlight: '#ef4444',     // Rojo para highlight
  point: '#ffffff',         // Blanco para puntos
  number: '#ffffff'         // Blanco para números
};

// Tipos de reunión (anchor types)
const RD_ANCHOR_TYPES = {
  quimicos: {
    id: 'quimicos',
    name: 'Anillas',
    description: '2 químicos con anillas o maillones'
  },
  cadena: {
    id: 'cadena',
    name: 'Cadena',
    description: 'Reunión con cadena'
  },
  mosqueton: {
    id: 'mosqueton',
    name: 'Mosquetón',
    description: 'Reunión con mosquetón fijo'
  },
  desconocido: {
    id: 'desconocido',
    name: 'Desconocido',
    description: 'Tipo de reunión desconocido'
  }
};

// ============================================
// VERIFICACIÓN DE ADMIN
// ============================================

/**
 * Verifica si el usuario actual es admin o spotter verificado
 */
async function isRouteDrawingAdminOrSpotter() {
  try {
    const user = auth.currentUser;
    if (!user) return false;

    const adminDoc = await db.collection('admins').doc(user.uid).get();
    if (!adminDoc.exists) return false;

    const role = adminDoc.data().role;
    return role === 'admin' || role === 'spotter';
  } catch (error) {
    console.error('[RouteDrawing] Error verificando admin/spotter:', error);
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
  const hasAccess = await isRouteDrawingAdminOrSpotter();
  if (!hasAccess) {
    showRDToast('Solo administradores y spotters pueden dibujar vías', 'error');
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
  const hasAccess = await isRouteDrawingAdminOrSpotter();
  if (!hasAccess) {
    showRDToast('Solo administradores y spotters pueden dibujar vías', 'error');
    return;
  }

  // Obtener TODAS las imágenes del sector
  const images = await getSectorGalleryImages(schoolId, sectorName);
  if (!images || images.length === 0) {
    showRDToast('No hay imagen disponible para este sector', 'error');
    return;
  }

  // Si solo hay una imagen, usarla directamente
  if (images.length === 1) {
    const selectedImage = images[0];
    await continueOpeningPendingRouteEditor(schoolId, sectorName, routeName, docId, selectedImage);
    return;
  }

  // Si hay múltiples imágenes, intentar detectar automáticamente por proximidad
  const bestImage = await detectBestImageByProximity(schoolId, sectorName, docId, images);

  if (bestImage) {
    // Encontramos una imagen probable, usarla directamente
    console.log('[RouteDrawing] Imagen detectada automáticamente por proximidad:', bestImage.id);
    await continueOpeningPendingRouteEditor(schoolId, sectorName, routeName, docId, bestImage);
  } else {
    // No pudimos determinar, mostrar selector manual
    showImageSelectorForPendingRoute(schoolId, sectorName, routeName, docId, images);
  }
}

/**
 * Detecta la mejor imagen para dibujar basándose en la proximidad
 * a otras vías que ya tienen dibujos en ese sector
 * @returns {Object|null} La imagen detectada o null si no se puede determinar
 */
async function detectBestImageByProximity(schoolId, sectorName, docId, images) {
  try {
    // 1. Obtener coordenadas de la vía pendiente desde Firestore
    const pendingDoc = await db.collection('pending_routes').doc(docId).get();
    if (!pendingDoc.exists) {
      console.log('[RouteDrawing] No se encontró la vía pendiente');
      return null;
    }

    const pendingData = pendingDoc.data();
    const pendingCoords = pendingData.coordinates; // [lng, lat]
    if (!pendingCoords || pendingCoords.length < 2) {
      console.log('[RouteDrawing] La vía pendiente no tiene coordenadas');
      return null;
    }

    // 2. Cargar todas las vías del sector con sus coordenadas
    const school = MAPLIBRE_SCHOOLS[schoolId];
    if (!school || !school.geojson || !school.geojson.vias) {
      return null;
    }

    const response = await fetch(school.geojson.vias + '?v=' + Date.now());
    if (!response.ok) return null;

    const geojson = await response.json();
    const sectorRoutes = geojson.features
      .filter(f => f.properties.sector === sectorName)
      .map(f => ({
        nombre: f.properties.nombre,
        coordinates: f.geometry.coordinates[0] || f.geometry.coordinates
      }));

    if (sectorRoutes.length === 0) {
      console.log('[RouteDrawing] No hay otras vías en el sector');
      return null;
    }

    // 3. Cargar TODOS los dibujos del sector (sin filtrar por imagen)
    const drawingsDocId = `${schoolId}_${normalizeSectorName(sectorName)}`;
    const drawingsDoc = await db.collection('sector_route_drawings').doc(drawingsDocId).get();

    if (!drawingsDoc.exists) {
      console.log('[RouteDrawing] No hay dibujos existentes en el sector');
      return null;
    }

    const allDrawings = drawingsDoc.data().drawings || [];
    if (allDrawings.length === 0) {
      console.log('[RouteDrawing] No hay dibujos guardados');
      return null;
    }

    // 4. Crear un mapa de nombre de vía -> imageId
    const routeToImageMap = {};
    allDrawings.forEach(drawing => {
      if (drawing.routeName) {
        // Si no tiene imageId, asumimos 'legacy_0' (primera imagen)
        routeToImageMap[drawing.routeName] = drawing.imageId || 'legacy_0';
      }
    });

    // 5. Calcular distancias a vías que tienen dibujo
    const routesWithDrawings = sectorRoutes.filter(r => routeToImageMap[r.nombre]);

    if (routesWithDrawings.length === 0) {
      console.log('[RouteDrawing] Ninguna vía del sector tiene dibujo aún');
      return null;
    }

    // Calcular distancia a cada vía con dibujo
    const distances = routesWithDrawings.map(route => {
      const routeCoords = route.coordinates;
      // Distancia euclidiana simple (suficiente para proximidad local)
      const dist = Math.sqrt(
        Math.pow(pendingCoords[0] - routeCoords[0], 2) +
        Math.pow(pendingCoords[1] - routeCoords[1], 2)
      );
      return {
        routeName: route.nombre,
        imageId: routeToImageMap[route.nombre],
        distance: dist
      };
    });

    // Ordenar por distancia
    distances.sort((a, b) => a.distance - b.distance);

    // 6. Tomar las 3 vías más cercanas y ver qué imagen domina
    const topN = distances.slice(0, 3);
    const imageVotes = {};

    topN.forEach(item => {
      imageVotes[item.imageId] = (imageVotes[item.imageId] || 0) + 1;
    });

    // Encontrar la imagen con más votos
    let bestImageId = null;
    let maxVotes = 0;

    for (const [imageId, votes] of Object.entries(imageVotes)) {
      if (votes > maxVotes) {
        maxVotes = votes;
        bestImageId = imageId;
      }
    }

    // Si la vía más cercana está muy cerca (umbral de ~50m en grados ≈ 0.0005)
    // y tiene el mismo imageId que el ganador, confiar más en el resultado
    const closestDistance = distances[0].distance;
    const isVeryClose = closestDistance < 0.0005;

    console.log('[RouteDrawing] Análisis de proximidad:', {
      pendingCoords,
      topRoutes: topN,
      imageVotes,
      bestImageId,
      closestDistance,
      isVeryClose
    });

    // Si la vía más cercana está muy cerca O hay consenso (mayoría), usar esa imagen
    if (isVeryClose || maxVotes >= 2) {
      const selectedImage = images.find(img => img.id === bestImageId);
      if (selectedImage) {
        return selectedImage;
      }
    }

    // Si no hay suficiente confianza, devolver null para mostrar selector manual
    console.log('[RouteDrawing] No hay suficiente confianza para auto-seleccionar imagen');
    return null;

  } catch (error) {
    console.error('[RouteDrawing] Error detectando imagen por proximidad:', error);
    return null;
  }
}

/**
 * Muestra selector de imagen cuando hay múltiples imágenes en el sector
 */
function showImageSelectorForPendingRoute(schoolId, sectorName, routeName, docId, images) {
  const modal = document.createElement('div');
  modal.id = 'rd-image-selector-modal';
  modal.className = 'rd-image-selector-overlay';
  modal.innerHTML = `
    <div class="rd-image-selector-container">
      <div class="rd-image-selector-header">
        <h3>Selecciona la foto donde dibujar la vía</h3>
        <p class="rd-image-selector-subtitle">${routeName}</p>
      </div>
      <div class="rd-image-selector-grid">
        ${images.map((img, index) => `
          <div class="rd-image-selector-item" onclick="selectImageForPendingRoute('${schoolId}', '${encodeURIComponent(sectorName)}', '${encodeURIComponent(routeName)}', '${docId}', '${img.id}', '${encodeURIComponent(img.url)}')">
            <img src="${img.url}" alt="Foto ${index + 1}">
            <span class="rd-image-selector-number">${index + 1}</span>
          </div>
        `).join('')}
      </div>
      <button class="rd-image-selector-cancel" onclick="closeImageSelectorModal()">Cancelar</button>
    </div>
  `;
  document.body.appendChild(modal);
}

/**
 * Cierra el modal de selector de imagen
 */
function closeImageSelectorModal() {
  const modal = document.getElementById('rd-image-selector-modal');
  if (modal) modal.remove();
}

/**
 * Callback cuando se selecciona una imagen del selector
 */
async function selectImageForPendingRoute(schoolId, encodedSectorName, encodedRouteName, docId, imageId, encodedImageUrl) {
  closeImageSelectorModal();

  const sectorName = decodeURIComponent(encodedSectorName);
  const routeName = decodeURIComponent(encodedRouteName);
  const imageUrl = decodeURIComponent(encodedImageUrl);

  const selectedImage = { id: imageId, url: imageUrl };
  await continueOpeningPendingRouteEditor(schoolId, sectorName, routeName, docId, selectedImage);
}

/**
 * Continúa abriendo el editor después de seleccionar imagen
 */
async function continueOpeningPendingRouteEditor(schoolId, sectorName, routeName, docId, selectedImage) {
  // Guardar info de la vía pendiente
  rdPendingRouteInfo = {
    routeName: routeName,
    docId: docId,
    schoolId: schoolId,
    sectorName: sectorName,
    imageId: selectedImage.id  // Guardar el imageId seleccionado
  };
  rdMandatoryDrawingMode = true;

  rdCurrentSector = { schoolId, sectorName, imageId: selectedImage.id };

  // Cargar vías del sector (incluyendo la pendiente)
  await loadSectorRoutesWithPending(schoolId, sectorName, routeName);

  // Cargar dibujos existentes FILTRADOS por la imagen seleccionada
  await loadRouteDrawings(schoolId, sectorName, selectedImage.id);

  // Crear el editor con modo obligatorio
  createDrawingEditorMandatory(selectedImage.url, routeName);
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
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
          <button class="rd-btn-icon rd-btn-routes-toggle" onclick="rdToggleRouteList()" title="Lista de vías">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6"/>
              <line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/>
              <line x1="3" y1="12" x2="3.01" y2="12"/>
              <line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </button>
          <button class="rd-btn-icon rd-btn-reset" onclick="rdResetView()" title="Resetear vista">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 11-9-9"/>
              <polyline points="21 3 21 9 15 9"/>
            </svg>
          </button>
          <button class="rd-btn-icon rd-btn-close" onclick="closeRouteDrawingEditor()" title="Cerrar editor">
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
        <div class="rd-route-status">
          ${hasDrawing ? `
            <span class="rd-status-icon rd-status-drawn" title="Dibujo completado">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </span>
          ` : `
            <span class="rd-status-icon rd-status-pending" title="Sin dibujar - Click para dibujar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </span>
          `}
        </div>
        <div class="rd-route-info">
          <span class="rd-route-name">${route.nombre}</span>
          <span class="rd-route-grade" style="background-color: ${gradeColor}">${route.grado}</span>
        </div>
        ${hasDrawing ? `
          <div class="rd-route-actions">
            <button class="rd-btn-edit" onclick="event.stopPropagation(); editRouteDrawing('${encodeURIComponent(route.nombre)}')" title="Editar dibujo">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </button>
            <button class="rd-btn-delete" onclick="event.stopPropagation(); deleteRouteDrawing('${encodeURIComponent(route.nombre)}')" title="Eliminar dibujo">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
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
  rdCanvas.addEventListener('mousemove', handleCanvasMouseMove);
  rdCanvas.addEventListener('mouseup', handleCanvasMouseUp);
  rdCanvas.addEventListener('mouseleave', handleCanvasMouseUp);
  rdCanvas.addEventListener('dblclick', handleCanvasDoubleClick);
  rdCanvas.addEventListener('touchstart', handleCanvasTouchStart, { passive: false });
  rdCanvas.addEventListener('touchmove', handleCanvasTouchMove, { passive: false });
  rdCanvas.addEventListener('touchend', handleCanvasTouchEnd);
  rdCanvas.addEventListener('touchcancel', handleCanvasTouchEnd);
}

/**
 * Inicializa el tamaño del canvas con soporte para pantallas de alta densidad (retina/móvil)
 */
function initializeCanvas() {
  const container = document.getElementById('rd-canvas-container');
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;

  // Obtener el ratio de píxeles del dispositivo para pantallas de alta densidad
  const dpr = window.devicePixelRatio || 1;

  // Ajustar canvas al tamaño del contenedor manteniendo aspect ratio
  const imgAspect = rdImage.width / rdImage.height;
  const containerAspect = containerWidth / containerHeight;

  let displayWidth, displayHeight;

  if (containerAspect > imgAspect) {
    // Contenedor más ancho - ajustar por altura
    displayHeight = containerHeight;
    displayWidth = containerHeight * imgAspect;
  } else {
    // Contenedor más alto - ajustar por ancho
    displayWidth = containerWidth;
    displayHeight = containerWidth / imgAspect;
  }

  // Establecer el tamaño interno del canvas (mayor resolución para nitidez)
  rdCanvas.width = displayWidth * dpr;
  rdCanvas.height = displayHeight * dpr;

  // Establecer el tamaño visual del canvas via CSS
  rdCanvas.style.width = displayWidth + 'px';
  rdCanvas.style.height = displayHeight + 'px';

  // Escalar el contexto para que las operaciones de dibujo sean en coordenadas lógicas
  rdCtx.scale(dpr, dpr);

  // Guardar el DPR para uso en otras funciones
  rdCanvas.dpr = dpr;
  rdCanvas.displayWidth = displayWidth;
  rdCanvas.displayHeight = displayHeight;

  console.log('[RouteDrawing] Canvas inicializado:', displayWidth, 'x', displayHeight, '@ DPR:', dpr);
}

// ============================================
// DIBUJO EN CANVAS
// ============================================

/**
 * Redibuja todo el canvas
 */
function redrawCanvas() {
  if (!rdCanvas || !rdCtx || !rdImage) return;

  const dpr = rdCanvas.dpr || 1;
  const displayWidth = rdCanvas.displayWidth || rdCanvas.width;
  const displayHeight = rdCanvas.displayHeight || rdCanvas.height;

  // Resetear transformaciones y limpiar
  rdCtx.setTransform(1, 0, 0, 1, 0, 0);
  rdCtx.clearRect(0, 0, rdCanvas.width, rdCanvas.height);

  // Restaurar escala para DPR
  rdCtx.scale(dpr, dpr);

  // Dibujar imagen de fondo usando dimensiones lógicas
  rdCtx.drawImage(rdImage, 0, 0, displayWidth, displayHeight);

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
  // Usar dimensiones lógicas para el escalado (sin DPR)
  const displayWidth = rdCanvas.displayWidth || rdCanvas.width;
  const displayHeight = rdCanvas.displayHeight || rdCanvas.height;
  const scaleX = displayWidth / rdImage.width;
  const scaleY = displayHeight / rdImage.height;

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

  // Dibujar icono de reunión al final de la vía si existe
  if (drawing.anchorType && scaledPoints.length >= 2) {
    const lastPoint = scaledPoints[scaledPoints.length - 1];
    const prevPoint = scaledPoints[scaledPoints.length - 2];
    drawAnchorIcon(lastPoint.x, lastPoint.y, prevPoint.x, prevPoint.y, drawing.anchorType, color);
  }
}

/**
 * Dibuja el icono de reunión al final de la vía
 * @param {number} x - Coordenada X del punto final
 * @param {number} y - Coordenada Y del punto final
 * @param {number} prevX - Coordenada X del punto anterior (para calcular dirección)
 * @param {number} prevY - Coordenada Y del punto anterior
 * @param {string} anchorType - Tipo de reunión (quimicos, cadena, mosqueton)
 * @param {string} color - Color del icono (igual que la línea de la vía)
 */
function drawAnchorIcon(x, y, prevX, prevY, anchorType, color) {
  const iconSize = 14; // Tamaño reducido del icono

  rdCtx.save();

  // Trasladar al punto final (sin rotación - siempre mira hacia arriba)
  rdCtx.translate(x, y);

  // Dibujar según el tipo de reunión
  switch(anchorType) {
    case 'quimicos':
      drawAnchorQuimicos(0, 0, iconSize, color);
      break;
    case 'cadena':
      drawAnchorCadena(0, 0, iconSize, color);
      break;
    case 'mosqueton':
      drawAnchorMosqueton(0, 0, iconSize, color);
      break;
    case 'desconocido':
      drawAnchorDesconocido(0, 0, iconSize, color);
      break;
  }

  rdCtx.restore();
}

/**
 * Dibuja reunión de químicos con maillones
 */
function drawAnchorQuimicos(x, y, size, color) {
  const scale = size / 20;
  const outlineWidth = 2 * scale;
  const outlineColor = 'white';

  // Químico izquierdo con contorno
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = outlineWidth + 2;
  rdCtx.beginPath();
  rdCtx.arc(x - 8 * scale, y - 12 * scale, 6 * scale, 0, Math.PI * 2);
  rdCtx.stroke();

  rdCtx.fillStyle = color;
  rdCtx.beginPath();
  rdCtx.arc(x - 8 * scale, y - 12 * scale, 6 * scale, 0, Math.PI * 2);
  rdCtx.fill();
  rdCtx.strokeStyle = 'rgba(0,0,0,0.5)';
  rdCtx.lineWidth = 1;
  rdCtx.stroke();

  // Agujero izquierdo
  rdCtx.fillStyle = 'white';
  rdCtx.beginPath();
  rdCtx.arc(x - 8 * scale, y - 12 * scale, 2.5 * scale, 0, Math.PI * 2);
  rdCtx.fill();

  // Químico derecho con contorno
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = outlineWidth + 2;
  rdCtx.beginPath();
  rdCtx.arc(x + 8 * scale, y - 12 * scale, 6 * scale, 0, Math.PI * 2);
  rdCtx.stroke();

  rdCtx.fillStyle = color;
  rdCtx.beginPath();
  rdCtx.arc(x + 8 * scale, y - 12 * scale, 6 * scale, 0, Math.PI * 2);
  rdCtx.fill();
  rdCtx.strokeStyle = 'rgba(0,0,0,0.5)';
  rdCtx.lineWidth = 1;
  rdCtx.stroke();

  // Agujero derecho
  rdCtx.fillStyle = 'white';
  rdCtx.beginPath();
  rdCtx.arc(x + 8 * scale, y - 12 * scale, 2.5 * scale, 0, Math.PI * 2);
  rdCtx.fill();

  // Maillones/anillas con contorno
  // Maillon izquierdo
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = 4 * scale;
  rdCtx.beginPath();
  rdCtx.ellipse(x - 8 * scale, y - 2 * scale, 3 * scale, 5 * scale, 0, 0, Math.PI * 2);
  rdCtx.stroke();

  rdCtx.strokeStyle = color;
  rdCtx.lineWidth = 2 * scale;
  rdCtx.beginPath();
  rdCtx.ellipse(x - 8 * scale, y - 2 * scale, 3 * scale, 5 * scale, 0, 0, Math.PI * 2);
  rdCtx.stroke();

  // Maillon derecho
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = 4 * scale;
  rdCtx.beginPath();
  rdCtx.ellipse(x + 8 * scale, y - 2 * scale, 3 * scale, 5 * scale, 0, 0, Math.PI * 2);
  rdCtx.stroke();

  rdCtx.strokeStyle = color;
  rdCtx.lineWidth = 2 * scale;
  rdCtx.beginPath();
  rdCtx.ellipse(x + 8 * scale, y - 2 * scale, 3 * scale, 5 * scale, 0, 0, Math.PI * 2);
  rdCtx.stroke();
}

/**
 * Dibuja reunión con cadena
 */
function drawAnchorCadena(x, y, size, color) {
  const scale = size / 20;
  const outlineColor = 'white';

  // Químico izquierdo con contorno
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = 4;
  rdCtx.beginPath();
  rdCtx.arc(x - 14 * scale, y - 14 * scale, 5 * scale, 0, Math.PI * 2);
  rdCtx.stroke();

  rdCtx.fillStyle = color;
  rdCtx.beginPath();
  rdCtx.arc(x - 14 * scale, y - 14 * scale, 5 * scale, 0, Math.PI * 2);
  rdCtx.fill();
  rdCtx.strokeStyle = 'rgba(0,0,0,0.5)';
  rdCtx.lineWidth = 1;
  rdCtx.stroke();

  // Agujero izquierdo
  rdCtx.fillStyle = 'white';
  rdCtx.beginPath();
  rdCtx.arc(x - 14 * scale, y - 14 * scale, 2 * scale, 0, Math.PI * 2);
  rdCtx.fill();

  // Químico derecho con contorno
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = 4;
  rdCtx.beginPath();
  rdCtx.arc(x + 14 * scale, y - 14 * scale, 5 * scale, 0, Math.PI * 2);
  rdCtx.stroke();

  rdCtx.fillStyle = color;
  rdCtx.beginPath();
  rdCtx.arc(x + 14 * scale, y - 14 * scale, 5 * scale, 0, Math.PI * 2);
  rdCtx.fill();
  rdCtx.strokeStyle = 'rgba(0,0,0,0.5)';
  rdCtx.lineWidth = 1;
  rdCtx.stroke();

  // Agujero derecho
  rdCtx.fillStyle = 'white';
  rdCtx.beginPath();
  rdCtx.arc(x + 14 * scale, y - 14 * scale, 2 * scale, 0, Math.PI * 2);
  rdCtx.fill();

  // Eslabones de cadena con contorno
  // Eslabón izquierdo
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = 4 * scale;
  rdCtx.beginPath();
  rdCtx.ellipse(x - 8 * scale, y - 6 * scale, 3 * scale, 5 * scale, Math.PI / 6, 0, Math.PI * 2);
  rdCtx.stroke();

  rdCtx.strokeStyle = color;
  rdCtx.lineWidth = 2 * scale;
  rdCtx.beginPath();
  rdCtx.ellipse(x - 8 * scale, y - 6 * scale, 3 * scale, 5 * scale, Math.PI / 6, 0, Math.PI * 2);
  rdCtx.stroke();

  // Eslabón central
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = 4 * scale;
  rdCtx.beginPath();
  rdCtx.ellipse(x, y - 3 * scale, 4 * scale, 6 * scale, 0, 0, Math.PI * 2);
  rdCtx.stroke();

  rdCtx.strokeStyle = color;
  rdCtx.lineWidth = 2 * scale;
  rdCtx.beginPath();
  rdCtx.ellipse(x, y - 3 * scale, 4 * scale, 6 * scale, 0, 0, Math.PI * 2);
  rdCtx.stroke();

  // Eslabón derecho
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = 4 * scale;
  rdCtx.beginPath();
  rdCtx.ellipse(x + 8 * scale, y - 6 * scale, 3 * scale, 5 * scale, -Math.PI / 6, 0, Math.PI * 2);
  rdCtx.stroke();

  rdCtx.strokeStyle = color;
  rdCtx.lineWidth = 2 * scale;
  rdCtx.beginPath();
  rdCtx.ellipse(x + 8 * scale, y - 6 * scale, 3 * scale, 5 * scale, -Math.PI / 6, 0, Math.PI * 2);
  rdCtx.stroke();
}

/**
 * Dibuja reunión con mosquetón
 */
function drawAnchorMosqueton(x, y, size, color) {
  const scale = size / 20;
  const outlineColor = 'white';

  // Químico izquierdo con contorno
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = 4;
  rdCtx.beginPath();
  rdCtx.arc(x - 8 * scale, y - 20 * scale, 5 * scale, 0, Math.PI * 2);
  rdCtx.stroke();

  rdCtx.fillStyle = color;
  rdCtx.beginPath();
  rdCtx.arc(x - 8 * scale, y - 20 * scale, 5 * scale, 0, Math.PI * 2);
  rdCtx.fill();
  rdCtx.strokeStyle = 'rgba(0,0,0,0.5)';
  rdCtx.lineWidth = 1;
  rdCtx.stroke();

  // Agujero izquierdo
  rdCtx.fillStyle = 'white';
  rdCtx.beginPath();
  rdCtx.arc(x - 8 * scale, y - 20 * scale, 2 * scale, 0, Math.PI * 2);
  rdCtx.fill();

  // Químico derecho con contorno
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = 4;
  rdCtx.beginPath();
  rdCtx.arc(x + 8 * scale, y - 20 * scale, 5 * scale, 0, Math.PI * 2);
  rdCtx.stroke();

  rdCtx.fillStyle = color;
  rdCtx.beginPath();
  rdCtx.arc(x + 8 * scale, y - 20 * scale, 5 * scale, 0, Math.PI * 2);
  rdCtx.fill();
  rdCtx.strokeStyle = 'rgba(0,0,0,0.5)';
  rdCtx.lineWidth = 1;
  rdCtx.stroke();

  // Agujero derecho
  rdCtx.fillStyle = 'white';
  rdCtx.beginPath();
  rdCtx.arc(x + 8 * scale, y - 20 * scale, 2 * scale, 0, Math.PI * 2);
  rdCtx.fill();

  // Eslabones pequeños conectando a químicos (con contorno)
  // Eslabón izquierdo
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = 4 * scale;
  rdCtx.beginPath();
  rdCtx.ellipse(x - 6 * scale, y - 12 * scale, 2.5 * scale, 4 * scale, 0, 0, Math.PI * 2);
  rdCtx.stroke();

  rdCtx.strokeStyle = color;
  rdCtx.lineWidth = 2 * scale;
  rdCtx.beginPath();
  rdCtx.ellipse(x - 6 * scale, y - 12 * scale, 2.5 * scale, 4 * scale, 0, 0, Math.PI * 2);
  rdCtx.stroke();

  // Eslabón derecho
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = 4 * scale;
  rdCtx.beginPath();
  rdCtx.ellipse(x + 6 * scale, y - 12 * scale, 2.5 * scale, 4 * scale, 0, 0, Math.PI * 2);
  rdCtx.stroke();

  rdCtx.strokeStyle = color;
  rdCtx.lineWidth = 2 * scale;
  rdCtx.beginPath();
  rdCtx.ellipse(x + 6 * scale, y - 12 * scale, 2.5 * scale, 4 * scale, 0, 0, Math.PI * 2);
  rdCtx.stroke();

  // Mosquetón central (forma de D) con contorno
  // Contorno blanco primero
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = 5 * scale;
  rdCtx.beginPath();
  rdCtx.moveTo(x - 5 * scale, y - 6 * scale);
  rdCtx.quadraticCurveTo(x - 8 * scale, y + 2 * scale, x, y + 8 * scale);
  rdCtx.quadraticCurveTo(x + 8 * scale, y + 2 * scale, x + 5 * scale, y - 6 * scale);
  rdCtx.lineTo(x - 5 * scale, y - 6 * scale);
  rdCtx.stroke();

  // Mosquetón en color
  rdCtx.strokeStyle = color;
  rdCtx.lineWidth = 2.5 * scale;
  rdCtx.beginPath();
  rdCtx.moveTo(x - 5 * scale, y - 6 * scale);
  rdCtx.quadraticCurveTo(x - 8 * scale, y + 2 * scale, x, y + 8 * scale);
  rdCtx.quadraticCurveTo(x + 8 * scale, y + 2 * scale, x + 5 * scale, y - 6 * scale);
  rdCtx.lineTo(x - 5 * scale, y - 6 * scale);
  rdCtx.stroke();

  // Gate del mosquetón con contorno
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = 2;
  rdCtx.strokeRect(x - 2 * scale - 1, y - 4 * scale - 1, 4 * scale + 2, 6 * scale + 2);

  rdCtx.fillStyle = color;
  rdCtx.fillRect(x - 2 * scale, y - 4 * scale, 4 * scale, 6 * scale);
}

/**
 * Dibuja reunión desconocida (signo de interrogación)
 */
function drawAnchorDesconocido(x, y, size, color) {
  const scale = size / 20;
  const outlineColor = 'white';

  // Círculo de fondo con contorno
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = 4;
  rdCtx.beginPath();
  rdCtx.arc(x, y - 8 * scale, 12 * scale, 0, Math.PI * 2);
  rdCtx.stroke();

  rdCtx.fillStyle = color;
  rdCtx.beginPath();
  rdCtx.arc(x, y - 8 * scale, 12 * scale, 0, Math.PI * 2);
  rdCtx.fill();
  rdCtx.strokeStyle = 'rgba(0,0,0,0.5)';
  rdCtx.lineWidth = 1;
  rdCtx.stroke();

  // Signo de interrogación
  rdCtx.fillStyle = 'white';
  rdCtx.font = `bold ${16 * scale}px Arial`;
  rdCtx.textAlign = 'center';
  rdCtx.textBaseline = 'middle';
  rdCtx.fillText('?', x, y - 8 * scale);
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
 * Obtiene las coordenadas del canvas desde un evento
 */
function getCanvasCoordinates(e, isTouch = false) {
  const rect = rdCanvas.getBoundingClientRect();
  const displayWidth = rdCanvas.displayWidth || rdCanvas.width;
  const displayHeight = rdCanvas.displayHeight || rdCanvas.height;

  let clientX, clientY;
  if (isTouch) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  const x = (clientX - rect.left) * (displayWidth / rect.width);
  const y = (clientY - rect.top) * (displayHeight / rect.height);

  return { x, y };
}

/**
 * Convierte coordenadas de canvas a coordenadas de imagen original
 */
function canvasToImageCoords(canvasX, canvasY) {
  const displayWidth = rdCanvas.displayWidth || rdCanvas.width;
  const displayHeight = rdCanvas.displayHeight || rdCanvas.height;
  return {
    x: canvasX / displayWidth * rdImage.width,
    y: canvasY / displayHeight * rdImage.height
  };
}

/**
 * Convierte coordenadas de imagen original a coordenadas de canvas
 */
function imageToCanvasCoords(imageX, imageY) {
  const displayWidth = rdCanvas.displayWidth || rdCanvas.width;
  const displayHeight = rdCanvas.displayHeight || rdCanvas.height;
  return {
    x: imageX * displayWidth / rdImage.width,
    y: imageY * displayHeight / rdImage.height
  };
}

/**
 * Encuentra el índice del punto más cercano al clic (si está dentro del radio de hit)
 * @returns {number} Índice del punto o -1 si no hay ninguno cercano
 */
function findNearestPointIndex(canvasX, canvasY) {
  if (rdDrawingPoints.length === 0) return -1;

  let nearestIndex = -1;
  let nearestDistance = Infinity;

  for (let i = 0; i < rdDrawingPoints.length; i++) {
    const point = rdDrawingPoints[i];
    const canvasPoint = imageToCanvasCoords(point.x, point.y);
    const distance = Math.sqrt(
      Math.pow(canvasX - canvasPoint.x, 2) +
      Math.pow(canvasY - canvasPoint.y, 2)
    );

    if (distance < nearestDistance && distance <= RD_POINT_HIT_RADIUS) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  }

  return nearestIndex;
}

/**
 * Maneja clic del mouse en el canvas
 */
function handleCanvasMouseDown(e) {
  if (!rdDrawingMode || !rdCurrentRoute) return;

  const { x, y } = getCanvasCoordinates(e);

  // Verificar si estamos haciendo clic en un punto existente para arrastrarlo
  const pointIndex = findNearestPointIndex(x, y);

  if (pointIndex !== -1) {
    // Iniciar arrastre del punto
    rdDraggingPointIndex = pointIndex;
    rdIsDragging = true;
    rdSelectedPointIndex = pointIndex;
    rdCanvas.style.cursor = 'grabbing';
    updateInstructions(`Arrastrando punto ${pointIndex + 1}. Suelta para posicionar.`);
  } else {
    // Añadir nuevo punto
    handleDrawingPoint(x, y);
  }
}

/**
 * Maneja movimiento del mouse en el canvas
 */
function handleCanvasMouseMove(e) {
  if (!rdDrawingMode || !rdCurrentRoute) return;

  const { x, y } = getCanvasCoordinates(e);

  if (rdIsDragging && rdDraggingPointIndex !== -1) {
    // Actualizar posición del punto siendo arrastrado
    const imageCoords = canvasToImageCoords(x, y);
    rdDrawingPoints[rdDraggingPointIndex] = imageCoords;
    redrawCanvas();
  } else {
    // Cambiar cursor si estamos sobre un punto
    const pointIndex = findNearestPointIndex(x, y);
    rdCanvas.style.cursor = pointIndex !== -1 ? 'grab' : 'crosshair';
  }
}

/**
 * Maneja cuando se suelta el mouse
 */
function handleCanvasMouseUp(e) {
  if (rdIsDragging && rdDraggingPointIndex !== -1) {
    showRDToast(`Punto ${rdDraggingPointIndex + 1} movido`, 'success');
    updateInstructions(`Punto movido. Continúa editando o haz clic en "Terminar".`);
  }

  rdIsDragging = false;
  rdDraggingPointIndex = -1;
  rdCanvas.style.cursor = 'crosshair';
  updateDrawingControls();
}

/**
 * Maneja toque táctil en el canvas
 */
function handleCanvasTouchStart(e) {
  if (!rdDrawingMode || !rdCurrentRoute) return;

  e.preventDefault();
  const { x, y } = getCanvasCoordinates(e, true);

  // Verificar si estamos tocando un punto existente para arrastrarlo
  const pointIndex = findNearestPointIndex(x, y);

  if (pointIndex !== -1) {
    // Iniciar arrastre del punto
    rdDraggingPointIndex = pointIndex;
    rdIsDragging = true;
    rdSelectedPointIndex = pointIndex;
    updateInstructions(`Arrastrando punto ${pointIndex + 1}. Suelta para posicionar.`);
  } else {
    // Añadir nuevo punto
    handleDrawingPoint(x, y);
  }
}

/**
 * Maneja movimiento táctil en el canvas
 */
function handleCanvasTouchMove(e) {
  if (!rdDrawingMode || !rdCurrentRoute) return;
  if (!rdIsDragging || rdDraggingPointIndex === -1) return;

  e.preventDefault();
  const { x, y } = getCanvasCoordinates(e, true);

  // Actualizar posición del punto siendo arrastrado
  const imageCoords = canvasToImageCoords(x, y);
  rdDrawingPoints[rdDraggingPointIndex] = imageCoords;
  redrawCanvas();
}

/**
 * Maneja cuando se termina el toque
 */
function handleCanvasTouchEnd(e) {
  if (rdIsDragging && rdDraggingPointIndex !== -1) {
    showRDToast(`Punto ${rdDraggingPointIndex + 1} movido`, 'success');
    updateInstructions(`Punto movido. Continúa editando o haz clic en "Terminar".`);
  }

  rdIsDragging = false;
  rdDraggingPointIndex = -1;
  updateDrawingControls();
}

/**
 * Maneja doble clic en el canvas para eliminar un punto
 */
function handleCanvasDoubleClick(e) {
  if (!rdDrawingMode || !rdCurrentRoute) return;

  const { x, y } = getCanvasCoordinates(e);
  const pointIndex = findNearestPointIndex(x, y);

  if (pointIndex !== -1) {
    rdDeleteSpecificPoint(pointIndex);
  }
}

/**
 * Elimina un punto específico del dibujo
 * @param {number} index - Índice del punto a eliminar
 */
function rdDeleteSpecificPoint(index) {
  if (index < 0 || index >= rdDrawingPoints.length) return;

  // Verificar que quedarían al menos 0 puntos (permitir eliminar todos)
  rdDrawingPoints.splice(index, 1);
  rdSelectedPointIndex = -1;

  showRDToast(`Punto ${index + 1} eliminado`, 'info');

  if (rdDrawingPoints.length === 0) {
    updateInstructions(`Todos los puntos eliminados. Toca para añadir el primer punto.`);
  } else {
    updateInstructions(`Punto eliminado. Quedan ${rdDrawingPoints.length} punto(s). Doble clic para eliminar otro.`);
  }

  updateDrawingControls();
  redrawCanvas();
}

/**
 * Maneja un punto de dibujo (añadir nuevo punto)
 */
function handleDrawingPoint(x, y) {
  // Normalizar coordenadas a escala de imagen original
  const imageCoords = canvasToImageCoords(x, y);

  // Añadir punto al array
  rdDrawingPoints.push(imageCoords);

  // Actualizar UI
  updateDrawingControls();

  if (rdDrawingPoints.length === 1) {
    updateInstructions(`Punto 1 añadido. Toca para añadir más puntos.`);
  } else {
    updateInstructions(`${rdDrawingPoints.length} puntos. Arrastra para mover, doble clic para eliminar.`);
  }

  // Redibujar para mostrar preview
  redrawCanvas();
}

/**
 * Dibuja la línea temporal mientras se está dibujando
 */
function drawTemporaryLine() {
  if (rdDrawingPoints.length === 0) return;

  // Usar dimensiones lógicas para el escalado (sin DPR)
  const displayWidth = rdCanvas.displayWidth || rdCanvas.width;
  const displayHeight = rdCanvas.displayHeight || rdCanvas.height;
  const scaleX = displayWidth / rdImage.width;
  const scaleY = displayHeight / rdImage.height;

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

  // Reset line dash
  rdCtx.setLineDash([]);

  // Dibujar puntos editables (más grandes y con indicador visual)
  scaledPoints.forEach((point, index) => {
    const isBeingDragged = rdIsDragging && rdDraggingPointIndex === index;
    const isSelected = rdSelectedPointIndex === index;
    drawEditablePoint(point.x, point.y, index, color, isBeingDragged, isSelected);
  });
}

/**
 * Dibuja un punto editable con indicadores visuales
 */
function drawEditablePoint(x, y, index, color, isDragging, isSelected) {
  const baseRadius = index === 0 ? 6 : 5; // Puntos más pequeños para mejor edición
  const radius = isDragging ? baseRadius + 2 : baseRadius;

  // Sombra/glow para punto siendo arrastrado
  if (isDragging) {
    rdCtx.fillStyle = 'rgba(245, 158, 11, 0.4)';
    rdCtx.beginPath();
    rdCtx.arc(x, y, radius + 5, 0, Math.PI * 2);
    rdCtx.fill();
  }

  // Borde exterior oscuro para contraste
  rdCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  rdCtx.beginPath();
  rdCtx.arc(x, y, radius + 2, 0, Math.PI * 2);
  rdCtx.fill();

  // Círculo blanco exterior (indica que es arrastrable)
  rdCtx.fillStyle = '#ffffff';
  rdCtx.beginPath();
  rdCtx.arc(x, y, radius + 1, 0, Math.PI * 2);
  rdCtx.fill();

  // Círculo interior con el color
  rdCtx.fillStyle = isDragging ? '#ef4444' : color;
  rdCtx.beginPath();
  rdCtx.arc(x, y, radius, 0, Math.PI * 2);
  rdCtx.fill();
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
 * Termina el dibujo y muestra el selector de tipo de reunión
 */
async function rdFinishDrawing() {
  if (rdDrawingPoints.length < 2) {
    showRDToast('Se requieren al menos 2 puntos para guardar', 'warning');
    return;
  }

  // Mostrar modal para seleccionar tipo de reunión
  showAnchorTypeModal();
}

/**
 * Muestra el modal para seleccionar el tipo de reunión
 */
function showAnchorTypeModal() {
  // Eliminar modal existente si hay uno
  const existing = document.getElementById('rd-anchor-modal');
  if (existing) existing.remove();

  // Obtener el color de la vía actual para previsualización
  const route = rdRoutesList.find(r => r.nombre === rdCurrentRoute.nombre);
  const gradeColor = route && typeof getGradeColor === 'function'
    ? getGradeColor(route.grado)
    : RD_COLORS.normal;

  const modal = document.createElement('div');
  modal.id = 'rd-anchor-modal';
  modal.className = 'rd-modal-overlay';
  modal.innerHTML = `
    <div class="rd-modal-container rd-anchor-modal-container">
      <div class="rd-modal-header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="5" r="3"/>
          <line x1="12" y1="8" x2="12" y2="21"/>
          <path d="M5 12h14"/>
        </svg>
        <h3>Tipo de Reunión</h3>
      </div>
      <div class="rd-modal-body rd-anchor-body">
        <p>Selecciona el tipo de reunión al final de la vía:</p>
        <div class="rd-anchor-options">
          ${Object.values(RD_ANCHOR_TYPES).map(anchor => `
            <button class="rd-anchor-option" data-anchor="${anchor.id}" onclick="selectAnchorType('${anchor.id}')">
              <div class="rd-anchor-icon" style="color: ${gradeColor}">
                ${getAnchorSVG(anchor.id)}
              </div>
              <div class="rd-anchor-info">
                <span class="rd-anchor-name">${anchor.name}</span>
                <span class="rd-anchor-desc">${anchor.description}</span>
              </div>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="rd-modal-footer">
        <button class="rd-modal-btn rd-modal-btn-cancel" onclick="closeAnchorModal()">Cancelar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Cerrar con click fuera del modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeAnchorModal();
    }
  });
}

/**
 * Cierra el modal de selección de reunión
 */
function closeAnchorModal() {
  const modal = document.getElementById('rd-anchor-modal');
  if (modal) modal.remove();
}

/**
 * Selecciona un tipo de reunión y guarda el dibujo
 */
async function selectAnchorType(anchorType) {
  closeAnchorModal();

  const isEditing = rdEditMode && rdOriginalDrawing;

  const drawing = {
    routeName: rdCurrentRoute.nombre,
    points: rdDrawingPoints,
    anchorType: anchorType, // Nuevo: tipo de reunión
    createdAt: isEditing ? rdOriginalDrawing.createdAt : new Date().toISOString(),
    createdBy: isEditing ? rdOriginalDrawing.createdBy : auth.currentUser?.uid,
    ...(isEditing && {
      updatedAt: new Date().toISOString(),
      updatedBy: auth.currentUser?.uid
    })
  };

  // Guardar dibujo
  await saveRouteDrawing(drawing, isEditing);

  // Resetear estado de dibujo
  rdDrawingPoints = [];
  rdDrawingMode = false;
  rdCurrentRoute = null;
  rdEditMode = false;
  rdOriginalDrawing = null;
  updateDrawingControls();

  // Si estábamos en modo obligatorio, cerrar el editor después de guardar exitosamente
  if (rdMandatoryDrawingMode && rdPendingRouteInfo) {
    showRDToast('Vía añadida correctamente con su dibujo', 'success');

    rdPendingRouteInfo = null;
    rdMandatoryDrawingMode = false;

    setTimeout(() => {
      closeRouteDrawingEditor();
    }, 1500);
  } else {
    const message = isEditing ? 'Dibujo actualizado correctamente.' : 'Dibujo guardado. Selecciona otra vía para continuar.';
    updateInstructions(message);
  }
}

/**
 * Devuelve el SVG del icono de reunión según el tipo
 */
function getAnchorSVG(type) {
  switch(type) {
    case 'quimicos':
      // Dos químicos con maillones/anillas
      return `
        <svg viewBox="0 0 60 80" width="40" height="53">
          <!-- Químico izquierdo -->
          <circle cx="15" cy="12" r="10" fill="currentColor"/>
          <circle cx="15" cy="12" r="4" fill="white"/>
          <!-- Maillon izquierdo -->
          <rect x="10" y="22" width="10" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="3"/>
          <line x1="10" y1="31" x2="20" y2="31" stroke="currentColor" stroke-width="2"/>

          <!-- Químico derecho -->
          <circle cx="45" cy="12" r="10" fill="currentColor"/>
          <circle cx="45" cy="12" r="4" fill="white"/>
          <!-- Maillon derecho -->
          <rect x="40" y="22" width="10" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="3"/>
          <line x1="40" y1="31" x2="50" y2="31" stroke="currentColor" stroke-width="2"/>
        </svg>
      `;
    case 'cadena':
      // Reunión con cadena
      return `
        <svg viewBox="0 0 70 60" width="47" height="40">
          <!-- Químico izquierdo -->
          <circle cx="10" cy="12" r="8" fill="currentColor"/>
          <circle cx="10" cy="12" r="3" fill="white"/>

          <!-- Eslabones de cadena -->
          <ellipse cx="22" cy="22" rx="6" ry="8" fill="none" stroke="currentColor" stroke-width="3"/>
          <ellipse cx="35" cy="30" rx="6" ry="8" fill="none" stroke="currentColor" stroke-width="3"/>
          <ellipse cx="48" cy="22" rx="6" ry="8" fill="none" stroke="currentColor" stroke-width="3"/>

          <!-- Químico derecho -->
          <circle cx="60" cy="12" r="8" fill="currentColor"/>
          <circle cx="60" cy="12" r="3" fill="white"/>
        </svg>
      `;
    case 'mosqueton':
      // Con mosquetón
      return `
        <svg viewBox="0 0 60 80" width="40" height="53">
          <!-- Químico izquierdo -->
          <circle cx="15" cy="12" r="10" fill="currentColor"/>
          <circle cx="15" cy="12" r="4" fill="white"/>

          <!-- Químico derecho -->
          <circle cx="45" cy="12" r="10" fill="currentColor"/>
          <circle cx="45" cy="12" r="4" fill="white"/>

          <!-- Eslabones conectando -->
          <ellipse cx="20" cy="28" rx="4" ry="6" fill="none" stroke="currentColor" stroke-width="2.5"/>
          <ellipse cx="40" cy="28" rx="4" ry="6" fill="none" stroke="currentColor" stroke-width="2.5"/>

          <!-- Mosquetón central -->
          <path d="M22 38 Q30 32 38 38 L38 60 Q30 68 22 60 Z" fill="none" stroke="currentColor" stroke-width="3"/>
          <line x1="22" y1="50" x2="38" y2="50" stroke="currentColor" stroke-width="2"/>
          <rect x="26" y="46" width="8" height="8" rx="1" fill="currentColor"/>
        </svg>
      `;
    case 'desconocido':
      // Tipo desconocido (signo de interrogación)
      return `
        <svg viewBox="0 0 60 80" width="40" height="53">
          <!-- Círculo de fondo -->
          <circle cx="30" cy="35" r="25" fill="currentColor"/>
          <!-- Signo de interrogación -->
          <text x="30" y="43" font-size="32" font-weight="bold" fill="white" text-anchor="middle">?</text>
        </svg>
      `;
    default:
      return '';
  }
}

/**
 * Cancela el dibujo actual
 */
function rdCancelDrawing() {
  // Si estamos en modo edición, restaurar el dibujo original
  if (rdEditMode && rdOriginalDrawing) {
    rdCancelEdit();
    return;
  }

  rdDrawingPoints = [];
  rdDrawingMode = false;
  rdCurrentRoute = null;
  rdEditMode = false;
  rdOriginalDrawing = null;
  rdDraggingPointIndex = -1;
  rdIsDragging = false;
  rdSelectedPointIndex = -1;
  updateDrawingControls();

  updateInstructions('Dibujo cancelado. Selecciona una vía para comenzar.');
  redrawCanvas();
}

// ============================================
// EDICIÓN DE DIBUJOS EXISTENTES
// ============================================

/**
 * Inicia el modo de edición para un dibujo existente
 * @param {string} encodedName - Nombre de la vía codificado
 */
function editRouteDrawing(encodedName) {
  const routeName = decodeURIComponent(encodedName);
  const route = rdRoutesList.find(r => r.nombre === routeName);

  if (!route) {
    showRDToast('Vía no encontrada', 'error');
    return;
  }

  // Buscar el dibujo existente
  const existingDrawing = rdRouteDrawings.find(d => d.routeName === routeName);
  if (!existingDrawing) {
    showRDToast('Esta vía no tiene un dibujo para editar', 'warning');
    return;
  }

  // Guardar el dibujo original por si se cancela
  rdOriginalDrawing = JSON.parse(JSON.stringify(existingDrawing));

  // Cargar los puntos existentes para editar
  rdCurrentRoute = route;
  rdEditMode = true;
  rdDrawingMode = true;

  // Copiar los puntos existentes al array de dibujo
  if (existingDrawing.points && existingDrawing.points.length > 0) {
    rdDrawingPoints = [...existingDrawing.points];
  } else if (existingDrawing.startPoint && existingDrawing.endPoint) {
    // Compatibilidad con formato antiguo
    rdDrawingPoints = [existingDrawing.startPoint, existingDrawing.endPoint];
  } else {
    rdDrawingPoints = [];
  }

  // Eliminar temporalmente el dibujo del array para que no se muestre duplicado
  rdRouteDrawings = rdRouteDrawings.filter(d => d.routeName !== routeName);

  // Cerrar panel de vías para poder editar
  const panel = document.getElementById('rd-routes-panel');
  if (panel && !panel.classList.contains('rd-panel-collapsed')) {
    panel.classList.add('rd-panel-collapsed');
  }

  updateInstructions(`Editando: ${route.nombre}. Arrastra puntos para mover, doble clic para eliminar.`);
  updateDrawingControls();

  // Actualizar lista de vías para mostrar el estado
  document.getElementById('rd-route-list').innerHTML = renderRoutesList();

  // Redibujar para mostrar el dibujo temporal
  redrawCanvas();

  // Toast de modo edición eliminado para no tapar botones
  console.log('[RouteDrawing] Editando vía:', routeName, 'con', rdDrawingPoints.length, 'puntos');
}

/**
 * Cancela la edición y restaura el dibujo original
 */
function rdCancelEdit() {
  if (rdEditMode && rdOriginalDrawing) {
    // Restaurar el dibujo original
    rdRouteDrawings.push(rdOriginalDrawing);
    showRDToast('Edición cancelada. Dibujo restaurado.', 'info');
  }

  // Limpiar estado de edición
  rdEditMode = false;
  rdOriginalDrawing = null;
  rdDrawingPoints = [];
  rdDrawingMode = false;
  rdCurrentRoute = null;
  rdDraggingPointIndex = -1;
  rdIsDragging = false;
  rdSelectedPointIndex = -1;

  updateDrawingControls();
  updateInstructions('Edición cancelada. Selecciona una vía para continuar.');

  // Actualizar lista
  document.getElementById('rd-route-list').innerHTML = renderRoutesList();

  // Redibujar
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
    // Cerrar panel de vías para ver la imagen
    const panel = document.getElementById('rd-routes-panel');
    if (panel && !panel.classList.contains('rd-panel-collapsed')) {
      panel.classList.add('rd-panel-collapsed');
    }
    return;
  }

  // Activar modo de dibujo
  rdCurrentRoute = route;
  rdDrawingMode = true;
  rdDrawingPoints = [];

  // Cerrar panel de vías para poder dibujar en la imagen
  const panel = document.getElementById('rd-routes-panel');
  if (panel && !panel.classList.contains('rd-panel-collapsed')) {
    panel.classList.add('rd-panel-collapsed');
  }

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
 * @param {Object} drawing - El dibujo a guardar
 * @param {boolean} isEditing - Si estamos editando un dibujo existente
 */
async function saveRouteDrawing(drawing, isEditing = false) {
  try {
    const docId = `${rdCurrentSector.schoolId}_${normalizeSectorName(rdCurrentSector.sectorName)}`;

    // Añadir imageId al dibujo si estamos editando una imagen específica
    if (rdCurrentSector.imageId) {
      drawing.imageId = rdCurrentSector.imageId;
    }

    // Si estamos editando, el dibujo ya fue removido temporalmente del array
    // Solo necesitamos añadirlo de nuevo
    rdRouteDrawings.push(drawing);

    // Obtener TODOS los dibujos existentes (de todas las imágenes)
    const docRef = db.collection('sector_route_drawings').doc(docId);
    const doc = await docRef.get();

    let allDrawings = [];
    if (doc.exists) {
      const data = doc.data();
      allDrawings = data.drawings || [];

      if (isEditing) {
        // MODO EDICIÓN: Eliminar el dibujo original y añadir el editado
        // Primero filtrar por nombre de ruta para eliminar el original
        allDrawings = allDrawings.filter(d => d.routeName !== drawing.routeName);
        // Añadir el dibujo editado
        allDrawings.push(drawing);
      } else {
        // MODO NUEVO: Si hay imageId, reemplazar solo los dibujos de esta imagen
        if (rdCurrentSector.imageId) {
          // Mantener dibujos de otras imágenes
          allDrawings = allDrawings.filter(d => d.imageId !== rdCurrentSector.imageId);
          // Añadir los dibujos actuales de esta imagen
          allDrawings = allDrawings.concat(rdRouteDrawings);
        } else {
          // Modo legacy: reemplazar todos
          allDrawings = rdRouteDrawings;
        }
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

    const message = isEditing ? 'Dibujo actualizado correctamente' : 'Dibujo guardado correctamente';
    showRDToast(message, 'success');

    // Actualizar lista de vías
    document.getElementById('rd-route-list').innerHTML = renderRoutesList();

    // Redibujar
    redrawCanvas();

  } catch (error) {
    console.error('[RouteDrawing] Error guardando dibujo:', error);
    showRDToast('Error al guardar: ' + error.message, 'error');
    // Revertir cambio local
    rdRouteDrawings.pop();
    // Si estábamos editando, restaurar el original
    if (isEditing && rdOriginalDrawing) {
      rdRouteDrawings.push(rdOriginalDrawing);
    }
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
  rdEditMode = false;
  rdOriginalDrawing = null;
  rdDraggingPointIndex = -1;
  rdIsDragging = false;
  rdSelectedPointIndex = -1;
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
 * Resetea la vista del canvas con doble confirmación usando popups personalizados
 */
function rdResetView() {
  // Mostrar primera confirmación
  showRdConfirmModal(
    '¿Resetear vista?',
    'Esto restaurará el zoom y posición original del canvas.',
    'Continuar',
    'Cancelar',
    () => {
      // Si confirma, mostrar segunda confirmación con input
      showRdInputConfirmModal();
    }
  );
}

/**
 * Muestra un modal de confirmación personalizado
 */
function showRdConfirmModal(title, message, confirmText, cancelText, onConfirm, onCancel) {
  // Eliminar modal existente si hay uno
  const existing = document.getElementById('rd-confirm-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'rd-confirm-modal';
  modal.className = 'rd-modal-overlay';
  modal.innerHTML = `
    <div class="rd-modal-container">
      <div class="rd-modal-header">
        <h3>${title}</h3>
      </div>
      <div class="rd-modal-body">
        <p>${message}</p>
      </div>
      <div class="rd-modal-footer">
        <button class="rd-modal-btn rd-modal-btn-cancel" id="rd-modal-cancel">${cancelText}</button>
        <button class="rd-modal-btn rd-modal-btn-confirm" id="rd-modal-confirm">${confirmText}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Event listeners
  document.getElementById('rd-modal-cancel').addEventListener('click', () => {
    modal.remove();
    if (onCancel) onCancel();
  });

  document.getElementById('rd-modal-confirm').addEventListener('click', () => {
    modal.remove();
    if (onConfirm) onConfirm();
  });

  // Cerrar con click fuera del modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
      if (onCancel) onCancel();
    }
  });
}

/**
 * Muestra el modal de confirmación con input de texto
 */
function showRdInputConfirmModal() {
  // Eliminar modal existente si hay uno
  const existing = document.getElementById('rd-confirm-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'rd-confirm-modal';
  modal.className = 'rd-modal-overlay';
  modal.innerHTML = `
    <div class="rd-modal-container">
      <div class="rd-modal-header rd-modal-header-warning">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <h3>Confirmación requerida</h3>
      </div>
      <div class="rd-modal-body">
        <p>Para confirmar el reseteo, escribe <strong>"Confirmar"</strong> en el campo de abajo:</p>
        <input type="text" id="rd-confirm-input" class="rd-modal-input" placeholder="Escribe Confirmar aquí..." autocomplete="off">
        <p class="rd-modal-hint" id="rd-modal-hint"></p>
      </div>
      <div class="rd-modal-footer">
        <button class="rd-modal-btn rd-modal-btn-cancel" id="rd-modal-cancel">Cancelar</button>
        <button class="rd-modal-btn rd-modal-btn-confirm" id="rd-modal-confirm" disabled>Resetear</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const input = document.getElementById('rd-confirm-input');
  const confirmBtn = document.getElementById('rd-modal-confirm');
  const hint = document.getElementById('rd-modal-hint');

  // Enfocar input automáticamente
  setTimeout(() => input.focus(), 100);

  // Validar input en tiempo real
  input.addEventListener('input', () => {
    const value = input.value.trim().toLowerCase();
    if (value === 'confirmar') {
      confirmBtn.disabled = false;
      hint.textContent = '✓ Correcto';
      hint.className = 'rd-modal-hint rd-modal-hint-success';
    } else if (value.length > 0) {
      confirmBtn.disabled = true;
      hint.textContent = 'El texto no coincide';
      hint.className = 'rd-modal-hint rd-modal-hint-error';
    } else {
      confirmBtn.disabled = true;
      hint.textContent = '';
      hint.className = 'rd-modal-hint';
    }
  });

  // Permitir confirmar con Enter si el texto es correcto
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !confirmBtn.disabled) {
      confirmBtn.click();
    }
  });

  // Event listeners botones
  document.getElementById('rd-modal-cancel').addEventListener('click', () => {
    modal.remove();
  });

  confirmBtn.addEventListener('click', () => {
    modal.remove();
    // Ejecutar reset
    initializeCanvas();
    redrawCanvas();
    showRDToast('Vista reseteada correctamente', 'success');
  });

  // Cerrar con click fuera del modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
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
window.selectImageForPendingRoute = selectImageForPendingRoute;
window.closeImageSelectorModal = closeImageSelectorModal;
window.selectRouteForDrawing = selectRouteForDrawing;
window.selectRouteForDrawingMandatory = selectRouteForDrawingMandatory;
window.deleteRouteDrawing = deleteRouteDrawing;
window.editRouteDrawing = editRouteDrawing;
window.rdCancelEdit = rdCancelEdit;
window.rdDeleteSpecificPoint = rdDeleteSpecificPoint;
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
// Funciones para selección de tipo de reunión
window.showAnchorTypeModal = showAnchorTypeModal;
window.closeAnchorModal = closeAnchorModal;
window.selectAnchorType = selectAnchorType;

console.log('[RouteDrawing] Módulo cargado');
