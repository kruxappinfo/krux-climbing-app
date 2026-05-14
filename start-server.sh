#!/bin/bash
cd "$(dirname "$0")"
echo "🚀 Iniciando servidor local en http://localhost:8000"
echo "📁 Directorio: $(pwd)"
echo "Presiona Ctrl+C para detener"
echo ""
python3 -m http.server 8000
