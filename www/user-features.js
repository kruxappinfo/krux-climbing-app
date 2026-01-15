// User Features Module
// Handles favorites and climbing log functionality

// Toast notification system with smooth animations
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
        success: '✓',
        error: '×',
        info: 'ℹ'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
    `;

    // Start hidden for smooth entry
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    container.appendChild(toast);

    // Smooth entry animation
    requestAnimationFrame(() => {
        toast.style.transition = 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    });

    // Smooth exit and remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 2700);
}

// Custom confirmation dialog
function showConfirm(message, title = 'Confirmar') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');
        const cancelBtn = document.getElementById('confirm-cancel');
        const okBtn = document.getElementById('confirm-ok');

        if (!modal || !titleEl || !messageEl || !cancelBtn || !okBtn) {
            console.error('Confirm modal elements not found');
            resolve(false);
            return;
        }

        // Limpiar cualquier estado previo
        modal.classList.add('hidden');

        // Clonar botones para eliminar listeners anteriores
        const newCancelBtn = cancelBtn.cloneNode(true);
        const newOkBtn = okBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);

        titleEl.textContent = title;
        messageEl.textContent = message;

        let resolved = false;

        function cleanup() {
            if (resolved) return;
            resolved = true;
            modal.classList.add('hidden');
        }

        function handleCancel() {
            cleanup();
            resolve(false);
        }

        function handleOk() {
            cleanup();
            resolve(true);
        }

        newCancelBtn.addEventListener('click', handleCancel, { once: true });
        newOkBtn.addEventListener('click', handleOk, { once: true });

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal && !resolved) {
                handleCancel();
            }
        }, { once: true });

        // Mostrar modal después de configurar todo
        modal.classList.remove('hidden');
    });
}



// Global favorites cache
let userFavorites = new Map(); // Map of "type:id" -> timestamp

// Global projects cache
let userProjects = new Map(); // Map of "route_id" -> {name, grade, addedAt, notes}

// Load user favorites into cache
async function loadUserFavorites() {
    if (!currentUser) {
        userFavorites.clear();
        return;
    }

    try {
        const favoritesRef = db.collection('users').doc(currentUser.uid).collection('favorites');
        const snapshot = await favoritesRef.get();

        userFavorites.clear();
        snapshot.forEach(doc => {
            const data = doc.data();
            const key = `${data.type}:${data.id}`;
            userFavorites.set(key, data.addedAt);
        });

    } catch (error) {
        console.error('Error loading favorites:', error);
    }
}

// Toggle favorite status for routes, schools, or sectors
async function toggleFavorite(type, id, name = '') {
    if (!currentUser) {
        showToast('Debes iniciar sesión para guardar favoritos', 'info');
        return false;
    }

    const key = `${type}:${id}`;
    const isFav = userFavorites.has(key);

    try {
        const favoritesRef = db.collection('users').doc(currentUser.uid).collection('favorites');
        const docId = `${type}_${id.replace(/[^a-zA-Z0-9]/g, '_')}`;

        if (isFav) {
            // Remove from favorites
            await favoritesRef.doc(docId).delete();
            userFavorites.delete(key);
            showToast('Eliminado de favoritos', 'info');
            return false;
        } else {
            // Add to favorites
            await favoritesRef.doc(docId).set({
                type: type,
                id: id,
                name: name,
                addedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            userFavorites.set(key, new Date());
            showToast('Añadido a favoritos ❤️', 'success');
            return true;
        }
    } catch (error) {
        console.error('Error toggling favorite:', error);
        showToast('Error al guardar favorito', 'error');
        return false;
    }
}

// Check if item is favorited
function isFavorite(type, id) {
    const key = `${type}:${id}`;
    return userFavorites.has(key);
}

// Get all favorites as organized object
function getFavorites() {
    const favorites = {
        routes: [],
        schools: [],
        sectors: []
    };

    userFavorites.forEach((timestamp, key) => {
        const [type, id] = key.split(':');
        if (favorites[type + 's']) {
            favorites[type + 's'].push({ id, timestamp });
        }
    });

    return favorites;
}

// Get user's favorites (legacy function - redirects to new system)
async function getUserFavorites() {
    return getFavorites();
}

// Log an ascent
async function logAscent(ascentData) {
    if (!currentUser) {
        showToast('Debes iniciar sesión para registrar ascensiones', 'info');
        return false;
    }

    try {
        const data = {
            userId: currentUser.uid,
            userName: currentUser.displayName,
            schoolId: ascentData.schoolId,
            schoolName: ascentData.schoolName,
            routeName: ascentData.routeName,
            grade: ascentData.grade,
            sector: ascentData.sector || '',
            style: ascentData.style, // 'flash', 'redpoint', 'onsight', 'toprope', 'lead'
            date: new Date(ascentData.date), // Use user selected date
            tries: ascentData.tries || 1,
            rating: ascentData.rating || 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            notes: ascentData.notes || ''
        };

        // Add to ascents collection
        const docRef = await db.collection('ascents').add(data);

        // Update user stats
        await db.collection('users').doc(currentUser.uid).update({
            'stats.totalAscents': firebase.firestore.FieldValue.increment(1)
        });
        return true;
    } catch (error) {
        console.error('Error logging ascent:', error);
        showToast('Error al registrar ascensión: ' + error.message, 'error');
        return false;
    }
}

// ==================== PROJECTS SYSTEM ====================
// Load user projects into cache
async function loadUserProjects() {
    if (!currentUser) {
        userProjects.clear();
        return;
    }

    try {
        const projectsRef = db.collection('users').doc(currentUser.uid).collection('projects');
        const snapshot = await projectsRef.get();

        userProjects.clear();
        snapshot.forEach(doc => {
            const data = doc.data();
            const key = `route_${data.id}`;
            userProjects.set(key, {
                id: data.id,
                name: data.name,
                grade: data.grade,
                addedAt: data.addedAt,
                notes: data.notes || ''
            });
        });

    } catch (error) {
        console.error('Error loading projects:', error);
    }
}

// Toggle project status for routes
async function toggleProject(id, name, grade = '') {
    if (!currentUser) {
        showToast('Debes iniciar sesión para guardar proyectos', 'info');
        return false;
    }

    const key = `route_${id}`;
    const isProj = userProjects.has(key);

    try {
        const projectsRef = db.collection('users').doc(currentUser.uid).collection('projects');
        const docId = `route_${id.replace(/[^a-zA-Z0-9]/g, '_')}`;

        if (isProj) {
            // Remove from projects
            await projectsRef.doc(docId).delete();
            userProjects.delete(key);
            showToast('Eliminado de proyectos', 'info');
            return false;
        } else {
            // Add to projects
            await projectsRef.doc(docId).set({
                type: 'route',
                id: id,
                name: name,
                grade: grade,
                addedAt: firebase.firestore.FieldValue.serverTimestamp(),
                notes: ''
            });
            userProjects.set(key, { id, name, grade, addedAt: new Date(), notes: '' });
            showToast('Añadido a proyectos 📁', 'success');
            return true;
        }
    } catch (error) {
        console.error('Error toggling project:', error);
        showToast('Error al guardar proyecto', 'error');
        return false;
    }
}

// Check if route is a project
function isProject(id) {
    const key = `route_${id}`;
    return userProjects.has(key);
}

// Get all projects as array
function getProjects() {
    const projects = [];
    userProjects.forEach((data, key) => {
        projects.push(data);
    });
    return projects;
}

// Get user's ascents
async function getUserAscents(limit = 50) {
    if (!currentUser) return [];
    return await getUserAscentsByUserId(currentUser.uid, limit);
}

// Helper function to get ascents for any user (for public profiles)
async function getUserAscentsByUserId(userId, limit = 100) {
    if (!userId) return [];

    try {
        const ascentsRef = db.collection('ascents')
            .where('userId', '==', userId)
            .limit(limit);

        const snapshot = await ascentsRef.get();

        if (snapshot.empty) {
            return [];
        }

        const ascents = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                // Handle both Firestore Timestamp and regular Date strings/objects
                date: data.date && data.date.toDate ? data.date.toDate() : new Date(data.date)
            };
        });

        return ascents;
    } catch (error) {
        console.error('Error getting ascents:', error);
        if (error.code === 'permission-denied') {
            console.warn('Error de permisos al leer datos de ascents');
        }
        return [];
    }
}

// Delete an ascent
async function deleteAscent(ascentId) {
    if (!currentUser) return false;

    try {
        await db.collection('ascents').doc(ascentId).delete();

        // Update user stats
        await db.collection('users').doc(currentUser.uid).update({
            'stats.totalAscents': firebase.firestore.FieldValue.increment(-1)
        });

        showToast('Ascenso eliminado correctamente', 'success');
        return true;
    } catch (error) {
        console.error('Error deleting ascent:', error);
        showToast('Error al eliminar el ascenso', 'error');
        return false;
    }
}

// Update an ascent
async function updateAscent(ascentId, ascentData) {
    if (!currentUser) return false;

    try {
        const data = {
            schoolId: ascentData.schoolId,
            schoolName: ascentData.schoolName,
            routeName: ascentData.routeName,
            grade: ascentData.grade,
            sector: ascentData.sector || '',
            style: ascentData.style,
            date: new Date(ascentData.date),
            notes: ascentData.notes || '',
            tries: ascentData.tries,
            rating: ascentData.rating,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('ascents').doc(ascentId).update(data);
        return true;
    } catch (error) {
        console.error('Error updating ascent:', error);
        showToast('Error al actualizar el ascenso', 'error');
        return false;
    }
}


// Get user stats
async function getUserStats() {
    if (!currentUser) return null;

    try {
        const userRef = db.collection('users').doc(currentUser.uid);
        const doc = await userRef.get();
        return doc.data().stats || {
            totalAscents: 0,
            favoriteSchools: 0
        };
    } catch (error) {
        console.error('Error getting user stats:', error);
        return null;
    }
}
// Open ascent modal
function openAscentModal(schoolId, schoolName, routeName, grade, sector) {
    if (!currentUser) {
        showToast('Inicia sesión para registrar tus ascensiones', 'info');
        return;
    }

    const modal = document.getElementById('ascent-modal');

    // Set hidden fields
    document.getElementById('ascent-school-id').value = schoolId;
    document.getElementById('ascent-school-name').value = schoolName;
    document.getElementById('ascent-route-name').value = routeName;
    document.getElementById('ascent-grade').value = grade;
    document.getElementById('ascent-sector').value = sector || '';

    // Set display fields
    document.getElementById('display-route-name').textContent = `${routeName} (${grade})`;
    document.getElementById('ascent-date').valueAsDate = new Date();

    modal.classList.remove('hidden');
}

// Close ascent modal
function closeAscentModal() {
    const modal = document.getElementById('ascent-modal');
    const form = document.getElementById('ascent-form');
    const modalTitle = document.getElementById('ascent-modal-title');

    modal.classList.add('hidden');
    form.reset();

    // Reset edit mode
    delete form.dataset.ascentId;
    delete form.dataset.editMode;

    // Reset title and button text
    modalTitle.textContent = 'Registrar Ascenso';
    const submitBtn = form.querySelector('.submit-btn');
    submitBtn.textContent = 'Registrar';
}

// Open ascent modal for editing
function openEditAscentModal(ascent) {
    if (!currentUser) return;

    const modal = document.getElementById('ascent-modal');
    const form = document.getElementById('ascent-form');

    // Close My Routes modal if it's open
    const myRoutesModal = document.getElementById('my-routes-modal');
    if (myRoutesModal) {
        myRoutesModal.classList.add('hidden');
    }

    // Set hidden fields
    document.getElementById('ascent-school-id').value = ascent.schoolId;
    document.getElementById('ascent-school-name').value = ascent.schoolName;
    document.getElementById('ascent-route-name').value = ascent.routeName;
    document.getElementById('ascent-grade').value = ascent.grade;

    // Set display fields
    document.getElementById('display-route-name').textContent = `${ascent.routeName} (${ascent.grade})`;

    // Format date to YYYY-MM-DD for input
    const dateStr = ascent.date instanceof Date
        ? ascent.date.toISOString().split('T')[0]
        : new Date(ascent.date).toISOString().split('T')[0];

    document.getElementById('ascent-date').value = dateStr;
    document.getElementById('ascent-sector').value = ascent.sector || '';
    document.getElementById('ascent-style').value = ascent.style;
    document.getElementById('ascent-tries').value = ascent.tries || 1;
    document.getElementById('ascent-notes').value = ascent.notes || '';

    // Set rating
    if (ascent.rating) {
        const ratingInput = document.querySelector(`input[name="rating"][value="${ascent.rating}"]`);
        if (ratingInput) ratingInput.checked = true;
    }

    // Store ascent ID in form for update
    form.dataset.ascentId = ascent.id;
    form.dataset.editMode = 'true';

    // Change title and button text
    const modalTitle = document.getElementById('ascent-modal-title');
    modalTitle.textContent = 'Actualizar Ascenso';

    const submitBtn = form.querySelector('.submit-btn');
    submitBtn.textContent = 'Actualizar';

    modal.classList.remove('hidden');
}


// ==================== TAB NAVIGATION ====================
// Initialize tab navigation
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });
}

// Switch between tabs
function switchTab(tabName) {
    // Update button states
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update content visibility
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.dataset.tabContent === tabName);
    });

    // Load data for the selected tab
    if (tabName === 'routes') {
        // Routes are already loaded when modal opens
    } else if (tabName === 'favorites') {
        renderFavoritesList();
    } else if (tabName === 'projects') {
        renderProjectsList();
    } else if (tabName === 'following') {
        loadFollowing();
    } else if (tabName === 'followers') {
        loadFollowers();
    } else if (tabName === 'find-users') {
        // Focus search input
        setTimeout(() => document.getElementById('search-user-input').focus(), 100);
    }
}

// ==================== NETWORK SYSTEM ====================

async function showNetwork() {
    if (!currentUser) return;

    const modal = document.getElementById('network-modal');
    const userDropdown = document.getElementById('user-dropdown');

    // Close dropdown
    if (userDropdown) userDropdown.classList.add('hidden');

    modal.classList.remove('hidden');

    // Default to following tab
    switchTab('following');

    // Initialize search listener if not already
    const searchInput = document.getElementById('search-user-input');
    if (searchInput && !searchInput.dataset.listening) {
        searchInput.addEventListener('input', debounce((e) => searchUsers(e.target.value), 500));
        searchInput.dataset.listening = 'true';
    }
}

async function loadFollowing() {
    const container = document.getElementById('following-list');
    container.innerHTML = '<div class="loading-spinner">Cargando...</div>';

    if (!currentUser) return;

    try {
        const snapshot = await db.collection('users').doc(currentUser.uid).collection('following').get();

        if (snapshot.empty) {
            container.innerHTML = '<p class="empty-message">No sigues a nadie aún. ¡Busca escaladores!</p>';
            return;
        }

        const userIds = snapshot.docs.map(doc => doc.id);
        // Fetch user details for each ID
        // Note: In a real app with many users, you'd want to paginate or denormalize basic user info
        const users = await Promise.all(userIds.map(async (id) => {
            const userDoc = await db.collection('users').doc(id).get();
            return { id: userDoc.id, ...userDoc.data() };
        }));

        renderUserList(users, container, true); // true = isFollowing list
    } catch (error) {
        console.error('Error loading following:', error);
        container.innerHTML = '<p class="empty-message">Error al cargar.</p>';
    }
}

async function loadFollowers() {
    const container = document.getElementById('followers-list');
    container.innerHTML = '<div class="loading-spinner">Cargando...</div>';

    if (!currentUser) return;

    try {
        const snapshot = await db.collection('users').doc(currentUser.uid).collection('followers').get();

        if (snapshot.empty) {
            container.innerHTML = '<p class="empty-message">Aún no tienes seguidores.</p>';
            return;
        }

        const userIds = snapshot.docs.map(doc => doc.id);
        const users = await Promise.all(userIds.map(async (id) => {
            const userDoc = await db.collection('users').doc(id).get();
            return { id: userDoc.id, ...userDoc.data() };
        }));

        // Check if I follow them back to set button state correctly
        const usersWithStatus = await Promise.all(users.map(async (user) => {
            const isFollowing = await checkFollowStatus(user.id);
            return { ...user, isFollowing };
        }));

        renderUserList(usersWithStatus, container);
    } catch (error) {
        console.error('Error loading followers:', error);
        container.innerHTML = '<p class="empty-message">Error al cargar.</p>';
    }
}

async function searchUsers(query) {
    const container = document.getElementById('search-users-results');
    if (!query || query.length < 2) {
        container.innerHTML = '<p class="empty-message">Escribe al menos 2 caracteres.</p>';
        return;
    }

    container.innerHTML = '<div class="loading-spinner">Buscando...</div>';

    try {
        // Simple search by displayName (case-sensitive in Firestore unfortunately, but good enough for demo)
        // For production, use a normalized lowercase field
        const usersRef = db.collection('users')
            .where('displayName', '>=', query)
            .where('displayName', '<=', query + '\uf8ff')
            .limit(10);

        const snapshot = await usersRef.get();

        if (snapshot.empty) {
            container.innerHTML = '<p class="empty-message">No se encontraron usuarios.</p>';
            return;
        }

        const users = [];
        snapshot.forEach(doc => {
            if (doc.id !== currentUser.uid) { // Don't show self
                users.push({ id: doc.id, ...doc.data() });
            }
        });

        renderUserList(users, container);

    } catch (error) {
        console.error('Error searching users:', error);
        container.innerHTML = '<p class="empty-message">Error al buscar.</p>';
    }
}

function renderUserList(users, container, forceFollowing = false) {
    if (users.length === 0) {
        container.innerHTML = '<p class="empty-message">No se encontraron usuarios.</p>';
        return;
    }

    const html = users.map(user => {
        const photoUrl = user.photoURL || 'https://ui-avatars.com/api/?name=U&background=e5e7eb&color=6b7280&size=40';
        // If forceFollowing is true, we know we follow them. Otherwise check property
        const isFollowing = forceFollowing || user.isFollowing;
        const btnClass = isFollowing ? 'follow-btn following' : 'follow-btn';
        const btnText = isFollowing ? 'Siguiendo' : 'Seguir';

        return `
            <div class="user-item">
                <img src="${photoUrl}" alt="${user.displayName}" class="user-item-avatar">
                <div class="user-item-info">
                    <div class="user-item-name">${user.displayName}</div>
                    <div class="user-item-stats">${user.bio || 'Escalador'}</div>
                </div>
                ${user.id !== currentUser?.uid ?
                `<button class="${btnClass}" onclick="toggleFollow('${user.id}', this)">${btnText}</button>`
                : ''}
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

// Global function for onclick
// Global function for onclick
window.toggleFollow = async function (targetUserId, btn) {
    if (!currentUser) {
        showToast('Inicia sesión para seguir usuarios', 'info');
        return;
    }

    const isFollowing = btn.classList.contains('following');
    btn.disabled = true; // Prevent double clicks

    if (isFollowing) {
        const success = await unfollowUser(targetUserId);
        if (success) {
            btn.classList.remove('following');
            btn.textContent = 'Seguir';
            // Update stats if on profile
            updateLocalStats(-1);
        }
    } else {
        const success = await followUser(targetUserId);
        if (success) {
            btn.classList.add('following');
            btn.textContent = 'Siguiendo';
            // Update stats if on profile
            updateLocalStats(1);
        }
    }
    btn.disabled = false;
};

// Helper to update local stats UI immediately
function updateLocalStats(change) {
    const statFollowing = document.getElementById('stat-following');
    if (statFollowing) {
        let current = parseInt(statFollowing.textContent) || 0;
        statFollowing.textContent = Math.max(0, current + change);
    }
}

// Follow a user
async function followUser(targetUserId) {
    try {
        const batch = db.batch();

        // 1. Add to my 'following' collection
        const myFollowingRef = db.collection('users').doc(currentUser.uid).collection('following').doc(targetUserId);
        batch.set(myFollowingRef, {
            userId: targetUserId,
            followedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 2. Add to target's 'followers' collection
        const targetFollowerRef = db.collection('users').doc(targetUserId).collection('followers').doc(currentUser.uid);
        batch.set(targetFollowerRef, {
            userId: currentUser.uid,
            followedAt: firebase.firestore.FieldValue.serverTimestamp()
        });


        // 3. Increment my following count (use update with dot notation)
        const myRef = db.collection('users').doc(currentUser.uid);
        batch.update(myRef, {
            'stats.followingCount': firebase.firestore.FieldValue.increment(1)
        });

        // 4. Increment target's followers count (use update with dot notation)
        const targetRef = db.collection('users').doc(targetUserId);
        batch.update(targetRef, {
            'stats.followersCount': firebase.firestore.FieldValue.increment(1)
        });

        await batch.commit();

        // 5. Create notification for the target user
        if (typeof window.createNotification === 'function') {
            const myName = currentUser.displayName || 'Alguien';
            await window.createNotification(
                targetUserId,
                'follow',
                `<strong>${myName}</strong> ha empezado a seguirte`
            );
        }

        showToast('Usuario seguido', 'success');
        return true;
    } catch (error) {
        console.error('Error following user:', error);
        showToast('Error al seguir usuario: ' + error.message, 'error');
        return false;
    }
}

// Unfollow a user
async function unfollowUser(targetUserId) {
    try {
        const batch = db.batch();

        // 1. Remove from my 'following' collection
        const myFollowingRef = db.collection('users').doc(currentUser.uid).collection('following').doc(targetUserId);
        batch.delete(myFollowingRef);

        // 2. Remove from target's 'followers' collection
        const targetFollowerRef = db.collection('users').doc(targetUserId).collection('followers').doc(currentUser.uid);
        batch.delete(targetFollowerRef);

        // 3. Decrement my following count (use update with dot notation)
        const myRef = db.collection('users').doc(currentUser.uid);
        batch.update(myRef, {
            'stats.followingCount': firebase.firestore.FieldValue.increment(-1)
        });

        // 4. Decrement target's followers count (use update with dot notation)
        const targetRef = db.collection('users').doc(targetUserId);
        batch.update(targetRef, {
            'stats.followersCount': firebase.firestore.FieldValue.increment(-1)
        });

        await batch.commit();

        // 5. Delete follow notification (idempotent cleanup)
        if (typeof window.deleteNotification === 'function') {
            window.deleteNotification(targetUserId, 'follow', '');
        }

        showToast('Dejaste de seguir al usuario', 'info');
        return true;
    } catch (error) {
        console.error('Error unfollowing user:', error);
        showToast('Error al dejar de seguir: ' + error.message, 'error');
        return false;
    }
}

// Check if I follow a user
async function checkFollowStatus(targetUserId) {
    if (!currentUser) return false;
    try {
        const doc = await db.collection('users').doc(currentUser.uid).collection('following').doc(targetUserId).get();
        return doc.exists;
    } catch (error) {
        console.error('Error checking follow status:', error);
        return false;
    }
}

// Update Profile
async function updateUserProfile(profileData) {
    if (!currentUser) return false;
    try {
        const updateData = {
            displayName: profileData.displayName,
            bio: profileData.bio,
            location: profileData.location,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Add photoURL if provided
        if (profileData.photoURL) {
            updateData.photoURL = profileData.photoURL;
        }

        await db.collection('users').doc(currentUser.uid).update(updateData);

        // Also update Firebase Auth profile (this makes it persist)
        const authUpdateData = {
            displayName: profileData.displayName
        };
        if (profileData.photoURL) {
            authUpdateData.photoURL = profileData.photoURL;
        }
        await currentUser.updateProfile(authUpdateData);

        // Update local UI
        document.getElementById('profile-name').textContent = profileData.displayName;
        document.getElementById('profile-bio').textContent = profileData.bio || '';

        // Update location if exists
        const locationEl = document.getElementById('profile-location');
        if (locationEl && profileData.location) {
            locationEl.textContent = profileData.location;
        }

        // Update profile avatar if photo changed
        if (profileData.photoURL) {
            const profileAvatar = document.getElementById('profile-avatar');
            if (profileAvatar) profileAvatar.src = profileData.photoURL;

            // Update all other instances of the user's avatar on the page
            const navAvatar = document.querySelector('.nav-avatar-img');
            if (navAvatar) navAvatar.src = profileData.photoURL;
        }

        // Update header name if exists
        const headerName = document.getElementById('user-name');
        if (headerName) headerName.textContent = profileData.displayName;

        return true;
    } catch (error) {
        console.error('Error updating profile:', error);
        showToast('Error al actualizar perfil', 'error');
        return false;
    }
}

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Helper to ensure school data is loaded for sector lookup
async function ensureSchoolDataLoaded(schoolId) {
    // Normalize school ID (simple version)
    const normalizedId = schoolId.toLowerCase().replace(/ /g, '');
    // Map known names to IDs if needed, or just use normalized
    // For now, we assume 'valeria' and 'sanmartin' are the keys
    let key = normalizedId;
    if (normalizedId.includes('valeria')) key = 'valeria';
    else if (normalizedId.includes('sanmartin') || normalizedId.includes('valdeiglesias')) key = 'sanmartin';

    const globalVarName = `${key}_vias`;

    // If already loaded, return
    if (window[globalVarName]) return;

    // Check if we have paths for this school
    if (!window.SCHOOL_PATHS || !window.SCHOOL_PATHS[key]) {
        console.warn(`No paths found for school: ${schoolId} (key: ${key})`);
        return;
    }

    try {
        const paths = window.SCHOOL_PATHS[key];
        const url = `${paths.folder}/${paths.vias}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        window[globalVarName] = data;
    } catch (error) {
        console.error(`Error loading school data for ${schoolId}:`, error);
    }
}

// Show My Routes modal (with tabs)
async function showMyRoutes() {
    if (!currentUser) return;

    const modal = document.getElementById('my-routes-modal');
    const listContainer = document.getElementById('my-routes-list');
    const userDropdown = document.getElementById('user-dropdown');

    // Close dropdown
    if (userDropdown) userDropdown.classList.add('hidden');

    modal.classList.remove('hidden');

    // Switch to routes tab and load data
    switchTab('routes');

    listContainer.innerHTML = '<div class="loading-spinner">Cargando tus encadenes...</div>';

    try {
        const ascents = await getUserAscents(currentUser.uid);

        // Identify unique schools to load data for
        const schools = [...new Set(ascents.map(a => a.schoolId || a.schoolName || ''))].filter(s => s);

        // Load data for all schools in parallel
        await Promise.all(schools.map(school => ensureSchoolDataLoaded(school)));

        renderAscentsList(ascents);
    } catch (error) {
        console.error('Error loading ascents:', error);
        listContainer.innerHTML = '<div class="error-message">Error al cargar tus vías</div>';
    }
}

// Render ascents list
function renderAscentsList(ascents) {
    const listContainer = document.getElementById('my-routes-list');

    if (!ascents || ascents.length === 0) {
        listContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">🧗‍♂️</span>
        <h3>Aún no has registrado vías</h3>
        <p>¡Sal a escalar y registra tus encadenes!</p>
      </div>
    `;
        return;
    }

    // Enrich ascents with sector data if missing
    ascents.forEach(ascent => {
        if (!ascent.sector) {
            const schoolId = ascent.schoolId || ascent.schoolName || '';
            const normalizedId = schoolId.toLowerCase().replace(/ /g, '');
            let key = normalizedId;
            if (normalizedId.includes('valeria')) key = 'valeria';
            else if (normalizedId.includes('sanmartin') || normalizedId.includes('valdeiglesias')) key = 'sanmartin';

            const globalVarName = `${key}_vias`;
            const geoJson = window[globalVarName];

            if (geoJson && geoJson.features) {
                // Find feature by name
                const feature = geoJson.features.find(f => {
                    const p = f.properties;
                    const name = p.nombre || p.Nombre || p.name;
                    return name && name.toLowerCase() === ascent.routeName.toLowerCase();
                });

                if (feature && feature.properties) {
                    ascent.sector = feature.properties.sector || feature.properties.Sector || 'Sin sector';
                }
            }
        }
    });

    // Group by school, then by sector
    const grouped = {};
    ascents.forEach(ascent => {
        const school = ascent.schoolName || 'Sin escuela';
        const sector = ascent.sector || 'Sin sector';

        if (!grouped[school]) {
            grouped[school] = {};
        }
        if (!grouped[school][sector]) {
            grouped[school][sector] = [];
        }
        grouped[school][sector].push(ascent);
    });

    // Sort ascents within each sector by date (newest first)
    Object.keys(grouped).forEach(school => {
        Object.keys(grouped[school]).forEach(sector => {
            grouped[school][sector].sort((a, b) => new Date(b.date) - new Date(a.date));
        });
    });

    const styleIcons = {
        'redpoint': '🔴',
        'onsight': '👁️',
        'flash': '⚡',
        'toprope': '🧗',
        'project': '🚧'
    };

    // Generate HTML
    let html = '';

    Object.keys(grouped).sort().forEach(school => {
        const schoolCount = Object.values(grouped[school]).flat().length;

        html += `
            <div class="school-group">
                <div class="school-header" data-school="${school}">
                    <div class="school-header-left">
                        <span class="expand-icon">▶</span>
                        <h3>🏔️ ${school}</h3>
                    </div>
                    <span class="school-count">${schoolCount} vía${schoolCount !== 1 ? 's' : ''}</span>
                </div>
                <div class="school-content">
        `;

        Object.keys(grouped[school]).sort().forEach(sector => {
            const routes = grouped[school][sector];

            // Group routes by route name
            const routesByName = {};
            routes.forEach(ascent => {
                const routeName = ascent.routeName;
                if (!routesByName[routeName]) {
                    routesByName[routeName] = [];
                }
                routesByName[routeName].push(ascent);
            });

            html += `
                <div class="sector-group">
                    <div class="sector-header" data-sector="${sector}">
                        <div class="sector-header-left">
                            <span class="expand-icon">▶</span>
                            <h4>📍 ${sector}</h4>
                        </div>
                        <span class="sector-count">${Object.keys(routesByName).length} vía${Object.keys(routesByName).length !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="sector-content">
            `;

            // Sort unique routes by most recent date
            Object.entries(routesByName).sort((a, b) => {
                const latestA = Math.max(...a[1].map(r => new Date(r.date)));
                const latestB = Math.max(...b[1].map(r => new Date(r.date)));
                return latestB - latestA;
            }).forEach(([routeName, ascents]) => {
                const count = ascents.length;
                const latestAscent = ascents.reduce((a, b) =>
                    new Date(a.date) > new Date(b.date) ? a : b
                );
                const grade = latestAscent.grade;

                // Get best style (priority: onsight > flash > redpoint > toprope)
                const stylePriority = { 'onsight': 4, 'flash': 3, 'redpoint': 2, 'toprope': 1, 'project': 0 };
                const bestAscent = ascents.reduce((a, b) =>
                    (stylePriority[a.style] || 0) > (stylePriority[b.style] || 0) ? a : b
                );

                // Get average rating
                const ratingsSum = ascents.reduce((sum, a) => sum + (a.rating || 0), 0);
                const avgRating = Math.round(ratingsSum / ascents.length);

                html += `
                    <div class="route-card compact" data-route-name="${routeName}">
                        <div class="route-card-main">
                            <div class="route-card-header">
                                <span class="route-card-title">
                                    ${routeName} <span class="route-card-grade-inline">${grade}</span>
                                    ${count > 1 ? `<span class="repeat-badge">×${count}</span>` : ''}
                                </span>
                            </div>
                            <div class="route-card-details">
                                <span class="route-card-style">${styleIcons[bestAscent.style] || '🧗'} ${bestAscent.style}</span>
                                <span class="route-card-date">${new Date(latestAscent.date).toLocaleDateString()}</span>
                                ${avgRating > 0 ? `<span class="route-card-rating-inline">${'★'.repeat(avgRating)}</span>` : ''}
                            </div>
                        </div>
                        <div class="route-card-actions">
                            <button class="view-ascents-btn" data-route-name="${routeName}" data-count="${count}">
                                👁️ Ver ${count > 1 ? 'todos' : 'detalles'}
                            </button>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    listContainer.innerHTML = html;

    // Attach event listeners to school headers
    document.querySelectorAll('.school-header').forEach(header => {
        header.addEventListener('click', () => {
            const schoolGroup = header.parentElement;
            const schoolContent = schoolGroup.querySelector('.school-content');
            const expandIcon = header.querySelector('.expand-icon');

            if (schoolContent.classList.contains('expanded')) {
                schoolContent.classList.remove('expanded');
                expandIcon.textContent = '▶';
            } else {
                schoolContent.classList.add('expanded');
                expandIcon.textContent = '▼';
            }
        });
    });

    // Attach event listeners to sector headers
    document.querySelectorAll('.sector-header').forEach(header => {
        header.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering school header
            const sectorGroup = header.parentElement;
            const sectorContent = sectorGroup.querySelector('.sector-content');
            const expandIcon = header.querySelector('.expand-icon');

            if (sectorContent.classList.contains('expanded')) {
                sectorContent.classList.remove('expanded');
                expandIcon.textContent = '▶';
            } else {
                sectorContent.classList.add('expanded');
                expandIcon.textContent = '▼';
            }
        });
    });

    // Attach event listeners to view-ascents buttons
    document.querySelectorAll('.view-ascents-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const routeName = btn.dataset.routeName;
            // Find all ascents for this route
            const routeAscents = ascents.filter(a => a.routeName === routeName);
            showRouteDetailsModal(routeAscents);
        });
    });

    // Attach event listeners to delete buttons (if any remain)
    document.querySelectorAll('.delete-ascent-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ascentId = btn.dataset.id;
            const confirmed = await showConfirm('¿Seguro que quieres eliminar este ascenso?', 'Eliminar ascenso');
            if (confirmed) {
                const success = await deleteAscent(ascentId);
                if (success) {
                    showMyRoutes(); // Reload list
                }
            }
        });
    });

    // Attach event listeners to edit buttons (if any remain)
    document.querySelectorAll('.edit-ascent-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const ascentId = btn.dataset.id;
            const ascent = ascents.find(a => a.id === ascentId);
            if (ascent) {
                openEditAscentModal(ascent);
            }
        });
    });

    // Render statistics chart
    renderAscentsStats(ascents);
}

// Show detailed modal for a specific route's ascents
function showRouteDetailsModal(routeAscents) {
    const styleIcons = {
        'redpoint': '🔴',
        'onsight': '👁️',
        'flash': '⚡',
        'toprope': '🧗',
        'project': '🚧'
    };

    if (!routeAscents || routeAscents.length === 0) return;

    const routeName = routeAscents[0].routeName;
    const grade = routeAscents[0].grade;

    // Sort by date (newest first)
    routeAscents.sort((a, b) => new Date(b.date) - new Date(a.date));

    const detailsHtml = routeAscents.map((ascent, index) => `
        <div style="border-bottom: 1px solid #eee; padding: 12px 0; ${index === 0 ? 'border-top: 1px solid #eee;' : ''}">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span><strong>#${routeAscents.length - index}</strong> - ${new Date(ascent.date).toLocaleDateString()}</span>
                <span>${styleIcons[ascent.style] || '🧗'} ${ascent.style}</span>
            </div>
            ${ascent.sector ? `<div style="font-size: 13px; color: #666;">📍 ${ascent.sector}</div>` : ''}
            ${ascent.tries ? `<div style="font-size: 13px; color: #666;">Intentos: ${ascent.tries}</div>` : ''}
            ${ascent.rating ? `<div style="font-size: 13px;">Rating: ${'★'.repeat(ascent.rating)}${'☆'.repeat(5 - ascent.rating)}</div>` : ''}
            ${ascent.notes ? `<div style="font-size: 13px; font-style: italic; margin-top: 4px;">"${ascent.notes}"</div>` : ''}
            <div style="margin-top: 8px; display: flex; gap: 8px;">
                <button class="edit-ascent-detail-btn" data-id="${ascent.id}" style="background: #1a73e8; color: white; border: none; padding: 4px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;">✏️ Editar</button>
                <button class="delete-ascent-detail-btn" data-id="${ascent.id}" style="background: #f44336; color: white; border: none; padding: 4px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;">🗑️ Eliminar</button>
            </div>
        </div>
    `).join('');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px; max-height: 80vh; overflow-y: auto;">
            <div class="modal-header">
                <h3>${routeName} <span style="color: #666;">${grade}</span></h3>
                <button class="close-btn" id="close-route-details">×</button>
            </div>
            <div style="padding: 0 20px 20px;">
                <div style="margin-bottom: 12px; padding: 8px; background: #e3f2fd; border-radius: 6px;">
                    <strong>${routeAscents.length}</strong> ascenso${routeAscents.length !== 1 ? 's' : ''} registrado${routeAscents.length !== 1 ? 's' : ''}
                </div>
                ${detailsHtml}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close button
    document.getElementById('close-route-details').addEventListener('click', () => {
        modal.remove();
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    // Edit buttons
    modal.querySelectorAll('.edit-ascent-detail-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const ascentId = btn.dataset.id;
            const ascent = routeAscents.find(a => a.id === ascentId);
            if (ascent) {
                modal.remove();
                openEditAscentModal(ascent);
            }
        });
    });

    // Delete buttons
    modal.querySelectorAll('.delete-ascent-detail-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ascentId = btn.dataset.id;
            const confirmed = await showConfirm('¿Eliminar este ascenso?', 'Eliminar');
            if (confirmed) {
                const success = await deleteAscent(ascentId);
                if (success) {
                    modal.remove();
                    showMyRoutes(); // Reload main list
                }
            }
        });
    });
}

// Render ascents statistics chart
function renderAscentsStats(ascents) {
    const statsContainer = document.getElementById('routes-stats');
    if (!statsContainer) return;

    // Count ascents by grade
    const gradeCount = {};
    ascents.forEach(ascent => {
        const grade = ascent.grade;
        gradeCount[grade] = (gradeCount[grade] || 0) + 1;
    });

    // Get grade order (use same order as map markers)
    const GRADE_ORDER = [
        "5a", "5b", "5c", "5c+",
        "6a", "6a+", "6b", "6b+", "6c", "6c+",
        "7a", "7a+", "7b", "7b+", "7c", "7c+",
        "8a", "8a+", "8b", "8b+", "9a"
    ];

    const GRADE_COLORS = {
        "5a": "#d7ffafff",
        "5b": "#9fde61ff",
        "5c": "#46923aff",
        "5c+": "#46923aff",
        "6a": "#fff48dff",
        "6a+": "#fff48dff",
        "6b": "#ede74bff",
        "6b+": "#ede74bff",
        "6c": "#ff9f40ff",
        "6c+": "#ff9f40ff",
        "7a": "#ff6600ff",
        "7a+": "#ff6600ff",
        "7b": "#ff0000ff",
        "7b+": "#ff0000ff",
        "7c": "#db0000ff",
        "7c+": "#db0000ff",
        "8a": "#ff00ddff",
        "8a+": "#ff00ddff",
        "8b": "#9d00ffff",
        "8b+": "#9d00ffff",
        "9a": "#000000ff"
    };

    // Filter and sort grades
    const sortedGrades = Object.keys(gradeCount).sort((a, b) => {
        const indexA = GRADE_ORDER.indexOf(a);
        const indexB = GRADE_ORDER.indexOf(b);
        return indexA - indexB;
    });

    if (sortedGrades.length === 0) {
        statsContainer.innerHTML = '';
        return;
    }

    // Calculate max count for scaling
    const maxCount = Math.max(...Object.values(gradeCount));
    const maxHeight = 120; // Maximum bar height in pixels

    // Generate bars HTML
    const barsHtml = sortedGrades.map(grade => {
        const count = gradeCount[grade];
        const height = (count / maxCount) * maxHeight;
        const color = GRADE_COLORS[grade] || "#999";
        const percentage = ((count / ascents.length) * 100).toFixed(0);

        return `
            <div class="grade-bar" data-grade="${grade}">
                <div class="grade-tooltip">
                    <span class="grade-tooltip-grade" style="background:${color};">${grade}</span>
                    <span class="grade-tooltip-count">${count} vía${count !== 1 ? 's' : ''} (${percentage}%)</span>
                </div>
                <div class="grade-bar-inner" style="height:${height}px; background:${color};"></div>
            </div>
        `;
    }).join('');

    statsContainer.innerHTML = `
        <div class="ascents-stats-header">
            <h4>📊 Resumen de tus vías</h4>
            <div class="ascents-stats-summary">
                <span><strong>${ascents.length}</strong> vías totales</span>
                <span><strong>${sortedGrades.length}</strong> grados diferentes</span>
            </div>
        </div>
        <div class="school-grade-chart">
            <div class="school-grade-chart-bars">
                ${barsHtml}
            </div>
        </div>
    `;
}

/**
 * Compare two climbing grades (helper function if not available globally)
 */
function compareGradesLocal(gradeA, gradeB) {
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
 * Calculate climbing statistics from ascents array
 * Returns object with totalAscents, maxGrade, zonesVisited
 */
function calculateClimbingStats(ascents) {
    if (!ascents || ascents.length === 0) {
        return {
            totalAscents: 0,
            maxGrade: '-',
            zonesVisited: 0
        };
    }

    // Calculate max grade using compareGrades function if available
    let maxGrade = '-';
    if (ascents.length > 0) {
        const grades = ascents
            .map(a => a.grade)
            .filter(g => g && g.trim() !== '');
        
        if (grades.length > 0) {
            // Use compareGrades if available (from maplibre-map.js), otherwise use local version
            const compareFunc = typeof compareGrades === 'function' ? compareGrades : compareGradesLocal;
            maxGrade = grades.sort(compareFunc).reverse()[0];
        }
    }

    // Calculate unique zones/schools visited
    const zones = new Set(
        ascents
            .map(a => a.schoolName)
            .filter(z => z && z.trim() !== '')
    );

    return {
        totalAscents: ascents.length,
        maxGrade: maxGrade,
        zonesVisited: zones.size
    };
}

/**
 * Render climbing statistics in public profile modal
 * @param {Array} ascents - Array of ascent objects
 */
function renderPublicProfileClimbingStats(ascents) {
    const container = document.getElementById('pp-climbing-stats');
    if (!container) return;

    const stats = calculateClimbingStats(ascents);

    container.innerHTML = `
        <div class="profile-card-ig">
            <div class="profile-card-header-ig">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
                <span style="color: #2d2d2d;">Estadísticas de escalada</span>
            </div>
            <div class="profile-climbing-grid-ig">
                <div class="climbing-metric-ig">
                    <div class="climbing-metric-icon-ig">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                            stroke-linecap="round" stroke-linejoin="round">
                            <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
                        </svg>
                    </div>
                    <div class="climbing-metric-value-ig" style="color: #2d2d2d;">${stats.totalAscents}</div>
                    <div class="climbing-metric-label-ig">Ascensiones</div>
                </div>
                <div class="climbing-metric-ig">
                    <div class="climbing-metric-icon-ig">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                            stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                            <line x1="4" x2="4" y1="22" y2="15" />
                        </svg>
                    </div>
                    <div class="climbing-metric-value-ig" style="color: #2d2d2d;">${stats.maxGrade}</div>
                    <div class="climbing-metric-label-ig">Grado máximo</div>
                </div>
                <div class="climbing-metric-ig">
                    <div class="climbing-metric-icon-ig">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                            stroke-linecap="round" stroke-linejoin="round">
                            <path d="M15 2H9a5 5 0 0 0-5 5v10a5 5 0 0 0 5 5h6a4 4 0 0 0 4-4V6a4 4 0 0 0-4-4z" />
                            <line x1="14" y1="6" x2="14" y2="18" />
                        </svg>
                    </div>
                    <div class="climbing-metric-value-ig" style="color: #2d2d2d;">${stats.zonesVisited}</div>
                    <div class="climbing-metric-label-ig">Escuelas Visitadas</div>
                </div>
            </div>
        </div>
    `;
}

// Expose functions globally for use in app_3.js
window.renderPublicProfileClimbingStats = renderPublicProfileClimbingStats;
window.getUserAscentsByUserId = getUserAscentsByUserId;

// Show Favorites (now opens modal on Favorites tab)
async function showFavorites() {
    if (!currentUser) return;

    const modal = document.getElementById('my-routes-modal'); // Use same modal
    const userDropdown = document.getElementById('user-dropdown');

    // Close dropdown
    if (userDropdown) userDropdown.classList.add('hidden');

    modal.classList.remove('hidden');

    // Switch to favorites tab
    switchTab('favorites');
}

// Render favorites list
async function renderFavoritesList() {
    const listContainer = document.getElementById('favorites-list');

    if (!currentUser) {
        listContainer.innerHTML = '<div class="empty-state"><p>Inicia sesión para ver tus favoritos</p></div>';
        return;
    }

    const favoritesData = getFavorites();
    const hasAny = favoritesData.routes.length > 0 || favoritesData.schools.length > 0 || favoritesData.sectors.length > 0;

    if (!hasAny) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon">❤️</span>
                <h3>Aún no tienes favoritos</h3>
                <p>Añade vías, escuelas o sectores a tus favoritos para acceder a ellos rápidamente</p>
            </div>
        `;
        return;
    }

    let html = '<div class="favorites-container">';

    // Routes
    if (favoritesData.routes.length > 0) {
        html += '<div class="favorites-section"><h4>🧗 Vías</h4><div class="favorites-items">';
        favoritesData.routes.forEach(fav => {
            html += `
                <div class="favorite-item" data-type="route" data-id="${fav.id}">
                    <span class="favorite-name">${fav.id}</span>
                    <button class="remove-favorite-btn" data-type="route" data-id="${fav.id}">×</button>
                </div>
            `;
        });
        html += '</div></div>';
    }

    // Schools
    if (favoritesData.schools.length > 0) {
        html += '<div class="favorites-section"><h4>🅿️ Escuelas</h4><div class="favorites-items">';
        favoritesData.schools.forEach(fav => {
            html += `
                <div class="favorite-item" data-type="school" data-id="${fav.id}">
                    <span class="favorite-name">${fav.id}</span>
                    <button class="remove-favorite-btn" data-type="school" data-id="${fav.id}">×</button>
                </div>
            `;
        });
        html += '</div></div>';
    }

    // Sectors
    if (favoritesData.sectors.length > 0) {
        html += '<div class="favorites-section"><h4>📐 Sectores</h4><div class="favorites-items">';
        favoritesData.sectors.forEach(fav => {
            html += `
                <div class="favorite-item" data-type="sector" data-id="${fav.id}">
                    <span class="favorite-name">${fav.id}</span>
                    <button class="remove-favorite-btn" data-type="sector" data-id="${fav.id}">×</button>
                </div>
            `;
        });
        html += '</div></div>';
    }

    html += '</div>';
    listContainer.innerHTML = html;

    // Attach event listeners to remove buttons
    document.querySelectorAll('.remove-favorite-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const type = btn.dataset.type;
            const id = btn.dataset.id;
            await toggleFavorite(type, id);
            renderFavoritesList(); // Reload list
        });
    });

    // Attach click listeners to favorite items (to navigate to them)
    document.querySelectorAll('.favorite-item').forEach(item => {
        item.addEventListener('click', () => {
            const type = item.dataset.type;
            const id = item.dataset.id;
            navigateToFavorite(type, id);
        });
    });
}

// Navigate to a favorite item on the map
function navigateToFavorite(type, id) {
    // Close the modal
    const modal = document.getElementById('my-routes-modal');
    if (modal) modal.classList.add('hidden');

    // Navigate based on type
    if (type === 'route') {
        showToast(`Buscando vía: ${id}`, 'info');
        // TODO: Implement route navigation
    } else if (type === 'school') {
        showToast(`Buscando escuela: ${id}`, 'info');
        // TODO: Implement school navigation
    } else if (type === 'sector') {
        showToast(`Buscando sector: ${id}`, 'info');
        // TODO: Implement sector navigation
    }
}

// ==================== COMMENTS SYSTEM ====================

// Open comments modal
async function openCommentsModal(schoolId, routeName) {
    const modal = document.getElementById('comments-modal');
    const listContainer = document.getElementById('comments-list');
    const form = document.getElementById('comment-form');
    const userPhoto = document.getElementById('comment-user-photo');
    const modalTitle = document.getElementById('comments-modal-title');

    // Set modal title
    if (modalTitle) {
        modalTitle.textContent = `Comentarios: ${routeName}`;
    }

    // Set current user photo if available
    if (currentUser && currentUser.photoURL) {
        userPhoto.src = currentUser.photoURL;
        userPhoto.classList.remove('hidden');
    } else {
        userPhoto.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    listContainer.innerHTML = '<div class="loading-spinner">Cargando comentarios...</div>';

    // Store context in form
    form.dataset.schoolId = schoolId;
    form.dataset.routeName = routeName;

    // Load comments
    const routeId = `${schoolId}_${normalizeId(routeName)}`;
    await loadComments(routeId);
}

// Load comments from Firestore
async function loadComments(routeId) {
    const listContainer = document.getElementById('comments-list');

    try {
        const commentsRef = db.collection('comments')
            .where('routeId', '==', routeId);

        const snapshot = await commentsRef.get();

        if (snapshot.empty) {
            listContainer.innerHTML = '<div class="empty-comments">Sé el primero en comentar 👇</div>';
            return;
        }

        const comments = [];
        snapshot.forEach(doc => {
            comments.push({ id: doc.id, ...doc.data() });
        });

        // Sort in memory (oldest first)
        comments.sort((a, b) => {
            const dateA = a.createdAt ? a.createdAt.toDate() : new Date(0);
            const dateB = b.createdAt ? b.createdAt.toDate() : new Date(0);
            return dateA - dateB;
        });

        renderComments(comments);

        // Scroll to bottom
        listContainer.scrollTop = listContainer.scrollHeight;

    } catch (error) {
        console.error('Error loading comments:', error);
        listContainer.innerHTML = '<div class="error-message">Error al cargar comentarios</div>';
    }
}

// Render comments list
function renderComments(comments) {
    const listContainer = document.getElementById('comments-list');

    const html = comments.map(comment => {
        const isOwn = currentUser && comment.userId === currentUser.uid;
        const date = comment.createdAt ? new Date(comment.createdAt.toDate()).toLocaleDateString() : '';
        const photoUrl = comment.userPhoto || 'https://ui-avatars.com/api/?name=U&background=e5e7eb&color=6b7280&size=32';

        const deleteBtn = isOwn
            ? `<button class="delete-comment-btn" data-id="${comment.id}">🗑️</button>`
            : '';

        return `
            <div class="comment-item ${isOwn ? 'own-comment' : ''}">
                <img src="${photoUrl}" alt="${comment.userName}" class="comment-avatar">
                <div class="comment-content">
                    <div class="comment-header">
                        <span class="comment-author">${comment.userName}</span>
                        <span class="comment-date">${date} ${deleteBtn}</span>
                    </div>
                    <div class="comment-text">${escapeHtml(comment.text)}</div>
                </div>
            </div>
        `;
    }).join('');

    listContainer.innerHTML = html;

    // Attach delete listeners
    document.querySelectorAll('.delete-comment-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const confirmed = await showConfirm('¿Estás seguro de que quieres eliminar este comentario?', 'Eliminar Comentario');
            if (confirmed) {
                await deleteComment(btn.dataset.id);
                // Reload comments
                const form = document.getElementById('comment-form');
                const routeId = `${form.dataset.schoolId}_${normalizeId(form.dataset.routeName)}`;
                loadComments(routeId);
            }
        });
    });
}

// Post a new comment
async function postComment(text) {
    if (!currentUser) {
        showToast('Inicia sesión para comentar', 'info');
        return;
    }

    const form = document.getElementById('comment-form');
    const schoolId = form.dataset.schoolId;
    const routeName = form.dataset.routeName;
    const routeId = `${schoolId}_${normalizeId(routeName)}`;

    try {
        await db.collection('comments').add({
            routeId: routeId,
            userId: currentUser.uid,
            userName: currentUser.displayName || 'Usuario',
            userPhoto: currentUser.photoURL,
            text: text,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Clear input
        document.getElementById('comment-input').value = '';
        document.getElementById('send-comment-btn').disabled = true;

        // Reload comments
        await loadComments(routeId);

    } catch (error) {
        console.error('Error posting comment:', error);
        showToast('Error al publicar comentario', 'error');
    }
}

// Delete comment
async function deleteComment(commentId) {
    try {
        await db.collection('comments').doc(commentId).delete();
        showToast('Comentario eliminado', 'success');
    } catch (error) {
        console.error('Error deleting comment:', error);
        showToast('Error al eliminar', 'error');
    }
}

// Helper to normalize IDs
function normalizeId(text) {
    return text.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

// Helper to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
function renderProjectsList() {
    const listContainer = document.getElementById('projects-list');

    if (!currentUser) {
        listContainer.innerHTML = '<div class="empty-state"><p>Inicia sesión para ver tus proyectos</p></div>';
        return;
    }

    const projects = getProjects();

    if (projects.length === 0) {
        listContainer.innerHTML = `
            <p class="empty-message">No tienes proyectos aún. Marca vías como proyecto desde su InfoWindow.</p>
        `;
        return;
    }

    let html = '<div class="projects-container">';

    projects.forEach(project => {
        html += `
            <div class="project-item">
                <div class="project-info">
                    <span class="project-name">${project.name}</span>
                    <span class="project-grade">${project.grade}</span>
                </div>
                <button class="remove-project-btn" data-id="${project.id}">×</button>
            </div>
        `;
    });

    html += '</div>';
    listContainer.innerHTML = html;

    // Attach event listeners to remove buttons
    document.querySelectorAll('.remove-project-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            await toggleProject(id, id); // Will remove it
            renderProjectsList(); // Reload list
        });
    });
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Close modal button
    const closeBtn = document.getElementById('close-ascent-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeAscentModal);
    }

    // Close My Routes modal
    const closeRoutesBtn = document.getElementById('close-my-routes-modal');
    if (closeRoutesBtn) {
        closeRoutesBtn.addEventListener('click', () => {
            document.getElementById('my-routes-modal').classList.add('hidden');
        });
    }

    // My Routes button
    const myRoutesBtn = document.getElementById('my-routes-btn');
    if (myRoutesBtn) {
        myRoutesBtn.addEventListener('click', showMyRoutes);
    }

    // My Network button
    const myNetworkBtn = document.getElementById('my-network-btn');
    if (myNetworkBtn) {
        myNetworkBtn.addEventListener('click', showNetwork);
    }

    // Close Network modal
    const closeNetworkBtn = document.getElementById('close-network-modal');
    const networkModal = document.getElementById('network-modal');
    if (closeNetworkBtn) {
        closeNetworkBtn.addEventListener('click', () => {
            networkModal.classList.add('hidden');
        });
    }
    if (networkModal) {
        networkModal.addEventListener('click', (e) => {
            if (e.target === networkModal) {
                networkModal.classList.add('hidden');
            }
        });
    }

    // Initialize tab navigation
    initTabs();

    // Close modal on outside click
    const modal = document.getElementById('ascent-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeAscentModal();
            }
        });
    }

    const routesModal = document.getElementById('my-routes-modal');
    if (routesModal) {
        routesModal.addEventListener('click', (e) => {
            if (e.target === routesModal) {
                routesModal.classList.add('hidden');
            }
        });
    }

    // Comments Modal Listeners
    const commentsModal = document.getElementById('comments-modal');
    const closeCommentsBtn = document.getElementById('close-comments-modal');
    const commentForm = document.getElementById('comment-form');
    const commentInput = document.getElementById('comment-input');
    const sendCommentBtn = document.getElementById('send-comment-btn');

    if (closeCommentsBtn) {
        closeCommentsBtn.addEventListener('click', () => {
            commentsModal.classList.add('hidden');
        });
    }

    if (commentsModal) {
        commentsModal.addEventListener('click', (e) => {
            if (e.target === commentsModal) {
                commentsModal.classList.add('hidden');
            }
        });
    }

    if (commentInput) {
        commentInput.addEventListener('input', (e) => {
            sendCommentBtn.disabled = !e.target.value.trim();
        });
    }

    if (commentForm) {
        commentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = commentInput.value.trim();
            if (text) {
                postComment(text);
            }
        });
    }

    // Form submission
    const form = document.getElementById('ascent-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!currentUser) return;

            const submitBtn = form.querySelector('.submit-btn');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Guardando...';

            try {
                const ascentData = {
                    userId: currentUser.uid,
                    schoolId: document.getElementById('ascent-school-id').value,
                    schoolName: document.getElementById('ascent-school-name').value,
                    routeName: document.getElementById('ascent-route-name').value,
                    grade: document.getElementById('ascent-grade').value,
                    sector: document.getElementById('ascent-sector').value,
                    date: document.getElementById('ascent-date').value,
                    style: document.getElementById('ascent-style').value,
                    tries: parseInt(document.getElementById('ascent-tries').value),
                    notes: document.getElementById('ascent-notes').value,
                    rating: parseInt(document.querySelector('input[name="rating"]:checked')?.value || 0),
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };

                // Check if we're in edit mode
                const isEditMode = form.dataset.editMode === 'true';
                const ascentId = form.dataset.ascentId;

                if (isEditMode && ascentId) {
                    // Update existing ascent
                    await updateAscent(ascentId, ascentData);
                    closeAscentModal();
                    showToast('¡Ascenso actualizado correctamente!', 'success');
                    // Reload and reopen My Routes list
                    showMyRoutes();
                } else {
                    // Create new ascent
                    await logAscent(ascentData);
                    closeAscentModal();
                    showToast('¡Ascenso registrado correctamente!', 'success');
                }

            } catch (error) {
                console.error('Error submitting ascent:', error);
                showToast('Error al guardar el ascenso', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }
});

// ==================== MESSAGING SERVICE ====================

window.MessagingService = {
    /**
     * Get or create a conversation with another user
     * @param {string} otherUserId - The other user's ID
     * @param {object} otherUserInfo - Info about the other user (displayName, photoURL)
     * @returns {Promise<object>} - Conversation data with id
     */
    async getOrCreateConversation(otherUserId, otherUserInfo = {}) {
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) throw new Error('Not authenticated');

        const participants = [currentUser.uid, otherUserId].sort();

        // Check if conversation already exists
        const existingQuery = await db.collection('conversations')
            .where('participants', '==', participants)
            .limit(1)
            .get();

        if (!existingQuery.empty) {
            const doc = existingQuery.docs[0];
            return { id: doc.id, ...doc.data() };
        }

        // Create new conversation
        const participantInfo = {
            [currentUser.uid]: {
                displayName: currentUser.displayName || 'Usuario',
                photoURL: currentUser.photoURL || ''
            },
            [otherUserId]: {
                displayName: otherUserInfo.displayName || 'Usuario',
                photoURL: otherUserInfo.photoURL || ''
            }
        };

        const newConversation = {
            participants: participants,
            participantInfo: participantInfo,
            lastMessage: '',
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
            unreadCount: {
                [currentUser.uid]: 0,
                [otherUserId]: 0
            },
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('conversations').add(newConversation);
        return { id: docRef.id, ...newConversation };
    },

    /**
     * Send a message in a conversation
     * @param {string} conversationId - The conversation ID
     * @param {string} text - Message text
     * @param {string} recipientId - The recipient's user ID
     */
    async sendMessage(conversationId, text, recipientId) {
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) throw new Error('Not authenticated');

        const message = {
            senderId: currentUser.uid,
            text: text.trim(),
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'sent'
        };

        // Add message to subcollection
        await db.collection('conversations').doc(conversationId)
            .collection('messages').add(message);

        // Update conversation metadata
        await db.collection('conversations').doc(conversationId).update({
            lastMessage: text.trim().substring(0, 50),
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
            [`unreadCount.${recipientId}`]: firebase.firestore.FieldValue.increment(1)
        });
    },

    /**
     * Subscribe to real-time updates for user's conversations
     * @param {function} callback - Called with array of conversations
     * @returns {function} - Unsubscribe function
     */
    subscribeToConversations(callback) {
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) return () => { };

        return db.collection('conversations')
            .where('participants', 'array-contains', currentUser.uid)
            .orderBy('lastMessageTime', 'desc')
            .onSnapshot(snapshot => {
                const conversations = [];
                snapshot.forEach(doc => {
                    conversations.push({ id: doc.id, ...doc.data() });
                });
                callback(conversations);
            }, error => {
                console.error('Error subscribing to conversations:', error);
            });
    },

    /**
     * Subscribe to real-time messages in a conversation
     * @param {string} conversationId - The conversation ID
     * @param {function} callback - Called with array of messages
     * @returns {function} - Unsubscribe function
     */
    subscribeToMessages(conversationId, callback) {
        return db.collection('conversations').doc(conversationId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot(snapshot => {
                const messages = [];
                snapshot.forEach(doc => {
                    messages.push({ id: doc.id, ...doc.data() });
                });
                callback(messages);
            }, error => {
                console.error('Error subscribing to messages:', error);
            });
    },

    /**
     * Mark a conversation as read
     * @param {string} conversationId - The conversation ID
     */
    async markAsRead(conversationId) {
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) return;

        try {
            // Reset unread count for current user
            await db.collection('conversations').doc(conversationId).update({
                [`unreadCount.${currentUser.uid}`]: 0
            });

            // Mark messages as read
            const messagesRef = db.collection('conversations').doc(conversationId).collection('messages');
            const unreadMessages = await messagesRef
                .where('senderId', '!=', currentUser.uid)
                .where('status', '==', 'sent')
                .get();

            const batch = db.batch();
            unreadMessages.forEach(doc => {
                batch.update(doc.ref, { status: 'read' });
            });
            await batch.commit();
        } catch (error) {
            console.error('Error marking as read:', error);
        }
    },

    /**
     * Get the other participant's info from a conversation
     * @param {object} conversation - The conversation object
     * @returns {object} - Other participant info {id, displayName, photoURL}
     */
    getOtherParticipant(conversation) {
        const currentUser = firebase.auth().currentUser;
        if (!currentUser || !conversation.participants) return null;

        const otherId = conversation.participants.find(id => id !== currentUser.uid);
        if (!otherId) return null;

        const info = conversation.participantInfo?.[otherId] || {};
        return {
            id: otherId,
            displayName: info.displayName || 'Usuario',
            photoURL: info.photoURL || ''
        };
    },

    /**
     * Get total unread count across all conversations
     * @returns {Promise<number>} - Total unread messages
     */
    async getTotalUnreadCount() {
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) return 0;

        const snapshot = await db.collection('conversations')
            .where('participants', 'array-contains', currentUser.uid)
            .get();

        let total = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            total += data.unreadCount?.[currentUser.uid] || 0;
        });
        return total;
    },

    /**
     * Delete a conversation and all its messages
     * @param {string} conversationId - The conversation ID
     * @returns {Promise<boolean>} - True if successful
     */
    async deleteConversation(conversationId) {
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) return false;

        try {
            // First delete all messages in the subcollection
            const messagesRef = db.collection('conversations').doc(conversationId).collection('messages');
            const messagesSnapshot = await messagesRef.get();

            const batch = db.batch();
            messagesSnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });

            // Delete the conversation document
            batch.delete(db.collection('conversations').doc(conversationId));

            await batch.commit();
            showToast('Conversación eliminada', 'success');
            return true;
        } catch (error) {
            console.error('Error deleting conversation:', error);
            showToast('Error al eliminar la conversación', 'error');
            return false;
        }
    }
};

// Export for global access
window.openChatWithConversation = async function (otherUserId, otherUserInfo) {
    try {
        const conversation = await window.MessagingService.getOrCreateConversation(otherUserId, otherUserInfo);

        const chatData = {
            id: conversation.id,
            sender: otherUserInfo.displayName || 'Usuario',
            avatar: otherUserInfo.photoURL || 'https://ui-avatars.com/api/?name=U&background=e5e7eb&color=6b7280&size=40',
            recipientId: otherUserId,
            isRealConversation: true
        };

        if (window.openChatWithUser) {
            window.openChatWithUser(chatData);
        }
    } catch (error) {
        console.error('Error opening chat:', error);
        showToast('Error al abrir el chat', 'error');
    }
};
