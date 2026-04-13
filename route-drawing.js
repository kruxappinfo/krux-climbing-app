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
let rdSectorImages = [];                // Array de imágenes del sector (para navegación)
let rdCurrentImageIndex = 0;            // Índice de imagen actual en rdSectorImages
let rdAutoSelectRouteId = null;         // routeId a auto-seleccionar tras abrir editor

// Estado de zoom del editor
let rdZoomState = {
  scale: 1, translateX: 0, translateY: 0,
  isPinching: false, isPanning: false,
  pinchStartDist: 0, pinchStartScale: 1,
  pinchCenterX: 0, pinchCenterY: 0,
  panStartX: 0, panStartY: 0,
  lastTranslateX: 0, lastTranslateY: 0,
  minScale: 1, maxScale: 4
};

// Variables de bifurcación
let rdBifurcationMode = false;           // Modo selección de punto de bifurcación
let rdCurrentBranchId = -1;              // Rama activa (-1 = tronco, >0 = rama)
let rdBranchesData = [];                 // Copia de trabajo de las ramas durante edición
let rdActiveForkPoint = null;            // Punto de bifurcación de la rama siendo dibujada
let rdActiveForkSegmentIndex = -1;       // Índice del segmento donde se bifurca
let rdBifurcatingDrawing = null;         // Drawing que se está bifurcando

// Variables de rápel (puntos independientes)
let rdRapelMode = false;                 // Modo colocación de puntos de rápel
let rdRapelPoints = [];                  // Array de puntos de rápel [{x, y, id}, ...]

// Constantes para interacción
const RD_POINT_HIT_RADIUS = 20;         // Radio en píxeles para detectar clic en un punto
const RD_SEGMENT_HIT_RADIUS = 20;       // Radio para detectar clic en un segmento de línea

// Colores para el dibujo
const RD_COLORS = {
  normal: '#10b981',        // Verde para vías normales
  selected: '#f59e0b',      // Ámbar para vía seleccionada
  highlight: '#ef4444',     // Rojo para highlight
  rapel: '#a855f7',         // Púrpura para puntos de rápel
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
  },
  sin_terminar: {
    id: 'sin_terminar',
    name: 'Sin terminar',
    description: 'Vía inconclusa / final desconocido'
  }
};

// ============================================
// BIFURCACIÓN: FUNCIONES DE DATOS Y RENDERIZADO
// ============================================

/**
 * Convierte un drawing en array de paths renderizables (tronco + ramas)
 * Retrocompatible: si no hay branches, devuelve un solo path con los points del tronco
 * @param {Object} drawing - Objeto de dibujo
 * @returns {Array} Array de {branchId, points, anchorType, isTrunk, forkPoint}
 */
function resolveDrawingPaths(drawing) {
  // Si no hay branches, devolver path único (retrocompat)
  if (!drawing.branches || drawing.branches.length === 0) {
    return [{
      branchId: 0,
      points: drawing.points,
      anchorType: drawing.anchorType,
      isTrunk: true,
      forkPoint: null
    }];
  }

  const paths = [];

  // Path del tronco principal
  paths.push({
    branchId: 0,
    points: drawing.points,
    anchorType: drawing.anchorType,
    isTrunk: true,
    forkPoint: null
  });

  // Paths de las ramas
  drawing.branches.forEach(branch => {
    paths.push({
      branchId: branch.branchId,
      points: [branch.forkPoint, ...branch.points], // forkPoint es el primer punto visual
      anchorType: branch.anchorType,
      isTrunk: false,
      forkPoint: branch.forkPoint
    });
  });

  return paths;
}

/**
 * Calcula la distancia de un punto a un segmento de línea y el punto proyectado
 * @returns {Object} {distance, projectedPoint: {x, y}, param}
 */
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  let param = 0;
  if (lengthSq > 0) {
    param = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
    param = Math.max(0, Math.min(1, param));
  }

  const projX = x1 + param * dx;
  const projY = y1 + param * dy;
  const distance = Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));

  return { distance, projectedPoint: { x: projX, y: projY }, param };
}

/**
 * Encuentra el segmento más cercano al click en un drawing (incluye tronco y ramas)
 * @param {number} canvasX - Coordenada X en canvas
 * @param {number} canvasY - Coordenada Y en canvas
 * @param {Object} drawing - El drawing a buscar
 * @returns {Object|null} {segmentIndex, distance, projectedPoint, branchId} o null
 */
function findNearestSegmentOnDrawing(canvasX, canvasY, drawing) {
  const displayWidth = rdCanvas.displayWidth || rdCanvas.width;
  const displayHeight = rdCanvas.displayHeight || rdCanvas.height;
  const scaleX = displayWidth / rdImage.width;
  const scaleY = displayHeight / rdImage.height;

  let nearest = null;
  let minDist = Infinity;

  // Buscar en el tronco
  const trunkPoints = drawing.points;
  if (trunkPoints && trunkPoints.length >= 2) {
    for (let i = 0; i < trunkPoints.length - 1; i++) {
      const p1 = { x: trunkPoints[i].x * scaleX, y: trunkPoints[i].y * scaleY };
      const p2 = { x: trunkPoints[i + 1].x * scaleX, y: trunkPoints[i + 1].y * scaleY };
      const result = pointToSegmentDistance(canvasX, canvasY, p1.x, p1.y, p2.x, p2.y);
      if (result.distance < minDist) {
        minDist = result.distance;
        // Convertir punto proyectado a coordenadas de imagen
        const imgPoint = canvasToImageCoords(result.projectedPoint.x, result.projectedPoint.y);
        nearest = {
          segmentIndex: i,
          distance: result.distance,
          projectedPoint: imgPoint,
          branchId: 0
        };
      }
    }
  }

  // Buscar en las ramas
  if (drawing.branches) {
    drawing.branches.forEach(branch => {
      const branchFullPoints = [branch.forkPoint, ...branch.points];
      for (let i = 0; i < branchFullPoints.length - 1; i++) {
        const p1 = { x: branchFullPoints[i].x * scaleX, y: branchFullPoints[i].y * scaleY };
        const p2 = { x: branchFullPoints[i + 1].x * scaleX, y: branchFullPoints[i + 1].y * scaleY };
        const result = pointToSegmentDistance(canvasX, canvasY, p1.x, p1.y, p2.x, p2.y);
        if (result.distance < minDist) {
          minDist = result.distance;
          const imgPoint = canvasToImageCoords(result.projectedPoint.x, result.projectedPoint.y);
          nearest = {
            segmentIndex: i,
            distance: result.distance,
            projectedPoint: imgPoint,
            branchId: branch.branchId
          };
        }
      }
    });
  }

  if (nearest && nearest.distance <= RD_SEGMENT_HIT_RADIUS) {
    return nearest;
  }
  return null;
}

/**
 * Dibuja un diamante (rombo) indicador de punto de bifurcación
 */
function drawForkDiamond(x, y, color) {
  const size = 3.5;
  rdCtx.save();
  rdCtx.translate(x, y);
  rdCtx.rotate(Math.PI / 4); // Rotar 45° para hacer rombo

  // Borde oscuro
  rdCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  rdCtx.fillRect(-size - 1, -size - 1, (size + 1) * 2, (size + 1) * 2);

  // Borde blanco
  rdCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  rdCtx.fillRect(-size - 0.25, -size - 0.25, (size + 0.25) * 2, (size + 0.25) * 2);

  // Relleno de color
  rdCtx.fillStyle = color;
  rdCtx.fillRect(-size + 0.5, -size + 0.5, (size - 0.5) * 2, (size - 0.5) * 2);

  rdCtx.restore();
}

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

  // Cargar todas las imágenes del sector para navegación
  if (typeof getSectorGalleryImages === 'function') {
    const images = await getSectorGalleryImages(schoolId, sectorName);
    if (images && images.length > 0) {
      // Solo actualizar rdSectorImages si no fue ya seteado por el caller
      if (rdSectorImages.length === 0) {
        rdSectorImages = images;
      }
      if (imageId) {
        const targetIdx = images.findIndex(img => img.id === imageId);
        if (targetIdx >= 0) {
          imageUrl = images[targetIdx].url;
          rdCurrentImageIndex = targetIdx;
        }
      }
      if (!imageUrl) {
        imageUrl = images[0].url;
        imageId = images[0].id;
        rdCurrentImageIndex = 0;
      }
    }
  }

  // Fallback si no se obtuvo imagen
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
  await loadRapelPoints(schoolId, sectorName, imageId);

  // Crear el editor
  createDrawingEditor(imageUrl);
}

/**
 * Abre el editor desde un popup de vía (para vincular vía específica)
 * @param {number} routeId - ID de la vía (properties.id del GeoJSON)
 */
async function openDrawingEditorForRoute(routeId) {
  if (!mlCurrentSchool) {
    showRDToast('No se puede determinar la escuela actual', 'error');
    return;
  }

  // Obtener datos de la vía
  const routeData = await getRouteData(mlCurrentSchool, routeId);
  if (!routeData || !routeData.sector) {
    showRDToast('No se pudo obtener información de la vía', 'error');
    return;
  }

  const schoolId = mlCurrentSchool;
  const sectorName = routeData.sector;

  // Obtener todas las imágenes del sector
  const images = await getSectorGalleryImages(schoolId, sectorName);
  if (!images || images.length === 0) {
    showRDToast('No hay imagen disponible para este sector', 'error');
    return;
  }

  // Si solo hay una imagen, abrir directamente
  if (images.length === 1) {
    rdSectorImages = images;
    rdCurrentImageIndex = 0;
    await openRouteDrawingEditor(schoolId, sectorName, images[0].id);
    setTimeout(() => { selectRouteForDrawing(routeId); }, 500);
    return;
  }

  // Múltiples imágenes: mostrar selector para elegir en cuál dibujar
  rdAutoSelectRouteId = routeId;
  showImageSelectorForRoute(schoolId, sectorName, routeData.nombre || '', images);
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

    // 4. Crear un mapa de routeId (o nombre como fallback) -> imageId
    const routeToImageMap = {};
    allDrawings.forEach(drawing => {
      const key = drawing.routeId !== undefined ? String(drawing.routeId) : drawing.routeName;
      if (key) {
        routeToImageMap[key] = drawing.imageId || 'legacy_0';
      }
    });

    // 5. Calcular distancias a vías que tienen dibujo
    const routesWithDrawings = sectorRoutes.filter(r => {
      return routeToImageMap[String(r.routeId)] || routeToImageMap[r.nombre];
    });

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
        routeId: route.routeId,
        routeName: route.nombre,
        imageId: routeToImageMap[String(route.routeId)] || routeToImageMap[route.nombre],
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
 * Muestra selector de imagen para vincular una vía existente (no pendiente)
 */
function showImageSelectorForRoute(schoolId, sectorName, routeName, images) {
  const modal = document.createElement('div');
  modal.id = 'rd-image-selector-modal';
  modal.className = 'rd-image-selector-overlay';
  modal.innerHTML = `
    <div class="rd-image-selector-container">
      <div class="rd-image-selector-header">
        <h3>Selecciona la foto donde dibujar la vía</h3>
        ${routeName ? `<p class="rd-image-selector-subtitle">${routeName}</p>` : ''}
      </div>
      <div class="rd-image-selector-grid">
        ${images.map((img, index) => `
          <div class="rd-image-selector-item" onclick="selectImageForRoute('${schoolId}', '${encodeURIComponent(sectorName)}', '${img.id}', ${index})">
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
 * Callback cuando se selecciona una imagen para una vía existente
 */
async function selectImageForRoute(schoolId, encodedSectorName, imageId, imageIndex) {
  closeImageSelectorModal();

  const sectorName = decodeURIComponent(encodedSectorName);

  // Guardar las imágenes del sector para navegación
  const images = await getSectorGalleryImages(schoolId, sectorName);
  rdSectorImages = images;
  rdCurrentImageIndex = imageIndex;

  // Abrir editor con la imagen seleccionada
  await openRouteDrawingEditor(schoolId, sectorName, imageId);

  // Auto-seleccionar la vía si hay una pendiente
  if (rdAutoSelectRouteId !== null) {
    const routeId = rdAutoSelectRouteId;
    rdAutoSelectRouteId = null;
    setTimeout(() => { selectRouteForDrawing(routeId); }, 500);
  }
}

/**
 * Cambia la imagen activa en el editor sin cerrarlo
 * @param {number} newIndex - Índice de la nueva imagen en rdSectorImages
 */
async function rdSwitchImage(newIndex) {
  if (!rdSectorImages || rdSectorImages.length === 0) return;
  if (newIndex < 0 || newIndex >= rdSectorImages.length) return;
  if (newIndex === rdCurrentImageIndex) return;

  // Si hay dibujo en curso, avisar
  if (rdDrawingMode && rdDrawingPoints.length > 0) {
    if (!confirm('Tienes un dibujo sin terminar. ¿Cambiar de imagen descartará el progreso actual?')) {
      return;
    }
  }

  // Cancelar dibujo en curso si existe
  if (rdDrawingMode) {
    rdDrawingMode = false;
    rdCurrentRoute = null;
    rdDrawingPoints = [];
    rdEditMode = false;
    rdOriginalDrawing = null;
    const controls = document.getElementById('rd-drawing-controls');
    if (controls) controls.style.display = 'none';
  }

  // Resetear zoom al cambiar de imagen
  rdResetZoom();

  rdCurrentImageIndex = newIndex;
  const newImage = rdSectorImages[newIndex];

  // Actualizar sector con nuevo imageId
  rdCurrentSector.imageId = newImage.id;

  // Recargar dibujos para la nueva imagen
  await loadRouteDrawings(rdCurrentSector.schoolId, rdCurrentSector.sectorName, newImage.id);
  await loadRapelPoints(rdCurrentSector.schoolId, rdCurrentSector.sectorName, newImage.id);

  // Actualizar lista de vías
  const routeListEl = document.getElementById('rd-route-list');
  if (routeListEl) routeListEl.innerHTML = renderRoutesList();

  // Actualizar indicador de imagen
  rdUpdateImageIndicator();

  // Actualizar instrucciones
  updateInstructions('Selecciona una vía de la lista para dibujar su línea en la imagen');

  // Cargar nueva imagen en canvas
  rdImage = new Image();
  rdImage.crossOrigin = 'anonymous';
  rdImage.onload = () => {
    initializeCanvas();
    redrawCanvas();
  };
  rdImage.onerror = () => {
    showRDToast('Error cargando la imagen', 'error');
  };
  rdImage.src = newImage.url;
}

/**
 * Navega a la imagen anterior del sector
 */
function rdPrevImage() {
  if (rdCurrentImageIndex > 0) {
    rdSwitchImage(rdCurrentImageIndex - 1);
  }
}

/**
 * Navega a la imagen siguiente del sector
 */
function rdNextImage() {
  if (rdCurrentImageIndex < rdSectorImages.length - 1) {
    rdSwitchImage(rdCurrentImageIndex + 1);
  }
}

/**
 * Actualiza el indicador visual de imagen actual
 */
function rdUpdateImageIndicator() {
  const indicator = document.getElementById('rd-image-indicator');
  if (indicator) {
    indicator.textContent = `Foto ${rdCurrentImageIndex + 1} / ${rdSectorImages.length}`;
  }
  // Actualizar estado de botones prev/next
  const prevBtn = document.getElementById('rd-btn-prev-image');
  const nextBtn = document.getElementById('rd-btn-next-image');
  if (prevBtn) prevBtn.disabled = rdCurrentImageIndex <= 0;
  if (nextBtn) nextBtn.disabled = rdCurrentImageIndex >= rdSectorImages.length - 1;
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
  await loadRapelPoints(schoolId, sectorName, selectedImage.id);

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
          routeId: Number(f.properties.id),
          nombre: f.properties.nombre,
          grado: f.properties.grado1 || '?',
          sector: f.properties.sector,
          coordinates: f.geometry.coordinates[0] || f.geometry.coordinates
        }))
        .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
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
        <div id="rd-canvas-wrapper"><canvas id="rd-canvas"></canvas></div>
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
    const hasDrawing = rdRouteDrawings.find(d => d.routeId === route.routeId || (!d.routeId && d.routeName === route.nombre));
    const gradeColor = getGradeColor(route.grado);
    const isPendingRoute = route.nombre === pendingRouteName;

    return `
      <div class="rd-route-item ${hasDrawing ? 'rd-has-drawing' : ''} ${isPendingRoute ? 'rd-pending-route' : ''}"
           onclick="selectRouteForDrawingMandatory(${route.routeId})">
        <div class="rd-route-info">
          <span class="rd-route-name">${route.nombre || 'Sin nombre'}</span>
          <span class="rd-route-grade" style="background-color: ${gradeColor}">${route.grado}</span>
          ${isPendingRoute ? '<span class="rd-new-badge">NUEVA</span>' : ''}
        </div>
        ${hasDrawing && !isPendingRoute ? `
          <button class="rd-btn-delete" onclick="event.stopPropagation(); deleteRouteDrawing(${route.routeId})" title="Eliminar dibujo">
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
function selectRouteForDrawingMandatory(routeId) {
  const route = rdRoutesList.find(r => r.routeId === routeId);

  if (!route) return;

  // En modo obligatorio solo permitir dibujar la vía pendiente
  if (rdMandatoryDrawingMode && rdPendingRouteInfo && route.nombre !== rdPendingRouteInfo.routeName) {
    showRDToast('Primero debes dibujar la vía nueva antes de poder dibujar otras', 'warning');
    return;
  }

  // Verificar si ya existe un dibujo
  const existingDrawing = rdRouteDrawings.find(d => d.routeId === route.routeId || (!d.routeId && d.routeName === route.nombre));
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

  console.log('[RouteDrawing] Vía seleccionada (modo obligatorio):', route.nombre, 'id:', route.routeId);
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
          routeId: Number(f.properties.id),
          nombre: f.properties.nombre,
          grado: f.properties.grado1 || '?',
          sector: f.properties.sector,
          coordinates: f.geometry.coordinates[0] || f.geometry.coordinates
        }))
        .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }

    console.log('[RouteDrawing] Vías cargadas:', rdRoutesList.length);
  } catch (error) {
    console.error('[RouteDrawing] Error cargando vías:', error);
  }
}

/**
 * Obtiene datos de una vía específica por su routeId (properties.id del GeoJSON)
 */
async function getRouteData(schoolId, routeId) {
  const school = MAPLIBRE_SCHOOLS[schoolId];
  if (!school || !school.geojson || !school.geojson.vias) return null;

  try {
    const response = await fetch(school.geojson.vias + '?v=' + Date.now());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const geojson = await response.json();
    const feature = geojson.features.find(f => f.properties.id === routeId);

    return feature ? {
      routeId: feature.properties.id,
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

      // Normalizar routeId a Number para consistencia entre plataformas
      allDrawings.forEach(d => {
        if (d.routeId !== undefined) d.routeId = Number(d.routeId);
      });

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

  const hasMultipleImages = rdSectorImages.length > 1;

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
        ${hasMultipleImages ? `
        <div class="rd-image-nav">
          <button class="rd-btn-icon rd-btn-nav-image" id="rd-btn-prev-image" onclick="rdPrevImage()" title="Foto anterior" ${rdCurrentImageIndex <= 0 ? 'disabled' : ''}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span class="rd-image-indicator" id="rd-image-indicator">Foto ${rdCurrentImageIndex + 1} / ${rdSectorImages.length}</span>
          <button class="rd-btn-icon rd-btn-nav-image" id="rd-btn-next-image" onclick="rdNextImage()" title="Foto siguiente" ${rdCurrentImageIndex >= rdSectorImages.length - 1 ? 'disabled' : ''}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
        ` : ''}
        <div class="rd-header-actions">
          <button class="rd-btn-icon rd-btn-rapel" id="rd-btn-rapel" onclick="rdToggleRapelMode()" title="Colocar puntos de rápel">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="5" r="3"/>
              <circle cx="12" cy="5" r="1.2" fill="currentColor"/>
              <polyline points="10,8 8,14 10,20" stroke-linecap="round" stroke-linejoin="round"/>
              <polyline points="14,8 16,14 14,20" stroke-linecap="round" stroke-linejoin="round"/>
              <polyline points="6.5,18 8,20 9.5,18" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <polyline points="14.5,18 16,20 17.5,18" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
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
        <div id="rd-canvas-wrapper"><canvas id="rd-canvas"></canvas></div>
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
    const hasDrawing = rdRouteDrawings.find(d => d.routeId === route.routeId || (!d.routeId && d.routeName === route.nombre));
    const gradeColor = getGradeColor(route.grado);

    return `
      <div class="rd-route-item ${hasDrawing ? 'rd-has-drawing' : ''}" onclick="selectRouteForDrawing(${route.routeId})">
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
          <span class="rd-route-name">${route.nombre || 'Sin nombre'}</span>
          <span class="rd-route-grade" style="background-color: ${gradeColor}">${route.grado}</span>
          ${hasDrawing && hasDrawing.branches && hasDrawing.branches.length > 0 ? `<span class="rd-branch-badge" title="${hasDrawing.branches.length} ramal(es)">${hasDrawing.branches.length}R</span>` : ''}
        </div>
        ${hasDrawing ? `
          <div class="rd-route-actions">
            <button class="rd-btn-edit" onclick="event.stopPropagation(); editRouteDrawing(${route.routeId})" title="Editar dibujo">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </button>
            <button class="rd-btn-delete" onclick="event.stopPropagation(); deleteRouteDrawing(${route.routeId})" title="Eliminar dibujo">
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
  rdCanvas.addEventListener('wheel', handleCanvasWheel, { passive: false });
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
    const isSelected = rdCurrentRoute && (
      (drawing.routeId !== undefined && drawing.routeId === rdCurrentRoute.routeId) ||
      (drawing.routeId === undefined && drawing.routeName === rdCurrentRoute.nombre)
    );
    drawRouteLineOnly(drawing, isSelected);
  });

  // PASO 1.5: Dibujar TODAS las reuniones encima de las líneas
  rdRouteDrawings.forEach((drawing, index) => {
    const isSelected = rdCurrentRoute && (
      (drawing.routeId !== undefined && drawing.routeId === rdCurrentRoute.routeId) ||
      (drawing.routeId === undefined && drawing.routeName === rdCurrentRoute.nombre)
    );
    drawRouteAnchorOnly(drawing, isSelected);
  });

  // PASO 2: Dibujar TODOS los puntos encima (para que no queden tapados)
  rdRouteDrawings.forEach((drawing, index) => {
    const isSelected = rdCurrentRoute && (
      (drawing.routeId !== undefined && drawing.routeId === rdCurrentRoute.routeId) ||
      (drawing.routeId === undefined && drawing.routeName === rdCurrentRoute.nombre)
    );
    drawRoutePointOnly(drawing, isSelected);
  });

  // PASO 3: Dibujar puntos de rápel encima de todo
  drawRapelPoints();

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

  const route = rdRoutesList.find(r => (drawing.routeId !== undefined && r.routeId === drawing.routeId) || (drawing.routeId === undefined && r.nombre === drawing.routeName));
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
 * Soporta múltiples paths (tronco + ramas)
 */
function drawRouteLineOnly(drawing, isSelected) {
  const data = getRouteDrawingData(drawing, isSelected);
  if (!data) return;

  const { color } = data;
  const paths = resolveDrawingPaths(drawing);

  const displayWidth = rdCanvas.displayWidth || rdCanvas.width;
  const displayHeight = rdCanvas.displayHeight || rdCanvas.height;
  const scaleX = displayWidth / rdImage.width;
  const scaleY = displayHeight / rdImage.height;

  paths.forEach(path => {
    if (!path.points || path.points.length < 2) return;

    const scaledPoints = path.points.map(p => ({
      x: p.x * scaleX,
      y: p.y * scaleY
    }));

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
  });
}

/**
 * Dibuja solo el icono de reunión de una vía (separado para controlar z-order)
 * Soporta múltiples paths (reunión al final de cada rama)
 */
function drawRouteAnchorOnly(drawing, isSelected) {
  const data = getRouteDrawingData(drawing, isSelected);
  if (!data) return;

  const { color } = data;
  const paths = resolveDrawingPaths(drawing);

  const displayWidth = rdCanvas.displayWidth || rdCanvas.width;
  const displayHeight = rdCanvas.displayHeight || rdCanvas.height;
  const scaleX = displayWidth / rdImage.width;
  const scaleY = displayHeight / rdImage.height;

  paths.forEach(path => {
    if (!path.anchorType || !path.points || path.points.length < 2) return;

    const scaledPoints = path.points.map(p => ({
      x: p.x * scaleX,
      y: p.y * scaleY
    }));

    const lastPoint = scaledPoints[scaledPoints.length - 1];
    const prevPoint = scaledPoints[scaledPoints.length - 2];
    drawAnchorIcon(lastPoint.x, lastPoint.y, prevPoint.x, prevPoint.y, path.anchorType, color);
  });
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

  // Sin terminar: usa sus propias coordenadas y rotación
  if (anchorType === 'sin_terminar') {
    drawAnchorSinTerminar(x, y, prevX, prevY, iconSize, color);
    return;
  }

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
 * Dibuja flecha de vía sin terminar (editor)
 * La flecha apunta en la dirección del último segmento
 */
function drawAnchorSinTerminar(x, y, prevX, prevY, size, color) {
  const scale = size / 20;
  const outlineColor = 'white';

  // Calcular ángulo desde prevPoint → lastPoint
  const angle = Math.atan2(y - prevY, x - prevX);

  rdCtx.save();
  rdCtx.translate(x, y);
  rdCtx.rotate(angle);

  const arrowLen = 14 * scale;
  const arrowW = 7 * scale;
  const stemLen = 8 * scale;
  const stemW = 3 * scale;

  // Contorno blanco
  rdCtx.strokeStyle = outlineColor;
  rdCtx.lineWidth = 3 * scale;
  rdCtx.lineJoin = 'round';
  rdCtx.beginPath();
  rdCtx.moveTo(arrowLen, 0);
  rdCtx.lineTo(0, -arrowW);
  rdCtx.lineTo(0, -stemW);
  rdCtx.lineTo(-stemLen, -stemW);
  rdCtx.lineTo(-stemLen, stemW);
  rdCtx.lineTo(0, stemW);
  rdCtx.lineTo(0, arrowW);
  rdCtx.closePath();
  rdCtx.stroke();

  // Relleno con color de la vía
  rdCtx.fillStyle = color;
  rdCtx.beginPath();
  rdCtx.moveTo(arrowLen, 0);
  rdCtx.lineTo(0, -arrowW);
  rdCtx.lineTo(0, -stemW);
  rdCtx.lineTo(-stemLen, -stemW);
  rdCtx.lineTo(-stemLen, stemW);
  rdCtx.lineTo(0, stemW);
  rdCtx.lineTo(0, arrowW);
  rdCtx.closePath();
  rdCtx.fill();

  // Borde oscuro sutil
  rdCtx.strokeStyle = 'rgba(0,0,0,0.4)';
  rdCtx.lineWidth = 1;
  rdCtx.stroke();

  rdCtx.restore();
}

/**
 * Dibuja solo el PUNTO de inicio de una vía y diamantes en puntos de bifurcación
 */
function drawRoutePointOnly(drawing, isSelected) {
  const data = getRouteDrawingData(drawing, isSelected);
  if (!data) return;

  const { scaledPoints, color } = data;
  // Punto de inicio del tronco
  drawNumber(scaledPoints[0].x, scaledPoints[0].y, 0, color);

  // Diamantes en puntos de bifurcación
  if (drawing.branches && drawing.branches.length > 0) {
    const displayWidth = rdCanvas.displayWidth || rdCanvas.width;
    const displayHeight = rdCanvas.displayHeight || rdCanvas.height;
    const scaleX = displayWidth / rdImage.width;
    const scaleY = displayHeight / rdImage.height;

    drawing.branches.forEach(branch => {
      if (branch.forkPoint) {
        const fx = branch.forkPoint.x * scaleX;
        const fy = branch.forkPoint.y * scaleY;
        drawForkDiamond(fx, fy, color);
      }
    });
  }
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

// ── Zoom helpers ──────────────────────────────────────────────────────────────

function getTouchDistance(t1, t2) {
  const dx = t2.clientX - t1.clientX;
  const dy = t2.clientY - t1.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function rdApplyZoomTransform(immediate = false) {
  const wrapper = document.getElementById('rd-canvas-wrapper');
  if (!wrapper) return;
  const { translateX, translateY, scale } = rdZoomState;
  wrapper.style.transition = immediate ? 'none' : 'transform 0.1s ease-out';
  wrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
}

function rdConstrainPan() {
  if (rdZoomState.scale <= 1) {
    rdZoomState.translateX = 0;
    rdZoomState.translateY = 0;
    return;
  }
  const container = document.getElementById('rd-canvas-container');
  if (!container || !rdCanvas) return;
  const scaledW = (rdCanvas.displayWidth || rdCanvas.clientWidth) * rdZoomState.scale;
  const scaledH = (rdCanvas.displayHeight || rdCanvas.clientHeight) * rdZoomState.scale;
  const maxTX = Math.max(0, (scaledW - container.clientWidth) / 2);
  const maxTY = Math.max(0, (scaledH - container.clientHeight) / 2);
  rdZoomState.translateX = Math.max(-maxTX, Math.min(maxTX, rdZoomState.translateX));
  rdZoomState.translateY = Math.max(-maxTY, Math.min(maxTY, rdZoomState.translateY));
}

function rdResetZoom() {
  rdZoomState.scale = 1;
  rdZoomState.translateX = 0;
  rdZoomState.translateY = 0;
  rdApplyZoomTransform(false);
}

// ─────────────────────────────────────────────────────────────────────────────

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
  // Modo rápel: colocar o eliminar punto de rápel
  if (rdRapelMode) {
    const { x, y } = getCanvasCoordinates(e);
    handleRapelClick(x, y);
    return;
  }

  // Modo bifurcación: buscar segmento de línea para crear fork
  if (rdBifurcationMode) {
    const { x, y } = getCanvasCoordinates(e);
    handleBifurcationClick(x, y);
    return;
  }

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
 * 1 dedo = dibujar/arrastrar punto | 2 dedos = pinch-zoom + pan
 */
function handleCanvasTouchStart(e) {
  e.preventDefault();

  // 2 dedos → iniciar pinch-zoom
  if (e.touches.length === 2) {
    rdIsDragging = false;
    rdDraggingPointIndex = -1;
    rdZoomState.isPinching = true;
    rdZoomState.isPanning = false;
    rdZoomState.pinchStartDist = getTouchDistance(e.touches[0], e.touches[1]);
    rdZoomState.pinchStartScale = rdZoomState.scale;
    rdZoomState.pinchCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    rdZoomState.pinchCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    return;
  }

  // Ignorar 1 dedo si estamos en medio de un pinch
  if (rdZoomState.isPinching) return;

  // Modo rápel: colocar o eliminar punto de rápel
  if (rdRapelMode) {
    const { x, y } = getCanvasCoordinates(e, true);
    handleRapelClick(x, y);
    return;
  }

  // Modo bifurcación
  if (rdBifurcationMode) {
    const { x, y } = getCanvasCoordinates(e, true);
    handleBifurcationClick(x, y);
    return;
  }

  // Sin vía seleccionada: pan con 1 dedo si hay zoom activo
  if (!rdDrawingMode || !rdCurrentRoute) {
    if (rdZoomState.scale > 1) {
      rdZoomState.isPanning = true;
      rdZoomState.panStartX = e.touches[0].clientX;
      rdZoomState.panStartY = e.touches[0].clientY;
      rdZoomState.lastTranslateX = rdZoomState.translateX;
      rdZoomState.lastTranslateY = rdZoomState.translateY;
    }
    return;
  }

  const { x, y } = getCanvasCoordinates(e, true);
  const pointIndex = findNearestPointIndex(x, y);
  if (pointIndex !== -1) {
    rdDraggingPointIndex = pointIndex;
    rdIsDragging = true;
    rdSelectedPointIndex = pointIndex;
    updateInstructions(`Arrastrando punto ${pointIndex + 1}. Suelta para posicionar.`);
  } else {
    handleDrawingPoint(x, y);
  }
}

/**
 * Maneja movimiento táctil en el canvas
 */
function handleCanvasTouchMove(e) {
  e.preventDefault();

  // 2 dedos → pinch-zoom
  if (e.touches.length === 2) {
    if (!rdZoomState.isPinching) {
      // Segundo dedo llegó mientras el primero ya estaba abajo → transición a pinch
      rdZoomState.isPinching = true;
      rdZoomState.isPanning = false;
      rdIsDragging = false;
      rdDraggingPointIndex = -1;
      rdZoomState.pinchStartDist = getTouchDistance(e.touches[0], e.touches[1]);
      rdZoomState.pinchStartScale = rdZoomState.scale;
      rdZoomState.pinchCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      rdZoomState.pinchCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      return;
    }

    const currentDist = getTouchDistance(e.touches[0], e.touches[1]);
    const rawScale = rdZoomState.pinchStartScale * (currentDist / rdZoomState.pinchStartDist);
    const newScale = Math.max(rdZoomState.minScale, Math.min(rdZoomState.maxScale, rawScale));

    const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const container = document.getElementById('rd-canvas-container');
    const rect = container.getBoundingClientRect();
    const pivotX = rdZoomState.pinchCenterX - (rect.left + rect.width / 2);
    const pivotY = rdZoomState.pinchCenterY - (rect.top + rect.height / 2);

    const sf = newScale / rdZoomState.scale;
    rdZoomState.translateX = rdZoomState.translateX * sf - pivotX * (sf - 1)
                             + (currentCenterX - rdZoomState.pinchCenterX);
    rdZoomState.translateY = rdZoomState.translateY * sf - pivotY * (sf - 1)
                             + (currentCenterY - rdZoomState.pinchCenterY);
    rdZoomState.pinchCenterX = currentCenterX;
    rdZoomState.pinchCenterY = currentCenterY;
    rdZoomState.scale = newScale;
    rdConstrainPan();
    rdApplyZoomTransform(true);
    return;
  }

  // 1 dedo: pan cuando no hay vía seleccionada y hay zoom activo
  if (rdZoomState.isPanning) {
    rdZoomState.translateX = rdZoomState.lastTranslateX + (e.touches[0].clientX - rdZoomState.panStartX);
    rdZoomState.translateY = rdZoomState.lastTranslateY + (e.touches[0].clientY - rdZoomState.panStartY);
    rdConstrainPan();
    rdApplyZoomTransform(true);
    return;
  }

  // 1 dedo: arrastrar punto existente
  if (!rdDrawingMode || !rdCurrentRoute) return;
  if (!rdIsDragging || rdDraggingPointIndex === -1) return;

  const { x, y } = getCanvasCoordinates(e, true);
  rdDrawingPoints[rdDraggingPointIndex] = canvasToImageCoords(x, y);
  redrawCanvas();
}

/**
 * Maneja cuando se termina el toque
 */
function handleCanvasTouchEnd(e) {
  // Fin de pinch (se levantó un dedo)
  if (rdZoomState.isPinching && e.touches.length < 2) {
    rdZoomState.isPinching = false;
    if (rdZoomState.scale < rdZoomState.minScale) rdResetZoom();
    return;
  }

  if (rdZoomState.isPanning) {
    rdZoomState.isPanning = false;
    return;
  }

  if (rdIsDragging && rdDraggingPointIndex !== -1) {
    showRDToast(`Punto ${rdDraggingPointIndex + 1} movido`, 'success');
    updateInstructions(`Punto movido. Continúa editando o haz clic en "Terminar".`);
  }

  rdIsDragging = false;
  rdDraggingPointIndex = -1;
  updateDrawingControls();
}

/**
 * Zoom con rueda del ratón (web desktop)
 */
function handleCanvasWheel(e) {
  e.preventDefault();
  const container = document.getElementById('rd-canvas-container');
  const rect = container.getBoundingClientRect();
  const mouseX = e.clientX - (rect.left + rect.width / 2);
  const mouseY = e.clientY - (rect.top + rect.height / 2);
  const delta = e.deltaY > 0 ? -0.15 : 0.15;
  const oldScale = rdZoomState.scale;
  const newScale = Math.max(rdZoomState.minScale, Math.min(rdZoomState.maxScale, oldScale + delta));
  if (newScale === oldScale) return;
  const sf = newScale / oldScale;
  rdZoomState.translateX = rdZoomState.translateX * sf - mouseX * (sf - 1);
  rdZoomState.translateY = rdZoomState.translateY * sf - mouseY * (sf - 1);
  rdZoomState.scale = newScale;
  rdConstrainPan();
  rdApplyZoomTransform(false);
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
 * Si estamos dibujando una rama, prefija con el forkPoint
 */
function drawTemporaryLine() {
  if (rdDrawingPoints.length === 0 && !rdActiveForkPoint) return;

  // Usar dimensiones lógicas para el escalado (sin DPR)
  const displayWidth = rdCanvas.displayWidth || rdCanvas.width;
  const displayHeight = rdCanvas.displayHeight || rdCanvas.height;
  const scaleX = displayWidth / rdImage.width;
  const scaleY = displayHeight / rdImage.height;

  // Si estamos dibujando una rama, incluir forkPoint al inicio
  let allPoints = rdDrawingPoints;
  let forkOffset = 0;
  if (rdCurrentBranchId > 0 && rdActiveForkPoint) {
    allPoints = [rdActiveForkPoint, ...rdDrawingPoints];
    forkOffset = 1; // Para no contar el forkPoint como punto editable
  }

  if (allPoints.length === 0) return;

  const scaledPoints = allPoints.map(p => ({
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

  // Dibujar diamante en forkPoint si es una rama
  if (forkOffset > 0 && scaledPoints.length > 0) {
    drawForkDiamond(scaledPoints[0].x, scaledPoints[0].y, color);
  }

  // Dibujar puntos editables (excluir forkPoint del conteo editable)
  for (let i = forkOffset; i < scaledPoints.length; i++) {
    const editIndex = i - forkOffset;
    const isBeingDragged = rdIsDragging && rdDraggingPointIndex === editIndex;
    const isSelected = rdSelectedPointIndex === editIndex;
    drawEditablePoint(scaledPoints[i].x, scaledPoints[i].y, editIndex, color, isBeingDragged, isSelected);
  }
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
  const route = rdRoutesList.find(r => r.routeId === rdCurrentRoute.routeId);
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
          ${Object.values(RD_ANCHOR_TYPES).filter(a => a.id !== 'sin_terminar').map(anchor => `
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
          <div class="rd-anchor-separator">
            <span>o bien...</span>
          </div>
          <button class="rd-anchor-option rd-anchor-option-unfinished" data-anchor="sin_terminar" onclick="selectAnchorType('sin_terminar')">
            <div class="rd-anchor-icon" style="color: ${gradeColor}">
              ${getAnchorSVG('sin_terminar')}
            </div>
            <div class="rd-anchor-info">
              <span class="rd-anchor-name">${RD_ANCHOR_TYPES.sin_terminar.name}</span>
              <span class="rd-anchor-desc">${RD_ANCHOR_TYPES.sin_terminar.description}</span>
            </div>
          </button>
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

  // Modo rama: guardar como branch del drawing existente
  if (rdCurrentBranchId > 0 && rdBifurcatingDrawing) {
    await saveBranch(anchorType);
    return;
  }

  // Modo edición de rama existente
  if (rdEditMode && rdCurrentBranchId > 0 && rdOriginalDrawing) {
    await saveEditedBranch(anchorType);
    return;
  }

  const isEditing = rdEditMode && rdOriginalDrawing;

  const drawing = {
    routeId: rdCurrentRoute.routeId,
    routeName: rdCurrentRoute.nombre,
    points: rdDrawingPoints,
    anchorType: anchorType,
    createdAt: isEditing ? rdOriginalDrawing.createdAt : new Date().toISOString(),
    createdBy: isEditing ? rdOriginalDrawing.createdBy : auth.currentUser?.uid,
    ...(isEditing && {
      updatedAt: new Date().toISOString(),
      updatedBy: auth.currentUser?.uid
    })
  };

  // Preservar branches existentes si estamos editando el tronco
  if (isEditing && rdOriginalDrawing.branches && rdOriginalDrawing.branches.length > 0) {
    drawing.branches = rdOriginalDrawing.branches;
  }

  // Guardar dibujo
  await saveRouteDrawing(drawing, isEditing);

  // Resetear estado de dibujo
  rdDrawingPoints = [];
  rdDrawingMode = false;
  rdCurrentRoute = null;
  rdEditMode = false;
  rdOriginalDrawing = null;
  rdCurrentBranchId = -1;
  rdBranchesData = [];
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
 * Guarda una nueva rama en el drawing existente
 */
async function saveBranch(anchorType) {
  if (!rdBifurcatingDrawing || !rdActiveForkPoint || rdDrawingPoints.length < 2) {
    showRDToast('Error: datos de bifurcación incompletos', 'error');
    return;
  }

  // Crear objeto de rama
  const branch = {
    branchId: rdCurrentBranchId,
    forkPointIndex: rdActiveForkSegmentIndex,
    forkPoint: rdActiveForkPoint,
    points: [...rdDrawingPoints],
    anchorType: anchorType
  };

  // Añadir rama al drawing
  if (!rdBifurcatingDrawing.branches) {
    rdBifurcatingDrawing.branches = [];
  }
  rdBifurcatingDrawing.branches.push(branch);
  rdBifurcatingDrawing.updatedAt = new Date().toISOString();
  rdBifurcatingDrawing.updatedBy = auth.currentUser?.uid;

  // Guardar en Firestore
  try {
    const docId = `${rdCurrentSector.schoolId}_${normalizeSectorName(rdCurrentSector.sectorName)}`;
    const docRef = db.collection('sector_route_drawings').doc(docId);
    const doc = await docRef.get();

    let allDrawings = [];
    if (doc.exists) {
      allDrawings = doc.data().drawings || [];
      // Reemplazar el drawing actualizado
      allDrawings = allDrawings.map(d => {
        if ((d.routeId !== undefined && d.routeId === rdBifurcatingDrawing.routeId) ||
            (d.routeId === undefined && d.routeName === rdBifurcatingDrawing.routeName)) {
          return rdBifurcatingDrawing;
        }
        return d;
      });
    }

    await docRef.set({
      schoolId: rdCurrentSector.schoolId,
      sectorName: rdCurrentSector.sectorName,
      drawings: allDrawings,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: auth.currentUser?.uid
    }, { merge: true });

    // Actualizar array local
    rdRouteDrawings = rdRouteDrawings.map(d => {
      if ((d.routeId !== undefined && d.routeId === rdBifurcatingDrawing.routeId) ||
          (d.routeId === undefined && d.routeName === rdBifurcatingDrawing.routeName)) {
        return rdBifurcatingDrawing;
      }
      return d;
    });

    showRDToast(`Ramal ${rdCurrentBranchId} guardado correctamente`, 'success');

  } catch (error) {
    console.error('[RouteDrawing] Error guardando rama:', error);
    showRDToast('Error al guardar rama: ' + error.message, 'error');
    // Revertir
    rdBifurcatingDrawing.branches = rdBifurcatingDrawing.branches.filter(b => b.branchId !== rdCurrentBranchId);
  }

  // Resetear estado
  rdDrawingPoints = [];
  rdDrawingMode = false;
  rdCurrentRoute = null;
  rdBifurcatingDrawing = null;
  rdActiveForkPoint = null;
  rdActiveForkSegmentIndex = -1;
  rdCurrentBranchId = -1;
  updateDrawingControls();

  // Actualizar lista y redibujar
  const routeListEl = document.getElementById('rd-route-list');
  if (routeListEl) routeListEl.innerHTML = renderRoutesList();
  redrawCanvas();

  updateInstructions('Ramal guardado. Selecciona otra vía para continuar.');
}

/**
 * Guarda una rama editada
 */
async function saveEditedBranch(anchorType) {
  if (!rdOriginalDrawing || rdCurrentBranchId <= 0) return;

  // Buscar el drawing en rdRouteDrawings (fue restaurado al entrar en edit)
  const targetDrawing = rdRouteDrawings.find(d =>
    (d.routeId !== undefined && d.routeId === rdOriginalDrawing.routeId) ||
    (d.routeId === undefined && d.routeName === rdOriginalDrawing.routeName)
  );

  if (!targetDrawing) {
    // El drawing fue removido por editRouteDrawing, restaurarlo
    const drawing = JSON.parse(JSON.stringify(rdOriginalDrawing));
    // Actualizar la rama editada
    if (drawing.branches) {
      const branchIdx = drawing.branches.findIndex(b => b.branchId === rdCurrentBranchId);
      if (branchIdx !== -1) {
        drawing.branches[branchIdx].points = [...rdDrawingPoints];
        drawing.branches[branchIdx].anchorType = anchorType;
      }
    }
    drawing.updatedAt = new Date().toISOString();
    drawing.updatedBy = auth.currentUser?.uid;

    rdRouteDrawings.push(drawing);
    await saveRouteDrawing(drawing, true);
  }

  // Resetear estado
  rdDrawingPoints = [];
  rdDrawingMode = false;
  rdCurrentRoute = null;
  rdEditMode = false;
  rdOriginalDrawing = null;
  rdCurrentBranchId = -1;
  rdBranchesData = [];
  updateDrawingControls();

  const routeListEl = document.getElementById('rd-route-list');
  if (routeListEl) routeListEl.innerHTML = renderRoutesList();
  redrawCanvas();

  updateInstructions('Ramal actualizado. Selecciona otra vía para continuar.');
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
    case 'sin_terminar':
      // Flecha indicando vía sin terminar
      return `
        <svg viewBox="0 0 60 80" width="40" height="53">
          <path d="M30 5 L30 55" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
          <path d="M15 40 L30 58 L45 40" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="18" y1="68" x2="42" y2="68" stroke="currentColor" stroke-width="4" stroke-dasharray="4 4" stroke-linecap="round"/>
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

  // Limpiar estado de bifurcación
  rdBifurcationMode = false;
  rdBifurcatingDrawing = null;
  rdActiveForkPoint = null;
  rdActiveForkSegmentIndex = -1;
  rdCurrentBranchId = -1;
  rdBranchesData = [];

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
function editRouteDrawing(routeId) {
  const route = rdRoutesList.find(r => r.routeId === routeId);

  if (!route) {
    showRDToast('Vía no encontrada', 'error');
    return;
  }

  // Buscar el dibujo existente
  const existingDrawing = rdRouteDrawings.find(d => d.routeId === route.routeId || (!d.routeId && d.routeName === route.nombre));
  if (!existingDrawing) {
    showRDToast('Esta vía no tiene un dibujo para editar', 'warning');
    return;
  }

  // Si tiene ramas, mostrar selector de rama
  if (existingDrawing.branches && existingDrawing.branches.length > 0) {
    showBranchSelector(route, existingDrawing);
    return;
  }

  // Edición normal (sin ramas) - editar tronco directamente
  startEditingBranch(route, existingDrawing, -1);
}

/**
 * Muestra selector de rama para editar
 */
function showBranchSelector(route, drawing) {
  const existing = document.getElementById('rd-branch-modal');
  if (existing) existing.remove();

  const gradeColor = getGradeColor(route.grado);

  const modal = document.createElement('div');
  modal.id = 'rd-branch-modal';
  modal.className = 'rd-modal-overlay';
  modal.innerHTML = `
    <div class="rd-modal-container rd-branch-modal-container">
      <div class="rd-modal-header">
        <h3>Editar: ${route.nombre}</h3>
        <span class="rd-route-grade-header" style="background-color: ${gradeColor}">${route.grado}</span>
      </div>
      <div class="rd-modal-body">
        <p>Selecciona qué parte editar:</p>
        <div class="rd-branch-options">
          <button class="rd-branch-option rd-branch-trunk" onclick="closeBranchSelector(); startEditingBranch(rdRoutesList.find(r => r.routeId === ${route.routeId}), rdRouteDrawings.find(d => d.routeId === ${route.routeId}), -1)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="2" x2="12" y2="22"/>
            </svg>
            Tronco principal
            <span class="rd-branch-points">${drawing.points.length} puntos</span>
          </button>
          ${drawing.branches.map(branch => `
            <button class="rd-branch-option" onclick="closeBranchSelector(); startEditingBranch(rdRoutesList.find(r => r.routeId === ${route.routeId}), rdRouteDrawings.find(d => d.routeId === ${route.routeId}), ${branch.branchId})">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 3v12"/>
                <circle cx="18" cy="18" r="3"/>
                <path d="M6 15c0 3 6 3 9 6"/>
              </svg>
              Ramal ${branch.branchId}
              <span class="rd-branch-points">${branch.points.length} puntos</span>
            </button>
          `).join('')}
        </div>
        <div class="rd-branch-delete-section">
          ${drawing.branches.map(branch => `
            <button class="rd-branch-delete-btn" onclick="closeBranchSelector(); deleteBranch(${route.routeId}, ${branch.branchId})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              Eliminar Ramal ${branch.branchId}
            </button>
          `).join('')}
        </div>
      </div>
      <div class="rd-modal-footer">
        <button class="rd-modal-btn rd-modal-btn-cancel" onclick="closeBranchSelector()">Cancelar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeBranchSelector();
  });
}

function closeBranchSelector() {
  const modal = document.getElementById('rd-branch-modal');
  if (modal) modal.remove();
}

/**
 * Inicia la edición de una rama o tronco específico
 * @param {Object} route - Datos de la vía
 * @param {Object} drawing - Drawing completo
 * @param {number} branchId - -1 para tronco, >0 para rama
 */
function startEditingBranch(route, drawing, branchId) {
  if (!route || !drawing) return;

  // Guardar el dibujo original por si se cancela
  rdOriginalDrawing = JSON.parse(JSON.stringify(drawing));

  rdCurrentRoute = route;
  rdEditMode = true;
  rdDrawingMode = true;
  rdCurrentBranchId = branchId;

  if (branchId > 0) {
    // Editando una rama
    const branch = drawing.branches.find(b => b.branchId === branchId);
    if (!branch) {
      showRDToast('Rama no encontrada', 'error');
      return;
    }
    rdDrawingPoints = [...branch.points];
    rdActiveForkPoint = branch.forkPoint;
    rdActiveForkSegmentIndex = branch.forkPointIndex;
  } else {
    // Editando tronco
    if (drawing.points && drawing.points.length > 0) {
      rdDrawingPoints = [...drawing.points];
    } else if (drawing.startPoint && drawing.endPoint) {
      rdDrawingPoints = [drawing.startPoint, drawing.endPoint];
    } else {
      rdDrawingPoints = [];
    }
  }

  // Eliminar temporalmente el dibujo del array para que no se muestre duplicado
  rdRouteDrawings = rdRouteDrawings.filter(d => {
    if (d.routeId !== undefined && route.routeId !== undefined) return d.routeId !== route.routeId;
    if (d.routeId === undefined && route.routeId === undefined) return d.routeName !== route.nombre;
    return true;
  });

  // Cerrar panel de vías para poder editar
  const panel = document.getElementById('rd-routes-panel');
  if (panel && !panel.classList.contains('rd-panel-collapsed')) {
    panel.classList.add('rd-panel-collapsed');
  }

  const editTarget = branchId > 0 ? `Ramal ${branchId}` : 'Tronco';
  updateInstructions(`Editando ${editTarget} de: ${route.nombre}. Arrastra puntos para mover, doble clic para eliminar.`);
  updateDrawingControls();

  document.getElementById('rd-route-list').innerHTML = renderRoutesList();
  redrawCanvas();

  console.log('[RouteDrawing] Editando vía:', route.nombre, 'rama:', branchId, 'con', rdDrawingPoints.length, 'puntos');
}

/**
 * Elimina una rama específica de un drawing
 */
async function deleteBranch(routeId, branchId) {
  const route = rdRoutesList.find(r => r.routeId === routeId);
  if (!route) return;

  const drawing = rdRouteDrawings.find(d =>
    d.routeId === route.routeId || (!d.routeId && d.routeName === route.nombre)
  );
  if (!drawing || !drawing.branches) return;

  if (!confirm(`¿Eliminar Ramal ${branchId} de "${route.nombre}"?`)) return;

  // Eliminar la rama
  drawing.branches = drawing.branches.filter(b => b.branchId !== branchId);

  // Si no quedan ramas, eliminar el campo branches
  if (drawing.branches.length === 0) {
    delete drawing.branches;
  }

  drawing.updatedAt = new Date().toISOString();
  drawing.updatedBy = auth.currentUser?.uid;

  try {
    const docId = `${rdCurrentSector.schoolId}_${normalizeSectorName(rdCurrentSector.sectorName)}`;
    const docRef = db.collection('sector_route_drawings').doc(docId);
    const doc = await docRef.get();

    if (doc.exists) {
      let allDrawings = doc.data().drawings || [];
      allDrawings = allDrawings.map(d => {
        if ((d.routeId !== undefined && d.routeId === drawing.routeId) ||
            (d.routeId === undefined && d.routeName === drawing.routeName)) {
          return drawing;
        }
        return d;
      });

      await docRef.set({
        schoolId: rdCurrentSector.schoolId,
        sectorName: rdCurrentSector.sectorName,
        drawings: allDrawings,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth.currentUser?.uid
      }, { merge: true });
    }

    showRDToast(`Ramal ${branchId} eliminado`, 'success');

    document.getElementById('rd-route-list').innerHTML = renderRoutesList();
    redrawCanvas();

  } catch (error) {
    console.error('[RouteDrawing] Error eliminando rama:', error);
    showRDToast('Error al eliminar rama: ' + error.message, 'error');
  }
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

  // Limpiar estado de bifurcación/ramas
  rdCurrentBranchId = -1;
  rdBranchesData = [];
  rdActiveForkPoint = null;
  rdActiveForkSegmentIndex = -1;

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
function selectRouteForDrawing(routeId) {
  const route = rdRoutesList.find(r => r.routeId === routeId);

  if (!route) return;

  // Verificar si ya existe un dibujo
  const existingDrawing = rdRouteDrawings.find(d => d.routeId === route.routeId || (!d.routeId && d.routeName === route.nombre));
  if (existingDrawing) {
    // Mostrar modal con opciones: Editar / Bifurcar / Cancelar
    showRouteActionModal(route, existingDrawing);
    return;
  }

  // Desactivar modo rápel si está activo
  if (rdRapelMode) {
    rdRapelMode = false;
    const rapelBtn = document.getElementById('rd-btn-rapel');
    if (rapelBtn) rapelBtn.classList.remove('rd-btn-rapel-active');
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

  console.log('[RouteDrawing] Vía seleccionada:', route.nombre, 'id:', route.routeId);
}

// ============================================
// BIFURCACIÓN: INTERACCIÓN
// ============================================

/**
 * Muestra modal con opciones cuando se selecciona una vía que ya tiene dibujo
 * Opciones: Editar / Bifurcar / Cancelar
 */
function showRouteActionModal(route, existingDrawing) {
  const existing = document.getElementById('rd-action-modal');
  if (existing) existing.remove();

  const gradeColor = getGradeColor(route.grado);
  const hasBranches = existingDrawing.branches && existingDrawing.branches.length > 0;
  const branchCount = hasBranches ? existingDrawing.branches.length : 0;

  const modal = document.createElement('div');
  modal.id = 'rd-action-modal';
  modal.className = 'rd-modal-overlay';
  modal.innerHTML = `
    <div class="rd-modal-container rd-action-modal-container">
      <div class="rd-modal-header">
        <h3>${route.nombre}</h3>
        <span class="rd-route-grade-header" style="background-color: ${gradeColor}">${route.grado}</span>
      </div>
      <div class="rd-modal-body">
        <p>Esta vía ya tiene un dibujo${hasBranches ? ` con ${branchCount} ramal(es)` : ''}. ¿Qué quieres hacer?</p>
        <div class="rd-action-options">
          <button class="rd-action-btn rd-action-edit" onclick="closeRouteActionModal(); editRouteDrawing(${route.routeId})">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            Editar
          </button>
          <button class="rd-action-btn rd-action-bifurcate" onclick="closeRouteActionModal(); startBifurcation(${route.routeId})">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 3v12"/>
              <circle cx="18" cy="6" r="3"/>
              <circle cx="18" cy="18" r="3"/>
              <path d="M6 15c0-3 6-3 9-6"/>
              <path d="M6 15c0 3 6 3 9 6"/>
            </svg>
            Bifurcar
          </button>
        </div>
      </div>
      <div class="rd-modal-footer">
        <button class="rd-modal-btn rd-modal-btn-cancel" onclick="closeRouteActionModal()">Cancelar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeRouteActionModal();
  });
}

/**
 * Cierra el modal de acciones de vía
 */
function closeRouteActionModal() {
  const modal = document.getElementById('rd-action-modal');
  if (modal) modal.remove();
}

/**
 * Inicia el modo bifurcación: el usuario debe tocar la línea para crear el punto de bifurcación
 */
function startBifurcation(routeId) {
  const route = rdRoutesList.find(r => r.routeId === routeId);
  if (!route) return;

  const existingDrawing = rdRouteDrawings.find(d =>
    d.routeId === route.routeId || (!d.routeId && d.routeName === route.nombre)
  );
  if (!existingDrawing) {
    showRDToast('No se encontró el dibujo de la vía', 'error');
    return;
  }

  rdCurrentRoute = route;
  rdBifurcationMode = true;
  rdBifurcatingDrawing = existingDrawing;

  // Cerrar panel de vías
  const panel = document.getElementById('rd-routes-panel');
  if (panel && !panel.classList.contains('rd-panel-collapsed')) {
    panel.classList.add('rd-panel-collapsed');
  }

  // Resaltar la vía en el canvas
  redrawCanvas();

  updateInstructions('Toca sobre la línea de la vía para crear un punto de bifurcación.');
  rdCanvas.style.cursor = 'crosshair';

  // Mostrar controles con botón cancelar
  const controlsDiv = document.getElementById('rd-drawing-controls');
  if (controlsDiv) {
    controlsDiv.style.display = 'flex';
    controlsDiv.innerHTML = `
      <button class="rd-btn-control rd-btn-cancel" onclick="rdCancelBifurcation()" title="Cancelar bifurcación">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        Cancelar
      </button>
    `;
  }

  console.log('[RouteDrawing] Modo bifurcación activado para:', route.nombre);
}

/**
 * Maneja el click en el canvas durante modo bifurcación
 * Busca el segmento más cercano y crea un punto de bifurcación
 */
function handleBifurcationClick(canvasX, canvasY) {
  if (!rdBifurcatingDrawing) return;

  const nearest = findNearestSegmentOnDrawing(canvasX, canvasY, rdBifurcatingDrawing);

  if (!nearest) {
    showRDToast('Toca más cerca de la línea de la vía', 'warning');
    return;
  }

  // Crear el punto de bifurcación
  rdActiveForkPoint = nearest.projectedPoint;
  rdActiveForkSegmentIndex = nearest.segmentIndex;

  // Calcular branchId: siguiente ID disponible
  const existingBranches = rdBifurcatingDrawing.branches || [];
  const maxId = existingBranches.reduce((max, b) => Math.max(max, b.branchId), 0);
  rdCurrentBranchId = maxId + 1;

  // Salir de modo bifurcación y entrar en modo dibujo de rama
  rdBifurcationMode = false;
  rdDrawingMode = true;
  rdDrawingPoints = [];

  // Restaurar controles normales de dibujo
  const controlsDiv = document.getElementById('rd-drawing-controls');
  if (controlsDiv) {
    controlsDiv.innerHTML = `
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
    `;
  }

  updateInstructions(`Bifurcación creada (Ramal ${rdCurrentBranchId}). Toca para añadir puntos de la nueva rama.`);
  updateDrawingControls();
  redrawCanvas();

  console.log('[RouteDrawing] Fork creado en segmento', rdActiveForkSegmentIndex,
    'punto:', rdActiveForkPoint, 'branchId:', rdCurrentBranchId);
}

/**
 * Cancela el modo bifurcación sin crear rama
 */
function rdCancelBifurcation() {
  rdBifurcationMode = false;
  rdBifurcatingDrawing = null;
  rdCurrentRoute = null;
  rdActiveForkPoint = null;
  rdActiveForkSegmentIndex = -1;
  rdCurrentBranchId = -1;

  // Ocultar controles
  const controlsDiv = document.getElementById('rd-drawing-controls');
  if (controlsDiv) {
    controlsDiv.style.display = 'none';
    // Restaurar HTML original de controles
    controlsDiv.innerHTML = `
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
    `;
  }

  rdCanvas.style.cursor = 'default';
  updateInstructions('Bifurcación cancelada. Selecciona una vía para continuar.');
  redrawCanvas();
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
        allDrawings = allDrawings.filter(d => {
          if (d.routeId !== undefined && drawing.routeId !== undefined) return d.routeId !== drawing.routeId;
          return d.routeName !== drawing.routeName;
        });
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
async function deleteRouteDrawing(routeId) {
  const route = rdRoutesList.find(r => r.routeId === routeId);
  const displayName = route ? route.nombre : routeId;

  if (!confirm(`¿Eliminar dibujo de "${displayName}"?`)) return;

  try {
    const docId = `${rdCurrentSector.schoolId}_${normalizeSectorName(rdCurrentSector.sectorName)}`;

    // Remover del array local
    rdRouteDrawings = rdRouteDrawings.filter(d => {
      if (d.routeId !== undefined && routeId !== undefined) return d.routeId !== routeId;
      return d.routeName !== displayName;
    });

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
// SISTEMA DE PUNTOS DE RÁPEL
// ============================================

/**
 * Activa/desactiva el modo rápel
 */
function rdToggleRapelMode() {
  // Si estamos dibujando una vía, no permitir
  if (rdDrawingMode) {
    showRDToast('Termina o cancela el dibujo actual antes de colocar rápeles', 'warning');
    return;
  }
  if (rdBifurcationMode) {
    showRDToast('Termina o cancela la bifurcación antes de colocar rápeles', 'warning');
    return;
  }

  rdRapelMode = !rdRapelMode;

  // Actualizar estado visual del botón
  const btn = document.getElementById('rd-btn-rapel');
  if (btn) {
    btn.classList.toggle('rd-btn-rapel-active', rdRapelMode);
  }

  if (rdRapelMode) {
    rdCanvas.style.cursor = 'crosshair';
    updateInstructions('Modo rápel: toca para colocar un punto. Toca uno existente para eliminarlo.');
  } else {
    rdCanvas.style.cursor = 'default';
    updateInstructions('Selecciona una vía de la lista para dibujar su línea en la imagen');
  }
}

/**
 * Maneja un clic en modo rápel
 */
function handleRapelClick(canvasX, canvasY) {
  const imageCoords = canvasToImageCoords(canvasX, canvasY);

  // Comprobar si el clic está cerca de un rápel existente (para eliminar)
  const hitIndex = findNearestRapelPoint(imageCoords.x, imageCoords.y);

  if (hitIndex !== -1) {
    // Eliminar el punto
    rdRapelPoints.splice(hitIndex, 1);
    showRDToast('Punto de rápel eliminado', 'info');
  } else {
    // Añadir nuevo punto
    rdRapelPoints.push({
      x: imageCoords.x,
      y: imageCoords.y,
      id: Date.now()
    });
    showRDToast('Punto de rápel colocado', 'success');
  }

  // Guardar y redibujar
  saveRapelPoints();
  redrawCanvas();
}

/**
 * Busca el punto de rápel más cercano al clic
 */
function findNearestRapelPoint(imgX, imgY) {
  const hitRadius = 20; // En coordenadas de imagen
  let nearestIndex = -1;
  let nearestDist = Infinity;

  rdRapelPoints.forEach((pt, i) => {
    const dx = pt.x - imgX;
    const dy = pt.y - imgY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < hitRadius && dist < nearestDist) {
      nearestDist = dist;
      nearestIndex = i;
    }
  });

  return nearestIndex;
}

/**
 * Dibuja todos los puntos de rápel en el canvas del editor
 */
function drawRapelPoints() {
  if (rdRapelPoints.length === 0) return;

  const displayWidth = rdCanvas.displayWidth || rdCanvas.width;
  const displayHeight = rdCanvas.displayHeight || rdCanvas.height;
  const scaleX = displayWidth / rdImage.width;
  const scaleY = displayHeight / rdImage.height;
  const color = RD_COLORS.rapel;
  const size = 14;

  rdRapelPoints.forEach(pt => {
    const cx = pt.x * scaleX;
    const cy = pt.y * scaleY;
    rdCtx.save();
    rdCtx.translate(cx, cy);
    drawRapelIcon(rdCtx, 0, 0, size, color);
    rdCtx.restore();
  });
}

/**
 * Dibuja un icono de rápel genérico (reutilizable por editor y visor)
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 */
function drawRapelIcon(ctx, x, y, size, color) {
  const scale = size / 20;
  const outlineColor = 'white';

  // Anillo de rápel (arriba)
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y - 14 * scale, 7 * scale, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - 14 * scale, 7 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Agujero del anillo
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(x, y - 14 * scale, 3 * scale, 0, Math.PI * 2);
  ctx.fill();

  // Cuerda izquierda descendente (zigzag)
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 4 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 3 * scale, y - 7 * scale);
  ctx.lineTo(x - 7 * scale, y - 1 * scale);
  ctx.lineTo(x - 3 * scale, y + 5 * scale);
  ctx.lineTo(x - 7 * scale, y + 11 * scale);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(x - 3 * scale, y - 7 * scale);
  ctx.lineTo(x - 7 * scale, y - 1 * scale);
  ctx.lineTo(x - 3 * scale, y + 5 * scale);
  ctx.lineTo(x - 7 * scale, y + 11 * scale);
  ctx.stroke();

  // Cuerda derecha descendente (zigzag)
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 4 * scale;
  ctx.beginPath();
  ctx.moveTo(x + 3 * scale, y - 7 * scale);
  ctx.lineTo(x + 7 * scale, y - 1 * scale);
  ctx.lineTo(x + 3 * scale, y + 5 * scale);
  ctx.lineTo(x + 7 * scale, y + 11 * scale);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(x + 3 * scale, y - 7 * scale);
  ctx.lineTo(x + 7 * scale, y - 1 * scale);
  ctx.lineTo(x + 3 * scale, y + 5 * scale);
  ctx.lineTo(x + 7 * scale, y + 11 * scale);
  ctx.stroke();

  // Puntas de flecha
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  ctx.moveTo(x - 10 * scale, y + 8 * scale);
  ctx.lineTo(x - 7 * scale, y + 11 * scale);
  ctx.lineTo(x - 4 * scale, y + 8 * scale);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.moveTo(x - 10 * scale, y + 8 * scale);
  ctx.lineTo(x - 7 * scale, y + 11 * scale);
  ctx.lineTo(x - 4 * scale, y + 8 * scale);
  ctx.stroke();

  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  ctx.moveTo(x + 4 * scale, y + 8 * scale);
  ctx.lineTo(x + 7 * scale, y + 11 * scale);
  ctx.lineTo(x + 10 * scale, y + 8 * scale);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.moveTo(x + 4 * scale, y + 8 * scale);
  ctx.lineTo(x + 7 * scale, y + 11 * scale);
  ctx.lineTo(x + 10 * scale, y + 8 * scale);
  ctx.stroke();
}

/**
 * Guarda los puntos de rápel en Firestore
 */
async function saveRapelPoints() {
  try {
    const docId = `${rdCurrentSector.schoolId}_${normalizeSectorName(rdCurrentSector.sectorName)}`;
    const docRef = db.collection('sector_route_drawings').doc(docId);

    // Guardar con imageId si aplica
    const rapelData = rdRapelPoints.map(pt => ({
      x: pt.x,
      y: pt.y,
      id: pt.id,
      ...(rdCurrentSector.imageId && { imageId: rdCurrentSector.imageId })
    }));

    // Obtener documento existente para merge
    const doc = await docRef.get();
    let allRapelPoints = [];

    if (doc.exists && doc.data().rapelPoints) {
      allRapelPoints = doc.data().rapelPoints;
      // Filtrar los de esta imagen y reemplazar
      if (rdCurrentSector.imageId) {
        allRapelPoints = allRapelPoints.filter(p => p.imageId !== rdCurrentSector.imageId);
      } else {
        allRapelPoints = allRapelPoints.filter(p => p.imageId);
      }
    }
    allRapelPoints = allRapelPoints.concat(rapelData);

    await docRef.set({
      rapelPoints: allRapelPoints,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: auth.currentUser?.uid
    }, { merge: true });

  } catch (error) {
    console.error('[RouteDrawing] Error guardando puntos de rápel:', error);
    showRDToast('Error al guardar rápel: ' + error.message, 'error');
  }
}

/**
 * Carga los puntos de rápel de Firestore
 */
async function loadRapelPoints(schoolId, sectorName, imageId = null) {
  rdRapelPoints = [];

  try {
    const docId = `${schoolId}_${normalizeSectorName(sectorName)}`;
    const doc = await db.collection('sector_route_drawings').doc(docId).get();

    if (doc.exists && doc.data().rapelPoints) {
      const allRapelPoints = doc.data().rapelPoints;

      if (imageId) {
        rdRapelPoints = allRapelPoints.filter(p => {
          if (p.imageId) return p.imageId === imageId;
          return imageId === 'legacy_0';
        });
      } else {
        rdRapelPoints = allRapelPoints;
      }
    }
  } catch (error) {
    console.error('[RouteDrawing] Error cargando puntos de rápel:', error);
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
  rdSectorImages = [];
  rdCurrentImageIndex = 0;
  rdAutoSelectRouteId = null;

  // Limpiar estado de bifurcación
  rdBifurcationMode = false;
  rdCurrentBranchId = -1;
  rdBranchesData = [];
  rdActiveForkPoint = null;
  rdActiveForkSegmentIndex = -1;
  rdBifurcatingDrawing = null;

  // Limpiar estado de rápel
  rdRapelMode = false;
  rdRapelPoints = [];
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
function addLinkDrawingButtonToRoutePopup(routeId, isAdmin) {
  if (!isAdmin) return '';

  return `
    <button class="ml-route-dev-btn" onclick="openDrawingEditorForRoute(${routeId})">
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
// Funciones para navegación de imágenes
window.selectImageForRoute = selectImageForRoute;
window.rdPrevImage = rdPrevImage;
window.rdNextImage = rdNextImage;
// Funciones para selección de tipo de reunión
window.showAnchorTypeModal = showAnchorTypeModal;
window.closeAnchorModal = closeAnchorModal;
window.selectAnchorType = selectAnchorType;
window.rdToggleRapelMode = rdToggleRapelMode;
window.drawRapelIcon = drawRapelIcon;

console.log('[RouteDrawing] Módulo cargado');
