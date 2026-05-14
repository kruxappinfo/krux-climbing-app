#!/bin/bash
# ============================================
# restart-server.sh
# Mata todos los servidores localhost y lanza uno nuevo
# ============================================

echo "🔍 Buscando servidores locales activos..."

# Puertos comunes de desarrollo
PORTS=(3000 5000 5173 5500 8000 8080 8888 4200 4000)

KILLED=0

for PORT in "${PORTS[@]}"; do
  PID=$(lsof -ti :$PORT 2>/dev/null)
  if [ -n "$PID" ]; then
    echo "   ⛔ Puerto $PORT → PID $PID → Matando..."
    kill -9 $PID 2>/dev/null
    KILLED=$((KILLED + 1))
  fi
done

if [ "$KILLED" -eq 0 ]; then
  echo "   No se encontraron servidores activos."
else
  echo "   ✅ $KILLED servidor(es) detenido(s)."
fi

# Esperar a que los puertos se liberen
sleep 1

echo ""
echo "🚀 Iniciando nuevo servidor en puerto 3000..."
echo "   URL: http://localhost:3000"
echo "   Ctrl+C para detener"
echo ""

npx serve . -l 3000
