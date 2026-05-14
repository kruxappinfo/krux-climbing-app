#!/bin/bash
# ============================================
# Conversión de GeoJSON a Vector Tiles (.pbf)
# Usa tippecanoe de Mapbox
# ============================================

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Directorio base
BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CARTO_DIR="$BASE_DIR/Cartografia"
TILES_DIR="$BASE_DIR/tiles"

echo -e "${GREEN}=== Conversión GeoJSON → Vector Tiles ===${NC}"
echo "Directorio base: $BASE_DIR"

# Verificar tippecanoe
if ! command -v tippecanoe &> /dev/null; then
    echo -e "${RED}Error: tippecanoe no está instalado${NC}"
    echo "Instalar con: brew install tippecanoe"
    exit 1
fi

echo -e "${GREEN}✓ tippecanoe encontrado${NC}"

# Crear directorio de tiles
mkdir -p "$TILES_DIR"

# Función para convertir una escuela
convert_school() {
    local school_name="$1"
    local school_dir="$2"
    local output_dir="$TILES_DIR/$school_name"

    echo -e "\n${YELLOW}Procesando: $school_name${NC}"

    # Verificar que existen archivos
    if [ ! -d "$school_dir" ]; then
        echo -e "${RED}  Directorio no encontrado: $school_dir${NC}"
        return
    fi

    # Crear directorio de salida
    mkdir -p "$output_dir"

    # Buscar archivos GeoJSON
    local vias_file=$(find "$school_dir" -name "*[Vv]ias*.geojson" -o -name "*[Vv]ías*.geojson" | head -1)
    local sectores_file=$(find "$school_dir" -name "*[Ss]ector*.geojson" | head -1)
    local parkings_file=$(find "$school_dir" -name "*[Pp]arking*.geojson" | head -1)

    # Convertir vías (puntos) - zoom 14-20
    # IMPORTANTE: --no-simplification-of-shared-nodes y -r1 preservan TODOS los puntos
    if [ -n "$vias_file" ] && [ -f "$vias_file" ]; then
        echo -e "  ${GREEN}→ Convirtiendo vías...${NC}"
        tippecanoe \
            --output="$output_dir/vias.mbtiles" \
            --layer=vias \
            --minimum-zoom=14 \
            --maximum-zoom=20 \
            --no-feature-limit \
            --no-tile-size-limit \
            --no-tile-compression \
            -r1 \
            --cluster-distance=0 \
            --force \
            "$vias_file"

        # Extraer a directorio de tiles
        tile-join --output-to-directory="$output_dir/vias" --no-tile-compression --force "$output_dir/vias.mbtiles"
        rm "$output_dir/vias.mbtiles"
        echo -e "  ${GREEN}✓ Vías convertidas${NC}"
    else
        echo -e "  ${YELLOW}⚠ No se encontró archivo de vías${NC}"
    fi

    # Convertir sectores (líneas) - zoom 12-20
    if [ -n "$sectores_file" ] && [ -f "$sectores_file" ]; then
        echo -e "  ${GREEN}→ Convirtiendo sectores...${NC}"
        tippecanoe \
            --output="$output_dir/sectores.mbtiles" \
            --layer=sectores \
            --minimum-zoom=12 \
            --maximum-zoom=20 \
            --no-feature-limit \
            --no-tile-size-limit \
            --no-tile-compression \
            --no-simplification-of-shared-nodes \
            --no-line-simplification \
            --force \
            "$sectores_file"

        tile-join --output-to-directory="$output_dir/sectores" --no-tile-compression --force "$output_dir/sectores.mbtiles"
        rm "$output_dir/sectores.mbtiles"
        echo -e "  ${GREEN}✓ Sectores convertidos${NC}"
    else
        echo -e "  ${YELLOW}⚠ No se encontró archivo de sectores${NC}"
    fi

    # Convertir parkings (puntos) - zoom 10-20
    if [ -n "$parkings_file" ] && [ -f "$parkings_file" ]; then
        echo -e "  ${GREEN}→ Convirtiendo parkings...${NC}"
        tippecanoe \
            --output="$output_dir/parkings.mbtiles" \
            --layer=parkings \
            --minimum-zoom=10 \
            --maximum-zoom=20 \
            --no-feature-limit \
            --no-tile-size-limit \
            --no-tile-compression \
            -r1 \
            --cluster-distance=0 \
            --force \
            "$parkings_file"

        tile-join --output-to-directory="$output_dir/parkings" --no-tile-compression --force "$output_dir/parkings.mbtiles"
        rm "$output_dir/parkings.mbtiles"
        echo -e "  ${GREEN}✓ Parkings convertidos${NC}"
    else
        echo -e "  ${YELLOW}⚠ No se encontró archivo de parkings${NC}"
    fi
}

# Convertir Valeria
convert_school "valeria" "$CARTO_DIR/Valeria"

# Convertir San Martín
convert_school "sanmartin" "$CARTO_DIR/San Martin de ValdeIglesias"

# Convertir La Pedriza (si existe)
if [ -d "$CARTO_DIR/La Pedri" ]; then
    convert_school "lapedriza" "$CARTO_DIR/La Pedri"
fi

# Convertir Patones (si existe)
if [ -d "$CARTO_DIR/Patones" ]; then
    convert_school "patones" "$CARTO_DIR/Patones"
fi

# Convertir Mora (si existe)
if [ -d "$CARTO_DIR/Mora" ]; then
    convert_school "mora" "$CARTO_DIR/Mora"
fi

echo -e "\n${GREEN}=== Conversión completada ===${NC}"
echo "Tiles generados en: $TILES_DIR"
echo ""
echo "Estructura:"
find "$TILES_DIR" -type d -maxdepth 2 | head -20

echo -e "\n${GREEN}¡Listo! Los Vector Tiles están en ./tiles/${NC}"
