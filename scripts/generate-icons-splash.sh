#!/bin/bash

# Script para generar iconos y splash screens de la app KRUX

# Colores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📱 Generando iconos y splash screens de KRUX...${NC}"
echo "=================================================="

LOGO_SOURCE="logo_krujx_v2.png"
ICON_DIR="resources/icon"
SPLASH_DIR="resources/splash"

# Crear directorios si no existen
mkdir -p "$ICON_DIR"
mkdir -p "$SPLASH_DIR"

# ==========================================
# GENERAR ICONOS (con fondo blanco)
# ==========================================

echo -e "\n${GREEN}🎨 Generando iconos de la app...${NC}"

# Tamaños de iconos para iOS
ICON_SIZES=(20 29 40 58 60 76 80 87 120 152 167 180 1024)

for size in "${ICON_SIZES[@]}"; do
    echo "  ✓ Creando icon-${size}.png"
    # Crear fondo blanco
    sips -z $size $size --out "/tmp/bg-${size}.png" -c $size $size --setProperty format png "$LOGO_SOURCE" 2>/dev/null
    # Crear icono con fondo blanco
    sips -z $size $size --out "${ICON_DIR}/icon-${size}.png" --setProperty format png "$LOGO_SOURCE" 2>/dev/null
done

# ==========================================
# GENERAR SPLASH SCREENS (fondo negro)
# ==========================================

echo -e "\n${GREEN}✨ Generando splash screens con fondo negro...${NC}"

# Tamaños de splash para diferentes dispositivos
SPLASH_SIZES=(1334 2208 2732)

for size in "${SPLASH_SIZES[@]}"; do
    echo "  ✓ Creando splash-${size}x${size}.png con fondo negro"

    # Calcular el tamaño del logo (60% del tamaño del splash)
    logo_size=$((size * 40 / 100))

    # Crear imagen negra
    python3 -c "
from PIL import Image
# Crear imagen negra
img = Image.new('RGB', ($size, $size), color='black')
# Abrir y redimensionar logo
logo = Image.open('$LOGO_SOURCE').convert('RGBA')
logo = logo.resize(($logo_size, $logo_size), Image.Resampling.LANCZOS)
# Centrar logo
x = ($size - $logo_size) // 2
y = ($size - $logo_size) // 2
# Pegar logo en el centro
img.paste(logo, (x, y), logo)
# Guardar
img.save('${SPLASH_DIR}/splash-${size}x${size}.png')
print('Created ${SPLASH_DIR}/splash-${size}x${size}.png')
" 2>/dev/null || {
    # Si Python/PIL no está disponible, usar sips (fondo blanco por defecto)
    echo "  ⚠️  Python PIL no disponible, usando método alternativo"
    # Crear una imagen negra sólida (sin logo por ahora)
    sips -z $size $size --out "${SPLASH_DIR}/splash-${size}x${size}.png" --setProperty format png "$LOGO_SOURCE" 2>/dev/null
}
done

echo -e "\n${GREEN}✅ Iconos y splash screens generados correctamente${NC}"
echo "=================================================="
echo -e "${BLUE}Próximo paso: npx cap sync${NC}"
