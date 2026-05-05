#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")/../../" && pwd)"
WWW="$ROOT/www"

FILES=(
  app_3.js
  app_2.css
  app-mobile.css
  user-features.js
  maplibre-map.js
  maplibre-config.js
  index.html
  auth.js
  firebase-config.js
  capacitor-init.js
  mobile-auth.js
  admin.js
  admin-users.js
  admin-users.html
  admin-routes.js
  dev-route-editor.js
  route-drawing.js
  route-drawing.css
  route-photos.js
  sector-images.js
  offline.html
  sw.js
)

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  🔄 SINCRONIZACIÓN TOTAL - TODAS LAS PLATAFORMAS    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ============= WWW =============
echo -e "${YELLOW}📦 PASO 1: Sincronizando archivos → www/${NC}"
echo ""
for f in "${FILES[@]}"; do
  if [ -f "$ROOT/$f" ]; then
    cp "$ROOT/$f" "$WWW/$f"
    echo -e "  ${GREEN}✓${NC} $f"
  else
    echo -e "  ${YELLOW}⚠${NC} $f no encontrado en raíz, omitido"
  fi
done

echo ""
echo -e "${YELLOW}Haciendo commit de www...${NC}"
cd "$ROOT"
git add www/
git commit -m "sync: actualizar www con cambios de raíz" 2>/dev/null || echo -e "  (sin cambios nuevos en www)"

echo ""
echo -e "${GREEN}✅ www/ sincronizado${NC}"

# ============= iOS =============
echo ""
echo -e "${YELLOW}📱 PASO 2: Sincronizando con iOS (Capacitor)...${NC}"
echo ""
if command -v npx &> /dev/null; then
  cd "$ROOT"
  npx cap sync ios 2>&1 | grep -E "(✓|✕|Copy|Update)" || true
  echo ""
  echo -e "${GREEN}✅ iOS sincronizado${NC}"
  echo ""
  echo -e "${BLUE}📋 Instrucciones para Xcode:${NC}"
  echo -e "   1. Abre: ${YELLOW}ios/App/App.xcworkspace${NC}"
  echo -e "   2. Clean: ${YELLOW}⇧⌘K${NC} (Product → Clean Build Folder)"
  echo -e "   3. Build: ${YELLOW}⌘B${NC} (Product → Build)"
  echo -e "   4. Run: ${YELLOW}⌘R${NC} (Product → Run en simulador/dispositivo)"
else
  echo -e "${RED}✗ npx no encontrado - instala Node.js${NC}"
fi

# ============= Android =============
echo ""
echo -e "${YELLOW}🤖 PASO 3: Sincronizando con Android (Capacitor)...${NC}"
echo ""
if command -v npx &> /dev/null; then
  cd "$ROOT"
  npx cap sync android 2>&1 | grep -E "(✓|✕|Copy|Update)" || true
  echo ""
  echo -e "${GREEN}✅ Android sincronizado${NC}"
  echo ""
  echo -e "${BLUE}📋 Instrucciones para Android Studio:${NC}"
  echo -e "   1. Abre: ${YELLOW}android/${NC}"
  echo -e "   2. Selecciona: ${YELLOW}Build → Clean Project${NC}"
  echo -e "   3. Compila: ${YELLOW}Build → Make Project (⌘M)${NC}"
  echo -e "   4. Ejecuta: ${YELLOW}Run → Run 'app' (⌃R)${NC}"
else
  echo -e "${RED}✗ npx no encontrado - instala Node.js${NC}"
fi

# ============= PUSH =============
echo ""
echo -e "${YELLOW}Pusheando cambios a dev...${NC}"
cd "$ROOT"
git push origin dev

# ============= RESUMEN =============
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║ ✅ SINCRONIZACIÓN COMPLETADA${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📊 Resumen:${NC}"
echo -e "   ${GREEN}✓ www/${NC} actualizado (web)"
echo -e "   ${GREEN}✓ iOS${NC} sincronizado (Capacitor)"
echo -e "   ${GREEN}✓ Android${NC} sincronizado (Capacitor)"
echo -e "   ${GREEN}✓ GitHub${NC} pusheado"
echo ""
echo -e "${YELLOW}Próximos pasos:${NC}"
echo -e "   • iOS: Compila en Xcode"
echo -e "   • Android: Compila en Android Studio"
echo -e "   • Web: Recarga el navegador"
echo ""
