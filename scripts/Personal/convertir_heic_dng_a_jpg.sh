#!/bin/bash

# ============================================================
#  CONVERTIR HEIC / DNG A JPG - Arrastra una carpeta sobre este script
# ============================================================
#  Uso: ./convertir_heic_dng_a_jpg.sh /ruta/a/tu/carpeta
#  O arrastra una carpeta sobre el script en Finder
# ============================================================

# --- Verificar que se pasó una carpeta ---
if [ -z "$1" ]; then
    echo ""
    echo "  ERROR: Debes pasar una carpeta como argumento."
    echo "  Uso: ./convertir_heic_dng_a_jpg.sh /ruta/a/tu/carpeta"
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

# --- Verificar si Homebrew está instalado (necesario para ambas herramientas) ---
ensure_brew() {
    if ! command -v brew &> /dev/null; then
        echo "  Homebrew no está instalado. Instalando Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        if [ -f "/opt/homebrew/bin/brew" ]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        elif [ -f "/usr/local/bin/brew" ]; then
            eval "$(/usr/local/bin/brew shellenv)"
        fi
    fi
}

# --- Verificar/Instalar ImageMagick (para HEIC) ---
if ! command -v magick &> /dev/null; then
    echo ""
    echo "  ImageMagick no está instalado."
    ensure_brew
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

# --- Verificar/Instalar dcraw (para DNG) ---
if ! command -v dcraw &> /dev/null; then
    echo ""
    echo "  dcraw no está instalado."
    ensure_brew
    echo "  Instalando dcraw con Homebrew..."
    brew install dcraw
    if ! command -v dcraw &> /dev/null; then
        echo ""
        echo "  ERROR: No se pudo instalar dcraw."
        echo ""
        read -p "  Presiona Enter para salir..."
        exit 1
    fi
    echo "  dcraw instalado correctamente."
    echo ""
fi

# --- Configurar rutas ---
# Eliminar trailing slash si lo tiene
ORIGEN="${ORIGEN%/}"
DESTINO="${ORIGEN}_JPG"

echo ""
echo "  ========================================"
echo "   Convertidor HEIC / DNG a JPG"
echo "  ========================================"
echo ""
echo "  Carpeta origen:  $ORIGEN"
echo "  Carpeta destino: $DESTINO"
echo ""

# --- Contar archivos HEIC y DNG ---
TOTAL_HEIC=$(find "$ORIGEN" -iname "*.heic" | wc -l | tr -d ' ')
TOTAL_DNG=$(find "$ORIGEN" -iname "*.dng" | wc -l | tr -d ' ')
TOTAL=$((TOTAL_HEIC + TOTAL_DNG))

if [ "$TOTAL" -eq 0 ]; then
    echo "  No se encontraron archivos .HEIC ni .DNG en la carpeta."
    echo ""
    read -p "  Presiona Enter para salir..."
    exit 0
fi

echo "  Archivos HEIC encontrados: $TOTAL_HEIC"
echo "  Archivos DNG encontrados:  $TOTAL_DNG"
echo "  Total a convertir:         $TOTAL"
echo ""
echo "  Iniciando conversión..."
echo ""

# --- Crear carpeta destino ---
mkdir -p "$DESTINO"

CONTADOR=0

# --- Función de conversión HEIC ---
convertir_heic() {
    local archivo="$1"
    CONTADOR=$((CONTADOR + 1))

    local RUTA_RELATIVA="${archivo#$ORIGEN}"
    local DIRECTORIO_RELATIVO="$(dirname "$RUTA_RELATIVA")"
    local NOMBRE="$(basename "$archivo" | sed 's/\.heic$//I')"

    mkdir -p "$DESTINO/$DIRECTORIO_RELATIVO"
    echo "  [$CONTADOR/$TOTAL] Convirtiendo: $RUTA_RELATIVA"

    if ! magick "$archivo" -quality 95 "$DESTINO/$DIRECTORIO_RELATIVO/$NOMBRE.jpg" 2>/dev/null; then
        sips -s format jpeg -s formatOptions 95 "$archivo" --out "$DESTINO/$DIRECTORIO_RELATIVO/$NOMBRE.jpg" &>/dev/null
        if [ $? -ne 0 ]; then
            echo "    > ERROR al convertir: $archivo"
        fi
    fi
}

# --- Función de conversión DNG (extrae el JPEG preview embebido por la cámara) ---
convertir_dng() {
    local archivo="$1"
    CONTADOR=$((CONTADOR + 1))

    local RUTA_RELATIVA="${archivo#$ORIGEN}"
    local DIRECTORIO_RELATIVO="$(dirname "$RUTA_RELATIVA")"
    local NOMBRE="$(basename "$archivo" | sed 's/\.dng$//I')"
    local BASE="${archivo%.*}"

    mkdir -p "$DESTINO/$DIRECTORIO_RELATIVO"
    echo "  [$CONTADOR/$TOTAL] Convirtiendo: $RUTA_RELATIVA"

    # Extraer el JPEG preview embebido en el DNG (procesado por la cámara, colores fieles)
    if dcraw -e "$archivo" 2>/dev/null; then
        local THUMB="${BASE}.thumb.jpg"
        if [ -f "$THUMB" ]; then
            mv "$THUMB" "$DESTINO/$DIRECTORIO_RELATIVO/$NOMBRE.jpg"
        else
            echo "    > ERROR: no se encontró el preview embebido en $archivo"
        fi
    else
        echo "    > ERROR al extraer preview de: $archivo"
    fi
}

# --- Convertir archivos HEIC ---
if [ "$TOTAL_HEIC" -gt 0 ]; then
    echo "  -- Convirtiendo HEIC --"
    while IFS= read -r archivo; do
        convertir_heic "$archivo"
    done < <(find "$ORIGEN" -iname "*.heic")
fi

# --- Convertir archivos DNG ---
if [ "$TOTAL_DNG" -gt 0 ]; then
    echo ""
    echo "  -- Convirtiendo DNG --"
    while IFS= read -r archivo; do
        convertir_dng "$archivo"
    done < <(find "$ORIGEN" -iname "*.dng")
fi

echo ""
echo "  ========================================"
echo "   Conversión completada"
echo "   Guardados en: $DESTINO"
echo "  ========================================"
echo ""
read -p "  Presiona Enter para salir..."
