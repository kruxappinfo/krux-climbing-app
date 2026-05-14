#!/bin/bash

# =============================================================================
# KRUX Splash Screen Generator
# Genera splash screens con el logo de Krux centrado sobre fondo oscuro
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}🎨 KRUX Splash Screen Generator${NC}"
echo "========================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SOURCE_LOGO="$PROJECT_ROOT/logo_krujx_v2.png"
RESOURCES_DIR="$PROJECT_ROOT/resources"

# Color de fondo del splash (mismo que en capacitor.config.ts)
BG_COLOR="#12161c"

# Verificar que existe sips (macOS)
if ! command -v sips &> /dev/null; then
    echo -e "${RED}❌ sips no encontrado. Este script requiere macOS${NC}"
    exit 1
fi

# Verificar que existe ImageMagick (opcional pero recomendado)
HAS_IMAGEMAGICK=false
if command -v convert &> /dev/null; then
    HAS_IMAGEMAGICK=true
    echo -e "${GREEN}✓${NC} ImageMagick detectado - se usará para mejor calidad"
else
    echo -e "${YELLOW}⚠${NC} ImageMagick no encontrado - se usará sips (calidad básica)"
    echo -e "${BLUE}💡 Instala ImageMagick para mejor calidad: brew install imagemagick${NC}"
fi

# Verificar logo fuente
if [ ! -f "$SOURCE_LOGO" ]; then
    echo -e "${RED}❌ No se encontró el logo fuente: $SOURCE_LOGO${NC}"
    exit 1
fi

# Crear directorio de splash
mkdir -p "$RESOURCES_DIR/splash"

echo ""
echo -e "${YELLOW}🖼️  Generando splash screens...${NC}"
echo ""

# Función para generar splash con ImageMagick (mejor calidad)
generate_splash_magick() {
    local width=$1
    local height=$2
    local output=$3
    local logo_height=$((height / 3))

    # Crear imagen con fondo oscuro y logo centrado
    convert -size ${width}x${height} "xc:$BG_COLOR" \
            \( "$SOURCE_LOGO" -resize x${logo_height} \) \
            -gravity center -composite \
            "$output"
}

# Función para generar splash con sips (fallback)
generate_splash_sips() {
    local width=$1
    local height=$2
    local output=$3
    local logo_height=$((height / 3))

    # Crear copia del splash actual como base
    cp "$RESOURCES_DIR/splash.png" "$output" 2>/dev/null || {
        echo -e "${RED}❌ Error: No se pudo crear $output${NC}"
        return 1
    }

    # Redimensionar
    sips -z $height $width "$output" --out "$output" > /dev/null 2>&1
}

# ===== SPLASH iOS =====
echo -e "${BLUE}📱 iOS Splash Screens:${NC}"

IOS_SPLASH_SIZES=(
    "640x1136"    # iPhone 5/SE
    "750x1334"    # iPhone 6/7/8
    "1125x2436"   # iPhone X/XS/11 Pro
    "1242x2208"   # iPhone 6+/7+/8+
    "1242x2688"   # iPhone XS Max/11 Pro Max
    "828x1792"    # iPhone XR/11
    "1536x2048"   # iPad 9.7"
    "1668x2224"   # iPad 10.5"
    "1668x2388"   # iPad 11"
    "2048x2732"   # iPad 12.9"
    "1334x1334"   # Cuadrado pequeño
    "2208x2208"   # Cuadrado medio
    "2732x2732"   # Cuadrado grande (usado actualmente)
)

for resolution in "${IOS_SPLASH_SIZES[@]}"; do
    width="${resolution%x*}"
    height="${resolution#*x}"
    output="$RESOURCES_DIR/splash/splash-${resolution}.png"

    if [ "$HAS_IMAGEMAGICK" = true ]; then
        generate_splash_magick $width $height "$output"
    else
        generate_splash_sips $width $height "$output"
    fi

    echo -e "${GREEN}✓${NC} splash-${resolution}.png"
done

# ===== SPLASH Android =====
echo ""
echo -e "${BLUE}🤖 Android Splash Screens:${NC}"

# Portrait
ANDROID_PORTRAIT=(
    "480:800:mdpi"
    "720:1280:hdpi"
    "960:1600:xhdpi"
    "1280:1920:xxhdpi"
    "1920:2560:xxxhdpi"
)

for item in "${ANDROID_PORTRAIT[@]}"; do
    width="${item%%:*}"
    temp="${item#*:}"
    height="${temp%%:*}"
    density="${item##*:}"

    mkdir -p "$RESOURCES_DIR/android/drawable-port-$density"
    output="$RESOURCES_DIR/android/drawable-port-$density/splash.png"

    if [ "$HAS_IMAGEMAGICK" = true ]; then
        generate_splash_magick $width $height "$output"
    else
        generate_splash_sips $width $height "$output"
    fi

    echo -e "${GREEN}✓${NC} Android portrait $density (${width}x${height})"
done

# Landscape
ANDROID_LANDSCAPE=(
    "800:480:mdpi"
    "1280:720:hdpi"
    "1600:960:xhdpi"
    "1920:1280:xxhdpi"
    "2560:1920:xxxhdpi"
)

for item in "${ANDROID_LANDSCAPE[@]}"; do
    width="${item%%:*}"
    temp="${item#*:}"
    height="${temp%%:*}"
    density="${item##*:}"

    mkdir -p "$RESOURCES_DIR/android/drawable-land-$density"
    output="$RESOURCES_DIR/android/drawable-land-$density/splash.png"

    if [ "$HAS_IMAGEMAGICK" = true ]; then
        generate_splash_magick $width $height "$output"
    else
        generate_splash_sips $width $height "$output"
    fi

    echo -e "${GREEN}✓${NC} Android landscape $density (${width}x${height})"
done

# Drawable genérico
echo ""
echo -e "${BLUE}🎨 Android Drawable Genérico:${NC}"

ANDROID_DRAWABLE=(
    "320:480:mdpi"
    "480:720:hdpi"
    "640:960:xhdpi"
    "960:1440:xxhdpi"
    "1280:1920:xxxhdpi"
)

for item in "${ANDROID_DRAWABLE[@]}"; do
    width="${item%%:*}"
    temp="${item#*:}"
    height="${temp%%:*}"
    density="${item##*:}"

    mkdir -p "$RESOURCES_DIR/android/drawable-$density"
    output="$RESOURCES_DIR/android/drawable-$density/splash.png"

    if [ "$HAS_IMAGEMAGICK" = true ]; then
        generate_splash_magick $width $height "$output"
    else
        generate_splash_sips $width $height "$output"
    fi

    echo -e "${GREEN}✓${NC} Android drawable $density (${width}x${height})"
done

# Generar splash base
echo ""
echo -e "${BLUE}📄 Base Splash Screen:${NC}"
if [ "$HAS_IMAGEMAGICK" = true ]; then
    generate_splash_magick 2732 2732 "$RESOURCES_DIR/splash.png"
else
    # Si ya existe, mantenerlo
    if [ -f "$RESOURCES_DIR/splash.png" ]; then
        echo -e "${GREEN}✓${NC} splash.png (existente - mantenido)"
    else
        echo -e "${YELLOW}⚠${NC} splash.png no se pudo generar sin ImageMagick"
    fi
fi

# ===== PWA SPLASH =====
echo ""
echo -e "${BLUE}🌐 PWA Splash Screens:${NC}"

PWA_SIZES=(
    "640x1136"
    "750x1334"
    "1125x2436"
    "1242x2208"
    "1536x2048"
    "1668x2224"
    "2048x2732"
)

mkdir -p "$PROJECT_ROOT/icons/pwa"

for resolution in "${PWA_SIZES[@]}"; do
    width="${resolution%x*}"
    height="${resolution#*x}"
    output="$PROJECT_ROOT/icons/pwa/splash-${resolution}.png"

    if [ "$HAS_IMAGEMAGICK" = true ]; then
        generate_splash_magick $width $height "$output"
    else
        generate_splash_sips $width $height "$output"
    fi

    echo -e "${GREEN}✓${NC} PWA splash-${resolution}.png"
done

echo ""
echo "========================================"
echo -e "${GREEN}✅ Splash screens generados!${NC}"
echo ""
echo -e "${YELLOW}📝 Próximos pasos:${NC}"
echo "   1. Ejecuta: npx cap sync"
echo "   2. Reconstruye las apps nativas si es necesario"
echo ""
if [ "$HAS_IMAGEMAGICK" = false ]; then
    echo -e "${BLUE}💡 Consejo:${NC} Para mejor calidad, instala ImageMagick:"
    echo "   brew install imagemagick"
    echo ""
fi
