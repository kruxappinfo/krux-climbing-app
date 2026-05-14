# Configurar Firebase para Acceso Móvil

## 🔧 Solución al Error: "This domain is not authorized for OAuth operations"

Cuando accedes desde el móvil usando la IP local (ej: `http://192.168.1.33:8000`), Firebase bloquea el inicio de sesión porque ese dominio no está autorizado.

## 📝 Pasos para Autorizar el Dominio

### 1. Accede a Firebase Console

1. Ve a: https://console.firebase.google.com/
2. Selecciona tu proyecto: **climbmaps-80cae**

### 2. Agrega Dominios Autorizados

1. En el menú lateral, haz clic en **Authentication** (Autenticación)
2. Haz clic en la pestaña **Settings** (Configuración)
3. Desplázate hasta la sección **Authorized domains** (Dominios autorizados)
4. Haz clic en **Add domain** (Agregar dominio)

### 3. Agrega los Dominios Necesarios

Agrega estos dominios (uno por uno):

1. **localhost** (ya debería estar)
2. **192.168.1.33** (tu IP local actual)
3. **127.0.0.1** (localhost alternativo)

**Nota:** Si tu IP local cambia (puede cambiar al reiniciar el router), tendrás que agregar la nueva IP.

### 4. Alternativa: Usar un Dominio Dinámico

Si tu IP cambia frecuentemente, puedes:

**Opción A: Agregar un rango de IPs**
- Agrega: `192.168.1.*` (si Firebase lo permite)
- O agrega cada IP que uses

**Opción B: Usar ngrok (recomendado para desarrollo)**
- Crea un túnel con ngrok que te da una URL fija
- Agrega esa URL a Firebase
- Más información abajo

## 🚀 Opción Avanzada: Usar ngrok

Si quieres una solución más permanente, puedes usar ngrok:

1. Instala ngrok: `brew install ngrok` (Mac) o descárgalo de ngrok.com
2. Ejecuta: `ngrok http 8000`
3. Copia la URL que te da (ej: `https://abc123.ngrok.io`)
4. Agrega esa URL a Firebase Authorized domains
5. Accede desde el móvil usando esa URL

## ✅ Verificar que Funciona

1. Desde el móvil, abre: `http://192.168.1.33:8000`
2. Intenta iniciar sesión con Google
3. Debería funcionar sin errores

## ⚠️ Notas Importantes

- Los cambios en Firebase pueden tardar unos minutos en aplicarse
- Si cambias de red WiFi, tu IP local cambiará y tendrás que agregar la nueva IP
- Para producción, usa un dominio real y agrégalo a Firebase






