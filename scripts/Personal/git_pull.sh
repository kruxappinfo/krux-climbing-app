#!/bin/bash

echo "=========================================="
echo "   ACTUALIZAR Y ARRANCAR KRUX"
echo "=========================================="

REPO_URL="https://github.com/kruxappinfo/krux.git"
REPO_DIR="$HOME/krux"
BRANCH="dev"
SCRIPTS_DIR="$(dirname "$0")"

# Verificar que git está instalado
if ! command -v git &> /dev/null; then
    echo "❌ Git no está instalado. Instálalo antes de continuar."
    exit 1
fi

# 1. Clonar o actualizar el repositorio
if [ -d "$REPO_DIR/.git" ]; then
    # Carpeta con git válido → pull
    echo "[1/2] Repositorio encontrado. Descargando últimos cambios..."
    cd "$REPO_DIR" || exit 1
    git checkout "$BRANCH"
    git pull origin "$BRANCH"

elif [ -d "$REPO_DIR" ]; then
    # Carpeta existe pero sin .git → inicializar y conectar
    echo "[1/2] Carpeta encontrada sin .git. Inicializando repositorio..."
    cd "$REPO_DIR" || exit 1
    git init
    git remote add origin "$REPO_URL"
    git fetch origin
    git checkout -b "$BRANCH" "origin/$BRANCH" 2>/dev/null || git checkout "$BRANCH"
    git pull origin "$BRANCH"

else
    # No existe nada → clonar desde cero
    echo "[1/2] Repositorio no encontrado. Clonando desde GitHub..."
    git clone -b "$BRANCH" "$REPO_URL" "$REPO_DIR" || { echo "❌ Error al clonar el repositorio."; exit 1; }
    cd "$REPO_DIR" || exit 1
fi

echo "✅ Repositorio actualizado."

# 2. Arrancar el servidor
echo ""
echo "[2/2] Arrancando servidor..."

CLEAN_HOSTS="$SCRIPTS_DIR/clean_hosts.sh"
if [ ! -f "$CLEAN_HOSTS" ]; then
    echo "❌ No se encontró clean_hosts.sh en: $CLEAN_HOSTS"
    exit 1
fi

bash "$CLEAN_HOSTS" "$REPO_DIR"
