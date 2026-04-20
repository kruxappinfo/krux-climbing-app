#!/bin/bash

# Configuración
HOSTS_FILE="/etc/hosts"
NUEVA_ENTRADA="127.0.0.1       localhost"
RUTA_APP="/Users/jaimelillo/Documents/00_CODE/KRUX/krux-climbing-app"
PUERTO=8080

echo "=========================================="
echo "   LIMPIEZA Y DIAGNÓSTICO DE LOCALHOST"
echo "=========================================="

# 1. Limpieza del archivo de hosts
echo "[1/4] Limpiando archivo de hosts..."
sudo cp $HOSTS_FILE "${HOSTS_FILE}.bak"
sudo sed -i '' '/localhost/d' $HOSTS_FILE
sudo sed -i '' "1i\\
$NUEVA_ENTRADA
" $HOSTS_FILE
echo "✅ Archivo /etc/hosts restaurado y limpio."

# 2. Identificar el Prompt / Puerto activo
echo ""
echo "[2/4] Buscando puertos activos (Prompts)..."

PUERTOS_ACTIVOS=$(sudo lsof -i -P -n | grep LISTEN | grep -E "127.0.0.1|localhost|\*")

if [ -z "$PUERTOS_ACTIVOS" ]; then
    echo "⚠️  No se detectó ninguna APP corriendo en localhost actualmente."
else
    echo "🚀 Puertos detectados actualmente:"
    echo "------------------------------------------"
    echo "$PUERTOS_ACTIVOS" | awk '{print "APP: " $1 " | PID: " $2 " | DIRECCIÓN: " $9}'
    echo "------------------------------------------"
fi

# 3. Mostrar la ubicación de trabajo
echo ""
echo "[3/4] Directorio de trabajo configurado:"
echo "📂 $RUTA_APP"

# 4. Levantar servidor localhost con Python
echo ""
echo "[4/4] Iniciando servidor localhost..."

# Verificar que Python está instalado
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 no está instalado. Instálalo antes de continuar."
    exit 1
fi

# Verificar que el directorio existe
if [ ! -d "$RUTA_APP" ]; then
    echo "❌ El directorio $RUTA_APP no existe. Verifica la ruta."
    exit 1
fi

# Matar proceso previo en el mismo puerto (si existe)
PID_EXISTENTE=$(lsof -ti :$PUERTO 2>/dev/null)
if [ -n "$PID_EXISTENTE" ]; then
    echo "⚠️  Puerto $PUERTO ocupado (PID: $PID_EXISTENTE). Liberando..."
    kill -9 $PID_EXISTENTE 2>/dev/null
    sleep 1
    echo "✅ Puerto $PUERTO liberado."
fi

# Iniciar el servidor
cd "$RUTA_APP" || exit 1
echo "=========================================="
echo "🌐 Servidor activo en: http://localhost:$PUERTO"
echo "📂 Sirviendo desde: $RUTA_APP"
echo "🛑 Para detener: Ctrl + C"
echo "=========================================="
python3 -m http.server $PUERTO
