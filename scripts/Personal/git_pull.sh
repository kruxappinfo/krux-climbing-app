#!/bin/bash

echo "=========================================="
echo "   ACTUALIZAR Y ARRANCAR KRUX"
echo "=========================================="

# 1. Ir al repositorio y hacer pull
echo "[1/2] Descargando últimos cambios de GitHub..."
cd ~/krux-climbing-app || { echo "❌ No se encontró la carpeta krux-climbing-app"; exit 1; }
git checkout dev
git pull
echo "✅ Repositorio actualizado."

# 2. Arrancar el servidor
echo ""
echo "[2/2] Arrancando servidor..."
bash /Users/jaimelillo/Documents/00_CODE/KRUX/SCRIPTS/clean_hosts.sh
