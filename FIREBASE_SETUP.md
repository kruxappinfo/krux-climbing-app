# Guía de Configuración de Firebase - Autorización de Fotos

Guía completa para configurar las Reglas de Seguridad de Firebase para el sistema de autorización de subida de fotos.

## 📋 Lista de Verificación Rápida

- [ ] Agregarte como primer admin en Firestore
- [ ] Configurar Reglas de Seguridad de Firestore
- [ ] Configurar Reglas de Seguridad de Storage  
- [ ] Probar permisos

---

## 1️⃣ Agregarte como Primer Admin

Antes que nada, necesitas agregarte como admin en Firestore.

### Pasos:

1. **Obtén tu UID**:
   - Abre tu app en `http://localhost:8080`
   - Inicia sesión con Google
   - Abre la consola del navegador (F12)
   - Escribe: `auth.currentUser.uid`
   - Copia el UID (se ve así: `abc123XYZ456...`)

2. **Agregar a Firestore**:
   - Ve a [Firebase Console](https://console.firebase.google.com)
   - Selecciona tu proyecto: `climbmaps-80cae`
   - Ve a **Firestore Database** → **Datos**
   - Haz clic en **Iniciar colección**
   - ID de colección: `admins`
   - ID de documento: **Pega tu UID aquí**
   - Agrega campos:
     ```
     email: "tu@correo.com" (string)
     role: "admin" (string)
     addedAt: (haz clic en el botón "timestamp")
     ```
   - Haz clic en **Guardar**

3. **Verificar**:
   - Actualiza tu app
   - Ve a `http://localhost:8080/admin-users.html`
   - Deberías ver el panel de administración

---

## 2️⃣ Reglas de Seguridad de Firestore

Estas reglas protegen la colección `admins` para que solo los admins puedan modificarla.

### Pasos:

1. Ve a [Firebase Console](https://console.firebase.google.com) → Tu proyecto
2. Haz clic en **Firestore Database** → **Reglas**
3. Reemplaza las reglas existentes con:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Colección de admins - solo admins pueden escribir
    match /admins/{userId} {
      // Cualquiera puede leer (para verificar permisos)
      allow read: if true;
      
      // Solo admins existentes pueden crear/actualizar/eliminar
      allow write: if request.auth != null 
                   && exists(/databases/$(database)/documents/admins/$(request.auth.uid))
                   && get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Metadatos de fotos de vías
    match /route-photos/{photoId} {
      // Cualquiera puede leer
      allow read: if true;
      
      // Solo usuarios autorizados (photo_uploader o admin) pueden crear
      allow create: if request.auth != null
                    && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
      
      // Solo el que subió la foto o admins pueden actualizar/eliminar
      allow update, delete: if request.auth != null
                             && (resource.data.uploadedBy == request.auth.uid
                                 || (exists(/databases/$(database)/documents/admins/$(request.auth.uid))
                                     && get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role == 'admin'));
    }
    
    // Favoritos y proyectos de usuarios
    match /users/{userId}/favorites/{favoriteId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /users/{userId}/projects/{projectId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /users/{userId}/ascents/{ascentId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Comentarios (si los tienes)
    match /comments/{commentId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
    
    // Por defecto denegar todas las demás colecciones
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

4. Haz clic en **Publicar**

---

## 3️⃣ Reglas de Seguridad de Storage

Estas reglas restringen la subida de fotos solo a usuarios autorizados.

### Pasos:

1. Ve a [Firebase Console](https://console.firebase.google.com) → Tu proyecto
2. Haz clic en **Storage** → **Reglas**
3. Reemplaza las reglas existentes con:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    
    // Fotos de vías - solo usuarios autorizados pueden subir
    match /route-photos/{schoolId}/{filename} {
      // Cualquiera puede leer/descargar fotos
      allow read: if true;
      
      // Solo usuarios autorizados (en colección admins) pueden subir
      allow create: if request.auth != null
                    && exists(/databases/(default)/documents/admins/$(request.auth.uid));
      
      // Solo el que subió la foto o admins pueden eliminar
      allow delete: if request.auth != null
                    && (request.auth.uid == resource.metadata.uploadedBy
                        || (exists(/databases/(default)/documents/admins/$(request.auth.uid))
                            && firestore.get(/databases/(default)/documents/admins/$(request.auth.uid)).data.role == 'admin'));
    }
    
    // Por defecto denegar todas las demás rutas
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

4. Haz clic en **Publicar**

---

## 4️⃣ Probar Permisos

### Probar como Admin:

1. Inicia sesión en tu app
2. Ve a `admin-users.html`
3. Deberías ver el panel de administración ✅
4. Intenta agregar un usuario de prueba
5. Haz clic en una vía y sube una foto ✅

### Probar como Usuario No Autorizado:

1. Abre la app en una ventana de incógnito/privada
2. Inicia sesión con otra cuenta de Google
3. Haz clic en una vía
4. El botón "Subir Foto" NO debería aparecer ❌
5. Intenta acceder a `admin-users.html` → debería redirigir ❌

### Probar Restricciones de Subida de Fotos:

1. Como usuario no autorizado, intenta subir vía consola del navegador:
   ```javascript
   // Esto debería FALLAR con permiso denegado
   const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
   uploadRoutePhoto("valeria", "Test Route", file);
   ```
2. El error debería decir: "You do not have permission to upload photos" ✅

---

## 🎯 Agregar Más Usuarios

Una vez configurado, puedes agregar más usuarios fácilmente:

### Opción 1: Vía Panel de Admin (Recomendado)

1. Haz que el usuario inicie sesión en tu app al menos una vez
2. Ve a [Firebase Console](https://console.firebase.google.com) → **Authentication**
3. Encuentra al usuario y copia su **UID**
4. Ve al `admin-users.html` de tu app
5. Ingresa su email y pega el UID cuando se te pida
6. Selecciona rol: "Subir Fotos" o "Admin"
7. Haz clic en "Agregar"

### Opción 2: Directamente en Firestore

1. Ve a Firestore Database → Colección `admins`
2. Haz clic en **Agregar documento**
3. ID de documento: UID del usuario
4. Campos:
   ```
   email: "usuario@correo.com"
   role: "photo_uploader"  (o "admin")
   addedAt: (timestamp)
   ```

---

## 🔐 Tipos de Roles

- **`admin`**: Puede subir fotos + gestionar usuarios en el panel de admin
- **`photo_uploader`**: Solo puede subir fotos a las vías

---

## ⚠️ Notas Importantes

1. **Los usuarios deben iniciar sesión primero**: Antes de agregar un usuario, debe iniciar sesión en tu app al menos una vez para que Firebase cree su cuenta.

2. **Despliegue de reglas**: Las reglas de seguridad tienen efecto inmediatamente después de publicar.

3. **Pruebas**: Siempre prueba con diferentes cuentas de usuario para asegurar que las reglas funcionen correctamente.

4. **Respaldo**: Antes de cambiar reglas, haz clic en "Ver versiones anteriores" para guardar un respaldo.

---

## 🆘 Solución de Problemas

### "Permission denied" al subir

- Verifica que el usuario existe en la colección `admins` en Firestore
- Verifica que el UID del usuario coincide exactamente
- Verifica que las Reglas de Storage están publicadas

### No puedo acceder al panel de admin

- Verifica que tu UID está en la colección `admins` con `role: "admin"`
- Verifica que las Reglas de Firestore están publicadas
- Limpia el caché del navegador e inténtalo de nuevo

### Las reglas no funcionan

- Asegúrate de haber hecho clic en **Publicar** después de editar las reglas
- Espera 30-60 segundos para que las reglas se propaguen
- Verifica en la Consola de Firebase si hay errores de sintaxis en las reglas

---

## 📱 Próximos Pasos

Una vez todo esté configurado:

1. ✅ Prueba subir fotos como admin
2. ✅ Agrega usuarios de confianza vía panel de admin
3. ✅ Prueba con usuarios no autorizados para verificar la seguridad
4. 🎉 ¡Comienza a subir fotos a tus vías!

---

**¿Necesitas ayuda?** Consulta la [Documentación de Firebase](https://firebase.google.com/docs/rules) o abre un issue.
