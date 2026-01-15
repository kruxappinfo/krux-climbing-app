/**
 * MapLibre GL JS - Configuración
 *
 * Este archivo contiene la configuración para MapLibre GL JS
 * Funciona en paralelo con Google Maps (cambiar USE_MAPLIBRE para activar)
 */

// ============================================
// FLAG DE ACTIVACIÓN - Cambiar a true para usar MapLibre
// ============================================
const USE_MAPLIBRE = true;

// ============================================
// API KEYS
// ============================================
const MAPLIBRE_CONFIG = {
  // MapTiler API Key (gratis hasta 100k tiles/mes)
  // Regístrate en: https://cloud.maptiler.com/
  MAPTILER_KEY: 'aXwFnFsCGVkn3u0cARNJ', // TODO: Reemplazar con tu key

  // Si no tienes key de MapTiler, el terreno 3D no funcionará
  // pero el mapa base PNOA sí (es gratis y público)
};

// ============================================
// FUENTES DE TILES
// ============================================
const TILE_SOURCES = {
  // PNOA - Ortofoto España via WMTS (GRATIS, sin límite, sin API key)
  // Usa GoogleMapsCompatible para compatibilidad con MapLibre
  pnoa: {
    url: 'https://www.ign.es/wmts/pnoa-ma?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=OI.OrthoimageCoverage&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg',
    attribution: '© <a href="https://www.ign.es">IGN España</a> - PNOA',
    maxzoom: 20
  },

  // Alternativa: PNOA via TMS (puede tener problemas con Y invertido)
  pnoaTMS: {
    url: 'https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma/{z}/{x}/{y}.jpeg',
    attribution: '© <a href="https://www.ign.es">IGN España</a> - PNOA',
    scheme: 'tms'
  },

  // Etiquetas CartoDB (GRATIS)
  labels: {
    url: 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    attribution: '© <a href="https://carto.com/">CARTO</a>'
  },

  // Terreno 3D MapTiler (requiere API key)
  terrain: {
    url: 'https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json',
    attribution: '© <a href="https://www.maptiler.com/">MapTiler</a>'
  },

  // Satélite MapTiler como fallback
  satellite: {
    url: 'https://api.maptiler.com/tiles/satellite-v2/tiles.json',
    attribution: '© <a href="https://www.maptiler.com/">MapTiler</a>'
  }
};

// ============================================
// COLORES POR GRADO (mismo esquema que app_3.js)
// ============================================
const MAPLIBRE_GRADE_COLORS = {
  // Grados principiantes (3-4) - Azules/Cyan
  "3a": "#e0f7fa", "3b": "#b2ebf2", "3c": "#80deea",
  "4a": "#4dd0e1", "4b": "#26c6da", "4c": "#00bcd4",

  // Grados fáciles (5) - Verdes
  "5a": "#d7ffaf", "5a+": "#c5f59a", "5b": "#a8e68f",
  "5b+": "#8cd97f", "5c": "#46923a", "5c+": "#3d8032",

  // Grados medios (6a-6b) - Amarillos
  "6a": "#fff48d", "6a+": "#ffeb3b", "6b": "#fdd835", "6b+": "#ffc107",

  // Grados medios-altos (6c-7a) - Naranjas
  "6c": "#fda750", "6c+": "#ff9800", "7a": "#ff6161", "7a+": "#f44336",

  // Grados difíciles (7b-7c) - Rojos
  "7b": "#e53935", "7b+": "#d32f2f", "7c": "#ce1616", "7c+": "#b71c1c",

  // Grados muy difíciles (8) - Rosas/Magentas
  "8a": "#f463ef", "8a+": "#e91e63", "8b": "#d81b60",
  "8b+": "#c2185b", "8c": "#ad1457", "8c+": "#8b00d9",

  // Grados de élite (9) - Púrpuras/Negro
  "9a": "#7b00b3", "9a+": "#6a0080", "9b": "#4a0066",
  "9b+": "#2d004d", "9c": "#1a0033", "9c+": "#0d001a"
};

// ============================================
// CONFIGURACIÓN POR ESCUELA
// ============================================
// Usar Vector Tiles (.pbf) para mejor rendimiento
// NOTA: Vector Tiles requieren servidor HTTP (no funcionan con file://)
// Poner a false para desarrollo local, true para producción con Firebase
const USE_VECTOR_TILES = false;

const MAPLIBRE_SCHOOLS = {
  valeria: {
    id: 'valeria',
    name: 'Valeria',
    center: [-2.148689501937383, 39.794890847822664], // [lng, lat] - MapLibre usa este orden
    zoom: 14,
    bounds: [[-2.16, 39.78], [-2.14, 39.79]], // [[sw], [ne]]
    // Vector Tiles (preferido - más rápido)
    tiles: {
      vias: 'tiles/valeria/vias/{z}/{x}/{y}.pbf',
      sectores: 'tiles/valeria/sectores/{z}/{x}/{y}.pbf',
      parkings: 'tiles/valeria/parkings/{z}/{x}/{y}.pbf'
    },
    // GeoJSON fallback
    geojson: {
      vias: 'Cartografia/Valeria/Valeria_Vias.geojson',
      sectores: 'Cartografia/Valeria/Valeria_Sectores.geojson',
      parkings: 'Cartografia/Valeria/Valeria_Parkings.geojson',
      puntosInteres: 'Cartografia/Valeria/Valeria_Puntos_interes.geojson',
      rutasAcceso: 'Cartografia/Valeria/Valeria_Rutas_acceso.geojson'
    },
    // ZOOMS CAPAS ESCUELAS
    zoomLevels: {
      sectores: 12,
      sectorNames: 16,
      vias: 17,  // desaparecen antes al hacer zoom out
      parkings: 15
    }
  },
  sanmartin: {
    id: 'sanmartin',
    name: 'San Martín de Valdeiglesias',
    center: [-4.3824, 40.4014],
    zoom: 16,
    bounds: [[-4.40, 40.39], [-4.36, 40.41]],
    // Vector Tiles (preferido - más rápido)
    tiles: {
      vias: 'tiles/sanmartin/vias/{z}/{x}/{y}.pbf',
      sectores: 'tiles/sanmartin/sectores/{z}/{x}/{y}.pbf',
      parkings: 'tiles/sanmartin/parkings/{z}/{x}/{y}.pbf'
    },
    // GeoJSON fallback
    geojson: {
      vias: 'Cartografia/San Martin de ValdeIglesias/SM_Vias.geojson',
      sectores: 'Cartografia/San Martin de ValdeIglesias/SM_Sectores.geojson',
      parkings: 'Cartografia/San Martin de ValdeIglesias/SM_Parkings.geojson',
      puntosInteres: null,
      rutasAcceso: null
    },
    zoomLevels: {
      sectores: 12,
      sectorNames: 16,
      vias: 17,  // desaparecen antes al hacer zoom out
      parkings: 15
    }
  },
  mora: {
    id: 'mora',
    name: 'Mora',
    center: [-3.7311935425851055, 39.68267117849315],
    zoom: 16,
    bounds: [[-3.736398366837896, 39.6774572033992], [-3.725928583739463, 39.68790292336315]],
    // Vector Tiles (preferido - más rápido)
    tiles: {
      vias: 'tiles/mora/vias/{z}/{x}/{y}.pbf',
      sectores: 'tiles/mora/sectores/{z}/{x}/{y}.pbf',
      parkings: 'tiles/mora/parkings/{z}/{x}/{y}.pbf'
    },
    // GeoJSON fallback
    geojson: {
      vias: 'Cartografia/Mora/Mora_Vias.geojson',
      sectores: 'Cartografia/Mora/Mora_Sectores.geojson',
      parkings: 'Cartografia/Mora/Mora_Parkings.geojson',
      puntosInteres: 'Cartografia/Mora/Puntos_interes.geojson',
      rutasAcceso: 'Cartografia/Mora/Mora_Rutas_acceso.geojson'
    },
    zoomLevels: {
      sectores: 12,
      sectorNames: 16,
      vias: 17,  // desaparecen antes al hacer zoom out
      parkings: 15
    }
  },
  aranjuez: {
    id: 'aranjuez',
    name: 'Aranjuez',
    center: [-3.5295, 40.0402],
    zoom: 16,
    bounds: [[-3.535, 40.038], [-3.524, 40.042]],
    // Vector Tiles (preferido - más rápido)
    tiles: {
      vias: 'tiles/aranjuez/vias/{z}/{x}/{y}.pbf',
      sectores: 'tiles/aranjuez/sectores/{z}/{x}/{y}.pbf',
      parkings: 'tiles/aranjuez/parkings/{z}/{x}/{y}.pbf'
    },
    // GeoJSON fallback
    geojson: {
      vias: 'Cartografia/Aranjuez/Aranjuez_vias.geojson',
      sectores: 'Cartografia/Aranjuez/Aranjuez_Sectores.geojson',
      parkings: 'Cartografia/Aranjuez/Aranjuez_Parkings.geojson',
      puntosInteres: 'Cartografia/Aranjuez/Aranjuez_Puntos_Acceso.geojson',
      rutasAcceso: 'Cartografia/Aranjuez/Aranjuez_Rutas_acceso.geojson'
    },
    zoomLevels: {
      sectores: 12,
      sectorNames: 16,
      vias: 17,  // desaparecen antes al hacer zoom out
      parkings: 15
    }
  },
  toledo: {
    id: 'toledo',
    name: 'Toledo',
    center: [-4.026143416417198, 39.85082431884038],
    zoom: 16,
    bounds: [[-4.035, 39.848], [-4.018, 39.856]],
    // Vector Tiles (preferido - más rápido)
    tiles: {
      vias: 'tiles/toledo/vias/{z}/{x}/{y}.pbf',
      sectores: 'tiles/toledo/sectores/{z}/{x}/{y}.pbf',
      parkings: 'tiles/toledo/parkings/{z}/{x}/{y}.pbf'
    },
    // GeoJSON fallback
    geojson: {
      vias: 'Cartografia/Toledo/Toledo_vias.geojson',
      sectores: 'Cartografia/Toledo/Toledo_Sectores.geojson',
      parkings: 'Cartografia/Toledo/Toledo_Parkings.geojson',
      puntosInteres: null,
      rutasAcceso: 'Cartografia/Toledo/Toledo_Rutas_acceso.geojson'
    },
    zoomLevels: {
      sectores: 12,
      sectorNames: 16,
      vias: 17,
      parkings: 15
    }
  }
};

// ============================================
// MARKERS DE ESCUELAS (para vista general del mapa)
// ============================================
const SCHOOL_MARKERS = [
  {
    id: 'patones',
    nombre: 'Pontón de la Oliva',
    coords: [-3.4436, 40.8874],
    zoom: 16,
    isOpen: false,
    rockType: 'Caliza'
  },
  {
    id: 'valeria',
    nombre: 'Hoz del Río Gritos',
    coords: [-2.1510, 39.7828],
    zoom: 17,
    isOpen: true,
    rockType: 'Caliza'
  },
  {
    id: 'pedriza',
    nombre: 'La Pedriza',
    coords: [-3.8891, 40.7545],
    zoom: 15,
    isOpen: false,
    rockType: 'Granito'
  },
  {
    id: 'sanmartin',
    nombre: 'San Martín de Valdeiglesias',
    coords: [-4.3824, 40.4014],
    zoom: 16,
    isOpen: true,
    rockType: 'Granito'
  },
  {
    id: 'cuenca',
    nombre: 'Cuenca',
    coords: [-2.1300, 40.0700],
    zoom: 15,
    isOpen: false,
    rockType: 'Caliza'
  },
  {
    id: 'toledo',
    nombre: 'Toledo',
    coords: [-4.026143416417198, 39.85082431884038],
    zoom: 15,
    isOpen: false,
    rockType: 'Caliza'
  },
  {
    id: 'mora',
    nombre: 'Mora',
    coords: [-3.7311935425851055, 39.68267117849315],
    zoom: 16,
    isOpen: false,
    rockType: 'Caliza'
  },
  {
    id: 'sella',
    nombre: 'Sella',
    coords: [-0.22812948065428965, 38.620683230379335],
    zoom: 15,
    isOpen: false,
    rockType: 'Caliza'
  },
  {
    id: 'aranjuez',
    nombre: 'Aranjuez',
    coords: [-3.5295, 40.0402],
    zoom: 16,
    isOpen: true,
    rockType: 'Caliza'
  },
];

// ============================================
// CONFIGURACIÓN DEL MAPA
// ============================================
const MAP_DEFAULTS = {
  center: [-3.2, 40.4], // Centro geográfico para mostrar todas las escuelas
  zoom: 8,              // Zoom para ver todos los marcadores
  minZoom: 5,
  maxZoom: 20,
  pitch: 0,        // Inclinación inicial (0 = vista cenital)
  bearing: 0,      // Rotación inicial
  maxPitch: 85,    // Máxima inclinación permitida
  terrain: {
    exaggeration: 1.5  // Exageración del relieve 3D
  }
};

// ============================================
// ESTILOS DE CAPAS
// ============================================
const LAYER_STYLES = {
  // Estilo de sectores (líneas)
  sectores: {
    type: 'line',
    paint: {
      'line-color': '#ffffff',
      'line-width': 2,
      'line-opacity': 0.9
    }
  },

  // Estilo de vías (puntos/círculos)
  vias: {
    type: 'circle',
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        16, 3.5,
        18, 5.5,
        20, 8
      ],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.95
    }
  },

  // Estilo de parkings (símbolos)
  parkings: {
    type: 'symbol',
    layout: {
      'icon-image': 'parking',
      'icon-size': 0.8,
      'icon-allow-overlap': true
    }
  }
};

// ============================================
// UTILIDADES
// ============================================

/**
 * Obtiene el color para un grado específico
 */
function getGradeColor(grade) {
  if (!grade) return '#888888';
  const normalizedGrade = grade.toLowerCase().trim();
  return MAPLIBRE_GRADE_COLORS[normalizedGrade] || '#888888';
}

/**
 * Genera expresión de color para MapLibre basada en grados
 */
function generateGradeColorExpression(property = 'grado1') {
  const matchArray = ['match', ['get', property]];

  Object.entries(MAPLIBRE_GRADE_COLORS).forEach(([grade, color]) => {
    matchArray.push(grade, color);
  });

  // Color por defecto
  matchArray.push('#888888');

  return matchArray;
}

console.log('MapLibre Config cargado. USE_MAPLIBRE =', USE_MAPLIBRE);
