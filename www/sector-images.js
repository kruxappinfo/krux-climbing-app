/**
 * Sector Images Module
 *
 * Funcionalidades:
 * - Visualizar GALERÍA de imágenes de sectores con vías dibujadas
 * - Subir múltiples imágenes de sectores (solo admins)
 * - Carrusel horizontal con navegación
 * - Reordenar imágenes (drag & drop)
 * - Dibujar vías en todas las imágenes
 * - Integración con Firebase Storage
 */

// ============================================
// CONFIGURACIÓN
// ============================================
const SECTOR_GALLERY_CONFIG = {
  maxImages: Infinity,       // Sin límite de fotos por sector
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  compressThreshold: 2 * 1024 * 1024, // Comprimir si > 2MB
  maxDimension: 2000         // Máx dimensión en px
};

// ============================================
// VARIABLES GLOBALES
// ============================================
let sectorImageViewerOpen = false;
let currentSectorForImage = null;
let sectorGalleryImages = [];     // Array de imágenes del sector actual
let currentGalleryIndex = 0;      // Índice de la imagen actual en el carrusel
let galleryDragState = null;      // Estado del drag & drop para reordenar

// ============================================
// VARIABLES GLOBALES DE ZOOM
// ============================================
let svZoomState = {
  scale: 1,
  translateX: 0,
  translateY: 0,
  isDragging: false,
  startX: 0,
  startY: 0,
  lastTranslateX: 0,
  lastTranslateY: 0,
  pinchStartDist: 0,
  pinchLastScale: 1,
  minScale: 1,
  maxScale: 3  // Limitado a 3x para mejor estabilidad en móvil
};

// ============================================
// CONTROL DE RESALTADO DURANTE ZOOM
// ============================================
let svHighlightEnabled = true;        // Si el resaltado de vías está habilitado
let svWasPinching = false;            // Si el usuario estaba haciendo pinch zoom
let svHighlightReenableTimer = null;  // Timer para reactivar el resaltado
const SV_HIGHLIGHT_REENABLE_DELAY = 400; // Tiempo en ms para reactivar el resaltado después del zoom
let svPreviousZoomState = false;      // Trackea si estábamos en zoom (scale > 1) para detectar cambios

// ============================================
// VERIFICACIÓN DE ADMIN
// ============================================

/**
 * Verifica si el usuario actual es admin
 * Espera a que Firebase Auth haya restaurado la sesión (crítico en Capacitor/iOS/Android)
 */
async function isSectorImageAdmin() {
  try {
    // Esperar a que auth esté listo (en Capacitor puede tardar en restaurar la sesión)
    if (typeof waitForAuthReady === 'function') {
      await waitForAuthReady();
    }

    const user = auth.currentUser;
    console.log('[SectorImages] Admin check - user:', user ? user.uid : 'NULL', 'isCapacitor:', window.Capacitor !== undefined);
    if (!user) return false;

    const adminDoc = await db.collection('admins').doc(user.uid).get();
    if (!adminDoc.exists) return false;

    const adminData = adminDoc.data();
    // Aceptar admin o spotter como roles con permisos de edición
    const isAdmin = adminData.role === 'admin' || adminData.role === 'spotter';
    console.log('[SectorImages] Admin check - result:', isAdmin, 'role:', adminData.role, 'uid:', user.uid);
    return isAdmin;
  } catch (error) {
    console.error('[SectorImages] Error verificando admin:', error);
    return false;
  }
}

// ============================================
// OBTENER IMÁGENES DEL SECTOR (GALERÍA)
// ============================================

/**
 * Obtiene todas las imágenes de un sector desde Firestore
 * @param {string} schoolId - ID de la escuela
 * @param {string} sectorName - Nombre del sector
 * @returns {Promise<Array>} Array de objetos con info de imágenes
 */
async function getSectorGalleryImages(schoolId, sectorName) {
  try {
    const normalizedName = normalizeSectorName(sectorName);
    const docId = `${schoolId}_${normalizedName}`;

    const doc = await db.collection('sector_images').doc(docId).get();

    if (doc.exists) {
      const data = doc.data();
      // Nuevo formato: array de imágenes
      if (data.images && Array.isArray(data.images)) {
        return data.images;
      }
      // Compatibilidad con formato antiguo (una sola imagen)
      if (data.imageUrl) {
        return [{
          id: 'legacy_0',
          url: data.imageUrl,
          storagePath: data.storagePath || `sector-images/${schoolId}/${normalizedName}.jpg`,
          order: 0,
          uploadedAt: data.uploadedAt,
          uploadedBy: data.uploadedBy
        }];
      }
    }

    // Intentar cargar imagen legacy desde Storage directamente
    const legacyUrl = await getLegacySectorImageUrl(schoolId, sectorName);
    if (legacyUrl) {
      return [{
        id: 'legacy_0',
        url: legacyUrl,
        storagePath: `sector-images/${schoolId}/${normalizedName}.jpg`,
        order: 0
      }];
    }

    return [];
  } catch (error) {
    console.error('[SectorImages] Error obteniendo galería:', error);
    return [];
  }
}

/**
 * Obtiene URL de imagen legacy (formato antiguo)
 */
async function getLegacySectorImageUrl(schoolId, sectorName) {
  try {
    const normalizedName = normalizeSectorName(sectorName);
    const imagePath = `sector-images/${schoolId}/${normalizedName}.jpg`;
    const storageRef = firebase.storage().ref(imagePath);
    return await storageRef.getDownloadURL();
  } catch (error) {
    if (error.code !== 'storage/object-not-found') {
      console.error('[SectorImages] Error obteniendo imagen legacy:', error);
    }
    return null;
  }
}

/**
 * Obtiene la URL de la primera imagen de un sector (compatibilidad)
 * @param {string} schoolId - ID de la escuela
 * @param {string} sectorName - Nombre del sector
 * @returns {Promise<string|null>} URL de la imagen o null
 */
async function getSectorImageUrl(schoolId, sectorName) {
  const images = await getSectorGalleryImages(schoolId, sectorName);
  return images.length > 0 ? images[0].url : null;
}

/**
 * Verifica si existe al menos una imagen para el sector
 */
async function hasSectorImage(schoolId, sectorName) {
  const images = await getSectorGalleryImages(schoolId, sectorName);
  return images.length > 0;
}

/**
 * Obtiene el número de imágenes de un sector
 */
async function getSectorImageCount(schoolId, sectorName) {
  const images = await getSectorGalleryImages(schoolId, sectorName);
  return images.length;
}

/**
 * Normaliza el nombre del sector para usarlo como nombre de archivo
 */
function normalizeSectorName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9]/g, '_')      // Reemplazar caracteres especiales
    .replace(/_+/g, '_')              // Evitar guiones múltiples
    .replace(/^_|_$/g, '');           // Quitar guiones al inicio/final
}

// ============================================
// VISOR DE GALERÍA DEL SECTOR (CARRUSEL)
// ============================================

/**
 * Abre el visor de galería del sector con carrusel horizontal
 * @param {string} schoolId - ID de la escuela
 * @param {string} sectorName - Nombre del sector
 * @param {number} startIndex - Índice inicial (opcional)
 */
async function openSectorImageViewer(schoolId, sectorName, startIndex = 0) {
  currentSectorForImage = { schoolId, sectorName };

  // Obtener todas las imágenes del sector
  sectorGalleryImages = await getSectorGalleryImages(schoolId, sectorName);
  currentGalleryIndex = Math.min(startIndex, Math.max(0, sectorGalleryImages.length - 1));

  const isAdmin = await isSectorImageAdmin();
  const hasImages = sectorGalleryImages.length > 0;

  // Crear el visor
  const viewer = document.createElement('div');
  viewer.id = 'sector-image-viewer';
  viewer.className = 'sector-image-viewer';

  if (hasImages) {
    // Mostrar galería con carrusel
    viewer.innerHTML = `
      <div class="sector-viewer-header">
        <button class="sector-viewer-close" onclick="closeSectorImageViewer()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <div class="sector-viewer-title-container">
          <h2 class="sector-viewer-title">${sectorName}</h2>
          <span class="sector-gallery-counter" id="gallery-counter">${currentGalleryIndex + 1} / ${sectorGalleryImages.length}</span>
        </div>
        <div class="sector-viewer-actions">
          ${isAdmin ? `
            <button class="sector-viewer-draw" onclick="openRouteDrawingEditorForCurrentImage()" title="Dibujar vías">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </button>
              <button class="sector-viewer-upload" onclick="showSectorUploadModal('${schoolId}', '${encodeURIComponent(sectorName)}')" title="Añadir foto">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </button>
            <button class="sector-viewer-manage" onclick="openGalleryManageModal('${schoolId}', '${encodeURIComponent(sectorName)}')" title="Gestionar galería">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Carrusel de imágenes -->
      <div class="sector-gallery-carousel" id="sector-gallery-carousel">
        <div class="gallery-carousel-track" id="gallery-carousel-track">
          ${sectorGalleryImages.map((img, idx) => `
            <div class="gallery-slide ${idx === currentGalleryIndex ? 'active' : ''}" data-index="${idx}">
              <div class="sector-viewer-image-container" id="sector-viewer-container-${idx}">
                <img src="${img.url}" alt="${sectorName} - Foto ${idx + 1}" class="sector-viewer-image" id="sector-full-image-${idx}" data-image-id="${img.id}">
                <canvas id="sector-viewer-canvas-${idx}" class="sector-viewer-canvas" style="display: none;"></canvas>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Navegación del carrusel -->
        ${sectorGalleryImages.length > 1 ? `
          <button class="gallery-nav-btn gallery-nav-prev" onclick="galleryNavigate(-1)" id="gallery-prev-btn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <button class="gallery-nav-btn gallery-nav-next" onclick="galleryNavigate(1)" id="gallery-next-btn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        ` : ''}
      </div>

      <!-- Indicadores de página (dots) -->
      ${sectorGalleryImages.length > 1 ? `
        <div class="gallery-indicators" id="gallery-indicators">
          ${sectorGalleryImages.map((_, idx) => `
            <button class="gallery-dot ${idx === currentGalleryIndex ? 'active' : ''}"
                    data-index="${idx}"
                    onclick="galleryGoTo(${idx})"></button>
          `).join('')}
        </div>
      ` : ''}

      <!-- Botón flotante para añadir más fotos (solo admins) -->
      ${isAdmin ? `
        <button class="gallery-add-fab" onclick="showSectorUploadModal('${schoolId}', '${encodeURIComponent(sectorName)}')" title="Añadir más fotos">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span class="gallery-add-fab-label">Añadir foto</span>
        </button>
      ` : ''}

      <div class="sector-viewer-footer">
        <span class="sector-viewer-hint">
          ${sectorGalleryImages.length > 1 ? 'Desliza para ver más fotos • ' : ''}
          Pellizca para hacer zoom • Toca las líneas para ver información de las vías
          ${isAdmin ? ` • ${sectorGalleryImages.length} fotos` : ''}
        </span>
      </div>
    `;
  } else {
    // No hay imágenes - mostrar placeholder
    viewer.innerHTML = `
      <div class="sector-viewer-header">
        <button class="sector-viewer-close" onclick="closeSectorImageViewer()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <h2 class="sector-viewer-title">${sectorName}</h2>
        ${isAdmin ? `
          <button class="sector-viewer-upload" onclick="showSectorUploadModal('${schoolId}', '${encodeURIComponent(sectorName)}')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </button>
        ` : ''}
      </div>
      <div class="sector-viewer-placeholder">
        <div class="sector-placeholder-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </div>
        <p class="sector-placeholder-text">No hay imágenes disponibles para este sector</p>
        ${isAdmin ? `
          <button class="sector-upload-btn" onclick="showSectorUploadModal('${schoolId}', '${encodeURIComponent(sectorName)}')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Subir imagen del sector
          </button>
        ` : ''}
      </div>
    `;
  }

  document.body.appendChild(viewer);
  sectorImageViewerOpen = true;

  // Configurar carrusel y canvas si hay imágenes
  if (hasImages) {
    setupGalleryCarousel();

    // Si se abre en una imagen distinta a la primera, posicionar el carrusel
    if (currentGalleryIndex > 0) {
      // Mover el track del carrusel a la imagen correcta
      const track = document.getElementById('gallery-carousel-track');
      if (track) {
        track.style.transform = `translateX(-${currentGalleryIndex * 100}%)`;
      }
      // Actualizar dots
      const dots = document.querySelectorAll('.gallery-dot');
      dots.forEach((dot, idx) => {
        dot.classList.toggle('active', idx === currentGalleryIndex);
      });
      // Actualizar slides
      const slides = document.querySelectorAll('.gallery-slide');
      slides.forEach((slide, idx) => {
        slide.classList.toggle('active', idx === currentGalleryIndex);
      });
    }

    // Cargar canvas de la imagen actual
    const currentImage = sectorGalleryImages[currentGalleryIndex];
    if (currentImage) {
      setupSectorViewerCanvasForGallery(schoolId, sectorName, currentGalleryIndex);
    }
  }

  // Cerrar popup del sector
  if (typeof mlSectorPopup !== 'undefined' && mlSectorPopup) {
    mlSectorPopup.remove();
  }

  console.log('[SectorImages] Visor de galería abierto para:', sectorName, '- Imágenes:', sectorGalleryImages.length);
}

/**
 * Configura el carrusel de la galería
 */
function setupGalleryCarousel() {
  const carousel = document.getElementById('sector-gallery-carousel');
  if (!carousel) return;

  let startX = 0;
  let currentX = 0;
  let isDragging = false;

  // Touch events para swipe
  carousel.addEventListener('touchstart', (e) => {
    // NO iniciar swipe del carrusel si hay zoom activo
    if (svZoomState.scale > 1) {
      isDragging = false;
      return;
    }
    if (e.touches.length === 1) {
      startX = e.touches[0].clientX;
      currentX = startX; // Inicializar currentX para evitar navegación accidental sin swipe real
      isDragging = true;
    }
  }, { passive: true });

  carousel.addEventListener('touchmove', (e) => {
    // NO procesar si hay zoom activo
    if (svZoomState.scale > 1) return;
    if (!isDragging) return;
    currentX = e.touches[0].clientX;
  }, { passive: true });

  carousel.addEventListener('touchend', () => {
    // NO procesar si hay zoom activo
    if (svZoomState.scale > 1) return;
    if (!isDragging) return;
    isDragging = false;

    const diff = startX - currentX;
    const threshold = 50; // Mínimo desplazamiento para cambiar

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        galleryNavigate(1); // Siguiente
      } else {
        galleryNavigate(-1); // Anterior
      }
    }
  }, { passive: true });

  // Keyboard navigation
  document.addEventListener('keydown', handleGalleryKeyboard);

  updateGalleryNavButtons();
}

/**
 * Maneja navegación por teclado en la galería
 */
function handleGalleryKeyboard(e) {
  if (!sectorImageViewerOpen) return;

  if (e.key === 'ArrowLeft') {
    galleryNavigate(-1);
  } else if (e.key === 'ArrowRight') {
    galleryNavigate(1);
  } else if (e.key === 'Escape') {
    closeSectorImageViewer();
  }
}

/**
 * Navega en el carrusel
 */
function galleryNavigate(direction) {
  const newIndex = currentGalleryIndex + direction;

  if (newIndex >= 0 && newIndex < sectorGalleryImages.length) {
    galleryGoTo(newIndex);
  }
}

/**
 * Ir a una imagen específica del carrusel
 */
function galleryGoTo(index) {
  if (index < 0 || index >= sectorGalleryImages.length) return;

  // Resetear zoom al cambiar de imagen
  resetZoomState();
  applyZoomTransform();

  // Cerrar popup de vía al cambiar de imagen
  hideLockedPopup();

  // Actualizar índice
  currentGalleryIndex = index;

  // Actualizar clases de slides
  const slides = document.querySelectorAll('.gallery-slide');
  slides.forEach((slide, idx) => {
    slide.classList.toggle('active', idx === index);
  });

  // Actualizar dots
  const dots = document.querySelectorAll('.gallery-dot');
  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === index);
  });

  // Actualizar contador
  const counter = document.getElementById('gallery-counter');
  if (counter) {
    counter.textContent = `${index + 1} / ${sectorGalleryImages.length}`;
  }

  // Mover el track del carrusel
  const track = document.getElementById('gallery-carousel-track');
  if (track) {
    track.style.transform = `translateX(-${index * 100}%)`;
  }

  // Actualizar botones de navegación
  updateGalleryNavButtons();

  // Configurar canvas para la nueva imagen
  if (currentSectorForImage) {
    setupSectorViewerCanvasForGallery(
      currentSectorForImage.schoolId,
      currentSectorForImage.sectorName,
      index
    );
  }
}

/**
 * Actualiza estado de botones de navegación
 */
function updateGalleryNavButtons() {
  const prevBtn = document.getElementById('gallery-prev-btn');
  const nextBtn = document.getElementById('gallery-next-btn');

  if (prevBtn) {
    prevBtn.disabled = currentGalleryIndex === 0;
    prevBtn.style.opacity = currentGalleryIndex === 0 ? '0.3' : '1';
  }

  if (nextBtn) {
    nextBtn.disabled = currentGalleryIndex === sectorGalleryImages.length - 1;
    nextBtn.style.opacity = currentGalleryIndex === sectorGalleryImages.length - 1 ? '0.3' : '1';
  }
}

/**
 * Abre el editor de dibujo para la imagen actual del carrusel
 */
function openRouteDrawingEditorForCurrentImage() {
  if (!currentSectorForImage) return;

  const currentImage = sectorGalleryImages[currentGalleryIndex];
  if (!currentImage) return;

  // Pasar el ID de la imagen al editor
  openRouteDrawingEditor(
    currentSectorForImage.schoolId,
    currentSectorForImage.sectorName,
    currentImage.id
  );
}

/**
 * Cierra el visor de imagen/galería
 */
function closeSectorImageViewer() {
  const viewer = document.getElementById('sector-image-viewer');
  if (viewer) {
    viewer.classList.add('sector-viewer-closing');
    setTimeout(() => {
      viewer.remove();
    }, 200);
  }
  sectorImageViewerOpen = false;
  currentSectorForImage = null;

  // Limpiar galería
  sectorGalleryImages = [];
  currentGalleryIndex = 0;

  // Remover event listener de teclado
  document.removeEventListener('keydown', handleGalleryKeyboard);

  // Limpiar popup de hover si existe
  hideHoverPopup();

  // Limpiar popup de vía bloqueada si existe
  const lockedPopup = document.getElementById('sv-locked-popup');
  if (lockedPopup) lockedPopup.remove();

  // Limpiar variables del canvas
  svCanvas = null;
  svCtx = null;
  svImage = null;
  svDrawings = [];
  svRoutesList = [];
  svHighlightedRoute = null;
  svHighlightedVariantIndex = null;
  svLockedRoute = null;
  svLockedVariantIndex = null;
  svPendingHighlightRoute = null;

  // Resetear zoom
  resetZoomState();

  // Resetear control de resaltado
  svHighlightEnabled = true;
  svWasPinching = false;
  if (svHighlightReenableTimer) {
    clearTimeout(svHighlightReenableTimer);
    svHighlightReenableTimer = null;
  }
}

/**
 * Resetea el estado del zoom
 */
function resetZoomState() {
  svZoomState = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    lastTranslateX: 0,
    lastTranslateY: 0,
    pinchStartDist: 0,
    pinchLastScale: 1,
    minScale: 1,
    maxScale: 5
  };
  svPreviousZoomState = false;
}

/**
 * Aplica la transformación de zoom a imagen y canvas (con transición suave)
 */
function applyZoomTransform() {
  // Usar el contenedor de la imagen actual del carrusel
  const container = document.getElementById(`sector-viewer-container-${currentGalleryIndex}`)
    || document.querySelector('.sector-viewer-image-container');
  if (!container) return;

  const img = container.querySelector('.sector-viewer-image');
  const canvas = container.querySelector('.sector-viewer-canvas');

  const transform = `translate(${svZoomState.translateX}px, ${svZoomState.translateY}px) scale(${svZoomState.scale})`;

  if (img) {
    img.style.transition = 'transform 0.15s ease-out';
    img.style.transform = transform;
    img.style.transformOrigin = 'center center';
  }

  if (canvas) {
    canvas.style.transition = 'transform 0.15s ease-out';
    canvas.style.transform = transform;
    canvas.style.transformOrigin = 'center center';
  }

  // Actualizar clase zoomed en el contenedor
  const isCurrentlyZoomed = svZoomState.scale > 1;
  if (isCurrentlyZoomed) {
    container.classList.add('zoomed');
  } else {
    container.classList.remove('zoomed');
  }

  // Redibujar canvas si cambió el estado de zoom (de normal a zoom o viceversa)
  if (isCurrentlyZoomed !== svPreviousZoomState) {
    svPreviousZoomState = isCurrentlyZoomed;
    // Redibujar después de la transición CSS
    setTimeout(() => {
      if (typeof redrawCanvasOverlay === 'function') {
        redrawCanvasOverlay();
      }
    }, 160);
  }
}

/**
 * Aplica la transformación de zoom SIN transición (para movimiento táctil continuo)
 * Esto evita el parpadeo y pantalla negra al acercarse a los bordes
 */
function applyZoomTransformImmediate() {
  // Usar el contenedor de la imagen actual del carrusel
  const container = document.getElementById(`sector-viewer-container-${currentGalleryIndex}`)
    || document.querySelector('.sector-viewer-image-container');
  if (!container) return;

  const img = container.querySelector('.sector-viewer-image');
  const canvas = container.querySelector('.sector-viewer-canvas');

  const transform = `translate(${svZoomState.translateX}px, ${svZoomState.translateY}px) scale(${svZoomState.scale})`;

  if (img) {
    img.style.transition = 'none';
    img.style.transform = transform;
    img.style.transformOrigin = 'center center';
  }

  if (canvas) {
    canvas.style.transition = 'none';
    canvas.style.transform = transform;
    canvas.style.transformOrigin = 'center center';
  }

  // Actualizar clase zoomed en el contenedor
  const isCurrentlyZoomed = svZoomState.scale > 1;
  if (isCurrentlyZoomed) {
    container.classList.add('zoomed');
  } else {
    container.classList.remove('zoomed');
  }

  // Redibujar canvas si cambió el estado de zoom (de normal a zoom o viceversa)
  if (isCurrentlyZoomed !== svPreviousZoomState) {
    svPreviousZoomState = isCurrentlyZoomed;
    if (typeof redrawCanvasOverlay === 'function') {
      redrawCanvasOverlay();
    }
  }
}

/**
 * Limita el pan para no salirse de los bounds de la imagen
 */
function constrainPan() {
  // Usar el contenedor de la imagen actual del carrusel
  const container = document.getElementById(`sector-viewer-container-${currentGalleryIndex}`)
    || document.querySelector('.sector-viewer-image-container');
  if (!container) return;

  const img = container.querySelector('.sector-viewer-image');
  if (!img) return;

  const containerRect = container.getBoundingClientRect();
  const scale = svZoomState.scale;

  // Calcular los límites de pan basados en la imagen escalada
  const imgWidth = img.offsetWidth * scale;
  const imgHeight = img.offsetHeight * scale;

  const maxTranslateX = Math.max(0, (imgWidth - containerRect.width) / 2);
  const maxTranslateY = Math.max(0, (imgHeight - containerRect.height) / 2);

  svZoomState.translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, svZoomState.translateX));
  svZoomState.translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, svZoomState.translateY));
}

/**
 * Configura zoom táctil y con mouse para la imagen y canvas
 */
function setupImageZoom() {
  // Usar el contenedor de la imagen actual del carrusel
  const container = document.getElementById(`sector-viewer-container-${currentGalleryIndex}`)
    || document.querySelector('.sector-viewer-image-container');
  if (!container) return;

  // Limpiar listeners previos usando un contenedor wrapper
  const existingWrapper = container.querySelector('.zoom-wrapper');
  if (existingWrapper) {
    existingWrapper.remove();
  }

  // Resetear zoom al configurar
  resetZoomState();
  applyZoomTransform();

  // Variables locales para gestos
  let lastTap = 0;
  let touchStartTime = 0;
  let initialPinchCenter = { x: 0, y: 0 };

  // ==========================================
  // ZOOM CON RUEDA DEL MOUSE (WEB)
  // ==========================================
  container.addEventListener('wheel', (e) => {
    e.preventDefault();

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calcular el punto de zoom relativo al centro
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const offsetX = mouseX - centerX;
    const offsetY = mouseY - centerY;

    // Determinar dirección del zoom
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    const oldScale = svZoomState.scale;
    const newScale = Math.max(svZoomState.minScale, Math.min(svZoomState.maxScale, oldScale + delta));

    if (newScale !== oldScale) {
      // Ajustar pan para que el zoom sea hacia donde está el mouse
      const scaleFactor = newScale / oldScale;
      svZoomState.translateX = svZoomState.translateX * scaleFactor - offsetX * (scaleFactor - 1);
      svZoomState.translateY = svZoomState.translateY * scaleFactor - offsetY * (scaleFactor - 1);
      svZoomState.scale = newScale;

      constrainPan();
      applyZoomTransform();
    }
  }, { passive: false });

  // ==========================================
  // PAN CON MOUSE (ARRASTRAR)
  // ==========================================
  container.addEventListener('mousedown', (e) => {
    if (svZoomState.scale > 1) {
      svZoomState.isDragging = true;
      svZoomState.startX = e.clientX;
      svZoomState.startY = e.clientY;
      svZoomState.lastTranslateX = svZoomState.translateX;
      svZoomState.lastTranslateY = svZoomState.translateY;
      container.style.cursor = 'grabbing';
      e.preventDefault();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!svZoomState.isDragging) return;

    const dx = e.clientX - svZoomState.startX;
    const dy = e.clientY - svZoomState.startY;

    svZoomState.translateX = svZoomState.lastTranslateX + dx;
    svZoomState.translateY = svZoomState.lastTranslateY + dy;

    constrainPan();
    applyZoomTransformImmediate();
  });

  document.addEventListener('mouseup', () => {
    if (svZoomState.isDragging) {
      svZoomState.isDragging = false;
      // Usar el contenedor de la imagen actual del carrusel
      const activeContainer = document.getElementById(`sector-viewer-container-${currentGalleryIndex}`)
        || document.querySelector('.sector-viewer-image-container');
      if (activeContainer) {
        activeContainer.style.cursor = svZoomState.scale > 1 ? 'grab' : 'default';
      }
    }
  });

  // ==========================================
  // PINCH ZOOM TÁCTIL (MÓVIL)
  // ==========================================
  container.addEventListener('touchstart', (e) => {
    touchStartTime = Date.now();

    if (e.touches.length === 2) {
      e.preventDefault();
      svZoomState.pinchStartDist = getDistance(e.touches[0], e.touches[1]);
      svZoomState.pinchLastScale = svZoomState.scale;

      // Marcar que estamos haciendo pinch zoom y desactivar resaltado
      svWasPinching = true;
      svHighlightEnabled = false;

      // Cancelar timer de reactivación si existe
      if (svHighlightReenableTimer) {
        clearTimeout(svHighlightReenableTimer);
        svHighlightReenableTimer = null;
      }

      // Guardar el centro del pinch
      initialPinchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
    } else if (e.touches.length === 1 && svZoomState.scale > 1) {
      // Pan con un dedo cuando hay zoom
      svZoomState.isDragging = true;
      svZoomState.startX = e.touches[0].clientX;
      svZoomState.startY = e.touches[0].clientY;
      svZoomState.lastTranslateX = svZoomState.translateX;
      svZoomState.lastTranslateY = svZoomState.translateY;
    }
  }, { passive: false });

  container.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();

      const currentDist = getDistance(e.touches[0], e.touches[1]);
      const newScale = Math.min(
        svZoomState.maxScale,
        Math.max(svZoomState.minScale, svZoomState.pinchLastScale * (currentDist / svZoomState.pinchStartDist))
      );

      // Calcular el nuevo centro del pinch
      const currentPinchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };

      // Ajustar pan basado en el movimiento del centro
      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      if (svZoomState.scale !== newScale) {
        const scaleFactor = newScale / svZoomState.scale;
        const pinchOffsetX = initialPinchCenter.x - centerX;
        const pinchOffsetY = initialPinchCenter.y - centerY;

        svZoomState.translateX = svZoomState.translateX * scaleFactor - pinchOffsetX * (scaleFactor - 1);
        svZoomState.translateY = svZoomState.translateY * scaleFactor - pinchOffsetY * (scaleFactor - 1);
      }

      // También permitir pan durante el pinch
      svZoomState.translateX += currentPinchCenter.x - initialPinchCenter.x;
      svZoomState.translateY += currentPinchCenter.y - initialPinchCenter.y;
      initialPinchCenter = currentPinchCenter;

      svZoomState.scale = newScale;
      constrainPan();
      applyZoomTransformImmediate();

    } else if (e.touches.length === 1 && svZoomState.isDragging) {
      e.preventDefault();

      const dx = e.touches[0].clientX - svZoomState.startX;
      const dy = e.touches[0].clientY - svZoomState.startY;

      svZoomState.translateX = svZoomState.lastTranslateX + dx;
      svZoomState.translateY = svZoomState.lastTranslateY + dy;

      constrainPan();
      applyZoomTransformImmediate();
    }
  }, { passive: false });

  container.addEventListener('touchend', (e) => {
    svZoomState.isDragging = false;

    // Snap a escala 1 si está muy cerca del mínimo
    if (svZoomState.scale < 1.1) {
      svZoomState.scale = 1;
      svZoomState.translateX = 0;
      svZoomState.translateY = 0;
      applyZoomTransform();

      // Si volvemos a escala 1 después de hacer pinch, programar reactivación del resaltado
      if (svWasPinching) {
        svWasPinching = false;
        // Cancelar timer anterior si existe
        if (svHighlightReenableTimer) {
          clearTimeout(svHighlightReenableTimer);
        }
        // Programar reactivación del resaltado después del delay
        svHighlightReenableTimer = setTimeout(() => {
          svHighlightEnabled = true;
          svHighlightReenableTimer = null;
          console.log('[SectorViewer] Resaltado de vías reactivado');
        }, SV_HIGHLIGHT_REENABLE_DELAY);
      }
    }
    // Snap al máximo si está muy cerca (evita overshooting)
    else if (svZoomState.scale > svZoomState.maxScale - 0.15) {
      svZoomState.scale = svZoomState.maxScale;
      constrainPan();
      applyZoomTransform();
    }

    // Doble tap para toggle zoom
    const currentTime = Date.now();
    const tapLength = currentTime - lastTap;
    const touchDuration = currentTime - touchStartTime;

    // Solo considerar como tap si fue un toque corto y NO estábamos haciendo pinch
    if (tapLength < 300 && tapLength > 0 && touchDuration < 200 && e.changedTouches.length === 1 && !svWasPinching) {
      // Doble tap detectado
      if (svZoomState.scale > 1) {
        // Si hay zoom, resetear
        svZoomState.scale = 1;
        svZoomState.translateX = 0;
        svZoomState.translateY = 0;

        // Programar reactivación del resaltado
        if (svHighlightReenableTimer) {
          clearTimeout(svHighlightReenableTimer);
        }
        svHighlightReenableTimer = setTimeout(() => {
          svHighlightEnabled = true;
          svHighlightReenableTimer = null;
        }, SV_HIGHLIGHT_REENABLE_DELAY);
      } else {
        // Si no hay zoom, hacer zoom 2x centrado en el toque (moderado para mejor control)
        const touch = e.changedTouches[0];
        const rect = container.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;

        svZoomState.scale = 2;
        svZoomState.translateX = (centerX - touchX);
        svZoomState.translateY = (centerY - touchY);
        constrainPan();

        // Desactivar resaltado temporalmente durante la transición de zoom
        svHighlightEnabled = false;
        if (svHighlightReenableTimer) {
          clearTimeout(svHighlightReenableTimer);
        }
        // Reactivar resaltado después del delay para permitir interacción con zoom
        svHighlightReenableTimer = setTimeout(() => {
          svHighlightEnabled = true;
          svHighlightReenableTimer = null;
        }, SV_HIGHLIGHT_REENABLE_DELAY);
      }
      applyZoomTransform();
    }
    lastTap = currentTime;
  }, { passive: true });

  // Actualizar cursor según el zoom
  container.style.cursor = 'default';

  console.log('[SectorViewer] Zoom configurado para imagen y canvas');
}

function getDistance(touch1, touch2) {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ============================================
// MODAL DE SUBIDA (SOLO ADMINS)
// ============================================

/**
 * Muestra el modal de subida de imagen
 */
function showSectorUploadModal(schoolId, encodedSectorName) {
  const sectorName = decodeURIComponent(encodedSectorName);

  // Cerrar visor si está abierto
  closeSectorImageViewer();

  const modal = document.createElement('div');
  modal.id = 'sector-upload-modal';
  modal.className = 'sector-upload-modal-overlay';
  modal.innerHTML = `
    <div class="sector-upload-modal">
      <div class="sector-upload-header">
        <h3>Subir imagen del sector</h3>
        <button class="sector-upload-close" onclick="closeSectorUploadModal()">&times;</button>
      </div>

      <div class="sector-upload-body">
        <p class="sector-upload-info">
          <strong>Sector:</strong> ${sectorName}<br>
          <strong>Escuela:</strong> ${MAPLIBRE_SCHOOLS[schoolId]?.name || schoolId}
        </p>

        <div class="sector-upload-dropzone" id="sector-dropzone">
          <input type="file" id="sector-image-input" accept="image/*" style="display: none;">
          <div class="dropzone-content">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p>Arrastra una imagen aquí o haz clic para seleccionar</p>
            <span class="dropzone-hint">JPG, PNG, HEIC - Máx 10MB</span>
          </div>
        </div>

        <div class="sector-upload-preview" id="sector-preview" style="display: none;">
          <img id="sector-preview-img" alt="Preview">
          <button class="sector-remove-preview" onclick="removeSectorPreview()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="sector-upload-progress" id="sector-progress" style="display: none;">
          <div class="progress-bar">
            <div class="progress-fill" id="progress-fill"></div>
          </div>
          <span class="progress-text" id="progress-text">0%</span>
        </div>
      </div>

      <div class="sector-upload-footer">
        <button class="sector-btn-cancel" onclick="closeSectorUploadModal()">Cancelar</button>
        <button class="sector-btn-upload" id="sector-upload-btn" onclick="uploadSectorImage('${schoolId}', '${encodedSectorName}')" disabled>
          Subir imagen
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Setup eventos
  setupUploadEvents();
}

/**
 * Configura eventos del modal de subida
 */
function setupUploadEvents() {
  const dropzone = document.getElementById('sector-dropzone');
  const input = document.getElementById('sector-image-input');

  // Click en dropzone
  dropzone.addEventListener('click', () => {
    input.click();
  });

  // Cambio en input
  input.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSectorFile(e.target.files[0]);
    }
  });

  // Drag & Drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSectorFile(e.dataTransfer.files[0]);
    }
  });
}

/**
 * Maneja el archivo seleccionado
 */
let pendingSectorFile = null;

async function handleSectorFile(file) {
  // Detectar HEIC por tipo MIME o extensión (algunos navegadores no reportan el MIME correcto)
  const isHeic = file.type === 'image/heic' || file.type === 'image/heif' ||
    /\.heic$/i.test(file.name) || /\.heif$/i.test(file.name);

  // Validar tipo
  if (!file.type.startsWith('image/') && !isHeic) {
    showSectorToast('Solo se permiten imágenes', 'error');
    return;
  }

  // Validar tamaño (10MB máx)
  if (file.size > 10 * 1024 * 1024) {
    showSectorToast('La imagen es demasiado grande (máx 10MB)', 'error');
    return;
  }

  // Convertir HEIC a JPEG si es necesario
  if (isHeic) {
    if (typeof heic2any === 'undefined') {
      showSectorToast('No se pudo cargar el conversor HEIC. Intenta con JPG o PNG.', 'error');
      return;
    }
    try {
      showSectorToast('Convirtiendo imagen HEIC...', 'info');
      const blob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.9
      });
      // heic2any puede devolver un array de blobs o un solo blob
      const resultBlob = Array.isArray(blob) ? blob[0] : blob;
      file = new File([resultBlob], file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'), {
        type: 'image/jpeg'
      });
    } catch (err) {
      console.error('Error convirtiendo HEIC:', err);
      showSectorToast('Error al convertir imagen HEIC. Intenta con JPG o PNG.', 'error');
      return;
    }
  }

  pendingSectorFile = file;

  // Mostrar preview
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('sector-preview-img').src = e.target.result;
    document.getElementById('sector-preview').style.display = 'block';
    document.getElementById('sector-dropzone').style.display = 'none';
    document.getElementById('sector-upload-btn').disabled = false;
  };
  reader.readAsDataURL(file);
}

/**
 * Remueve el preview
 */
function removeSectorPreview() {
  pendingSectorFile = null;
  document.getElementById('sector-preview').style.display = 'none';
  document.getElementById('sector-dropzone').style.display = 'flex';
  document.getElementById('sector-upload-btn').disabled = true;
  document.getElementById('sector-image-input').value = '';
}

/**
 * Sube una imagen a la galería del sector (Firebase Storage)
 * Ahora soporta múltiples imágenes por sector
 */
async function uploadSectorImage(schoolId, encodedSectorName) {
  if (!pendingSectorFile) {
    showSectorToast('No hay imagen seleccionada', 'error');
    return;
  }

  const sectorName = decodeURIComponent(encodedSectorName);
  const normalizedName = normalizeSectorName(sectorName);
  const docId = `${schoolId}_${normalizedName}`;

  const existingImages = await getSectorGalleryImages(schoolId, sectorName);

  // Generar ID único para la imagen
  const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const imagePath = `sector-images/${schoolId}/${normalizedName}/${imageId}.jpg`;

  // Mostrar progreso
  document.getElementById('sector-progress').style.display = 'flex';
  document.getElementById('sector-upload-btn').disabled = true;

  try {
    const storageRef = firebase.storage().ref(imagePath);

    // Comprimir imagen si es muy grande
    let fileToUpload = pendingSectorFile;
    if (pendingSectorFile.size > SECTOR_GALLERY_CONFIG.compressThreshold) {
      fileToUpload = await compressSectorImage(pendingSectorFile);
    }

    const uploadTask = storageRef.put(fileToUpload, {
      contentType: 'image/jpeg',
      customMetadata: {
        schoolId: schoolId,
        sectorName: sectorName,
        imageId: imageId,
        uploadedBy: auth.currentUser?.email || 'unknown',
        uploadedAt: new Date().toISOString()
      }
    });

    // Progreso
    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        document.getElementById('progress-fill').style.width = `${progress}%`;
        document.getElementById('progress-text').textContent = `${progress}%`;
      },
      (error) => {
        console.error('[SectorImages] Error subiendo:', error);
        showSectorToast('Error al subir la imagen', 'error');
        document.getElementById('sector-progress').style.display = 'none';
        document.getElementById('sector-upload-btn').disabled = false;
      },
      async () => {
        // Éxito - obtener URL
        const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();

        // Crear objeto de la nueva imagen
        // Nota: No usar serverTimestamp() dentro de arrays - Firestore no lo permite
        const newImage = {
          id: imageId,
          url: downloadURL,
          storagePath: imagePath,
          order: existingImages.length, // Añadir al final
          uploadedAt: new Date().toISOString(),
          uploadedBy: auth.currentUser?.uid,
          uploadedByEmail: auth.currentUser?.email
        };

        // Obtener documento existente o crear nuevo
        const docRef = db.collection('sector_images').doc(docId);
        const doc = await docRef.get();

        if (doc.exists) {
          // Añadir a galería existente
          const data = doc.data();
          let images = [];

          // Migrar formato antiguo si es necesario
          if (data.imageUrl && !data.images) {
            // Convertir imagen única a array
            images = [{
              id: 'legacy_0',
              url: data.imageUrl,
              storagePath: data.storagePath || `sector-images/${schoolId}/${normalizedName}.jpg`,
              order: 0,
              uploadedAt: data.uploadedAt,
              uploadedBy: data.uploadedBy
            }];
          } else if (data.images) {
            images = data.images;
          }

          images.push(newImage);

          await docRef.update({
            images: images,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } else {
          // Crear nuevo documento con galería
          await docRef.set({
            schoolId: schoolId,
            sectorName: sectorName,
            normalizedName: normalizedName,
            images: [newImage],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }

        showSectorToast('Imagen añadida a la galería', 'success');
        closeSectorUploadModal();

        // Abrir el visor mostrando la nueva imagen
        setTimeout(() => {
          openSectorImageViewer(schoolId, sectorName, existingImages.length);
        }, 300);
      }
    );

  } catch (error) {
    console.error('[SectorImages] Error:', error);
    showSectorToast('Error: ' + error.message, 'error');
    document.getElementById('sector-progress').style.display = 'none';
    document.getElementById('sector-upload-btn').disabled = false;
  }
}

/**
 * Comprime la imagen antes de subir
 */
function compressSectorImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Mantener aspect ratio, máx 2000px
        let width = img.width;
        let height = img.height;
        const maxDim = 2000;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = (height / width) * maxDim;
            width = maxDim;
          } else {
            width = (width / height) * maxDim;
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.85);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Cierra el modal de subida
 */
function closeSectorUploadModal() {
  const modal = document.getElementById('sector-upload-modal');
  if (modal) {
    modal.remove();
  }
  pendingSectorFile = null;
}

// ============================================
// ELIMINAR IMAGEN DEL SECTOR (SOLO ADMINS)
// ============================================

/**
 * Muestra el modal de confirmación para eliminar la imagen del sector
 * @param {string} schoolId - ID de la escuela
 * @param {string} encodedSectorName - Nombre del sector (URL encoded)
 */
function showDeleteSectorImageModal(schoolId, encodedSectorName) {
  const sectorName = decodeURIComponent(encodedSectorName);

  const modal = document.createElement('div');
  modal.id = 'sector-delete-modal';
  modal.className = 'sector-delete-modal-overlay';
  modal.innerHTML = `
    <div class="sector-delete-modal">
      <div class="sector-delete-header">
        <div class="sector-delete-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h3>Eliminar imagen del sector</h3>
      </div>

      <div class="sector-delete-body">
        <p class="sector-delete-warning">
          ¿Estás seguro de que quieres eliminar la imagen del sector <strong>"${sectorName}"</strong>?
        </p>
        <p class="sector-delete-info">
          Esta acción eliminará permanentemente la imagen del servidor. Los dibujos de vías asociados se mantendrán, pero no serán visibles hasta que subas una nueva imagen.
        </p>
      </div>

      <div class="sector-delete-footer">
        <button class="sector-btn-cancel" onclick="closeDeleteSectorImageModal()">Cancelar</button>
        <button class="sector-btn-delete" id="sector-delete-btn" onclick="deleteSectorImage('${schoolId}', '${encodedSectorName}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Eliminar imagen
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Animación de entrada
  requestAnimationFrame(() => {
    modal.classList.add('sector-delete-modal-visible');
  });
}

/**
 * Cierra el modal de confirmación de eliminación
 */
function closeDeleteSectorImageModal() {
  const modal = document.getElementById('sector-delete-modal');
  if (modal) {
    modal.classList.remove('sector-delete-modal-visible');
    setTimeout(() => {
      modal.remove();
    }, 200);
  }
}

/**
 * Elimina la imagen del sector de Firebase Storage y Firestore
 * @param {string} schoolId - ID de la escuela
 * @param {string} encodedSectorName - Nombre del sector (URL encoded)
 */
async function deleteSectorImage(schoolId, encodedSectorName) {
  const sectorName = decodeURIComponent(encodedSectorName);
  const normalizedName = normalizeSectorName(sectorName);
  const imagePath = `sector-images/${schoolId}/${normalizedName}.jpg`;

  // Deshabilitar botón mientras se procesa
  const deleteBtn = document.getElementById('sector-delete-btn');
  if (deleteBtn) {
    deleteBtn.disabled = true;
    deleteBtn.innerHTML = `
      <svg class="sector-delete-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32"/>
      </svg>
      Eliminando...
    `;
  }

  try {
    // 1. Eliminar imagen de Firebase Storage
    const storageRef = firebase.storage().ref(imagePath);
    try {
      await storageRef.delete();
      console.log('[SectorImages] Imagen eliminada de Storage:', imagePath);
    } catch (storageError) {
      // Si la imagen no existe en storage, continuar de todos modos
      if (storageError.code !== 'storage/object-not-found') {
        throw storageError;
      }
      console.log('[SectorImages] Imagen no encontrada en Storage, continuando...');
    }

    // 2. Eliminar documento de Firestore
    const docId = `${schoolId}_${normalizedName}`;
    try {
      await db.collection('sector_images').doc(docId).delete();
      console.log('[SectorImages] Documento eliminado de Firestore:', docId);
    } catch (firestoreError) {
      console.warn('[SectorImages] Error eliminando documento de Firestore:', firestoreError);
      // No es crítico si el documento no existe
    }

    // 3. Cerrar modales y mostrar mensaje de éxito
    closeDeleteSectorImageModal();
    closeSectorImageViewer();

    showSectorToast('Imagen del sector eliminada correctamente', 'success');

  } catch (error) {
    console.error('[SectorImages] Error eliminando imagen:', error);
    showSectorToast('Error al eliminar la imagen: ' + error.message, 'error');

    // Rehabilitar botón
    if (deleteBtn) {
      deleteBtn.disabled = false;
      deleteBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        Eliminar imagen
      `;
    }
  }
}

// ============================================
// UTILIDADES UI
// ============================================

/**
 * Muestra toast de notificación
 */
function showSectorToast(message, type = 'info') {
  const existing = document.querySelector('.sector-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `sector-toast sector-toast-${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('sector-toast-hide');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================
// FUNCIÓN PARA AÑADIR BOTÓN AL POPUP
// ============================================

/**
 * Genera el HTML del botón "Ver Sector" para el popup
 * @param {string} schoolId - ID de la escuela
 * @param {string} sectorName - Nombre del sector
 */
function getSectorViewButtonHTML(schoolId, sectorName) {
  const encodedName = encodeURIComponent(sectorName);
  return `
    <button class="ml-sector-view-btn" onclick="openSectorImageViewer('${schoolId}', '${sectorName}')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      Ver Sector
    </button>
  `;
}

// ============================================
// INICIALIZACIÓN
// ============================================

// ============================================
// CANVAS VIEWER CON VÍAS DIBUJADAS
// ============================================

let svCanvas = null;
let svCtx = null;
let svImage = null;
let svDrawings = [];
let svRapelPoints = []; // Puntos de rápel independientes
let svAuxElements = []; // Elementos auxiliares (líneas de descenso, grapas, cadenas)
let svRoutesList = [];  // Lista de vías del sector para obtener grados
let svCurrentImageId = null; // ID de la imagen actual (para galería)

/**
 * Configura el canvas para una imagen específica de la galería
 * @param {string} schoolId - ID de la escuela
 * @param {string} sectorName - Nombre del sector
 * @param {number} imageIndex - Índice de la imagen en la galería
 */
async function setupSectorViewerCanvasForGallery(schoolId, sectorName, imageIndex) {
  const imageData = sectorGalleryImages[imageIndex];
  if (!imageData) {
    console.warn('[SectorViewer] No se encontró imagen en índice:', imageIndex);
    return;
  }

  const img = document.getElementById(`sector-full-image-${imageIndex}`);
  const canvas = document.getElementById(`sector-viewer-canvas-${imageIndex}`);
  const container = document.getElementById(`sector-viewer-container-${imageIndex}`);

  if (!img || !canvas || !container) {
    console.error('[SectorViewer] Elementos de galería no encontrados para índice:', imageIndex);
    return;
  }

  // Guardar ID de imagen actual
  svCurrentImageId = imageData.id;

  // Cargar vías del sector (para obtener grados) y dibujos
  await loadViewerSectorRoutes(schoolId, sectorName);
  await loadViewerRouteDrawingsForImage(schoolId, sectorName, imageData.id);

  // Si no hay dibujos, solo mostrar la imagen normal con zoom
  if (svDrawings.length === 0) {
    console.log('[SectorViewer] No hay vías dibujadas para imagen:', imageData.id);
    img.style.display = 'block';
    canvas.style.display = 'none';
    return;
  }

  // Hay dibujos - usar canvas overlay
  console.log('[SectorViewer] Hay', svDrawings.length, 'vías dibujadas para imagen:', imageData.id);

  svCanvas = canvas;
  svCtx = canvas.getContext('2d');

  // Esperar a que la imagen se cargue para obtener dimensiones
  // En WebViews móviles (Capacitor), img.complete puede ser true mientras
  // naturalWidth sigue siendo 0 (imagen cacheada pero dimensiones no resueltas).
  // Si onload ya disparó, nunca volverá a disparar → usar polling como fallback.
  if (img.complete && img.naturalWidth > 0) {
    initCanvasOverlayForGallery(img, container, imageIndex);
  } else {
    let resolved = false;
    img.onload = () => {
      if (!resolved) {
        resolved = true;
        initCanvasOverlayForGallery(img, container, imageIndex);
      }
    };
    // Fallback: polling para WebViews donde img.complete=true pero naturalWidth=0
    // y onload nunca vuelve a disparar
    const pollInterval = setInterval(() => {
      if (resolved) {
        clearInterval(pollInterval);
        return;
      }
      if (img.naturalWidth > 0) {
        resolved = true;
        clearInterval(pollInterval);
        initCanvasOverlayForGallery(img, container, imageIndex);
      }
    }, 50);
    // Timeout de seguridad: dejar de intentar después de 5 segundos
    setTimeout(() => {
      clearInterval(pollInterval);
      if (!resolved) {
        console.warn('[SectorViewer] Timeout esperando naturalWidth de la imagen');
      }
    }, 5000);
  }
}

/**
 * Inicializa el canvas como overlay sobre la imagen de la galería
 * Usa devicePixelRatio para mejor nitidez en pantallas de alta densidad (móviles/retina)
 */
function initCanvasOverlayForGallery(img, container, imageIndex) {
  // Obtener dimensiones reales de la imagen renderizada
  const imgWidth = img.offsetWidth;
  const imgHeight = img.offsetHeight;

  // Si las dimensiones son 0, la imagen aún no está renderizada - reintentar
  if (imgWidth === 0 || imgHeight === 0) {
    console.log('[SectorViewer] Imagen de galería aún no renderizada, reintentando...');
    setTimeout(() => initCanvasOverlayForGallery(img, container, imageIndex), 100);
    return;
  }

  // Obtener la posición exacta de la imagen dentro del contenedor
  const containerRect = container.getBoundingClientRect();
  const imgRect = img.getBoundingClientRect();

  // Calcular el offset de la imagen respecto al contenedor
  const imgOffsetLeft = imgRect.left - containerRect.left;
  const imgOffsetTop = imgRect.top - containerRect.top;

  // Obtener el ratio de píxeles del dispositivo para pantallas de alta densidad
  const dpr = window.devicePixelRatio || 1;

  // Configurar canvas con mayor resolución interna para nitidez
  svCanvas.width = imgWidth * dpr;
  svCanvas.height = imgHeight * dpr;

  // Posicionar canvas EXACTAMENTE sobre la imagen con tamaño visual via CSS
  svCanvas.style.display = 'block';
  svCanvas.style.position = 'absolute';
  svCanvas.style.top = imgOffsetTop + 'px';
  svCanvas.style.left = imgOffsetLeft + 'px';
  svCanvas.style.transform = 'none';
  svCanvas.style.width = imgWidth + 'px';
  svCanvas.style.height = imgHeight + 'px';
  svCanvas.style.pointerEvents = 'auto';
  svCanvas.style.cursor = 'pointer';
  svCanvas.style.zIndex = '10';

  // Escalar el contexto para que las operaciones de dibujo sean en coordenadas lógicas
  svCtx.setTransform(1, 0, 0, 1, 0, 0); // Resetear transformaciones previas
  svCtx.scale(dpr, dpr);

  // Guardar DPR y dimensiones lógicas en el canvas para uso posterior
  svCanvas.dpr = dpr;
  svCanvas.displayWidth = imgWidth;
  svCanvas.displayHeight = imgHeight;

  // Guardar referencia a la imagen para escalar coordenadas
  svImage = img;

  console.log('[SectorViewer] Canvas overlay configurado para galería:', imgWidth, 'x', imgHeight, '@ DPR:', dpr);

  // Aplicar highlight pendiente si existe (svPendingHighlightRoute stores routeId)
  if (svPendingHighlightRoute) {
    svHighlightedRoute = svPendingHighlightRoute;
    svLockedRoute = svPendingHighlightRoute;
    console.log('[SectorViewer] Aplicando highlight a routeId:', svHighlightedRoute);

    const drawing = svDrawings.find(d => d.routeId === svPendingHighlightRoute);
    if (drawing) {
      const index = svDrawings.indexOf(drawing);
      setTimeout(() => {
        showLockedRoutePopup(drawing, index + 1);
      }, 100);
    }

    svPendingHighlightRoute = null;
  }

  // Dibujar vías
  redrawCanvasOverlay();
  setupCanvasInteraction();
}

/**
 * Carga los dibujos de vías para una imagen específica
 */
async function loadViewerRouteDrawingsForImage(schoolId, sectorName, imageId) {
  svDrawings = [];

  try {
    if (typeof db === 'undefined' || !db) {
      console.warn('[SectorViewer] Firestore no está disponible aún');
      return;
    }

    const docId = `${schoolId}_${normalizeSectorName(sectorName)}`;
    const doc = await db.collection('sector_route_drawings').doc(docId).get();

    if (doc.exists) {
      const data = doc.data();
      const allDrawings = data.drawings || [];

      // Normalizar routeId de los dibujos a Number para evitar problemas de tipo (string vs number)
      // Esto es crítico en WebViews móviles (Capacitor) donde Firestore puede devolver tipos distintos
      allDrawings.forEach(d => {
        if (d.routeId !== undefined) d.routeId = Number(d.routeId);
      });

      // Filtrar dibujos por imagen
      // Si el dibujo no tiene imageId, pertenece a la imagen legacy (primera imagen)
      svDrawings = allDrawings.filter(d => {
        if (d.imageId) {
          return d.imageId === imageId;
        }
        // Dibujos sin imageId pertenecen a 'legacy_0' (primera imagen)
        return imageId === 'legacy_0' || (!imageId && allDrawings.indexOf(d) >= 0);
      });

      console.log('[SectorViewer] Dibujos cargados para imagen', imageId, ':', svDrawings.length);

      // Cargar puntos de rápel
      const allRapelPoints = data.rapelPoints || [];
      if (imageId) {
        svRapelPoints = allRapelPoints.filter(p => {
          if (p.imageId) return p.imageId === imageId;
          return imageId === 'legacy_0';
        });
      } else {
        svRapelPoints = allRapelPoints;
      }

      // Cargar elementos auxiliares
      const allAuxElements = data.auxElements || [];
      if (imageId) {
        svAuxElements = allAuxElements.filter(el => {
          if (el.imageId) return el.imageId === imageId;
          return imageId === 'legacy_0';
        });
      } else {
        svAuxElements = allAuxElements;
      }
    } else {
      console.log('[SectorViewer] No hay dibujos guardados para este sector');
    }
  } catch (error) {
    console.error('[SectorViewer] Error cargando dibujos:', error);
  }
}

// ============================================
// GESTIÓN DE GALERÍA (MODAL ADMIN)
// ============================================

/**
 * Abre el modal de gestión de galería para reordenar y eliminar imágenes
 */
async function openGalleryManageModal(schoolId, encodedSectorName) {
  const sectorName = decodeURIComponent(encodedSectorName);

  // Obtener imágenes actuales
  const images = await getSectorGalleryImages(schoolId, sectorName);

  if (images.length === 0) {
    showSectorToast('No hay imágenes para gestionar', 'info');
    return;
  }

  const modal = document.createElement('div');
  modal.id = 'gallery-manage-modal';
  modal.className = 'gallery-manage-modal-overlay';
  modal.innerHTML = `
    <div class="gallery-manage-modal">
      <div class="gallery-manage-header">
        <h3>Gestionar galería</h3>
        <button class="gallery-manage-close" onclick="closeGalleryManageModal()">&times;</button>
      </div>

      <div class="gallery-manage-body">
        <p class="gallery-manage-info">
          <strong>Sector:</strong> ${sectorName}<br>
          <span class="gallery-manage-hint">Arrastra las imágenes para reordenarlas. La primera imagen será la portada.</span>
        </p>

        <div class="gallery-manage-grid" id="gallery-manage-grid">
          ${images.map((img, idx) => `
            <div class="gallery-manage-item" data-id="${img.id}" data-order="${idx}" draggable="true">
              <div class="gallery-manage-thumb">
                <img src="${img.url}" alt="Imagen ${idx + 1}">
                <span class="gallery-manage-order">${idx + 1}</span>
                ${idx === 0 ? '<span class="gallery-manage-cover">Portada</span>' : ''}
              </div>
              <div class="gallery-manage-actions">
                <button class="gallery-delete-btn" onclick="deleteGalleryImage('${schoolId}', '${encodeURIComponent(sectorName)}', '${img.id}')" title="Eliminar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="gallery-manage-footer">
        <span class="gallery-manage-count">${images.length} imágenes</span>
        <button class="sector-btn-upload gallery-btn-done" onclick="closeGalleryManageModal()">Hecho</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Configurar drag & drop
  setupGalleryDragDrop(schoolId, sectorName);

  // Animación de entrada
  requestAnimationFrame(() => {
    modal.classList.add('gallery-manage-modal-visible');
  });
}

/**
 * Cierra el modal de gestión de galería
 */
function closeGalleryManageModal() {
  const modal = document.getElementById('gallery-manage-modal');
  if (modal) {
    modal.classList.remove('gallery-manage-modal-visible');
    setTimeout(() => {
      modal.remove();
    }, 200);
  }

  // Refrescar el visor si está abierto
  if (sectorImageViewerOpen && currentSectorForImage) {
    openSectorImageViewer(
      currentSectorForImage.schoolId,
      currentSectorForImage.sectorName,
      currentGalleryIndex
    );
  }
}

/**
 * Configura drag & drop para reordenar imágenes
 */
function setupGalleryDragDrop(schoolId, sectorName) {
  const grid = document.getElementById('gallery-manage-grid');
  if (!grid) return;

  let draggedItem = null;

  grid.addEventListener('dragstart', (e) => {
    draggedItem = e.target.closest('.gallery-manage-item');
    if (draggedItem) {
      draggedItem.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    }
  });

  grid.addEventListener('dragend', (e) => {
    if (draggedItem) {
      draggedItem.classList.remove('dragging');
      draggedItem = null;
    }
    document.querySelectorAll('.gallery-manage-item').forEach(item => {
      item.classList.remove('drag-over');
    });
  });

  grid.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const targetItem = e.target.closest('.gallery-manage-item');
    if (targetItem && targetItem !== draggedItem) {
      // Limpiar todos los drag-over
      document.querySelectorAll('.gallery-manage-item').forEach(item => {
        item.classList.remove('drag-over');
      });
      targetItem.classList.add('drag-over');
    }
  });

  grid.addEventListener('drop', async (e) => {
    e.preventDefault();
    const targetItem = e.target.closest('.gallery-manage-item');

    if (targetItem && draggedItem && targetItem !== draggedItem) {
      // Obtener posiciones
      const items = Array.from(grid.querySelectorAll('.gallery-manage-item'));
      const draggedIndex = items.indexOf(draggedItem);
      const targetIndex = items.indexOf(targetItem);

      // Reordenar en DOM
      if (draggedIndex < targetIndex) {
        grid.insertBefore(draggedItem, targetItem.nextSibling);
      } else {
        grid.insertBefore(draggedItem, targetItem);
      }

      // Actualizar orden visual
      updateGalleryOrderNumbers();

      // Guardar nuevo orden en Firestore
      await saveGalleryOrder(schoolId, sectorName);
    }

    document.querySelectorAll('.gallery-manage-item').forEach(item => {
      item.classList.remove('drag-over');
    });
  });
}

/**
 * Actualiza los números de orden en el UI
 */
function updateGalleryOrderNumbers() {
  const items = document.querySelectorAll('.gallery-manage-item');
  items.forEach((item, idx) => {
    const orderSpan = item.querySelector('.gallery-manage-order');
    if (orderSpan) orderSpan.textContent = idx + 1;

    // Actualizar badge de portada
    const coverSpan = item.querySelector('.gallery-manage-cover');
    if (idx === 0 && !coverSpan) {
      const thumb = item.querySelector('.gallery-manage-thumb');
      const badge = document.createElement('span');
      badge.className = 'gallery-manage-cover';
      badge.textContent = 'Portada';
      thumb.appendChild(badge);
    } else if (idx !== 0 && coverSpan) {
      coverSpan.remove();
    }
  });
}

/**
 * Guarda el nuevo orden de las imágenes en Firestore
 */
async function saveGalleryOrder(schoolId, sectorName) {
  try {
    const normalizedName = normalizeSectorName(sectorName);
    const docId = `${schoolId}_${normalizedName}`;

    // Obtener el nuevo orden del DOM
    const items = document.querySelectorAll('.gallery-manage-item');
    const newOrder = Array.from(items).map(item => item.dataset.id);

    // Obtener imágenes actuales
    const docRef = db.collection('sector_images').doc(docId);
    const doc = await docRef.get();

    if (doc.exists) {
      const data = doc.data();
      let images = data.images || [];

      // Reordenar según el nuevo orden
      images = newOrder.map((id, idx) => {
        const img = images.find(i => i.id === id);
        if (img) {
          return { ...img, order: idx };
        }
        return null;
      }).filter(Boolean);

      await docRef.update({
        images: images,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log('[SectorImages] Orden de galería actualizado');
    }
  } catch (error) {
    console.error('[SectorImages] Error guardando orden:', error);
    showSectorToast('Error al guardar el orden', 'error');
  }
}

/**
 * Elimina una imagen específica de la galería
 */
async function deleteGalleryImage(schoolId, encodedSectorName, imageId) {
  const sectorName = decodeURIComponent(encodedSectorName);

  if (!confirm('¿Eliminar esta imagen de la galería?')) return;

  try {
    const normalizedName = normalizeSectorName(sectorName);
    const docId = `${schoolId}_${normalizedName}`;

    // Obtener documento
    const docRef = db.collection('sector_images').doc(docId);
    const doc = await docRef.get();

    if (!doc.exists) {
      showSectorToast('Galería no encontrada', 'error');
      return;
    }

    const data = doc.data();
    let images = data.images || [];

    // Encontrar la imagen a eliminar
    const imageToDelete = images.find(img => img.id === imageId);
    if (!imageToDelete) {
      showSectorToast('Imagen no encontrada', 'error');
      return;
    }

    // Eliminar de Storage
    if (imageToDelete.storagePath) {
      try {
        const storageRef = firebase.storage().ref(imageToDelete.storagePath);
        await storageRef.delete();
        console.log('[SectorImages] Imagen eliminada de Storage:', imageToDelete.storagePath);
      } catch (storageError) {
        if (storageError.code !== 'storage/object-not-found') {
          console.warn('[SectorImages] Error eliminando de Storage:', storageError);
        }
      }
    }

    // Eliminar del array y reordenar
    images = images.filter(img => img.id !== imageId);
    images = images.map((img, idx) => ({ ...img, order: idx }));

    // También eliminar dibujos asociados a esta imagen
    await deleteRouteDrawingsForImage(schoolId, sectorName, imageId);

    if (images.length > 0) {
      // Actualizar documento
      await docRef.update({
        images: images,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // Si no quedan imágenes, eliminar el documento completo
      await docRef.delete();
    }

    showSectorToast('Imagen eliminada', 'success');

    // Actualizar UI del modal
    const itemToRemove = document.querySelector(`.gallery-manage-item[data-id="${imageId}"]`);
    if (itemToRemove) {
      itemToRemove.remove();
      updateGalleryOrderNumbers();

      // Actualizar contador
      const countSpan = document.querySelector('.gallery-manage-count');
      if (countSpan) {
        countSpan.textContent = `${images.length} imágenes`;
      }
    }

    // Si no quedan imágenes, cerrar el modal
    if (images.length === 0) {
      closeGalleryManageModal();
      closeSectorImageViewer();
    }

  } catch (error) {
    console.error('[SectorImages] Error eliminando imagen:', error);
    showSectorToast('Error al eliminar: ' + error.message, 'error');
  }
}

/**
 * Elimina los dibujos de vías asociados a una imagen específica
 */
async function deleteRouteDrawingsForImage(schoolId, sectorName, imageId) {
  try {
    const docId = `${schoolId}_${normalizeSectorName(sectorName)}`;
    const docRef = db.collection('sector_route_drawings').doc(docId);
    const doc = await docRef.get();

    if (doc.exists) {
      const data = doc.data();
      let drawings = data.drawings || [];

      // Filtrar dibujos que NO pertenezcan a la imagen eliminada
      const filteredDrawings = drawings.filter(d => d.imageId !== imageId);

      if (filteredDrawings.length !== drawings.length) {
        await docRef.update({
          drawings: filteredDrawings,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('[SectorImages] Dibujos de imagen eliminados:', drawings.length - filteredDrawings.length);
      }
    }
  } catch (error) {
    console.error('[SectorImages] Error eliminando dibujos de imagen:', error);
  }
}

/**
 * Configura el canvas del visor con vías dibujadas
 */
async function setupSectorViewerCanvas(schoolId, sectorName, imageUrl) {
  const img = document.getElementById('sector-full-image');
  const canvas = document.getElementById('sector-viewer-canvas');

  if (!img || !canvas) {
    console.error('[SectorViewer] Elementos no encontrados');
    return;
  }

  // Cargar vías del sector (para obtener grados) y dibujos
  await loadViewerSectorRoutes(schoolId, sectorName);
  await loadViewerRouteDrawings(schoolId, sectorName);

  // Si no hay dibujos, solo mostrar la imagen normal con zoom
  if (svDrawings.length === 0) {
    console.log('[SectorViewer] No hay vías dibujadas, mostrando solo imagen');
    img.style.display = 'block';
    canvas.style.display = 'none';
    setupImageZoom(); // Usar la función existente de zoom
    return;
  }

  // Hay dibujos - usar canvas overlay
  console.log('[SectorViewer] Hay', svDrawings.length, 'vías dibujadas, usando canvas overlay');

  svCanvas = canvas;
  svCtx = canvas.getContext('2d');

  // Esperar a que la imagen se cargue para obtener dimensiones
  // En WebViews móviles, img.complete puede ser true sin que onload dispare de nuevo
  if (img.complete && img.naturalWidth > 0) {
    initCanvasOverlay(img);
  } else {
    let resolved = false;
    img.onload = () => {
      if (!resolved) {
        resolved = true;
        initCanvasOverlay(img);
      }
    };
    // Fallback: polling para WebViews donde img.complete=true pero naturalWidth=0
    const pollInterval = setInterval(() => {
      if (resolved) { clearInterval(pollInterval); return; }
      if (img.naturalWidth > 0) {
        resolved = true;
        clearInterval(pollInterval);
        initCanvasOverlay(img);
      }
    }, 50);
    setTimeout(() => clearInterval(pollInterval), 5000);
  }
}

/**
 * Inicializa el canvas como overlay sobre la imagen
 * Usa devicePixelRatio para mejor nitidez en pantallas de alta densidad (móviles/retina)
 */
function initCanvasOverlay(img) {
  const container = document.getElementById('sector-viewer-container');

  // Obtener dimensiones reales de la imagen renderizada
  const imgWidth = img.offsetWidth;
  const imgHeight = img.offsetHeight;

  // Si las dimensiones son 0, la imagen aún no está renderizada - reintentar
  if (imgWidth === 0 || imgHeight === 0) {
    console.log('[SectorViewer] Imagen aún no renderizada, reintentando...');
    setTimeout(() => initCanvasOverlay(img), 100);
    return;
  }

  // Obtener la posición exacta de la imagen dentro del contenedor
  const containerRect = container.getBoundingClientRect();
  const imgRect = img.getBoundingClientRect();

  // Calcular el offset de la imagen respecto al contenedor
  const imgOffsetLeft = imgRect.left - containerRect.left;
  const imgOffsetTop = imgRect.top - containerRect.top;

  // Obtener el ratio de píxeles del dispositivo para pantallas de alta densidad
  const dpr = window.devicePixelRatio || 1;

  // Configurar canvas con mayor resolución interna para nitidez
  svCanvas.width = imgWidth * dpr;
  svCanvas.height = imgHeight * dpr;

  // Posicionar canvas EXACTAMENTE sobre la imagen con tamaño visual via CSS
  svCanvas.style.display = 'block';
  svCanvas.style.position = 'absolute';
  svCanvas.style.top = imgOffsetTop + 'px';
  svCanvas.style.left = imgOffsetLeft + 'px';
  svCanvas.style.transform = 'none';
  svCanvas.style.width = imgWidth + 'px';
  svCanvas.style.height = imgHeight + 'px';
  svCanvas.style.pointerEvents = 'auto';
  svCanvas.style.cursor = 'pointer';
  svCanvas.style.zIndex = '10';

  // Escalar el contexto para que las operaciones de dibujo sean en coordenadas lógicas
  svCtx.setTransform(1, 0, 0, 1, 0, 0); // Resetear transformaciones previas
  svCtx.scale(dpr, dpr);

  // Guardar DPR y dimensiones lógicas en el canvas para uso posterior
  svCanvas.dpr = dpr;
  svCanvas.displayWidth = imgWidth;
  svCanvas.displayHeight = imgHeight;

  // Guardar referencia a la imagen para escalar coordenadas
  svImage = img;

  console.log('[SectorViewer] Canvas overlay configurado:', imgWidth, 'x', imgHeight, '@ DPR:', dpr);

  // Aplicar highlight pendiente si existe (svPendingHighlightRoute stores routeId)
  if (svPendingHighlightRoute) {
    svHighlightedRoute = svPendingHighlightRoute;
    svLockedRoute = svPendingHighlightRoute; // Bloquear también
    console.log('[SectorViewer] Aplicando highlight a routeId:', svHighlightedRoute);

    // Buscar el dibujo para mostrar el popup
    const drawing = svDrawings.find(d => d.routeId === svPendingHighlightRoute);
    if (drawing) {
      const index = svDrawings.indexOf(drawing);
      // Mostrar popup después de un pequeño delay para que el canvas esté listo
      setTimeout(() => {
        showLockedRoutePopup(drawing, index + 1);
      }, 100);
    }

    svPendingHighlightRoute = null;
  }

  // Dibujar vías
  redrawCanvasOverlay();
  setupCanvasInteraction();
}

/**
 * Redibuja solo las vías en el canvas (sin la imagen de fondo)
 */
function redrawCanvasOverlay() {
  if (!svCanvas || !svCtx) return;

  const dpr = svCanvas.dpr || 1;
  const displayWidth = svCanvas.displayWidth || svCanvas.width;
  const displayHeight = svCanvas.displayHeight || svCanvas.height;

  // Resetear transformaciones y limpiar todo el canvas
  svCtx.setTransform(1, 0, 0, 1, 0, 0);
  svCtx.clearRect(0, 0, svCanvas.width, svCanvas.height);

  // Restaurar escala para DPR
  svCtx.scale(dpr, dpr);

  // Usar dimensiones lógicas para el dibujo
  const imgWidth = displayWidth;
  const imgHeight = displayHeight;

  // Separar la vía resaltada del resto (matching by routeId + variantIndex)
  const _hvi = svHighlightedVariantIndex || 0;
  const highlightedDrawing = svHighlightedRoute !== null
    ? svDrawings.find(d => d.routeId === svHighlightedRoute && (d.variantIndex || 0) === _hvi)
    : null;
  const normalDrawings = svHighlightedRoute !== null
    ? svDrawings.filter(d => !(d.routeId === svHighlightedRoute && (d.variantIndex || 0) === _hvi))
    : svDrawings;

  // PASO 1: Dibujar las líneas normales primero
  normalDrawings.forEach((drawing) => {
    drawOverlayRouteLine(drawing, imgWidth, imgHeight);
  });

  // PASO 1.5: Dibujar las reuniones normales encima de las líneas
  normalDrawings.forEach((drawing) => {
    drawOverlayRouteAnchor(drawing, imgWidth, imgHeight);
  });

  // PASO 2: Dibujar los puntos de las vías normales
  normalDrawings.forEach((drawing) => {
    drawOverlayRoutePoint(drawing, imgWidth, imgHeight);
  });

  // PASO 3: Dibujar la línea resaltada encima de todo
  if (highlightedDrawing) {
    drawOverlayRouteLine(highlightedDrawing, imgWidth, imgHeight);
    drawOverlayRouteAnchor(highlightedDrawing, imgWidth, imgHeight);
    drawOverlayRoutePoint(highlightedDrawing, imgWidth, imgHeight);
  }

  // PASO 4: Dibujar elementos auxiliares
  drawSvAuxElements(imgWidth, imgHeight);

  // PASO 5: Dibujar puntos de rápel encima de todo
  drawSvRapelPoints(imgWidth, imgHeight);
}

/**
 * Obtiene los puntos escalados de un dibujo
 */
function getScaledPoints(drawing, canvasWidth, canvasHeight) {
  let points = [];
  if (drawing.points && drawing.points.length > 0) {
    points = drawing.points;
  } else if (drawing.startPoint && drawing.endPoint) {
    points = [drawing.startPoint, drawing.endPoint];
  } else {
    return null;
  }

  // Prevenir división por cero si naturalWidth/Height no están disponibles
  if (!svImage || !svImage.naturalWidth || !svImage.naturalHeight) {
    console.warn('[SectorViewer] svImage.naturalWidth/Height es 0, no se pueden escalar puntos');
    return null;
  }

  return points.map(p => ({
    x: (p.x / svImage.naturalWidth) * canvasWidth,
    y: (p.y / svImage.naturalHeight) * canvasHeight
  }));
}

/**
 * Convierte un drawing en array de paths renderizables (tronco + ramas) para el visor
 * Retrocompatible: si no hay branches, devuelve un solo path
 * @returns {Array} Array de {branchId, points (scaled), anchorType, isTrunk, forkPoint (scaled)}
 */
function getScaledPathsMulti(drawing, canvasWidth, canvasHeight) {
  const scaledTrunk = getScaledPoints(drawing, canvasWidth, canvasHeight);
  if (!scaledTrunk) return [];

  const paths = [{
    branchId: 0,
    points: scaledTrunk,
    anchorType: drawing.anchorType,
    isTrunk: true,
    forkPoint: null
  }];

  if (drawing.branches && drawing.branches.length > 0) {
    drawing.branches.forEach(branch => {
      try {
        if (!branch || !branch.forkPoint || !branch.points || branch.points.length === 0) {
          console.warn('[SectorViewer] Rama con datos incompletos, omitiendo:', branch?.branchId);
          return;
        }
        if (!svImage || !svImage.naturalWidth || !svImage.naturalHeight) return;
        const branchFullPoints = [branch.forkPoint, ...branch.points];
        const scaledBranchPoints = branchFullPoints.map(p => ({
          x: (p.x / svImage.naturalWidth) * canvasWidth,
          y: (p.y / svImage.naturalHeight) * canvasHeight
        }));
        const scaledFork = {
          x: (branch.forkPoint.x / svImage.naturalWidth) * canvasWidth,
          y: (branch.forkPoint.y / svImage.naturalHeight) * canvasHeight
        };
        paths.push({
          branchId: branch.branchId,
          points: scaledBranchPoints,
          anchorType: branch.anchorType,
          isTrunk: false,
          forkPoint: scaledFork
        });
      } catch (e) {
        console.error('[SectorViewer] Error procesando rama:', e);
      }
    });
  }

  return paths;
}

/**
 * Obtiene el color de una vía según su grado
 */
function getRouteColor(drawing) {
  const dvi = drawing.variantIndex || 0;
  const route = svRoutesList.find(r =>
    (drawing.routeId !== undefined && r.routeId === drawing.routeId && (r.variantIndex || 0) === dvi) ||
    (drawing.routeId === undefined && r.nombre === drawing.routeName)
  );
  return route && typeof getGradeColor === 'function'
    ? getGradeColor(route.grado)
    : '#10b981';
}

/**
 * Añade transparencia (alpha) a un color en formato hex o rgb
 * @param {string} color - Color en formato hex (#fff, #ffffff) o rgb(r,g,b)
 * @param {number} alpha - Valor de transparencia entre 0 y 1
 * @returns {string} Color en formato rgba
 */
function addAlphaToColor(color, alpha) {
  // Si ya es rgba, extraer componentes y aplicar nuevo alpha
  if (color.startsWith('rgba')) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
    }
  }

  // Si es rgb, convertir a rgba
  if (color.startsWith('rgb')) {
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
    }
  }

  // Si es hex, convertir a rgba
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    // Expandir hex corto (#fff -> #ffffff)
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Si no reconoce el formato, devolver el color original
  return color;
}

/**
 * Calcula el factor de escala para líneas basado en el tamaño del canvas
 * Esto asegura que las líneas se vean igual de gruesas en móvil y desktop
 */
function getLineScaleFactor() {
  if (!svCanvas) return 1;
  const displayWidth = svCanvas.displayWidth || svCanvas.width;
  // Base: 400px de ancho = factor 1. Pantallas más pequeñas = líneas proporcionalmente más gruesas
  const baseFactor = Math.max(0.8, Math.min(1.5, displayWidth / 400));
  return baseFactor;
}

/**
 * Dibuja solo la LÍNEA de una vía (sin el punto de inicio)
 */
function drawOverlayRouteLine(drawing, canvasWidth, canvasHeight) {
  const paths = getScaledPathsMulti(drawing, canvasWidth, canvasHeight);
  if (paths.length === 0) return;

  const color = getRouteColor(drawing);
  const isHighlighted = svHighlightedRoute === drawing.routeId;
  const isZoomed = svZoomState.scale > 1;

  // Factor de escala para que las líneas se vean consistentes en diferentes tamaños de pantalla
  const scaleFactor = getLineScaleFactor();

  let borderWidth, lineWidth;
  if (isZoomed) {
    borderWidth = (isHighlighted ? 4 : 3) * scaleFactor;
    lineWidth = (isHighlighted ? 2.5 : 2) * scaleFactor;
  } else {
    borderWidth = (isHighlighted ? 8 : 6) * scaleFactor;
    lineWidth = (isHighlighted ? 5 : 4) * scaleFactor;
  }

  const dashPattern = isZoomed ? [8 * scaleFactor, 6 * scaleFactor] : [];

  let borderColor, mainColor;
  if (isZoomed) {
    borderColor = isHighlighted ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.35)';
    mainColor = addAlphaToColor(color, 0.6);
  } else {
    borderColor = isHighlighted ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.65)';
    mainColor = color;
  }

  // Dibujar cada path (tronco + ramas)
  paths.forEach(path => {
    if (!path.points || path.points.length < 2) return;

    // Borde/sombra
    svCtx.strokeStyle = borderColor;
    svCtx.lineWidth = borderWidth;
    svCtx.lineCap = 'round';
    svCtx.lineJoin = 'round';
    svCtx.shadowColor = 'transparent';
    svCtx.shadowBlur = 0;
    svCtx.setLineDash(dashPattern);

    svCtx.beginPath();
    svCtx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) {
      svCtx.lineTo(path.points[i].x, path.points[i].y);
    }
    svCtx.stroke();

    // Línea principal
    svCtx.strokeStyle = mainColor;
    svCtx.lineWidth = lineWidth;
    svCtx.lineCap = 'round';
    svCtx.lineJoin = 'round';
    svCtx.setLineDash(dashPattern);

    svCtx.beginPath();
    svCtx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) {
      svCtx.lineTo(path.points[i].x, path.points[i].y);
    }
    svCtx.stroke();
  });

  svCtx.setLineDash([]);
}

/**
 * Dibuja solo el icono de reunión de una vía (separado para controlar z-order)
 */
function drawOverlayRouteAnchor(drawing, canvasWidth, canvasHeight) {
  const paths = getScaledPathsMulti(drawing, canvasWidth, canvasHeight);
  if (paths.length === 0) return;

  const color = getRouteColor(drawing);
  const isZoomed = svZoomState.scale > 1;
  const scaleFactor = getLineScaleFactor();
  const mainColor = isZoomed ? addAlphaToColor(color, 0.6) : color;
  const iconSize = isZoomed ? 10 * scaleFactor : 14 * scaleFactor;
  const iconAlpha = isZoomed ? 0.6 : 1;

  // Dibujar reunión al final de cada path
  paths.forEach(path => {
    if (!path.anchorType || !path.points || path.points.length < 2) return;
    const lastPoint = path.points[path.points.length - 1];
    const prevPoint = path.points[path.points.length - 2];
    drawSvAnchorIcon(lastPoint.x, lastPoint.y, prevPoint.x, prevPoint.y, path.anchorType, mainColor, iconSize, iconAlpha);
  });
}

/**
 * Dibuja el icono de reunión al final de la vía en el visor de sector
 */
function drawSvAnchorIcon(x, y, prevX, prevY, anchorType, color, size, alpha) {
  svCtx.save();

  // Aplicar alpha global si es necesario
  if (alpha < 1) {
    svCtx.globalAlpha = alpha;
  }

  // Sin terminar: usa sus propias coordenadas y rotación
  if (anchorType === 'sin_terminar') {
    drawSvAnchorSinTerminar(x, y, prevX, prevY, size, color);
    svCtx.restore();
    return;
  }

  // Trasladar al punto final (sin rotación - siempre mira hacia arriba)
  svCtx.translate(x, y);

  // Dibujar según el tipo de reunión
  switch(anchorType) {
    case 'quimicos':
      drawSvAnchorQuimicos(0, 0, size, color);
      break;
    case 'cadena':
      drawSvAnchorCadena(0, 0, size, color);
      break;
    case 'mosqueton':
      drawSvAnchorMosqueton(0, 0, size, color);
      break;
  }

  svCtx.restore();
}

/**
 * Dibuja reunión de químicos con maillones (visor de sector)
 */
function drawSvAnchorQuimicos(x, y, size, color) {
  const scale = size / 20;
  const outlineWidth = 2 * scale;
  const outlineColor = 'white';

  // Químico izquierdo con contorno
  svCtx.strokeStyle = outlineColor;
  svCtx.lineWidth = outlineWidth + 2;
  svCtx.beginPath();
  svCtx.arc(x - 8 * scale, y - 12 * scale, 6 * scale, 0, Math.PI * 2);
  svCtx.stroke();

  svCtx.fillStyle = color;
  svCtx.beginPath();
  svCtx.arc(x - 8 * scale, y - 12 * scale, 6 * scale, 0, Math.PI * 2);
  svCtx.fill();
  svCtx.strokeStyle = 'rgba(0,0,0,0.5)';
  svCtx.lineWidth = 1;
  svCtx.stroke();

  // Agujero izquierdo
  svCtx.fillStyle = 'white';
  svCtx.beginPath();
  svCtx.arc(x - 8 * scale, y - 12 * scale, 2.5 * scale, 0, Math.PI * 2);
  svCtx.fill();

  // Químico derecho con contorno
  svCtx.strokeStyle = outlineColor;
  svCtx.lineWidth = outlineWidth + 2;
  svCtx.beginPath();
  svCtx.arc(x + 8 * scale, y - 12 * scale, 6 * scale, 0, Math.PI * 2);
  svCtx.stroke();

  svCtx.fillStyle = color;
  svCtx.beginPath();
  svCtx.arc(x + 8 * scale, y - 12 * scale, 6 * scale, 0, Math.PI * 2);
  svCtx.fill();
  svCtx.strokeStyle = 'rgba(0,0,0,0.5)';
  svCtx.lineWidth = 1;
  svCtx.stroke();

  // Agujero derecho
  svCtx.fillStyle = 'white';
  svCtx.beginPath();
  svCtx.arc(x + 8 * scale, y - 12 * scale, 2.5 * scale, 0, Math.PI * 2);
  svCtx.fill();

  // Maillones/anillas con contorno
  // Maillon izquierdo
  svCtx.strokeStyle = outlineColor;
  svCtx.lineWidth = 4 * scale;
  svCtx.beginPath();
  svCtx.ellipse(x - 8 * scale, y - 2 * scale, 3 * scale, 5 * scale, 0, 0, Math.PI * 2);
  svCtx.stroke();

  svCtx.strokeStyle = color;
  svCtx.lineWidth = 2 * scale;
  svCtx.beginPath();
  svCtx.ellipse(x - 8 * scale, y - 2 * scale, 3 * scale, 5 * scale, 0, 0, Math.PI * 2);
  svCtx.stroke();

  // Maillon derecho
  svCtx.strokeStyle = outlineColor;
  svCtx.lineWidth = 4 * scale;
  svCtx.beginPath();
  svCtx.ellipse(x + 8 * scale, y - 2 * scale, 3 * scale, 5 * scale, 0, 0, Math.PI * 2);
  svCtx.stroke();

  svCtx.strokeStyle = color;
  svCtx.lineWidth = 2 * scale;
  svCtx.beginPath();
  svCtx.ellipse(x + 8 * scale, y - 2 * scale, 3 * scale, 5 * scale, 0, 0, Math.PI * 2);
  svCtx.stroke();
}

/**
 * Dibuja reunión con cadena (visor de sector)
 */
function drawSvAnchorCadena(x, y, size, color) {
  const scale = size / 20;
  const outlineColor = 'white';

  // Químico izquierdo con contorno
  svCtx.strokeStyle = outlineColor;
  svCtx.lineWidth = 4;
  svCtx.beginPath();
  svCtx.arc(x - 14 * scale, y - 14 * scale, 5 * scale, 0, Math.PI * 2);
  svCtx.stroke();

  svCtx.fillStyle = color;
  svCtx.beginPath();
  svCtx.arc(x - 14 * scale, y - 14 * scale, 5 * scale, 0, Math.PI * 2);
  svCtx.fill();
  svCtx.strokeStyle = 'rgba(0,0,0,0.5)';
  svCtx.lineWidth = 1;
  svCtx.stroke();

  // Agujero izquierdo
  svCtx.fillStyle = 'white';
  svCtx.beginPath();
  svCtx.arc(x - 14 * scale, y - 14 * scale, 2 * scale, 0, Math.PI * 2);
  svCtx.fill();

  // Químico derecho con contorno
  svCtx.strokeStyle = outlineColor;
  svCtx.lineWidth = 4;
  svCtx.beginPath();
  svCtx.arc(x + 14 * scale, y - 14 * scale, 5 * scale, 0, Math.PI * 2);
  svCtx.stroke();

  svCtx.fillStyle = color;
  svCtx.beginPath();
  svCtx.arc(x + 14 * scale, y - 14 * scale, 5 * scale, 0, Math.PI * 2);
  svCtx.fill();
  svCtx.strokeStyle = 'rgba(0,0,0,0.5)';
  svCtx.lineWidth = 1;
  svCtx.stroke();

  // Agujero derecho
  svCtx.fillStyle = 'white';
  svCtx.beginPath();
  svCtx.arc(x + 14 * scale, y - 14 * scale, 2 * scale, 0, Math.PI * 2);
  svCtx.fill();

  // Eslabones de cadena con contorno
  // Eslabón izquierdo
  svCtx.strokeStyle = outlineColor;
  svCtx.lineWidth = 4 * scale;
  svCtx.beginPath();
  svCtx.ellipse(x - 8 * scale, y - 6 * scale, 3 * scale, 5 * scale, Math.PI / 6, 0, Math.PI * 2);
  svCtx.stroke();

  svCtx.strokeStyle = color;
  svCtx.lineWidth = 2 * scale;
  svCtx.beginPath();
  svCtx.ellipse(x - 8 * scale, y - 6 * scale, 3 * scale, 5 * scale, Math.PI / 6, 0, Math.PI * 2);
  svCtx.stroke();

  // Eslabón central
  svCtx.strokeStyle = outlineColor;
  svCtx.lineWidth = 4 * scale;
  svCtx.beginPath();
  svCtx.ellipse(x, y - 3 * scale, 4 * scale, 6 * scale, 0, 0, Math.PI * 2);
  svCtx.stroke();

  svCtx.strokeStyle = color;
  svCtx.lineWidth = 2 * scale;
  svCtx.beginPath();
  svCtx.ellipse(x, y - 3 * scale, 4 * scale, 6 * scale, 0, 0, Math.PI * 2);
  svCtx.stroke();

  // Eslabón derecho
  svCtx.strokeStyle = outlineColor;
  svCtx.lineWidth = 4 * scale;
  svCtx.beginPath();
  svCtx.ellipse(x + 8 * scale, y - 6 * scale, 3 * scale, 5 * scale, -Math.PI / 6, 0, Math.PI * 2);
  svCtx.stroke();

  svCtx.strokeStyle = color;
  svCtx.lineWidth = 2 * scale;
  svCtx.beginPath();
  svCtx.ellipse(x + 8 * scale, y - 6 * scale, 3 * scale, 5 * scale, -Math.PI / 6, 0, Math.PI * 2);
  svCtx.stroke();
}

/**
 * Dibuja reunión con mosquetón (visor de sector)
 */
function drawSvAnchorMosqueton(x, y, size, color) {
  const scale = size / 20;
  const outlineColor = 'white';

  // Químico izquierdo con contorno
  svCtx.strokeStyle = outlineColor;
  svCtx.lineWidth = 4;
  svCtx.beginPath();
  svCtx.arc(x - 8 * scale, y - 20 * scale, 5 * scale, 0, Math.PI * 2);
  svCtx.stroke();

  svCtx.fillStyle = color;
  svCtx.beginPath();
  svCtx.arc(x - 8 * scale, y - 20 * scale, 5 * scale, 0, Math.PI * 2);
  svCtx.fill();
  svCtx.strokeStyle = 'rgba(0,0,0,0.5)';
  svCtx.lineWidth = 1;
  svCtx.stroke();

  // Agujero izquierdo
  svCtx.fillStyle = 'white';
  svCtx.beginPath();
  svCtx.arc(x - 8 * scale, y - 20 * scale, 2 * scale, 0, Math.PI * 2);
  svCtx.fill();

  // Químico derecho con contorno
  svCtx.strokeStyle = outlineColor;
  svCtx.lineWidth = 4;
  svCtx.beginPath();
  svCtx.arc(x + 8 * scale, y - 20 * scale, 5 * scale, 0, Math.PI * 2);
  svCtx.stroke();

  svCtx.fillStyle = color;
  svCtx.beginPath();
  svCtx.arc(x + 8 * scale, y - 20 * scale, 5 * scale, 0, Math.PI * 2);
  svCtx.fill();
  svCtx.strokeStyle = 'rgba(0,0,0,0.5)';
  svCtx.lineWidth = 1;
  svCtx.stroke();

  // Agujero derecho
  svCtx.fillStyle = 'white';
  svCtx.beginPath();
  svCtx.arc(x + 8 * scale, y - 20 * scale, 2 * scale, 0, Math.PI * 2);
  svCtx.fill();

  // Eslabones pequeños conectando a químicos (con contorno)
  // Eslabón izquierdo
  svCtx.strokeStyle = outlineColor;
  svCtx.lineWidth = 4 * scale;
  svCtx.beginPath();
  svCtx.ellipse(x - 6 * scale, y - 12 * scale, 2.5 * scale, 4 * scale, 0, 0, Math.PI * 2);
  svCtx.stroke();

  svCtx.strokeStyle = color;
  svCtx.lineWidth = 2 * scale;
  svCtx.beginPath();
  svCtx.ellipse(x - 6 * scale, y - 12 * scale, 2.5 * scale, 4 * scale, 0, 0, Math.PI * 2);
  svCtx.stroke();

  // Eslabón derecho
  svCtx.strokeStyle = outlineColor;
  svCtx.lineWidth = 4 * scale;
  svCtx.beginPath();
  svCtx.ellipse(x + 6 * scale, y - 12 * scale, 2.5 * scale, 4 * scale, 0, 0, Math.PI * 2);
  svCtx.stroke();

  svCtx.strokeStyle = color;
  svCtx.lineWidth = 2 * scale;
  svCtx.beginPath();
  svCtx.ellipse(x + 6 * scale, y - 12 * scale, 2.5 * scale, 4 * scale, 0, 0, Math.PI * 2);
  svCtx.stroke();

  // Mosquetón central (forma de D) con contorno
  // Contorno blanco primero
  svCtx.strokeStyle = outlineColor;
  svCtx.lineWidth = 5 * scale;
  svCtx.beginPath();
  svCtx.moveTo(x - 5 * scale, y - 6 * scale);
  svCtx.quadraticCurveTo(x - 8 * scale, y + 2 * scale, x, y + 8 * scale);
  svCtx.quadraticCurveTo(x + 8 * scale, y + 2 * scale, x + 5 * scale, y - 6 * scale);
  svCtx.lineTo(x - 5 * scale, y - 6 * scale);
  svCtx.stroke();

  // Mosquetón en color
  svCtx.strokeStyle = color;
  svCtx.lineWidth = 2.5 * scale;
  svCtx.beginPath();
  svCtx.moveTo(x - 5 * scale, y - 6 * scale);
  svCtx.quadraticCurveTo(x - 8 * scale, y + 2 * scale, x, y + 8 * scale);
  svCtx.quadraticCurveTo(x + 8 * scale, y + 2 * scale, x + 5 * scale, y - 6 * scale);
  svCtx.lineTo(x - 5 * scale, y - 6 * scale);
  svCtx.stroke();

  // Gate del mosquetón con contorno
  svCtx.strokeStyle = outlineColor;
  svCtx.lineWidth = 2;
  svCtx.strokeRect(x - 2 * scale - 1, y - 4 * scale - 1, 4 * scale + 2, 6 * scale + 2);

  svCtx.fillStyle = color;
  svCtx.fillRect(x - 2 * scale, y - 4 * scale, 4 * scale, 6 * scale);
}

/**
 * Dibuja todos los elementos auxiliares en el visor de sector
 */
function drawSvAuxElements(canvasWidth, canvasHeight) {
  if (!svAuxElements || svAuxElements.length === 0) return;

  const scaleX = canvasWidth / svImage.width;
  const scaleY = canvasHeight / svImage.height;

  const colors = {
    descent_line: '#00bcd4',
    grapas: '#ff9800',
    cadena: '#78909c',
    rapel: '#a855f7'
  };

  svAuxElements.forEach(element => {
    if (!element.points || element.points.length === 0) return;

    const scaledPoints = element.points.map(p => ({
      x: p.x * scaleX,
      y: p.y * scaleY
    }));

    const color = colors[element.type] || '#ffffff';

    switch (element.type) {
      case 'descent_line':
        drawSvDescentLine(scaledPoints, color);
        break;
      case 'grapas':
        drawSvGrapas(scaledPoints, color);
        break;
      case 'cadena':
        drawSvCadena(scaledPoints, color);
        break;
      case 'rapel':
        drawSvRapelFromAux(scaledPoints, color);
        break;
    }
  });
}

/**
 * Dibuja una línea de descenso/ascenso en el visor
 */
function drawSvDescentLine(scaledPoints, color) {
  if (scaledPoints.length < 2) return;

  svCtx.save();

  // Sombra
  svCtx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  svCtx.lineWidth = 4;
  svCtx.lineCap = 'round';
  svCtx.lineJoin = 'round';
  svCtx.setLineDash([10, 6]);
  svCtx.beginPath();
  svCtx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
  for (let i = 1; i < scaledPoints.length; i++) {
    svCtx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
  }
  svCtx.stroke();

  // Línea principal
  svCtx.strokeStyle = color;
  svCtx.lineWidth = 2.5;
  svCtx.setLineDash([10, 6]);
  svCtx.beginPath();
  svCtx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
  for (let i = 1; i < scaledPoints.length; i++) {
    svCtx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
  }
  svCtx.stroke();
  svCtx.setLineDash([]);

  // Flecha en el extremo
  if (scaledPoints.length >= 2) {
    const last = scaledPoints[scaledPoints.length - 1];
    const prev = scaledPoints[scaledPoints.length - 2];
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
    svCtx.fillStyle = color;
    svCtx.beginPath();
    svCtx.moveTo(last.x, last.y);
    svCtx.lineTo(last.x - 8 * Math.cos(angle - Math.PI / 6), last.y - 8 * Math.sin(angle - Math.PI / 6));
    svCtx.lineTo(last.x - 8 * Math.cos(angle + Math.PI / 6), last.y - 8 * Math.sin(angle + Math.PI / 6));
    svCtx.closePath();
    svCtx.fill();
  }

  svCtx.restore();
}

/**
 * Dibuja grapas en el visor
 */
function drawSvGrapas(scaledPoints, color) {
  scaledPoints.forEach(pt => {
    if (typeof drawGrapaIcon === 'function') {
      drawGrapaIcon(svCtx, pt.x, pt.y, 12, color);
    } else {
      // Fallback: simple U shape
      const s = 1;
      svCtx.save();
      svCtx.strokeStyle = color;
      svCtx.lineWidth = 3;
      svCtx.lineCap = 'round';
      svCtx.beginPath();
      svCtx.moveTo(pt.x - 6 * s, pt.y - 8 * s);
      svCtx.lineTo(pt.x - 6 * s, pt.y + 2 * s);
      svCtx.quadraticCurveTo(pt.x - 6 * s, pt.y + 8 * s, pt.x, pt.y + 8 * s);
      svCtx.quadraticCurveTo(pt.x + 6 * s, pt.y + 8 * s, pt.x + 6 * s, pt.y + 2 * s);
      svCtx.lineTo(pt.x + 6 * s, pt.y - 8 * s);
      svCtx.stroke();
      svCtx.restore();
    }
  });
}

/**
 * Dibuja cadena en el visor
 */
function drawSvCadena(scaledPoints, color) {
  if (scaledPoints.length < 2) return;

  svCtx.save();

  for (let i = 0; i < scaledPoints.length - 1; i++) {
    const p1 = scaledPoints[i];
    const p2 = scaledPoints[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const linkLength = 12;
    const linkWidth = 5;
    const numLinks = Math.max(1, Math.floor(dist / linkLength));
    const actualLinkLen = dist / numLinks;

    svCtx.save();
    svCtx.translate(p1.x, p1.y);
    svCtx.rotate(angle);

    for (let j = 0; j < numLinks; j++) {
      const lx = j * actualLinkLen + actualLinkLen / 2;
      const isEven = j % 2 === 0;
      const w = isEven ? linkWidth : linkWidth * 0.7;
      const h = actualLinkLen * 0.4;

      svCtx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      svCtx.lineWidth = 4;
      svCtx.lineCap = 'round';
      svCtx.beginPath();
      svCtx.ellipse(lx, 0, h, w, 0, 0, Math.PI * 2);
      svCtx.stroke();

      svCtx.strokeStyle = color;
      svCtx.lineWidth = 2;
      svCtx.beginPath();
      svCtx.ellipse(lx, 0, h, w, 0, 0, Math.PI * 2);
      svCtx.stroke();
    }

    svCtx.restore();
  }

  svCtx.restore();
}

/**
 * Dibuja puntos de rápel desde auxElements en el visor
 */
function drawSvRapelFromAux(scaledPoints, color) {
  if (scaledPoints.length === 0) return;
  const isZoomed = svZoomState.scale > 1;
  const scaleFactor = getLineScaleFactor();
  const size = isZoomed ? 10 * scaleFactor : 14 * scaleFactor;
  const alpha = isZoomed ? 0.6 : 1;

  scaledPoints.forEach(pt => {
    svCtx.save();
    if (alpha < 1) svCtx.globalAlpha = alpha;
    svCtx.translate(pt.x, pt.y);
    if (typeof drawRapelIcon === 'function') {
      drawRapelIcon(svCtx, 0, 0, size, color);
    } else {
      const s = size / 20;
      svCtx.fillStyle = color;
      svCtx.beginPath();
      svCtx.arc(0, -14 * s, 7 * s, 0, Math.PI * 2);
      svCtx.fill();
    }
    svCtx.restore();
  });
}

/**
 * Dibuja todos los puntos de rápel en el visor de sector (legacy, datos antiguos)
 * Utiliza drawRapelIcon de route-drawing.js si está disponible
 */
function drawSvRapelPoints(canvasWidth, canvasHeight) {
  if (!svRapelPoints || svRapelPoints.length === 0) return;

  const scaleX = canvasWidth / svImage.width;
  const scaleY = canvasHeight / svImage.height;
  const isZoomed = svZoomState.scale > 1;
  const scaleFactor = getLineScaleFactor();
  const color = '#a855f7'; // Púrpura
  const size = isZoomed ? 10 * scaleFactor : 14 * scaleFactor;
  const alpha = isZoomed ? 0.6 : 1;

  svRapelPoints.forEach(pt => {
    const cx = pt.x * scaleX;
    const cy = pt.y * scaleY;

    svCtx.save();
    if (alpha < 1) svCtx.globalAlpha = alpha;
    svCtx.translate(cx, cy);

    // Usar drawRapelIcon de route-drawing.js si está disponible
    if (typeof drawRapelIcon === 'function') {
      drawRapelIcon(svCtx, 0, 0, size, color);
    } else {
      // Fallback simple: círculo con anillo
      const s = size / 20;
      svCtx.strokeStyle = 'white';
      svCtx.lineWidth = 4;
      svCtx.beginPath();
      svCtx.arc(0, -14 * s, 7 * s, 0, Math.PI * 2);
      svCtx.stroke();
      svCtx.fillStyle = color;
      svCtx.beginPath();
      svCtx.arc(0, -14 * s, 7 * s, 0, Math.PI * 2);
      svCtx.fill();
      svCtx.fillStyle = 'white';
      svCtx.beginPath();
      svCtx.arc(0, -14 * s, 3 * s, 0, Math.PI * 2);
      svCtx.fill();
    }

    svCtx.restore();
  });
}

/**
 * Dibuja flecha de vía sin terminar (visor de sector)
 * La flecha apunta en la dirección del último segmento
 */
function drawSvAnchorSinTerminar(x, y, prevX, prevY, size, color) {
  const scale = size / 20;

  // Calcular ángulo desde prevPoint → lastPoint
  const angle = Math.atan2(y - prevY, x - prevX);

  svCtx.save();
  svCtx.translate(x, y);
  svCtx.rotate(angle);

  const arrowLen = 14 * scale;
  const arrowW = 7 * scale;
  const stemLen = 8 * scale;
  const stemW = 3 * scale;

  // Contorno blanco
  svCtx.strokeStyle = 'white';
  svCtx.lineWidth = 3 * scale;
  svCtx.lineJoin = 'round';
  svCtx.beginPath();
  svCtx.moveTo(arrowLen, 0);
  svCtx.lineTo(0, -arrowW);
  svCtx.lineTo(0, -stemW);
  svCtx.lineTo(-stemLen, -stemW);
  svCtx.lineTo(-stemLen, stemW);
  svCtx.lineTo(0, stemW);
  svCtx.lineTo(0, arrowW);
  svCtx.closePath();
  svCtx.stroke();

  // Relleno con color de la vía
  svCtx.fillStyle = color;
  svCtx.beginPath();
  svCtx.moveTo(arrowLen, 0);
  svCtx.lineTo(0, -arrowW);
  svCtx.lineTo(0, -stemW);
  svCtx.lineTo(-stemLen, -stemW);
  svCtx.lineTo(-stemLen, stemW);
  svCtx.lineTo(0, stemW);
  svCtx.lineTo(0, arrowW);
  svCtx.closePath();
  svCtx.fill();

  // Borde oscuro sutil
  svCtx.strokeStyle = 'rgba(0,0,0,0.4)';
  svCtx.lineWidth = 1;
  svCtx.stroke();

  svCtx.restore();
}

/**
 * Dibuja solo el PUNTO de inicio de una vía
 */
function drawOverlayRoutePoint(drawing, canvasWidth, canvasHeight) {
  const scaledPoints = getScaledPoints(drawing, canvasWidth, canvasHeight);
  if (!scaledPoints) return;

  const color = getRouteColor(drawing);
  const isHighlighted = svHighlightedRoute === drawing.routeId;
  const isZoomed = svZoomState.scale > 1;

  // Factor de escala para consistencia entre móvil y desktop
  const scaleFactor = getLineScaleFactor();

  // Con zoom: puntos más pequeños y transparentes
  let radius, borderRadius;
  if (isZoomed) {
    radius = (isHighlighted ? 5 : 4) * scaleFactor;
    borderRadius = radius + (1.5 * scaleFactor);
  } else {
    radius = (isHighlighted ? 8 : 6) * scaleFactor;
    borderRadius = radius + (2 * scaleFactor);
  }

  svCtx.shadowColor = 'transparent';
  svCtx.shadowBlur = 0;
  let borderColor, pointColor;
  if (isZoomed) {
    borderColor = isHighlighted ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.35)';
    pointColor = addAlphaToColor(color, 0.6);
  } else {
    borderColor = isHighlighted ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.65)';
    pointColor = color;
  }

  // Punto de inicio del tronco
  svCtx.fillStyle = borderColor;
  svCtx.beginPath();
  svCtx.arc(scaledPoints[0].x, scaledPoints[0].y, borderRadius, 0, Math.PI * 2);
  svCtx.fill();

  svCtx.fillStyle = pointColor;
  svCtx.beginPath();
  svCtx.arc(scaledPoints[0].x, scaledPoints[0].y, radius, 0, Math.PI * 2);
  svCtx.fill();

  // (Diamante de bifurcación eliminado - la línea se une directamente)
}

/**
 * Configura interacción con el canvas overlay
 */
function setupCanvasInteraction() {
  if (!svCanvas) return;

  // Remover listeners anteriores si existen (para evitar duplicados)
  svCanvas.removeEventListener('click', handleOverlayTap);
  svCanvas.removeEventListener('mousemove', handleOverlayHover);
  svCanvas.removeEventListener('mouseleave', handleCanvasMouseLeave);

  // Click/tap para mostrar info de vía (solo si resaltado habilitado)
  svCanvas.addEventListener('click', (e) => {
    // No procesar click si el resaltado está desactivado (durante/después de zoom)
    if (!svHighlightEnabled) {
      return;
    }
    handleOverlayTap(e);
  });

  // Touch para móviles - detectar pinch y tap
  let canvasTouchStartTime = 0;
  let canvasWasPinching = false;

  svCanvas.addEventListener('touchstart', (e) => {
    canvasTouchStartTime = Date.now();

    // Si hay 2 dedos, es pinch zoom - desactivar resaltado
    if (e.touches.length === 2) {
      canvasWasPinching = true;
      svWasPinching = true;
      svHighlightEnabled = false;

      // Cancelar timer de reactivación si existe
      if (svHighlightReenableTimer) {
        clearTimeout(svHighlightReenableTimer);
        svHighlightReenableTimer = null;
      }
    }
  }, { passive: true });

  svCanvas.addEventListener('touchend', (e) => {
    const touchDuration = Date.now() - canvasTouchStartTime;

    // Si estábamos haciendo pinch, no procesar como tap
    if (canvasWasPinching) {
      // Si ya no quedan dedos, marcar que terminó el pinch
      if (e.touches.length === 0) {
        canvasWasPinching = false;
      }
      return;
    }

    // No procesar tap si el resaltado está desactivado (durante/después de zoom)
    if (!svHighlightEnabled) {
      return;
    }

    // Solo procesar como tap si fue un toque corto con un solo dedo
    if (e.changedTouches.length === 1 && touchDuration < 300) {
      e.preventDefault();
      const touch = e.changedTouches[0];
      handleOverlayTap({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }, { passive: false });

  // Hover para mostrar popup de vía (solo desktop)
  svCanvas.addEventListener('mousemove', handleOverlayHover);
  svCanvas.addEventListener('mouseleave', handleCanvasMouseLeave);

  // Mantener zoom de la imagen de fondo
  setupImageZoom();

  console.log('[SectorViewer] Interacción del canvas configurada');
}

// Variable para controlar el debounce del hover
let svHoverTimeout = null;
let svCurrentHoverRoute = null;
let svHighlightedRoute = null; // routeId de la vía actualmente resaltada
let svHighlightedVariantIndex = null; // variantIndex del dibujo resaltado
let svPendingHighlightRoute = null; // routeId de la vía que debe resaltarse al abrir el visor
let svLockedRoute = null; // routeId de la vía bloqueada (seleccionada por click/tap)
let svLockedVariantIndex = null; // variantIndex del dibujo bloqueado

/**
 * Maneja hover sobre el canvas para mostrar popup de vía
 */
function handleOverlayHover(event) {
  if (!svCanvas || !svImage) return;

  // Si estamos arrastrando con zoom, no procesar hover
  if (svZoomState.isDragging) return;

  const rect = svCanvas.getBoundingClientRect();

  // Usar dimensiones lógicas del canvas (sin DPR) para escalar coordenadas
  const displayWidth = svCanvas.displayWidth || svCanvas.width;
  const displayHeight = svCanvas.displayHeight || svCanvas.height;

  // Convertir coordenadas del mouse a coordenadas del canvas lógicas
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  let x, y;
  if (svZoomState.scale === 1 && svZoomState.translateX === 0 && svZoomState.translateY === 0) {
    x = (mouseX / rect.width) * displayWidth;
    y = (mouseY / rect.height) * displayHeight;
  } else {
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const scaleX = displayWidth / rect.width;
    const scaleY = displayHeight / rect.height;
    x = ((mouseX - centerX) / svZoomState.scale + centerX - svZoomState.translateX / svZoomState.scale) * scaleX;
    y = ((mouseY - centerY) / svZoomState.scale + centerY - svZoomState.translateY / svZoomState.scale) * scaleY;
  }

  // El threshold se ajusta inversamente al zoom para que sea más fácil seleccionar con zoom
  const threshold = 15 / svZoomState.scale;
  // Usar dimensiones lógicas para escalar puntos
  const canvasWidth = displayWidth;
  const canvasHeight = displayHeight;

  let foundRoute = null;
  let foundNumber = 0;

  for (let i = 0; i < svDrawings.length; i++) {
    const drawing = svDrawings[i];
    const paths = getScaledPathsMulti(drawing, canvasWidth, canvasHeight);

    let found = false;
    for (const path of paths) {
      if (!path.points || path.points.length < 2) continue;
      for (let j = 0; j < path.points.length - 1; j++) {
        const dist = distanceToLine(
          x, y,
          path.points[j].x, path.points[j].y,
          path.points[j + 1].x, path.points[j + 1].y
        );
        if (dist < threshold) {
          foundRoute = drawing;
          foundNumber = i + 1;
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (foundRoute) break;
  }

  // Cambiar cursor según si está sobre una vía
  svCanvas.style.cursor = foundRoute ? 'pointer' : 'default';

  // Detectar si cambió la vía resaltada (using routeId + variantIndex)
  const newHighlight = foundRoute ? foundRoute.routeId : null;
  const newVariantIndex = foundRoute ? (foundRoute.variantIndex || 0) : null;
  const highlightChanged = newHighlight !== svHighlightedRoute || newVariantIndex !== svHighlightedVariantIndex;

  // Si encontramos una vía diferente a la actual
  if (foundRoute && highlightChanged) {
    // Una vez que pasamos a otra vía, desbloquear (volver a comportamiento normal)
    svLockedRoute = null;
    svLockedVariantIndex = null;
    svHighlightedRoute = foundRoute.routeId;
    svHighlightedVariantIndex = foundRoute.variantIndex || 0;
    svCurrentHoverRoute = foundRoute.routeId;

    // Redibujar el canvas
    redrawCanvasOverlay();

    // Mostrar popup en la posición de la vía
    showLockedRoutePopup(foundRoute, foundNumber);
  } else if (!foundRoute && !svLockedRoute) {
    // No hay vía bajo el cursor y no hay vía bloqueada: limpiar todo
    if (svHighlightedRoute) {
      svHighlightedRoute = null;
      svHighlightedVariantIndex = null;
      svCurrentHoverRoute = null;
      redrawCanvasOverlay();
      hideLockedPopup();
    }
  }
  // Si hay vía bloqueada (viene de "Ver vía"), mantener el estado hasta pasar por otra
}

/**
 * Actualiza la posición del popup de hover
 */
function updateHoverPopupPosition(mouseX, mouseY) {
  const popup = document.getElementById('sv-hover-popup');
  if (!popup) return;

  popup.style.left = `${mouseX + 15}px`;
  popup.style.top = `${mouseY - 10}px`;

  // Ajustar si se sale de la pantalla
  const popupRect = popup.getBoundingClientRect();
  if (popupRect.right > window.innerWidth) {
    popup.style.left = `${mouseX - popupRect.width - 15}px`;
  }
  if (popupRect.bottom > window.innerHeight) {
    popup.style.top = `${mouseY - popupRect.height - 10}px`;
  }
}

/**
 * Muestra popup flotante con info de la vía al hacer hover
 */
function showHoverRoutePopup(drawing, number, mouseX, mouseY) {
  // Buscar datos completos de la vía (by routeId+variantIndex with fallback to routeName)
  const dvi = drawing.variantIndex || 0;
  const route = svRoutesList.find(r =>
    (drawing.routeId !== undefined && r.routeId === drawing.routeId && (r.variantIndex || 0) === dvi) ||
    (drawing.routeId === undefined && r.nombre === drawing.routeName)
  );
  const baseName = route?.nombre || drawing.routeName || 'Sin nombre';
  const routeName = dvi > 0 ? `${baseName} (variante_${dvi})` : baseName;
  const grado = route?.grado || '?';
  const gradeColor = typeof getGradeColor === 'function' ? getGradeColor(grado) : '#10b981';

  // Eliminar popup anterior si existe
  hideHoverPopup();

  const popup = document.createElement('div');
  popup.id = 'sv-hover-popup';
  popup.className = 'sv-hover-popup';
  popup.innerHTML = `
    <div class="sv-hover-popup-content">
      <span class="sv-hover-grade" style="background-color: ${gradeColor}">${grado}</span>
      <span class="sv-hover-name">${routeName}</span>
    </div>
  `;

  // Posicionar popup cerca del cursor
  popup.style.position = 'fixed';
  popup.style.left = `${mouseX + 15}px`;
  popup.style.top = `${mouseY - 10}px`;
  popup.style.zIndex = '999999';

  document.body.appendChild(popup);

  // Ajustar posición si se sale de la pantalla
  const popupRect = popup.getBoundingClientRect();
  if (popupRect.right > window.innerWidth) {
    popup.style.left = `${mouseX - popupRect.width - 15}px`;
  }
  if (popupRect.bottom > window.innerHeight) {
    popup.style.top = `${mouseY - popupRect.height - 10}px`;
  }
}

/**
 * Oculta el popup de hover (sin afectar el resaltado)
 */
function hideHoverPopup() {
  const popup = document.getElementById('sv-hover-popup');
  if (popup) {
    popup.remove();
  }
  svCurrentHoverRoute = null;
}

/**
 * Limpia el resaltado cuando el mouse sale del canvas
 * (solo si no hay vía bloqueada)
 */
function handleCanvasMouseLeave() {
  // Si hay una vía bloqueada, no hacer nada
  if (svLockedRoute) {
    return;
  }

  hideHoverPopup();
  if (svHighlightedRoute) {
    svHighlightedRoute = null;
    svHighlightedVariantIndex = null;
    redrawCanvasOverlay();
  }
}

/**
 * Maneja tap en el overlay
 * Bloquea la vía tocada, la resalta y muestra el popup
 */
function handleOverlayTap(event) {
  if (!svCanvas || !svImage) return;

  // Si estamos arrastrando con zoom, no procesar tap
  if (svZoomState.isDragging) return;

  const rect = svCanvas.getBoundingClientRect();

  // Usar dimensiones lógicas del canvas (sin DPR) para escalar coordenadas
  const displayWidth = svCanvas.displayWidth || svCanvas.width;
  const displayHeight = svCanvas.displayHeight || svCanvas.height;

  // Convertir coordenadas del tap a coordenadas del canvas lógicas
  // Paso 1: Obtener posición del tap relativa al rect visual del canvas
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  // Paso 2: Convertir a coordenadas lógicas del canvas, invirtiendo la transformación CSS
  // La transformación CSS es: transform-origin: center + translate(tx, ty) + scale(s)
  // Para invertir: restar el translate, desescalar respecto al centro
  let x, y;
  if (svZoomState.scale === 1 && svZoomState.translateX === 0 && svZoomState.translateY === 0) {
    // Sin zoom: conversión directa (más precisa, evita errores de redondeo)
    x = (mouseX / rect.width) * displayWidth;
    y = (mouseY / rect.height) * displayHeight;
  } else {
    // Con zoom: invertir la transformación CSS
    // El canvas tiene transform-origin: center center
    // La transformación visual es: translate(tx, ty) scale(s) aplicada desde el centro
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const scaleX = displayWidth / rect.width;
    const scaleY = displayHeight / rect.height;
    x = ((mouseX - centerX) / svZoomState.scale + centerX - svZoomState.translateX / svZoomState.scale) * scaleX;
    y = ((mouseY - centerY) / svZoomState.scale + centerY - svZoomState.translateY / svZoomState.scale) * scaleY;
  }

  // El threshold se ajusta inversamente al zoom para que sea más fácil seleccionar con zoom
  const threshold = 30 / svZoomState.scale;
  // Usar dimensiones lógicas para escalar puntos
  const canvasWidth = displayWidth;
  const canvasHeight = displayHeight;

  for (let i = 0; i < svDrawings.length; i++) {
    const drawing = svDrawings[i];
    try {
      const paths = getScaledPathsMulti(drawing, canvasWidth, canvasHeight);

      let found = false;
      for (const path of paths) {
        if (!path.points || path.points.length < 2) continue;
        for (let j = 0; j < path.points.length - 1; j++) {
          const dist = distanceToLine(
            x, y,
            path.points[j].x, path.points[j].y,
            path.points[j + 1].x, path.points[j + 1].y
          );

          if (dist < threshold) {
            found = true;
            const mobile = typeof isMobileDevice === 'function' && isMobileDevice();

            if (!mobile) {
              svNavigateToRouteOnMap(drawing.routeId);
            } else {
              const _dvi = drawing.variantIndex || 0;
              if (svLockedRoute === drawing.routeId && svLockedVariantIndex === _dvi) return;
              svLockedRoute = drawing.routeId;
              svLockedVariantIndex = _dvi;
              svHighlightedRoute = drawing.routeId;
              svHighlightedVariantIndex = _dvi;
              redrawCanvasOverlay();
              showLockedRoutePopup(drawing, i + 1);
            }
            return;
          }
        }
        if (found) break;
      }
    } catch (e) {
      console.error('[SectorViewer] Error en hit detection para drawing:', drawing.routeId, e);
    }
  }

  // Si llegamos aquí, no se tocó ninguna vía -> cerrar popup y desbloquear
  if (svLockedRoute) {
    svLockedRoute = null;
    svLockedVariantIndex = null;
    svHighlightedRoute = null;
    svHighlightedVariantIndex = null;
    hideLockedPopup();
    redrawCanvasOverlay();
  }
}

/**
 * Muestra el popup fijo de una vía bloqueada/seleccionada
 * Posicionado cerca del punto de inicio de la vía
 */
function showLockedRoutePopup(drawing, number) {
  // Buscar datos completos de la vía (by routeId+variantIndex with fallback to routeName)
  const dvi = drawing.variantIndex || 0;
  const route = svRoutesList.find(r =>
    (drawing.routeId !== undefined && r.routeId === drawing.routeId && (r.variantIndex || 0) === dvi) ||
    (drawing.routeId === undefined && r.nombre === drawing.routeName)
  );
  const baseName = route?.nombre || drawing.routeName || 'Sin nombre';
  const routeName = dvi > 0 ? `${baseName} (variante_${dvi})` : baseName;
  const grado = route?.grado || '?';
  const gradeColor = typeof getGradeColor === 'function' ? getGradeColor(grado) : '#10b981';

  // Eliminar popup anterior si existe
  hideLockedPopup();

  // Obtener el punto de inicio de la vía para posicionar el popup
  let startPoint = null;
  if (drawing.points && drawing.points.length > 0) {
    startPoint = drawing.points[0];
  } else if (drawing.startPoint) {
    startPoint = drawing.startPoint;
  }

  if (!startPoint || !svCanvas || !svImage) return;

  // Calcular posición en pantalla usando dimensiones lógicas
  const rect = svCanvas.getBoundingClientRect();
  const displayWidth = svCanvas.displayWidth || svCanvas.width;
  const displayHeight = svCanvas.displayHeight || svCanvas.height;
  const scaleX = rect.width / displayWidth;
  const scaleY = rect.height / displayHeight;

  const screenX = rect.left + (startPoint.x / svImage.naturalWidth) * displayWidth * scaleX;
  const screenY = rect.top + (startPoint.y / svImage.naturalHeight) * displayHeight * scaleY;

  const routeIdForBtn = drawing.routeId;

  const popup = document.createElement('div');
  popup.id = 'sv-locked-popup';
  popup.className = 'sv-locked-popup';
  popup.innerHTML = `
    <div class="sv-locked-popup-content sv-locked-popup-navigable">
      <span class="sv-locked-grade" style="background-color: ${gradeColor}">${grado}</span>
      <span class="sv-locked-name">${routeName}</span>
      <span class="sv-locked-nav-arrow">&#x279C;</span>
    </div>
  `;

  // Posicionar cerca del punto de inicio (un poco arriba y a la derecha)
  popup.style.position = 'fixed';
  popup.style.left = `${screenX + 15}px`;
  popup.style.top = `${screenY - 20}px`;
  popup.style.zIndex = '999999';

  document.body.appendChild(popup);

  // Hacer todo el popup navegable: al pulsar cualquier parte, navegar al mapa.
  // Se usa el contenedor externo (popup) para capturar todos los toques,
  // incluso los que caigan entre el borde del content y el wrapper.
  let popupTouchStarted = false;
  popup.addEventListener('touchstart', (e) => {
    e.stopPropagation();
    popupTouchStarted = true;
  }, { passive: false });

  popup.addEventListener('touchend', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (popupTouchStarted) {
      popupTouchStarted = false;
      svNavigateToRouteOnMap(routeIdForBtn);
    }
  }, { passive: false });

  popup.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    svNavigateToRouteOnMap(routeIdForBtn);
  });

  // Ajustar si se sale de la pantalla
  const popupRect = popup.getBoundingClientRect();
  if (popupRect.right > window.innerWidth) {
    popup.style.left = `${screenX - popupRect.width - 15}px`;
  }
  if (popupRect.top < 0) {
    popup.style.top = `${screenY + 30}px`;
  }
  // Asegurar que no se sale por abajo en pantallas pequeñas
  const popupRectUpdated = popup.getBoundingClientRect();
  if (popupRectUpdated.bottom > window.innerHeight) {
    popup.style.top = `${screenY - popupRectUpdated.height - 10}px`;
  }
}

/**
 * Oculta el popup de vía bloqueada
 */
function hideLockedPopup() {
  const popup = document.getElementById('sv-locked-popup');
  if (popup) {
    popup.remove();
  }
}

/**
 * Navega al mapa y resalta la vía seleccionada.
 * Cierra el visor de sector, centra el mapa en la vía y aplica un highlight temporal.
 * Compatible con Web y App Nativa (Capacitor).
 */
function svNavigateToRouteOnMap(routeId) {
  // Haptic feedback en app nativa
  if (window.kruxHaptics && typeof window.kruxHaptics.vibrate === 'function') {
    try { window.kruxHaptics.vibrate(); } catch (e) {}
  }

  // Cerrar el visor de sector
  closeSectorImageViewer();

  // Pequeño delay para permitir que la animación de cierre termine
  // antes de iniciar el vuelo del mapa (evita jank en móvil)
  setTimeout(() => {
    if (typeof mlHighlightRouteOnMap === 'function') {
      mlHighlightRouteOnMap(routeId);
    }
  }, 250);
}

/**
 * Carga las vías del sector para obtener información de grados
 * Incluye vías del GeoJSON estático Y vías aprobadas de pending_routes en Firestore
 */
async function loadViewerSectorRoutes(schoolId, sectorName) {
  svRoutesList = [];

  try {
    // 1. Cargar vías del GeoJSON estático
    if (typeof MAPLIBRE_SCHOOLS !== 'undefined') {
      const school = MAPLIBRE_SCHOOLS[schoolId];
      if (school && school.geojson && school.geojson.vias) {
        const response = await fetch(school.geojson.vias + '?v=' + Date.now());
        if (response.ok) {
          const geojson = await response.json();
          if (geojson.features) {
            const expanded = [];
            geojson.features
              .filter(f => f.properties.sector === sectorName)
              .forEach(f => {
                const p = f.properties;
                expanded.push({ routeId: Number(p.id), nombre: p.nombre, grado: p.grado1 || '?', sector: p.sector, variantIndex: 0 });
                if (p.variante === 'SI' && !p.union) {
                  for (let i = 2; i <= 5; i++) {
                    const grado = p['grado' + i];
                    if (grado != null && grado !== '') {
                      expanded.push({ routeId: Number(p.id), nombre: p.nombre, grado, sector: p.sector, variantIndex: i - 1 });
                    }
                  }
                }
              });
            svRoutesList = expanded;
          }
        }
      }
    }

    console.log('[SectorViewer] Vías del GeoJSON cargadas:', svRoutesList.length);

    // 2. Cargar vías aprobadas de pending_routes en Firestore
    if (typeof db !== 'undefined' && db) {
      try {
        const approvedSnapshot = await db.collection('pending_routes')
          .where('status', '==', 'approved')
          .where('schoolId', '==', schoolId)
          .where('sector', '==', sectorName)
          .get();

        if (!approvedSnapshot.empty) {
          const approvedRoutes = [];
          approvedSnapshot.forEach(doc => {
            const data = doc.data();
            // Solo añadir si no existe ya en la lista (evitar duplicados)
            const numRouteId = data.routeId !== undefined ? Number(data.routeId) : undefined;
            const exists = svRoutesList.some(r => r.routeId === numRouteId || r.nombre === data.nombre);
            if (!exists) {
              approvedRoutes.push({
                routeId: numRouteId || doc.id,
                nombre: data.nombre,
                grado: data.grado1 || '?',
                sector: data.sector,
                isApproved: true // Marca para identificar que viene de Firestore
              });
            }
          });

          svRoutesList = [...svRoutesList, ...approvedRoutes];
          console.log('[SectorViewer] Vías aprobadas añadidas:', approvedRoutes.length);
        }
      } catch (firestoreError) {
        console.warn('[SectorViewer] Error cargando vías aprobadas de Firestore:', firestoreError);
      }
    }

    console.log('[SectorViewer] Total vías del sector:', svRoutesList.length);
  } catch (error) {
    console.error('[SectorViewer] Error cargando vías:', error);
  }
}

/**
 * Carga los dibujos de vías para el visor
 */
async function loadViewerRouteDrawings(schoolId, sectorName) {
  svDrawings = [];

  try {
    // Verificar que Firestore está disponible
    if (typeof db === 'undefined' || !db) {
      console.warn('[SectorViewer] Firestore no está disponible aún');
      return;
    }

    const docId = `${schoolId}_${normalizeSectorName(sectorName)}`;
    const doc = await db.collection('sector_route_drawings').doc(docId).get();

    if (doc.exists) {
      const data = doc.data();
      svDrawings = data.drawings || [];
      // Normalizar routeId a Number para consistencia entre plataformas
      svDrawings.forEach(d => {
        if (d.routeId !== undefined) d.routeId = Number(d.routeId);
      });
      console.log('[SectorViewer] Dibujos cargados:', svDrawings.length);
    } else {
      console.log('[SectorViewer] No hay dibujos guardados para este sector');
    }
  } catch (error) {
    console.error('[SectorViewer] Error cargando dibujos:', error);
  }
}


/**
 * Calcula la distancia de un punto a una línea
 */
function distanceToLine(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Muestra información de una vía tocada
 */
function showViewerRouteInfo(drawing, number) {
  const dvi = drawing.variantIndex || 0;
  const route = svRoutesList.find(r =>
    (drawing.routeId !== undefined && r.routeId === drawing.routeId && (r.variantIndex || 0) === dvi) ||
    (drawing.routeId === undefined && r.nombre === drawing.routeName)
  );
  const baseName = route?.nombre || drawing.routeName || 'Sin nombre';
  const routeName = dvi > 0 ? `${baseName} (variante_${dvi})` : baseName;

  // Crear mini popup
  const existing = document.querySelector('.sv-route-info');
  if (existing) existing.remove();

  const info = document.createElement('div');
  info.className = 'sv-route-info';
  info.innerHTML = `
    <div class="sv-route-info-content">
      <span class="sv-route-number">${number}</span>
      <span class="sv-route-name">${routeName}</span>
      <button class="sv-route-close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;

  document.querySelector('.sector-image-viewer').appendChild(info);

  // Auto-ocultar después de 5 segundos
  setTimeout(() => {
    if (info.parentElement) {
      info.classList.add('sv-route-info-hide');
      setTimeout(() => info.remove(), 300);
    }
  }, 5000);
}

// ============================================
// ABRIR VISOR CON VÍA RESALTADA
// ============================================

/**
 * Abre el visor del sector con una vía específica resaltada
 * @param {string} schoolId - ID de la escuela
 * @param {string} sectorName - Nombre del sector
 * @param {string} routeId - ID de la vía (GeoJSON properties.id)
 */
async function openSectorImageViewerWithHighlight(schoolId, sectorName, routeId) {
  // Normalizar routeId a Number para consistencia entre plataformas
  routeId = Number(routeId);
  console.log('[SectorViewer] Abriendo visor con vía resaltada, routeId:', routeId);

  // Guardar el routeId a resaltar para cuando el canvas se configure
  svPendingHighlightRoute = routeId;

  // Buscar en qué imagen está dibujada la vía
  let startIndex = 0;
  try {
    const normalizedName = normalizeSectorName(sectorName);
    const docId = `${schoolId}_${normalizedName}`;

    // Obtener los dibujos para encontrar el imageId de la vía
    const drawingsDoc = await db.collection('sector_route_drawings').doc(docId).get();
    if (drawingsDoc.exists) {
      const data = drawingsDoc.data();
      const drawings = data.drawings || [];
      const routeDrawing = drawings.find(d => Number(d.routeId) === routeId);

      if (routeDrawing && routeDrawing.imageId) {
        // Obtener las imágenes del sector para encontrar el índice
        const images = await getSectorGalleryImages(schoolId, sectorName);
        const imageIndex = images.findIndex(img => img.id === routeDrawing.imageId);

        if (imageIndex !== -1) {
          startIndex = imageIndex;
          console.log('[SectorViewer] Vía encontrada en imagen índice:', startIndex, 'imageId:', routeDrawing.imageId);
        }
      }
    }
  } catch (error) {
    console.error('[SectorViewer] Error buscando imagen de la vía:', error);
  }

  // Abrir el visor en la imagen donde está la vía
  await openSectorImageViewer(schoolId, sectorName, startIndex);
}

/**
 * Verifica si una vía tiene dibujo en la imagen del sector
 * @param {string} schoolId - ID de la escuela
 * @param {string} sectorName - Nombre del sector
 * @param {string} routeId - ID de la vía (GeoJSON properties.id)
 * @returns {Promise<boolean>} - true si la vía tiene dibujo
 */
async function hasRouteDrawing(schoolId, sectorName, routeId) {
  try {
    if (typeof db === 'undefined' || !db) {
      return false;
    }

    const docId = `${schoolId}_${normalizeSectorName(sectorName)}`;
    const doc = await db.collection('sector_route_drawings').doc(docId).get();

    if (doc.exists) {
      const data = doc.data();
      const drawings = data.drawings || [];
      const numRouteId = Number(routeId);
      return drawings.some(d => Number(d.routeId) === numRouteId);
    }
    return false;
  } catch (error) {
    console.error('[SectorViewer] Error verificando dibujo:', error);
    return false;
  }
}

/**
 * Verifica si un sector tiene imagen
 * @param {string} schoolId - ID de la escuela
 * @param {string} sectorName - Nombre del sector
 * @returns {Promise<boolean>} - true si el sector tiene imagen
 */
async function sectorHasImage(schoolId, sectorName) {
  const url = await getSectorImageUrl(schoolId, sectorName);
  return url !== null;
}

// Exponer funciones globalmente
window.openSectorImageViewer = openSectorImageViewer;
window.closeSectorImageViewer = closeSectorImageViewer;
window.showSectorUploadModal = showSectorUploadModal;
window.closeSectorUploadModal = closeSectorUploadModal;
window.uploadSectorImage = uploadSectorImage;
window.removeSectorPreview = removeSectorPreview;
window.getSectorViewButtonHTML = getSectorViewButtonHTML;
window.openSectorImageViewerWithHighlight = openSectorImageViewerWithHighlight;
window.hasRouteDrawing = hasRouteDrawing;
window.sectorHasImage = sectorHasImage;
window.showDeleteSectorImageModal = showDeleteSectorImageModal;
window.closeDeleteSectorImageModal = closeDeleteSectorImageModal;
window.deleteSectorImage = deleteSectorImage;

// Funciones de galería
window.galleryNavigate = galleryNavigate;
window.galleryGoTo = galleryGoTo;
window.openGalleryManageModal = openGalleryManageModal;
window.closeGalleryManageModal = closeGalleryManageModal;
window.deleteGalleryImage = deleteGalleryImage;
window.openRouteDrawingEditorForCurrentImage = openRouteDrawingEditorForCurrentImage;
window.getSectorGalleryImages = getSectorGalleryImages;
window.getSectorImageCount = getSectorImageCount;

console.log('[SectorImages] Módulo de galería cargado');
