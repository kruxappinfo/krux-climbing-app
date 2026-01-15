/**
 * Sector Images Module
 *
 * Funcionalidades:
 * - Visualizar imágenes de sectores con vías dibujadas
 * - Subir imágenes de sectores (solo admins)
 * - Integración con Firebase Storage
 */

// ============================================
// VARIABLES GLOBALES
// ============================================
let sectorImageViewerOpen = false;
let currentSectorForImage = null;

// ============================================
// VERIFICACIÓN DE ADMIN
// ============================================

/**
 * Verifica si el usuario actual es admin
 */
async function isSectorImageAdmin() {
  try {
    const user = auth.currentUser;
    if (!user) return false;

    const adminDoc = await db.collection('admins').doc(user.uid).get();
    return adminDoc.exists && adminDoc.data().role === 'admin';
  } catch (error) {
    console.error('[SectorImages] Error verificando admin:', error);
    return false;
  }
}

// ============================================
// OBTENER URL DE IMAGEN DEL SECTOR
// ============================================

/**
 * Obtiene la URL de la imagen de un sector desde Firebase Storage
 * @param {string} schoolId - ID de la escuela (valeria, sanmartin, mora)
 * @param {string} sectorName - Nombre del sector
 * @returns {Promise<string|null>} URL de la imagen o null
 */
async function getSectorImageUrl(schoolId, sectorName) {
  try {
    // Normalizar nombre del sector para usar como nombre de archivo
    const normalizedName = normalizeSectorName(sectorName);
    const imagePath = `sector-images/${schoolId}/${normalizedName}.jpg`;

    const storageRef = firebase.storage().ref(imagePath);
    const url = await storageRef.getDownloadURL();
    return url;
  } catch (error) {
    // Si no existe la imagen, no es un error crítico
    if (error.code === 'storage/object-not-found') {
      console.log(`[SectorImages] No hay imagen para: ${schoolId}/${sectorName}`);
      return null;
    }
    console.error('[SectorImages] Error obteniendo imagen:', error);
    return null;
  }
}

/**
 * Verifica si existe una imagen para el sector
 */
async function hasSectorImage(schoolId, sectorName) {
  const url = await getSectorImageUrl(schoolId, sectorName);
  return url !== null;
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
// VISOR DE IMAGEN DEL SECTOR
// ============================================

/**
 * Abre el visor de imagen del sector
 * @param {string} schoolId - ID de la escuela
 * @param {string} sectorName - Nombre del sector
 */
async function openSectorImageViewer(schoolId, sectorName) {
  currentSectorForImage = { schoolId, sectorName };

  // Verificar si hay imagen
  const imageUrl = await getSectorImageUrl(schoolId, sectorName);
  const isAdmin = await isSectorImageAdmin();

  // Crear el visor
  const viewer = document.createElement('div');
  viewer.id = 'sector-image-viewer';
  viewer.className = 'sector-image-viewer';

  if (imageUrl) {
    // Mostrar imagen existente
    viewer.innerHTML = `
      <div class="sector-viewer-header">
        <button class="sector-viewer-close" onclick="closeSectorImageViewer()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <h2 class="sector-viewer-title">${sectorName}</h2>
        <div class="sector-viewer-actions">
          ${isAdmin ? `
            <button class="sector-viewer-draw" onclick="openRouteDrawingEditor('${schoolId}', '${encodeURIComponent(sectorName)}')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </button>
            <button class="sector-viewer-upload" onclick="showSectorUploadModal('${schoolId}', '${encodeURIComponent(sectorName)}')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </button>
            <button class="sector-viewer-delete" onclick="showDeleteSectorImageModal('${schoolId}', '${encodeURIComponent(sectorName)}')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
          ` : ''}
        </div>
      </div>
      <div class="sector-viewer-image-container" id="sector-viewer-container">
        <img src="${imageUrl}" alt="${sectorName}" class="sector-viewer-image" id="sector-full-image">
        <canvas id="sector-viewer-canvas" class="sector-viewer-canvas" style="display: none;"></canvas>
      </div>
      <div class="sector-viewer-footer">
        <span class="sector-viewer-hint">Pellizca para hacer zoom • Toca las líneas para ver información de las vías</span>
      </div>
    `;
  } else {
    // No hay imagen - mostrar placeholder
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
        <p class="sector-placeholder-text">No hay imagen disponible para este sector</p>
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

  // Añadir gestos de zoom y dibujo de vías si hay imagen
  if (imageUrl) {
    setupSectorViewerCanvas(schoolId, sectorName, imageUrl);
  }

  // Cerrar popup del sector
  if (typeof mlSectorPopup !== 'undefined' && mlSectorPopup) {
    mlSectorPopup.remove();
  }

  console.log('[SectorImages] Visor abierto para:', sectorName);
}

/**
 * Cierra el visor de imagen
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
  svLockedRoute = null;
  svPendingHighlightRoute = null;
}

/**
 * Configura zoom táctil para la imagen
 */
function setupImageZoom() {
  const img = document.getElementById('sector-full-image');
  if (!img) return;

  let scale = 1;
  let lastScale = 1;
  let startDist = 0;

  img.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      startDist = getDistance(e.touches[0], e.touches[1]);
      lastScale = scale;
    }
  }, { passive: true });

  img.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const currentDist = getDistance(e.touches[0], e.touches[1]);
      scale = Math.min(Math.max(lastScale * (currentDist / startDist), 1), 4);
      img.style.transform = `scale(${scale})`;
    }
  }, { passive: false });

  img.addEventListener('touchend', () => {
    if (scale < 1.1) {
      scale = 1;
      img.style.transform = 'scale(1)';
    }
    lastScale = scale;
  }, { passive: true });

  // Doble tap para reset
  let lastTap = 0;
  img.addEventListener('touchend', (e) => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    if (tapLength < 300 && tapLength > 0) {
      scale = 1;
      img.style.transform = 'scale(1)';
    }
    lastTap = currentTime;
  }, { passive: true });
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
            <span class="dropzone-hint">JPG, PNG - Máx 10MB</span>
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

function handleSectorFile(file) {
  // Validar tipo
  if (!file.type.startsWith('image/')) {
    showSectorToast('Solo se permiten imágenes', 'error');
    return;
  }

  // Validar tamaño (10MB máx)
  if (file.size > 10 * 1024 * 1024) {
    showSectorToast('La imagen es demasiado grande (máx 10MB)', 'error');
    return;
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
 * Sube la imagen a Firebase Storage
 */
async function uploadSectorImage(schoolId, encodedSectorName) {
  if (!pendingSectorFile) {
    showSectorToast('No hay imagen seleccionada', 'error');
    return;
  }

  const sectorName = decodeURIComponent(encodedSectorName);
  const normalizedName = normalizeSectorName(sectorName);
  const imagePath = `sector-images/${schoolId}/${normalizedName}.jpg`;

  // Mostrar progreso
  document.getElementById('sector-progress').style.display = 'flex';
  document.getElementById('sector-upload-btn').disabled = true;

  try {
    const storageRef = firebase.storage().ref(imagePath);

    // Comprimir imagen si es muy grande
    let fileToUpload = pendingSectorFile;
    if (pendingSectorFile.size > 2 * 1024 * 1024) {
      fileToUpload = await compressSectorImage(pendingSectorFile);
    }

    const uploadTask = storageRef.put(fileToUpload, {
      contentType: 'image/jpeg',
      customMetadata: {
        schoolId: schoolId,
        sectorName: sectorName,
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
        // Éxito
        const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();

        // Guardar referencia en Firestore
        await db.collection('sector_images').doc(`${schoolId}_${normalizedName}`).set({
          schoolId: schoolId,
          sectorName: sectorName,
          normalizedName: normalizedName,
          imageUrl: downloadURL,
          storagePath: imagePath,
          uploadedBy: auth.currentUser?.uid,
          uploadedByEmail: auth.currentUser?.email,
          uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showSectorToast('Imagen subida correctamente', 'success');
        closeSectorUploadModal();

        // Abrir el visor con la nueva imagen
        setTimeout(() => {
          openSectorImageViewer(schoolId, sectorName);
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
let svRoutesList = [];  // Lista de vías del sector para obtener grados

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
  if (img.complete) {
    initCanvasOverlay(img);
  } else {
    img.onload = () => initCanvasOverlay(img);
  }
}

/**
 * Inicializa el canvas como overlay sobre la imagen
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

  // Configurar canvas con las mismas dimensiones que la imagen renderizada
  svCanvas.width = imgWidth;
  svCanvas.height = imgHeight;

  // Posicionar canvas EXACTAMENTE sobre la imagen
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

  // Guardar referencia a la imagen para escalar coordenadas
  svImage = img;

  console.log('[SectorViewer] Canvas overlay configurado:', imgWidth, 'x', imgHeight);

  // Aplicar highlight pendiente si existe
  if (svPendingHighlightRoute) {
    svHighlightedRoute = svPendingHighlightRoute;
    svLockedRoute = svPendingHighlightRoute; // Bloquear también
    console.log('[SectorViewer] Aplicando highlight a:', svHighlightedRoute);

    // Buscar el dibujo para mostrar el popup
    const drawing = svDrawings.find(d => d.routeName === svPendingHighlightRoute);
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

  // Limpiar canvas (transparente)
  svCtx.clearRect(0, 0, svCanvas.width, svCanvas.height);

  const imgWidth = svCanvas.width;
  const imgHeight = svCanvas.height;

  // Separar la vía resaltada del resto
  const highlightedDrawing = svHighlightedRoute
    ? svDrawings.find(d => d.routeName === svHighlightedRoute)
    : null;
  const normalDrawings = svHighlightedRoute
    ? svDrawings.filter(d => d.routeName !== svHighlightedRoute)
    : svDrawings;

  // PASO 1: Dibujar las líneas normales primero
  normalDrawings.forEach((drawing) => {
    drawOverlayRouteLine(drawing, imgWidth, imgHeight);
  });

  // PASO 2: Dibujar los puntos de las vías normales
  normalDrawings.forEach((drawing) => {
    drawOverlayRoutePoint(drawing, imgWidth, imgHeight);
  });

  // PASO 3: Dibujar la línea resaltada encima de todo
  if (highlightedDrawing) {
    drawOverlayRouteLine(highlightedDrawing, imgWidth, imgHeight);
    drawOverlayRoutePoint(highlightedDrawing, imgWidth, imgHeight);
  }
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

  return points.map(p => ({
    x: (p.x / svImage.naturalWidth) * canvasWidth,
    y: (p.y / svImage.naturalHeight) * canvasHeight
  }));
}

/**
 * Obtiene el color de una vía según su grado
 */
function getRouteColor(drawing) {
  const route = svRoutesList.find(r => r.nombre === drawing.routeName);
  return route && typeof getGradeColor === 'function'
    ? getGradeColor(route.grado)
    : '#10b981';
}

/**
 * Dibuja solo la LÍNEA de una vía (sin el punto de inicio)
 */
function drawOverlayRouteLine(drawing, canvasWidth, canvasHeight) {
  const scaledPoints = getScaledPoints(drawing, canvasWidth, canvasHeight);
  if (!scaledPoints) return;

  const color = getRouteColor(drawing);
  const isHighlighted = svHighlightedRoute === drawing.routeName;

  // Grosor según si está resaltada o no
  const borderWidth = isHighlighted ? 10 : 7;
  const lineWidth = isHighlighted ? 6 : 4;

  // Dibujar borde/sombra oscura para mejor visibilidad
  svCtx.strokeStyle = isHighlighted ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.6)';
  svCtx.lineWidth = borderWidth;
  svCtx.lineCap = 'round';
  svCtx.lineJoin = 'round';
  svCtx.shadowColor = 'transparent';
  svCtx.shadowBlur = 0;

  svCtx.beginPath();
  svCtx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
  for (let i = 1; i < scaledPoints.length; i++) {
    svCtx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
  }
  svCtx.stroke();

  // Dibujar línea principal con color del grado
  svCtx.strokeStyle = color;
  svCtx.lineWidth = lineWidth;
  svCtx.lineCap = 'round';
  svCtx.lineJoin = 'round';

  svCtx.beginPath();
  svCtx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
  for (let i = 1; i < scaledPoints.length; i++) {
    svCtx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
  }
  svCtx.stroke();
}

/**
 * Dibuja solo el PUNTO de inicio de una vía
 */
function drawOverlayRoutePoint(drawing, canvasWidth, canvasHeight) {
  const scaledPoints = getScaledPoints(drawing, canvasWidth, canvasHeight);
  if (!scaledPoints) return;

  const color = getRouteColor(drawing);
  const isHighlighted = svHighlightedRoute === drawing.routeName;
  const radius = isHighlighted ? 8 : 6;

  // Borde para contraste (blanco si resaltado, oscuro si no)
  svCtx.shadowColor = 'transparent';
  svCtx.shadowBlur = 0;
  svCtx.fillStyle = isHighlighted ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.6)';
  svCtx.beginPath();
  svCtx.arc(scaledPoints[0].x, scaledPoints[0].y, radius + 2, 0, Math.PI * 2);
  svCtx.fill();

  // Punto de color
  svCtx.fillStyle = color;
  svCtx.beginPath();
  svCtx.arc(scaledPoints[0].x, scaledPoints[0].y, radius, 0, Math.PI * 2);
  svCtx.fill();
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

  // Click/tap para mostrar info de vía
  svCanvas.addEventListener('click', handleOverlayTap);

  // Touch para móviles - usar touchend para evitar conflictos con scroll
  svCanvas.addEventListener('touchend', (e) => {
    if (e.changedTouches.length === 1) {
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
let svHighlightedRoute = null; // Vía actualmente resaltada
let svPendingHighlightRoute = null; // Vía que debe resaltarse al abrir el visor
let svLockedRoute = null; // Vía bloqueada (seleccionada por click/tap)

/**
 * Maneja hover sobre el canvas para mostrar popup de vía
 */
function handleOverlayHover(event) {
  if (!svCanvas || !svImage) return;

  const rect = svCanvas.getBoundingClientRect();

  // Escalar coordenadas del mouse al sistema de coordenadas del canvas
  // El canvas puede tener un tamaño interno diferente al tamaño CSS
  const scaleX = svCanvas.width / rect.width;
  const scaleY = svCanvas.height / rect.height;

  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  const threshold = 10;
  const canvasWidth = svCanvas.width;
  const canvasHeight = svCanvas.height;

  let foundRoute = null;
  let foundNumber = 0;

  for (let i = 0; i < svDrawings.length; i++) {
    const drawing = svDrawings[i];

    // Soportar formato antiguo y nuevo
    let points = [];
    if (drawing.points && drawing.points.length > 0) {
      points = drawing.points;
    } else if (drawing.startPoint && drawing.endPoint) {
      points = [drawing.startPoint, drawing.endPoint];
    } else {
      continue;
    }

    // Escalar puntos
    const scaledPoints = points.map(p => ({
      x: (p.x / svImage.naturalWidth) * canvasWidth,
      y: (p.y / svImage.naturalHeight) * canvasHeight
    }));

    // Verificar distancia a cada segmento de la polyline
    for (let j = 0; j < scaledPoints.length - 1; j++) {
      const dist = distanceToLine(
        x, y,
        scaledPoints[j].x, scaledPoints[j].y,
        scaledPoints[j + 1].x, scaledPoints[j + 1].y
      );

      if (dist < threshold) {
        foundRoute = drawing;
        foundNumber = i + 1;
        break;
      }
    }
    if (foundRoute) break;
  }

  // Cambiar cursor según si está sobre una vía
  svCanvas.style.cursor = foundRoute ? 'pointer' : 'default';

  // Detectar si cambió la vía resaltada
  const newHighlight = foundRoute ? foundRoute.routeName : null;
  const highlightChanged = newHighlight !== svHighlightedRoute;

  // Si encontramos una vía diferente a la actual
  if (foundRoute && highlightChanged) {
    // Una vez que pasamos a otra vía, desbloquear (volver a comportamiento normal)
    svLockedRoute = null;
    svHighlightedRoute = foundRoute.routeName;
    svCurrentHoverRoute = foundRoute.routeName;

    // Redibujar el canvas
    redrawCanvasOverlay();

    // Mostrar popup en la posición de la vía
    showLockedRoutePopup(foundRoute, foundNumber);
  } else if (!foundRoute && !svLockedRoute) {
    // No hay vía bajo el cursor y no hay vía bloqueada: limpiar todo
    if (svHighlightedRoute) {
      svHighlightedRoute = null;
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
  // Buscar datos completos de la vía
  const route = svRoutesList.find(r => r.nombre === drawing.routeName);
  const routeName = drawing.routeName;
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
    redrawCanvasOverlay();
  }
}

/**
 * Maneja tap en el overlay
 * Bloquea la vía tocada, la resalta y muestra el popup
 */
function handleOverlayTap(event) {
  if (!svCanvas || !svImage) return;

  const rect = svCanvas.getBoundingClientRect();

  // Escalar coordenadas del tap al sistema de coordenadas del canvas
  const scaleX = svCanvas.width / rect.width;
  const scaleY = svCanvas.height / rect.height;

  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  const threshold = 25;
  const canvasWidth = svCanvas.width;
  const canvasHeight = svCanvas.height;

  for (let i = 0; i < svDrawings.length; i++) {
    const drawing = svDrawings[i];

    // Soportar formato antiguo y nuevo
    let points = [];
    if (drawing.points && drawing.points.length > 0) {
      points = drawing.points;
    } else if (drawing.startPoint && drawing.endPoint) {
      points = [drawing.startPoint, drawing.endPoint];
    } else {
      continue;
    }

    // Escalar puntos
    const scaledPoints = points.map(p => ({
      x: (p.x / svImage.naturalWidth) * canvasWidth,
      y: (p.y / svImage.naturalHeight) * canvasHeight
    }));

    // Verificar distancia a cada segmento de la polyline
    for (let j = 0; j < scaledPoints.length - 1; j++) {
      const dist = distanceToLine(
        x, y,
        scaledPoints[j].x, scaledPoints[j].y,
        scaledPoints[j + 1].x, scaledPoints[j + 1].y
      );

      if (dist < threshold) {
        // Bloquear esta vía como seleccionada
        svLockedRoute = drawing.routeName;
        svHighlightedRoute = drawing.routeName;

        // Redibujar con el nuevo highlight
        redrawCanvasOverlay();

        // Mostrar popup fijo de la vía
        showLockedRoutePopup(drawing, i + 1);
        return;
      }
    }
  }
}

/**
 * Muestra el popup fijo de una vía bloqueada/seleccionada
 * Posicionado cerca del punto de inicio de la vía
 */
function showLockedRoutePopup(drawing, number) {
  // Buscar datos completos de la vía
  const route = svRoutesList.find(r => r.nombre === drawing.routeName);
  const routeName = drawing.routeName;
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

  // Calcular posición en pantalla
  const rect = svCanvas.getBoundingClientRect();
  const scaleX = rect.width / svCanvas.width;
  const scaleY = rect.height / svCanvas.height;

  const screenX = rect.left + (startPoint.x / svImage.naturalWidth) * svCanvas.width * scaleX;
  const screenY = rect.top + (startPoint.y / svImage.naturalHeight) * svCanvas.height * scaleY;

  const popup = document.createElement('div');
  popup.id = 'sv-locked-popup';
  popup.className = 'sv-locked-popup';
  popup.innerHTML = `
    <div class="sv-locked-popup-content">
      <span class="sv-locked-grade" style="background-color: ${gradeColor}">${grado}</span>
      <span class="sv-locked-name">${routeName}</span>
    </div>
  `;

  // Posicionar cerca del punto de inicio (un poco arriba y a la derecha)
  popup.style.position = 'fixed';
  popup.style.left = `${screenX + 15}px`;
  popup.style.top = `${screenY - 20}px`;
  popup.style.zIndex = '999999';

  document.body.appendChild(popup);

  // Ajustar si se sale de la pantalla
  const popupRect = popup.getBoundingClientRect();
  if (popupRect.right > window.innerWidth) {
    popup.style.left = `${screenX - popupRect.width - 15}px`;
  }
  if (popupRect.top < 0) {
    popup.style.top = `${screenY + 30}px`;
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
            svRoutesList = geojson.features
              .filter(f => f.properties.sector === sectorName)
              .map(f => ({
                nombre: f.properties.nombre,
                grado: f.properties.grado1 || '?',
                sector: f.properties.sector
              }));
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
            const exists = svRoutesList.some(r => r.nombre === data.nombre);
            if (!exists) {
              approvedRoutes.push({
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
  const routeName = drawing.routeName;

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
 * @param {string} routeName - Nombre de la vía a resaltar
 */
async function openSectorImageViewerWithHighlight(schoolId, sectorName, routeName) {
  console.log('[SectorViewer] Abriendo visor con vía resaltada:', routeName);

  // Guardar la vía a resaltar para cuando el canvas se configure
  svPendingHighlightRoute = routeName;

  // Abrir el visor normalmente
  await openSectorImageViewer(schoolId, sectorName);
}

/**
 * Verifica si una vía tiene dibujo en la imagen del sector
 * @param {string} schoolId - ID de la escuela
 * @param {string} sectorName - Nombre del sector
 * @param {string} routeName - Nombre de la vía
 * @returns {Promise<boolean>} - true si la vía tiene dibujo
 */
async function hasRouteDrawing(schoolId, sectorName, routeName) {
  try {
    if (typeof db === 'undefined' || !db) {
      return false;
    }

    const docId = `${schoolId}_${normalizeSectorName(sectorName)}`;
    const doc = await db.collection('sector_route_drawings').doc(docId).get();

    if (doc.exists) {
      const data = doc.data();
      const drawings = data.drawings || [];
      return drawings.some(d => d.routeName === routeName);
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

console.log('[SectorImages] Módulo cargado');
