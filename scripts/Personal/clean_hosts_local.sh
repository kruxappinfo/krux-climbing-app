#!/bin/bash

# Colores
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuración por defecto
HOSTS_FILE="/etc/hosts"
NUEVA_ENTRADA="127.0.0.1       localhost"
PUERTO_DEFAULT=8080

echo -e "${BLUE}=========================================="
echo "   LIMPIEZA Y DIAGNÓSTICO DE LOCALHOST"
echo "==========================================${NC}"
echo ""

# 1. Limpieza del archivo de hosts
echo -e "${YELLOW}[1/5] Limpiando archivo de hosts...${NC}"
sudo cp $HOSTS_FILE "${HOSTS_FILE}.bak"
sudo sed -i '' '/localhost/d' $HOSTS_FILE
sudo sed -i '' "1i\\
$NUEVA_ENTRADA
" $HOSTS_FILE
echo -e "${GREEN}✅ Archivo /etc/hosts restaurado y limpio.${NC}"

# 2. Identificar puertos activos
echo ""
echo -e "${YELLOW}[2/5] Buscando puertos activos...${NC}"
PUERTOS_ACTIVOS=$(sudo lsof -i -P -n 2>/dev/null | grep LISTEN | grep -E "127.0.0.1|localhost|\*")

if [ -z "$PUERTOS_ACTIVOS" ]; then
    echo -e "${YELLOW}⚠️  No se detectó ninguna APP corriendo en localhost actualmente.${NC}"
else
    echo -e "${GREEN}🚀 Puertos detectados actualmente:${NC}"
    echo "------------------------------------------"
    echo "$PUERTOS_ACTIVOS" | awk '{print "APP: " $1 " | PID: " $2 " | DIRECCIÓN: " $9}'
    echo "------------------------------------------"
fi

# 3. Seleccionar directorio
echo ""
echo -e "${YELLOW}[3/5] Selecciona el directorio a servir${NC}"
echo ""
echo "Opciones:"
echo "  1) Krux (raíz del proyecto)"
echo "  2) Krux/www (web optimizada)"
echo "  3) Ruta personalizada"
echo "  4) Cancelar"
echo ""
read -p "Elige opción (1-4): " OPCION

case $OPCION in
  1)
    RUTA_APP="/Users/jaimelillo/krux"
    NOMBRE_PROYECTO="Krux (raíz)"
    ;;
  2)
    RUTA_APP="/Users/jaimelillo/krux/www"
    NOMBRE_PROYECTO="Krux (www)"
    ;;
  3)
    read -p "Ingresa la ruta completa: " RUTA_APP
    NOMBRE_PROYECTO="Custom: $RUTA_APP"
    ;;
  4)
    echo -e "${YELLOW}Cancelado.${NC}"
    exit 0
    ;;
  *)
    echo -e "${RED}❌ Opción inválida.${NC}"
    exit 1
    ;;
esac

# 4. Verificar directorio
echo ""
echo -e "${YELLOW}[4/5] Verificando directorio...${NC}"
if [ ! -d "$RUTA_APP" ]; then
    echo -e "${RED}❌ El directorio $RUTA_APP no existe.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Directorio verificado: $RUTA_APP${NC}"

# 5. Seleccionar puerto
echo ""
echo -e "${YELLOW}[5/5] Configurar puerto${NC}"
read -p "Ingresa el puerto (default: $PUERTO_DEFAULT): " PUERTO_INPUT
PUERTO=${PUERTO_INPUT:-$PUERTO_DEFAULT}

# Validar que sea un número
if ! [[ "$PUERTO" =~ ^[0-9]+$ ]]; then
    echo -e "${RED}❌ Puerto inválido. Usando puerto $PUERTO_DEFAULT${NC}"
    PUERTO=$PUERTO_DEFAULT
fi

# Verificar puerto disponible
echo ""
echo -e "${YELLOW}Verificando disponibilidad del puerto $PUERTO...${NC}"
PID_EXISTENTE=$(lsof -ti :$PUERTO 2>/dev/null)
if [ -n "$PID_EXISTENTE" ]; then
    echo -e "${YELLOW}⚠️  Puerto $PUERTO ocupado (PID: $PID_EXISTENTE).${NC}"
    read -p "¿Liberar puerto? (s/n): " LIBERAR
    if [[ "$LIBERAR" =~ ^[Ss]$ ]]; then
        kill -9 $PID_EXISTENTE 2>/dev/null
        sleep 1
        echo -e "${GREEN}✅ Puerto $PUERTO liberado.${NC}"
    else
        echo -e "${YELLOW}Usando un puerto diferente...${NC}"
        for p in $(seq $((PUERTO+1)) $((PUERTO+10))); do
          if ! lsof -ti :$p >/dev/null 2>&1; then
            PUERTO=$p
            break
          fi
        done
        echo -e "${GREEN}Puerto disponible: $PUERTO${NC}"
    fi
fi

# Verificar Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3 no está instalado.${NC}"
    exit 1
fi

# Iniciar servidor
echo ""
echo -e "${BLUE}=========================================="
echo -e "${GREEN}🌐 Servidor activo en: http://localhost:$PUERTO"
echo -e "${GREEN}📂 Proyecto: $NOMBRE_PROYECTO"
echo -e "${GREEN}📁 Ruta: $RUTA_APP"
echo -e "${GREEN}🛑 Para detener: Ctrl + C"
echo -e "${BLUE}==========================================${NC}"
echo ""

cd "$RUTA_APP" || exit 1
python3 -m http.server $PUERTO
