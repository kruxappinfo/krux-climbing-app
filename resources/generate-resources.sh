#!/bin/bash

# =============================================================================
# KRUX Capacitor Resources Generator
# Genera iconos y splash screens para iOS y Android
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🎨 KRUX Capacitor Resources Generator${NC}"
echo "========================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SOURCE_LOGO="$PROJECT_ROOT/logo_krujx_v2.png"

# Verificar logo fuente
if [ ! -f "$SOURCE_LOGO" ]; then
    echo -e "${RED}❌ No se encontró el logo fuente${NC}"
    exit 1
fi

# Crear directorios
mkdir -p "$SCRIPT_DIR/icon"
mkdir -p "$SCRIPT_DIR/splash"

echo -e "${YELLOW}📱 Generando iconos para iOS y Android...${NC}"

# ===== ICONOS iOS =====
# Los iconos de iOS van en ios/App/App/Assets.xcassets/AppIcon.appiconset/
IOS_SIZES=(20 29 40 58 60 76 80 87 120 152 167 180 1024)

for size in "${IOS_SIZES[@]}"; do
    sips -z $size $size "$SOURCE_LOGO" --out "$SCRIPT_DIR/icon/icon-${size}.png" > /dev/null 2>&1
    echo -e "${GREEN}✓${NC} icon-${size}.png"
done

# ===== ICONOS Android =====
# mdpi (48x48), hdpi (72x72), xhdpi (96x96), xxhdpi (144x144), xxxhdpi (192x192)
ANDROID_SIZES=("48:mdpi" "72:hdpi" "96:xhdpi" "144:xxhdpi" "192:xxxhdpi")

for item in "${ANDROID_SIZES[@]}"; do
    size="${item%%:*}"
    density="${item##*:}"
    mkdir -p "$SCRIPT_DIR/android/mipmap-$density"
    sips -z $size $size "$SOURCE_LOGO" --out "$SCRIPT_DIR/android/mipmap-$density/ic_launcher.png" > /dev/null 2>&1
    # Crear versión redonda (foreground)
    sips -z $size $size "$SOURCE_LOGO" --out "$SCRIPT_DIR/android/mipmap-$density/ic_launcher_foreground.png" > /dev/null 2>&1
    echo -e "${GREEN}✓${NC} Android $density ($size x $size)"
done

echo ""
echo -e "${YELLOW}🖼️ Generando splash screens...${NC}"

# ===== SPLASH iOS =====
# Los splash screens de iOS se configuran con Storyboard, pero podemos generar imágenes de respaldo
IOS_SPLASH_SIZES=("2732x2732" "1334x1334" "2208x2208")

for resolution in "${IOS_SPLASH_SIZES[@]}"; do
    width="${resolution%x*}"
    height="${resolution#*x}"
    logo_size=$((width / 4))
    sips -z $logo_size $logo_size "$SOURCE_LOGO" --out "$SCRIPT_DIR/splash/splash-${resolution}.png" > /dev/null 2>&1
    echo -e "${GREEN}✓${NC} splash-${resolution}.png"
done

# ===== SPLASH Android =====
ANDROID_SPLASH=("480x800:mdpi" "720x1280:hdpi" "960x1600:xhdpi" "1280x1920:xxhdpi" "1920x2560:xxxhdpi")

for item in "${ANDROID_SPLASH[@]}"; do
    resolution="${item%%:*}"
    density="${item##*:}"
    width="${resolution%x*}"
    height="${resolution#*x}"
    mkdir -p "$SCRIPT_DIR/android/drawable-$density"
    logo_size=$((width / 3))
    sips -z $logo_size $logo_size "$SOURCE_LOGO" --out "$SCRIPT_DIR/android/drawable-$density/splash.png" > /dev/null 2>&1
    echo -e "${GREEN}✓${NC} Android splash $density ($resolution)"
done

echo ""
echo "========================================"
echo -e "${GREEN}✅ Recursos generados!${NC}"
echo ""
echo "📝 Próximos pasos:"
echo "   1. Ejecuta: npm install"
echo "   2. Ejecuta: npx cap add ios && npx cap add android"
echo "   3. Copia los iconos generados a los proyectos nativos"
echo ""
echo "📱 Para iOS, los iconos van en:"
echo "   ios/App/App/Assets.xcassets/AppIcon.appiconset/"
echo ""
echo "🤖 Para Android, los iconos van en:"
echo "   android/app/src/main/res/mipmap-*/"
echo ""
