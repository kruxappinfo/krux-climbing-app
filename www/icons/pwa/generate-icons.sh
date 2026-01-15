#!/bin/bash

# =============================================================================
# KRUX PWA Icon Generator
# Genera todos los iconos necesarios para PWA desde un logo base
# =============================================================================

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🎨 KRUX PWA Icon Generator${NC}"
echo "=================================="

# Directorio de este script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Logo fuente (usar logo_krujx_v2.png como base)
SOURCE_LOGO="$PROJECT_ROOT/logo_krujx_v2.png"
OUTPUT_DIR="$SCRIPT_DIR"

# Verificar que el logo existe
if [ ! -f "$SOURCE_LOGO" ]; then
    echo -e "${RED}❌ Error: No se encontró el logo fuente en: $SOURCE_LOGO${NC}"
    echo "Por favor, asegúrate de que existe logo_krujx_v2.png en la raíz del proyecto"
    exit 1
fi

# Verificar que sips está disponible (macOS) o ImageMagick
USE_SIPS=false
USE_MAGICK=false

if command -v sips &> /dev/null; then
    USE_SIPS=true
    echo -e "${YELLOW}📦 Usando sips (macOS nativo)${NC}"
elif command -v convert &> /dev/null; then
    USE_MAGICK=true
    echo -e "${YELLOW}📦 Usando ImageMagick${NC}"
else
    echo -e "${RED}❌ Error: Se requiere sips (macOS) o ImageMagick${NC}"
    echo "Instala ImageMagick con: brew install imagemagick"
    exit 1
fi

echo -e "${YELLOW}📁 Directorio de salida: $OUTPUT_DIR${NC}"
echo -e "${YELLOW}📷 Logo fuente: $SOURCE_LOGO${NC}"
echo ""

# Crear directorio de salida si no existe
mkdir -p "$OUTPUT_DIR"

# Función para crear icono
create_icon() {
    local size=$1
    local output_name=$2

    if [ "$USE_SIPS" = true ]; then
        sips -z $size $size "$SOURCE_LOGO" --out "$OUTPUT_DIR/$output_name" > /dev/null 2>&1
    else
        convert "$SOURCE_LOGO" \
            -resize ${size}x${size} \
            -gravity center \
            -background white \
            -extent ${size}x${size} \
            "$OUTPUT_DIR/$output_name"
    fi

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Creado: $output_name (${size}x${size})"
    else
        echo -e "${RED}✗${NC} Error creando: $output_name"
    fi
}

# Función para crear splash screen
create_splash() {
    local width=$1
    local height=$2
    local output_name=$3
    local logo_size=$((width / 3))

    if [ "$USE_SIPS" = true ]; then
        # sips solo puede redimensionar, creamos el logo centrado
        sips -z $logo_size $logo_size "$SOURCE_LOGO" --out "$OUTPUT_DIR/$output_name" > /dev/null 2>&1
    else
        # ImageMagick puede crear splash completos con fondo
        convert -size ${width}x${height} xc:white \
            \( "$SOURCE_LOGO" -resize ${logo_size}x${logo_size} \) \
            -gravity center -composite \
            "$OUTPUT_DIR/$output_name"
    fi

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Creado: $output_name (${width}x${height})"
    else
        echo -e "${RED}✗${NC} Error creando: $output_name"
    fi
}

echo "📱 Generando iconos PWA estándar..."
echo "-----------------------------------"

# Iconos PWA estándar (manifest.json)
create_icon 72 "icon-72x72.png"
create_icon 96 "icon-96x96.png"
create_icon 128 "icon-128x128.png"
create_icon 144 "icon-144x144.png"
create_icon 152 "icon-152x152.png"
create_icon 167 "icon-167x167.png"   # iPad Pro
create_icon 180 "icon-180x180.png"   # iPhone 6+
create_icon 192 "icon-192x192.png"
create_icon 384 "icon-384x384.png"
create_icon 512 "icon-512x512.png"

echo ""
echo "🍎 Generando iconos Apple Touch..."
echo "-----------------------------------"

# Apple Touch Icon (180x180 es el estándar)
cp "$OUTPUT_DIR/icon-180x180.png" "$OUTPUT_DIR/apple-touch-icon.png"
echo -e "${GREEN}✓${NC} Creado: apple-touch-icon.png (180x180)"

echo ""
echo "🎯 Generando iconos para shortcuts..."
echo "--------------------------------------"

# Iconos para shortcuts del manifest
create_icon 96 "shortcut-map.png"
create_icon 96 "shortcut-profile.png"

echo ""
echo "📸 Generando splash screens..."
echo "-------------------------------"

# Splash screens para iOS
create_splash 640 1136 "splash-640x1136.png"    # iPhone 5
create_splash 750 1334 "splash-750x1334.png"    # iPhone 6/7/8
create_splash 1125 2436 "splash-1125x2436.png"  # iPhone X/XS
create_splash 1242 2208 "splash-1242x2208.png"  # iPhone 6+/7+/8+
create_splash 1536 2048 "splash-1536x2048.png"  # iPad
create_splash 1668 2224 "splash-1668x2224.png"  # iPad Pro 10.5"
create_splash 2048 2732 "splash-2048x2732.png"  # iPad Pro 12.9"

echo ""
echo "📸 Generando screenshots placeholder..."
echo "----------------------------------------"

# Screenshots para manifest
create_splash 1080 1920 "screenshot-map.png"
create_splash 1080 1920 "screenshot-profile.png"

echo ""
echo "=================================="
echo -e "${GREEN}✅ Generación completada!${NC}"
echo ""
echo "📝 Archivos generados:"
ls -la "$OUTPUT_DIR"/*.png 2>/dev/null | awk '{print "   " $NF}'
echo ""
echo "💡 Para splash screens profesionales, considera:"
echo "   - https://progressier.com/pwa-icons-and-ios-splash-screen-generator"
echo "   - Reemplaza screenshot-*.png con capturas reales"
echo ""
