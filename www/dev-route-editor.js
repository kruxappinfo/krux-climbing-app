/**
 * Developer Route Editor Tool
 *
 * Herramienta de desarrollador para agregar nuevas vías al mapa.
 * Solo disponible para usuarios con rol 'admin' en Firestore.
 *
 * Funcionalidades:
 * - Dibujar puntos de vías en el mapa
 * - Formulario para completar información de la vía
 * - Sincronización con Firestore (pendientes de aprobación)
 * - Descarga de GeoJSON actualizado
 */

// ============================================
// VARIABLES GLOBALES
// ============================================
let devModeActive = false;
let devCurrentSchoolSectors = [];
let devPendingRouteCoords = null;
let devRouteMarker = null;
let devPendingRouteDocId = null; // ID del documento de vía pendiente de dibujo

// ============================================
// VERIFICACIÓN DE PERMISOS
// ============================================

/**
 * Verifica si el usuario actual es administrador
 */
async function isDevAdmin() {
  try {
    const user = auth.currentUser;
    if (!user) return false;

    const adminDoc = await db.collection('admins').doc(user.uid).get();
    return adminDoc.exists && adminDoc.data().role === 'admin';
  } catch (error) {
    console.error('[DevEditor] Error verificando admin:', error);
    return false;
  }
}

// ============================================
// INICIALIZACIÓN DEL BOTÓN
// ============================================

/**
 * Añade el botón de herramienta de desarrollador al mapa
 * Se posiciona justo encima del botón 3D
 */
async function addDevEditorButton() {
  // Verificar si ya existe
  if (document.getElementById('btn-dev-editor')) return;

  // Verificar permisos de admin
  const isAdmin = await isDevAdmin();
  if (!isAdmin) {
    console.log('[DevEditor] Usuario no es admin, botón oculto');
    return;
  }

  const isNative = window.Capacitor !== undefined;

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

  // Posición: encima del botón 3D (bottom: 250px + 46px de altura + 10px de espacio)
  btn.style.cssText = `
    position: absolute;
    bottom: ${isNative ? '306px' : '306px'};
    right: 10px;
    width: 36px;
    height: 36px;
    background: white;
    border: none;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
    font-size: 13px;
    font-weight: 600;
    color: #333;
    cursor: pointer;
    z-index: 1000;
    display: none;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  `;

  btn.addEventListener('click', toggleDevMode);

  document.getElementById('map').appendChild(btn);

  // Actualizar visibilidad con el botón 3D
  if (mlMap) {
    mlMap.on('zoom', updateDevButtonVisibility);
    mlMap.on('zoomend', updateDevButtonVisibility);
    mlMap.on('moveend', updateDevButtonVisibility);
    updateDevButtonVisibility();
  }

  console.log('[DevEditor] Botón de desarrollador añadido');
}

/**
 * Actualiza visibilidad del botón dev según proximidad a escuela
 */
function updateDevButtonVisibility() {
  const btn = document.getElementById('btn-dev-editor');
  if (!btn) return;

  // Mismo criterio que el botón 3D
  const nearSchool = typeof isNearSchool === 'function' ? isNearSchool() : false;

  if (nearSchool && mlCurrentSchool) {
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
 * Toggle del modo desarrollador
 */
function toggleDevMode() {
  if (devModeActive) {
    deactivateDevMode();
  } else {
    activateDevMode();
  }
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
  if (!school || !school.geojson || !school.geojson.sectores) {
    console.warn('[DevEditor] No se encontró configuración de sectores');
    return;
  }

  try {
    const response = await fetch(school.geojson.sectores + '?v=' + Date.now());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const geojson = await response.json();

    if (geojson.features) {
      devCurrentSchoolSectors = geojson.features
        .map(f => f.properties.nombre)
        .filter(name => name && name.trim() !== '')
        .sort();
    }

    console.log('[DevEditor] Sectores cargados:', devCurrentSchoolSectors);
  } catch (error) {
    console.error('[DevEditor] Error cargando sectores:', error);
  }
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
function showDevRouteModal() {
  // Remover modal existente si hay
  closeDevRouteModal();

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
              ${devCurrentSchoolSectors.map(s => `<option value="${s}">${s}</option>`).join('')}
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
      status: 'pending', // pending, approved, rejected

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

    // Abrir automáticamente el editor de dibujo para esta vía
    showDevToast('Ahora dibuja la vía en la imagen del sector', 'info');

    // Desactivar modo dev temporalmente para evitar conflictos
    deactivateDevMode();

    // Abrir editor de dibujo para vincular la vía con la imagen
    setTimeout(() => {
      openDrawingEditorForPendingRoute(routeData.nombre, routeData.sector, docRef.id);
    }, 500);

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

  // Verificar si es admin
  const isAdmin = await isDevAdmin();
  if (!isAdmin) return;

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
 * Se llama después de que el mapa esté listo
 */
function initDevRouteEditor() {
  // Esperar a que el usuario esté autenticado
  if (typeof auth !== 'undefined') {
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        await addDevEditorButton();
      }
    });
  } else {
    // Reintentar después
    setTimeout(initDevRouteEditor, 1000);
  }
}

// Auto-inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Esperar a que MapLibre esté listo
    const checkMap = setInterval(() => {
      if (typeof mlMap !== 'undefined' && mlMap) {
        clearInterval(checkMap);
        initDevRouteEditor();
      }
    }, 500);
  });
} else {
  const checkMap = setInterval(() => {
    if (typeof mlMap !== 'undefined' && mlMap) {
      clearInterval(checkMap);
      initDevRouteEditor();
    }
  }, 500);
}

// Exponer funciones globalmente
window.toggleDevMode = toggleDevMode;
window.closeDevRouteModal = closeDevRouteModal;
window.saveDevRoute = saveDevRoute;
window.exportPendingRoutesAsGeoJSON = exportPendingRoutesAsGeoJSON;
window.loadPendingRoutesFromFirestore = loadPendingRoutesFromFirestore;

console.log('[DevEditor] Módulo cargado');
