/**
 * Admin Panel - Unified Administration
 *
 * Panel unificado de administración para Climbmaps.
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
let allUsers = [];

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    setupNavigation();
});

function initFirebase() {
    db = firebase.firestore();
    auth = firebase.auth();

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await checkSuperAdminAccess(user);
        } else {
            showAccessDenied();
        }
    });
}

// ============================================
// VERIFICACIÓN DE ACCESO
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

    // Actualizar UI del usuario
    updateUserUI(user);

    // Cargar datos iniciales
    await Promise.all([
        loadStats(),
        loadSchoolsFilter(),
        loadRoutes(),
        loadUsers()
    ]);
}

function showAccessDenied() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('accessDenied').style.display = 'block';
    document.getElementById('sidebar').style.display = 'none';
}

function updateUserUI(user) {
    const email = user.email || 'Usuario';
    document.getElementById('userName').textContent = email;
    document.getElementById('userAvatar').textContent = email.charAt(0).toUpperCase();
}

// ============================================
// NAVEGACIÓN
// ============================================

function setupNavigation() {
    const navLinks = document.querySelectorAll('.sidebar-nav a');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            navigateTo(section);

            // Cerrar sidebar en móvil
            if (window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.remove('open');
            }
        });
    });

    // Manejar navegación por hash
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.replace('#', '') || 'dashboard';
        navigateTo(hash, false);
    });

    // Cargar sección inicial
    const initialSection = window.location.hash.replace('#', '') || 'dashboard';
    navigateTo(initialSection, false);
}

function navigateTo(section, updateHash = true) {
    // Actualizar nav activo
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.classList.toggle('active', link.dataset.section === section);
    });

    // Mostrar sección
    document.querySelectorAll('.section').forEach(sec => {
        sec.classList.toggle('active', sec.id === `section-${section}`);
    });

    // Actualizar hash
    if (updateHash) {
        window.location.hash = section;
    }

    // Recargar datos si es necesario
    if (section === 'routes') {
        loadRoutes();
    } else if (section === 'users') {
        loadUsers();
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// ============================================
// ESTADÍSTICAS
// ============================================

async function loadStats() {
    try {
        // Stats de rutas
        const routesSnapshot = await db.collection('pending_routes').get();
        let pending = 0, approved = 0, rejected = 0;

        routesSnapshot.forEach(doc => {
            const status = doc.data().status || 'pending';
            if (status === 'pending') pending++;
            else if (status === 'approved') approved++;
            else if (status === 'rejected') rejected++;
        });

        document.getElementById('statPending').textContent = pending;
        document.getElementById('statApproved').textContent = approved;
        document.getElementById('statRejected').textContent = rejected;

        // Stats de usuarios
        const usersSnapshot = await db.collection('admins').get();
        document.getElementById('statUsers').textContent = usersSnapshot.size;

    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

// ============================================
// GESTIÓN DE VÍAS
// ============================================

async function loadSchoolsFilter() {
    try {
        const snapshot = await db.collection('pending_routes').get();
        const schools = new Set();

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.schoolId) {
                schools.add(JSON.stringify({ id: data.schoolId, name: data.schoolName || data.schoolId }));
            }
        });

        const select = document.getElementById('filterSchool');
        // Limpiar opciones excepto la primera
        while (select.options.length > 1) {
            select.remove(1);
        }

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
    routesList.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Cargando vías...</p>
        </div>
    `;

    try {
        const filterSchool = document.getElementById('filterSchool').value;
        const filterStatus = document.getElementById('filterStatus').value;

        const snapshot = await db.collection('pending_routes').orderBy('createdAt', 'desc').get();
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
    } catch (error) {
        console.error('Error cargando rutas:', error);
        routesList.innerHTML = `
            <div class="empty-state">
                <p>Error al cargar las vías</p>
            </div>
        `;
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
        month: 'short',
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

    const badgeClass = {
        'pending': 'badge-pending',
        'approved': 'badge-approved',
        'rejected': 'badge-rejected'
    }[statusClass] || 'badge-pending';

    const showActions = route.status === 'pending';

    return `
        <div class="route-card ${statusClass}">
            <div class="route-header">
                <div>
                    <div class="route-name">${escapeHtml(route.nombre || 'Sin nombre')}</div>
                    <span class="badge ${badgeClass}">${statusText}</span>
                </div>
                <div class="route-grade">${escapeHtml(route.grado1 || '?')}</div>
            </div>

            <div class="route-details">
                <div>
                    <div class="route-detail-label">Escuela</div>
                    <div class="route-detail-value">${escapeHtml(route.schoolName || route.schoolId || '-')}</div>
                </div>
                <div>
                    <div class="route-detail-label">Sector</div>
                    <div class="route-detail-value">${escapeHtml(route.sector || '-')}</div>
                </div>
                <div>
                    <div class="route-detail-label">Modalidad</div>
                    <div class="route-detail-value">${escapeHtml(route.modalidad || 'Simple')}</div>
                </div>
                <div>
                    <div class="route-detail-label">Express</div>
                    <div class="route-detail-value">${route.exp1 || '-'}</div>
                </div>
                <div>
                    <div class="route-detail-label">Metros</div>
                    <div class="route-detail-value">${route.long1 ? route.long1 + 'm' : '-'}</div>
                </div>
                <div>
                    <div class="route-detail-label">Descripción</div>
                    <div class="route-detail-value">${escapeHtml(route.descripcion || '-')}</div>
                </div>
            </div>

            <div class="route-meta">
                <span>Enviada por: ${escapeHtml(route.createdByEmail || 'Desconocido')}</span>
                <span>${createdAt}</span>
            </div>

            <div class="route-actions">
                ${route.coordinates ? `
                <button class="btn btn-primary btn-sm" onclick="viewRouteOnMap('${route.id}', ${route.coordinates[0]}, ${route.coordinates[1]}, '${escapeHtml(route.schoolId || '')}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    Ver en mapa
                </button>
                ` : ''}
                ${showActions ? `
                <button class="btn btn-success btn-sm" onclick="approveRoute('${route.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Aprobar
                </button>
                <button class="btn btn-danger btn-sm" onclick="rejectRoute('${route.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Rechazar
                </button>
                ` : ''}
                <button class="btn btn-edit btn-sm" onclick="openEditModal('${route.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Editar
                </button>
                <button class="btn btn-delete btn-sm" onclick="deleteRoute('${route.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Eliminar
                </button>
            </div>
        </div>
    `;
}

async function approveRoute(routeId) {
    if (!confirm('¿Aprobar esta vía?')) return;

    try {
        await db.collection('pending_routes').doc(routeId).update({
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: currentUser.email
        });

        showToast('Vía aprobada correctamente', 'success');
        await loadRoutes();
        await loadStats();
    } catch (error) {
        console.error('Error aprobando ruta:', error);
        showToast('Error al aprobar la vía', 'error');
    }
}

async function rejectRoute(routeId) {
    if (!confirm('¿Rechazar y eliminar esta vía permanentemente?')) return;

    try {
        // Obtener datos de la vía antes de eliminarla (para eliminar el dibujo asociado)
        const routeDoc = await db.collection('pending_routes').doc(routeId).get();
        const routeData = routeDoc.exists ? routeDoc.data() : null;

        // Eliminar completamente el documento (no dejar residuos)
        await db.collection('pending_routes').doc(routeId).delete();

        // Eliminar el dibujo asociado en sector_route_drawings
        if (routeData && routeData.schoolId && routeData.sector && routeData.nombre) {
            await deleteRouteDrawingFromSector(routeData.schoolId, routeData.sector, routeData.nombre);
        }

        showToast('Vía rechazada y eliminada', 'info');
        await loadRoutes();
        await loadStats();
    } catch (error) {
        console.error('Error rechazando ruta:', error);
        showToast('Error al rechazar la vía', 'error');
    }
}

async function deleteRoute(routeId) {
    if (!confirm('¿Eliminar esta vía permanentemente?')) return;

    try {
        // Obtener datos de la vía antes de eliminarla (para eliminar el dibujo asociado)
        const routeDoc = await db.collection('pending_routes').doc(routeId).get();
        const routeData = routeDoc.exists ? routeDoc.data() : null;

        await db.collection('pending_routes').doc(routeId).delete();

        // Eliminar el dibujo asociado en sector_route_drawings
        if (routeData && routeData.schoolId && routeData.sector && routeData.nombre) {
            await deleteRouteDrawingFromSector(routeData.schoolId, routeData.sector, routeData.nombre);
        }

        showToast('Vía eliminada', 'info');
        await loadRoutes();
        await loadStats();
    } catch (error) {
        console.error('Error eliminando ruta:', error);
        showToast('Error al eliminar la vía', 'error');
    }
}

// ============================================
// EXPORTACIÓN
// ============================================

async function exportAllApproved() {
    try {
        const filterSchool = document.getElementById('filterSchool')?.value || 'all';

        const snapshot = await db.collection('pending_routes')
            .where('status', '==', 'approved')
            .get();

        if (snapshot.empty) {
            showToast('No hay vías aprobadas para exportar', 'info');
            return;
        }

        const routesBySchool = {};

        snapshot.forEach(doc => {
            const data = doc.data();

            if (filterSchool !== 'all' && data.schoolId !== filterSchool) return;

            if (!routesBySchool[data.schoolId]) {
                routesBySchool[data.schoolId] = {
                    name: data.schoolName || data.schoolId,
                    features: []
                };
            }

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

        const schoolIds = Object.keys(routesBySchool);

        if (schoolIds.length === 0) {
            showToast('No hay vías para exportar', 'info');
            return;
        }

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
// GESTIÓN DE USUARIOS
// ============================================

async function loadUsers() {
    const usersList = document.getElementById('usersList');

    try {
        const snapshot = await db.collection('admins').get();

        if (snapshot.empty) {
            usersList.innerHTML = `
                <tr>
                    <td colspan="4" class="empty-state">No hay usuarios autorizados</td>
                </tr>
            `;
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const uid = doc.id;

            const roleLabel = data.role === 'admin' ? 'Admin' : 'Subir Fotos';
            const badgeClass = data.role === 'admin' ? 'badge-admin' : 'badge-uploader';

            html += `
                <tr>
                    <td>${escapeHtml(data.email || 'N/A')}</td>
                    <td><span class="badge ${badgeClass}">${roleLabel}</span></td>
                    <td style="font-family: monospace; font-size: 12px; color: #999;">${uid.substring(0, 12)}...</td>
                    <td>
                        <button
                            class="btn btn-danger btn-sm"
                            onclick="removeUser('${uid}', '${escapeHtml(data.email || uid)}')"
                            ${uid === currentUser?.uid ? 'disabled title="No puedes eliminarte"' : ''}
                        >
                            Eliminar
                        </button>
                    </td>
                </tr>
            `;
        });

        usersList.innerHTML = html;

    } catch (error) {
        console.error('Error cargando usuarios:', error);
        usersList.innerHTML = `
            <tr>
                <td colspan="4" style="color: #ef4444;">Error al cargar usuarios</td>
            </tr>
        `;
    }
}

async function addUser() {
    const emailInput = document.getElementById('newUserEmail');
    const roleSelect = document.getElementById('newUserRole');

    const email = emailInput.value.trim();
    const role = roleSelect.value;

    if (!email || !email.includes('@')) {
        showToast('Por favor, ingresa un correo válido', 'error');
        return;
    }

    const uid = prompt(
        `Para agregar a ${email}, necesitas su UID de Firebase.\n\n` +
        `El usuario debe iniciar sesión al menos una vez en la app.\n` +
        `Copia su UID desde Firebase Auth:`
    );

    if (!uid || uid.trim() === '') {
        showToast('Operación cancelada', 'info');
        return;
    }

    try {
        await db.collection('admins').doc(uid.trim()).set({
            email: email,
            role: role,
            addedBy: currentUser.uid,
            addedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast(`Usuario ${email} agregado`, 'success');
        emailInput.value = '';
        await loadUsers();
        await loadStats();

    } catch (error) {
        console.error('Error agregando usuario:', error);
        showToast('Error al agregar usuario', 'error');
    }
}

async function removeUser(uid, email) {
    if (!confirm(`¿Eliminar a ${email}?`)) return;

    try {
        await db.collection('admins').doc(uid).delete();
        showToast(`Usuario ${email} eliminado`, 'success');
        await loadUsers();
        await loadStats();

    } catch (error) {
        console.error('Error eliminando usuario:', error);
        showToast('Error al eliminar usuario', 'error');
    }
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
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function logout() {
    if (confirm('¿Cerrar sesión?')) {
        auth.signOut().then(() => {
            window.location.href = 'index.html';
        });
    }
}

// ============================================
// VER RUTA EN MAPA
// ============================================

let mapModal = null;
let mapInstance = null;
let currentMapRouteId = null;

function viewRouteOnMap(routeId, lng, lat, schoolId) {
    currentMapRouteId = routeId;

    // Crear modal si no existe
    if (!mapModal) {
        createMapModal();
    }

    // Mostrar modal
    mapModal.classList.remove('hidden');

    // Forzar resize del mapa después de que el modal sea visible
    // Esto es necesario porque MapLibre necesita dimensiones calculadas del contenedor
    setTimeout(() => {
        if (mapInstance) {
            mapInstance.resize();
        }
        // Cargar datos de la ruta después del resize
        loadRouteForMap(routeId, lng, lat);
    }, 50);
}

function createMapModal() {
    mapModal = document.createElement('div');
    mapModal.id = 'map-modal';
    mapModal.className = 'map-modal-overlay';
    mapModal.innerHTML = `
        <div class="map-modal-container">
            <div class="map-modal-header">
                <h3 id="map-modal-title">Ubicación de la vía</h3>
                <button class="map-modal-close" onclick="closeMapModal()">&times;</button>
            </div>
            <div class="map-modal-body">
                <div id="admin-map-container"></div>
                <div id="map-route-info" class="map-route-info"></div>
            </div>
            <div class="map-modal-footer" id="map-modal-actions">
                <!-- Actions will be inserted here -->
            </div>
        </div>
    `;

    // Añadir estilos
    const styles = document.createElement('style');
    styles.textContent = `
        .map-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.7);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .map-modal-overlay.hidden {
            display: none;
        }
        .map-modal-container {
            background: white;
            border-radius: 16px;
            width: 100%;
            max-width: 900px;
            max-height: 90vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .map-modal-header {
            padding: 20px 24px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .map-modal-header h3 {
            font-size: 18px;
            font-weight: 600;
            color: #1a1a2e;
        }
        .map-modal-close {
            background: none;
            border: none;
            font-size: 28px;
            cursor: pointer;
            color: #666;
            line-height: 1;
            padding: 0;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
        }
        .map-modal-close:hover {
            background: #f0f0f0;
        }
        .map-modal-body {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        #admin-map-container {
            width: 100%;
            height: 400px;
            background: #e0e0e0;
        }
        .map-route-info {
            padding: 20px;
            background: #f8f9fa;
            border-top: 1px solid #e0e0e0;
        }
        .map-route-info h4 {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .map-route-info .route-grade-badge {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 14px;
        }
        .map-route-details-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 12px;
            margin-bottom: 12px;
        }
        .map-route-detail {
            font-size: 13px;
        }
        .map-route-detail-label {
            color: #666;
            font-size: 11px;
            text-transform: uppercase;
        }
        .map-route-detail-value {
            font-weight: 600;
            color: #333;
        }
        .map-modal-footer {
            padding: 16px 24px;
            border-top: 1px solid #e0e0e0;
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            flex-wrap: wrap;
        }
        @media (max-width: 600px) {
            .map-modal-container {
                max-height: 100vh;
                border-radius: 0;
            }
            #admin-map-container {
                height: 300px;
            }
            .map-modal-footer {
                flex-direction: column;
            }
            .map-modal-footer .btn {
                width: 100%;
                justify-content: center;
            }
        }
    `;
    document.head.appendChild(styles);
    document.body.appendChild(mapModal);

    // Inicializar mapa
    initAdminMap();
}

function initAdminMap() {
    // Cargar MapLibre si no está disponible
    if (typeof maplibregl === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js';
        script.onload = () => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css';
            document.head.appendChild(link);
            createMapInstance();
        };
        document.head.appendChild(script);
    } else {
        createMapInstance();
    }
}

function createMapInstance() {
    mapInstance = new maplibregl.Map({
        container: 'admin-map-container',
        style: {
            version: 8,
            glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
            sources: {
                'satellite': {
                    type: 'raster',
                    tiles: [
                        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                    ],
                    tileSize: 256,
                    attribution: '&copy; Esri'
                }
            },
            layers: [
                {
                    id: 'satellite-layer',
                    type: 'raster',
                    source: 'satellite',
                    minzoom: 0,
                    maxzoom: 22
                }
            ]
        },
        center: [-3.7, 40.4],
        zoom: 5
    });

    mapInstance.addControl(new maplibregl.NavigationControl(), 'top-right');
}

async function loadRouteForMap(routeId, lng, lat) {
    try {
        const doc = await db.collection('pending_routes').doc(routeId).get();

        if (!doc.exists) {
            showToast('Ruta no encontrada', 'error');
            closeMapModal();
            return;
        }

        const route = doc.data();
        route.id = doc.id;

        // Actualizar título
        document.getElementById('map-modal-title').textContent = route.nombre || 'Vía sin nombre';

        // Actualizar info de la ruta
        const infoContainer = document.getElementById('map-route-info');
        infoContainer.innerHTML = `
            <h4>
                ${escapeHtml(route.nombre || 'Sin nombre')}
                <span class="route-grade-badge">${escapeHtml(route.grado1 || '?')}</span>
            </h4>
            <div class="map-route-details-grid">
                <div class="map-route-detail">
                    <div class="map-route-detail-label">Escuela</div>
                    <div class="map-route-detail-value">${escapeHtml(route.schoolName || route.schoolId || '-')}</div>
                </div>
                <div class="map-route-detail">
                    <div class="map-route-detail-label">Sector</div>
                    <div class="map-route-detail-value">${escapeHtml(route.sector || '-')}</div>
                </div>
                <div class="map-route-detail">
                    <div class="map-route-detail-label">Modalidad</div>
                    <div class="map-route-detail-value">${escapeHtml(route.modalidad || 'Simple')}</div>
                </div>
                <div class="map-route-detail">
                    <div class="map-route-detail-label">Express</div>
                    <div class="map-route-detail-value">${route.exp1 || '-'}</div>
                </div>
                <div class="map-route-detail">
                    <div class="map-route-detail-label">Metros</div>
                    <div class="map-route-detail-value">${route.long1 ? route.long1 + 'm' : '-'}</div>
                </div>
                <div class="map-route-detail">
                    <div class="map-route-detail-label">Enviada por</div>
                    <div class="map-route-detail-value">${escapeHtml(route.createdByEmail || '-')}</div>
                </div>
            </div>
        `;

        // Actualizar acciones según estado
        const actionsContainer = document.getElementById('map-modal-actions');
        if (route.status === 'pending') {
            actionsContainer.innerHTML = `
                <button class="btn btn-secondary" onclick="closeMapModal()">Cerrar</button>
                <button class="btn btn-danger" onclick="rejectRouteFromMap('${route.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Rechazar
                </button>
                <button class="btn btn-success" onclick="approveRouteFromMap('${route.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Aprobar
                </button>
            `;
        } else {
            const statusText = route.status === 'approved' ? 'Aprobada' : 'Rechazada';
            actionsContainer.innerHTML = `
                <span style="color: #666;">Estado: <strong>${statusText}</strong></span>
                <button class="btn btn-secondary" onclick="closeMapModal()">Cerrar</button>
            `;
        }

        // Centrar mapa y añadir marcador
        if (mapInstance) {
            // Esperar a que el mapa esté listo
            if (mapInstance.loaded()) {
                addMarkerToMap(lng, lat, route);
            } else {
                mapInstance.on('load', () => addMarkerToMap(lng, lat, route));
            }
        }

    } catch (error) {
        console.error('Error cargando ruta:', error);
        showToast('Error al cargar la ruta', 'error');
    }
}

function addMarkerToMap(lng, lat, route) {
    // Remover marcadores anteriores
    const existingMarkers = document.querySelectorAll('.admin-map-marker');
    existingMarkers.forEach(m => m.remove());

    // Cargar vías oficiales de la escuela para contexto
    loadOfficialRoutesOnViewMap(route.schoolId);

    // Crear marcador de la vía pendiente (morado/violeta para distinguirla)
    const el = document.createElement('div');
    el.className = 'admin-map-marker';
    el.style.cssText = `
        width: 16px;
        height: 16px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        cursor: pointer;
        z-index: 10;
    `;

    new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(mapInstance);

    // Centrar mapa
    mapInstance.flyTo({
        center: [lng, lat],
        zoom: 17,
        duration: 1000
    });
}

/**
 * Carga las vías oficiales desde el archivo GeoJSON para el modal de visualización
 */
async function loadOfficialRoutesOnViewMap(schoolId) {
    if (!mapInstance || !schoolId) return;

    const geojsonPath = SCHOOL_GEOJSON_PATHS[schoolId];
    if (!geojsonPath) {
        console.log(`[ViewMap] No hay GeoJSON de vías oficiales para ${schoolId}`);
        return;
    }

    try {
        // Remover source y layers anteriores si existen
        if (mapInstance.getLayer('view-official-routes-labels')) mapInstance.removeLayer('view-official-routes-labels');
        if (mapInstance.getLayer('view-official-routes-layer')) mapInstance.removeLayer('view-official-routes-layer');
        if (mapInstance.getSource('view-official-routes')) mapInstance.removeSource('view-official-routes');

        // Cargar el GeoJSON
        const response = await fetch(geojsonPath);
        if (!response.ok) {
            console.warn(`[ViewMap] No se pudo cargar ${geojsonPath}`);
            return;
        }
        const geojson = await response.json();

        // Añadir source
        mapInstance.addSource('view-official-routes', {
            type: 'geojson',
            data: geojson
        });

        // Añadir capa de círculos para las vías oficiales (azul)
        mapInstance.addLayer({
            id: 'view-official-routes-layer',
            type: 'circle',
            source: 'view-official-routes',
            paint: {
                'circle-radius': 6,
                'circle-color': '#3b82f6',  // Azul para oficiales
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 1.5,
                'circle-opacity': 0.8
            }
        });

        // Añadir etiquetas con nombre y grado
        mapInstance.addLayer({
            id: 'view-official-routes-labels',
            type: 'symbol',
            source: 'view-official-routes',
            layout: {
                'text-field': ['concat', ['get', 'nombre'], ' (', ['get', 'grado1'], ')'],
                'text-font': ['Noto Sans Regular'],
                'text-size': 10,
                'text-offset': [0, 1.2],
                'text-anchor': 'top',
                'text-allow-overlap': false
            },
            paint: {
                'text-color': '#93c5fd',
                'text-halo-color': '#1e3a5f',
                'text-halo-width': 1
            }
        });

        // Añadir popup al hacer click en las vías oficiales
        mapInstance.on('click', 'view-official-routes-layer', (e) => {
            if (!e.features || e.features.length === 0) return;
            const props = e.features[0].properties;

            new maplibregl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(`
                    <div style="padding: 8px;">
                        <strong>${props.nombre || 'Sin nombre'}</strong><br>
                        <span style="color: #3b82f6; font-weight: 600;">${props.grado1 || '?'}</span><br>
                        <small>Sector: ${props.sector || '-'}</small><br>
                        <small style="color: #3b82f6;">✓ Vía Oficial</small>
                    </div>
                `)
                .addTo(mapInstance);
        });

        // Cursor pointer al hover
        mapInstance.on('mouseenter', 'view-official-routes-layer', () => {
            mapInstance.getCanvas().style.cursor = 'pointer';
        });
        mapInstance.on('mouseleave', 'view-official-routes-layer', () => {
            mapInstance.getCanvas().style.cursor = '';
        });

        console.log(`[ViewMap] Cargadas ${geojson.features?.length || 0} vías oficiales de ${schoolId}`);

    } catch (error) {
        console.error('[ViewMap] Error cargando vías oficiales:', error);
    }
}

function closeMapModal() {
    if (mapModal) {
        mapModal.classList.add('hidden');
    }
    currentMapRouteId = null;
}

async function approveRouteFromMap(routeId) {
    if (!confirm('¿Aprobar esta vía?')) return;

    try {
        await db.collection('pending_routes').doc(routeId).update({
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: currentUser.email
        });

        showToast('Vía aprobada correctamente', 'success');
        closeMapModal();
        await loadRoutes();
        await loadStats();
    } catch (error) {
        console.error('Error aprobando ruta:', error);
        showToast('Error al aprobar la vía', 'error');
    }
}

async function rejectRouteFromMap(routeId) {
    const reason = prompt('Motivo del rechazo (opcional):');

    try {
        await db.collection('pending_routes').doc(routeId).update({
            status: 'rejected',
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
            rejectedBy: currentUser.email,
            rejectionReason: reason || null
        });

        showToast('Vía rechazada', 'info');
        closeMapModal();
        await loadRoutes();
        await loadStats();
    } catch (error) {
        console.error('Error rechazando ruta:', error);
        showToast('Error al rechazar la vía', 'error');
    }
}

// ============================================
// EDICIÓN DE VÍAS (SPOTTER)
// ============================================

let editModal = null;
let editMap = null;
let editMarker = null;
let editingRouteId = null;
let editingRouteData = null;

/**
 * Abre el modal de edición para una vía
 */
async function openEditModal(routeId) {
    try {
        const doc = await db.collection('pending_routes').doc(routeId).get();
        if (!doc.exists) {
            showToast('Vía no encontrada', 'error');
            return;
        }

        editingRouteId = routeId;
        editingRouteData = doc.data();

        createEditModal();

        // Rellenar formulario
        document.getElementById('editNombre').value = editingRouteData.nombre || '';
        document.getElementById('editGrado').value = editingRouteData.grado1 || '';
        document.getElementById('editSector').value = editingRouteData.sector || '';
        document.getElementById('editExp').value = editingRouteData.exp1 || '';
        document.getElementById('editLong').value = editingRouteData.long1 || '';
        document.getElementById('editDescripcion').value = editingRouteData.descripcion || '';
        document.getElementById('editModalidad').value = editingRouteData.modalidad || 'Simple';

        editModal.classList.remove('hidden');

        setTimeout(() => initEditMap(), 100);

    } catch (error) {
        console.error('Error abriendo editor:', error);
        showToast('Error al cargar la vía', 'error');
    }
}

function createEditModal() {
    if (document.getElementById('editModal')) {
        editModal = document.getElementById('editModal');
        return;
    }

    editModal = document.createElement('div');
    editModal.id = 'editModal';
    editModal.className = 'edit-modal-overlay';
    editModal.innerHTML = `
        <div class="edit-modal-container">
            <div class="edit-modal-header">
                <h3>Editar Vía del Spotter</h3>
                <button class="edit-modal-close" onclick="closeEditModal()">&times;</button>
            </div>

            <div class="edit-modal-body">
                <div class="edit-form-section">
                    <h4>Información de la Vía</h4>
                    <div class="edit-form-grid">
                        <div class="edit-form-group">
                            <label>Nombre</label>
                            <input type="text" id="editNombre" class="form-input" placeholder="Nombre de la vía">
                        </div>
                        <div class="edit-form-group">
                            <label>Grado</label>
                            <input type="text" id="editGrado" class="form-input" placeholder="Ej: 6a+">
                        </div>
                        <div class="edit-form-group">
                            <label>Sector</label>
                            <input type="text" id="editSector" class="form-input" placeholder="Sector">
                        </div>
                        <div class="edit-form-group">
                            <label>Modalidad</label>
                            <select id="editModalidad" class="form-select">
                                <option value="Simple">Simple</option>
                                <option value="Largo">Largo</option>
                                <option value="Boulder">Boulder</option>
                            </select>
                        </div>
                        <div class="edit-form-group">
                            <label>Expresos</label>
                            <input type="number" id="editExp" class="form-input" placeholder="Nº expresos">
                        </div>
                        <div class="edit-form-group">
                            <label>Metros</label>
                            <input type="number" id="editLong" class="form-input" placeholder="Longitud (m)">
                        </div>
                        <div class="edit-form-group full-width">
                            <label>Descripción</label>
                            <textarea id="editDescripcion" class="form-input" rows="3" placeholder="Descripción de la vía..."></textarea>
                        </div>
                    </div>
                </div>

                <div class="edit-form-section">
                    <h4>Ubicación en el Mapa</h4>
                    <p class="edit-hint">Arrastra el marcador verde grande para mover la ubicación. Las otras vías de la escuela se muestran para referencia.</p>
                    <div id="editMapContainer"></div>
                    <div class="edit-map-legend">
                        <span class="legend-item"><span class="legend-dot" style="background: #3b82f6;"></span> Oficiales</span>
                        <span class="legend-item"><span class="legend-dot" style="background: #10b981;"></span> Aprobadas</span>
                        <span class="legend-item"><span class="legend-dot" style="background: #f59e0b;"></span> Pendientes</span>
                    </div>
                    <div class="edit-coords-inputs">
                        <div class="coord-input-group">
                            <label>Latitud</label>
                            <input type="number" id="editLatInput" step="0.000001" placeholder="39.794890" onchange="updateMarkerFromInputs()">
                        </div>
                        <div class="coord-input-group">
                            <label>Longitud</label>
                            <input type="number" id="editLngInput" step="0.000001" placeholder="-2.148689" onchange="updateMarkerFromInputs()">
                        </div>
                        <button type="button" class="btn btn-secondary btn-sm" onclick="updateMarkerFromInputs()">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Ir
                        </button>
                    </div>
                </div>
            </div>

            <div class="edit-modal-footer">
                <button class="btn btn-secondary" onclick="closeEditModal()">Cancelar</button>
                <button class="btn btn-success" onclick="saveRouteEdits()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Guardar Cambios
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(editModal);

    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
    });
}

function initEditMap() {
    let coords = getRouteCoordinates(editingRouteData);
    if (!coords) coords = [-3.7, 40.4];

    if (editMap) {
        editMap.setCenter(coords);
        editMap.setZoom(17);
        if (editMarker) editMarker.setLngLat(coords);
        updateEditCoordsDisplay(coords);
        // Recargar vías del contexto
        loadOfficialRoutesOnEditMap();
        loadOtherRoutesOnEditMap();
        return;
    }

    editMap = new maplibregl.Map({
        container: 'editMapContainer',
        style: {
            version: 8,
            glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
            sources: {
                'satellite': {
                    type: 'raster',
                    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                    tileSize: 256
                }
            },
            layers: [{ id: 'satellite-layer', type: 'raster', source: 'satellite' }]
        },
        center: coords,
        zoom: 17
    });

    editMap.on('load', () => {
        // Cargar vías oficiales y otras vías para contexto
        loadOfficialRoutesOnEditMap();
        loadOtherRoutesOnEditMap();
    });

    editMarker = new maplibregl.Marker({ color: '#10b981', draggable: true })
        .setLngLat(coords)
        .addTo(editMap);

    editMarker.on('dragend', () => {
        const lngLat = editMarker.getLngLat();
        updateEditCoordsDisplay([lngLat.lng, lngLat.lat]);
    });

    updateEditCoordsDisplay(coords);
}

// Configuración de rutas de GeoJSON por escuela (mismo que maplibre-config.js)
const SCHOOL_GEOJSON_PATHS = {
    valeria: 'Cartografia/Valeria/Valeria_Vias.geojson',
    sanmartin: 'Cartografia/San Martin de ValdeIglesias/SM_Vias.geojson',
    mora: 'Cartografia/Mora/Mora_Vias.geojson'
};

/**
 * Carga las vías oficiales desde el archivo GeoJSON de la escuela
 */
async function loadOfficialRoutesOnEditMap() {
    if (!editMap || !editingRouteData) return;

    const schoolId = editingRouteData.schoolId;
    if (!schoolId) return;

    const geojsonPath = SCHOOL_GEOJSON_PATHS[schoolId];
    if (!geojsonPath) {
        console.log(`[EditMap] No hay GeoJSON de vías oficiales para ${schoolId}`);
        return;
    }

    try {
        // Remover source y layers anteriores si existen
        if (editMap.getLayer('official-routes-labels')) editMap.removeLayer('official-routes-labels');
        if (editMap.getLayer('official-routes-layer')) editMap.removeLayer('official-routes-layer');
        if (editMap.getSource('official-routes')) editMap.removeSource('official-routes');

        // Cargar el GeoJSON
        const response = await fetch(geojsonPath);
        if (!response.ok) {
            console.warn(`[EditMap] No se pudo cargar ${geojsonPath}`);
            return;
        }
        const geojson = await response.json();

        // Añadir source
        editMap.addSource('official-routes', {
            type: 'geojson',
            data: geojson
        });

        // Añadir capa de círculos para las vías oficiales (azul)
        editMap.addLayer({
            id: 'official-routes-layer',
            type: 'circle',
            source: 'official-routes',
            paint: {
                'circle-radius': 6,
                'circle-color': '#3b82f6',  // Azul para oficiales
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 1.5,
                'circle-opacity': 0.7
            }
        });

        // Añadir etiquetas con nombre y grado
        editMap.addLayer({
            id: 'official-routes-labels',
            type: 'symbol',
            source: 'official-routes',
            layout: {
                'text-field': ['concat', ['get', 'nombre'], ' (', ['get', 'grado1'], ')'],
                'text-font': ['Noto Sans Regular'],
                'text-size': 10,
                'text-offset': [0, 1.2],
                'text-anchor': 'top',
                'text-allow-overlap': false
            },
            paint: {
                'text-color': '#93c5fd',
                'text-halo-color': '#1e3a5f',
                'text-halo-width': 1
            }
        });

        // Añadir popup al hacer click en las vías oficiales
        editMap.on('click', 'official-routes-layer', (e) => {
            if (!e.features || e.features.length === 0) return;
            const props = e.features[0].properties;

            new maplibregl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(`
                    <div style="padding: 8px;">
                        <strong>${props.nombre || 'Sin nombre'}</strong><br>
                        <span style="color: #3b82f6; font-weight: 600;">${props.grado1 || '?'}</span><br>
                        <small>Sector: ${props.sector || '-'}</small><br>
                        <small style="color: #3b82f6;">Vía Oficial</small>
                    </div>
                `)
                .addTo(editMap);
        });

        // Cursor pointer al hover
        editMap.on('mouseenter', 'official-routes-layer', () => {
            editMap.getCanvas().style.cursor = 'pointer';
        });
        editMap.on('mouseleave', 'official-routes-layer', () => {
            editMap.getCanvas().style.cursor = '';
        });

        console.log(`[EditMap] Cargadas ${geojson.features?.length || 0} vías oficiales de ${schoolId}`);

    } catch (error) {
        console.error('[EditMap] Error cargando vías oficiales:', error);
    }
}

/**
 * Carga las otras vías de la misma escuela en el mapa de edición para contexto
 */
async function loadOtherRoutesOnEditMap() {
    if (!editMap || !editingRouteData) return;

    const schoolId = editingRouteData.schoolId;
    if (!schoolId) return;

    try {
        // Obtener todas las vías de la escuela (pendientes y aprobadas)
        const snapshot = await db.collection('pending_routes')
            .where('schoolId', '==', schoolId)
            .get();

        const features = [];
        snapshot.forEach(doc => {
            // Excluir la vía que estamos editando
            if (doc.id === editingRouteId) return;

            const data = doc.data();

            // Solo mostrar vías pendientes y aprobadas (no rechazadas)
            if (data.status === 'rejected') return;

            const coords = getRouteCoordinates(data);
            if (!coords) return;

            features.push({
                type: 'Feature',
                properties: {
                    id: doc.id,
                    nombre: data.nombre || 'Sin nombre',
                    grado: data.grado1 || '?',
                    status: data.status || 'pending',
                    sector: data.sector || ''
                },
                geometry: {
                    type: 'Point',
                    coordinates: coords
                }
            });
        });

        const geojson = {
            type: 'FeatureCollection',
            features: features
        };

        // Remover source y layers anteriores si existen
        if (editMap.getLayer('other-routes-labels')) editMap.removeLayer('other-routes-labels');
        if (editMap.getLayer('other-routes-layer')) editMap.removeLayer('other-routes-layer');
        if (editMap.getSource('other-routes')) editMap.removeSource('other-routes');

        // Añadir source
        editMap.addSource('other-routes', {
            type: 'geojson',
            data: geojson
        });

        // Añadir capa de círculos para las otras vías
        editMap.addLayer({
            id: 'other-routes-layer',
            type: 'circle',
            source: 'other-routes',
            paint: {
                'circle-radius': 8,
                'circle-color': [
                    'case',
                    ['==', ['get', 'status'], 'approved'], '#10b981',  // Verde para aprobadas
                    ['==', ['get', 'status'], 'rejected'], '#ef4444',  // Rojo para rechazadas
                    '#f59e0b'  // Amarillo para pendientes
                ],
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
                'circle-opacity': 0.8
            }
        });

        // Añadir etiquetas con nombre y grado
        editMap.addLayer({
            id: 'other-routes-labels',
            type: 'symbol',
            source: 'other-routes',
            layout: {
                'text-field': ['concat', ['get', 'nombre'], ' (', ['get', 'grado'], ')'],
                'text-font': ['Noto Sans Regular'],
                'text-size': 11,
                'text-offset': [0, 1.5],
                'text-anchor': 'top',
                'text-allow-overlap': false
            },
            paint: {
                'text-color': '#ffffff',
                'text-halo-color': '#000000',
                'text-halo-width': 1.5
            }
        });

        // Añadir popup al hacer click en las vías
        editMap.on('click', 'other-routes-layer', (e) => {
            if (!e.features || e.features.length === 0) return;
            const props = e.features[0].properties;
            const statusText = {
                'approved': 'Aprobada',
                'rejected': 'Rechazada',
                'pending': 'Pendiente'
            }[props.status] || 'Pendiente';

            new maplibregl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(`
                    <div style="padding: 8px;">
                        <strong>${props.nombre}</strong><br>
                        <span style="color: #667eea; font-weight: 600;">${props.grado}</span><br>
                        <small>Sector: ${props.sector || '-'}</small><br>
                        <small style="color: ${props.status === 'approved' ? '#10b981' : props.status === 'rejected' ? '#ef4444' : '#f59e0b'};">
                            ${statusText}
                        </small>
                    </div>
                `)
                .addTo(editMap);
        });

        // Cursor pointer al hover
        editMap.on('mouseenter', 'other-routes-layer', () => {
            editMap.getCanvas().style.cursor = 'pointer';
        });
        editMap.on('mouseleave', 'other-routes-layer', () => {
            editMap.getCanvas().style.cursor = '';
        });

        console.log(`[EditMap] Cargadas ${features.length} vías de contexto para ${schoolId}`);

    } catch (error) {
        console.error('[EditMap] Error cargando vías de contexto:', error);
    }
}

function getRouteCoordinates(routeData) {
    if (routeData.coordinates && Array.isArray(routeData.coordinates)) {
        return routeData.coordinates;
    }
    if (routeData.geojsonFeature?.geometry) {
        const geom = routeData.geojsonFeature.geometry;
        if (geom.coordinates) return geom.coordinates;
        if (geom.lng !== undefined && geom.lat !== undefined) return [geom.lng, geom.lat];
    }
    return null;
}

function updateEditCoordsDisplay(coords) {
    document.getElementById('editLatInput').value = coords[1].toFixed(6);
    document.getElementById('editLngInput').value = coords[0].toFixed(6);
}

/**
 * Actualiza el marcador desde los inputs de coordenadas manuales
 */
function updateMarkerFromInputs() {
    const lat = parseFloat(document.getElementById('editLatInput').value);
    const lng = parseFloat(document.getElementById('editLngInput').value);

    if (isNaN(lat) || isNaN(lng)) {
        showToast('Coordenadas inválidas', 'error');
        return;
    }

    // Validar rangos
    if (lat < -90 || lat > 90) {
        showToast('Latitud debe estar entre -90 y 90', 'error');
        return;
    }
    if (lng < -180 || lng > 180) {
        showToast('Longitud debe estar entre -180 y 180', 'error');
        return;
    }

    const coords = [lng, lat];

    if (editMarker) {
        editMarker.setLngLat(coords);
    }
    if (editMap) {
        editMap.flyTo({ center: coords, zoom: 17 });
    }
}

function closeEditModal() {
    if (editModal) editModal.classList.add('hidden');
    editingRouteId = null;
    editingRouteData = null;
}

async function saveRouteEdits() {
    if (!editingRouteId) {
        showToast('Error: No hay vía seleccionada', 'error');
        return;
    }

    try {
        const lngLat = editMarker.getLngLat();
        const newCoords = [lngLat.lng, lngLat.lat];

        const nombre = document.getElementById('editNombre').value.trim();
        const grado1 = document.getElementById('editGrado').value.trim();
        const sector = document.getElementById('editSector').value.trim();
        const exp1 = document.getElementById('editExp').value.trim();
        const long1 = document.getElementById('editLong').value.trim();
        const descripcion = document.getElementById('editDescripcion').value.trim();
        const modalidad = document.getElementById('editModalidad').value;

        if (!nombre) {
            showToast('El nombre es obligatorio', 'error');
            return;
        }

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

// ============================================
// LIMPIEZA DE DIBUJOS HUÉRFANOS
// ============================================

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
                console.log(`[Admin] Dibujo de "${routeName}" eliminado de sector_route_drawings`);
            }
        }
    } catch (error) {
        console.error('[Admin] Error eliminando dibujo de vía:', error);
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

/**
 * Busca y elimina dibujos de vías que ya no existen
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

        approvedSnapshot.forEach(doc => {
            const data = doc.data();
            const key = `${data.schoolId}_${data.sector}_${data.nombre}`;
            approvedRouteNames.add(key);
        });

        // 2. Obtener todos los documentos de dibujos
        const drawingsSnapshot = await db.collection('sector_route_drawings').get();

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
                }
            }

            // Si hay dibujos huérfanos, actualizar el documento
            if (orphanedDrawings.length > 0) {
                console.log(`[CleanOrphaned] Sector "${sectorName}": eliminando ${orphanedDrawings.length} dibujos huérfanos:`,
                    orphanedDrawings.map(d => d.routeName));

                await db.collection('sector_route_drawings').doc(drawingDoc.id).update({
                    drawings: validDrawings,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                totalCleaned += orphanedDrawings.length;
            }
        }

        if (totalCleaned > 0) {
            showToast(`Limpiados ${totalCleaned} dibujos huérfanos`, 'success');
        } else {
            showToast('No se encontraron dibujos huérfanos', 'info');
        }

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
        const geojsonPaths = {
            'valeria': 'Cartografia/Valeria/Valeria_Vias.geojson',
            'sanmartin': 'Cartografia/San Martin de ValdeIglesias/SM_Vias.geojson',
            'mora': 'Cartografia/Mora/Mora_Vias.geojson'
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

console.log('[Admin] Panel de administración cargado');
