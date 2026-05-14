// Admin Users Management
// Handles adding/removing authorized photo uploaders

let currentUser = null;

// Listen for auth state changes
auth.onAuthStateChanged(async (user) => {
    currentUser = user;

    if (!user) {
        // Redirect to login if not authenticated
        window.location.href = 'index.html';
        return;
    }

    // Check if user is admin
    const isAdmin = await checkAdminStatus();
    if (!isAdmin) {
        alert('No tienes permisos de administrador para acceder a esta página.');
        window.location.href = 'index.html';
        return;
    }

    // Load users list
    loadUsers();
});

/**
 * Check if current user is admin
 */
async function checkAdminStatus() {
    try {
        const adminDoc = await db.collection('admins').doc(currentUser.uid).get();
        return adminDoc.exists && adminDoc.data().role === 'admin';
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
}

/**
 * Load and display authorized users
 */
async function loadUsers() {
    const usersList = document.getElementById('usersList');

    try {
        const snapshot = await db.collection('admins').get();

        if (snapshot.empty) {
            usersList.innerHTML = `
                <div class="empty-state">
                    <p>No hay usuarios autorizados aún</p>
                    <p style="font-size: 12px; margin-top: 8px;">Agrega el primer usuario usando el formulario arriba</p>
                </div>
            `;
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const uid = doc.id;

            // Determine role label
            const roleClass = data.role === 'admin' ? 'admin' : 'uploader';
            const roleLabel = data.role === 'admin' ? '🔑 Admin' : '📸 Subir Fotos';

            html += `
                <div class="user-card">
                    <div class="user-info">
                        <div class="user-email">${data.email || 'Email no disponible'}</div>
                        <span class="user-role ${roleClass}">${roleLabel}</span>
                        ${data.name ? `<span class="user-role">${data.name}</span>` : ''}
                        <div class="user-uid">UID: ${uid}</div>
                    </div>
                    <button 
                        class="btn btn-danger" 
                        onclick="removeUser('${uid}', '${data.email || uid}')"
                        ${uid === currentUser.uid ? 'disabled title="No puedes eliminarte a ti mismo"' : ''}
                    >
                        Eliminar
                    </button>
                </div>
            `;
        });

        usersList.innerHTML = html;

    } catch (error) {
        console.error('Error loading users:', error);
        usersList.innerHTML = `
            <div class="empty-state" style="color: #ff4757;">
                <p>Error al cargar usuarios</p>
                <p style="font-size: 12px;">${error.message}</p>
            </div>
        `;
    }
}

/**
 * Add new user to authorized list
 */
async function addUser() {
    const emailInput = document.getElementById('userEmail');
    const roleSelect = document.getElementById('userRole');

    const email = emailInput.value.trim();
    const role = roleSelect.value;

    if (!email) {
        alert('Por favor, ingresa un correo electrónico');
        return;
    }

    if (!email.includes('@')) {
        alert('Por favor, ingresa un correo válido');
        return;
    }

    try {
        // Get user by email from auth users
        // Note: This requires the user to have logged in at least once
        // We'll search in Firestore for users collection (if it exists)
        // Otherwise, we'll need to add by UID

        // For now, we'll create a simple prompt-based UID entry
        const uid = prompt(
            `Para agregar al usuario ${email}, necesitas su UID de Firebase.\n\n` +
            `El usuario debe iniciar sesión al menos una vez en la app.\n` +
            `Luego, desde la consola de Firebase Auth, copia su UID y pégalo aquí:`
        );

        if (!uid || uid.trim() === '') {
            alert('Se canceló la operación');
            return;
        }

        // Add to admins collection
        await db.collection('admins').doc(uid.trim()).set({
            email: email,
            role: role,
            addedBy: currentUser.uid,
            addedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert(`✅ Usuario ${email} agregado exitosamente`);

        // Clear inputs
        emailInput.value = '';
        roleSelect.value = 'photo_uploader';

        // Reload users list
        loadUsers();

    } catch (error) {
        console.error('Error adding user:', error);
        alert(`Error al agregar usuario: ${error.message}`);
    }
}

/**
 * Remove user from authorized list
 */
async function removeUser(uid, email) {
    const confirmed = confirm(
        `¿Estás seguro de que quieres eliminar a ${email}?\n\n` +
        `Esta persona ya no podrá subir fotos a las vías.`
    );

    if (!confirmed) return;

    try {
        await db.collection('admins').doc(uid).delete();
        alert(`✅ Usuario ${email} eliminado exitosamente`);

        // Reload users list
        loadUsers();

    } catch (error) {
        console.error('Error removing user:', error);
        alert(`Error al eliminar usuario: ${error.message}`);
    }
}

// Helper function to show toast messages
function showToast(message, type = 'info') {
    alert(message); // Simple alert for now
    // You can integrate with the main app's toast system if available
}
