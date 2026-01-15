/**
 * Admin Routes Panel
 *
 * Panel de administración para aprobar/rechazar vías pendientes.
 * Acceso exclusivo para super-admin (krux.app.info@gmail.com)
 */

// ============================================
// CONFIGURACIÓN
// ============================================

const SUPER_ADMIN_EMAIL = 'krux.app.info@gmail.com';

let db;
let auth;
let currentUser = null;
let allRoutes = [];

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
});

function initFirebase() {
    db = firebase.firestore();
    auth = firebase.auth();

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await checkSuperAdminAccess(user);
        } else {
            // No autenticado, redirigir al login
            showAccessDenied();
        }
    });
}

// ============================================
// VERIFICACIÓN DE SUPER ADMIN
// ============================================

async function checkSuperAdminAccess(user) {
    const loadingState = document.getElementById('loadingState');

    // Verificar si es el super admin
    if (user.email !== SUPER_ADMIN_EMAIL) {
        showAccessDenied();
        return;
    }

    // Es super admin, mostrar panel
    loadingState.style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';

    // Cargar datos
    await loadSchoolsFilter();
    await loadRoutes();

    // Configurar listeners
    setupFilterListeners();
}

function showAccessDenied() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('accessDenied').style.display = 'block';
}

// ============================================
// CARGA DE DATOS
// ============================================

async function loadSchoolsFilter() {
    try {
        // Obtener escuelas únicas de las rutas pendientes
        const snapshot = await db.collection('pending_routes').get();
        const schools = new Set();

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.schoolId) {
                schools.add(JSON.stringify({ id: data.schoolId, name: data.schoolName || data.schoolId }));
            }
        });

        const select = document.getElementById('filterSchool');
        schools.forEach(schoolStr => {
            const school = JSON.parse(schoolStr);
            const option = document.createElement('option');
            option.value = school.id;
            option.textContent = school.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error cargando escuelas:', error);
    }
}

async function loadRoutes() {
    const routesList = document.getElementById('routesList');
    routesList.innerHTML = '<div class="loading">Cargando vías...</div>';

    try {
        const filterSchool = document.getElementById('filterSchool').value;
        const filterStatus = document.getElementById('filterStatus').value;

        let query = db.collection('pending_routes').orderBy('createdAt', 'desc');

        const snapshot = await query.get();
        allRoutes = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;

            // Aplicar filtros
            if (filterSchool !== 'all' && data.schoolId !== filterSchool) return;
            if (filterStatus !== 'all' && data.status !== filterStatus) return;

            allRoutes.push(data);
        });

        renderRoutes(allRoutes);
        updateStats();
    } catch (error) {
        console.error('Error cargando rutas:', error);
        routesList.innerHTML = '<div class="empty-state">Error al cargar las vías</div>';
    }
}

function renderRoutes(routes) {
    const routesList = document.getElementById('routesList');

    if (routes.length === 0) {
        routesList.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>No hay vías con los filtros seleccionados</p>
            </div>
        `;
        return;
    }

    routesList.innerHTML = routes.map(route => createRouteCard(route)).join('');
}

function createRouteCard(route) {
    const createdAt = route.createdAt ? new Date(route.createdAt.toDate()).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }) : 'Fecha desconocida';

    const statusClass = route.status || 'pending';
    const statusText = {
        'pending': 'Pendiente',
        'approved': 'Aprobada',
        'rejected': 'Rechazada'
    }[statusClass] || 'Pendiente';

    const statusBadgeClass = {
        'pending': 'status-pending',
        'approved': 'status-approved',
        'rejected': 'status-rejected'
    }[statusClass] || 'status-pending';

    const showActions = route.status === 'pending';

    return `
        <div class="route-card ${statusClass}" data-id="${route.id}">
            <div class="route-header">
                <div>
                    <div class="route-name">${escapeHtml(route.nombre || 'Sin nombre')}</div>
                    <span class="status-badge ${statusBadgeClass}">${statusText}</span>
                </div>
                <div class="route-grade">${escapeHtml(route.grado1 || '?')}</div>
            </div>

            <div class="route-details">
                <div class="route-detail">
                    <div class="route-detail-label">Escuela</div>
                    <div class="route-detail-value">${escapeHtml(route.schoolName || route.schoolId || 'Desconocida')}</div>
                </div>
                <div class="route-detail">
                    <div class="route-detail-label">Sector</div>
                    <div class="route-detail-value">${escapeHtml(route.sector || 'Sin sector')}</div>
                </div>
                <div class="route-detail">
                    <div class="route-detail-label">Modalidad</div>
                    <div class="route-detail-value">${escapeHtml(route.modalidad || 'Simple')}</div>
                </div>
                <div class="route-detail">
                    <div class="route-detail-label">Express</div>
                    <div class="route-detail-value">${route.exp1 || '-'}</div>
                </div>
                <div class="route-detail">
                    <div class="route-detail-label">Metros</div>
                    <div class="route-detail-value">${route.long1 ? route.long1 + 'm' : '-'}</div>
                </div>
                <div class="route-detail">
                    <div class="route-detail-label">Descripción</div>
                    <div class="route-detail-value">${escapeHtml(route.descripcion || '-')}</div>
                </div>
            </div>

            <div class="route-meta">
                <span>Enviada por: ${escapeHtml(route.createdByEmail || 'Desconocido')}</span>
                <span>${createdAt}</span>
            </div>

            <div class="route-actions">
                ${showActions ? `
                <button class="btn btn-approve" onclick="approveRoute('${route.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Aprobar
                </button>
                <button class="btn btn-reject" onclick="rejectRoute('${route.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Rechazar
                </button>
                ` : ''}
                <button class="btn btn-edit" onclick="openEditModal('${route.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Editar
                </button>
                <button class="btn btn-delete" onclick="deleteRoute('${route.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Eliminar
                </button>
            </div>
        </div>
    `;
}

// ============================================
// ACCIONES
// ============================================

async function approveRoute(routeId) {
    if (!confirm('¿Aprobar esta vía? Se añadirá al GeoJSON de exportación.')) return;

    try {
        await db.collection('pending_routes').doc(routeId).update({
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: currentUser.email
        });

        showToast('Vía aprobada correctamente', 'success');
        await loadRoutes();
    } catch (error) {
        console.error('Error aprobando ruta:', error);
        showToast('Error al aprobar la vía', 'error');
    }
}

async function rejectRoute(routeId) {
    if (!confirm('¿Rechazar y eliminar esta vía permanentemente? Esta acción no se puede deshacer.')) return;

    try {
        // Obtener datos de la vía antes de eliminarla (para eliminar el dibujo asociado)
        const routeDoc = await db.collection('pending_routes').doc(routeId).get();
        const routeData = routeDoc.exists ? routeDoc.data() : null;

        // Eliminar completamente la vía rechazada (sin dejar residuos)
        await db.collection('pending_routes').doc(routeId).delete();

        // Eliminar el dibujo asociado en sector_route_drawings
        if (routeData && routeData.schoolId && routeData.sector && routeData.nombre) {
            await deleteRouteDrawingFromSector(routeData.schoolId, routeData.sector, routeData.nombre);
        }

        showToast('Vía rechazada y eliminada', 'info');
        await loadRoutes();
    } catch (error) {
        console.error('Error rechazando ruta:', error);
        showToast('Error al rechazar la vía', 'error');
    }
}

async function deleteRoute(routeId) {
    if (!confirm('¿Eliminar esta vía permanentemente? Esta acción no se puede deshacer.')) return;

    try {
        // Obtener datos de la vía antes de eliminarla (para eliminar el dibujo asociado)
        const routeDoc = await db.collection('pending_routes').doc(routeId).get();
        const routeData = routeDoc.exists ? routeDoc.data() : null;

        // Eliminar la vía
        await db.collection('pending_routes').doc(routeId).delete();

        // Eliminar el dibujo asociado en sector_route_drawings
        if (routeData && routeData.schoolId && routeData.sector && routeData.nombre) {
            await deleteRouteDrawingFromSector(routeData.schoolId, routeData.sector, routeData.nombre);
        }

        showToast('Vía eliminada', 'info');
        await loadRoutes();
    } catch (error) {
        console.error('Error eliminando ruta:', error);
        showToast('Error al eliminar la vía', 'error');
    }
}

/**
 * Elimina el dibujo de una vía específica de sector_route_drawings
 */
async function deleteRouteDrawingFromSector(schoolId, sectorName, routeName) {
    try {
        const normalizedSector = normalizeSectorNameForDrawing(sectorName);
        const docId = `${schoolId}_${normalizedSector}`;

        const docRef = db.collection('sector_route_drawings').doc(docId);
        const doc = await docRef.get();

        if (doc.exists) {
            const data = doc.data();
            const drawings = data.drawings || [];

            // Filtrar para eliminar el dibujo de la vía específica
            const updatedDrawings = drawings.filter(d => d.routeName !== routeName);

            if (updatedDrawings.length !== drawings.length) {
                // Se encontró y eliminó el dibujo
                await docRef.update({
                    drawings: updatedDrawings,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log(`[AdminRoutes] Dibujo de "${routeName}" eliminado de sector_route_drawings`);
            }
        }
    } catch (error) {
        console.error('[AdminRoutes] Error eliminando dibujo de vía:', error);
        // No lanzar error - la vía ya fue eliminada, esto es secundario
    }
}

/**
 * Normaliza el nombre del sector para usarlo como ID de documento
 */
function normalizeSectorNameForDrawing(name) {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
        .replace(/[^a-z0-9]/g, '_')      // Reemplazar caracteres especiales
        .replace(/_+/g, '_')              // Evitar guiones múltiples
        .replace(/^_|_$/g, '');           // Quitar guiones al inicio/final
}

// ============================================
// EXPORTACIÓN
// ============================================

async function exportAllApproved() {
    try {
        const filterSchool = document.getElementById('filterSchool').value;

        let query = db.collection('pending_routes').where('status', '==', 'approved');

        const snapshot = await query.get();

        if (snapshot.empty) {
            showToast('No hay vías aprobadas para exportar', 'info');
            return;
        }

        // Agrupar por escuela
        const routesBySchool = {};

        snapshot.forEach(doc => {
            const data = doc.data();

            // Si hay filtro de escuela, solo incluir esa
            if (filterSchool !== 'all' && data.schoolId !== filterSchool) return;

            if (!routesBySchool[data.schoolId]) {
                routesBySchool[data.schoolId] = {
                    name: data.schoolName || data.schoolId,
                    features: []
                };
            }

            // Reconstruir GeoJSON feature
            const feature = {
                type: 'Feature',
                properties: {
                    fid: routesBySchool[data.schoolId].features.length + 1000,
                    nombre: data.nombre,
                    grado1: data.grado1,
                    sector: data.sector,
                    exp1: data.exp1,
                    long1: data.long1,
                    descripcion: data.descripcion,
                    modalidad: data.modalidad,
                    variante: data.variante || 'NO'
                },
                geometry: {
                    type: 'MultiPoint',
                    coordinates: [data.coordinates]
                }
            };

            routesBySchool[data.schoolId].features.push(feature);
        });

        // Si solo hay una escuela o hay filtro, descargar un archivo
        const schoolIds = Object.keys(routesBySchool);

        if (schoolIds.length === 0) {
            showToast('No hay vías para exportar con los filtros actuales', 'info');
            return;
        }

        // Descargar un archivo por escuela
        for (const schoolId of schoolIds) {
            const school = routesBySchool[schoolId];
            const geojson = {
                type: 'FeatureCollection',
                name: `${schoolId}_Vias_Aprobadas`,
                features: school.features
            };

            downloadJSON(geojson, `${schoolId}_vias_aprobadas_${Date.now()}.geojson`);
        }

        showToast(`Exportadas ${schoolIds.length} escuela(s)`, 'success');

    } catch (error) {
        console.error('Error exportando:', error);
        showToast('Error al exportar', 'error');
    }
}

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// ESTADÍSTICAS
// ============================================

async function updateStats() {
    try {
        const snapshot = await db.collection('pending_routes').get();

        let pending = 0;
        let approved = 0;

        snapshot.forEach(doc => {
            const status = doc.data().status || 'pending';
            if (status === 'pending') pending++;
            else if (status === 'approved') approved++;
        });

        document.getElementById('statPending').textContent = pending;
        document.getElementById('statApproved').textContent = approved;
    } catch (error) {
        console.error('Error actualizando stats:', error);
    }
}

// ============================================
// FILTROS
// ============================================

function setupFilterListeners() {
    document.getElementById('filterSchool').addEventListener('change', loadRoutes);
    document.getElementById('filterStatus').addEventListener('change', loadRoutes);
}

// ============================================
// UTILIDADES
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    // Remover toast existente
    const existing = document.querySelector('.admin-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `admin-toast admin-toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 9999;
        animation: slideUp 0.3s ease;
        ${type === 'success' ? 'background: #10b981; color: white;' : ''}
        ${type === 'error' ? 'background: #ef4444; color: white;' : ''}
        ${type === 'info' ? 'background: #3b82f6; color: white;' : ''}
    `;

    // Add animation keyframes if not exists
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            @keyframes slideUp {
                from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// LIMPIEZA DE DIBUJOS HUÉRFANOS
// ============================================

/**
 * Busca y elimina dibujos de vías que ya no existen
 * Compara los dibujos en sector_route_drawings con las vías en pending_routes
 */
async function cleanOrphanedDrawings() {
    if (!confirm('¿Buscar y eliminar dibujos de vías que ya no existen? Esto limpiará las líneas huérfanas de los sectores.')) return;

    showToast('Buscando dibujos huérfanos...', 'info');

    try {
        // 1. Obtener todas las vías aprobadas de pending_routes
        const approvedSnapshot = await db.collection('pending_routes')
            .where('status', '==', 'approved')
            .get();

        const approvedRouteNames = new Set();
        const routesBySector = {}; // Para saber qué vías hay en cada sector

        approvedSnapshot.forEach(doc => {
            const data = doc.data();
            const key = `${data.schoolId}_${data.sector}`;
            approvedRouteNames.add(`${key}_${data.nombre}`);

            if (!routesBySector[key]) {
                routesBySector[key] = {
                    schoolId: data.schoolId,
                    sector: data.sector,
                    routes: []
                };
            }
            routesBySector[key].routes.push(data.nombre);
        });

        // 2. Obtener todos los documentos de dibujos
        const drawingsSnapshot = await db.collection('sector_route_drawings').get();

        let totalOrphaned = 0;
        let totalCleaned = 0;

        for (const drawingDoc of drawingsSnapshot.docs) {
            const data = drawingDoc.data();
            const drawings = data.drawings || [];
            const schoolId = data.schoolId;
            const sectorName = data.sectorName;

            if (drawings.length === 0) continue;

            // Cargar vías del GeoJSON para esta escuela/sector
            const geojsonRoutes = await loadGeoJSONRoutesForSector(schoolId, sectorName);

            // Filtrar dibujos que no tienen vía correspondiente
            const validDrawings = [];
            const orphanedDrawings = [];

            for (const drawing of drawings) {
                const routeName = drawing.routeName;
                const key = `${schoolId}_${sectorName}_${routeName}`;

                // Verificar si existe en pending_routes aprobadas O en GeoJSON
                const existsInApproved = approvedRouteNames.has(key);
                const existsInGeoJSON = geojsonRoutes.includes(routeName);

                if (existsInApproved || existsInGeoJSON) {
                    validDrawings.push(drawing);
                } else {
                    orphanedDrawings.push(drawing);
                    totalOrphaned++;
                }
            }

            // Si hay dibujos huérfanos, actualizar el documento
            if (orphanedDrawings.length > 0) {
                console.log(`[CleanOrphaned] Sector "${sectorName}": eliminando ${orphanedDrawings.length} dibujos huérfanos:`,
                    orphanedDrawings.map(d => d.routeName));

                await db.collection('sector_route_drawings').doc(drawingDoc.id).update({
                    drawings: validDrawings,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastCleanup: firebase.firestore.FieldValue.serverTimestamp()
                });

                totalCleaned += orphanedDrawings.length;
            }
        }

        if (totalCleaned > 0) {
            showToast(`Limpiados ${totalCleaned} dibujos huérfanos`, 'success');
        } else {
            showToast('No se encontraron dibujos huérfanos', 'info');
        }

        console.log(`[CleanOrphaned] Limpieza completada: ${totalCleaned} dibujos eliminados`);

    } catch (error) {
        console.error('[CleanOrphaned] Error:', error);
        showToast('Error al limpiar dibujos huérfanos', 'error');
    }
}

/**
 * Carga los nombres de las vías del GeoJSON para un sector específico
 */
async function loadGeoJSONRoutesForSector(schoolId, sectorName) {
    try {
        // Mapeo de schoolId a archivo GeoJSON
        const geojsonPaths = {
            'valeria': 'Cartografia/Valeria/Valeria_Vias.geojson',
            'sanmartin': 'Cartografia/San Martin de ValdeIglesias/SM_Vias.geojson',
            'mora': 'Cartografia/Mora/Mora_Vias.geojson',
            'aranjuez': 'Cartografia/Aranjuez/Aranjuez_vias.geojson'
        };

        const path = geojsonPaths[schoolId];
        if (!path) return [];

        const response = await fetch(path + '?v=' + Date.now());
        if (!response.ok) return [];

        const geojson = await response.json();
        if (!geojson.features) return [];

        return geojson.features
            .filter(f => f.properties.sector === sectorName)
            .map(f => f.properties.nombre);

    } catch (error) {
        console.warn(`[CleanOrphaned] Error cargando GeoJSON para ${schoolId}:`, error);
        return [];
    }
}

// ============================================
// EDICIÓN DE VÍAS
// ============================================

let editMap = null;
let editMarker = null;
let editingRouteId = null;
let editingRouteData = null;

/**
 * Abre el modal de edición para una vía
 */
async function openEditModal(routeId) {
    try {
        // Obtener datos de la vía
        const doc = await db.collection('pending_routes').doc(routeId).get();
        if (!doc.exists) {
            showToast('Vía no encontrada', 'error');
            return;
        }

        editingRouteId = routeId;
        editingRouteData = doc.data();

        // Crear modal si no existe
        createEditModal();

        // Rellenar formulario
        document.getElementById('editNombre').value = editingRouteData.nombre || '';
        document.getElementById('editGrado').value = editingRouteData.grado1 || '';
        document.getElementById('editSector').value = editingRouteData.sector || '';
        document.getElementById('editExp').value = editingRouteData.exp1 || '';
        document.getElementById('editLong').value = editingRouteData.long1 || '';
        document.getElementById('editDescripcion').value = editingRouteData.descripcion || '';
        document.getElementById('editModalidad').value = editingRouteData.modalidad || 'Simple';

        // Mostrar modal
        document.getElementById('editModal').style.display = 'flex';

        // Inicializar mapa después de que el modal sea visible
        setTimeout(() => {
            initEditMap();
        }, 100);

    } catch (error) {
        console.error('Error abriendo editor:', error);
        showToast('Error al cargar la vía', 'error');
    }
}

/**
 * Crea el modal de edición (DOM)
 */
function createEditModal() {
    if (document.getElementById('editModal')) return;

    const modal = document.createElement('div');
    modal.id = 'editModal';
    modal.className = 'edit-modal';
    modal.innerHTML = `
        <div class="edit-modal-content">
            <div class="edit-modal-header">
                <h2>Editar Vía del Spotter</h2>
                <button class="edit-modal-close" onclick="closeEditModal()">&times;</button>
            </div>

            <div class="edit-modal-body">
                <div class="edit-form-section">
                    <h3>Información de la Vía</h3>
                    <div class="edit-form-grid">
                        <div class="edit-form-group">
                            <label>Nombre</label>
                            <input type="text" id="editNombre" placeholder="Nombre de la vía">
                        </div>
                        <div class="edit-form-group">
                            <label>Grado</label>
                            <input type="text" id="editGrado" placeholder="Ej: 6a+">
                        </div>
                        <div class="edit-form-group">
                            <label>Sector</label>
                            <input type="text" id="editSector" placeholder="Sector">
                        </div>
                        <div class="edit-form-group">
                            <label>Modalidad</label>
                            <select id="editModalidad">
                                <option value="Simple">Simple</option>
                                <option value="Largo">Largo</option>
                                <option value="Boulder">Boulder</option>
                            </select>
                        </div>
                        <div class="edit-form-group">
                            <label>Expresos</label>
                            <input type="number" id="editExp" placeholder="Nº expresos">
                        </div>
                        <div class="edit-form-group">
                            <label>Metros</label>
                            <input type="number" id="editLong" placeholder="Longitud (m)">
                        </div>
                        <div class="edit-form-group full-width">
                            <label>Descripción</label>
                            <textarea id="editDescripcion" rows="3" placeholder="Descripción de la vía..."></textarea>
                        </div>
                    </div>
                </div>

                <div class="edit-form-section">
                    <h3>Ubicación en el Mapa</h3>
                    <p class="edit-hint">Arrastra el marcador para mover la ubicación de la vía</p>
                    <div id="editMapContainer"></div>
                    <div class="edit-coords">
                        <span>Lat: <strong id="editLat">--</strong></span>
                        <span>Lng: <strong id="editLng">--</strong></span>
                    </div>
                </div>
            </div>

            <div class="edit-modal-footer">
                <button class="btn btn-secondary" onclick="closeEditModal()">Cancelar</button>
                <button class="btn btn-approve" onclick="saveRouteEdits()">Guardar Cambios</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Cerrar al hacer clic fuera
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeEditModal();
    });
}

/**
 * Inicializa el mapa de edición con MapLibre
 */
function initEditMap() {
    // Obtener coordenadas actuales
    let coords = getRouteCoordinates(editingRouteData);
    if (!coords) {
        coords = [-3.7, 40.4]; // Default: Madrid
    }

    // Si ya existe el mapa, solo actualizar
    if (editMap) {
        editMap.setCenter(coords);
        if (editMarker) {
            editMarker.setLngLat(coords);
        }
        updateCoordsDisplay(coords);
        return;
    }

    // Crear mapa
    editMap = new maplibregl.Map({
        container: 'editMapContainer',
        style: {
            version: 8,
            sources: {
                'osm': {
                    type: 'raster',
                    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                    tileSize: 256,
                    attribution: '© OpenStreetMap'
                }
            },
            layers: [{
                id: 'osm-layer',
                type: 'raster',
                source: 'osm'
            }]
        },
        center: coords,
        zoom: 16
    });

    // Crear marcador arrastrable
    editMarker = new maplibregl.Marker({
        color: '#10b981',
        draggable: true
    })
    .setLngLat(coords)
    .addTo(editMap);

    // Actualizar coordenadas al arrastrar
    editMarker.on('dragend', () => {
        const lngLat = editMarker.getLngLat();
        updateCoordsDisplay([lngLat.lng, lngLat.lat]);
    });

    updateCoordsDisplay(coords);
}

/**
 * Obtiene las coordenadas de una ruta en diferentes formatos
 */
function getRouteCoordinates(routeData) {
    if (routeData.coordinates && Array.isArray(routeData.coordinates)) {
        return routeData.coordinates;
    }
    if (routeData.geojsonFeature?.geometry) {
        const geom = routeData.geojsonFeature.geometry;
        if (geom.coordinates) {
            return geom.coordinates;
        }
        if (geom.lng !== undefined && geom.lat !== undefined) {
            return [geom.lng, geom.lat];
        }
    }
    return null;
}

/**
 * Actualiza la visualización de coordenadas
 */
function updateCoordsDisplay(coords) {
    document.getElementById('editLat').textContent = coords[1].toFixed(6);
    document.getElementById('editLng').textContent = coords[0].toFixed(6);
}

/**
 * Cierra el modal de edición
 */
function closeEditModal() {
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.style.display = 'none';
    }
    editingRouteId = null;
    editingRouteData = null;
}

/**
 * Guarda los cambios de la vía editada
 */
async function saveRouteEdits() {
    if (!editingRouteId) {
        showToast('Error: No hay vía seleccionada', 'error');
        return;
    }

    try {
        // Obtener nuevas coordenadas del marcador
        const lngLat = editMarker.getLngLat();
        const newCoords = [lngLat.lng, lngLat.lat];

        // Obtener valores del formulario
        const nombre = document.getElementById('editNombre').value.trim();
        const grado1 = document.getElementById('editGrado').value.trim();
        const sector = document.getElementById('editSector').value.trim();
        const exp1 = document.getElementById('editExp').value.trim();
        const long1 = document.getElementById('editLong').value.trim();
        const descripcion = document.getElementById('editDescripcion').value.trim();
        const modalidad = document.getElementById('editModalidad').value;

        // Validar campos requeridos
        if (!nombre) {
            showToast('El nombre es obligatorio', 'error');
            return;
        }

        // Preparar actualización
        const updateData = {
            nombre,
            grado1,
            sector,
            exp1,
            long1,
            descripcion,
            modalidad,
            coordinates: newCoords,
            editedAt: firebase.firestore.FieldValue.serverTimestamp(),
            editedBy: currentUser.email,
            // Actualizar también geojsonFeature
            'geojsonFeature.properties.nombre': nombre,
            'geojsonFeature.properties.grado1': grado1,
            'geojsonFeature.properties.sector': sector,
            'geojsonFeature.properties.exp1': exp1,
            'geojsonFeature.properties.long1': long1,
            'geojsonFeature.properties.descripcion': descripcion,
            'geojsonFeature.properties.modalidad': modalidad,
            'geojsonFeature.geometry.lng': newCoords[0],
            'geojsonFeature.geometry.lat': newCoords[1]
        };

        await db.collection('pending_routes').doc(editingRouteId).update(updateData);

        showToast('Vía actualizada correctamente', 'success');
        closeEditModal();
        await loadRoutes();

    } catch (error) {
        console.error('Error guardando cambios:', error);
        showToast('Error al guardar los cambios', 'error');
    }
}

console.log('[AdminRoutes] Módulo cargado');
