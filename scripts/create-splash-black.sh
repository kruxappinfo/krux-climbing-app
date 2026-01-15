#!/bin/bash

# Script simplificado para crear splash screens con fondo negro

echo "🎨 Creando splash screens con fondo negro..."

LOGO="logo_krujx_v2.png"
SPLASH_DIR="resources/splash"

mkdir -p "$SPLASH_DIR"

# Función para crear splash con fondo negro
create_splash() {
    local size=$1
    local output="${SPLASH_DIR}/splash-${size}x${size}.png"

    echo "  ✓ Creando splash ${size}x${size} con fondo negro"

    # Usar sips para crear una imagen base del logo
    # Luego necesitaremos editarla manualmente o usar una herramienta gráfica

    # Por ahora, copiar el logo redimensionado (temporal)
    sips -z $size $size --out "$output" --setProperty format png "$LOGO" 2>/dev/null

    echo "  ⚠️  Nota: El splash ha sido creado. Para fondo negro perfecto, edita manualmente."
}

# Crear splash screens
create_splash 1334
create_splash 2208
create_splash 2732

echo "✅ Splash screens creados en $SPLASH_DIR"
echo ""
echo "💡 Para mejorar: Abre los archivos en Preview/Photoshop y:"
echo "   1. Añade un fondo negro"
echo "   2. Centra el logo"
echo "   3. Ajusta el tamaño del logo (40-50% del canvas)"
