#!/bin/bash

# ============================================================
#  CONVERTIR HEIC A JPG - Arrastra una carpeta sobre este script
# ============================================================
#  Uso: ./convertir_heic_a_jpg.sh /ruta/a/tu/carpeta
#  O arrastra una carpeta sobre el script en Finder
# ============================================================

# --- Verificar que se pasó una carpeta ---
if [ -z "$1" ]; then
    echo ""
    echo "  ERROR: Debes pasar una carpeta como argumento."
    echo "  Uso: ./convertir_heic_a_jpg.sh /ruta/a/tu/carpeta"
    echo ""
    read -p "  Presiona Enter para salir..."
    exit 1
fi

ORIGEN="$1"

if [ ! -d "$ORIGEN" ]; then
    echo ""
    echo "  ERROR: \"$ORIGEN\" no es una carpeta válida."
    echo ""
    read -p "  Presiona Enter para salir..."
    exit 1
fi

# --- Verificar/Instalar ImageMagick ---
if ! command -v magick &> /dev/null; then
    echo ""
    echo "  ImageMagick no está instalado."

    # Verificar si Homebrew está instalado
    if ! command -v brew &> /dev/null; then
        echo "  Homebrew tampoco está instalado. Instalando Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

        # Añadir Homebrew al PATH (Apple Silicon y Intel)
        if [ -f "/opt/homebrew/bin/brew" ]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        elif [ -f "/usr/local/bin/brew" ]; then
            eval "$(/usr/local/bin/brew shellenv)"
        fi
    fi

    echo "  Instalando ImageMagick con Homebrew..."
    brew install imagemagick

    if ! command -v magick &> /dev/null; then
        echo ""
        echo "  ERROR: No se pudo instalar ImageMagick."
        echo ""
        read -p "  Presiona Enter para salir..."
        exit 1
    fi

    echo "  ImageMagick instalado correctamente."
    echo ""
fi

# --- Configurar rutas ---
# Eliminar trailing slash si lo tiene
ORIGEN="${ORIGEN%/}"
DESTINO="${ORIGEN}_JPG"

echo ""
echo "  ========================================"
echo "   Convertidor HEIC a JPG"
echo "  ========================================"
echo ""
echo "  Carpeta origen:  $ORIGEN"
echo "  Carpeta destino: $DESTINO"
echo ""

# --- Contar archivos HEIC ---
TOTAL=$(find "$ORIGEN" -iname "*.heic" | wc -l | tr -d ' ')

if [ "$TOTAL" -eq 0 ]; then
    echo "  No se encontraron archivos .HEIC en la carpeta."
    echo ""
    read -p "  Presiona Enter para salir..."
    exit 0
fi

echo "  Archivos HEIC encontrados: $TOTAL"
echo ""
echo "  Iniciando conversión..."
echo ""

# --- Crear carpeta destino ---
mkdir -p "$DESTINO"

CONTADOR=0
ERRORES=0

# --- Convertir archivos ---
find "$ORIGEN" -iname "*.heic" | while read -r archivo; do
    CONTADOR=$((CONTADOR + 1))

    # Obtener ruta relativa
    RUTA_RELATIVA="${archivo#$ORIGEN}"
    DIRECTORIO_RELATIVO="$(dirname "$RUTA_RELATIVA")"
    NOMBRE="$(basename "$archivo" | sed 's/\.[hH][eE][iI][cC]$//')"

    # Crear subcarpeta en destino
    mkdir -p "$DESTINO/$DIRECTORIO_RELATIVO"

    echo "  [$CONTADOR/$TOTAL] Convirtiendo: $RUTA_RELATIVA"

    if magick "$archivo" -quality 95 "$DESTINO/$DIRECTORIO_RELATIVO/$NOMBRE.jpg" 2>/dev/null; then
        :
    else
        # Fallback con sips (nativo de macOS, no requiere ImageMagick)
        sips -s format jpeg -s formatOptions 95 "$archivo" --out "$DESTINO/$DIRECTORIO_RELATIVO/$NOMBRE.jpg" &>/dev/null
        if [ $? -ne 0 ]; then
            echo "    > ERROR al convertir: $archivo"
            ERRORES=$((ERRORES + 1))
        fi
    fi
done

echo ""
echo "  ========================================"
echo "   Conversión completada"
echo "   Guardados en: $DESTINO"
echo "  ========================================"
echo ""
read -p "  Presiona Enter para salir..."
