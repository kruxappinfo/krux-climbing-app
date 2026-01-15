/**
 * MOBILE AUTH - Onboarding y Login para la app móvil
 * Este archivo solo se ejecuta en la app nativa (iOS/Android)
 */

(function () {
  'use strict';

  // Esperar a que kruxPlatform esté disponible (puede tardar un momento)
  function checkPlatform() {
    if (!window.kruxPlatform) {
      console.log('[MobileAuth] Esperando kruxPlatform...');
      setTimeout(checkPlatform, 100);
      return;
    }

    if (!window.kruxPlatform.isNative) {
      console.log('[MobileAuth] No es app nativa, saltando...');
      return;
    }

    console.log('[MobileAuth] Inicializando sistema de autenticación móvil...');
    startMobileAuth();
  }

  function startMobileAuth() {

    // ========================================
    // VARIABLES
    // ========================================

    let currentSlide = 0;
    const totalSlides = 3;
    let autoSlideInterval = null;
    let touchStartX = 0;
    let touchEndX = 0;

    // ========================================
    // ELEMENTOS DOM (se inicializarán en init())
    // ========================================

    let onboarding;
    let loginModal;
    let signupModal;
    let slides;
    let dots;
    let bgImages;

    // Buttons
    let signupBtn;
    let loginBtn;
    let loginCloseBtn;
    let signupCloseBtn;
    let loginOverlay;
    let signupOverlay;

    // Login form elements
    let mobileLoginForm;
    let mobileGoogleBtn;
    let mobileAppleBtn;
    let mobileFacebookBtn;
    let mobileGotoSignup;

    // Signup form elements
    let mobileSignupForm;
    let mobileSignupGoogleBtn;
    let mobileSignupAppleBtn;
    let mobileSignupFacebookBtn;
    let mobileGotoLogin;

    // ========================================
    // FUNCIONES DE ONBOARDING
    // ========================================

    function showOnboarding() {
      if (!onboarding) {
        console.warn('[MobileAuth] Elemento onboarding no encontrado');
        // Si no hay onboarding, mostrar directamente el login
        showLoginModal();
        return;
      }

      console.log('[MobileAuth] Mostrando onboarding...');
      onboarding.classList.remove('hidden');
      startAutoSlide();
    }

    function hideOnboarding() {
      if (!onboarding) return;
      onboarding.classList.add('hidden');
      stopAutoSlide();
    }

    function goToSlide(index) {
      if (index < 0) index = totalSlides - 1;
      if (index >= totalSlides) index = 0;

      // Update slides
      slides.forEach((slide, i) => {
        slide.classList.remove('active', 'prev');
        if (i === index) {
          slide.classList.add('active');
        } else if (i < index) {
          slide.classList.add('prev');
        }
      });

      // Update dots
      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
      });

      // Update background images
      bgImages.forEach((img, i) => {
        img.classList.toggle('active', i === index);
      });

      currentSlide = index;
    }

    function nextSlide() {
      goToSlide(currentSlide + 1);
    }

    function prevSlide() {
      goToSlide(currentSlide - 1);
    }

    function startAutoSlide() {
      stopAutoSlide();
      autoSlideInterval = setInterval(nextSlide, 5000);
    }

    function stopAutoSlide() {
      if (autoSlideInterval) {
        clearInterval(autoSlideInterval);
        autoSlideInterval = null;
      }
    }

    // ========================================
    // FUNCIONES DE LOGIN MODAL
    // ========================================

    function showLoginModal() {
      if (!loginModal) {
        console.warn('[MobileAuth] Elemento loginModal no encontrado');
        return;
      }
      console.log('[MobileAuth] Mostrando modal de login...');
      loginModal.style.pointerEvents = '';
      loginModal.classList.remove('hidden');
      // Mantener el onboarding visible detrás del modal
      if (onboarding) {
        onboarding.classList.remove('hidden');
      }
    }

    function hideLoginModal() {
      if (!loginModal) return;
      // Primero desactivar eventos y ocultar
      loginModal.style.pointerEvents = 'none';
      loginModal.classList.add('hidden');
      // Limpiar estilos DESPUÉS de ocultar (en el siguiente frame)
      requestAnimationFrame(() => {
        const sheet = loginModal.querySelector('.mobile-login-sheet');
        const overlay = loginModal.querySelector('.mobile-login-overlay');
        if (sheet) {
          sheet.style.transform = '';
          sheet.style.transition = '';
        }
        if (overlay) {
          overlay.style.opacity = '';
          overlay.style.transition = '';
        }
      });
    }

    function showSignupModal() {
      if (!signupModal) {
        console.warn('[MobileAuth] Elemento signupModal no encontrado');
        return;
      }
      console.log('[MobileAuth] Mostrando modal de registro...');
      hideLoginModal();
      signupModal.style.pointerEvents = '';
      signupModal.classList.remove('hidden');
      // Mantener el onboarding visible detrás del modal
      if (onboarding) {
        onboarding.classList.remove('hidden');
      }
    }

    function hideSignupModal() {
      if (!signupModal) return;
      // Primero desactivar eventos y ocultar
      signupModal.style.pointerEvents = 'none';
      signupModal.classList.add('hidden');
      // Limpiar estilos DESPUÉS de ocultar (en el siguiente frame)
      requestAnimationFrame(() => {
        const sheet = signupModal.querySelector('.mobile-login-sheet');
        const overlay = signupModal.querySelector('.mobile-login-overlay');
        if (sheet) {
          sheet.style.transform = '';
          sheet.style.transition = '';
        }
        if (overlay) {
          overlay.style.opacity = '';
          overlay.style.transition = '';
        }
      });
    }

    // ========================================
    // AUTENTICACIÓN
    // ========================================

    async function handleGoogleLogin() {
      console.log('[MobileAuth] Iniciando login con Google...');

      try {
        // Usar el plugin nativo de Google Auth si está disponible
        if (window.GoogleAuth) {
          const result = await window.GoogleAuth.signIn();
          console.log('[MobileAuth] Google Auth result:', result);

          // Autenticar con Firebase usando el token de Google
          if (result && result.authentication && result.authentication.idToken) {
            const credential = firebase.auth.GoogleAuthProvider.credential(result.authentication.idToken);
            await firebase.auth().signInWithCredential(credential);
            onLoginSuccess();
          }
        } else {
          // Fallback a Firebase Auth popup/redirect
          const provider = new firebase.auth.GoogleAuthProvider();
          await firebase.auth().signInWithPopup(provider);
          onLoginSuccess();
        }
      } catch (error) {
        console.error('[MobileAuth] Error en Google login:', error);
        showError('Error al iniciar sesión con Google');
      }
    }

    async function handleAppleLogin() {
      console.log('[MobileAuth] Iniciando login con Apple...');

      try {
        const provider = new firebase.auth.OAuthProvider('apple.com');
        provider.addScope('email');
        provider.addScope('name');

        await firebase.auth().signInWithPopup(provider);
        onLoginSuccess();
      } catch (error) {
        console.error('[MobileAuth] Error en Apple login:', error);
        showError('Error al iniciar sesión con Apple');
      }
    }

    async function handleFacebookLogin() {
      console.log('[MobileAuth] Iniciando login con Facebook...');

      try {
        const provider = new firebase.auth.FacebookAuthProvider();
        await firebase.auth().signInWithPopup(provider);
        onLoginSuccess();
      } catch (error) {
        console.error('[MobileAuth] Error en Facebook login:', error);
        showError('Error al iniciar sesión con Facebook');
      }
    }

    async function handleEmailLogin(email, password) {
      console.log('[MobileAuth] Iniciando login con email...');

      try {
        await firebase.auth().signInWithEmailAndPassword(email, password);
        onLoginSuccess();
      } catch (error) {
        console.error('[MobileAuth] Error en email login:', error);

        let message = 'Error al iniciar sesión';
        if (error.code === 'auth/user-not-found') {
          message = 'Usuario no encontrado';
        } else if (error.code === 'auth/wrong-password') {
          message = 'Contraseña incorrecta';
        } else if (error.code === 'auth/invalid-email') {
          message = 'Email inválido';
        }

        showError(message);
      }
    }

    async function handleEmailSignup(name, email, password) {
      console.log('[MobileAuth] Iniciando registro con email...');

      try {
        // Crear usuario con email y contraseña
        const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);

        // Actualizar perfil con el nombre
        await userCredential.user.updateProfile({
          displayName: name
        });

        onSignupSuccess();
      } catch (error) {
        console.error('[MobileAuth] Error en email signup:', error);

        let message = 'Error al crear la cuenta';
        if (error.code === 'auth/email-already-in-use') {
          message = 'Este email ya está registrado';
        } else if (error.code === 'auth/invalid-email') {
          message = 'Email inválido';
        } else if (error.code === 'auth/weak-password') {
          message = 'La contraseña es muy débil';
        }

        showError(message);
      }
    }

    function onLoginSuccess() {
      console.log('[MobileAuth] Login exitoso!');
      hideOnboarding();
      hideLoginModal();
      hideSignupModal();

      // Haptic feedback
      if (window.kruxHaptics) {
        window.kruxHaptics.notification('Success');
      }
    }

    function onSignupSuccess() {
      console.log('[MobileAuth] Registro exitoso!');
      hideOnboarding();
      hideLoginModal();
      hideSignupModal();

      // Haptic feedback
      if (window.kruxHaptics) {
        window.kruxHaptics.notification('Success');
      }
    }

    function showError(message) {
      // Usar el sistema de toast si existe
      if (typeof showToast === 'function') {
        showToast(message, 'error');
      } else {
        alert(message);
      }
    }

    // ========================================
    // EVENT LISTENERS
    // ========================================

    function setupEventListeners() {
      // Dots click
      dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
          stopAutoSlide();
          goToSlide(index);
          startAutoSlide();
        });
      });

      // Swipe gestures on onboarding
      if (onboarding) {
        onboarding.addEventListener('touchstart', (e) => {
          touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        onboarding.addEventListener('touchend', (e) => {
          touchEndX = e.changedTouches[0].screenX;
          handleSwipe();
        }, { passive: true });
      }

      // Signup button -> show signup modal
      if (signupBtn) {
        signupBtn.addEventListener('click', () => {
          hideOnboarding();
          showSignupModal();
        });
      }

      // Login button -> show login modal
      if (loginBtn) {
        loginBtn.addEventListener('click', () => {
          hideOnboarding();
          showLoginModal();
        });
      }

      // Función helper para cerrar modal y volver al onboarding
      function dismissModalAndShowOnboarding(hideModalFn) {
        hideModalFn();
        // Pequeño delay para asegurar que el modal esté completamente oculto
        // antes de que el onboarding sea interactivo
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            showOnboarding();
          });
        });
      }

      // Close buttons
      if (loginCloseBtn) {
        loginCloseBtn.addEventListener('click', () => {
          dismissModalAndShowOnboarding(hideLoginModal);
        });
      }

      if (signupCloseBtn) {
        signupCloseBtn.addEventListener('click', () => {
          dismissModalAndShowOnboarding(hideSignupModal);
        });
      }

      // Overlay click to dismiss
      if (loginOverlay) {
        loginOverlay.addEventListener('click', () => {
          dismissModalAndShowOnboarding(hideLoginModal);
        });
      }

      if (signupOverlay) {
        signupOverlay.addEventListener('click', () => {
          dismissModalAndShowOnboarding(hideSignupModal);
        });
      }

      // Social login buttons
      if (mobileGoogleBtn) {
        mobileGoogleBtn.addEventListener('click', handleGoogleLogin);
      }

      if (mobileAppleBtn) {
        mobileAppleBtn.addEventListener('click', handleAppleLogin);
      }

      if (mobileFacebookBtn) {
        mobileFacebookBtn.addEventListener('click', handleFacebookLogin);
      }

      // Social signup buttons (usan las mismas funciones de login)
      if (mobileSignupGoogleBtn) {
        mobileSignupGoogleBtn.addEventListener('click', handleGoogleLogin);
      }

      if (mobileSignupAppleBtn) {
        mobileSignupAppleBtn.addEventListener('click', handleAppleLogin);
      }

      if (mobileSignupFacebookBtn) {
        mobileSignupFacebookBtn.addEventListener('click', handleFacebookLogin);
      }

      // Email login form
      if (mobileLoginForm) {
        mobileLoginForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const email = document.getElementById('mobile-email').value;
          const password = document.getElementById('mobile-password').value;
          handleEmailLogin(email, password);
        });
      }

      // Email signup form
      if (mobileSignupForm) {
        mobileSignupForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const name = document.getElementById('mobile-signup-name').value;
          const email = document.getElementById('mobile-signup-email').value;
          const password = document.getElementById('mobile-signup-password').value;
          handleEmailSignup(name, email, password);
        });
      }

      // Go to signup from login
      if (mobileGotoSignup) {
        mobileGotoSignup.addEventListener('click', () => {
          hideLoginModal();
          showSignupModal();
        });
      }

      // Go to login from signup
      if (mobileGotoLogin) {
        mobileGotoLogin.addEventListener('click', () => {
          hideSignupModal();
          showLoginModal();
        });
      }

      // Setup drag to dismiss for modals
      setupDragToDismiss(loginModal, () => {
        dismissModalAndShowOnboarding(hideLoginModal);
      });
      setupDragToDismiss(signupModal, () => {
        dismissModalAndShowOnboarding(hideSignupModal);
      });
    }

    // ========================================
    // DRAG TO DISMISS
    // ========================================

    function setupDragToDismiss(modal, onDismiss) {
      if (!modal) return;

      const sheet = modal.querySelector('.mobile-login-sheet');
      const handle = modal.querySelector('.mobile-login-handle');
      if (!sheet) return;

      let startY = 0;
      let currentY = 0;
      let isDragging = false;

      // Solo iniciar drag desde el handle o la parte superior del sheet
      const dragZone = handle || sheet;

      dragZone.addEventListener('touchstart', (e) => {
        // No iniciar drag si se toca un elemento interactivo
        const target = e.target;
        if (target.closest('button, input, textarea, a, .mobile-social-btn, .mobile-submit-btn')) {
          return;
        }

        startY = e.touches[0].clientY;
        currentY = startY;
        isDragging = true;
      }, { passive: true });

      // Escuchar touchmove en el sheet completo para seguir el drag
      sheet.addEventListener('touchmove', (e) => {
        if (!isDragging) return;

        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;

        // Solo permitir arrastrar hacia abajo, sin bounce hacia arriba
        if (deltaY > 0) {
          sheet.style.transition = 'none';
          sheet.style.transform = `translateY(${deltaY}px)`;
          // Ajustar opacidad del overlay
          const overlay = modal.querySelector('.mobile-login-overlay');
          if (overlay) {
            overlay.style.transition = 'none';
            overlay.style.opacity = Math.max(0, 1 - (deltaY / 300));
          }
        }
      }, { passive: true });

      sheet.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;

        const deltaY = currentY - startY;
        const threshold = 100; // pixels para cerrar

        const overlay = modal.querySelector('.mobile-login-overlay');

        if (deltaY > threshold) {
          // Cerrar el modal con animación suave
          sheet.style.transition = 'transform 0.25s ease-out';
          sheet.style.transform = 'translateY(100%)';
          if (overlay) {
            overlay.style.transition = 'opacity 0.25s ease-out';
            overlay.style.opacity = '0';
          }
          setTimeout(() => {
            onDismiss();
          }, 250);
        } else if (deltaY > 0) {
          // Volver a la posición original sin bounce
          sheet.style.transition = 'transform 0.2s ease-out';
          sheet.style.transform = 'translateY(0)';
          if (overlay) {
            overlay.style.transition = 'opacity 0.2s ease-out';
            overlay.style.opacity = '1';
          }
        }

        startY = 0;
        currentY = 0;
      }, { passive: true });

      // Cancelar drag si se suelta fuera
      sheet.addEventListener('touchcancel', () => {
        if (!isDragging) return;
        isDragging = false;

        sheet.style.transition = 'transform 0.2s ease-out';
        sheet.style.transform = 'translateY(0)';
        const overlay = modal.querySelector('.mobile-login-overlay');
        if (overlay) {
          overlay.style.transition = 'opacity 0.2s ease-out';
          overlay.style.opacity = '1';
        }

        startY = 0;
        currentY = 0;
      }, { passive: true });
    }

    function handleSwipe() {
      const diff = touchStartX - touchEndX;
      const threshold = 50;

      if (Math.abs(diff) > threshold) {
        stopAutoSlide();

        if (diff > 0) {
          // Swipe left -> next slide
          nextSlide();
        } else {
          // Swipe right -> prev slide
          prevSlide();
        }

        startAutoSlide();
      }
    }

    // ========================================
    // FIREBASE AUTH STATE LISTENER
    // ========================================

    function setupAuthListener() {
      // Esperar a que Firebase esté inicializado
      if (!firebase || !firebase.auth) {
        console.log('[MobileAuth] Esperando Firebase...');
        setTimeout(setupAuthListener, 100);
        return;
      }

      // Verificar estado inicial inmediatamente
      const currentUser = firebase.auth().currentUser;
      if (currentUser) {
        console.log('[MobileAuth] Usuario ya autenticado:', currentUser.email);
        hideOnboarding();
        hideLoginModal();
      } else {
        console.log('[MobileAuth] Usuario no autenticado, mostrando login...');
        // Mostrar login después de un pequeño delay para asegurar que el DOM está listo
        setTimeout(() => {
          showOnboarding();
        }, 300);
      }

      // Listener para cambios de estado
      firebase.auth().onAuthStateChanged((user) => {
        if (user) {
          console.log('[MobileAuth] Usuario autenticado:', user.email);
          hideOnboarding();
          hideLoginModal();
          hideSignupModal();
        } else {
          console.log('[MobileAuth] Usuario no autenticado');
          showOnboarding();
        }
      });
    }

    // ========================================
    // INICIALIZACIÓN
    // ========================================

    function init() {
      // Obtener elementos DOM ahora que el documento está listo
      onboarding = document.getElementById('mobile-onboarding');
      loginModal = document.getElementById('mobile-login-modal');
      signupModal = document.getElementById('mobile-signup-modal');
      slides = document.querySelectorAll('.onboarding-slide');
      dots = document.querySelectorAll('.onboarding-dot');
      bgImages = document.querySelectorAll('.onboarding-bg-img');

      // Buttons
      signupBtn = document.getElementById('onboarding-signup-btn');
      loginBtn = document.getElementById('onboarding-login-btn');
      loginCloseBtn = document.getElementById('mobile-login-close');
      signupCloseBtn = document.getElementById('mobile-signup-close');
      loginOverlay = document.querySelector('#mobile-login-modal .mobile-login-overlay');
      signupOverlay = document.querySelector('#mobile-signup-modal .mobile-login-overlay');

      // Login form elements
      mobileLoginForm = document.getElementById('mobile-login-form');
      mobileGoogleBtn = document.getElementById('mobile-btn-google');
      mobileAppleBtn = document.getElementById('mobile-btn-apple');
      mobileFacebookBtn = document.getElementById('mobile-btn-facebook');
      mobileGotoSignup = document.getElementById('mobile-goto-signup');

      // Signup form elements
      mobileSignupForm = document.getElementById('mobile-signup-form');
      mobileSignupGoogleBtn = document.getElementById('mobile-signup-btn-google');
      mobileSignupAppleBtn = document.getElementById('mobile-signup-btn-apple');
      mobileSignupFacebookBtn = document.getElementById('mobile-signup-btn-facebook');
      mobileGotoLogin = document.getElementById('mobile-goto-login');

      // Verificar que los elementos DOM críticos existen
      if (!onboarding && !loginModal && !signupModal) {
        console.error('[MobileAuth] Elementos DOM no encontrados. Verificar que mobile-onboarding, mobile-login-modal y mobile-signup-modal existen en el HTML.');
        return;
      }

      setupEventListeners();
      setupAuthListener();

      console.log('[MobileAuth] Sistema inicializado correctamente');
    }

    // Esperar a que el DOM esté listo antes de inicializar
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    // Exponer función global para forzar visualización del login (útil para debugging)
    window.kruxShowMobileLogin = function () {
      console.log('[MobileAuth] Forzando visualización del login...');
      showLoginModal();
    };

    // Exponer función para mostrar onboarding
    window.kruxShowMobileOnboarding = function () {
      console.log('[MobileAuth] Forzando visualización del onboarding...');
      localStorage.removeItem('krux_onboarding_seen');
      showOnboarding();
    };
  }

  // Iniciar verificación de plataforma
  checkPlatform();

})();
