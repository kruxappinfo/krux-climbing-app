// Authentication Module
// Handles user authentication with Google Sign-In

// Detectar si estamos en Capacitor/app nativa
const isCapacitor = window.Capacitor !== undefined;

// Importar el plugin de Google Auth si estamos en Capacitor
let GoogleAuth = null;
if (isCapacitor && window.Capacitor.Plugins) {
    GoogleAuth = window.Capacitor.Plugins.GoogleAuth;
    // Inicializar el plugin
    if (GoogleAuth && GoogleAuth.initialize) {
        GoogleAuth.initialize({
            clientId: '627029956398-56bejmgdu7vacv4foaqop0n2ogvgjbm7.apps.googleusercontent.com',
            scopes: ['profile', 'email'],
            grantOfflineAccess: true,
        });
    }
}

// Current user state
let currentUser = null;

// Auth state observer - inicializado de forma segura para Capacitor
function initAuthStateObserver() {
    try {
        auth.onAuthStateChanged((user) => {
            currentUser = user;
            updateAuthUI(user);

            if (user) {
                // User signed in - Create/update user document in Firestore
                createUserDocument(user);

                // Load user favorites
                if (typeof loadUserFavorites === 'function') {
                    loadUserFavorites();
                }

                // Load user projects
                if (typeof loadUserProjects === 'function') {
                    loadUserProjects();
                }

                // Reload feed to show followed users' posts
                if (typeof loadFeed === 'function') {
                    loadFeed();
                }

                // Check admin status and show admin menu if applicable
                checkAndShowAdminMenu();
            } else {
                // User signed out - Hide admin menu
                const adminMenuItem = document.getElementById('admin-users-menu-item');
                if (adminMenuItem) {
                    adminMenuItem.classList.add('hidden');
                }
            }
        });
    } catch (error) {
        console.error('Error inicializando auth observer:', error);
        // En caso de error, mostrar landing page (solo en web)
        if (!isCapacitor) {
            const landingPage = document.getElementById('landing-page');
            if (landingPage) landingPage.classList.remove('hidden');
        }
    }
}

// Inicializar el observer cuando el documento esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthStateObserver);
} else {
    // Pequeño delay para asegurar que Firebase Auth está completamente inicializado
    setTimeout(initAuthStateObserver, 100);
}

// Login Modal Elements (initialized lazily or in DOMContentLoaded)
let loginModal, closeLoginModalBtn, btnLoginNative, nativeLoginForm,
    btnLoginGoogle, btnLoginFacebook, btnLoginApple, nativeEmailInput, nativePasswordInput,
    btnSubmitNative, toggleRegisterBtn;

let isRegisterMode = false;

function initLoginElements() {
    // loginModal is now the landing page container
    loginModal = document.getElementById('landing-page');
    // No close button in landing page

    // btnLoginNative removed in new design, form is always visible
    nativeLoginForm = document.getElementById('native-login-form');
    btnLoginGoogle = document.getElementById('btn-login-google');
    btnLoginFacebook = document.getElementById('btn-login-facebook');
    btnLoginApple = document.getElementById('btn-login-apple');
    nativeEmailInput = document.getElementById('native-email');
    nativePasswordInput = document.getElementById('native-password');
    btnSubmitNative = document.getElementById('btn-submit-native');
    toggleRegisterBtn = document.getElementById('toggle-register');

    setupLoginEventListeners();
}

function setupLoginEventListeners() {
    // No close button listener needed

    // Toggle Register/Login Mode
    if (toggleRegisterBtn) {
        toggleRegisterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            isRegisterMode = !isRegisterMode;
            updateRegisterToggleText();
        });
    }

    // Submit Native Login/Register
    if (btnSubmitNative) {
        btnSubmitNative.addEventListener('click', () => {
            const email = nativeEmailInput.value;
            const password = nativePasswordInput.value;

            if (!email || !password) {
                showToast('Por favor introduce email y contraseña', 'error');
                return;
            }

            if (isRegisterMode) {
                signUpWithEmail(email, password);
            } else {
                signInWithEmail(email, password);
            }
        });
    }

    // Google Sign-In inside Modal
    if (btnLoginGoogle) {
        btnLoginGoogle.addEventListener('click', async () => {
            try {
                if (isCapacitor && GoogleAuth) {
                    // En Capacitor usamos el plugin nativo
                    console.log('Usando Google Auth nativo de Capacitor');
                    const googleUser = await GoogleAuth.signIn();
                    console.log('Google user:', googleUser);

                    // Crear credencial de Firebase con el ID token
                    const credential = firebase.auth.GoogleAuthProvider.credential(googleUser.authentication.idToken);

                    // Autenticar con Firebase
                    const result = await auth.signInWithCredential(credential);
                    closeLoginModal();
                    showToast('Sesión iniciada con Google', 'success');
                } else {
                    // En web usamos popup
                    const result = await auth.signInWithPopup(googleProvider);
                    closeLoginModal();
                    showToast('Sesión iniciada con Google', 'success');
                }
            } catch (error) {
                console.error('Sign-in error:', error);
                showToast('Error: ' + error.message, 'error');
            }
        });
    }

    // Facebook Sign-In inside Modal
    if (btnLoginFacebook) {
        btnLoginFacebook.addEventListener('click', async () => {
            try {
                // Disable button during authentication
                btnLoginFacebook.disabled = true;
                const originalText = btnLoginFacebook.querySelector('span')?.textContent || 'Continuar con Facebook';
                if (btnLoginFacebook.querySelector('span')) {
                    btnLoginFacebook.querySelector('span').textContent = 'Conectando...';
                }

                if (isCapacitor) {
                    // Facebook en Capacitor - deshabilitado por ahora
                    showToast('Inicio de sesión con Facebook no disponible en la app. Usa Google o Email.', 'info');
                    btnLoginFacebook.disabled = false;
                    if (btnLoginFacebook.querySelector('span')) {
                        btnLoginFacebook.querySelector('span').textContent = 'Continuar con Facebook';
                    }
                    return;
                } else {
                    // En web usamos popup
                    const result = await auth.signInWithPopup(facebookProvider);

                    // Success
                    closeLoginModal();
                    showToast('Sesión iniciada con Facebook', 'success');
                }
            } catch (error) {
                console.error('Facebook Sign-in error:', error);

                // Re-enable button
                btnLoginFacebook.disabled = false;
                if (btnLoginFacebook.querySelector('span')) {
                    btnLoginFacebook.querySelector('span').textContent = 'Continuar con Facebook';
                }

                // Handle specific error cases
                let errorMessage = 'Error al iniciar sesión con Facebook';

                switch (error.code) {
                    case 'auth/account-exists-with-different-credential':
                        errorMessage = 'Ya existe una cuenta con este email. Usa Google o Email.';
                        showToast(errorMessage, 'info');
                        break;
                    case 'auth/popup-closed-by-user':
                        errorMessage = 'Inicio de sesión cancelado';
                        showToast(errorMessage, 'info');
                        break;
                    case 'auth/popup-blocked':
                        errorMessage = 'El popup fue bloqueado. Por favor, permite popups para este sitio.';
                        showToast(errorMessage, 'error');
                        break;
                    case 'auth/unauthorized-domain':
                        errorMessage = 'Dominio no autorizado. Contacta al administrador.';
                        showToast(errorMessage, 'error');
                        break;
                    case 'auth/operation-not-allowed':
                        errorMessage = 'El inicio de sesión con Facebook no está habilitado. Contacta al administrador.';
                        showToast(errorMessage, 'error');
                        break;
                    default:
                        errorMessage = error.message || 'Error desconocido';
                        showToast('Error Facebook: ' + errorMessage, 'error');
                }
            }
        });
    }

    // Apple Sign-In (Visual only for now)
    if (btnLoginApple) {
        btnLoginApple.addEventListener('click', () => {
            showToast('Inicio de sesión con Apple próximamente', 'info');
        });
    }
}

// Open Login Modal
function openLoginModal() {
    if (!loginModal) loginModal = document.getElementById('login-modal');
    if (loginModal) loginModal.classList.remove('hidden');
}

// Close Login Modal (Used when login succeeds)
function closeLoginModal() {
    if (!loginModal) loginModal = document.getElementById('landing-page');
    if (loginModal) loginModal.classList.add('hidden');
    // Reset form state
    isRegisterMode = false;
    updateRegisterToggleText();
}

// Toggle Register/Login Mode Helper
function updateRegisterToggleText() {
    if (!toggleRegisterBtn || !btnSubmitNative) return;
    const modalTitle = document.querySelector('.modal-header-modern h3');

    if (isRegisterMode) {
        btnSubmitNative.textContent = 'Registrarse';
        toggleRegisterBtn.innerHTML = '¿Ya tienes cuenta? <b>Inicia sesión</b>';
        if (modalTitle) modalTitle.textContent = 'Crear cuenta';
    } else {
        btnSubmitNative.textContent = 'Iniciar sesión';
        toggleRegisterBtn.innerHTML = 'Créate una cuenta nueva';
        if (modalTitle) modalTitle.textContent = 'Iniciar sesión';
    }
}

// Email/Password Sign-In
function signInWithEmail(email, password) {
    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            closeLoginModal();
            showToast('Sesión iniciada', 'success');
        })
        .catch((error) => {
            console.error('Email Sign-in error:', error);
            showToast('Error: ' + error.message, 'error');
        });
}

// Email/Password Sign-Up
function signUpWithEmail(email, password) {
    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            closeLoginModal();
            showToast('Cuenta creada exitosamente', 'success');
        })
        .catch((error) => {
            console.error('Registration error:', error);
            showToast('Error registro: ' + error.message, 'error');
        });
}

// Legacy function kept for compatibility if called elsewhere, but redirected to modal
function signInWithGoogle() {
    openLoginModal();
}

// Sign out
function signOut() {
    auth.signOut()
        .then(() => {
            // Signed out successfully
        })
        .catch((error) => {
            console.error('Sign-out error:', error);
        });
}

// Update UI based on auth state
function updateAuthUI(user) {
    const landingPage = document.getElementById('landing-page');
    const userProfileWrapper = document.getElementById('user-profile-wrapper');
    const userPhoto = document.getElementById('user-photo');
    const userPhotoDropdown = document.getElementById('user-photo-dropdown');
    const userName = document.getElementById('user-name');

    // Elements to hide/show when logged in/out
    // Assuming map container or main app wrapper needs to be hidden/shown?
    // For now, we just overlay the landing page, so map can stay underneath or be hidden.
    // Hiding map might save resources.
    const mapContainer = document.getElementById('map');
    const bottomNav = document.querySelector('.bottom-nav');

    // Check if elements exist
    if (!landingPage) {
        return;
    }

    if (user) {
        // Logged In
        landingPage.classList.add('hidden');
        if (userProfileWrapper) userProfileWrapper.classList.remove('hidden');

        // Update User Profile Info
        const photoUrl = user.photoURL;
        const userPhotoIcon = document.getElementById('user-photo-icon');

        const userName = user.displayName || user.email || 'Usuario';
        const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=6366f1&color=fff&size=200`;

        if (photoUrl) {
            if (userPhoto) {
                userPhoto.src = photoUrl;
                userPhoto.classList.remove('hidden');
                userPhoto.onerror = function () {
                    this.src = fallbackAvatar;
                    this.onerror = null;
                };
            }
            if (userPhotoDropdown) {
                userPhotoDropdown.src = photoUrl;
                userPhotoDropdown.onerror = function () {
                    this.src = fallbackAvatar;
                    this.onerror = null;
                };
            }

            // Hide fallback icon when photo is available
            if (userPhotoIcon) userPhotoIcon.style.display = 'none';
        } else {
            // No photo - show icon, hide photo
            if (userPhoto) {
                userPhoto.classList.add('hidden');
            }
            if (userPhotoIcon) userPhotoIcon.style.display = 'flex';
            if (userPhotoDropdown) {
                userPhotoDropdown.src = fallbackAvatar;
                userPhotoDropdown.onerror = null;
            }
        }

        if (userName) userName.textContent = user.displayName || user.email;

        // Show navigation
        if (bottomNav) bottomNav.style.display = 'flex';

    } else {
        // Logged Out
        // Solo mostrar landing-page en web, no en app nativa (que usa mobile-auth)
        if (!isCapacitor) {
            landingPage.classList.remove('hidden');
        }
        if (userProfileWrapper) userProfileWrapper.classList.add('hidden');

        // Hide navigation
        if (bottomNav) bottomNav.style.display = 'none';
    }
}

// Create or update user document
async function createUserDocument(user) {
    try {
        const userRef = db.collection('users').doc(user.uid);
        const doc = await userRef.get();

        if (!doc.exists) {
            // Create new user document
            await userRef.set({
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                favorites: [],
                stats: {
                    totalAscents: 0,
                    favoriteSchools: 0
                }
            });
        } else {
            // Update user info
            await userRef.update({
                displayName: user.displayName,
                photoURL: user.photoURL,
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (error) {
        console.error('Error creating/updating user document:', error);
    }
}

// Check if user is admin and show admin menu
async function checkAndShowAdminMenu() {
    if (!currentUser) return;

    try {
        const adminDoc = await db.collection('admins').doc(currentUser.uid).get();
        const adminMenuItem = document.getElementById('admin-users-menu-item');

        if (adminDoc.exists && adminDoc.data().role === 'admin') {
            // User is admin - show menu item
            if (adminMenuItem) {
                adminMenuItem.classList.remove('hidden');
            }
        } else {
            // User is not admin - hide menu item
            if (adminMenuItem) {
                adminMenuItem.classList.add('hidden');
            }
        }
    } catch (error) {
        console.error('Error checking admin status:', error);
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize modal elements
    initLoginElements();

    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userPhoto = document.getElementById('user-photo');
    const userDropdown = document.getElementById('user-dropdown');

    // Update UI with current user (if already signed in)
    if (currentUser) {
        updateAuthUI(currentUser);
    }

    if (loginBtn) {
        loginBtn.addEventListener('click', signInWithGoogle);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', signOut);
    }

    // Toggle dropdown when clicking profile button
    const userPhotoBtnWrapper = document.getElementById('user-photo-btn-wrapper');
    if (userPhotoBtnWrapper) {
        userPhotoBtnWrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            if (userDropdown) {
                userDropdown.classList.toggle('hidden');
            }
        });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (userDropdown && !userDropdown.classList.contains('hidden')) {
            if (!e.target.closest('#user-profile-wrapper')) {
                userDropdown.classList.add('hidden');
            }
        }
    });

    // Admin users button
    const adminUsersBtn = document.getElementById('admin-users-btn');
    if (adminUsersBtn) {
        adminUsersBtn.addEventListener('click', () => {
            window.location.href = 'admin-users.html';
        });
    }
});
