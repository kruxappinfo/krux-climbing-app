// ================== VARIABLES GLOBALES ==================

// Modo desarrollo - cambiar a false en producción para desactivar logs
const DEBUG_MODE = false;
const log = DEBUG_MODE ? console.log.bind(console) : () => { };

let map;
let marker;
let geocoder;

let userMarker = null;
let userWatchId = null;
let isTrackingUser = false;
let userPulseInterval = null;

let currentSchoolId = "valeria";
let currentSchoolName = ""; // Will be set when school loads
const schoolState = {};

let parkingInfoWindow = null;
let routeInfoWindow = null;
let schoolInfoWindow = null;
let sectorHoverInfoWindow = null;

// Flag para evitar duplicar event listeners globales
let feedDropdownListenerAdded = false;

// ================== DONUT CHART INTERACTION ==================
// Delegated event handler for donut chart segments
document.addEventListener('click', function (e) {
  const path = e.target.closest('path[data-grade]');
  if (path) {
    e.preventDefault();
    e.stopPropagation();

    const svg = path.closest('svg');
    const chartContainer = path.closest('[data-chart-id]');
    if (!svg || !chartContainer) return;

    const chartId = chartContainer.getAttribute('data-chart-id');
    const grade = path.getAttribute('data-grade');
    const count = path.getAttribute('data-count');
    const color = path.getAttribute('data-color');
    const tx = parseFloat(path.getAttribute('data-tx')) || 0;
    const ty = parseFloat(path.getAttribute('data-ty')) || 0;

    // Reset all segments in this chart
    svg.querySelectorAll('path[data-grade]').forEach(function (p) {
      p.style.transform = '';
      p.setAttribute('data-selected', 'false');
    });

    // Highlight selected segment with pop-out effect
    path.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(1.1)';
    path.setAttribute('data-selected', 'true');

    // Update center label
    const valueEl = document.getElementById(chartId + '-value');
    const labelEl = document.getElementById(chartId + '-label');
    if (valueEl) {
      valueEl.textContent = grade;
      valueEl.style.color = color;
    }
    if (labelEl) {
      labelEl.textContent = count + ' Vías';
    }
    return;
  }

  // Click on chart container (not on segment) - reset
  const chartContainer = e.target.closest('[data-chart-id]');
  if (chartContainer && e.target.tagName !== 'path') {
    const chartId = chartContainer.getAttribute('data-chart-id');
    const total = chartContainer.getAttribute('data-total');
    const svg = chartContainer.querySelector('svg');

    if (svg) {
      svg.querySelectorAll('path[data-grade]').forEach(function (p) {
        p.style.transform = '';
        p.setAttribute('data-selected', 'false');
      });
    }

    const valueEl = document.getElementById(chartId + '-value');
    const labelEl = document.getElementById(chartId + '-label');
    if (valueEl) {
      valueEl.textContent = total;
      valueEl.style.color = '#C41E3A';
    }
    if (labelEl) {
      labelEl.textContent = 'Vías';
    }
  }
}, true);




const GRADE_COLORS = {
  // Beginner grades (3a-4c) - Blues
  "3a": "#0fcee8ff",
  "3b": "#08cae4ff",
  "3c": "#048b9dff",
  "4a": "#26aff4ff",
  "4b": "#0878b1ff",
  "4c": "#045781ff",
  // Easy grades (5a-5c) - Greens
  "5a": "#72d310ff",
  "5b": "#9fde61ff",
  "5c": "#46923aff",
  "5c+": "#46923aff",
  // Medium grades (6a-6c) - Yellows/Oranges
  "6a": "#d0c415ff",
  "6a+": "#eed809ff",
  "6b": "#f2d74fff",
  "6b+": "#f6d21dff",
  "6c": "#fda750ff",
  "6c+": "#fda750ff",
  // Hard grades (7a-7c) - Reds
  "7a": "#ff6161ff",
  "7a+": "#ff6161ff",
  "7b": "#e04545ff",
  "7b+": "#e04545ff",
  "7c": "#ce1616ff",
  "7c+": "#9a0808ff",
  // Elite grades (8a+) - Pinks/Magentas
  "8a": "#f463efff",
  "8a+": "#e936e3ff",
  "8b": "#e43dc0ff",
  "8b+": "#c80fa0ff",
  "8c": "#a200ff",
  "8c+": "#8b00d9",
  // World class grades (9a+) - Purples/Black
  "9a": "#7b00b3",
  "9a+": "#5c008c",
  "9b": "#400066",
  "9b+": "#2d004d",
  "9c": "#1a0033",
  "9c+": "#0d001a",
};

// SVGs for icons (Instagram style) - Global definition
const ICONS = {
  check: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  heart: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`,
  heartFilled: `<svg width="24" height="24" viewBox="0 0 24 24" fill="#ed4956" stroke="#ed4956" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`,
  bookmark: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`,
  bookmarkFilled: `<svg width="24" height="24" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`,
  comment: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>`,
  share: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`
};

// Config de zoom por escuela
const SCHOOL_CONFIGS = {
  valeria: {
    zoomLines: 14,       // líneas de sector
    zoomSectorNames: 16, // nombres de sector
    zoomGrades: 18,      // puntos + texto de vía (KML legacy)
    zoomGeoJSON: 20,     // puntos de vía (GeoJSON) - desaparecen antes
    zoomParking: 14,     // parking (visible desde zoom 14)
    center: { lat: 39.785, lng: -2.150 }
  },
  sanmartin: {
    zoomLines: 14,
    zoomSectorNames: 16,
    zoomGrades: 18,
    zoomGeoJSON: 20,
    zoomParking: 16,
    center: { lat: 40.4014, lng: -4.3824 }
  }
};

// GeoJSON paths per school
const SCHOOL_PATHS = {
  valeria: {
    folder: 'Cartografia/Valeria',
    vias: 'Valeria_Vias.geojson',
    sectores: 'Valeria_Sectores.geojson',
    parkings: 'Valeria_Parkings.geojson',
    puntosInteres: 'Valeria_Puntos_interes.geojson',
    rutasAcceso: 'Valeria_Rutas_acceso.geojson'
  },
  sanmartin: {
    folder: 'Cartografia/San Martin de ValdeIglesias',
    vias: 'SM_Vias.geojson',
    sectores: 'SM_Sectores.geojson',
    parkings: 'SM_Parkings.geojson',
    puntosInteres: null, // No disponible aún
    rutasAcceso: null    // No disponible aún
  }
};

// Expose for other modules
window.SCHOOL_PATHS = SCHOOL_PATHS;

// Datos de la escuela (usa tus KML ya cargados desde kmlData.js)
const KML_SECTORS = {};
const KML_GRADES = {};

const SCHOOL_DATA = {
  valeria: {
    sectors: KML_SECTORS,
    grades: KML_GRADES
  },
  sanmartin: {
    sectors: {},
    grades: {}
  }
};

// Orden "lógico" de grados
const GRADE_ORDER = [
  "3a", "3a+", "3b", "3b+", "3c", "3c+",
  "4a", "4a+", "4b", "4b+", "4c", "4c+",
  "5a", "5a+", "5b", "5b+", "5c", "5c+",
  "6a", "6a+", "6b", "6b+", "6c", "6c+",
  "7a", "7a+", "7b", "7b+", "7c", "7c+",
  "8a", "8a+", "8b", "8b+", "8c", "8c+",
  "9a", "9a+", "9b", "9b+", "9c", "9c+"
];

// Helper to fetch and count grades from GeoJSON
async function fetchSchoolStats(schoolId) {
  try {
    const paths = SCHOOL_PATHS[schoolId];
    if (!paths) {
      console.error(`No paths configured for school: ${schoolId}`);
      return null;
    }
    const url = `./${paths.folder}/${paths.vias}?v=${new Date().getTime()}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    const counts = {};

    if (data.features) {
      data.features.forEach(feature => {
        const props = feature.properties || {};
        const grade = props.grado1 || props.Grado || props.grade;
        if (grade && GRADE_COLORS[grade]) {
          counts[grade] = (counts[grade] || 0) + 1;
        }
      });
    }

    return counts;
  } catch (error) {
    console.error('Error fetching school stats:', error);
    return null;
  }
}

function getGradeStatsHTML(schoolId, externalCounts = null) {
  let counts = externalCounts;

  // Fallback to static data if no external counts provided
  if (!counts) {
    const data = SCHOOL_DATA[schoolId];
    if (!data || !data.grades) return "";

    // Contar vías por grado (solo grados con color y al menos 1 vía)
    counts = {};
    Object.entries(data.grades).forEach(([grade, vias]) => {
      if (!GRADE_COLORS[grade]) return; // ignora grados raros sin color
      const n = (vias && vias.length) || 0;
      if (n > 0) {
        counts[grade] = n;
      }
    });
  }

  const entries = Object.entries(counts);
  if (!entries.length) return "";

  // Ordenar por GRADE_ORDER
  entries.sort(([gA], [gB]) => {
    const iA = GRADE_ORDER.indexOf(gA);
    const iB = GRADE_ORDER.indexOf(gB);
    if (iA === -1 && iB === -1) return gA.localeCompare(gB);
    if (iA === -1) return 1;
    if (iB === -1) return -1;
    return iA - iB;
  });

  // Generate pie chart
  const pieChartHtml = generatePieChartForSchool(counts);

  return `
    <div class="school-grade-chart">
      ${pieChartHtml}
    </div>
  `;
}

// Helper to generate Pie Chart for School (similar to sector chart but for full school)
function generatePieChartForSchool(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return '';

  // Sort grades
  const sortedGrades = Object.keys(counts).sort((a, b) => {
    const iA = GRADE_ORDER.indexOf(a);
    const iB = GRADE_ORDER.indexOf(b);
    if (iA === -1 && iB === -1) return a.localeCompare(b);
    if (iA === -1) return 1;
    if (iB === -1) return -1;
    return iA - iB;
  });

  let slices = [];
  let cumulativePercent = 0;
  const uniqueId = 'donut-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);

  sortedGrades.forEach((grade, index) => {
    const count = counts[grade];
    const percent = count / total;

    const startAngle = 2 * Math.PI * cumulativePercent - Math.PI / 2;
    const endAngle = 2 * Math.PI * (cumulativePercent + percent) - Math.PI / 2;
    const midAngle = (startAngle + endAngle) / 2;

    const x1 = Math.cos(startAngle);
    const y1 = Math.sin(startAngle);
    const x2 = Math.cos(endAngle);
    const y2 = Math.sin(endAngle);

    const largeArc = percent > 0.5 ? 1 : 0;
    const pathData = `M 0 0 L ${x1} ${y1} A 1 1 0 ${largeArc} 1 ${x2} ${y2} Z`;

    const color = GRADE_COLORS[grade] || '#ccc';

    // Calculate translation for "pop out" effect (in pixels)
    const popDistance = 5;
    const tx = (Math.cos(midAngle) * popDistance).toFixed(2);
    const ty = (Math.sin(midAngle) * popDistance).toFixed(2);

    slices.push(`
      <path d="${pathData}" fill="${color}" stroke="white" stroke-width="0.02"
            data-selected="false"
            data-grade="${grade}"
            data-count="${count}"
            data-color="${color}"
            data-tx="${tx}"
            data-ty="${ty}"
            style="cursor: pointer; transform-origin: center; transition: transform 0.2s ease;">
      </path>
    `);

    cumulativePercent += percent;
  });

  return `
    <div style="text-align: center;">
      <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #555;">Vías por Grado</h4>

      <div data-chart-id="${uniqueId}" data-total="${total}" style="position: relative; width: 100px; height: 100px; margin: 0 auto;">
        <svg viewBox="-1.3 -1.3 2.6 2.6" style="width: 100%; height: 100%; overflow: visible;">
          ${slices.join('')}
        </svg>
        <div style="width: 60px; height: 60px; background: white; border-radius: 50%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; box-shadow: inset 0 0 10px rgba(0,0,0,0.05);">
          <span id="${uniqueId}-value" style="font-size: 18px; font-weight: bold; color: #C41E3A; transition: color 0.2s;">${total}</span>
          <span id="${uniqueId}-label" style="font-size: 9px; color: #666;">Vías</span>
        </div>
      </div>
    </div>
  `;
}



const kmlLayers = {};

function nudgeInfoWindowIfOverlapTopBar(attempt = 0) {
  if (!map || attempt > 8) return;

  const topBar = document.querySelector(".top-bar-wrapper");
  // Buscamos el InfoWindow VISIBLE (el que tiene dimensiones)
  const iws = document.querySelectorAll(".gm-style-iw-c");
  let iw = null;
  for (const el of iws) {
    if (el.offsetWidth > 0 && el.offsetHeight > 0) {
      iw = el;
      break;
    }
  }

  if (!topBar || !iw) {
    // Si no encontramos el IW visible, reintentamos un poco (puede estar renderizÃ¡ndose)
    if (attempt < 8) {
      setTimeout(() => nudgeInfoWindowIfOverlapTopBar(attempt + 1), 200);
    }
    return;
  }

  const barRect = topBar.getBoundingClientRect();
  const iwRect = iw.getBoundingClientRect();

  const margin = 10; // margen de seguridad reducido
  const overlap = (barRect.bottom + margin) - iwRect.top;

  if (overlap > 0) {
    // Mueve TODO el solape de golpe para que se lea bien
    map.panBy(0, -overlap);
  } else if (attempt < 8) {
    // Si no choca aún, reintentamos un poco despuÃ©s por si la imagen carga y crece
    setTimeout(() => nudgeInfoWindowIfOverlapTopBar(attempt + 1), 200);
  }
}

// ================== METEO (Open-Meteo) ==================

// FunciÃ³n helper para obtener la ruta de imagen del tiempo segÃºn el código WMO
function getWeatherIconPath(code) {
  if (code === 0) return 'icons/weather/sunny.png';
  if ([1, 2].includes(code)) return 'icons/weather/partly-cloudy.png';
  if (code === 3) return 'icons/weather/cloudy.png';
  if ([45, 48].includes(code)) return 'icons/weather/fog.png';
  if ([51, 53, 55].includes(code)) return 'icons/weather/light-rain.png';
  if ([61, 63, 65].includes(code)) return 'icons/weather/rain.png';
  if ([71, 73, 75].includes(code)) return 'icons/weather/snow.png';
  if ([95, 96, 99].includes(code)) return 'icons/weather/storm.png';
  return 'icons/weather/partly-cloudy.png';
}

async function fetchWeatherSummary(lat, lng) {
  try {
    // Pedimos variables actuales + probabilidad de lluvia horaria
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=precipitation_probability&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Error HTTP");

    const data = await res.json();
    const current = data.current;

    if (!current) return "Tiempo no disponible ahora mismo.";

    const temp = Math.round(current.temperature_2m);
    const wind = Math.round(current.wind_speed_10m);
    const humidity = Math.round(current.relative_humidity_2m);
    const code = current.weather_code;

    // Probabilidad de lluvia: cogemos la de la hora actual
    // data.hourly.time es un array de ISO strings. Buscamos el Ã­ndice de la hora actual.
    // SimplificaciÃ³n: usamos new Date().getHours() asumiendo que la API devuelve desde las 00:00 de hoy (o cerca)
    // Open-Meteo devuelve 7 dÃ­as por defecto, empezando hoy.
    // El Ã­ndice de "ahora" es aproximadamente la hora actual (0-23).
    const currentHour = new Date().getHours();
    const precipProb = data.hourly && data.hourly.precipitation_probability
      ? (data.hourly.precipitation_probability[currentHour] || 0)
      : 0;

    const weatherIconPath = getWeatherIconPath(code);

    return `
      <div class="weather-widget">
        <div class="weather-left-group">
          <div class="weather-main-row">
            <div class="weather-icon-large"><img src="${weatherIconPath}" alt="Tiempo" class="weather-icon-img"></div>
            <div class="weather-temp-large">${temp}°C</div>
          </div>
        </div>
        <div class="weather-details">
          <div>Precipitaciones: ${precipProb}%</div>
          <div>Humedad: ${humidity}%</div>
          <div class="weather-wind-row">
            <button type="button" class="weather-expand" aria-label="Ampliar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <span>Viento: ${wind} km/h</span>
          </div>
        </div>
      </div>
      <div class="weather-week weather-week-hidden"></div>
    `;
  } catch (e) {
    console.error(e);
    return "No se ha podido cargar el parte meteorológico.";
  }
}

// FunciÃ³n auxiliar para convertir direcciÃ³n del viento en flecha
function getWindArrow(degrees) {
  if (degrees === null || degrees === undefined) return "←";
  if (degrees >= 337.5 || degrees < 22.5) return "↓"; // N
  if (degrees >= 22.5 && degrees < 67.5) return "↗"; // NE
  if (degrees >= 67.5 && degrees < 112.5) return "→"; // E
  if (degrees >= 112.5 && degrees < 157.5) return "↘"; // SE
  if (degrees >= 157.5 && degrees < 202.5) return "↓"; // S
  if (degrees >= 202.5 && degrees < 247.5) return "↙"; // SW
  if (degrees >= 247.5 && degrees < 292.5) return "←"; // W
  if (degrees >= 292.5 && degrees < 337.5) return "↖"; // NW
  return "←";
}

async function fetchWeatherWeek(lat, lng) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,windspeed_10m_max,wind_direction_10m_dominant,precipitation_probability_max,precipitation_sum&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Error HTTP");

    const data = await res.json();
    const d = data.daily;
    if (!d || !d.time) return "Pronóstico semanal no disponible.";

    const html = d.time.map((iso, i) => {
      const date = new Date(iso);
      const dayName = date.toLocaleDateString("es-ES", { weekday: "long" }).toUpperCase();
      const dayNum = date.getDate();
      const monthName = date.toLocaleDateString("es-ES", { month: "long" }).toUpperCase();

      const tMin = Math.round(d.temperature_2m_min[i]);
      const tMax = Math.round(d.temperature_2m_max[i]);
      const wind = Math.round(d.windspeed_10m_max[i]);
      const windDir = d.wind_direction_10m_dominant ? d.wind_direction_10m_dominant[i] : null;
      const precipProb = d.precipitation_probability_max ? d.precipitation_probability_max[i] : 0;
      const precipAmt = d.precipitation_sum ? d.precipitation_sum[i] : 0;
      const code = d.weathercode[i];

      const weatherIconPath = getWeatherIconPath(code);
      const windArrow = getWindArrow(windDir);

      return `
        <div class="week-day-card">
          <div class="week-day-header">${dayName}, ${dayNum} ${monthName}</div>
          <div class="week-day-content">
            <div class="week-temps">
              <span class="week-temp-max">↑ ${tMax}°</span>
              <span class="week-temp-min">↓ ${tMin}°</span>
            </div>
            <div class="week-icon"><img src="${weatherIconPath}" alt="Tiempo" class="weather-icon-img"></div>
            <div class="week-details">
              <div class="week-precip"><img src="icons/weather/Gota.png" alt="Lluvia" class="precip-icon"> ${precipProb}% | ${precipAmt.toFixed(1)} mm</div>
              <div class="week-wind">${windArrow} ${wind} km/h</div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    return html;
  } catch (e) {
    console.error(e);
    return "No se ha podido cargar el pronóstico semanal.";
  }
}

// ================== FUNCIONES DE GOOGLE MAPS ELIMINADAS ==================
// Las siguientes funciones han sido eliminadas y reemplazadas por MapLibre:
// - loadAllSchools() -> ahora usa loadSchoolMarkers() en maplibre-map.js
// - loadParkingMarkers() -> ahora usa setupParkingsInteraction() en maplibre-map.js
// - loadSchool() -> ahora usa mlLoadSchool() en maplibre-map.js
// =========================================================================
function computeGradeSummary(schoolId) {
  const school = SCHOOL_DATA[schoolId];
  if (!school) return {};

  const out = {};

  Object.entries(school.grades).forEach(([grade, vias]) => {
    out[grade] = vias.length;
  });

  return out;
}

function renderGradeBars(summary) {
  const grades = Object.keys(summary).sort();

  return `
  <div class="grade-bars">
    ${grades
      .map(
        (g) => `
      <div class="grade-bar-item">
        <div class="grade-bar" 
             style="height:${summary[g] * 8}px; background:${GRADE_COLORS[g] || "#999"}">
        </div>
        <span class="grade-label">${g}</span>
      </div>
    `
      )
      .join("")}
  </div>
`;
}

// Helper to count grades for a specific sector
function getSectorGradeCounts(sectorName) {
  const counts = {};
  if (!map || !map.data) return counts;

  map.data.forEach((feature) => {
    const type = feature.getGeometry().getType();
    if (type === 'Point' || type === 'MultiPoint') {
      const s = feature.getProperty('sector');
      if (s && s.toLowerCase() === sectorName.toLowerCase()) {
        const grade = feature.getProperty('grado1') || feature.getProperty('Grado') || feature.getProperty('grade');
        if (grade) {
          counts[grade] = (counts[grade] || 0) + 1;
        }
      }
    }
  });
  return counts;
}

// Helper to generate Bar Chart HTML for Sector
function generatePieChartHtml(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return '';

  // Sort grades
  const sortedGrades = Object.keys(counts).sort((a, b) => {
    const iA = GRADE_ORDER.indexOf(a);
    const iB = GRADE_ORDER.indexOf(b);
    if (iA === -1 && iB === -1) return a.localeCompare(b);
    if (iA === -1) return 1;
    if (iB === -1) return -1;
    return iA - iB;
  });

  const maxCount = Math.max(...sortedGrades.map(g => counts[g]));
  const maxBarHeight = 40;

  const barsHtml = sortedGrades.map(grade => {
    const count = counts[grade];
    const height = Math.max(4, (count / maxCount) * maxBarHeight);
    const color = GRADE_COLORS[grade] || '#ccc';

    return `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
        <div style="font-size: 9px; color: #666; font-weight: 600;">${count}</div>
        <div style="width: 16px; height: ${height}px; background: ${color}; border-radius: 3px; transition: transform 0.2s;" 
             onmouseover="this.style.transform='scale(1.1)'" 
             onmouseout="this.style.transform='scale(1)'"></div>
        <div style="font-size: 8px; color: #888; font-weight: 500;">${grade}</div>
      </div>
    `;
  }).join('');

  return `
    <div style="margin-top: 15px; text-align: center; padding-top: 10px; border-top: 1px solid #eee;">
      <h4 style="margin: 0 0 15px 0; font-size: 14px; color: #555; padding-bottom: 8px;">
        Vías por Grado
        <span style="font-weight: normal; color: #888; font-size: 12px;">(${total} total)</span>
      </h4>
      
      <div style="display: flex; justify-content: center; align-items: flex-end; gap: 4px; padding: 10px 0;">
        ${barsHtml}
      </div>
    </div>
  `;
}

// ================== initMap ==================
// NOTA: Google Maps ha sido reemplazado por MapLibre GL JS
// Esta funciÃ³n ahora solo delega a MapLibre cuando USE_MAPLIBRE = true
// El código original de Google Maps ha sido eliminado

function initMap() {
  // Si MapLibre estÃ¡ activo, no hacer nada aquÃ­
  // MapLibre se inicializa desde maplibre-map.js via mlEnsureMapReady()
  if (typeof USE_MAPLIBRE !== 'undefined' && USE_MAPLIBRE) {
    console.log('initMap: Usando MapLibre GL JS (Google Maps desactivado)');
    return;
  }

  // Google Maps ya no estÃ¡ soportado
  console.error('Google Maps ha sido eliminado. Activa USE_MAPLIBRE = true en maplibre-config.js');
}

// ================== CÃƒâ€œDIGO DE GOOGLE MAPS ELIMINADO ==================
// El código original de Google Maps (aprox. 1800 líneas) ha sido eliminado.
// Todas las funciones de mapa ahora estÃ¡n en maplibre-map.js
// Funciones eliminadas:
// - InicializaciÃ³n de google.maps.Map
// - loadSchoolSectors, loadAutonomiasLayer
// - SectorLabelOverlay class
// - Listeners de zoom, click en sectores/vías
// - mainSchoolMarkers, parkingInfoWindow con Google
// - Geocoder y bÃºsqueda con Google Maps
// =====================================================================

// ================== GLOBAL EVENT LISTENERS ==================

// Global delegated event listener for action buttons
document.addEventListener('click', async (e) => {
  // 1. Check Button (Log Ascent)
  const checkBtn = e.target.closest('.check-btn');
  if (checkBtn) {
    const btnSchoolId = checkBtn.dataset.schoolId;
    const btnRouteName = checkBtn.dataset.routeName;
    const btnGrade = checkBtn.dataset.grade;
    const btnSector = checkBtn.dataset.sector;
    openAscentModal(btnSchoolId, currentSchoolName || btnSchoolId, btnRouteName, btnGrade, btnSector);
    return;
  }

  // 2. Favorite Button (Heart)
  const favBtn = e.target.closest('.fav-btn');
  if (favBtn) {
    if (!currentUser) {
      showToast('Inicia sesiÃ³n para guardar tus favoritos', 'info');
    }

    const type = favBtn.dataset.type;
    const id = favBtn.dataset.id;
    const name = favBtn.dataset.name;

    // Optimistic update
    const isActive = favBtn.classList.contains('active');
    favBtn.innerHTML = !isActive ? ICONS.heartFilled : ICONS.heart;
    favBtn.classList.toggle('active');

    if (currentUser) {
      await toggleFavorite(type, id, name);
    }
    return;
  }

  // 3. Save Button (Bookmark/Project)
  const saveBtn = e.target.closest('.save-btn');
  if (saveBtn) {
    if (!currentUser) {
      showToast('Inicia sesión para guardar proyectos', 'info');
    }

    const id = saveBtn.dataset.id;
    const name = saveBtn.dataset.name;
    const grade = saveBtn.dataset.grade;

    // Optimistic update
    const isActive = saveBtn.classList.contains('active');
    saveBtn.innerHTML = !isActive ? ICONS.bookmarkFilled : ICONS.bookmark;
    saveBtn.classList.toggle('active');

    if (currentUser) {
      await toggleProject(id, name, grade);
    }
    return;
  }

  // 4. Comment Button
  const commentBtn = e.target.closest('.comment-btn');
  if (commentBtn) {
    // Need to get title from data attribute or context
    const title = commentBtn.dataset.routeName;
    const schoolId = commentBtn.dataset.schoolId || currentSchoolId;

    log('Opening comments for:', title);
    if (typeof openCommentsModal === 'function') {
      openCommentsModal(schoolId, title);
    } else {
      console.error('openCommentsModal not found');
    }
    return;
  }

  // 5. Share Button
  const shareBtn = e.target.closest('.share-btn');
  if (shareBtn) {
    const shareData = {
      title: 'Climbmaps',
      text: shareBtn.dataset.text,
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        log('Error sharing:', err);
      }
    } else {
      // Fallback
      navigator.clipboard.writeText(window.location.href);
      showToast('Enlace copiado al portapapeles', 'success');
    }
    return;
  }

  // 6. Upload Photo Button
  const uploadBtn = e.target.closest('.upload-photo-btn');
  if (uploadBtn) {
    const schoolId = uploadBtn.dataset.schoolId;
    const routeName = uploadBtn.dataset.routeName;

    // Create file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = async (evt) => {
      const file = evt.target.files[0];
      if (!file) return;

      // Show loading toast
      showToast('Subiendo foto...', 'info');

      try {
        if (typeof uploadRoutePhoto === 'function') {
          await uploadRoutePhoto(schoolId, routeName, file);
          showToast('Foto subida correctamente', 'success');

          // Refresh the popup to show new photo
          // Trigger click on the same feature again
          if (routeInfoWindow) routeInfoWindow.close();
          if (schoolInfoWindow) schoolInfoWindow.close();
        } else {
          console.error('uploadRoutePhoto function not found');
          showToast('Error: función de subida no disponible', 'error');
        }
      } catch (error) {
        console.error('Error uploading photo:', error);
        showToast(error.message || 'Error subiendo foto', 'error');
      }
    };
    fileInput.click();
    return;
  }

  // 7. Photo Click (Enlarge with Carousel)
  const photoImg = e.target.closest('.route-main-photo-img');
  if (photoImg) {
    const container = photoImg.closest('.route-main-photo-container');
    const photosData = container ? container.dataset.photos : null;
    const currentIndex = container ? parseInt(container.dataset.currentIndex || 0) : 0;

    const overlay = document.getElementById('route-photo-overlay');
    const overlayImg = document.getElementById('route-photo-overlay-img');

    if (overlay && overlayImg) {
      if (photosData) {
        // Setup Overlay Carousel
        const photos = JSON.parse(decodeURIComponent(photosData));
        overlay.dataset.photos = photosData;
        overlay.dataset.currentIndex = currentIndex;

        overlayImg.src = photos[currentIndex].url;

        // Add/Update Navigation Buttons in Overlay
        let navContainer = overlay.querySelector('.overlay-nav-container');
        if (!navContainer) {
          navContainer = document.createElement('div');
          navContainer.className = 'overlay-nav-container';
          overlay.appendChild(navContainer);
        }

        if (photos.length > 1) {
          navContainer.innerHTML = `
            <button class="overlay-nav-btn prev" title="Anterior">Ã¢ÂÂ®</button>
            <button class="overlay-nav-btn next" title="Siguiente">Ã¢ÂÂ¯</button>
          `;
          // Set initial arrow visibility
          updateOverlayArrows(overlay, currentIndex, photos.length);
        } else {
          navContainer.innerHTML = '';
        }
      } else {
        // Fallback for single image without container data
        overlayImg.src = photoImg.dataset.fullUrl;
        const nav = overlay.querySelector('.overlay-nav-container');
        if (nav) nav.innerHTML = '';
      }

      overlay.classList.remove('hidden');
    }
    return;
  }

  // 8. Delete Photo Button
  const deletePhotoBtn = e.target.closest('.delete-photo-btn');
  if (deletePhotoBtn) {
    const photoId = deletePhotoBtn.dataset.photoId;
    const uploaderUid = deletePhotoBtn.dataset.uploaderUid;

    if (!confirm('¿Eliminar esta foto?')) return;

    showToast('Eliminando foto...', 'info');

    try {
      if (typeof deleteRoutePhoto === 'function') {
        await deleteRoutePhoto(photoId, uploaderUid);
        showToast('Foto eliminada correctamente', 'success');

        // Refresh popup
        if (routeInfoWindow) routeInfoWindow.close();
        if (schoolInfoWindow) schoolInfoWindow.close();
      } else {
        console.error('deleteRoutePhoto function not found');
        showToast('Error: función de eliminación no disponible', 'error');
      }
    } catch (error) {
      console.error('Error deleting photo:', error);
      showToast(error.message || 'Error eliminando foto', 'error');
    }
    return;
  }

  // 9. Carousel Navigation (Popup)
  const navZone = e.target.closest('.photo-nav-zone');
  if (navZone) {
    e.stopPropagation(); // Prevent map click or other bubbling
    const container = navZone.closest('.route-main-photo-container');
    if (!container) return;

    const photos = JSON.parse(decodeURIComponent(container.dataset.photos));
    let currentIndex = parseInt(container.dataset.currentIndex || 0);
    const isNext = navZone.classList.contains('next');

    // Calculate new index without looping
    let newIndex = currentIndex;
    if (isNext && currentIndex < photos.length - 1) {
      newIndex = currentIndex + 1;
    } else if (!isNext && currentIndex > 0) {
      newIndex = currentIndex - 1;
    } else {
      return; // At boundary, do nothing
    }

    // Update State
    container.dataset.currentIndex = newIndex;

    // Update Image
    const img = container.querySelector('.route-main-photo-img');
    const photo = photos[newIndex];
    img.src = photo.url;
    img.dataset.fullUrl = photo.url;

    // Update Delete Button
    const deleteBtn = container.querySelector('.main-delete-btn');
    if (deleteBtn) {
      deleteBtn.dataset.photoId = photo.id;
      deleteBtn.dataset.uploaderUid = photo.uploadedBy;
    }

    // Update arrow visibility
    updateCarouselArrows(container, newIndex, photos.length);
    return;
  }

  // 10. Overlay Navigation
  const overlayNavBtn = e.target.closest('.overlay-nav-btn');
  if (overlayNavBtn) {
    e.stopPropagation();
    const overlay = document.getElementById('route-photo-overlay');
    const overlayImg = document.getElementById('route-photo-overlay-img');

    if (!overlay.dataset.photos) return;

    const photos = JSON.parse(decodeURIComponent(overlay.dataset.photos));
    let currentIndex = parseInt(overlay.dataset.currentIndex || 0);
    const isNext = overlayNavBtn.classList.contains('next');

    // Calculate new index without looping
    let newIndex = currentIndex;
    if (isNext && currentIndex < photos.length - 1) {
      newIndex = currentIndex + 1;
    } else if (!isNext && currentIndex > 0) {
      newIndex = currentIndex - 1;
    } else {
      return; // At boundary, do nothing
    }

    overlay.dataset.currentIndex = newIndex;
    overlayImg.src = photos[newIndex].url;

    // Update arrow visibility
    updateOverlayArrows(overlay, newIndex, photos.length);
    return;
  }

  // 11. Feed Action Buttons (Like, Comment, Share, Bookmark)
  const feedActionBtn = e.target.closest('.feed-action-btn');
  if (feedActionBtn && feedActionBtn.dataset.action) {
    e.stopPropagation();
    const action = feedActionBtn.dataset.action;
    const postId = feedActionBtn.dataset.postId;

    if (!postId) return;

    switch (action) {
      case 'like':
        await handleFeedLike(postId, feedActionBtn);
        break;
      case 'comment':
        await handleFeedComment(postId, feedActionBtn);
        break;
      case 'bookmark':
        await handleFeedBookmark(postId, feedActionBtn);
        break;
    }
    return;
  }

  // 12. Inline Comment Form Submission
  const commentForm = e.target.closest('.feed-comment-form');
  if (commentForm && (e.target.matches('.feed-comment-submit') || e.target.closest('.feed-comment-submit'))) {
    e.preventDefault();
    e.stopPropagation();
    const commentsSection = commentForm.closest('.feed-comments-section');
    const postId = commentsSection?.dataset.postId;
    if (postId) {
      await handleInlineCommentSubmit(postId, commentForm);
    }
    return;
  }
});

// Helper function to update carousel arrow visibility
function updateCarouselArrows(container, currentIndex, totalPhotos) {
  const prevZone = container.querySelector('.photo-nav-zone.prev');
  const nextZone = container.querySelector('.photo-nav-zone.next');

  if (prevZone) {
    prevZone.style.display = currentIndex > 0 ? 'flex' : 'none';
  }
  if (nextZone) {
    nextZone.style.display = currentIndex < totalPhotos - 1 ? 'flex' : 'none';
  }
}

// Helper function to update overlay arrow visibility
function updateOverlayArrows(overlay, currentIndex, totalPhotos) {
  const navContainer = overlay.querySelector('.overlay-nav-container');
  if (!navContainer) return;

  const prevBtn = navContainer.querySelector('.overlay-nav-btn.prev');
  const nextBtn = navContainer.querySelector('.overlay-nav-btn.next');

  if (prevBtn) {
    prevBtn.style.display = currentIndex > 0 ? 'flex' : 'none';
  }
  if (nextBtn) {
    nextBtn.style.display = currentIndex < totalPhotos - 1 ? 'flex' : 'none';
  }
}

// ================== FEED & NAVIGATION LOGIC ==================

document.addEventListener('DOMContentLoaded', () => {
  initFeed();
  initNavigation();
  initProfile();
  initNotifications();
  initMessages();
  initGlobalSearch();
  initImageLightbox(); // Inicializar lightbox de imÃ¡genes
  initProfileBackButton(); // Inicializar botÃ³n de retroceso de perfil
  // Ensure we start in feed view with correct UI state (hidden search bar, etc.)
  switchView('feed-view');

  // Ocultar splash screen cuando la app estÃ© lista (solo en Capacitor)
  setTimeout(() => {
    if (window.hideSplashScreen && typeof window.hideSplashScreen === 'function') {
      window.hideSplashScreen();
      console.log('[App] App completamente cargada - splash screen ocultado');
    }
  }, 500); // PequeÃ±o delay para asegurar que todo estÃ© renderizado
});

// ================== GLOBAL SEARCH ==================
function initGlobalSearch() {
  const searchBtn = document.getElementById('nav-search-btn');
  const searchInput = document.getElementById('global-search-input');
  const resultsContainer = document.getElementById('search-results');
  const tabs = document.querySelectorAll('.search-tab');

  if (!searchBtn || !searchInput || !resultsContainer) return;

  let currentType = 'all';
  let searchTimeout = null;

  // Search Button - Focus input (View switch handled by initNavigation)
  searchBtn.addEventListener('click', () => {
    // Wait for view transition
    setTimeout(() => {
      searchInput.focus();
    }, 100);
  });

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentType = tab.dataset.type;

      const query = searchInput.value.trim();
      if (query.length >= 2) {
        performSearch(query, currentType);
      }
    });
  });

  // Search input with debounce
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();

    if (searchTimeout) clearTimeout(searchTimeout);

    if (query.length < 2) {
      resultsContainer.innerHTML = '<p class="search-placeholder">Escribe para buscar...</p>';
      return;
    }

    searchTimeout = setTimeout(() => {
      performSearch(query, currentType);
    }, 500);
  });

  async function performSearch(query, type) {
    if (!query || query.length < 2) {
      resultsContainer.innerHTML = '<p class="search-placeholder">Escribe para buscar...</p>';
      return;
    }

    resultsContainer.innerHTML = '<div class="loading-spinner">Buscando...</div>';

    let html = '';

    // Search Users
    if (type === 'all' || type === 'users') {
      const users = await searchUsersGlobal(query);
      if (users.length > 0) {
        html += `<div class="search-section-title">Perfiles</div>`;

        for (const user of users) {
          // Skip current user
          if (currentUser && user.id === currentUser.uid) continue;

          // Check if already following
          let isFollowing = false;
          if (currentUser) {
            try {
              const followDoc = await db.collection('users')
                .doc(currentUser.uid)
                .collection('following')
                .doc(user.id)
                .get();
              isFollowing = followDoc.exists;
            } catch (e) {
              console.error('Check follow status error', e);
            }
          }

          const btnClass = isFollowing ? 'follow-btn following' : 'follow-btn';
          const btnText = isFollowing ? 'Siguiendo' : 'Seguir';

          // Use common avatar fallback
          const avatarUrl = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}&background=e5e7eb&color=6b7280`;

          html += `
            <div class="search-result-item" onclick="openPublicProfile('${user.id}')" style="cursor: pointer;">
              <img src="${avatarUrl}" class="search-result-avatar" alt="${user.displayName}" referrerPolicy="no-referrer" onerror="this.src='https://ui-avatars.com/api/?name=U&background=e5e7eb&color=6b7280'; this.onerror=null;">
              <div class="search-result-info">
                <div class="search-result-name">${user.displayName || 'Usuario'}</div>
                <div class="search-result-meta">${user.bio || 'Escalador'}</div>
              </div>
              <button class="${btnClass}" onclick="event.stopPropagation(); toggleFollow('${user.id}', this)">${btnText}</button>
            </div>
          `;
        }
      }
    }

    // Search Places (Mock)
    if (type === 'all' || type === 'places') {
      const places = searchPlacesMock(query);
      if (places.length > 0) {
        html += `<div class="search-section-title">Lugares</div>`;
        places.forEach(place => {
          html += `
             <div class="search-result-item" data-place-id="${place.id}">
               <div class="search-result-icon">📍</div>
               <div class="search-result-info">
                 <div class="search-result-name">${place.name}</div>
                 <div class="search-result-meta">${place.type} • ${place.routes} vías</div>
               </div>
             </div>
           `;
        });
      }
    }

    // Search Tags (Mock)
    if (type === 'all' || type === 'tags') {
      const tags = searchTagsMock(query);
      if (tags.length > 0) {
        html += `<div class="search-section-title">Hashtags</div>`;
        tags.forEach(tag => {
          html += `
             <div class="search-result-item" data-tag="${tag.name}">
               <div class="search-result-icon">#</div>
               <div class="search-result-info">
                 <div class="search-result-name">#${tag.name}</div>
                 <div class="search-result-meta">${tag.count} publicaciones</div>
               </div>
             </div>
           `;
        });
      }
    }

    if (!html) {
      html = '<p class="search-placeholder">No se encontraron resultados</p>';
    }

    resultsContainer.innerHTML = html;
  }

  // Real search for users in Firestore
  async function searchUsersGlobal(query) {
    try {
      const queryLower = query.toLowerCase();
      // Approach 1: Try to search with displayNameLower field
      let snapshot = await db.collection('users')
        .orderBy('displayNameLower')
        .startAt(queryLower)
        .endAt(queryLower + '\uf8ff')
        .limit(10)
        .get();

      if (snapshot.empty) {
        // Approach 2: Fallback to client side filter
        // console.log('No displayNameLower results, trying fallback...');
        const allUsersSnapshot = await db.collection('users').limit(50).get();
        const filtered = allUsersSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(user => {
            const name = (user.displayName || '').toLowerCase();
            const email = (user.email || '').toLowerCase();
            return name.includes(queryLower) || email.includes(queryLower);
          })
          .slice(0, 10);
        return filtered;
      }
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error searching users:', error);
      // Try fallback approach if index error
      if (error.code === 'failed-precondition' || error.message.includes('index')) {
        try {
          const allUsersSnapshot = await db.collection('users').limit(50).get();
          const filtered = allUsersSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(user => {
              const name = (user.displayName || '').toLowerCase();
              return name.includes(query.toLowerCase());
            })
            .slice(0, 10);
          return filtered;
        } catch (e) { return []; }
      }
      return [];
    }
  }

  function searchPlacesMock(query) {
    const places = [
      { id: 'valeria', name: 'Valeria', type: 'Escuela', routes: 150 },
      { id: 'sanmartin', name: 'San Martí­n de Valdeiglesias', type: 'Escuela', routes: 200 },
      { id: 'siurana', name: 'Siurana', type: 'Escuela', routes: 450 },
      { id: 'margalef', name: 'Margalef', type: 'Escuela', routes: 500 },
      { id: 'rodellar', name: 'Rodellar', type: 'Escuela', routes: 300 }
    ];
    return places.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));
  }

  function searchTagsMock(query) {
    const tags = [
      { name: 'climbing', count: 1250 },
      { name: 'escalada', count: 980 },
      { name: 'boulder', count: 750 },
      { name: 'sportclimbing', count: 620 },
      { name: 'redpoint', count: 340 },
      { name: 'flash', count: 280 },
      { name: 'onsight', count: 210 }
    ];
    return tags.filter(t => t.name.toLowerCase().includes(query.toLowerCase()));
  }
}

// ================== UNIFIED PROFILE VIEWER ==================
// Store the previous view to return to when viewing other profiles
let previousViewBeforeProfile = 'feed-view';
// Store currently viewed profile userId (null = own profile)
let currentProfileUserId = null;
// Loading state to prevent race conditions
let profileLoadingState = {
  isLoading: false,
  currentLoadId: null, // Track which profile is being loaded to cancel stale requests
  postsLoaded: false,
  likesLoaded: false,
  statsLoaded: false
};

/**
 * Reset all profile state before loading new data
 * FIX #1: Prevents state leak between profiles
 */
function resetProfileState() {
  profileLoadingState.postsLoaded = false;
  profileLoadingState.likesLoaded = false;
  profileLoadingState.statsLoaded = false;

  // Clear avatar immediately to prevent flash of old image
  const avatar = document.getElementById('profile-avatar');
  if (avatar) {
    avatar.src = 'https://ui-avatars.com/api/?name=...&background=e5e7eb&color=6b7280&size=100';
  }

  // FIX #2: Clear tab contents to prevent data bleeding
  const postsGrid = document.getElementById('profile-grid');
  const likedGrid = document.getElementById('profile-liked-grid');
  if (postsGrid) postsGrid.innerHTML = '<div class="loading-spinner">Cargando...</div>';
  if (likedGrid) likedGrid.innerHTML = '<div class="loading-spinner">Cargando...</div>';

  // Reset stats to 0 while loading
  const elements = ['stat-followers', 'stat-following', 'total-ascents', 'max-grade', 'zones-visited'];
  elements.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = id === 'max-grade' ? '-' : '0';
  });

  // Reset tabs to first tab
  const profileView = document.getElementById('profile-view');
  if (profileView) {
    profileView.querySelectorAll('.profile-tab').forEach((tab, i) => {
      tab.classList.toggle('active', i === 0);
    });
    profileView.querySelectorAll('.profile-tab-content').forEach((content, i) => {
      content.classList.toggle('active', i === 0);
    });
  }
}

/**
 * Open a user's profile (own or other) in the unified profile-view
 * @param {string} userId - The user ID to view
 */
window.openPublicProfile = async function (userId) {
  // Generate unique load ID to handle race conditions
  const loadId = Date.now().toString();
  profileLoadingState.currentLoadId = loadId;
  profileLoadingState.isLoading = true;

  // If viewing own profile, just switch to profile view normally
  if (currentUser && currentUser.uid === userId) {
    currentProfileUserId = null;
    resetProfileState();
    switchView('profile-view');
    configureProfileViewForOwnProfile();
    await initProfile();
    profileLoadingState.isLoading = false;
    return;
  }

  // Store current view before navigating
  const currentActiveView = document.querySelector('.view.active:not(.hidden)');
  if (currentActiveView && currentActiveView.id !== 'profile-view') {
    previousViewBeforeProfile = currentActiveView.id;
  }

  // Set the current profile being viewed
  currentProfileUserId = userId;

  // FIX #1: Reset state BEFORE switching view to prevent flash of old data
  resetProfileState();

  // Navigate to profile view
  switchView('profile-view');

  // Configure UI for viewing OTHER user's profile
  configureProfileViewForOtherProfile();

  // Show loading state
  document.getElementById('profile-header-username').textContent = '@...';
  document.getElementById('profile-bio').textContent = '';
  document.getElementById('profile-name').textContent = '';

  try {
    // Check if this request is still valid (prevents race conditions)
    if (profileLoadingState.currentLoadId !== loadId) {
      console.log('Profile load cancelled - newer request in progress');
      return;
    }

    // Fetch user data
    const userDoc = await db.collection('users').doc(userId).get();

    // Check again after async operation
    if (profileLoadingState.currentLoadId !== loadId) {
      return;
    }

    if (!userDoc.exists) {
      showToast('Usuario no encontrado', 'error');
      goBackFromProfile();
      return;
    }

    const userData = userDoc.data();
    const displayName = userData.displayName || 'Usuario';

    // FIX #1: Set avatar with proper fallback
    const avatar = document.getElementById('profile-avatar');
    if (avatar && profileLoadingState.currentLoadId === loadId) {
      setAvatarWithFallback(avatar, userData.photoURL, displayName, 100);
    }

    // Populate header with username and profile with displayname
    document.getElementById('profile-header-username').textContent = `@${userData.username || displayName.toLowerCase().replace(/\s+/g, '')}`;
    document.getElementById('profile-name').textContent = displayName;
    document.getElementById('profile-location').textContent = userData.location || 'España';
    document.getElementById('profile-bio').textContent = userData.bio || 'Sin biografí­a';
    document.getElementById('profile-category').textContent = '🧗 Escalador';

    // FIX #3: Load stats, follow status, posts, and likes in parallel with Promise.all
    const stats = userData.stats || {};

    // Setup follow button
    const followBtn = document.getElementById('profile-follow-btn');
    followBtn.dataset.userId = userId;

    // FIX: Load real follower/following counts by querying subcollections
    const [isFollowing, realFollowersCount, realFollowingCount] = await Promise.all([
      currentUser ? checkFollowStatus(userId) : Promise.resolve(false),
      getRealFollowersCount(userId),
      getRealFollowingCount(userId)
    ]);

    // Cargar posts, likes y stats en paralelo
    await Promise.all([
      loadProfilePostsForUser(userId, loadId),
      loadProfileLikedPostsForUser(userId, loadId),
      loadProfileClimbingStatsForUser(userId, loadId)
    ]);

    // Update stats with real counts from subcollections
    document.getElementById('stat-followers').textContent = realFollowersCount;
    document.getElementById('stat-following').textContent = realFollowingCount;

    // Check if still valid after parallel loads
    if (profileLoadingState.currentLoadId !== loadId) {
      return;
    }

    // Update follow button state
    if (isFollowing) {
      followBtn.classList.add('following');
      followBtn.classList.remove('profile-btn-primary');
      followBtn.textContent = 'Siguiendo';
    } else {
      followBtn.classList.remove('following');
      followBtn.classList.add('profile-btn-primary');
      followBtn.textContent = 'Seguir';
    }

    // Follow button click handler (with closure to capture correct userId)
    followBtn.onclick = async function () {
      const targetUserId = this.dataset.userId;
      await window.toggleFollow(targetUserId, followBtn);
      const nowFollowing = followBtn.classList.contains('following');
      if (nowFollowing) {
        followBtn.classList.remove('profile-btn-primary');
      } else {
        followBtn.classList.add('profile-btn-primary');
      }
      // Update follower count
      const currentCount = parseInt(document.getElementById('stat-followers').textContent) || 0;
      document.getElementById('stat-followers').textContent = nowFollowing ? currentCount + 1 : Math.max(0, currentCount - 1);
    };

    // Message button click handler (with closure)
    const messageBtn = document.getElementById('profile-message-btn');
    const cachedUserData = { displayName, photoURL: userData.photoURL || '' };
    messageBtn.onclick = async function () {
      if (window.openChatWithConversation) {
        await window.openChatWithConversation(userId, cachedUserData);
      }
    };

    // Setup social buttons (followers/following)
    setupProfileSocialButtonsForUser(userId);

    // Initialize tabs for profile navigation
    initProfileTabs();

    profileLoadingState.isLoading = false;

  } catch (error) {
    console.error('Error loading public profile:', error);
    if (profileLoadingState.currentLoadId === loadId) {
      showToast('Error cargando perfil', 'error');
      goBackFromProfile();
    }
    profileLoadingState.isLoading = false;
  }
};

/**
 * Configure profile-view for viewing OWN profile
 */
function configureProfileViewForOwnProfile() {
  // Hide back header
  const backHeader = document.getElementById('profile-back-header');
  if (backHeader) backHeader.classList.add('hidden');

  // Show settings button
  const settingsBtn = document.getElementById('profile-settings-btn');
  if (settingsBtn) settingsBtn.style.display = 'flex';

  // Show own profile actions (Edit/Share)
  const ownActions = document.getElementById('own-profile-actions');
  if (ownActions) ownActions.classList.remove('hidden');

  // Hide other profile actions (Follow/Message)
  const otherActions = document.getElementById('other-profile-actions');
  if (otherActions) otherActions.classList.add('hidden');

  // Update tab labels
  const postsLabel = document.getElementById('profile-tab-posts-label');
  if (postsLabel) postsLabel.textContent = 'Mis Publicaciones';

  currentProfileUserId = null;
}

/**
 * Configure profile-view for viewing OTHER user's profile
 */
function configureProfileViewForOtherProfile() {
  // Show back header
  const backHeader = document.getElementById('profile-back-header');
  if (backHeader) backHeader.classList.remove('hidden');

  // Hide settings button
  const settingsBtn = document.getElementById('profile-settings-btn');
  if (settingsBtn) settingsBtn.style.display = 'none';

  // Hide own profile actions (Edit/Share)
  const ownActions = document.getElementById('own-profile-actions');
  if (ownActions) ownActions.classList.add('hidden');

  // Show other profile actions (Follow/Message)
  const otherActions = document.getElementById('other-profile-actions');
  if (otherActions) otherActions.classList.remove('hidden');

  // Update tab labels
  const postsLabel = document.getElementById('profile-tab-posts-label');
  if (postsLabel) postsLabel.textContent = 'Publicaciones';
}

/**
 * Go back from profile to previous view
 */
function goBackFromProfile() {
  // Cancel any pending loads
  profileLoadingState.currentLoadId = null;
  profileLoadingState.isLoading = false;
  currentProfileUserId = null;
  switchView(previousViewBeforeProfile);
}

/**
 * Initialize the back button for profile view
 */
function initProfileBackButton() {
  const backBtn = document.getElementById('profile-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', goBackFromProfile);
  }
}

/**
 * Load and render posts for a specific user in profile-view
 * FIX #2 & #3: Accepts loadId to prevent stale data rendering
 * @param {string} userId - User ID to load posts for
 * @param {string} loadId - Optional load ID to validate request is still current
 */
async function loadProfilePostsForUser(userId, loadId = null) {
  console.log('[DEBUG loadProfilePostsForUser] userId recibido:', userId);
  console.log('[DEBUG loadProfilePostsForUser] currentProfileUserId:', currentProfileUserId);
  console.log('[DEBUG loadProfilePostsForUser] loadId:', loadId);

  const container = document.getElementById('profile-grid');
  if (!container) return;

  // Don't show loading if already has loading spinner (set by resetProfileState)
  if (!container.innerHTML.includes('loading-spinner')) {
    container.innerHTML = '<div class="loading-spinner">Cargando publicaciones...</div>';
  }

  try {
    const posts = await loadUserPosts(userId);

    // FIX #3: Check if this request is still valid before rendering
    if (loadId && profileLoadingState.currentLoadId !== loadId) {
      console.log('Posts load cancelled - stale request');
      return;
    }

    if (posts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📍·</div>
          <div class="empty-state-text">No hay publicaciones aún</div>
        </div>
      `;
      profileLoadingState.postsLoaded = true;
      return;
    }

    if (currentUser) {
      try {
        const userDoc = await Promise.race([
          db.collection('users').doc(currentUser.uid).get(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ]);

        // Check again after async operation
        if (loadId && profileLoadingState.currentLoadId !== loadId) {
          return;
        }

        const userData = userDoc.exists ? userDoc.data() : {};
        const savedPosts = new Set(userData.savedPosts || []);

        posts.forEach(post => {
          const likesArray = post.likes || [];
          post.liked = Array.isArray(likesArray) && likesArray.includes(currentUser.uid);
          post.likesCount = Array.isArray(likesArray) ? likesArray.length : (typeof likesArray === 'number' ? likesArray : 0);
          post.bookmarked = savedPosts.has(post.id);
        });
      } catch (error) {
        console.error('Error loading user interactions:', error);
        // Continue without user interaction data - just set defaults
        posts.forEach(post => {
          const likesArray = post.likes || [];
          post.liked = false;
          post.likesCount = Array.isArray(likesArray) ? likesArray.length : 0;
          post.bookmarked = false;
        });
      }
    }

    // Final check before DOM manipulation
    if (loadId && profileLoadingState.currentLoadId !== loadId) {
      return;
    }

    // FIX #2: Clear container completely before rendering new posts
    container.innerHTML = '';
    posts.forEach(post => {
      renderPostCard(post, container);
    });

    attachFeedEventListeners(container);
    profileLoadingState.postsLoaded = true;

  } catch (error) {
    console.error('Error loading profile posts:', error);
    if (!loadId || profileLoadingState.currentLoadId === loadId) {
      container.innerHTML = '<p class="error-message">Error cargando publicaciones</p>';
    }
  }
}

/**
 * Load and render liked posts for a specific user in profile-view
 * FIX #2 & #3: Accepts loadId to prevent stale data rendering
 * @param {string} userId - User ID to load likes for
 * @param {string} loadId - Optional load ID to validate request is still current
 */
async function loadProfileLikedPostsForUser(userId, loadId = null) {
  const container = document.getElementById('profile-liked-grid');
  if (!container) return;

  // Don't show loading if already has loading spinner
  if (!container.innerHTML.includes('loading-spinner')) {
    container.innerHTML = '<div class="loading-spinner">Cargando me gusta...</div>';
  }

  try {
    const allPostsSnapshot = await Promise.race([
      db.collection('posts')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
    ]);

    // FIX #3: Check if this request is still valid
    if (loadId && profileLoadingState.currentLoadId !== loadId) {
      console.log('Likes load cancelled - stale request');
      return;
    }

    const likedPosts = [];
    allPostsSnapshot.forEach(doc => {
      const data = doc.data();
      const likesArray = data.likes || [];

      if (Array.isArray(likesArray) && likesArray.includes(userId)) {
        likedPosts.push({
          id: doc.id,
          ...data,
          liked: currentUser ? likesArray.includes(currentUser.uid) : false,
          likesCount: likesArray.length
        });
      }
    });

    // Check again before rendering
    if (loadId && profileLoadingState.currentLoadId !== loadId) {
      return;
    }

    if (likedPosts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">x</div>
          <div class="empty-state-text">No hay me gusta aún</div>
        </div>
      `;
      profileLoadingState.likesLoaded = true;
      return;
    }

    // FIX #2: Clear container completely before rendering
    container.innerHTML = '';
    likedPosts.forEach(post => {
      renderPostCard(post, container);
    });

    attachFeedEventListeners(container);
    profileLoadingState.likesLoaded = true;

  } catch (error) {
    console.error('Error loading profile likes:', error);
    if (!loadId || profileLoadingState.currentLoadId === loadId) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">x</div>
          <div class="empty-state-text">Error al cargar. Verifica tu conexión.</div>
        </div>
      `;
    }
  }
}

/**
 * Load climbing statistics for a specific user
 * FIX #3: Accepts loadId to prevent stale data rendering
 * @param {string} userId - User ID to load stats for
 * @param {string} loadId - Optional load ID to validate request is still current
 */
async function loadProfileClimbingStatsForUser(userId, loadId = null) {
  try {
    const ascentsSnapshot = await db.collection('ascents')
      .where('userId', '==', userId)
      .get();

    // FIX #3: Check if this request is still valid before updating DOM
    if (loadId && profileLoadingState.currentLoadId !== loadId) {
      console.log('Stats load cancelled - stale request');
      return;
    }

    let totalAscents = ascentsSnapshot.size;
    let maxGrade = '-';
    const zones = new Set();
    let maxGradeValue = -1;

    ascentsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.schoolId) zones.add(data.schoolId);

      const grade = data.grade;
      if (grade) {
        const gradeValue = getGradeValue(grade);
        if (gradeValue > maxGradeValue) {
          maxGradeValue = gradeValue;
          maxGrade = grade;
        }
      }
    });

    // Final check before DOM update
    if (loadId && profileLoadingState.currentLoadId !== loadId) {
      return;
    }

    const totalAscentsEl = document.getElementById('total-ascents');
    const maxGradeEl = document.getElementById('max-grade');
    const zonesVisitedEl = document.getElementById('zones-visited');

    if (totalAscentsEl) totalAscentsEl.textContent = totalAscents;
    if (maxGradeEl) maxGradeEl.textContent = maxGrade;
    if (zonesVisitedEl) zonesVisitedEl.textContent = zones.size;

    profileLoadingState.statsLoaded = true;

  } catch (error) {
    console.error('Error loading climbing stats:', error);
    // Set default values even on error to prevent undefined display
    const totalAscentsEl = document.getElementById('total-ascents');
    const maxGradeEl = document.getElementById('max-grade');
    const zonesVisitedEl = document.getElementById('zones-visited');

    if (totalAscentsEl) totalAscentsEl.textContent = '0';
    if (maxGradeEl) maxGradeEl.textContent = '-';
    if (zonesVisitedEl) zonesVisitedEl.textContent = '0';
  }
}

/**
 * Check if current user is following a specific user
 * @param {string} userId - The user ID to check
 * @returns {Promise<boolean>} - True if following, false otherwise
 */
async function checkFollowStatus(userId) {
  const authUser = firebase.auth().currentUser;
  if (!authUser || !userId) return false;

  try {
    const followingDoc = await db.collection('users')
      .doc(authUser.uid)
      .collection('following')
      .doc(userId)
      .get();

    return followingDoc.exists;
  } catch (error) {
    console.error('Error checking follow status:', error);
    return false;
  }
}

/**
 * Get the REAL count of followers (only counting users that actually exist)
 * This fixes the bug where deleted/orphaned users inflate the counter
 * Optimized version with batching to avoid Firestore errors
 */
async function getRealFollowersCount(userId) {
  if (!userId) return 0;

  try {
    const snapshot = await db.collection('users')
      .doc(userId)
      .collection('followers')
      .get();

    if (snapshot.empty) return 0;

    // Get all follower IDs
    const followerIds = snapshot.docs.map(doc => doc.id);

    // Process in batches of 10 to avoid overwhelming Firestore
    const batchSize = 10;
    let existingCount = 0;

    for (let i = 0; i < followerIds.length; i += batchSize) {
      const batch = followerIds.slice(i, i + batchSize);
      const promises = batch.map(uid =>
        db.collection('users').doc(uid).get()
          .then(doc => doc.exists ? 1 : 0)
          .catch(() => 0)
      );
      const results = await Promise.all(promises);
      existingCount += results.reduce((sum, val) => sum + val, 0);
    }

    return existingCount;
  } catch (error) {
    console.error('Error getting real followers count:', error);
    // Fallback: return the count from stats if available
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      return userDoc.data()?.stats?.followersCount || 0;
    } catch (e) {
      return 0;
    }
  }
}

/**
 * Get the REAL count of following (only counting users that actually exist)
 * This fixes the bug where deleted/orphaned users inflate the counter
 * Optimized version with batching to avoid Firestore errors
 */
async function getRealFollowingCount(userId) {
  if (!userId) return 0;

  try {
    const snapshot = await db.collection('users')
      .doc(userId)
      .collection('following')
      .get();

    if (snapshot.empty) return 0;

    // Get all following IDs
    const followingIds = snapshot.docs.map(doc => doc.id);

    // Process in batches of 10 to avoid overwhelming Firestore
    const batchSize = 10;
    let existingCount = 0;

    for (let i = 0; i < followingIds.length; i += batchSize) {
      const batch = followingIds.slice(i, i + batchSize);
      const promises = batch.map(uid =>
        db.collection('users').doc(uid).get()
          .then(doc => doc.exists ? 1 : 0)
          .catch(() => 0)
      );
      const results = await Promise.all(promises);
      existingCount += results.reduce((sum, val) => sum + val, 0);
    }

    return existingCount;
  } catch (error) {
    console.error('Error getting real following count:', error);
    // Fallback: return the count from stats if available
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      return userDoc.data()?.stats?.followingCount || 0;
    } catch (e) {
      return 0;
    }
  }
}

/**
 * Setup social buttons (followers/following) for a specific user
 * Works for both own profile (currentUser) and public profiles
 */
function setupProfileSocialButtonsForUser(userId) {
  if (!userId) {
    console.error('setupProfileSocialButtonsForUser: userId is required');
    return;
  }

  const followersBtn = document.querySelector('[data-modal="followers"]');
  const followingBtn = document.querySelector('[data-modal="following"]');

  if (!followersBtn || !followingBtn) {
    console.warn('Social buttons not found in DOM');
    return;
  }

  // Store userId in data attribute for debugging and reference
  followersBtn.setAttribute('data-user-id', userId);
  followingBtn.setAttribute('data-user-id', userId);

  // Remove all existing listeners by cloning
  const newFollowersBtn = followersBtn.cloneNode(true);
  followersBtn.parentNode.replaceChild(newFollowersBtn, followersBtn);

  // Re-set the data attribute after cloning
  newFollowersBtn.setAttribute('data-user-id', userId);
  newFollowersBtn.onclick = function () {
    const targetUserId = this.getAttribute('data-user-id') || userId;
    console.log('Opening followers for user:', targetUserId);
    openSocialListForUser(targetUserId, 'followers');
  };

  const newFollowingBtn = followingBtn.cloneNode(true);
  followingBtn.parentNode.replaceChild(newFollowingBtn, followingBtn);

  // Re-set the data attribute after cloning
  newFollowingBtn.setAttribute('data-user-id', userId);
  newFollowingBtn.onclick = function () {
    const targetUserId = this.getAttribute('data-user-id') || userId;
    console.log('Opening following for user:', targetUserId);
    openSocialListForUser(targetUserId, 'following');
  };
}

/**
 * Open social list modal for a specific user
 * Optimized with batching to avoid Firestore errors
 */
async function openSocialListForUser(userId, type) {
  console.log('openSocialListForUser called:', { userId, type });

  if (!userId) {
    console.error('openSocialListForUser: userId is required');
    return;
  }

  const modal = document.getElementById('social-list-modal');
  const container = document.getElementById('social-list-container');
  const title = document.getElementById('social-list-title');

  if (!modal || !container) {
    console.error('Modal or container not found');
    return;
  }

  title.textContent = type === 'followers' ? 'Seguidores' : 'Siguiendo';
  container.innerHTML = '<div class="loading-spinner" style="padding: 40px; text-align: center;">Cargando...</div>';
  modal.classList.remove('hidden');

  try {
    const subCollection = type === 'followers' ? 'followers' : 'following';
    console.log(`Fetching ${subCollection} for user:`, userId);

    const snapshot = await db.collection('users')
      .doc(userId)
      .collection(subCollection)
      .get();

    console.log(`Found ${snapshot.size} ${subCollection}`);

    if (snapshot.empty) {
      const emptyText = type === 'followers' ? 'No hay seguidores aún' : 'No sigue a nadie aún';
      container.innerHTML = `
        <div class="social-list-empty">
          <div class="social-list-empty-icon">${type === 'followers' ? '💥' : 'x'}</div>
          <p>${emptyText}</p>
        </div>
      `;
      return;
    }

    const userIds = snapshot.docs.map(doc => doc.id);

    // Process in batches to avoid overwhelming Firestore
    const batchSize = 10;
    const usersData = [];

    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const promises = batch.map(async (uid) => {
        try {
          const userDoc = await db.collection('users').doc(uid).get();
          if (userDoc.exists) {
            return { id: uid, ...userDoc.data() };
          }
          return null;
        } catch (e) {
          console.error('Error fetching user:', uid, e);
          return null;
        }
      });
      const results = await Promise.all(promises);
      usersData.push(...results.filter(u => u !== null));
    }

    if (usersData.length === 0) {
      container.innerHTML = `
        <div class="social-list-empty">
          <div class="social-list-empty-icon">😅</div>
          <p>No se pudieron cargar los usuarios</p>
        </div>
      `;
      return;
    }

    // Render users with follow buttons
    // Use firebase.auth().currentUser instead of global currentUser variable
    const authUser = firebase.auth().currentUser;
    let html = '';

    for (const user of usersData) {
      const isMe = authUser && user.id === authUser.uid;
      let isFollowing = false;

      if (!isMe && authUser) {
        isFollowing = await checkFollowStatus(user.id);
      }

      const btnClass = isFollowing ? 'social-list-btn following' : 'social-list-btn follow';
      const btnText = isFollowing ? 'Siguiendo' : 'Seguir';

      html += `
        <div class="social-list-item">
          <img src="${user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}&background=e5e7eb&color=6b7280&size=50`}"
               class="social-list-avatar"
               onclick="document.getElementById('social-list-modal').classList.add('hidden'); openPublicProfile('${user.id}')"
               style="cursor: pointer;">
          <div class="social-list-info" onclick="document.getElementById('social-list-modal').classList.add('hidden'); openPublicProfile('${user.id}')" style="cursor: pointer;">
            <div class="social-list-name">${user.displayName || 'Usuario'}</div>
            <div class="social-list-bio">${user.bio || 'Escalador'}</div>
          </div>
          ${!isMe && authUser ? `
            <button class="${btnClass}"
                    onclick="event.stopPropagation(); toggleFollow('${user.id}', this);
                             this.classList.toggle('following');
                             this.classList.toggle('follow');
                             this.textContent = this.classList.contains('following') ? 'Siguiendo' : 'Seguir';">
              ${btnText}
            </button>
          ` : ''}
        </div>
      `;
    }

    container.innerHTML = html;

  } catch (error) {
    console.error('Error loading social list:', error);
    container.innerHTML = `
      <div class="social-list-empty">
        <div class="social-list-empty-icon">x</div>
        <p>Error cargando lista</p>
      </div>
    `;
  }
}

/**
 * Load and render posts for public profile "Publicaciones" tab
 */
async function loadPublicProfilePosts(userId) {
  const container = document.getElementById('pp-ascents-list');
  if (!container) return;

  container.innerHTML = '<div class="loading-spinner">Cargando publicaciones...</div>';

  try {
    // Load posts using the same function as own profile
    const posts = await loadUserPosts(userId);

    if (posts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📍·</div>
          <div class="empty-state-text">No hay publicaciones aún</div>
        </div>
      `;
      return;
    }

    // Load current user's likes and bookmarks if logged in
    if (currentUser) {
      try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const savedPosts = new Set(userData.savedPosts || []);

        posts.forEach(post => {
          const likesArray = post.likes || [];
          post.liked = Array.isArray(likesArray) && likesArray.includes(currentUser.uid);
          post.likesCount = Array.isArray(likesArray) ? likesArray.length : (typeof likesArray === 'number' ? likesArray : 0);
          post.bookmarked = savedPosts.has(post.id);
        });
      } catch (error) {
        console.error('Error loading user interactions:', error);
      }
    }

    // Clear container and render posts using the same component as feed
    container.innerHTML = '';
    posts.forEach(post => {
      renderPostCard(post, container);
    });

    // Attach event listeners for post interactions
    attachFeedEventListeners(container);

  } catch (error) {
    console.error('Error loading public profile posts:', error);
    container.innerHTML = '<p class="error-message">Error cargando publicaciones</p>';
  }
}

/**
 * Load and render posts that the user has liked for "Me gusta" tab
 */
async function loadPublicProfileLikes(userId) {
  const container = document.getElementById('pp-posts-grid');
  if (!container) return;

  container.innerHTML = '<div class="loading-spinner">Cargando me gusta...</div>';

  try {
    // Get all posts where the user has liked (similar to renderLikedPosts)
    const allPostsSnapshot = await db.collection('posts')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const likedPosts = [];
    allPostsSnapshot.forEach(doc => {
      const data = doc.data();
      const likesArray = data.likes || [];

      // Check if the visited user liked this post
      if (Array.isArray(likesArray) && likesArray.includes(userId)) {
        likedPosts.push({
          id: doc.id,
          ...data,
          photos: data.photos || (data.photo ? [data.photo] : []),
          time: data.createdAt ? formatTimeAgo(data.createdAt.toDate()) : 'Ahora',
          liked: currentUser && likesArray.includes(currentUser.uid),
          likesCount: likesArray.length
        });
      }
    });

    // Sort by creation date (most recent first)
    likedPosts.sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || new Date(0);
      const bTime = b.createdAt?.toDate?.() || new Date(0);
      return bTime - aTime;
    });

    if (likedPosts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">???</div>
          <div class="empty-state-text">No ha dado me gusta a nada aún</div>
        </div>
      `;
      return;
    }

    // Load current user's bookmarks if logged in
    if (currentUser) {
      try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const savedPosts = new Set(userData.savedPosts || []);

        likedPosts.forEach(post => {
          post.bookmarked = savedPosts.has(post.id);
        });
      } catch (error) {
        console.error('Error loading user bookmarks:', error);
      }
    }

    // Clear container and render posts
    container.innerHTML = '';
    likedPosts.forEach(post => {
      renderPostCard(post, container);
    });

    // Attach event listeners for post interactions
    attachFeedEventListeners(container);

  } catch (error) {
    console.error('Error loading public profile likes:', error);

    // Fallback without orderBy
    try {
      const allPostsSnapshot = await db.collection('posts')
        .limit(100)
        .get();

      const likedPosts = [];
      allPostsSnapshot.forEach(doc => {
        const data = doc.data();
        const likesArray = data.likes || [];

        if (Array.isArray(likesArray) && likesArray.includes(userId)) {
          likedPosts.push({
            id: doc.id,
            ...data,
            photos: data.photos || (data.photo ? [data.photo] : []),
            time: data.createdAt ? formatTimeAgo(data.createdAt.toDate()) : 'Ahora',
            liked: currentUser && likesArray.includes(currentUser.uid),
            likesCount: likesArray.length
          });
        }
      });

      likedPosts.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(0);
        return bTime - aTime;
      });

      if (likedPosts.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">x</div>
            <div class="empty-state-text">No ha dado me gusta a nada aún</div>
        </div>
      `;
        return;
      }

      // Load current user's bookmarks
      if (currentUser) {
        try {
          const userDoc = await db.collection('users').doc(currentUser.uid).get();
          const userData = userDoc.exists ? userDoc.data() : {};
          const savedPosts = new Set(userData.savedPosts || []);
          likedPosts.forEach(post => {
            post.bookmarked = savedPosts.has(post.id);
          });
        } catch (error) {
          console.error('Error loading user bookmarks:', error);
        }
      }

      container.innerHTML = '';
      likedPosts.forEach(post => {
        renderPostCard(post, container);
      });

      attachFeedEventListeners(container);

    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
      container.innerHTML = '<p class="error-message">Error cargando me gusta</p>';
    }
  }
}

async function loadPublicProfileClimbingStats(userId) {
  try {
    // Get ascents using the helper function from user-features.js
    // The function is exposed globally via window object
    const getUserAscents = window.getUserAscentsByUserId;
    const renderStats = window.renderPublicProfileClimbingStats;

    if (typeof getUserAscents === 'function') {
      const ascents = await getUserAscents(userId, 100);
      if (typeof renderStats === 'function') {
        renderStats(ascents);
      } else {
        console.warn('renderPublicProfileClimbingStats function not found');
      }
    } else {
      console.warn('getUserAscentsByUserId function not found');
    }
  } catch (error) {
    console.error('Error loading public profile climbing stats:', error);
  }
}

function setupPublicProfileTabs(userId) {
  const tabs = document.querySelectorAll('.pp-tab');

  tabs.forEach(tab => {
    tab.onclick = async function () {
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Show corresponding content
      const targetId = tab.dataset.tab;
      document.querySelectorAll('.pp-tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(targetId)?.classList.add('active');

      // Load content based on active tab
      if (targetId === 'pp-ascents-tab' && userId) {
        // "Publicaciones" tab - load posts
        await loadPublicProfilePosts(userId);
      } else if (targetId === 'pp-posts-tab' && userId) {
        // "Me gusta" tab - load liked posts
        await loadPublicProfileLikes(userId);
      }
    };
  });
}

function initMessages() {
  const btn = document.getElementById('messages-btn');
  const dropdown = document.getElementById('messages-dropdown');
  const list = document.getElementById('messages-list');
  const badge = document.getElementById('messages-badge');
  const notificationDropdown = document.getElementById('notification-dropdown');

  if (!btn || !dropdown || !list) return;

  let conversations = [];
  let unsubscribeConversations = null;

  // Update badge with unread count
  function updateBadge() {
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
      badge.classList.add('hidden');
      return;
    }

    const unreadCount = conversations.reduce((total, conv) => {
      return total + (conv.unreadCount?.[currentUser.uid] || 0);
    }, 0);

    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // Format time for display
  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Ahora';
    if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)} h`;
    if (diff < 604800000) return `Hace ${Math.floor(diff / 86400000)} d`;
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  // Render conversations list
  function renderConversations() {
    const currentUser = firebase.auth().currentUser;

    if (!currentUser || conversations.length === 0) {
      list.innerHTML = `
        <div class="messages-empty">
          <div class="messages-empty-icon">x</div>
          <div class="messages-empty-text">No tienes conversaciones</div>
          <div class="messages-empty-hint">Visita el perfil de un usuario para enviarle un mensaje</div>
        </div>
      `;
      return;
    }

    list.innerHTML = conversations.map(conv => {
      const other = window.MessagingService?.getOtherParticipant(conv);
      if (!other) return '';

      const isUnread = (conv.unreadCount?.[currentUser.uid] || 0) > 0;
      const preview = conv.lastMessage || 'Sin mensajes';
      const time = formatTime(conv.lastMessageTime || conv.updatedAt);
      const avatar = other.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(other.displayName)}&background=667eea&color=fff`;

      return `
        <div class="message-item ${isUnread ? 'unread' : ''}" data-conversation-id="${conv.id}" data-recipient-id="${other.id}" data-recipient-name="${other.displayName}" data-recipient-photo="${avatar}">
          <img src="${avatar}" class="message-avatar" alt="${other.displayName}" referrerPolicy="no-referrer" onerror="this.src='${generateAvatarFallback(other.displayName, 44)}'; this.onerror=null;">
          <div class="message-content">
            <div class="message-sender">${other.displayName}</div>
            <div class="message-preview">${preview}</div>
            <div class="message-time">${time}</div>
          </div>
          ${isUnread ? '<div class="message-unread-dot"></div>' : ''}
          <button class="message-delete-btn" data-conv-id="${conv.id}" title="Eliminar conversación">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    // Delete button handler
    list.querySelectorAll('.message-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent opening the chat
        const convId = btn.dataset.convId;
        const confirmed = await showConfirm('¿Eliminar esta conversación? Esta acción no se puede deshacer.', 'Eliminar conversación');
        if (confirmed) {
          if (window.MessagingService) {
            await window.MessagingService.deleteConversation(convId);
          }
        }
      });
    });

    // Click handler to open chat
    list.querySelectorAll('.message-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // Don't open chat if clicking the delete button
        if (e.target.closest('.message-delete-btn')) return;

        const conversationId = item.dataset.conversationId;
        const recipientId = item.dataset.recipientId;
        const recipientName = item.dataset.recipientName;
        const recipientPhoto = item.dataset.recipientPhoto;

        // Mark as read
        if (window.MessagingService) {
          window.MessagingService.markAsRead(conversationId);
        }

        // Open chat
        if (window.openChatWithUser) {
          window.openChatWithUser({
            id: conversationId,
            recipientId: recipientId,
            sender: recipientName,
            avatar: recipientPhoto,
            isRealConversation: true
          });
        }

        dropdown.classList.add('hidden');
      });
    });
  }

  // Setup real-time listener for conversations
  function setupConversationsListener() {
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) return;

    if (unsubscribeConversations) {
      unsubscribeConversations();
    }

    if (window.MessagingService) {
      unsubscribeConversations = window.MessagingService.subscribeToConversations((convs) => {
        conversations = convs;
        updateBadge();
        if (!dropdown.classList.contains('hidden')) {
          renderConversations();
        }
      });
    }
  }

  // Auth state listener
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      setupConversationsListener();
    } else {
      if (unsubscribeConversations) {
        unsubscribeConversations();
        unsubscribeConversations = null;
      }
      conversations = [];
      updateBadge();
    }
  });

  // Toggle dropdown
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = dropdown.classList.contains('hidden');

    // Close notifications if open
    if (notificationDropdown) notificationDropdown.classList.add('hidden');

    if (isHidden) {
      dropdown.classList.remove('hidden');
      renderConversations();
    } else {
      dropdown.classList.add('hidden');
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });

  // ---- CHAT MODAL LOGIC ----
  const chatModal = document.getElementById('chat-modal');
  const chatAvatar = document.getElementById('chat-avatar');
  const chatUsername = document.getElementById('chat-username');
  const chatMessagesContainer = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const chatSendBtn = document.getElementById('chat-send-btn');
  const chatCloseBtn = document.getElementById('chat-close-btn');
  const chatOverlay = chatModal?.querySelector('.chat-modal-overlay');

  let currentChat = null;
  let unsubscribeMessages = null;

  function openChat(chatData) {
    if (!chatModal) return;

    currentChat = chatData;
    chatAvatar.src = chatData.avatar;
    chatUsername.textContent = chatData.sender;
    chatMessagesContainer.innerHTML = '<div class="chat-loading">Cargando mensajes...</div>';

    chatModal.classList.remove('hidden');
    dropdown.classList.add('hidden');
    chatInput.focus();

    // Subscribe to real messages if it's a real conversation
    if (chatData.isRealConversation && window.MessagingService) {
      if (unsubscribeMessages) unsubscribeMessages();

      unsubscribeMessages = window.MessagingService.subscribeToMessages(chatData.id, (messages) => {
        renderChatMessages(messages);
      });

      // Mark as read
      window.MessagingService.markAsRead(chatData.id);
    }
  }

  function renderChatMessages(messages) {
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) return;

    if (messages.length === 0) {
      chatMessagesContainer.innerHTML = `
        <div class="chat-empty">
          <div class="chat-empty-text">No hay mensajes aún</div>
          <div class="chat-empty-hint">Â¡Envía el primer mensaje!</div>
        </div>
      `;
      return;
    }

    chatMessagesContainer.innerHTML = messages.map(msg => {
      const isSent = msg.senderId === currentUser.uid;
      const time = msg.timestamp ?
        (msg.timestamp.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp))
          .toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        : '';
      const statusIcon = isSent ? (msg.status === 'read' ? '✓✓' : '✓') : '';
      return `
        <div class="chat-message ${isSent ? 'sent' : 'received'}">
          <div class="chat-message-text">${msg.text}</div>
          <div class="chat-message-meta">
            <span class="chat-message-time">${time}</span>
            ${isSent ? `<span class="chat-message-status ${msg.status}">${statusIcon}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  function closeChat() {
    if (chatModal) chatModal.classList.add('hidden');
    if (unsubscribeMessages) {
      unsubscribeMessages();
      unsubscribeMessages = null;
    }
    currentChat = null;
  }

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !currentChat) return;

    chatInput.value = '';

    if (currentChat.isRealConversation && window.MessagingService) {
      try {
        await window.MessagingService.sendMessage(
          currentChat.id,
          text,
          currentChat.recipientId
        );
      } catch (error) {
        console.error('Error sending message:', error);
        chatInput.value = text; // Restore text on error
        alert('Error al enviar el mensaje');
      }
    }
  }

  if (chatCloseBtn) chatCloseBtn.addEventListener('click', closeChat);
  if (chatOverlay) chatOverlay.addEventListener('click', closeChat);
  if (chatSendBtn) chatSendBtn.addEventListener('click', sendMessage);
  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // Expose openChat globally
  window.openChatWithUser = openChat;
}

function initNotifications() {
  const btn = document.getElementById('notification-btn');
  const icon = btn?.querySelector('.notification-icon');
  const dropdown = document.getElementById('notification-dropdown');
  const list = document.getElementById('notification-list');
  const clearBtn = document.getElementById('clear-notifications');
  const messagesDropdown = document.getElementById('messages-dropdown');

  if (!btn || !dropdown || !list) return;

  let notifications = [];
  let hasUnread = false;
  let unsubscribe = null;
  const deletingNotificationIds = new Set(); // Track notifications being deleted

  // Wait for auth state
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      setupNotificationListener(user.uid);
    } else {
      if (unsubscribe) unsubscribe();
      notifications = [];
      hasUnread = false;
      if (icon) icon.src = 'Visuales/Interfaz/Publicaciones/Notificacion NO.png';
    }
  });

  function setupNotificationListener(userId) {
    unsubscribe = db.collection('users')
      .doc(userId)
      .collection('notifications')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .onSnapshot(snapshot => {
        notifications = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Filter out notifications that are currently being deleted
        notifications = notifications.filter(n => !deletingNotificationIds.has(n.id));

        hasUnread = notifications.some(n => !n.read);
        if (icon) icon.src = hasUnread ? 'Visuales/Interfaz/Publicaciones/Notificacion SI.png' : 'Visuales/Interfaz/Publicaciones/Notificacion NO.png';

        // Only re-render if there are no items currently animating
        // This prevents interrupting the slide-up animation
        const hasAnimatingItems = list.querySelector('.notification-item.is-deleting');
        if (!hasAnimatingItems) {
          renderNotifications();
        }
      }, error => {
        console.error('Error listening to notifications:', error);
      });
  }

  function getTimeAgo(date) {
    if (!date) return '';
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `Hace ${minutes} min`;
    if (hours < 24) return `Hace ${hours}h`;
    if (days === 1) return 'Ayer';
    return `Hace ${days} días`;
  }

  // Render notifications
  function renderNotifications() {
    if (notifications.length === 0) {
      list.innerHTML = `
        <div class="notification-empty">
          <div class="notification-empty-icon">🔔</div>
          <div class="notification-empty-text">No tienes notificaciones</div>
        </div>
      `;
      if (icon) icon.src = 'Visuales/Interfaz/Publicaciones/Notificacion NO.png';
      return;
    }

    list.innerHTML = notifications.map(n => {
      const timeAgo = getTimeAgo(n.createdAt?.toDate ? n.createdAt.toDate() : new Date());
      const unreadClass = n.read ? '' : 'unread';
      const clickHandler = n.fromUserId ? `onclick="handleNotificationClick('${n.id}', '${n.type}', '${n.fromUserId}')"` : '';
      // Use notification ID directly - Firestore IDs are safe for HTML attributes
      const notificationId = String(n.id);

      return `
        <div class="notification-item ${unreadClass}" data-id="${notificationId}" data-notification-id="${notificationId}">
          <div class="notification-clickable-area" ${clickHandler} style="cursor: pointer; display: flex; align-items: center; flex: 1; min-width: 0;">
            <img src="${n.fromUserPhoto || generateAvatarFallback(n.fromUserName || 'Usuario', 44)}" class="notification-avatar" alt="" referrerPolicy="no-referrer" onerror="this.src='${generateAvatarFallback(n.fromUserName || 'Usuario', 44)}'; this.onerror=null;">
          <div class="notification-content">
            <div class="notification-text">${n.text}</div>
            <div class="notification-time">${timeAgo}</div>
          </div>
          </div>
          <button class="notification-delete-btn" data-notification-id="${notificationId}" title="Borrar notificación" type="button" aria-label="Borrar notificación" onclick="event.stopPropagation(); event.preventDefault(); event.stopImmediatePropagation(); return false;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    if (icon) icon.src = hasUnread ? 'Visuales/Interfaz/Publicaciones/Notificacion SI.png' : 'Visuales/Interfaz/Publicaciones/Notificacion NO.png';
  }

  function getNotificationIcon(type) {
    switch (type) {
      case 'follow':
      case 'followers':
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>';
      case 'like':
      case 'likes':
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';
      case 'comment':
      case 'messages':
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
      default:
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle></svg>';
    }
  }

  // Toggle dropdown
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = dropdown.classList.contains('hidden');
    // Close messages dropdown if open
    if (messagesDropdown) messagesDropdown.classList.add('hidden');
    if (isHidden) {
      dropdown.classList.remove('hidden');
      renderNotifications();
      // Mark all notifications as read when opening
      markNotificationsAsRead();
    } else {
      dropdown.classList.add('hidden');
    }
  });

  // Close on outside click (but not when clicking delete button)
  document.addEventListener('click', (e) => {
    // Don't close if clicking on delete button or its parent notification item
    const deleteBtn = e.target.closest('.notification-delete-btn');
    if (deleteBtn) {
      return; // Let the delete handler manage this
    }

    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });

  // Delete notification button handler (event delegation - set once)
  // Using capture phase to ensure this runs BEFORE the parent onclick
  list.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.notification-delete-btn');
    if (deleteBtn) {
      // CRITICAL: Stop propagation immediately to prevent navigation and dropdown closing
      e.stopPropagation();
      e.preventDefault();
      e.stopImmediatePropagation();

      const notificationItem = deleteBtn.closest('.notification-item');
      const notificationId = deleteBtn.getAttribute('data-notification-id');

      if (!notificationItem || !notificationId) return;

      // Prevent multiple clicks during animation
      if (notificationItem.classList.contains('is-deleting')) {
        return;
      }

      // Mark as deleting to prevent re-rendering
      deletingNotificationIds.add(notificationId);

      // Add is-deleting class immediately to start animation
      notificationItem.classList.add('is-deleting');

      // Wait for animation to complete (500ms) before deleting from Firestore and DOM
      setTimeout(async () => {
        try {
          // Delete from Firestore
          if (typeof window.deleteNotificationById === 'function') {
            await window.deleteNotificationById(notificationId);
          }

          // Remove from DOM after animation completes
          // Use a small additional delay to ensure animation is fully visible
          setTimeout(() => {
            if (notificationItem && notificationItem.parentNode) {
              notificationItem.remove();
            }
            // Remove from tracking set
            deletingNotificationIds.delete(notificationId);
            // Re-render to ensure list is up to date
            renderNotifications();
          }, 50);

        } catch (error) {
          console.error('Error deleting notification:', error);
          // Remove deleting class on error to restore item
          if (notificationItem) {
            notificationItem.classList.remove('is-deleting');
          }
          deletingNotificationIds.delete(notificationId);
          alert('Error al borrar la notificación');
        }
      }, 500); // Match CSS transition duration
    }
  }, true); // Use capture phase (true) to intercept before bubbling

  // Clear notifications
  if (clearBtn) {
    clearBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!currentUser) return;

      try {
        const batch = db.batch();
        const snapshot = await db.collection('users')
          .doc(currentUser.uid)
          .collection('notifications')
          .get();

        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        notifications = [];
        hasUnread = false;
        if (icon) icon.src = 'Visuales/Interfaz/Publicaciones/Notificacion NO.png';
        renderNotifications();
        showToast('Notificaciones borradas', 'success');
      } catch (error) {
        console.error('Error clearing notifications:', error);
      }
    });
  }

  async function markNotificationsAsRead() {
    if (!currentUser || notifications.length === 0) return;
    try {
      const batch = db.batch();
      notifications.filter(n => !n.read).forEach(n => {
        const ref = db.collection('users').doc(currentUser.uid).collection('notifications').doc(n.id);
        batch.update(ref, { read: true });
      });
      await batch.commit();
      hasUnread = false;
      if (icon) icon.src = 'Visuales/Interfaz/Publicaciones/Notificacion NO.png';
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  }

  // Initial icon state
  if (icon) icon.src = 'Visuales/Interfaz/Publicaciones/Notificacion NO.png';
}

// Handle notification click - navigate to relevant content
window.handleNotificationClick = async function (notificationId, type, fromUserId) {
  document.getElementById('notification-dropdown')?.classList.add('hidden');
  if (type === 'follow' && fromUserId) {
    openPublicProfile(fromUserId);
  }
};

// Create a notification for a user (with idempotency to prevent duplicates)
window.createNotification = async function (targetUserId, type, text, additionalData = {}) {
  if (!currentUser || targetUserId === currentUser.uid) return;

  try {
    // Generate idempotency key based on notification type and context
    // This prevents duplicate notifications for the same action
    const resourceId = additionalData.postId || additionalData.routeId || additionalData.resourceId || '';
    const idempotencyKey = `${type}_${currentUser.uid}_${resourceId}`.replace(/[^a-zA-Z0-9_]/g, '_');

    const notificationsRef = db.collection('users').doc(targetUserId).collection('notifications');

    // Check if notification already exists (idempotency check)
    const existingDoc = await notificationsRef.doc(idempotencyKey).get();

    if (existingDoc.exists) {
      // For 'like' type: allow recreation if previous was deleted (user unliked then liked again)
      // Check if notification is recent (within 1 hour) to prevent spam
      const existingData = existingDoc.data();
      const createdAt = existingData.createdAt?.toDate?.();
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      if (createdAt && createdAt > oneHourAgo) {
        // Recent notification exists, skip creation (idempotent)
        return;
      }
      // Old notification exists, update it instead of creating duplicate
    }

    // Get current user's photo from Firestore (might be different from Auth)
    let userPhotoURL = currentUser.photoURL || 'https://ui-avatars.com/api/?name=U&background=e5e7eb&color=6b7280&size=44';
    try {
      const userDoc = await db.collection('users').doc(currentUser.uid).get();
      if (userDoc.exists && userDoc.data().photoURL) {
        userPhotoURL = userDoc.data().photoURL;
      }
    } catch (e) {
      console.warn('Could not fetch user photo for notification', e);
    }

    // Use set() with idempotency key instead of add() to prevent duplicates
    await notificationsRef.doc(idempotencyKey).set({
      type: type,
      text: text,
      fromUserId: currentUser.uid,
      fromUserName: currentUser.displayName || 'Usuario',
      fromUserPhoto: userPhotoURL,
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      ...additionalData
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
};

// Delete a notification (for use when unliking, unfollowing, etc.)
window.deleteNotification = async function (targetUserId, type, resourceId = '') {
  if (!currentUser || targetUserId === currentUser.uid) return;

  try {
    const idempotencyKey = `${type}_${currentUser.uid}_${resourceId}`.replace(/[^a-zA-Z0-9_]/g, '_');
    const notificationRef = db.collection('users').doc(targetUserId).collection('notifications').doc(idempotencyKey);

    const doc = await notificationRef.get();
    if (doc.exists) {
      await notificationRef.delete();
    }
  } catch (error) {
    console.error('Error deleting notification:', error);
  }
};

// Delete a notification by ID (for user-initiated deletion from UI)
window.deleteNotificationById = async function (notificationId) {
  if (!currentUser) {
    console.warn('Cannot delete notification: user not logged in');
    return;
  }

  if (!notificationId) {
    console.warn('Cannot delete notification: no ID provided');
    return;
  }

  try {
    const notificationRef = db.collection('users').doc(currentUser.uid).collection('notifications').doc(notificationId);
    const doc = await notificationRef.get();

    if (!doc.exists) {
      console.warn('Notification not found:', notificationId);
      return;
    }

    await notificationRef.delete();
    console.log('Notification deleted successfully:', notificationId);
  } catch (error) {
    console.error('Error deleting notification:', error);
    // Try to show toast, but fallback to alert if showToast is not available
    if (typeof showToast === 'function') {
      showToast('Error al borrar la notificación', 'error');
    } else {
      alert('Error al borrar la notificación');
    }
    throw error; // Re-throw to let caller handle it
  }
};

function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const targetId = item.dataset.target;
      if (targetId) {
        switchView(targetId);
      } else if (item.id === 'nav-profile-btn') {
        showToast('Perfil de usuario próximamente', 'info');
      }
    });
  });
}

function closeAllModals() {
  const selectors = [
    '.modal',
    '.chat-modal',
    '.modal-overlay',
    '.route-photo-overlay',
    '.user-dropdown', // Also close user dropdown
    '.messages-dropdown', // Close messages dropdown
    '.notification-dropdown' // Close notifications dropdown
  ];

  selectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      el.classList.add('hidden');
    });
  });
}

function switchView(viewId) {
  closeAllModals();

  // Update Views with smooth transitions
  document.querySelectorAll('.view').forEach(view => {
    if (view.id === viewId) {
      view.classList.remove('hidden');
      // Use requestAnimationFrame for smoother transitions
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          view.classList.add('active');
        });
      });
    } else {
      view.classList.remove('active');
      // Wait for transition to complete before hiding
      setTimeout(() => view.classList.add('hidden'), 200);
    }
  });

  // Update Nav Items
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.dataset.target === viewId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Toggle Map Controls (Search Bar & Profile)
  const topBar = document.querySelector('.top-bar-wrapper');
  const authContainer = document.getElementById('auth-container');

  // Aplicar clase map-active SOLO cuando estamos en map-view
  if (viewId === 'map-view') {
    document.body.classList.add('map-active');
  } else {
    document.body.classList.remove('map-active');
  }

  if (viewId === 'feed-view' || viewId === 'profile-view' || viewId === 'activity-view' || viewId === 'map-view' || viewId === 'search-view') {
    if (topBar) topBar.style.display = 'none';
    if (authContainer) authContainer.style.display = 'none';
  } else {
    if (topBar) topBar.style.display = 'flex';
    if (authContainer) authContainer.style.display = 'block';
  }

  // Reload activity data when switching to activity view
  if (viewId === 'activity-view') {
    loadActivityData();
  }

  // Specific logic per view
  if (viewId === 'profile-view') {
    // IMPORTANTE: Solo inicializar perfil propio si NO estamos viendo un perfil ajeno
    // currentProfileUserId se establece ANTES de llamar switchView en openPublicProfile
    if (!currentProfileUserId) {
      configureProfileViewForOwnProfile();
      initProfile();
    }
    // Si currentProfileUserId tiene valor, openPublicProfile se encarga de todo
  }

  if (viewId === 'map-view') {
    // MapLibre: inicializar o redimensionar
    if (typeof USE_MAPLIBRE !== 'undefined' && USE_MAPLIBRE) {
      if (typeof mlEnsureMapReady === 'function') {
        // PequeÃ±o delay para asegurar que el contenedor es visible
        setTimeout(() => {
          mlEnsureMapReady();
        }, 50);
      }
    }
    // Google Maps eliminado - MapLibre es el Ãºnico motor de mapas
  }
}

// Mock Feed Data (desactivado para producción)
const MOCK_FEED = [];

// ================== IMAGE LIGHTBOX ==================

// Abrir lightbox de imagen
function openImageLightbox(imageSrc) {
  const modal = document.getElementById('image-lightbox-modal');
  const img = document.getElementById('image-lightbox-img');

  if (!modal || !img) return;

  img.src = imageSrc;
  modal.classList.remove('hidden');

  // Prevenir scroll del body cuando el modal estÃ¡ abierto
  document.body.style.overflow = 'hidden';
}

// Cerrar lightbox de imagen
function closeImageLightbox() {
  const modal = document.getElementById('image-lightbox-modal');

  if (!modal) return;

  modal.classList.add('hidden');

  // Restaurar scroll del body
  document.body.style.overflow = '';
}

// Inicializar event listeners del lightbox
function initImageLightbox() {
  const modal = document.getElementById('image-lightbox-modal');
  const closeBtn = document.getElementById('image-lightbox-close');
  const backdrop = modal?.querySelector('.image-lightbox-backdrop');

  if (!modal) return;

  // Cerrar con botÃ³n X
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeImageLightbox();
    });
  }

  // Cerrar al hacer clic en el backdrop
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeImageLightbox();
      }
    });
  }

  // Cerrar con tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeImageLightbox();
    }
  });
}

function initFeed() {
  // Load feed from Firebase (will fallback to mock if empty)
  loadFeed();

  // Initialize feed tabs
  initFeedTabs();
}

function initFeedTabs() {
  // Filter functionality removed
}

// Render mock feed using new editorial style
function renderMockFeed() {
  const container = document.getElementById('feed-container');
  if (!container) return;

  container.innerHTML = '';

  MOCK_FEED.forEach(post => {
    // Use unified renderPostCard for consistency
    renderPostCard(post, container);
  });

  // Attach event listeners
  attachFeedEventListeners(container);
}

// ================================
// ENHANCED PROFILE DATA & LOGIC
// ================================

// Mock Profile Data
const MOCK_PROFILE = {
  username: "lillo.climb",
  name: "Jaime Lillo",
  category: "🧗” Escalador · Boulder & Deportiva",
  bio: "Escalador desde 2018\n📍 Madrid, España\nÃ°Å¸Ââ€Ã¯Â¸Â Amante de las paredes de caliza",
  avatar: "https://ui-avatars.com/api/?name=Jaime+Lillo&background=6366f1&color=fff&size=200&bold=true",
  stats: {
    posts: 24,
    followers: 1247,
    following: 389
  },
  climbingStats: {
    totalAscents: 156,
    maxGrade: "7c+",
    zonesVisited: 12
  },
  posts: [
    { id: 1, image: "https://images.unsplash.com/photo-1522163182402-834f871fd851?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80" },
    { id: 2, image: "https://images.unsplash.com/photo-1564769662533-4f00a87b4056?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80" },
    { id: 3, image: "https://images.unsplash.com/photo-1601227329356-6c464c489716?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80" },
    { id: 4, image: "https://images.unsplash.com/photo-1516592673884-4a382d1124c2?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80" },
    { id: 5, image: "https://images.unsplash.com/photo-1505567745926-ba89000d255a?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80" },
    { id: 6, image: "https://images.unsplash.com/photo-1459231978203-b7d0c47a2cb7?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80" },
    { id: 7, image: "https://images.unsplash.com/photo-1522163182402-834f871fd851?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80" },
    { id: 8, image: "https://images.unsplash.com/photo-1564769662533-4f00a87b4056?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80" },
    { id: 9, image: "https://images.unsplash.com/photo-1601227329356-6c464c489716?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&q=80" }
  ],
  ascents: [
    { id: 1, name: "La Rambla", grade: "7c+", location: "Siurana", date: "15 Nov 2024", style: "Redpoint" },
    { id: 2, name: "Catxasa", grade: "7b", location: "Margalef", date: "10 Nov 2024", style: "Flash" },
    { id: 3, name: "El Chorro Express", grade: "7a+", location: "El Chorro", date: "5 Nov 2024", style: "Onsight" },
    { id: 4, name: "Desplome del Makinodromo", grade: "7b+", location: "Patones", date: "28 Oct 2024", style: "Redpoint" },
    { id: 5, name: "Fisura del Abuelo", grade: "6c", location: "La Pedriza", date: "20 Oct 2024", style: "Flash" },
    { id: 6, name: "Placas de Valeria", grade: "7a", location: "Valeria, Cuenca", date: "15 Oct 2024", style: "Onsight" },
    { id: 7, name: "Diedro MÃ¡gico", grade: "6b+", location: "Cuenca", date: "10 Oct 2024", style: "Flash" },
    { id: 8, name: "Techo Central", grade: "7c", location: "Rodellar", date: "1 Oct 2024", style: "Redpoint" }
  ],
  saved: [
    { id: 1, name: "Action Directe", grade: "9a", type: "Proyecto" },
    { id: 2, name: "Biographie", grade: "9a+", type: "SueÃ±o" },
    { id: 3, name: "La Dura Dura", grade: "9b+", type: "InspiraciÃ³n" }
  ],
  followers: [
    { id: 1, username: "alex_climber", name: "Alex GarcÃ­a", avatar: "https://ui-avatars.com/api/?name=Alex+Garcia&background=random&size=100" },
    { id: 2, username: "maria_rock", name: "MarÃ­a RodrÃ­guez", avatar: "https://ui-avatars.com/api/?name=Maria+Rodriguez&background=random&size=100" },
    { id: 3, username: "pablo_boulder", name: "Pablo MartÃ­n", avatar: "https://ui-avatars.com/api/?name=Pablo+Martin&background=random&size=100" }
  ],
  following: [
    { id: 1, username: "chris_sharma", name: "Chris Sharma", avatar: "https://ui-avatars.com/api/?name=Chris+Sharma&background=random&size=100" },
    { id: 2, username: "adam_ondra", name: "Adam Ondra", avatar: "https://ui-avatars.com/api/?name=Adam+Ondra&background=random&size=100" },
    { id: 3, username: "alex_megos", name: "Alex Megos", avatar: "https://ui-avatars.com/api/?name=Alex+Megos&background=random&size=100" }
  ]
};

async function initProfile() {
  const authUser = firebase.auth().currentUser;
  if (!authUser) return;

  // FIX: No ejecutar si estamos viendo un perfil ajeno
  if (currentProfileUserId) {
    console.log('[initProfile] Skipped - viewing other profile:', currentProfileUserId);
    return;
  }

  // Configure profile view for own profile (hide back button, show settings)
  configureProfileViewForOwnProfile();

  // 1. Basic Info (from Auth & Firestore)
  const avatarEl = document.getElementById('profile-avatar');
  if (avatarEl) {
    setAvatarWithFallback(avatarEl, authUser.photoURL, authUser.displayName || authUser.email, 150);
  }

  // Fetch full user doc for bio/location/stats
  let userStats = { totalAscents: 0, followersCount: 0, followingCount: 0 };
  try {
    const userDoc = await db.collection('users').doc(authUser.uid).get();
    if (userDoc.exists) {
      const data = userDoc.data();

      const nameEl = document.getElementById('profile-name');
      if (nameEl) nameEl.textContent = data.displayName || authUser.displayName;

      const bioEl = document.getElementById('profile-bio');
      if (bioEl) bioEl.textContent = data.bio || 'Sin biografí­a';

      const locationEl = document.getElementById('profile-location');
      if (locationEl) locationEl.textContent = data.location || 'España';

      const categoryEl = document.getElementById('profile-category');
      if (categoryEl && data.category) {
        categoryEl.innerHTML = `<span>${data.category}</span>`;
      }

      // Update avatar from Firestore (takes priority over Auth)
      const avatarEl = document.getElementById('profile-avatar');
      if (avatarEl) {
        const photoURL = data.photoURL || authUser.photoURL;
        const userName = data.displayName || authUser.displayName || authUser.email;
        setAvatarWithFallback(avatarEl, photoURL, userName, 150);
      }

      if (data.stats) {
        userStats = { ...userStats, ...data.stats };
      }
    }
  } catch (e) {
    console.error("Error loading profile data", e);
  }

  // 2. Stats Counters
  const postsStat = document.getElementById('stat-posts');
  const postsCount = await getUserPostsCount(authUser.uid);
  if (postsStat) postsStat.textContent = postsCount;

  // FIX: Get real follower/following counts (matching actual existing users)
  const [realFollowersCount, realFollowingCount] = await Promise.all([
    getRealFollowersCount(authUser.uid),
    getRealFollowingCount(authUser.uid)
  ]);

  const followersStat = document.getElementById('stat-followers');
  if (followersStat) followersStat.textContent = realFollowersCount;

  const followingStat = document.getElementById('stat-following');
  if (followingStat) followingStat.textContent = realFollowingCount;

  // 3. Climbing Stats (Real calculation)
  const ascents = await getUserAscents(authUser.uid);
  const projects = getProjects();

  const totalAscentsEl = document.getElementById('total-ascents');
  if (totalAscentsEl) totalAscentsEl.textContent = userStats.totalAscents || ascents.length;

  // Calculate Max Grade
  let maxGrade = '-';
  if (ascents.length > 0) {
    // Simple lexicographical sort might not be enough for grades (6a < 6a+ < 6b),
    // but for now let's assume standard string comparison or just take the "highest" if we had a value map.
    // For MVP, let's just show the grade of the most recent hard ascent or similar.
    // Better: Helper function to compare grades.
    // For now, let's just pick the last one or "-"
    // TODO: Implement proper grade comparison
    maxGrade = ascents[0].grade; // Just showing one for now
  }

  const maxGradeEl = document.getElementById('max-grade');
  if (maxGradeEl) maxGradeEl.textContent = maxGrade;

  // Unique zones
  const zones = new Set(ascents.map(a => a.schoolName));
  const zonesVisitedEl = document.getElementById('zones-visited');
  if (zonesVisitedEl) zonesVisitedEl.textContent = zones.size;

  // Populate Posts Grid - IMPORTANTE: esperar a que termine antes de continuar
  await renderProfileGrid();

  // Tab switching - solo inicializar despuÃ©s de que el grid estÃ© listo
  initProfileTabs();

  // Setup social buttons for own profile
  setupProfileSocialButtonsForUser(authUser.uid);
}

// Load user posts count
async function getUserPostsCount(userId) {
  try {
    const snapshot = await db.collection('posts')
      .where('userId', '==', userId)
      .get();
    return snapshot.size;
  } catch (error) {
    console.error('Error getting posts count:', error);
    return 0;
  }
}

// Load user posts for profile
async function loadUserPosts(userId) {
  const uidToUse = userId;
  const firestore = firebase.firestore();

  // Detectar si estamos en mÃ³vil (Capacitor) - necesita más tiempo de sincronizaciÃ³n
  const isMobile = window.Capacitor !== undefined;
  const baseDelay = isMobile ? 800 : 500;

  const executeQuery = async () => {
    const snapshot = await firestore.collection('posts')
      .where('userId', '==', uidToUse)
      .limit(50)
      .get();
    return snapshot;
  };

  try {
    // Primer intento
    let snapshot = await executeQuery();

    // Si no hay resultados, Firestore puede estar sincronizando - reintentar
    if (snapshot.size === 0) {
      await new Promise(resolve => setTimeout(resolve, baseDelay));
      snapshot = await executeQuery();
    }

    // Segundo reintento
    if (snapshot.size === 0) {
      await new Promise(resolve => setTimeout(resolve, baseDelay * 1.5));
      snapshot = await executeQuery();
    }

    // Tercer reintento (solo mÃ³vil)
    if (snapshot.size === 0 && isMobile) {
      await new Promise(resolve => setTimeout(resolve, baseDelay * 2));
      snapshot = await executeQuery();
    }

    const posts = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      posts.push({
        id: doc.id,
        ...data,
        photos: data.photos || (data.photo ? [data.photo] : []),
        time: data.createdAt ? formatTimeAgo(data.createdAt.toDate()) : 'Ahora'
      });
    });

    // Ordenar por fecha (más reciente primero)
    posts.sort((a, b) => {
      const timeA = a.createdAt?.toDate?.() || a.createdAt || new Date(0);
      const timeB = b.createdAt?.toDate?.() || b.createdAt || new Date(0);
      return timeB - timeA;
    });

    return posts;
  } catch (error) {
    console.error('Error loading user posts:', error);

    // If index error, try without orderBy as fallback
    if (error.code === 'failed-precondition' || error.message.includes('index')) {
      console.warn('Index missing, loading posts without orderBy');
      try {
        const snapshot = await db.collection('posts')
          .where('userId', '==', userId)
          .limit(50)
          .get();

        const posts = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          posts.push({
            id: doc.id,
            ...data,
            photos: data.photos || (data.photo ? [data.photo] : []),
            time: data.createdAt ? formatTimeAgo(data.createdAt.toDate()) : 'Ahora'
          });
        });

        // Sort manually by createdAt
        posts.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime - aTime;
        });

        return posts;
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError);
        return [];
      }
    }

    return [];
  }
}

async function renderProfileGrid() {
  const grid = document.getElementById('profile-grid');
  if (!grid) return;

  const authUser = firebase.auth().currentUser;

  if (!authUser) {
    grid.innerHTML = '<div class="empty-message" style="text-align: center; padding: 20px;">Inicia sesión para ver tus publicaciones</div>';
    return;
  }

  // Show loading
  grid.innerHTML = '<div class="empty-message" style="text-align: center; padding: 20px;">Cargando publicaciones...</div>';

  try {
    const posts = await loadUserPosts(authUser.uid);

    if (posts.length === 0) {
      grid.innerHTML = '<div class="empty-message" style="text-align: center; padding: 40px 20px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 16px; opacity: 0.5;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg><p style="margin: 0; color: #6b7280;">No hay publicaciones aún</p><p style="margin: 8px 0 0; color: #9ca3af; font-size: 14px;">Comparte tu primera publicación</p></div>';
      return;
    }

    // Load user's likes and bookmarks if logged in
    if (authUser && posts.length > 0) {
      const userId = authUser.uid;

      try {
        // Get user's savedPosts array (single read instead of multiple)
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const savedPosts = new Set(userData.savedPosts || []);

        // Check likes from each post's likes array
        posts.forEach(post => {
          // Check if user liked this post (likes is an array of UIDs)
          const likesArray = post.likes || [];
          post.liked = Array.isArray(likesArray) && likesArray.includes(userId);

          // Update likes count to be the array length
          post.likesCount = Array.isArray(likesArray) ? likesArray.length : (typeof likesArray === 'number' ? likesArray : 0);

          // Check if user saved this post
          post.bookmarked = savedPosts.has(post.id);
        });
      } catch (error) {
        console.error('Error loading user interactions:', error);
        // Continue without user interaction data
      }
    }

    grid.innerHTML = '';

    // Render each post using the same component as the feed
    posts.forEach(post => {
      renderPostCard(post, grid);
    });

    // Attach event listeners (same as feed)
    attachFeedEventListeners(grid);

  } catch (error) {
    console.error('Error rendering profile grid:', error);
    grid.innerHTML = '<div class="empty-message" style="text-align: center; padding: 20px; color: #ef4444;">Error al cargar las publicaciones</div>';
  }
}

// Render liked posts
async function renderLikedPosts() {
  const grid = document.getElementById('profile-liked-grid');
  if (!grid) return;

  // Usar firebase.auth().currentUser directamente
  const authUser = firebase.auth().currentUser;

  if (!authUser) {
    grid.innerHTML = '<div class="empty-message" style="text-align: center; padding: 20px;">Inicia sesión para ver tus publicaciones favoritas</div>';
    return;
  }

  // Show loading
  grid.innerHTML = '<div class="empty-message" style="text-align: center; padding: 20px;">Cargando publicaciones...</div>';

  try {
    // Get all posts where the user has liked
    const userId = authUser.uid;
    const allPostsSnapshot = await db.collection('posts')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const likedPosts = [];
    allPostsSnapshot.forEach(doc => {
      const data = doc.data();
      const likesArray = data.likes || [];

      // Check if current user liked this post
      if (Array.isArray(likesArray) && likesArray.includes(userId)) {
        likedPosts.push({
          id: doc.id,
          ...data,
          photos: data.photos || (data.photo ? [data.photo] : []),
          time: data.createdAt ? formatTimeAgo(data.createdAt.toDate()) : 'Ahora',
          liked: true,
          likesCount: likesArray.length
        });
      }
    });

    // Sort by creation date (most recent first)
    likedPosts.sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || new Date(0);
      const bTime = b.createdAt?.toDate?.() || new Date(0);
      return bTime - aTime;
    });

    if (likedPosts.length === 0) {
      grid.innerHTML = '<div class="empty-message" style="text-align: center; padding: 40px 20px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 16px; opacity: 0.5;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg><p style="margin: 0; color: #6b7280;">No has dado like a ninguna publicación</p><p style="margin: 8px 0 0; color: #9ca3af; font-size: 14px;">Explora el feed para descubrir contenido</p></div>';
      return;
    }

    // Load user's savedPosts for bookmark status
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      const savedPosts = new Set(userData.savedPosts || []);

      likedPosts.forEach(post => {
        post.bookmarked = savedPosts.has(post.id);
      });
    } catch (error) {
      console.error('Error loading user bookmarks:', error);
    }

    grid.innerHTML = '';

    // Render each liked post using the same component as the feed
    likedPosts.forEach(post => {
      renderPostCard(post, grid);
    });

    // Attach event listeners (same as feed)
    attachFeedEventListeners(grid);

  } catch (error) {
    console.error('Error rendering liked posts:', error);
    grid.innerHTML = '<div class="empty-message" style="text-align: center; padding: 20px; color: #ef4444;">Error al cargar las publicaciones</div>';
  }
}

function renderAscentsListContent(ascents) {
  const list = document.getElementById('ascents-list');
  if (!list) return;

  list.innerHTML = '';

  if (!ascents || ascents.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"x”</div>
        <div class="empty-state-text">No hay ascensiones registradas</div>
      </div>
    `;
    return;
  }

  ascents.forEach(ascent => {
    const item = document.createElement('div');
    item.className = 'ascent-item';

    // Format date
    const dateObj = ascent.date instanceof Date ? ascent.date : new Date(ascent.date);
    const dateStr = dateObj.toLocaleDateString();

    item.innerHTML = `
      <div class="ascent-grade">${ascent.grade}</div>
      <div class="ascent-info">
        <div class="ascent-name">${ascent.routeName}</div>
        <div class="ascent-location">📍 ${ascent.schoolName} ${ascent.sector ? '• ' + ascent.sector : ''}</div>
      </div>
      <div class="ascent-meta">
        <div class="ascent-date">${dateStr}</div>
        <div class="ascent-style">${ascent.style}</div>
      </div>
    `;
    list.appendChild(item);
  });
}

function renderSavedList(projects) {
  const list = document.getElementById('saved-list');
  if (!list) return;

  if (!projects || projects.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">x“</div>
        <div class="empty-state-text">No tienes proyectos guardados</div>
      </div>
    `;
    return;
  }

  list.innerHTML = '';
  projects.forEach(project => {
    const item = document.createElement('div');
    item.className = 'ascent-item'; // Reuse style
    item.innerHTML = `
      <div class="ascent-grade" style="background: #FFC107; color: #000;">${project.grade || '?'}</div>
      <div class="ascent-info">
        <div class="ascent-name">${project.name}</div>
        <div class="ascent-location">🏗 Proyecto</div>
      </div>
      <div class="ascent-meta">
        <button class="icon-btn" onclick="toggleProject('${project.id}', '${project.name}', '${project.grade}')">
          x
        </button>
      </div>
    `;
    list.appendChild(item);
  });
}

function initProfileTabs() {
  const tabs = document.querySelectorAll('.profile-tab[data-tab]');
  const contents = document.querySelectorAll('.profile-tab-content');

  tabs.forEach(tab => {
    // Clone and replace to remove old event listeners
    const newTab = tab.cloneNode(true);
    tab.parentNode.replaceChild(newTab, tab);

    newTab.addEventListener('click', async () => {
      const targetTab = newTab.dataset.tab;

      // Update all tabs (including the newly cloned ones)
      const allTabs = document.querySelectorAll('.profile-tab[data-tab]');
      allTabs.forEach(t => t.classList.remove('active'));
      newTab.classList.add('active');

      // Update content
      contents.forEach(content => {
        if (content.id === `tab-${targetTab}`) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });

      // Load content for the selected tab based on current profile context
      if (targetTab === 'liked') {
        if (currentProfileUserId) {
          // Viewing other user's profile
          await loadProfileLikedPostsForUser(currentProfileUserId, profileLoadingState.currentLoadId);
        } else {
          // Viewing own profile
          await renderLikedPosts();
        }
      } else if (targetTab === 'posts') {
        if (currentProfileUserId) {
          // Viewing other user's profile
          await loadProfilePostsForUser(currentProfileUserId, profileLoadingState.currentLoadId);
        } else {
          // Viewing own profile
          await renderProfileGrid();
        }
      }
    });
  });
}

// ================== FOLLOWERS/FOLLOWING LISTS ==================

/**
 * Initialize social list modal (close button and backdrop)
 * Called once on page load
 */
function initSocialListModal() {
  const modal = document.getElementById('social-list-modal');
  const closeBtn = document.getElementById('close-social-list-modal');

  if (!modal) return;

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });
}

// DEPRECATED: Replaced by setupProfileSocialButtonsForUser
function initProfileStatClicks() {
  const modal = document.getElementById('social-list-modal');
  const title = document.getElementById('social-list-title');
  const container = document.getElementById('social-list-container');
  const closeBtn = document.getElementById('close-social-list-modal');

  if (!modal || !container) return;

  // Followers button
  const followersBtn = document.querySelector('[data-modal="followers"]');
  if (followersBtn) {
    followersBtn.addEventListener('click', () => {
      title.textContent = 'Seguidores';
      modal.classList.remove('hidden');
      loadSocialList('followers');
    });
  }

  // Following button
  const followingBtn = document.querySelector('[data-modal="following"]');
  if (followingBtn) {
    followingBtn.addEventListener('click', () => {
      title.textContent = 'Siguiendo';
      modal.classList.remove('hidden');
      loadSocialList('following');
    });
  }

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  // Close on backdrop
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });

  async function loadSocialList(type) {
    if (!currentUser) return;

    container.innerHTML = '<div class="loading-spinner" style="padding: 40px; text-align: center;">Cargando...</div>';

    try {
      const subCollection = type === 'followers' ? 'followers' : 'following';
      const snapshot = await db.collection('users')
        .doc(currentUser.uid)
        .collection(subCollection)
        .limit(50)
        .get();

      if (snapshot.empty) {
        const emptyText = type === 'followers'
          ? 'No tienes seguidores aún'
          : 'No sigues a nadie aún';
        container.innerHTML = `
          <div class="social-list-empty">
            <div class="social-list-empty-icon">${type === 'followers' ? '💥' : 'x'}</div>
            <p>${emptyText}</p>
          </div>
        `;
        return;
      }

      // Get user IDs
      const userIds = snapshot.docs.map(doc => doc.id);

      // Fetch user data for each
      const userDataPromises = userIds.map(async (uid) => {
        try {
          const userDoc = await db.collection('users').doc(uid).get();
          if (userDoc.exists) {
            return { id: uid, ...userDoc.data() };
          }
          return null;
        } catch (e) {
          console.error('Error fetching user:', uid, e);
          return null;
        }
      });

      const users = (await Promise.all(userDataPromises)).filter(u => u !== null);

      if (users.length === 0) {
        container.innerHTML = `
          <div class="social-list-empty">
            <div class="social-list-empty-icon">😅</div>
            <p>No se pudieron cargar los usuarios</p>
          </div>
        `;
        return;
      }

      // Render user list
      let html = '';
      for (const user of users) {
        // Check if we follow this user (for the button state)
        let isFollowing = false;
        if (type === 'followers') {
          // For followers, check if we follow them back
          isFollowing = await checkFollowStatus(user.id);
        } else {
          // For following, we definitely follow them
          isFollowing = true;
        }

        const btnClass = isFollowing ? 'social-list-btn following' : 'social-list-btn follow';
        const btnText = isFollowing ? 'Siguiendo' : 'Seguir';
        const isMe = user.id === currentUser.uid;

        html += `
          <div class="social-list-item">
            <img src="${user.photoURL || 'https://ui-avatars.com/api/?name=U&background=e5e7eb&color=6b7280&size=50'}" 
                 class="social-list-avatar"
                 alt="${user.displayName}"
                 onclick="openPublicProfile('${user.id}')">
            <div class="social-list-info" onclick="openPublicProfile('${user.id}')">
              <div class="social-list-name">${user.displayName || 'Usuario'}</div>
              <div class="social-list-bio">${user.bio || 'Escalador'}</div>
            </div>
            ${!isMe ? `
              <button class="${btnClass}" 
                      onclick="toggleFollow('${user.id}', this); 
                               this.classList.toggle('following'); 
                               this.classList.toggle('follow');
                               this.textContent = this.classList.contains('following') ? 'Siguiendo' : 'Seguir';">
                ${btnText}
              </button>
            ` : ''}
          </div>
        `;
      }

      container.innerHTML = html;

    } catch (error) {
      console.error('Error loading social list:', error);
      container.innerHTML = `
        <div class="social-list-empty">
          <div class="social-list-empty-icon">x</div>
          <p>Error cargando lista</p>
        </div>
      `;
    }
  }
}

// ================== EDIT PROFILE LOGIC ==================
function initEditProfile() {
  const modal = document.getElementById('edit-profile-modal');
  const closeBtn = document.getElementById('close-edit-profile-modal');
  const form = document.getElementById('edit-profile-form');
  const photoPreview = document.getElementById('edit-photo-preview');
  const photoTrigger = document.getElementById('edit-photo-trigger');
  const photoInput = document.getElementById('edit-photo-input');
  const bioTextarea = document.getElementById('edit-bio');
  const bioCharCount = document.getElementById('bio-char-count');

  if (!modal || !form) return;

  let selectedPhotoFile = null;


  // Photo upload trigger - click on photo or overlay opens file selector
  if (photoInput) {
    const photoContainer = document.querySelector('.edit-photo-preview');
    if (photoContainer) {
      photoContainer.addEventListener('click', (e) => {
        e.stopPropagation();
        photoInput.click();
      });
    }

    photoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        selectedPhotoFile = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (photoPreview) photoPreview.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Bio character count
  if (bioTextarea && bioCharCount) {
    bioTextarea.addEventListener('input', () => {
      bioCharCount.textContent = bioTextarea.value.length;
    });
  }

  // Open Modal - Use event delegation for the edit button
  document.addEventListener('click', (e) => {
    if (e.target.id === 'edit-profile-btn' || e.target.closest('#edit-profile-btn')) {
      if (!currentUser) return;
      selectedPhotoFile = null;

      // Pre-fill form with current data
      document.getElementById('edit-display-name').value = currentUser.displayName || '';
      if (photoPreview) {
        photoPreview.src = currentUser.photoURL || 'https://ui-avatars.com/api/?name=U&background=e5e7eb&color=6b7280&size=100';
      }

      db.collection('users').doc(currentUser.uid).get().then(doc => {
        if (doc.exists) {
          const data = doc.data();
          document.getElementById('edit-bio').value = data.bio || '';
          document.getElementById('edit-location').value = data.location || '';
          if (bioCharCount) bioCharCount.textContent = (data.bio || '').length;
        }
      });

      modal.classList.remove('hidden');
    }
  });

  // Close Modal
  closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });

  // Submit Form
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('.submit-btn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Guardando...';
    submitBtn.disabled = true;

    try {
      let photoURL = currentUser.photoURL;

      // Upload new photo if selected
      if (selectedPhotoFile) {
        submitBtn.textContent = 'Subiendo foto...';
        const storageRef = firebase.storage().ref();
        const photoRef = storageRef.child(`profile-photos/${currentUser.uid}/${Date.now()}_${selectedPhotoFile.name}`);
        await photoRef.put(selectedPhotoFile);
        photoURL = await photoRef.getDownloadURL();
      }

      const profileData = {
        displayName: document.getElementById('edit-display-name').value,
        bio: document.getElementById('edit-bio').value,
        location: document.getElementById('edit-location').value,
        photoURL: photoURL
      };

      const success = await updateUserProfile(profileData);

      if (success) {
        modal.classList.add('hidden');
        showToast('Perfil actualizado', 'success');
        // Refresh profile view
        if (typeof loadUserProfile === 'function') {
          loadUserProfile();
        }
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      showToast('Error al guardar: ' + error.message, 'error');
    }

    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  });
}

// ================== SETTINGS DROPDOWN ==================
let settingsDropdownInitialized = false;

// Handler global para settings dropdown (definido fuera para referencia estable)
async function handleSettingsItemClick(e) {
  const dropdown = document.getElementById('settings-dropdown');
  const item = e.target.closest('.settings-menu-item');
  if (!item || !dropdown) return;

  e.preventDefault();
  e.stopPropagation();

  dropdown.classList.add('hidden');

  const itemId = item.id;

  try {
    switch (itemId) {
      case 'settings-edit-profile':
        const editModal = document.getElementById('edit-profile-modal');
        if (editModal) editModal.classList.remove('hidden');
        break;

      case 'settings-notifications':
        showToast('Configuración de notificaciones próximamente', 'info');
        break;

      case 'settings-privacy':
        showToast('Configuración de privacidad próximamente', 'info');
        break;

      case 'settings-help':
        showToast('Centro de ayuda próximamente', 'info');
        break;

      case 'settings-logout':
        const confirmLogout = await showConfirm('¿Estás seguro de que quieres cerrar sesión?', 'Cerrar sesión');
        if (confirmLogout) {
          try {
            await firebase.auth().signOut();
            showToast('Sesión cerrada', 'success');
            window.location.reload();
          } catch (error) {
            console.error('Error signing out:', error);
            showToast('Error al cerrar sesión', 'error');
          }
        }
        break;

      case 'settings-delete-account':
        if (typeof deleteAccount === 'function') {
          await deleteAccount();
        } else {
          showToast('Error: función no disponible', 'error');
        }
        break;

      case 'settings-admin-panel':
        const isCapacitor = window.Capacitor !== undefined;
        if (isCapacitor) {
          openAdminPanelModal();
        } else {
          window.location.href = 'admin.html';
        }
        break;
    }
  } catch (error) {
    console.error('Error en settings menu:', error);
    showToast('Error al ejecutar la acción', 'error');
  }
}

function initSettingsDropdown() {
  const btn = document.getElementById('profile-settings-btn');
  const dropdown = document.getElementById('settings-dropdown');

  if (!btn || !dropdown) return;

  // Solo inicializar listeners globales una vez
  if (!settingsDropdownInitialized) {
    // Toggle dropdown on button click
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });

    // Añadir handler de clicks del menú (solo una vez)
    dropdown.addEventListener('click', handleSettingsItemClick);

    settingsDropdownInitialized = true;
  }

  // Admin Panel - Mostrar/ocultar según el usuario (solo para super admin)
  const adminPanelBtn = document.getElementById('settings-admin-panel');
  if (adminPanelBtn) {
    firebase.auth().onAuthStateChanged((user) => {
      if (user && user.email === 'krux.app.info@gmail.com') {
        adminPanelBtn.classList.remove('hidden');
      } else {
        adminPanelBtn.classList.add('hidden');
      }
    });
  }
}

// ==================== ADMIN PANEL MODAL (Mobile) ====================
let adminPanelInitialized = false;
let adminData = {
  routes: [],
  users: [],
  stats: { pending: 0, approved: 0, rejected: 0, admins: 0 },
  currentSection: 'dashboard',
  filters: { school: 'all', status: 'pending' }
};

function openAdminPanelModal() {
  const modal = document.getElementById('admin-panel-modal');
  const body = document.getElementById('admin-modal-body');

  if (!modal || !body) return;

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Inicializar el panel si no está listo
  if (!adminPanelInitialized) {
    initAdminPanelContent();
  } else {
    // Refrescar datos
    loadAdminStats();
    loadAdminRoutes();
  }
}

function closeAdminPanelModal() {
  const modal = document.getElementById('admin-panel-modal');
  if (modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function initAdminPanelContent() {
  const body = document.getElementById('admin-modal-body');
  if (!body) return;

  // Renderizar la estructura del panel
  body.innerHTML = `
    <!-- Tabs de navegación -->
    <div class="admin-tabs">
      <button class="admin-tab active" data-section="dashboard">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        Dashboard
      </button>
      <button class="admin-tab" data-section="routes">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Vías
      </button>
      <button class="admin-tab" data-section="users">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        Usuarios
      </button>
    </div>

    <!-- Sección Dashboard -->
    <section class="admin-section active" id="admin-section-dashboard">
      <h1 class="admin-page-title">Dashboard</h1>
      <p class="admin-page-desc">Resumen general del panel</p>

      <div class="admin-stats-grid">
        <div class="admin-stat-card">
          <div class="admin-stat-icon pending">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="admin-stat-number" id="admin-stat-pending">0</div>
          <div class="admin-stat-label">Pendientes</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-icon approved">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="admin-stat-number" id="admin-stat-approved">0</div>
          <div class="admin-stat-label">Aprobadas</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-icon rejected">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="admin-stat-number" id="admin-stat-rejected">0</div>
          <div class="admin-stat-label">Rechazadas</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-icon users">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div class="admin-stat-number" id="admin-stat-admins">0</div>
          <div class="admin-stat-label">Admins</div>
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-card-header">Acciones Rápidas</div>
        <div class="admin-card-body">
          <div class="admin-actions-row">
            <button class="admin-btn admin-btn-primary" onclick="switchAdminSection('routes')">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
              Ver Pendientes
            </button>
            <button class="admin-btn admin-btn-success" onclick="exportAdminApprovedRoutes()">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Exportar
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Sección Vías -->
    <section class="admin-section" id="admin-section-routes">
      <h1 class="admin-page-title">Aprobar Vías</h1>
      <p class="admin-page-desc">Revisa las vías pendientes</p>

      <div class="admin-filter-row">
        <select id="admin-filter-school" onchange="loadAdminRoutes()">
          <option value="all">Todas las escuelas</option>
        </select>
        <select id="admin-filter-status" onchange="loadAdminRoutes()">
          <option value="pending">Pendientes</option>
          <option value="approved">Aprobadas</option>
          <option value="rejected">Rechazadas</option>
          <option value="all">Todas</option>
        </select>
      </div>

      <div id="admin-routes-list">
        <div class="admin-loading">
          <div class="admin-spinner"></div>
          <p>Cargando vías...</p>
        </div>
      </div>
    </section>

    <!-- Sección Usuarios -->
    <section class="admin-section" id="admin-section-users">
      <h1 class="admin-page-title">Usuarios</h1>
      <p class="admin-page-desc">Gestiona permisos de usuarios</p>

      <div class="admin-card">
        <div class="admin-card-header">Agregar Usuario</div>
        <div class="admin-card-body">
          <div class="admin-form-group">
            <label class="admin-form-label">Email</label>
            <input type="email" id="admin-new-user-email" class="admin-form-input" placeholder="correo@ejemplo.com">
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">Rol</label>
            <select id="admin-new-user-role" class="admin-form-select">
              <option value="photo_uploader">Subir Fotos</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button class="admin-btn admin-btn-primary" onclick="addAdminUser()">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Agregar
          </button>
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-card-header">Usuarios Autorizados</div>
        <div class="admin-card-body" id="admin-users-list">
          <div class="admin-loading">
            <div class="admin-spinner"></div>
            <p>Cargando usuarios...</p>
          </div>
        </div>
      </div>
    </section>
  `;

  // Inicializar event listeners
  initAdminEventListeners();

  // Cargar datos
  loadAdminStats();
  loadAdminRoutes();
  loadAdminUsers();
  loadAdminSchools();

  adminPanelInitialized = true;
}

function initAdminEventListeners() {
  // Cerrar modal
  const closeBtn = document.getElementById('admin-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeAdminPanelModal);
  }

  // Tabs
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const section = tab.dataset.section;
      switchAdminSection(section);
    });
  });
}

function switchAdminSection(section) {
  // Actualizar tabs
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.section === section);
  });

  // Actualizar secciones
  document.querySelectorAll('.admin-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `admin-section-${section}`);
  });

  adminData.currentSection = section;
}

async function loadAdminStats() {
  try {
    const db = firebase.firestore();

    // Contar pendientes, aprobadas y rechazadas
    const pendingSnap = await db.collection('pending_routes').where('status', '==', 'pending').get();
    const approvedSnap = await db.collection('pending_routes').where('status', '==', 'approved').get();
    const rejectedSnap = await db.collection('pending_routes').where('status', '==', 'rejected').get();
    const adminsSnap = await db.collection('admins').get();

    adminData.stats = {
      pending: pendingSnap.size,
      approved: approvedSnap.size,
      rejected: rejectedSnap.size,
      admins: adminsSnap.size
    };

    // Actualizar UI
    const pendingEl = document.getElementById('admin-stat-pending');
    const approvedEl = document.getElementById('admin-stat-approved');
    const rejectedEl = document.getElementById('admin-stat-rejected');
    const adminsEl = document.getElementById('admin-stat-admins');

    if (pendingEl) pendingEl.textContent = adminData.stats.pending;
    if (approvedEl) approvedEl.textContent = adminData.stats.approved;
    if (rejectedEl) rejectedEl.textContent = adminData.stats.rejected;
    if (adminsEl) adminsEl.textContent = adminData.stats.admins;

  } catch (error) {
    console.error('Error loading admin stats:', error);
  }
}

async function loadAdminSchools() {
  try {
    const db = firebase.firestore();
    const routesSnap = await db.collection('pending_routes').get();

    const schools = new Set();
    routesSnap.forEach(doc => {
      const data = doc.data();
      if (data.school) schools.add(data.school);
    });

    const select = document.getElementById('admin-filter-school');
    if (select) {
      select.innerHTML = '<option value="all">Todas las escuelas</option>';
      schools.forEach(school => {
        select.innerHTML += `<option value="${school}">${school}</option>`;
      });
    }
  } catch (error) {
    console.error('Error loading schools:', error);
  }
}

async function loadAdminRoutes() {
  const listEl = document.getElementById('admin-routes-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div><p>Cargando vías...</p></div>';

  try {
    const db = firebase.firestore();
    const schoolFilter = document.getElementById('admin-filter-school')?.value || 'all';
    const statusFilter = document.getElementById('admin-filter-status')?.value || 'pending';

    let query = db.collection('pending_routes');

    if (statusFilter !== 'all') {
      query = query.where('status', '==', statusFilter);
    }

    const snapshot = await query.orderBy('createdAt', 'desc').limit(50).get();

    let routes = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (schoolFilter === 'all' || data.school === schoolFilter) {
        routes.push({ id: doc.id, ...data });
      }
    });

    adminData.routes = routes;

    if (routes.length === 0) {
      listEl.innerHTML = `
        <div class="admin-empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>No hay vías con este filtro</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = routes.map(route => `
      <div class="admin-route-card" data-route-id="${route.id}">
        <div class="admin-route-name">${route.name || 'Sin nombre'}</div>
        <div class="admin-route-meta">
          ${route.school || 'Escuela desconocida'} · ${route.sector || ''} · ${route.grade || ''}
          ${route.status === 'approved' ? ' · ✅ Aprobada' : route.status === 'rejected' ? ' · ❌ Rechazada' : ''}
        </div>
        ${route.status === 'pending' ? `
          <div class="admin-route-actions">
            <button class="admin-btn-approve" onclick="approveAdminRoute('${route.id}')">Aprobar</button>
            <button class="admin-btn-reject" onclick="rejectAdminRoute('${route.id}')">Rechazar</button>
          </div>
        ` : ''}
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading routes:', error);
    listEl.innerHTML = '<div class="admin-empty-state"><p>Error al cargar vías</p></div>';
  }
}

async function approveAdminRoute(routeId) {
  try {
    const db = firebase.firestore();
    await db.collection('pending_routes').doc(routeId).update({
      status: 'approved',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedBy: firebase.auth().currentUser?.email
    });
    showToast('Vía aprobada', 'success');
    loadAdminRoutes();
    loadAdminStats();
  } catch (error) {
    console.error('Error approving route:', error);
    showToast('Error al aprobar vía', 'error');
  }
}

async function rejectAdminRoute(routeId) {
  const reason = prompt('Motivo del rechazo (opcional):');
  try {
    const db = firebase.firestore();
    await db.collection('pending_routes').doc(routeId).update({
      status: 'rejected',
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      rejectedBy: firebase.auth().currentUser?.email,
      rejectionReason: reason || ''
    });
    showToast('Vía rechazada', 'success');
    loadAdminRoutes();
    loadAdminStats();
  } catch (error) {
    console.error('Error rejecting route:', error);
    showToast('Error al rechazar vía', 'error');
  }
}

async function loadAdminUsers() {
  const listEl = document.getElementById('admin-users-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div><p>Cargando usuarios...</p></div>';

  try {
    const db = firebase.firestore();
    const snapshot = await db.collection('admins').get();

    let users = [];
    snapshot.forEach(doc => {
      users.push({ uid: doc.id, ...doc.data() });
    });

    adminData.users = users;

    if (users.length === 0) {
      listEl.innerHTML = '<div class="admin-empty-state"><p>No hay usuarios autorizados</p></div>';
      return;
    }

    listEl.innerHTML = users.map(user => `
      <div class="admin-user-row">
        <div class="admin-user-info">
          <div class="admin-user-email">${user.email || user.uid}</div>
          <div class="admin-user-role">${user.role === 'admin' ? 'Admin' : 'Subir Fotos'}</div>
        </div>
        <div class="admin-user-actions">
          <button onclick="removeAdminUser('${user.uid}')">Eliminar</button>
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading users:', error);
    listEl.innerHTML = '<div class="admin-empty-state"><p>Error al cargar usuarios</p></div>';
  }
}

async function addAdminUser() {
  const emailInput = document.getElementById('admin-new-user-email');
  const roleSelect = document.getElementById('admin-new-user-role');

  const email = emailInput?.value?.trim();
  const role = roleSelect?.value || 'photo_uploader';

  if (!email) {
    showToast('Ingresa un email', 'error');
    return;
  }

  try {
    const db = firebase.firestore();

    // Buscar usuario por email
    const usersSnap = await db.collection('users').where('email', '==', email).get();

    if (usersSnap.empty) {
      showToast('Usuario no encontrado. Debe iniciar sesión al menos una vez.', 'error');
      return;
    }

    const userDoc = usersSnap.docs[0];
    const uid = userDoc.id;

    // Agregar a admins
    await db.collection('admins').doc(uid).set({
      email: email,
      role: role,
      addedAt: firebase.firestore.FieldValue.serverTimestamp(),
      addedBy: firebase.auth().currentUser?.email
    });

    showToast('Usuario agregado', 'success');
    emailInput.value = '';
    loadAdminUsers();
    loadAdminStats();

  } catch (error) {
    console.error('Error adding user:', error);
    showToast('Error al agregar usuario', 'error');
  }
}

async function removeAdminUser(uid) {
  if (!confirm('¿Eliminar este usuario?')) return;

  try {
    const db = firebase.firestore();
    await db.collection('admins').doc(uid).delete();
    showToast('Usuario eliminado', 'success');
    loadAdminUsers();
    loadAdminStats();
  } catch (error) {
    console.error('Error removing user:', error);
    showToast('Error al eliminar usuario', 'error');
  }
}

async function exportAdminApprovedRoutes() {
  try {
    const db = firebase.firestore();
    const snapshot = await db.collection('pending_routes').where('status', '==', 'approved').get();

    let routes = [];
    snapshot.forEach(doc => {
      routes.push({ id: doc.id, ...doc.data() });
    });

    if (routes.length === 0) {
      showToast('No hay vías aprobadas para exportar', 'error');
      return;
    }

    // Crear JSON y descargar
    const dataStr = JSON.stringify(routes, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `rutas-aprobadas-${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showToast(`Exportadas ${routes.length} vías`, 'success');

  } catch (error) {
    console.error('Error exporting routes:', error);
    showToast('Error al exportar', 'error');
  }
}

// ================== CREATE POST ==================
let postData = {
  text: '',
  photos: [],
  video: null,
  ascent: null,
  location: null
};

function initCreatePost() {
  const createBtn = document.getElementById('nav-create-btn');
  const modal = document.getElementById('create-post-modal');
  const closeBtn = document.getElementById('close-create-modal');
  const submitBtn = document.getElementById('submit-create-post');
  const textarea = document.getElementById('create-post-text');
  const charCount = document.getElementById('create-post-char-count-num');
  const form = document.getElementById('create-post-form');
  const photoBtn = document.getElementById('add-photo-btn');
  const videoBtn = document.getElementById('add-video-btn');
  const ascentBtn = document.getElementById('add-ascent-btn');
  const locationBtn = document.getElementById('add-location-btn');
  const photoInput = document.getElementById('create-post-photo-input');
  const videoInput = document.getElementById('create-post-video-input');
  const preview = document.getElementById('create-post-preview');

  if (!createBtn || !modal) return;

  // Open modal
  createBtn.addEventListener('click', () => {
    if (!currentUser) {
      showToast('Inicia sesión para crear publicaciones', 'info');
      return;
    }
    resetPostData();
    updateUserInfo();
    modal.classList.remove('hidden');
    setTimeout(() => textarea?.focus(), 100);
  });

  // Close modal
  closeBtn?.addEventListener('click', () => {
    closeCreatePostModal();
  });

  // Close on backdrop
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeCreatePostModal();
    }
  });

  // Textarea input handler
  textarea?.addEventListener('input', (e) => {
    postData.text = e.target.value;
    const count = e.target.value.length;
    charCount.textContent = count;

    // Enable/disable submit button
    updateSubmitButton();

    // Update char count color
    if (count > 1800) {
      charCount.style.color = '#ef4444';
    } else if (count > 1500) {
      charCount.style.color = '#f59e0b';
    } else {
      charCount.style.color = '#6b7280';
    }
  });

  // Photo button
  photoBtn?.addEventListener('click', () => {
    photoInput?.click();
  });

  photoInput?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      postData.photos = files;
      updatePreview();
      updateSubmitButton();
    }
  });

  // Video button
  videoBtn?.addEventListener('click', () => {
    videoInput?.click();
  });

  videoInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      postData.video = file;
      postData.photos = []; // Clear photos if video is added
      updatePreview();
      updateSubmitButton();
    }
  });

  // Ascent button
  ascentBtn?.addEventListener('click', () => {
    showToast('Abre una vía en el mapa para añadir una ascensión', 'info');
    modal.classList.add('hidden');
    switchView('map-view');
  });

  // Location selector setup
  const locationSearchContainer = document.getElementById('location-search-container');
  const locationSearchInput = document.getElementById('location-search-input');
  const locationResults = document.getElementById('location-results');
  const locationBadge = document.getElementById('location-badge');
  const locationBadgeText = document.getElementById('location-badge-text');
  const locationBadgeRemove = document.getElementById('location-badge-remove');

  let locationSearchTimeout = null;
  let selectedLocationName = null;

  // Toggle search input
  locationBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = locationSearchContainer.classList.contains('hidden');

    // Close other location selectors if any
    document.querySelectorAll('.location-search-container').forEach(container => {
      if (container !== locationSearchContainer) container.classList.add('hidden');
    });

    if (isHidden) {
      locationSearchContainer.classList.remove('hidden');
      // Position container relative to button
      positionLocationContainer();
      locationSearchInput.focus();
      // Show current location option immediately
      showLocationOptions();
    } else {
      locationSearchContainer.classList.add('hidden');
      locationResults.innerHTML = '';
    }
  });

  // Position the search container relative to the button
  function positionLocationContainer() {
    // CSS handles positioning with absolute and left: calc(100% + 8px)
    // No need for manual positioning
  }

  // Close search container when clicking outside
  document.addEventListener('click', (e) => {
    if (!locationSearchContainer.contains(e.target) &&
      e.target !== locationBtn &&
      !locationBtn.contains(e.target)) {
      locationSearchContainer.classList.add('hidden');
      locationResults.innerHTML = '';
    }
  });

  // Show location options (current location + search results)
  function showLocationOptions() {
    if (!locationResults) return;

    // Always show "Current Location" as first option
    const currentLocationOption = document.createElement('li');
    currentLocationOption.className = 'location-result-item location-current-option';
    currentLocationOption.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="16"></line>
        <line x1="8" y1="12" x2="16" y2="12"></line>
      </svg>
      <span>📍 Usar mi ubicación actual</span>
    `;
    currentLocationOption.addEventListener('click', async () => {
      await useCurrentLocation();
    });

    locationResults.innerHTML = '';
    locationResults.appendChild(currentLocationOption);
  }

  // Use current location
  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      showToast('La geolocalización no está disponible', 'error');
      return;
    }

    // Show loading state
    const currentOption = locationResults.querySelector('.location-current-option');
    if (currentOption) {
      currentOption.style.opacity = '0.6';
      currentOption.style.pointerEvents = 'none';
      const span = currentOption.querySelector('span');
      if (span) span.textContent = '📍 Obteniendo ubicación...';
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        try {
          // Reverse geocoding to get location name
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
            {
              headers: {
                'User-Agent': 'KRUX App'
              }
            }
          );
          const data = await response.json();

          const locationName = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

          postData.location = {
            lat: lat,
            lng: lng,
            name: locationName
          };

          selectedLocationName = locationName;
          showLocationBadge(locationName);
          locationSearchContainer.classList.add('hidden');
          locationSearchInput.value = '';
          locationResults.innerHTML = '';
          showToast('Ubicación añadida', 'success');
          updatePreview();
        } catch (error) {
          console.error('Error getting location name:', error);
          // Fallback: use coordinates
          postData.location = {
            lat: lat,
            lng: lng,
            name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`
          };
          selectedLocationName = postData.location.name;
          showLocationBadge(postData.location.name);
          locationSearchContainer.classList.add('hidden');
          locationSearchInput.value = '';
          locationResults.innerHTML = '';
          showToast('Ubicación añadida', 'success');
          updatePreview();
        }
      },
      () => {
        showToast('No se pudo obtener la ubicación', 'error');
        // Restore option
        if (currentOption) {
          currentOption.style.opacity = '1';
          currentOption.style.pointerEvents = 'auto';
          const span = currentOption.querySelector('span');
          if (span) span.textContent = '📍 Usar mi ubicación actual';
        }
      }
    );
  }

  // Search input with debounce
  locationSearchInput?.addEventListener('input', (e) => {
    const query = e.target.value.trim();

    // Clear previous timeout
    if (locationSearchTimeout) {
      clearTimeout(locationSearchTimeout);
    }

    // If empty, show only current location option
    if (!query) {
      showLocationOptions();
      return;
    }

    // Debounce: wait 400ms before searching
    locationSearchTimeout = setTimeout(async () => {
      await searchLocations(query);
    }, 400);
  });

  // Focus event - show current location option
  locationSearchInput?.addEventListener('focus', () => {
    showLocationOptions();
  });

  // Search locations using Nominatim API
  async function searchLocations(query) {
    if (!query || query.length < 2) {
      showLocationOptions();
      return;
    }

    try {
      // Show current location option + loading
      showLocationOptions();
      const loadingLi = document.createElement('li');
      loadingLi.className = 'location-result-loading';
      loadingLi.textContent = 'Buscando...';
      locationResults.appendChild(loadingLi);

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'KRUX App'
          }
        }
      );

      const data = await response.json();

      // Remove loading indicator
      const loading = locationResults.querySelector('.location-result-loading');
      if (loading) loading.remove();

      if (data.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'location-result-empty';
        emptyLi.textContent = 'No se encontraron resultados';
        locationResults.appendChild(emptyLi);
        return;
      }

      // Add search results (keep current location option at top)
      data.forEach(place => {
        const li = document.createElement('li');
        li.className = 'location-result-item';
        li.textContent = place.display_name;
        li.addEventListener('click', () => {
          selectLocation(place);
        });
        locationResults.appendChild(li);
      });
    } catch (error) {
      console.error('Error searching locations:', error);
      // Remove loading if exists
      const loading = locationResults.querySelector('.location-result-loading');
      if (loading) loading.remove();

      const errorLi = document.createElement('li');
      errorLi.className = 'location-result-error';
      errorLi.textContent = 'Error al buscar ubicaciones';
      locationResults.appendChild(errorLi);
    }
  }

  // Select location from search results
  function selectLocation(place) {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);

    postData.location = {
      lat: lat,
      lng: lng,
      name: place.display_name
    };

    selectedLocationName = place.display_name;
    showLocationBadge(place.display_name);
    locationSearchContainer.classList.add('hidden');
    locationSearchInput.value = '';
    locationResults.innerHTML = '';
    showToast('Ubicación añadida', 'success');
    updatePreview();
  }

  // Show location badge
  function showLocationBadge(name) {
    if (locationBadgeText && locationBadge) {
      locationBadgeText.textContent = name;
      locationBadge.classList.remove('hidden');
    }
  }

  // Initialize location badge if location exists
  if (postData.location && postData.location.name) {
    showLocationBadge(postData.location.name);
  }

  // Remove location badge
  locationBadgeRemove?.addEventListener('click', (e) => {
    e.stopPropagation();
    postData.location = null;
    selectedLocationName = null;
    locationBadge.classList.add('hidden');
    updatePreview();
    showToast('Ubicación eliminada', 'info');
  });

  // Submit form
  submitBtn?.addEventListener('click', async () => {
    await submitPost();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitPost();
  });
}

function resetPostData() {
  postData = {
    text: '',
    photos: [],
    video: null,
    ascent: null,
    location: null
  };
  document.getElementById('create-post-text').value = '';
  document.getElementById('create-post-char-count-num').textContent = '0';
  document.getElementById('create-post-char-count-num').style.color = '#6b7280';
  document.getElementById('create-post-photo-input').value = '';
  document.getElementById('create-post-video-input').value = '';
  document.getElementById('create-post-preview').innerHTML = '';
  document.getElementById('create-post-preview').classList.add('hidden');

  // Reset location badge
  const locationBadge = document.getElementById('location-badge');
  const locationSearchContainer = document.getElementById('location-search-container');
  const locationSearchInput = document.getElementById('location-search-input');
  const locationResults = document.getElementById('location-results');
  if (locationBadge) locationBadge.classList.add('hidden');
  if (locationSearchContainer) locationSearchContainer.classList.add('hidden');
  if (locationSearchInput) locationSearchInput.value = '';
  if (locationResults) locationResults.innerHTML = '';

  updateSubmitButton();
}

function updateUserInfo() {
  if (!currentUser) return;

  const avatar = document.getElementById('create-post-avatar');
  const username = document.getElementById('create-post-username');

  if (avatar) {
    setAvatarWithFallback(avatar, currentUser.photoURL, currentUser.displayName || currentUser.email || 'Usuario', 200);
  }

  if (username) {
    username.textContent = currentUser.displayName || 'Usuario';
  }
}

function updateSubmitButton() {
  const submitBtn = document.getElementById('submit-create-post');
  const hasContent = postData.text.trim().length > 0 || postData.photos.length > 0 || postData.video;

  if (submitBtn) {
    submitBtn.disabled = !hasContent;
    if (hasContent) {
      submitBtn.style.opacity = '1';
      submitBtn.style.cursor = 'pointer';
    } else {
      submitBtn.style.opacity = '0.5';
      submitBtn.style.cursor = 'not-allowed';
    }
  }
}

function updatePreview() {
  const preview = document.getElementById('create-post-preview');
  if (!preview) return;

  let previewHTML = '';

  // Photos preview
  if (postData.photos.length > 0) {
    previewHTML += '<div class="create-post-preview-photos">';
    postData.photos.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      previewHTML += `
        <div class="create-post-preview-photo-item">
          <img src="${url}" alt="Preview">
          <button type="button" class="remove-preview-btn" data-index="${index}">x”</button>
        </div>
      `;
    });
    previewHTML += '</div>';
  }

  // Video preview
  if (postData.video) {
    const url = URL.createObjectURL(postData.video);
    previewHTML += `
      <div class="create-post-preview-video">
        <video src="${url}" controls></video>
        <button type="button" class="remove-preview-btn" data-type="video"x”</button>
      </div>
    `;
  }

  // Location preview
  if (postData.location) {
    const locationName = postData.location.name || 'Ubicación añadida';
    previewHTML += `
      <div class="create-post-preview-location">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        <span>${locationName}</span>
        <button type="button" class="remove-preview-btn" data-type="location">x”</button>
      </div>
    `;
  }

  if (previewHTML) {
    preview.innerHTML = previewHTML;
    preview.classList.remove('hidden');

    // Add remove buttons listeners
    preview.querySelectorAll('.remove-preview-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = btn.dataset.index;
        const type = btn.dataset.type;

        if (type === 'video') {
          postData.video = null;
          document.getElementById('create-post-video-input').value = '';
        } else if (type === 'location') {
          postData.location = null;
          const locationBadge = document.getElementById('location-badge');
          if (locationBadge) locationBadge.classList.add('hidden');
        } else if (index !== undefined) {
          postData.photos.splice(parseInt(index), 1);
          document.getElementById('create-post-photo-input').value = '';
        }

        updatePreview();
        updateSubmitButton();
      });
    });
  } else {
    preview.classList.add('hidden');
  }
}

async function submitPost() {
  if (!currentUser) {
    showToast('Debes iniciar sesión para publicar', 'error');
    return;
  }

  // Verify user is authenticated
  if (!currentUser.uid) {
    showToast('Error de autenticación. Por favor, inicia sesión nuevamente', 'error');
    return;
  }

  // Validate that there's at least some content
  if (!postData.text.trim() && postData.photos.length === 0 && !postData.video) {
    showToast('Añade texto, una foto o un video para publicar', 'error');
    return;
  }

  const submitBtn = document.getElementById('submit-create-post');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Publicando...';

  try {
    // Upload photos/video if any
    let photoUrls = [];
    let videoUrl = null;

    if (postData.photos.length > 0) {
      showToast('Subiendo fotos...', 'info');
      // Upload photos to Firebase Storage
      for (let i = 0; i < postData.photos.length; i++) {
        const photo = postData.photos[i];
        const timestamp = Date.now();
        const filename = `${timestamp}_${i}_${photo.name}`;
        const storageRef = storage.ref(`posts/${currentUser.uid}/${filename}`);

        await storageRef.put(photo);
        const url = await storageRef.getDownloadURL();
        photoUrls.push(url);
      }
    }

    if (postData.video) {
      showToast('Subiendo video...', 'info');
      const timestamp = Date.now();
      const filename = `${timestamp}_${postData.video.name}`;
      const storageRef = storage.ref(`posts/${currentUser.uid}/${filename}`);

      await storageRef.put(postData.video);
      videoUrl = await storageRef.getDownloadURL();
    }

    // Determine post type
    let postType = 'text';
    if (photoUrls.length > 0) {
      postType = 'photo';
    } else if (videoUrl) {
      postType = 'video';
    }

    // Save post to Firebase
    const postDataToSave = {
      type: postType,
      userId: currentUser.uid,
      userName: currentUser.displayName || 'Usuario',
      userPhoto: currentUser.photoURL || '',
      likes: 0,
      liked: false,
      commentsCount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Only add optional fields if they have values
    if (postData.text.trim()) {
      postDataToSave.content = postData.text.trim();
    }
    if (photoUrls.length > 0) {
      postDataToSave.photos = photoUrls;
    }
    if (videoUrl) {
      postDataToSave.video = videoUrl;
    }
    if (postData.location) {
      postDataToSave.location = postData.location;
    }
    if (postData.ascent) {
      postDataToSave.ascent = postData.ascent;
    }

    log('Saving post data:', postDataToSave);
    log('Current user UID:', currentUser.uid);

    await db.collection('posts').add(postDataToSave);

    showToast('Publicación creada exitosamente', 'success');
    closeCreatePostModal();

    // Reload feed and profile grid after a short delay to ensure data is indexed
    setTimeout(async () => {
      await loadFeed();
      // Update profile grid if we're on profile view
      if (document.getElementById('profile-view') && !document.getElementById('profile-view').classList.contains('hidden')) {
        await renderProfileGrid();
        // Update posts count
        const postsStat = document.getElementById('stat-posts');
        if (postsStat) {
          const count = await getUserPostsCount(currentUser.uid);
          postsStat.textContent = count;
        }
      }
    }, 500);

  } catch (error) {
    console.error('Error creating post:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Current user:', currentUser);

    let errorMessage = 'Error al crear la publicación';

    if (error.code === 'permission-denied' || error.code === 'PERMISSION_DENIED') {
      errorMessage = 'No tienes permisos para publicar. Verifica las reglas de Firestore.';
    } else if (error.code === 'storage/unauthorized') {
      errorMessage = 'No tienes permisos para subir archivos';
    } else if (error.code === 'storage/quota-exceeded') {
      errorMessage = 'Se ha excedido la cuota de almacenamiento';
    } else if (error.code === 'unauthenticated') {
      errorMessage = 'Debes iniciar sesión para publicar';
    } else if (error.message) {
      errorMessage = error.message;
    }

    showToast(errorMessage, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Publicar';
  }
}

function closeCreatePostModal() {
  const modal = document.getElementById('create-post-modal');
  modal?.classList.add('hidden');
  resetPostData();
}

// Show empty feed state
function showEmptyFeedState(container) {
  container.innerHTML = `
    <div style="text-align: center; padding: 60px 20px; color: #6b7280;">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 20px; opacity: 0.5;">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="8.5" cy="7" r="4"></circle>
        <line x1="20" y1="8" x2="20" y2="14"></line>
        <line x1="23" y1="11" x2="17" y2="11"></line>
      </svg>
      <h3 style="margin: 0 0 8px; color: #111827;">Tu timeline está vacío</h3>
      <p style="margin: 0;">Sigue a otros usuarios para ver sus publicaciones aquí­</p>
    </div>
  `;
}

// Load feed from Firebase - Timeline de seguidos
async function loadFeed() {
  const container = document.getElementById('feed-container');
  if (!container) return;

  try {
    container.innerHTML = '<div class="loading-spinner">Cargando publicaciones...</div>';

    // Get the list of users the current user follows
    let followingIds = [];
    if (currentUser) {
      try {
        const followingSnapshot = await db.collection('users')
          .doc(currentUser.uid)
          .collection('following')
          .get();

        followingIds = followingSnapshot.docs.map(doc => doc.id);
      } catch (error) {
        console.error('Error loading following list:', error);
      }
      // Include the current user's own posts in the timeline
      followingIds.push(currentUser.uid);
    }

    container.innerHTML = '';

    // If no user or no following, show empty state (sin posts demo)
    if (!currentUser || followingIds.length === 0) {
      showEmptyFeedState(container);
      return;
    }

    // Fetch posts using batched 'where in' queries (Firestore limit: 30 per query)
    const firebasePosts = [];
    const batchSize = 30;
    const postsPerBatch = Math.ceil(50 / Math.ceil(followingIds.length / batchSize)); // Distribute limit across batches

    for (let i = 0; i < followingIds.length; i += batchSize) {
      const batch = followingIds.slice(i, i + batchSize);

      try {
        const snapshot = await db.collection('posts')
          .where('userId', 'in', batch)
          .orderBy('createdAt', 'desc')
          .limit(postsPerBatch)
          .get();

        snapshot.forEach(doc => {
          const data = doc.data();
          firebasePosts.push({
            id: doc.id,
            ...data,
            time: data.createdAt ? formatTimeAgo(data.createdAt.toDate()) : 'Ahora',
            photos: data.photos || (data.photo ? [data.photo] : [])
          });
        });
      } catch (error) {
        console.error('Error fetching posts batch:', error);
      }
    }

    // Sort all posts by createdAt and limit to 50
    firebasePosts.sort((a, b) => {
      const timeA = a.createdAt?.toDate?.() || a.createdAt || 0;
      const timeB = b.createdAt?.toDate?.() || b.createdAt || 0;
      return timeB - timeA;
    });
    const limitedPosts = firebasePosts.slice(0, 50);

    // Load user's likes and bookmarks if logged in
    if (currentUser && limitedPosts.length > 0) {
      const userId = currentUser.uid;

      try {
        // Get user's savedPosts array (single read instead of multiple)
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const savedPosts = new Set(userData.savedPosts || []);

        // Check likes from each post's likes array
        limitedPosts.forEach(post => {
          // Check if user liked this post (likes is an array of UIDs)
          const likesArray = post.likes || [];
          post.liked = Array.isArray(likesArray) && likesArray.includes(userId);

          // Update likes count to be the array length
          post.likesCount = Array.isArray(likesArray) ? likesArray.length : (typeof likesArray === 'number' ? likesArray : 0);

          // Check if user saved this post
          post.bookmarked = savedPosts.has(post.id);
        });
      } catch (error) {
        console.error('Error loading user interactions:', error);
        // Continue without user interaction data
      }
    }

    // Use filtered posts (solo datos reales)
    const allPosts = [...limitedPosts];

    if (allPosts.length === 0) {
      showEmptyFeedState(container);
      return;
    }

    allPosts.forEach(post => {
      renderPostCard(post, container);
    });

    // Add event listeners
    attachFeedEventListeners(container);

  } catch (error) {
    console.error('Error loading feed:', error);

    container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #ef4444;">
          <p>Error al cargar el feed: ${error.message}</p>
          <button onclick="loadFeed()" style="margin-top: 16px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer;">
            Reintentar
          </button>
        </div>
      `;
  }
}

// Render a single post card - Editorial Hybrid Style (Substack/Twitter/Strava)
function renderPostCard(post, container) {
  const card = document.createElement('div');
  card.className = `feed-card feed-card-${post.type || 'text'}`;
  card.dataset.postId = post.id || '';

  const userName = post.userName || post.user || 'Usuario';
  const userPhoto = post.userPhoto || post.avatar || '';

  // Extract location name (can be object with name property or string)
  let locationName = '';
  let locationCoords = null;
  if (post.location) {
    if (typeof post.location === 'object' && post.location.name) {
      locationName = post.location.name;
      locationCoords = {
        lat: post.location.lat || 0,
        lng: post.location.lng || 0
      };
    } else if (typeof post.location === 'string') {
      locationName = post.location;
    }
  } else if (post.locationName) {
    locationName = post.locationName;
  }

  // Support both array (new) and number (legacy) format for likes
  const likesArray = post.likes;
  const likes = post.likesCount || (Array.isArray(likesArray) ? likesArray.length : (typeof likesArray === 'number' ? likesArray : 0));
  const comments = post.commentsCount || 0;
  const shares = post.shares || 0;

  // Helper to format counts
  const formatCount = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num > 0 ? num.toString() : '';
  };

  // Verificar si el usuario actual es el autor del post
  const isPostAuthor = currentUser && post.userId === currentUser.uid;

  // Header - Editorial style with inline meta
  const headerHTML = `
    <div class="feed-card-header">
      <img src="${userPhoto || generateAvatarFallback(userName, 200)}" alt="${userName}" class="feed-avatar feed-avatar-clickable" data-user-id="${post.userId || ''}" referrerPolicy="no-referrer" onerror="this.src='${generateAvatarFallback(userName, 200)}'; this.onerror=null;">
      <div class="feed-header-content">
        <div class="feed-header-row">
          <span class="feed-username feed-username-clickable" data-user-id="${post.userId || ''}">${userName}</span>
          <span class="feed-dot">·</span>
          <span class="feed-time">${post.time || 'Ahora'}</span>
        </div>
        ${locationName ? `<div class="feed-location-text">📍 ${locationName}</div>` : ''}
      </div>
      ${currentUser ? `
        <div class="feed-post-menu-wrapper">
          <button class="feed-post-menu-btn" 
                  data-post-id="${post.id || ''}"
                  data-is-owner="${isPostAuthor}"
                  title="Opciones">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="1"></circle>
              <circle cx="19" cy="12" r="1"></circle>
              <circle cx="5" cy="12" r="1"></circle>
            </svg>
          </button>
          <div class="feed-post-menu-dropdown hidden" data-post-id="${post.id || ''}">
            ${isPostAuthor ? `
              <button class="feed-post-menu-item" data-action="edit" data-post-id="${post.id || ''}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>Editar</span>
              </button>
              <button class="feed-post-menu-item feed-post-menu-item-danger" data-action="delete" data-post-id="${post.id || ''}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>Borrar</span>
              </button>
            ` : `
              <button class="feed-post-menu-item" data-action="share" data-post-id="${post.id || ''}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="18" cy="5" r="3"></circle>
                  <circle cx="6" cy="12" r="3"></circle>
                  <circle cx="18" cy="19" r="3"></circle>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
                <span>Compartir</span>
              </button>
              <button class="feed-post-menu-item feed-post-menu-item-danger" data-action="report" data-post-id="${post.id || ''}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <span>Denunciar</span>
              </button>
            `}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  // Content - Text first approach
  let contentHTML = '';
  const textContent = post.content || post.caption || '';

  // Text content (always first if exists)
  if (textContent || post.title) {
    contentHTML += `
      <div class="feed-text-content" data-post-id="${post.id || ''}">
        ${post.title ? `<h2 class="feed-text-title">${post.title}</h2>` : ''}
        ${textContent ? `
          <div class="feed-text-body-wrapper">
            <p class="feed-text-body" data-post-id="${post.id || ''}">${textContent.replace(/\n/g, '<br>')}</p>
            <div class="feed-text-edit-wrapper hidden" data-post-id="${post.id || ''}">
              <textarea class="feed-text-edit-input" data-post-id="${post.id || ''}" rows="4">${textContent}</textarea>
              <div class="feed-text-edit-actions">
                <button class="feed-text-edit-cancel" data-post-id="${post.id || ''}">Cancelar</button>
                <button class="feed-text-edit-save" data-post-id="${post.id || ''}">
                  <span class="feed-text-edit-save-text">Guardar</span>
                  <span class="feed-text-edit-save-loading hidden">Guardando...</span>
                </button>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // Media content (secondary)
  if (post.type === 'photo' || post.photos || post.image) {
    const images = post.photos || (post.image ? [post.image] : []);
    if (images.length === 1) {
      contentHTML += `
        <div class="feed-media-wrapper">
          <div class="feed-image-container">
            <img src="${images[0]}" alt="Post" class="feed-image feed-image-clickable" data-lightbox-src="${images[0]}" loading="lazy">
          </div>
        </div>
      `;
    } else if (images.length > 1) {
      const gridClass = images.length === 2 ? 'grid-2' : images.length === 3 ? 'grid-3' : 'grid-4';
      contentHTML += `
        <div class="feed-images-grid ${gridClass}">
          ${images.slice(0, 4).map(img => `<img src="${img}" alt="Post" class="feed-image feed-image-clickable" data-lightbox-src="${img}" loading="lazy">`).join('')}
        </div>
      `;
    }
  } else if (post.type === 'video' || post.video) {
    contentHTML += `
      <div class="feed-video-container">
        <video src="${post.video}" controls class="feed-video"></video>
      </div>
    `;
  } else if (post.type === 'ascensions' && post.ascensions) {
    const ascensionsList = post.ascensions.map(a => `
      <div class="feed-ascension-item">
        <span class="ascension-grade-badge">${a.grade}</span>
        <span class="ascension-route-name">${a.name}</span>
        <span class="ascension-style ${(a.style || 'redpoint').toLowerCase()}">${a.style || 'REDPOINT'}</span>
      </div>
    `).join('');

    contentHTML += `
      <div class="feed-ascensions-card">
        <h3 class="feed-ascensions-title">x” ${post.ascensions.length} vías completadas</h3>
        <div class="feed-ascensions-list">${ascensionsList}</div>
      </div>
    `;
  } else if (post.type === 'activity') {
    // Strava-style activity stats
    contentHTML += `
      <div class="feed-activity-stats">
        ${post.distance ? `<div class="activity-stat-item"><span class="activity-stat-label">Distancia</span><span class="activity-stat-value">${post.distance}</span></div>` : ''}
        ${post.elevation ? `<div class="activity-stat-item"><span class="activity-stat-label">Desnivel</span><span class="activity-stat-value">${post.elevation}</span></div>` : ''}
        ${post.duration ? `<div class="activity-stat-item"><span class="activity-stat-label">Tiempo</span><span class="activity-stat-value">${post.duration}</span></div>` : ''}
      </div>
    `;
    if (post.achievement) {
      contentHTML += `
        <div class="feed-achievement">
          <div class="achievement-icon">x</div>
          <span class="achievement-text">${post.achievement}</span>
        </div>
      `;
    }
    if (post.mapImage) {
      contentHTML += `
        <div class="feed-media-wrapper">
          <div class="feed-image-container">
            <img src="${post.mapImage}" alt="Mapa de actividad" class="feed-image feed-image-clickable" data-lightbox-src="${post.mapImage}" loading="lazy">
          </div>
        </div>
      `;
    }
  }

  // Actions bar - Twitter minimal style with counts
  // Determine fill colors based on liked state
  // Like = Red (#ef4444)
  const likeColor = post.liked ? '#ef4444' : 'none';
  const likeStroke = post.liked ? '#ef4444' : 'currentColor';

  const actionsHTML = `
    <div class="feed-actions-bar">
      <button class="feed-action-btn ${post.liked ? 'liked' : ''}" data-action="like" data-post-id="${post.id || ''}">
        <svg viewBox="0 0 24 24" fill="${likeColor}" stroke="${likeStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
        <span class="feed-action-count">${likes > 0 ? formatCount(likes) : ''}</span>
      </button>
      <button class="feed-action-btn" data-action="comment" data-post-id="${post.id || ''}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
        </svg>
        <span class="feed-action-count">${comments > 0 ? formatCount(comments) : ''}</span>
      </button>
    </div>
    <!-- Inline Comments Section (hidden by default) -->
    <div class="feed-comments-section hidden" data-post-id="${post.id || ''}">
      <form class="feed-comment-form">
        <img src="${currentUser?.photoURL || generateAvatarFallback(currentUser?.displayName || 'U', 40)}" alt="Tu avatar" class="feed-comment-form-avatar" referrerPolicy="no-referrer" onerror="this.src='${generateAvatarFallback(currentUser?.displayName || 'U', 40)}'; this.onerror=null;">
        <input type="text" class="feed-comment-input" placeholder="Añade un comentario, @ para mencionar" autocomplete="off">
        <button type="submit" class="feed-comment-submit" title="Publicar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
      </form>
      <div class="feed-comments-list"></div>
    </div>
  `;

  card.innerHTML = headerHTML + contentHTML + actionsHTML;

  // Smooth entry animation using requestAnimationFrame
  card.style.opacity = '0';
  card.style.transform = 'translateY(20px)';
  container.appendChild(card);

  // Trigger animation after DOM insertion
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    });
  });
}

// Attach event listeners to feed
function attachFeedEventListeners(container) {
  // Event Listeners for "Ver en mapa"
  container.querySelectorAll('.feed-map-btn, .feed-location').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const lat = parseFloat(btn.dataset.lat);
      const lng = parseFloat(btn.dataset.lng);
      const zoom = parseInt(btn.dataset.zoom);

      if (!isNaN(lat) && !isNaN(lng)) {
        switchView('map-view');
        if (typeof map !== 'undefined' && map) {
          map.setCenter({ lat, lng });
          map.setZoom(zoom);
        }
      }
    });
  });

  // Event listeners para lightbox de imÃ¡genes
  container.querySelectorAll('.feed-image-clickable').forEach(img => {
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      const imageSrc = img.dataset.lightboxSrc || img.src;
      if (imageSrc) {
        openImageLightbox(imageSrc);
      }
    });
  });

  // Event listeners para navegaciÃ³n a perfil (avatar y nombre)
  container.querySelectorAll('.feed-avatar-clickable, .feed-username-clickable').forEach(element => {
    element.addEventListener('click', (e) => {
      e.stopPropagation();
      const userId = element.dataset.userId;
      if (userId && typeof openPublicProfile === 'function') {
        openPublicProfile(userId);
      }
    });
  });

  // Event listeners para menÃº de posts
  container.querySelectorAll('.feed-post-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postId = btn.dataset.postId;
      const dropdown = container.querySelector(`.feed-post-menu-dropdown[data-post-id="${postId}"]`);

      // Cerrar todos los demás dropdowns
      container.querySelectorAll('.feed-post-menu-dropdown').forEach(dd => {
        if (dd !== dropdown) {
          dd.classList.add('hidden');
        }
      });

      // Toggle del dropdown actual
      if (dropdown) {
        dropdown.classList.toggle('hidden');
      }
    });
  });

  // Cerrar dropdowns al hacer clic fuera (solo aÃ±adir una vez)
  if (!feedDropdownListenerAdded) {
    feedDropdownListenerAdded = true;
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.feed-post-menu-wrapper')) {
        document.querySelectorAll('.feed-post-menu-dropdown').forEach(dd => {
          dd.classList.add('hidden');
        });
      }
    });
  }

  // Event listeners para acciones del menÃº de posts
  container.querySelectorAll('.feed-post-menu-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      const postId = item.dataset.postId;

      // Cerrar el dropdown
      const dropdown = item.closest('.feed-post-menu-dropdown');
      if (dropdown) {
        dropdown.classList.add('hidden');
      }

      if (action === 'edit') {
        handleEditPost(postId, container);
      } else if (action === 'delete') {
        await handleDeletePost(postId, container);
      } else if (action === 'share') {
        await handleFeedShare(postId);
      } else if (action === 'report') {
        await handleReportPost(postId);
      }
    });
  });

  // Event listeners para ediciÃ³n de posts
  container.querySelectorAll('.feed-text-edit-cancel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postId = btn.dataset.postId;
      cancelEditPost(postId, container);
    });
  });

  container.querySelectorAll('.feed-text-edit-save').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const postId = btn.dataset.postId;
      await handleUpdatePost(postId, container);
    });
  });
}

// ================== FEED ACTION HANDLERS ==================

// Handle like button click - Uses array likes[] with arrayUnion/arrayRemove
// Colors: Active = Red (#ef4444), Inactive = outline (no fill)
async function handleFeedLike(postId, button) {
  if (!currentUser) {
    showToast('Inicia sesión para dar like', 'info');
    return;
  }

  const isLiked = button.classList.contains('liked');
  const svg = button.querySelector('svg');
  const countSpan = button.querySelector('.feed-action-count');
  let currentCount = parseInt(countSpan?.textContent?.replace(/[KM]/g, '') || '0') || 0;

  // Optimistic UI Update - Immediately update before DB call
  button.classList.toggle('liked');
  if (svg) {
    if (!isLiked) {
      // Activating: Red filled
      svg.setAttribute('fill', '#ef4444');
      svg.setAttribute('stroke', '#ef4444');
    } else {
      // Deactivating: Outline only (no fill)
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
    }
  }

  // Update count optimistically
  if (countSpan) {
    if (!isLiked) {
      currentCount++;
    } else {
      currentCount = Math.max(0, currentCount - 1);
    }
    countSpan.textContent = currentCount > 0 ? formatCount(currentCount) : '';
  }

  try {
    const postRef = db.collection('posts').doc(postId);

    // Update likes array using arrayUnion/arrayRemove
    if (isLiked) {
      // Remove like
      await postRef.update({
        likes: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
      });

      // Delete notification when unliking
      const postDoc = await postRef.get();
      const postData = postDoc.data();
      if (postData && postData.userId && postData.userId !== currentUser.uid) {
        deleteNotification(postData.userId, 'like', postId);
      }
    } else {
      // Add like
      await postRef.update({
        likes: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
      });

      // Create notification for post author
      const postDoc = await postRef.get();
      const postData = postDoc.data();
      if (postData && postData.userId && postData.userId !== currentUser.uid) {
        createNotification(postData.userId, 'like', `le dio like a tu publicación`, { postId });
      }
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    // Revert optimistic update on error
    button.classList.toggle('liked');
    if (svg) {
      if (isLiked) {
        svg.setAttribute('fill', '#ef4444');
        svg.setAttribute('stroke', '#ef4444');
      } else {
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
      }
    }
    if (countSpan) {
      // Revert count
      if (!isLiked) {
        currentCount = Math.max(0, currentCount - 1);
      } else {
        currentCount++;
      }
      countSpan.textContent = currentCount > 0 ? formatCount(currentCount) : '';
    }
    showToast('Error al dar like', 'error');
  }
}

// Handle comment button click - Toggle inline comments section
async function handleFeedComment(postId, button) {
  // Find the parent card and the comments section
  const card = button.closest('.feed-card');
  if (!card) return;

  const commentsSection = card.querySelector('.feed-comments-section');
  if (!commentsSection) return;

  // Toggle visibility
  const isHidden = commentsSection.classList.contains('hidden');

  if (isHidden) {
    // Show comments section
    commentsSection.classList.remove('hidden');

    // Load comments if not already loaded
    const commentsList = commentsSection.querySelector('.feed-comments-list');
    if (commentsList && !commentsList.dataset.loaded) {
      await loadInlineComments(postId, commentsList);
      commentsList.dataset.loaded = 'true';
    }

    // Focus on input
    const input = commentsSection.querySelector('.feed-comment-input');
    if (input) input.focus();
  } else {
    // Hide comments section
    commentsSection.classList.add('hidden');
  }
}

// Load comments for inline display
async function loadInlineComments(postId, container) {
  try {
    container.innerHTML = '<div class="loading-spinner-small">Cargando...</div>';

    // Get post data to check if current user is the post author
    const postDoc = await db.collection('posts').doc(postId).get();
    const postData = postDoc.data();
    const postAuthorId = postData?.userId || null;
    const currentUserId = currentUser?.uid || null;
    const isPostAuthor = currentUserId && postAuthorId && currentUserId === postAuthorId;

    const snapshot = await db.collection('posts')
      .doc(postId)
      .collection('comments')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    if (snapshot.empty) {
      container.innerHTML = '<p class="no-comments">No hay comentarios aún. Sé el primero!</p>';
      return;
    }

    let html = '';
    snapshot.forEach(doc => {
      const comment = doc.data();
      const date = comment.createdAt ? formatTimeAgo(comment.createdAt.toDate()) : '';
      const photoUrl = comment.userPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName || 'U')}&background=10b981&color=fff&size=40`;

      // Permisos de UI: Determinar quÃ© opciones mostrar
      const commentAuthorId = comment.userId || null;
      const isCommentAuthor = currentUserId && commentAuthorId && currentUserId === commentAuthorId;
      const canDelete = isCommentAuthor || isPostAuthor;
      const canEdit = isCommentAuthor; // Solo el autor puede editar

      // MenÃº de opciones (tres puntos) - mostrar solo si hay al menos una opciÃ³n disponible
      // El dropdown se renderiza en el portal (#dropdown-portal) para evitar clipping/scroll
      const menuButton = (canEdit || canDelete) ? `
        <div class="feed-comment-menu-wrapper">
          <button class="feed-comment-menu-btn"
                  data-comment-id="${doc.id}"
                  data-post-id="${postId}"
                  data-comment-author-id="${commentAuthorId}"
                  data-post-author-id="${postAuthorId}"
                  data-can-edit="${canEdit}"
                  data-can-delete="${canDelete}"
                  title="Opciones">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="1"></circle>
              <circle cx="19" cy="12" r="1"></circle>
              <circle cx="5" cy="12" r="1"></circle>
            </svg>
          </button>
        </div>
      ` : '';

      // Likes data
      const likes = comment.likes || [];
      const likesCount = likes.length;
      const isLiked = currentUserId && likes.includes(currentUserId);
      const repliesCount = comment.repliesCount || 0;

      html += `
        <div class="feed-comment-item" data-comment-id="${doc.id}" data-post-id="${postId}">
          <img src="${photoUrl}" alt="${comment.userName}" class="feed-comment-avatar" referrerPolicy="no-referrer" onerror="this.src='${generateAvatarFallback(comment.userName || 'U', 40)}'; this.onerror=null;">
          <div class="feed-comment-content">
            <div class="feed-comment-header">
              <span class="feed-comment-username">${comment.userName || 'Usuario'}</span>
              <span class="feed-comment-time">${date}</span>
              ${menuButton}
            </div>
            <div class="feed-comment-text-wrapper">
              <p class="feed-comment-text" data-comment-id="${doc.id}">${comment.text || ''}</p>
              <div class="feed-comment-edit-wrapper hidden" data-comment-id="${doc.id}">
                <textarea class="feed-comment-edit-input" data-comment-id="${doc.id}" rows="2">${comment.text || ''}</textarea>
                <div class="feed-comment-edit-actions">
                  <button class="feed-comment-edit-cancel" data-comment-id="${doc.id}">Cancelar</button>
                  <button class="feed-comment-edit-save" data-comment-id="${doc.id}">
                    <span class="feed-comment-edit-save-text">Guardar</span>
                    <span class="feed-comment-edit-save-loading hidden">Guardando...</span>
                  </button>
                </div>
              </div>
            </div>
            <!-- Action Bar: Like, Reply, View Replies -->
            <div class="feed-comment-actions">
              <button class="feed-comment-action-btn feed-comment-like-btn ${isLiked ? 'liked' : ''}"
                      data-comment-id="${doc.id}"
                      data-post-id="${postId}"
                      title="Me gusta">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                <span class="feed-comment-action-count">${likesCount > 0 ? likesCount : ''}</span>
              </button>
              <button class="feed-comment-action-btn feed-comment-reply-btn"
                      data-comment-id="${doc.id}"
                      data-post-id="${postId}"
                      data-comment-author="${comment.userName || 'Usuario'}"
                      title="Responder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                </svg>
                <span>Responder</span>
              </button>
              ${repliesCount > 0 ? `
                <button class="feed-comment-action-btn feed-comment-view-replies"
                        data-comment-id="${doc.id}"
                        data-post-id="${postId}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                  <span>Ver ${repliesCount} ${repliesCount === 1 ? 'respuesta' : 'respuestas'}</span>
                </button>
              ` : ''}
            </div>
            <!-- Reply Form (hidden by default) -->
            <div class="feed-comment-reply-form hidden" data-comment-id="${doc.id}" data-post-id="${postId}">
              <input type="text" class="feed-comment-reply-input" placeholder="Escribe una respuesta..." autocomplete="off">
              <button type="button" class="feed-comment-reply-submit" title="Publicar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
            <!-- Replies Container -->
            <div class="feed-comment-replies hidden" data-comment-id="${doc.id}" data-post-id="${postId}"></div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Portal container for dropdowns
    const dropdownPortal = document.getElementById('dropdown-portal');

    // Function to close any open dropdown in portal
    function closePortalDropdown() {
      if (dropdownPortal) {
        dropdownPortal.innerHTML = '';
      }
    }

    // Function to create and position dropdown in portal
    function openDropdownInPortal(btn) {
      const commentId = btn.dataset.commentId;
      const canEdit = btn.dataset.canEdit === 'true';
      const canDelete = btn.dataset.canDelete === 'true';

      // Close any existing dropdown first
      closePortalDropdown();

      // Get button position using getBoundingClientRect
      const rect = btn.getBoundingClientRect();

      // Create dropdown HTML
      const dropdownHTML = `
        <div class="feed-comment-menu-dropdown feed-comment-menu-dropdown-portal" data-comment-id="${commentId}">
          ${canEdit ? `
            <button class="feed-comment-menu-item" data-action="edit" data-comment-id="${commentId}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              <span>Editar</span>
            </button>
          ` : ''}
          ${canDelete ? `
            <button class="feed-comment-menu-item feed-comment-menu-item-danger" data-action="delete" data-comment-id="${commentId}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Borrar</span>
            </button>
          ` : ''}
        </div>
      `;

      dropdownPortal.innerHTML = dropdownHTML;
      const dropdown = dropdownPortal.querySelector('.feed-comment-menu-dropdown');

      // Position dropdown with fixed positioning
      // Align to the right of the button
      const dropdownWidth = 180; // min-width from CSS
      let left = rect.right - dropdownWidth;
      let top = rect.bottom + 8;

      // Ensure dropdown doesn't go off-screen (left edge)
      if (left < 8) {
        left = 8;
      }

      // Ensure dropdown doesn't go off-screen (right edge)
      if (left + dropdownWidth > window.innerWidth - 8) {
        left = window.innerWidth - dropdownWidth - 8;
      }

      // If dropdown would go below viewport, position above button
      const dropdownHeight = dropdown.offsetHeight || 100;
      if (top + dropdownHeight > window.innerHeight - 8) {
        top = rect.top - dropdownHeight - 8;
      }

      dropdown.style.position = 'fixed';
      dropdown.style.top = `${top}px`;
      dropdown.style.left = `${left}px`;
      dropdown.style.zIndex = '9999';

      // Attach click listeners to dropdown items
      dropdown.querySelectorAll('.feed-comment-menu-item').forEach(item => {
        item.addEventListener('click', async (e) => {
          e.stopPropagation();
          const action = item.dataset.action;
          const itemCommentId = item.dataset.commentId;
          const commentItem = container.querySelector(`.feed-comment-item[data-comment-id="${itemCommentId}"]`);
          const postId = commentItem?.dataset.postId;

          // Close dropdown
          closePortalDropdown();

          if (action === 'edit') {
            await handleEditComment(itemCommentId, commentItem);
          } else if (action === 'delete') {
            const menuBtn = container.querySelector(`.feed-comment-menu-btn[data-comment-id="${itemCommentId}"]`);
            const commentAuthorId = menuBtn?.dataset.commentAuthorId;
            const postAuthorId = menuBtn?.dataset.postAuthorId;

            if (typeof showConfirm === 'function') {
              const confirmed = await showConfirm('Â¿Eliminar este comentario?', 'Eliminar comentario');
              if (confirmed) {
                await deleteInlineComment(postId, itemCommentId, container, commentAuthorId, postAuthorId);
              }
            } else {
              if (confirm('Â¿Eliminar este comentario?')) {
                await deleteInlineComment(postId, itemCommentId, container, commentAuthorId, postAuthorId);
              }
            }
          }
        });
      });
    }

    // Attach menu button event listeners
    container.querySelectorAll('.feed-comment-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const commentId = btn.dataset.commentId;
        const existingDropdown = dropdownPortal?.querySelector(`.feed-comment-menu-dropdown[data-comment-id="${commentId}"]`);

        if (existingDropdown) {
          // Toggle off if same dropdown
          closePortalDropdown();
        } else {
          // Open new dropdown
          openDropdownInPortal(btn);
        }
      });
    });

    // Click-outside listener to close dropdown
    function handleClickOutside(e) {
      // Don't close if clicking on a menu button or inside the dropdown
      if (e.target.closest('.feed-comment-menu-btn') || e.target.closest('.feed-comment-menu-dropdown')) {
        return;
      }
      closePortalDropdown();
    }

    // Use capture phase to ensure we catch the event
    document.addEventListener('click', handleClickOutside, true);

    // Attach edit action listeners
    container.querySelectorAll('.feed-comment-edit-cancel').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const commentId = btn.dataset.commentId;
        cancelEditComment(commentId, container);
      });
    });

    container.querySelectorAll('.feed-comment-edit-save').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const commentId = btn.dataset.commentId;
        const commentItem = container.querySelector(`.feed-comment-item[data-comment-id="${commentId}"]`);
        const postId = commentItem?.dataset.postId;
        await handleUpdateComment(postId, commentId, container);
      });
    });

    // Like button listeners
    container.querySelectorAll('.feed-comment-like-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const commentId = btn.dataset.commentId;
        const postId = btn.dataset.postId;
        await handleCommentLike(postId, commentId, btn);
      });
    });

    // Reply button listeners (toggle reply form)
    container.querySelectorAll('.feed-comment-reply-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const commentId = btn.dataset.commentId;
        toggleReplyForm(commentId, container);
      });
    });

    // Reply form input listeners (submit on Enter)
    container.querySelectorAll('.feed-comment-reply-input').forEach(input => {
      // Submit on Enter
      input.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
          e.preventDefault();
          const form = input.closest('.feed-comment-reply-form');
          const commentId = form?.dataset.commentId;
          const postId = form?.dataset.postId;
          await handleSubmitReply(postId, commentId, input.value.trim(), container);
          input.value = '';
        }
      });
    });

    // Reply submit button listeners
    container.querySelectorAll('.feed-comment-reply-submit').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const form = btn.closest('.feed-comment-reply-form');
        const input = form?.querySelector('.feed-comment-reply-input');
        const commentId = form?.dataset.commentId;
        const postId = form?.dataset.postId;
        if (input?.value.trim()) {
          await handleSubmitReply(postId, commentId, input.value.trim(), container);
          input.value = '';
        }
      });
    });

    // View replies button listeners
    container.querySelectorAll('.feed-comment-view-replies').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const commentId = btn.dataset.commentId;
        const postId = btn.dataset.postId;
        await toggleReplies(postId, commentId, btn, container);
      });
    });

  } catch (error) {
    console.error('Error loading comments:', error);
    container.innerHTML = '<p class="comments-error">Error al cargar comentarios</p>';
  }
}

// Handle comment like toggle
async function handleCommentLike(postId, commentId, btn) {
  if (!currentUser) {
    showToast('Inicia sesión para dar like', 'info');
    return;
  }

  const commentRef = db.collection('posts').doc(postId).collection('comments').doc(commentId);
  const countSpan = btn.querySelector('.feed-comment-action-count');

  try {
    const isLiked = btn.classList.contains('liked');

    if (isLiked) {
      // Remove like
      await commentRef.update({
        likes: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
      });
      btn.classList.remove('liked');
      const currentCount = parseInt(countSpan.textContent) || 1;
      countSpan.textContent = currentCount > 1 ? currentCount - 1 : '';
    } else {
      // Add like
      await commentRef.update({
        likes: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
      });
      btn.classList.add('liked');
      const currentCount = parseInt(countSpan.textContent) || 0;
      countSpan.textContent = currentCount + 1;
    }
  } catch (error) {
    console.error('Error toggling comment like:', error);
    showToast('Error al procesar like', 'error');
  }
}

// Toggle reply form visibility
function toggleReplyForm(commentId, container) {
  const form = container.querySelector(`.feed-comment-reply-form[data-comment-id="${commentId}"]`);
  if (!form) return;

  const isHidden = form.classList.contains('hidden');

  // Close all other reply forms first
  container.querySelectorAll('.feed-comment-reply-form').forEach(f => {
    f.classList.add('hidden');
    // Limpiar input al cerrar
    const input = f.querySelector('.feed-comment-reply-input');
    if (input) {
      input.value = '';
    }
  });

  if (isHidden) {
    // Obtener el username del autor del comentario desde el botÃ³n
    const replyBtn = container.querySelector(`.feed-comment-reply-btn[data-comment-id="${commentId}"]`);
    const replyToUserName = replyBtn?.dataset.commentAuthor || '';

    // Guardar el username en el atributo data del formulario
    if (replyToUserName) {
      form.setAttribute('data-reply-to-user', replyToUserName);
    }

    form.classList.remove('hidden');
    const input = form.querySelector('.feed-comment-reply-input');
    if (input) {
      input.value = ''; // Input vacÃ­o, sin pre-llenar
      input.focus();
    }
  }
}

// Handle submit reply
async function handleSubmitReply(postId, commentId, text, container) {
  if (!currentUser) {
    showToast('Inicia sesión para responder', 'info');
    return;
  }

  if (!text.trim()) return;

  try {
    // Get user photo from Firestore (might be different from Auth)
    let userPhotoURL = currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.displayName || 'U')}&background=10b981&color=fff&size=40`;
    try {
      const userDoc = await db.collection('users').doc(currentUser.uid).get();
      if (userDoc.exists && userDoc.data().photoURL) {
        userPhotoURL = userDoc.data().photoURL;
      }
    } catch (e) {
      console.warn('Could not fetch user photo for reply', e);
    }

    // Obtener el username del destinatario desde el atributo data del formulario
    const form = container.querySelector(`.feed-comment-reply-form[data-comment-id="${commentId}"]`);
    const replyToUserName = form?.getAttribute('data-reply-to-user') || '';

    // Limpiar el texto de menciones (@username)
    let cleanText = text.trim();
    if (replyToUserName) {
      // Eliminar menciones que empiecen con @ seguido del username
      const mentionPattern = new RegExp(`@${replyToUserName}\\s*`, 'gi');
      cleanText = cleanText.replace(mentionPattern, '').trim();
    }

    // Crear objeto para guardar en Firestore
    const replyData = {
      text: cleanText,
      userId: currentUser.uid,
      userName: currentUser.displayName || 'Usuario',
      userPhoto: userPhotoURL,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      likes: []
    };

    // AÃ±adir replyToUserName si existe
    if (replyToUserName) {
      replyData.replyToUserName = replyToUserName;
    }

    // Create reply in subcollection
    const replyRef = db.collection('posts').doc(postId).collection('comments').doc(commentId).collection('replies');
    await replyRef.add(replyData);

    // Update repliesCount on parent comment
    const commentRef = db.collection('posts').doc(postId).collection('comments').doc(commentId);
    await commentRef.update({
      repliesCount: firebase.firestore.FieldValue.increment(1)
    });

    // Hide reply form (reutilizar la variable form ya declarada)
    form?.classList.add('hidden');

    // Show replies container and load replies
    const repliesContainer = container.querySelector(`.feed-comment-replies[data-comment-id="${commentId}"]`);
    const viewRepliesBtn = container.querySelector(`.feed-comment-view-replies[data-comment-id="${commentId}"]`);

    if (repliesContainer) {
      repliesContainer.classList.remove('hidden');
      await loadReplies(postId, commentId, repliesContainer);
    }

    // Update or create view replies button
    if (viewRepliesBtn) {
      const currentCount = parseInt(viewRepliesBtn.textContent.match(/\d+/)?.[0] || '0') + 1;
      viewRepliesBtn.querySelector('span').textContent = `Ver ${currentCount} ${currentCount === 1 ? 'respuesta' : 'respuestas'}`;
    } else {
      // Create view replies button if it doesn't exist (inside actions div)
      const commentItem = container.querySelector(`.feed-comment-item[data-comment-id="${commentId}"]`);
      const actionsDiv = commentItem?.querySelector('.feed-comment-actions');
      if (actionsDiv && !viewRepliesBtn) {
        const newBtn = document.createElement('button');
        newBtn.className = 'feed-comment-action-btn feed-comment-view-replies';
        newBtn.dataset.commentId = commentId;
        newBtn.dataset.postId = postId;
        newBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          <span>Ver 1 respuesta</span>
        `;
        newBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await toggleReplies(postId, commentId, newBtn, container);
        });
        // Append inside the actions div (after Reply button)
        actionsDiv.appendChild(newBtn);
      }
    }

    showToast('Respuesta publicada', 'success');
  } catch (error) {
    console.error('Error submitting reply:', error);
    showToast('Error al publicar respuesta', 'error');
  }
}

// Toggle replies visibility and load if needed
async function toggleReplies(postId, commentId, btn, container) {
  const repliesContainer = container.querySelector(`.feed-comment-replies[data-comment-id="${commentId}"]`);
  if (!repliesContainer) return;

  const isHidden = repliesContainer.classList.contains('hidden');

  if (isHidden) {
    repliesContainer.classList.remove('hidden');
    btn.querySelector('svg')?.setAttribute('style', 'transform: rotate(180deg)');

    // Load replies if not loaded yet
    if (!repliesContainer.dataset.loaded) {
      await loadReplies(postId, commentId, repliesContainer);
      repliesContainer.dataset.loaded = 'true';
    }
  } else {
    repliesContainer.classList.add('hidden');
    btn.querySelector('svg')?.setAttribute('style', '');
  }
}

// Load replies for a comment
async function loadReplies(postId, commentId, container) {
  try {
    container.innerHTML = '<div class="feed-comment-replies-loading">Cargando respuestas...</div>';

    const snapshot = await db.collection('posts')
      .doc(postId)
      .collection('comments')
      .doc(commentId)
      .collection('replies')
      .orderBy('createdAt', 'asc')
      .limit(20)
      .get();

    if (snapshot.empty) {
      container.innerHTML = '';
      return;
    }

    const currentUserId = currentUser?.uid || null;
    let html = '';

    snapshot.forEach(doc => {
      const reply = doc.data();
      const date = reply.createdAt ? formatTimeAgo(reply.createdAt.toDate()) : '';
      const photoUrl = reply.userPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(reply.userName || 'U')}&background=10b981&color=fff&size=28`;

      // Likes data
      const likes = reply.likes || [];
      const likesCount = likes.length;
      const isLiked = currentUserId && likes.includes(currentUserId);

      // Permissions
      const isReplyAuthor = currentUserId && reply.userId === currentUserId;

      const replyUserName = reply.userName || 'Usuario';
      const replyToUserName = reply.replyToUserName || '';

      html += `
        <div class="feed-comment-item feed-reply-item"
             data-reply-id="${doc.id}"
             data-parent-id="${commentId}"
             data-post-id="${postId}"
             data-username="${replyUserName}">
          <img src="${photoUrl}" alt="${replyUserName}" class="feed-comment-avatar" referrerPolicy="no-referrer" onerror="this.src='${generateAvatarFallback(replyUserName, 28)}'; this.onerror=null;">
          <div class="feed-comment-content">
            <div class="feed-comment-header">
              <span class="feed-comment-username">${replyUserName}</span>
              ${replyToUserName ? `
                <svg class="feed-reply-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
                <span class="feed-reply-to-username">${replyToUserName}</span>
              ` : ''}
              <span class="feed-comment-time">${date}</span>
              ${isReplyAuthor ? `
                <div class="feed-comment-menu-wrapper">
                  <button class="feed-comment-menu-btn feed-reply-menu-btn"
                          data-reply-id="${doc.id}"
                          data-comment-id="${commentId}"
                          data-post-id="${postId}"
                          title="Opciones">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="1"></circle>
                      <circle cx="19" cy="12" r="1"></circle>
                      <circle cx="5" cy="12" r="1"></circle>
                    </svg>
                  </button>
                </div>
              ` : ''}
            </div>
            <p class="feed-comment-text">${reply.text || ''}</p>
            <div class="feed-comment-actions">
              <button class="feed-comment-action-btn feed-reply-like-btn ${isLiked ? 'liked' : ''}"
                      data-reply-id="${doc.id}"
                      data-comment-id="${commentId}"
                      data-post-id="${postId}"
                      title="Me gusta">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                <span class="feed-comment-action-count">${likesCount > 0 ? likesCount : ''}</span>
              </button>
              <button class="feed-comment-action-btn feed-reply-to-reply-btn"
                      data-reply-id="${doc.id}"
                      data-parent-id="${commentId}"
                      data-post-id="${postId}"
                      data-username="${replyUserName}"
                      title="Responder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                </svg>
                <span>Responder</span>
              </button>
            </div>
            <!-- Reply-to-reply form (hidden by default) -->
            <div class="feed-comment-reply-form feed-reply-to-reply-form hidden"
                 data-reply-id="${doc.id}"
                 data-parent-id="${commentId}"
                 data-post-id="${postId}">
              <input type="text" class="feed-comment-reply-input" placeholder="Escribe una respuesta..." autocomplete="off">
              <button type="button" class="feed-comment-reply-submit" title="Publicar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Attach like listeners for replies
    container.querySelectorAll('.feed-reply-like-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const replyId = btn.dataset.replyId;
        const commentId = btn.dataset.commentId;
        const postId = btn.dataset.postId;
        await handleReplyLike(postId, commentId, replyId, btn);
      });
    });

    // Attach delete listeners for replies
    container.querySelectorAll('.feed-reply-menu-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const replyId = btn.dataset.replyId;
        const commentId = btn.dataset.commentId;
        const postId = btn.dataset.postId;

        if (typeof showConfirm === 'function') {
          const confirmed = await showConfirm('Â¿Eliminar esta respuesta?', 'Eliminar respuesta');
          if (confirmed) {
            await deleteReply(postId, commentId, replyId, container);
          }
        } else {
          if (confirm('Â¿Eliminar esta respuesta?')) {
            await deleteReply(postId, commentId, replyId, container);
          }
        }
      });
    });

    // Attach "Reply to reply" button listeners
    container.querySelectorAll('.feed-reply-to-reply-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const replyId = btn.dataset.replyId;
        const parentId = btn.dataset.parentId;
        const username = btn.dataset.username;
        toggleReplyToReplyForm(replyId, parentId, username, container);
      });
    });

    // Attach input listeners for reply-to-reply forms (submit on Enter)
    container.querySelectorAll('.feed-reply-to-reply-form .feed-comment-reply-input').forEach(input => {
      // Submit on Enter
      input.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
          e.preventDefault();
          const form = input.closest('.feed-reply-to-reply-form');
          const replyId = form?.dataset.replyId;
          const parentId = form?.dataset.parentId;
          const postId = form?.dataset.postId;
          await handleSubmitReplyToReply(postId, parentId, replyId, input.value.trim(), container);
          input.value = '';
        }
      });
    });

    // Attach submit button listeners for reply-to-reply forms
    container.querySelectorAll('.feed-reply-to-reply-form .feed-comment-reply-submit').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const form = btn.closest('.feed-reply-to-reply-form');
        const input = form?.querySelector('.feed-comment-reply-input');
        const replyId = form?.dataset.replyId;
        const parentId = form?.dataset.parentId;
        const postId = form?.dataset.postId;
        if (input?.value.trim()) {
          await handleSubmitReplyToReply(postId, parentId, replyId, input.value.trim(), container);
          input.value = '';
        }
      });
    });

  } catch (error) {
    console.error('Error loading replies:', error);
    container.innerHTML = '<p class="comments-error">Error al cargar respuestas</p>';
  }
}

// Handle reply like toggle
async function handleReplyLike(postId, commentId, replyId, btn) {
  if (!currentUser) {
    showToast('Inicia sesión para dar like', 'info');
    return;
  }

  const replyRef = db.collection('posts').doc(postId).collection('comments').doc(commentId).collection('replies').doc(replyId);
  const countSpan = btn.querySelector('.feed-comment-action-count');

  try {
    const isLiked = btn.classList.contains('liked');

    if (isLiked) {
      await replyRef.update({
        likes: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
      });
      btn.classList.remove('liked');
      const currentCount = parseInt(countSpan.textContent) || 1;
      countSpan.textContent = currentCount > 1 ? currentCount - 1 : '';
    } else {
      await replyRef.update({
        likes: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
      });
      btn.classList.add('liked');
      const currentCount = parseInt(countSpan.textContent) || 0;
      countSpan.textContent = currentCount + 1;
    }
  } catch (error) {
    console.error('Error toggling reply like:', error);
    showToast('Error al procesar like', 'error');
  }
}

// Delete a reply
async function deleteReply(postId, commentId, replyId, container) {
  if (!currentUser) {
    showToast('Inicia sesión para eliminar', 'info');
    return;
  }

  try {
    // Delete reply
    await db.collection('posts').doc(postId).collection('comments').doc(commentId).collection('replies').doc(replyId).delete();

    // Update repliesCount on parent comment
    await db.collection('posts').doc(postId).collection('comments').doc(commentId).update({
      repliesCount: firebase.firestore.FieldValue.increment(-1)
    });

    // Remove from DOM
    const replyItem = container.querySelector(`.feed-reply-item[data-reply-id="${replyId}"]`);
    replyItem?.remove();

    showToast('Respuesta eliminada', 'success');
  } catch (error) {
    console.error('Error deleting reply:', error);
    showToast('Error al eliminar respuesta', 'error');
  }
}

// Toggle reply-to-reply form visibility (sin pre-llenar con @username)
function toggleReplyToReplyForm(replyId, parentId, username, container) {
  const form = container.querySelector(`.feed-reply-to-reply-form[data-reply-id="${replyId}"]`);
  if (!form) return;

  const isHidden = form.classList.contains('hidden');

  // Close all other reply-to-reply forms first
  container.querySelectorAll('.feed-reply-to-reply-form').forEach(f => {
    f.classList.add('hidden');
    // Clear inputs when closing
    const input = f.querySelector('.feed-comment-reply-input');
    if (input && f !== form) {
      input.value = '';
    }
  });

  if (isHidden) {
    // Guardar el username en el atributo data del formulario
    if (username) {
      form.setAttribute('data-reply-to-user', username);
    }

    form.classList.remove('hidden');
    const input = form.querySelector('.feed-comment-reply-input');
    if (input) {
      // Input vacÃ­o, sin pre-llenar
      input.value = '';
      input.focus();
    }
  }
}

// Handle submit reply to a reply (nested level 2)
async function handleSubmitReplyToReply(postId, parentCommentId, replyToId, text, container) {
  if (!currentUser) {
    showToast('Inicia sesión para responder', 'info');
    return;
  }

  if (!text.trim()) return;

  try {
    // Get user photo from Firestore
    let userPhotoURL = currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.displayName || 'U')}&background=10b981&color=fff&size=40`;
    try {
      const userDoc = await db.collection('users').doc(currentUser.uid).get();
      if (userDoc.exists && userDoc.data().photoURL) {
        userPhotoURL = userDoc.data().photoURL;
      }
    } catch (e) {
      console.warn('Could not fetch user photo for reply', e);
    }

    // Obtener el username del destinatario desde el atributo data del formulario
    const form = container.querySelector(`.feed-reply-to-reply-form[data-reply-id="${replyToId}"]`);
    const replyToUserName = form?.getAttribute('data-reply-to-user') || '';

    // Limpiar el texto de menciones (@username)
    let cleanText = text.trim();
    if (replyToUserName) {
      // Eliminar menciones que empiecen con @ seguido del username
      const mentionPattern = new RegExp(`@${replyToUserName}\\s*`, 'gi');
      cleanText = cleanText.replace(mentionPattern, '').trim();
    }

    // Crear objeto para guardar en Firestore
    const replyData = {
      text: cleanText,
      userId: currentUser.uid,
      userName: currentUser.displayName || 'Usuario',
      userPhoto: userPhotoURL,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      likes: [],
      replyToId: replyToId // Reference to the reply being responded to
    };

    // AÃ±adir replyToUserName si existe
    if (replyToUserName) {
      replyData.replyToUserName = replyToUserName;
    }

    // Save to the SAME subcollection as the parent comment's replies (no sub-sub-collections)
    const repliesRef = db.collection('posts').doc(postId).collection('comments').doc(parentCommentId).collection('replies');
    await repliesRef.add(replyData);

    // Update repliesCount on parent comment
    const commentRef = db.collection('posts').doc(postId).collection('comments').doc(parentCommentId);
    await commentRef.update({
      repliesCount: firebase.firestore.FieldValue.increment(1)
    });

    // Hide the reply form (reutilizar la variable form ya declarada)
    if (form) {
      form.classList.add('hidden');
      const input = form.querySelector('.feed-comment-reply-input');
      if (input) {
        input.value = '';
      }
    }

    // Reload replies to show the new one
    await loadReplies(postId, parentCommentId, container);

    showToast('Respuesta publicada', 'success');
  } catch (error) {
    console.error('Error submitting reply to reply:', error);
    showToast('Error al publicar respuesta', 'error');
  }
}

// Handle edit comment - switch to edit mode
async function handleEditComment(commentId, commentItem) {
  const textWrapper = commentItem.querySelector('.feed-comment-text-wrapper');
  const textElement = textWrapper.querySelector('.feed-comment-text');
  const editWrapper = textWrapper.querySelector('.feed-comment-edit-wrapper');
  const editInput = editWrapper.querySelector('.feed-comment-edit-input');

  if (!textElement || !editWrapper || !editInput) return;

  // Hide text, show edit form
  textElement.classList.add('hidden');
  editWrapper.classList.remove('hidden');

  // Focus and select text
  editInput.focus();
  editInput.setSelectionRange(editInput.value.length, editInput.value.length);
}

// Cancel edit comment - switch back to view mode
function cancelEditComment(commentId, container) {
  const commentItem = container.querySelector(`.feed-comment-item[data-comment-id="${commentId}"]`);
  if (!commentItem) return;

  const textWrapper = commentItem.querySelector('.feed-comment-text-wrapper');
  const textElement = textWrapper.querySelector('.feed-comment-text');
  const editWrapper = textWrapper.querySelector('.feed-comment-edit-wrapper');
  const editInput = editWrapper.querySelector('.feed-comment-edit-input');

  if (!textElement || !editWrapper || !editInput) return;

  // Reset input to original text
  editInput.value = textElement.textContent;

  // Hide edit form, show text
  editWrapper.classList.add('hidden');
  textElement.classList.remove('hidden');
}

// Handle update comment - save edited comment to Firestore
async function handleUpdateComment(postId, commentId, container) {
  if (!currentUser) {
    showToast('Inicia sesión para editar comentarios', 'info');
    return;
  }

  const commentItem = container.querySelector(`.feed-comment-item[data-comment-id="${commentId}"]`);
  if (!commentItem) return;

  const editWrapper = commentItem.querySelector(`.feed-comment-edit-wrapper[data-comment-id="${commentId}"]`);
  const editInput = editWrapper.querySelector('.feed-comment-edit-input');
  const saveBtn = editWrapper.querySelector('.feed-comment-edit-save');
  const saveText = saveBtn.querySelector('.feed-comment-edit-save-text');
  const saveLoading = saveBtn.querySelector('.feed-comment-edit-save-loading');
  const textElement = commentItem.querySelector(`.feed-comment-text[data-comment-id="${commentId}"]`);

  if (!editInput || !saveBtn || !textElement) return;

  const newText = editInput.value.trim();

  if (!newText) {
    showToast('El comentario no puede estar vací­o', 'error');
    return;
  }

  // Verificar permisos antes de actualizar
  try {
    const commentDoc = await db.collection('posts').doc(postId).collection('comments').doc(commentId).get();

    if (!commentDoc.exists) {
      showToast('El comentario no existe', 'error');
      return;
    }

    const commentData = commentDoc.data();
    const commentAuthorId = commentData?.userId;

    if (!commentAuthorId || currentUser.uid !== commentAuthorId) {
      showToast('No tienes permisos para editar este comentario', 'error');
      return;
    }

    // Show loading state
    saveBtn.disabled = true;
    saveText.classList.add('hidden');
    saveLoading.classList.remove('hidden');
    editInput.disabled = true;

    // Update comment in Firestore
    await db.collection('posts').doc(postId).collection('comments').doc(commentId).update({
      text: newText,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Update UI - hide edit form, show updated text
    textElement.textContent = newText;
    editWrapper.classList.add('hidden');
    textElement.classList.remove('hidden');

    showToast('Comentario actualizado', 'success');
  } catch (error) {
    console.error('Error updating comment:', error);

    // Restore UI state
    saveText.classList.remove('hidden');
    saveLoading.classList.add('hidden');
    saveBtn.disabled = false;
    editInput.disabled = false;

    // Handle specific errors
    if (error.code === 'permission-denied') {
      showToast('No tienes permisos para editar este comentario', 'error');
    } else if (error.code === 'not-found') {
      showToast('El comentario no existe', 'error');
    } else {
      showToast('Error al actualizar comentario: ' + (error.message || 'Error desconocido'), 'error');
    }
  }
}

// Delete inline comment
async function deleteInlineComment(postId, commentId, container, commentAuthorId, postAuthorId) {
  if (!currentUser) {
    showToast('Inicia sesión para eliminar comentarios', 'info');
    return;
  }

  const currentUserId = currentUser.uid;

  // Verificar permisos antes de intentar eliminar
  const isCommentAuthor = commentAuthorId && currentUserId === commentAuthorId;
  const isPostAuthor = postAuthorId && currentUserId === postAuthorId;
  const hasPermission = isCommentAuthor || isPostAuthor;

  if (!hasPermission) {
    showToast('No tienes permisos para eliminar este comentario', 'error');
    console.error('Permission denied: User does not have permission to delete this comment');
    return;
  }

  try {
    // Obtener el comentario antes de eliminarlo para verificar que existe
    const commentDoc = await db.collection('posts').doc(postId).collection('comments').doc(commentId).get();

    if (!commentDoc.exists) {
      showToast('El comentario no existe', 'error');
      return;
    }

    // Verificar permisos nuevamente con los datos del documento
    const commentData = commentDoc.data();
    const actualCommentAuthorId = commentData?.userId;
    const isActualCommentAuthor = actualCommentAuthorId && currentUserId === actualCommentAuthorId;
    const isActualPostAuthor = postAuthorId && currentUserId === postAuthorId;

    if (!isActualCommentAuthor && !isActualPostAuthor) {
      showToast('No tienes permisos para eliminar este comentario', 'error');
      console.error('Permission denied: User does not have permission to delete this comment');
      return;
    }

    // Eliminar comentario de la subcolecciÃ³n
    await db.collection('posts').doc(postId).collection('comments').doc(commentId).delete();

    // OperaciÃ³n atÃ³mica: Decrementar commentsCount en el documento padre del post
    // Usar increment(-1) para asegurar que el contador se mantenga sincronizado
    await db.collection('posts').doc(postId).update({
      commentsCount: firebase.firestore.FieldValue.increment(-1)
    });

    // Recargar comentarios
    await loadInlineComments(postId, container);

    // Actualizar contador en el botÃ³n
    const card = container.closest('.feed-card');
    const countSpan = card?.querySelector('[data-action="comment"] .feed-action-count');
    if (countSpan) {
      // Obtener documento actualizado del post para leer el nuevo commentsCount
      const postDoc = await db.collection('posts').doc(postId).get();
      const updatedCommentsCount = postDoc.data()?.commentsCount || 0;
      countSpan.textContent = updatedCommentsCount > 0 ? formatCount(updatedCommentsCount) : '';
    }

    showToast('Comentario eliminado', 'success');
  } catch (error) {
    console.error('Error deleting comment:', error);

    // Gestionar errores especÃ­ficos
    if (error.code === 'permission-denied') {
      showToast('No tienes permisos para eliminar este comentario', 'error');
    } else if (error.code === 'not-found') {
      showToast('El comentario no existe', 'error');
    } else {
      showToast('Error al eliminar comentario: ' + (error.message || 'Error desconocido'), 'error');
    }
  }
}

// ================== POST EDIT/DELETE FUNCTIONS ==================

// Handle edit post - show edit form
function handleEditPost(postId, container) {
  if (!currentUser) {
    showToast('Inicia sesión para editar publicaciones', 'info');
    return;
  }

  const card = container.querySelector(`.feed-card[data-post-id="${postId}"]`);
  if (!card) return;

  const textBody = card.querySelector(`.feed-text-body[data-post-id="${postId}"]`);
  const editWrapper = card.querySelector(`.feed-text-edit-wrapper[data-post-id="${postId}"]`);
  const editInput = editWrapper?.querySelector('.feed-text-edit-input');

  if (!textBody || !editWrapper || !editInput) {
    showToast('No se puede editar esta publicaciÃ³n', 'error');
    return;
  }

  // Obtener el texto actual (sin los <br> convertidos)
  const currentText = textBody.textContent || textBody.innerText || '';

  // Mostrar formulario de ediciÃ³n
  textBody.classList.add('hidden');
  editWrapper.classList.remove('hidden');
  editInput.value = currentText;
  editInput.focus();
  editInput.setSelectionRange(editInput.value.length, editInput.value.length);
}

// Cancel edit post - hide edit form
function cancelEditPost(postId, container) {
  const card = container.querySelector(`.feed-card[data-post-id="${postId}"]`);
  if (!card) return;

  const textBody = card.querySelector(`.feed-text-body[data-post-id="${postId}"]`);
  const editWrapper = card.querySelector(`.feed-text-edit-wrapper[data-post-id="${postId}"]`);
  const editInput = editWrapper?.querySelector('.feed-text-edit-input');

  if (!textBody || !editWrapper || !editInput) return;

  // Restaurar valor original
  const originalText = textBody.textContent || textBody.innerText || '';
  editInput.value = originalText;

  // Ocultar formulario de ediciÃ³n
  editWrapper.classList.add('hidden');
  textBody.classList.remove('hidden');
}

// Handle update post - save changes to Firestore
async function handleUpdatePost(postId, container) {
  if (!currentUser) {
    showToast('Inicia sesión para editar publicaciones', 'info');
    return;
  }

  const card = container.querySelector(`.feed-card[data-post-id="${postId}"]`);
  if (!card) return;

  const editWrapper = card.querySelector(`.feed-text-edit-wrapper[data-post-id="${postId}"]`);
  const editInput = editWrapper?.querySelector('.feed-text-edit-input');
  const saveBtn = editWrapper?.querySelector('.feed-text-edit-save');
  const saveText = saveBtn?.querySelector('.feed-text-edit-save-text');
  const saveLoading = saveBtn?.querySelector('.feed-text-edit-save-loading');
  const textBody = card.querySelector(`.feed-text-body[data-post-id="${postId}"]`);

  if (!editInput || !saveBtn || !textBody) return;

  const newText = editInput.value.trim();

  if (!newText) {
    showToast('La publicación no puede estar vací­a', 'error');
    return;
  }

  // Verificar permisos antes de actualizar
  try {
    const postDoc = await db.collection('posts').doc(postId).get();

    if (!postDoc.exists) {
      showToast('La publicación no existe', 'error');
      return;
    }

    const postData = postDoc.data();
    const postAuthorId = postData?.userId;

    if (!postAuthorId || currentUser.uid !== postAuthorId) {
      showToast('No tienes permisos para editar esta publicación', 'error');
      return;
    }

    // Show loading state
    saveBtn.disabled = true;
    saveText.classList.add('hidden');
    saveLoading.classList.remove('hidden');
    editInput.disabled = true;

    // Update post in Firestore
    await db.collection('posts').doc(postId).update({
      content: newText,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Update UI - hide edit form, show updated text
    textBody.innerHTML = newText.replace(/\n/g, '<br>');
    editWrapper.classList.add('hidden');
    textBody.classList.remove('hidden');

    showToast('Publicación actualizada', 'success');
  } catch (error) {
    console.error('Error updating post:', error);

    // Restore UI state
    saveText.classList.remove('hidden');
    saveLoading.classList.add('hidden');
    saveBtn.disabled = false;
    editInput.disabled = false;

    // Handle specific errors
    if (error.code === 'permission-denied') {
      showToast('No tienes permisos para editar esta publicación', 'error');
    } else if (error.code === 'not-found') {
      showToast('La publicación no existe', 'error');
    } else {
      showToast('Error al actualizar publicación: ' + (error.message || 'Error desconocido'), 'error');
    }
  }
}

// Handle delete post - delete from Firestore
async function handleDeletePost(postId, container) {
  if (!currentUser) {
    showToast('Inicia sesión para eliminar publicaciones', 'info');
    return;
  }

  // ConfirmaciÃ³n antes de eliminar
  const confirmed = await showConfirm(
    '¿Estás seguro de que quieres eliminar esta publicación? Esta acción no se puede deshacer.',
    'Eliminar Publicación'
  );

  if (!confirmed) return;

  try {
    // Verificar permisos antes de eliminar
    const postDoc = await db.collection('posts').doc(postId).get();

    if (!postDoc.exists) {
      showToast('La publicaciÃ³n no existe', 'error');
      return;
    }

    const postData = postDoc.data();
    const postAuthorId = postData?.userId;

    if (!postAuthorId || currentUser.uid !== postAuthorId) {
      showToast('No tienes permisos para eliminar esta publicaciÃ³n', 'error');
      return;
    }

    // Eliminar el post de Firestore
    await db.collection('posts').doc(postId).delete();

    // Eliminar el post de la UI
    const card = container.querySelector(`.feed-card[data-post-id="${postId}"]`);
    if (card) {
      // AnimaciÃ³n de salida
      card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-10px)';

      setTimeout(() => {
        card.remove();

        // Si no quedan posts, mostrar estado vacÃ­o
        const remainingPosts = container.querySelectorAll('.feed-card');
        if (remainingPosts.length === 0) {
          showEmptyFeedState(container);
        }
      }, 300);
    }

    showToast('Publicación eliminada', 'success');
  } catch (error) {
    console.error('Error deleting post:', error);

    // Handle specific errors
    if (error.code === 'permission-denied') {
      showToast('No tienes permisos para eliminar esta publicación', 'error');
    } else if (error.code === 'not-found') {
      showToast('La publicación no existe', 'error');
    } else {
      showToast('Error al eliminar publicación: ' + (error.message || 'Error desconocido'), 'error');
    }
  }
}

// Handle inline comment form submission
async function handleInlineCommentSubmit(postId, form) {
  if (!currentUser) {
    showToast('Inicia sesión para comentar', 'info');
    return;
  }

  const input = form.querySelector('.feed-comment-input');
  const text = input?.value?.trim();

  if (!text) return;

  try {
    // Disable form while submitting
    input.disabled = true;

    // Add comment to Firestore subcollection
    await db.collection('posts').doc(postId).collection('comments').add({
      userId: currentUser.uid,
      userName: currentUser.displayName || 'Usuario',
      userPhoto: currentUser.photoURL || '',
      text: text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Atomically increment commentsCount in the parent post document
    await db.collection('posts').doc(postId).update({
      commentsCount: firebase.firestore.FieldValue.increment(1)
    });

    // Clear input
    input.value = '';
    input.disabled = false;

    // Reload comments
    const commentsList = form.parentElement.querySelector('.feed-comments-list');
    if (commentsList) {
      await loadInlineComments(postId, commentsList);
    }

    // Get updated post document (for both count update and notification)
    const postDoc = await db.collection('posts').doc(postId).get();
    const postData = postDoc.data();

    // Update comment count in button - read from updated post data
    const card = form.closest('.feed-card');
    const countSpan = card?.querySelector('[data-action="comment"] .feed-action-count');
    if (countSpan) {
      const updatedCommentsCount = postData?.commentsCount || 0;
      countSpan.textContent = updatedCommentsCount > 0 ? formatCount(updatedCommentsCount) : '';
    }

    // Create notification for post author
    if (postData && postData.userId && postData.userId !== currentUser.uid) {
      createNotification(postData.userId, 'comment', `comentó en tu publicación`, { postId });
    }

  } catch (error) {
    console.error('Error posting comment:', error);
    input.disabled = false;
    showToast('Error al enviar comentario', 'error');
  }
}

// Handle bookmark/save button click - Uses savedPosts array in users/{uid}
// Colors: Active = Amber (#f59e0b), Inactive = outline (no fill)
async function handleFeedBookmark(postId, button) {
  if (!currentUser) {
    showToast('Inicia sesión para guardar', 'info');
    return;
  }

  const isBookmarked = button.classList.contains('bookmarked');
  const svg = button.querySelector('svg');

  // Optimistic UI Update - Immediately update before DB call
  button.classList.toggle('bookmarked');
  if (svg) {
    if (!isBookmarked) {
      // Activating: Amber filled
      svg.setAttribute('fill', '#f59e0b');
      svg.setAttribute('stroke', '#f59e0b');
    } else {
      // Deactivating: Outline only (no fill)
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
    }
  }

  try {
    const userRef = db.collection('users').doc(currentUser.uid);

    // Update savedPosts array using arrayUnion/arrayRemove
    if (isBookmarked) {
      // Remove from saved
      await userRef.update({
        savedPosts: firebase.firestore.FieldValue.arrayRemove(postId)
      });
      showToast('Eliminado de guardados', 'info');
    } else {
      // Add to saved
      await userRef.update({
        savedPosts: firebase.firestore.FieldValue.arrayUnion(postId)
      });
      showToast('Guardado', 'success');
    }
  } catch (error) {
    console.error('Error toggling bookmark:', error);
    // Revert optimistic update on error
    button.classList.toggle('bookmarked');
    if (svg) {
      if (isBookmarked) {
        svg.setAttribute('fill', '#f59e0b');
        svg.setAttribute('stroke', '#f59e0b');
      } else {
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
      }
    }
    showToast('Error al guardar', 'error');
  }
}

// Handle share button click - navigator.share for mobile, clipboard fallback for desktop
async function handleFeedShare(postId) {
  const shareUrl = `${window.location.origin}${window.location.pathname}?post=${postId}`;

  try {
    // Get post data for share text
    const postDoc = await db.collection('posts').doc(postId).get();
    const postData = postDoc.exists ? postDoc.data() : {};

    const shareText = postData?.content
      ? `${postData.userName || 'Usuario'}: ${postData.content.substring(0, 100)}${postData.content.length > 100 ? '...' : ''}`
      : `Mira esta publicación de ${postData?.userName || 'Usuario'} en Climbmaps`;

    const shareData = {
      title: 'Climbmaps',
      text: shareText,
      url: shareUrl
    };

    // Try native share API (mobile)
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return; // Success, exit
      } catch (err) {
        if (err.name === 'AbortError') {
          return; // User cancelled, don't show error
        }
        // Fall through to clipboard fallback
      }
    }

    // Fallback: Copy URL to clipboard (desktop)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Enlace copiado al portapapeles', 'success');
    } else {
      // Legacy fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('Enlace copiado al portapapeles', 'success');
    }
  } catch (error) {
    console.error('Error sharing post:', error);
    showToast('Error al compartir', 'error');
  }
}

// Handle report post - Basic implementation (pending backend)
async function handleReportPost(postId) {
  if (!currentUser) {
    showToast('Inicia sesión para denunciar', 'info');
    return;
  }

  try {
    // For now, just show a confirmation and log
    const confirmed = await showConfirm(
      '¿Estás seguro de que quieres denunciar esta publicación?',
      'Denunciar Publicación'
    );

    if (confirmed) {
      // TODO: Implement backend logic to save report
      console.log('Report submitted for post:', postId, 'by user:', currentUser.uid);

      // Show success message
      showToast('Publicación denunciada. Revisaremos el contenido.', 'success');

      // In the future, this would call:
      // await db.collection('reports').add({
      //   postId: postId,
      //   reportedBy: currentUser.uid,
      //   createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      //   status: 'pending'
      // });
    }
  } catch (error) {
    console.error('Error reporting post:', error);
    showToast('Error al denunciar la publicación', 'error');
  }
}

// Helper function to format counts (reused from renderPostCard)
function formatCount(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num > 0 ? num.toString() : '';
}

// ================== AVATAR HELPER FUNCTIONS ==================
// Generate fallback avatar URL based on name
function generateAvatarFallback(name, size = 200) {
  const encodedName = encodeURIComponent(name || 'Usuario');
  return `https://ui-avatars.com/api/?name=${encodedName}&background=6366f1&color=fff&size=${size}`;
}

// Set avatar with error handling and fallback
function setAvatarWithFallback(imgElement, photoURL, userName, size = 200) {
  if (!imgElement) return;

  // Debug: Log avatar loading attempt
  console.log('[Avatar Debug]', {
    photoURL: photoURL,
    userName: userName,
    elementId: imgElement.id || imgElement.className,
    hasPhotoURL: !!photoURL
  });

  // Default fallback
  const fallback = generateAvatarFallback(userName, size);

  // Set referrerPolicy to avoid CORS issues with Google/Facebook images
  imgElement.referrerPolicy = 'no-referrer';

  // Set error handler for fallback
  imgElement.onerror = () => {
    imgElement.src = fallback;
    imgElement.onerror = null; // Prevent infinite loop
  };

  // If no photoURL, use fallback immediately
  if (!photoURL || photoURL.trim() === '') {
    imgElement.src = fallback;
    imgElement.onerror = null; // Remove error handler since we're using fallback
    return;
  }

  // Set loading state
  imgElement.style.opacity = '0.5';
  imgElement.style.transition = 'opacity 0.3s ease';

  // Create new image to test if URL is valid
  const testImg = new Image();
  testImg.referrerPolicy = 'no-referrer';

  testImg.onload = () => {
    // URL is valid, set it
    imgElement.src = photoURL;
    imgElement.style.opacity = '1';
    console.log('[Avatar Debug] Image loaded successfully:', photoURL);
    // Keep error handler for future errors
  };

  testImg.onerror = () => {
    // URL failed, use fallback
    imgElement.src = fallback;
    imgElement.style.opacity = '1';
    imgElement.onerror = null; // Prevent infinite loop
    console.log('[Avatar Debug] Image failed to load, using fallback:', fallback);
  };

  // Set error handler for the actual image element as backup
  imgElement.onerror = () => {
    imgElement.src = fallback;
    imgElement.style.opacity = '1';
    imgElement.onerror = null; // Prevent infinite loop
  };

  // Start loading test image
  testImg.src = photoURL;

  // Timeout fallback (if image takes too long)
  setTimeout(() => {
    if (imgElement.src !== photoURL || imgElement.complete === false) {
      imgElement.src = fallback;
      imgElement.style.opacity = '1';
    }
  }, 5000);
}

// Update all avatar instances for current user
function updateAllUserAvatars(photoURL, userName) {
  const selectors = [
    '#profile-avatar',
    '.nav-avatar-img',
    '#user-photo',
    '#user-photo-dropdown',
    '#create-post-avatar',
    '#pp-avatar'
  ];

  selectors.forEach(selector => {
    const img = document.querySelector(selector);
    if (img) {
      setAvatarWithFallback(img, photoURL, userName);
    }
  });
}

// Format time ago helper
function formatTimeAgo(date) {
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes}m`;
  if (hours < 24) return `Hace ${hours}h`;
  if (days < 7) return `Hace ${days}d`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// ================== VIEW POST MODAL ==================
async function openPostModal(postId) {
  const modal = document.getElementById('view-post-modal');
  const body = document.getElementById('view-post-body');

  if (!modal || !body) return;

  // Show loading
  body.innerHTML = '<div style="text-align: center; padding: 40px;">Cargando publicación...</div>';
  modal.classList.remove('hidden');

  try {
    // Get post from Firebase
    const postDoc = await db.collection('posts').doc(postId).get();

    if (!postDoc.exists) {
      body.innerHTML = '<div style="text-align: center; padding: 40px; color: #ef4444;">Publicación no encontrada</div>';
      return;
    }

    const postData = postDoc.data();
    const post = {
      id: postDoc.id,
      ...postData,
      photos: postData.photos || (postData.photo ? [postData.photo] : []),
      time: postData.createdAt ? formatTimeAgo(postData.createdAt.toDate()) : 'Ahora'
    };

    // Render post in modal
    renderPostInModal(post, body);

  } catch (error) {
    console.error('Error loading post:', error);
    body.innerHTML = '<div style="text-align: center; padding: 40px; color: #ef4444;">Error al cargar la publicación</div>';
  }
}

function renderPostInModal(post, container) {
  container.innerHTML = '';

  // Check if current user is the author
  const isAuthor = currentUser && post.userId === currentUser.uid;
  const postId = post.id;

  // Header
  const headerHTML = `
    <div class="feed-card-header" style="padding: 16px; border-bottom: 1px solid #f3f4f6; position: relative;">
      <div class="feed-user-info">
        <img src="${post.userPhoto || post.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(post.userName || post.user || 'Usuario') + '&background=6366f1&color=fff&size=200'}" alt="${post.userName || post.user}" class="feed-avatar">
        <div>
          <div class="feed-username">${post.userName || post.user}</div>
          ${post.location ? `<span class="feed-location">${post.location}</span>` : ''}
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        ${isAuthor ? `
          <div style="display: flex; gap: 8px;">
            <button id="edit-post-btn" class="feed-action-btn" data-post-id="${postId}" style="padding: 6px 12px; font-size: 14px; border-radius: 8px; background: #f3f4f6; border: none; cursor: pointer; display: flex; align-items: center; gap: 6px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              Editar
            </button>
            <button id="delete-post-btn" class="feed-action-btn" data-post-id="${postId}" style="padding: 6px 12px; font-size: 14px; border-radius: 8px; background: #fee2e2; border: none; cursor: pointer; display: flex; align-items: center; gap: 6px; color: #dc2626;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Eliminar
            </button>
          </div>
        ` : ''}
        <div class="feed-time">${post.time || 'Ahora'}</div>
      </div>
    </div>
  `;

  // Content based on type
  let contentHTML = '';

  if (post.type === 'photo' || (post.photos && post.photos.length > 0)) {
    const images = post.photos || (post.image ? [post.image] : []);
    if (images.length === 1) {
      contentHTML = `
        <div class="feed-image-container" style="max-height: 70vh; overflow: hidden;">
          <img src="${images[0]}" alt="Post" class="feed-image" style="width: 100%; height: auto; display: block;">
        </div>
      `;
    } else if (images.length > 1) {
      contentHTML = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px; background: #000;">
          ${images.map(img => `<img src="${img}" alt="Post" style="width: 100%; height: 300px; object-fit: cover; display: block;">`).join('')}
        </div>
      `;
    }
    // Add text content if exists
    if (post.content) {
      contentHTML += `
        <div class="feed-text-content" style="padding: 16px;">
          <p class="feed-text-body">${post.content.replace(/\n/g, '<br>')}</p>
        </div>
      `;
    }
  } else if (post.type === 'video' || post.video) {
    contentHTML = `
      <div class="feed-video-container" style="max-height: 70vh;">
        <video src="${post.video}" controls class="feed-video" style="width: 100%; max-height: 70vh; display: block;"></video>
      </div>
    `;
    // Add text content if exists
    if (post.content) {
      contentHTML += `
        <div class="feed-text-content" style="padding: 16px;">
          <p class="feed-text-body">${post.content.replace(/\n/g, '<br>')}</p>
        </div>
      `;
    }
  } else if (post.type === 'text' || post.content) {
    contentHTML = `
      <div class="feed-text-content" style="padding: 24px;">
        ${post.title ? `<h3 class="feed-text-title" style="margin: 0 0 12px; font-size: 20px; font-weight: 700;">${post.title}</h3>` : ''}
        <p class="feed-text-body" style="margin: 0; font-size: 16px; line-height: 1.6; white-space: pre-wrap;">${(post.content || '').replace(/\n/g, '<br>')}</p>
      </div>
    `;
  }

  // Actions bar
  const actionsHTML = `
    <div class="feed-actions-bar" style="padding: 14px 16px; border-top: 1px solid #f3f4f6;">
      <div class="feed-actions-left">
        <button class="feed-action-btn ${post.liked ? 'liked' : ''}" data-post-id="${post.id || ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        </button>
        <button class="feed-action-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
        </button>
        <button class="feed-action-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
      <button class="feed-action-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
      </button>
    </div>
  `;

  // Footer
  const footerHTML = `
    <div style="padding: 0 16px 16px; border-top: 1px solid #f3f4f6;">
      <div class="feed-likes" style="padding: 12px 0 8px; font-weight: 600;">${(post.likes || 0).toLocaleString()} Me gusta</div>
      ${post.caption ? `<div class="feed-caption" style="padding-bottom: 8px;"><span class="feed-caption-user">${post.userName || post.user}</span> ${post.caption}</div>` : ''}
    </div>
  `;

  container.innerHTML = headerHTML + contentHTML + actionsHTML + footerHTML;

  // Add edit and delete button listeners if author
  if (isAuthor) {
    const editBtn = document.getElementById('edit-post-btn');
    editBtn?.addEventListener('click', () => {
      enablePostEditMode(post, container);
    });

    const deleteBtn = document.getElementById('delete-post-btn');
    deleteBtn?.addEventListener('click', () => {
      confirmDeletePost(postId, post);
    });
  }
}

// Confirm and delete post
async function confirmDeletePost(postId, post) {
  // Use the existing confirm modal
  const confirmModal = document.getElementById('confirm-modal');
  const confirmTitle = document.getElementById('confirm-title');
  const confirmMessage = document.getElementById('confirm-message');
  const confirmCancel = document.getElementById('confirm-cancel');
  const confirmOk = document.getElementById('confirm-ok');

  if (!confirmModal) {
    // If no confirm modal, use browser confirm
    if (confirm('¿Estás seguro de que quieres eliminar esta publicación? Esta acción no se puede deshacer.')) {
      await deletePost(postId, post);
    }
    return;
  }

  confirmTitle.textContent = 'Eliminar publicación';
  confirmMessage.textContent = '¿Estás seguro de que quieres eliminar esta publicación? Esta acción no se puede deshacer.';
  confirmOk.textContent = 'Eliminar';
  confirmModal.classList.remove('hidden');

  // Remove old listeners
  const newConfirmOk = confirmOk.cloneNode(true);
  confirmOk.parentNode.replaceChild(newConfirmOk, confirmOk);

  newConfirmOk.addEventListener('click', async () => {
    confirmModal.classList.add('hidden');
    await deletePost(postId, post);
  });

  confirmCancel.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
  });

  // Close on backdrop
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
      confirmModal.classList.add('hidden');
    }
  });
}

async function deletePost(postId, post) {
  if (!currentUser) {
    showToast('Debes iniciar sesión para eliminar', 'error');
    return;
  }

  try {
    // Delete photos from Storage if they exist
    if (post.photos && post.photos.length > 0) {
      for (const photoUrl of post.photos) {
        try {
          // Extract path from URL
          const urlParts = photoUrl.split('/');
          const encodedPath = urlParts.slice(urlParts.indexOf('posts')).join('/');
          const decodedPath = decodeURIComponent(encodedPath.split('?')[0]);
          const storageRef = storage.ref(decodedPath);
          await storageRef.delete();
        } catch (error) {
          console.warn('Error deleting photo from storage:', error);
          // Continue even if photo deletion fails
        }
      }
    }

    // Delete video from Storage if it exists
    if (post.video) {
      try {
        const urlParts = post.video.split('/');
        const encodedPath = urlParts.slice(urlParts.indexOf('posts')).join('/');
        const decodedPath = decodeURIComponent(encodedPath.split('?')[0]);
        const storageRef = storage.ref(decodedPath);
        await storageRef.delete();
      } catch (error) {
        console.warn('Error deleting video from storage:', error);
        // Continue even if video deletion fails
      }
    }

    // Delete post from Firestore
    await db.collection('posts').doc(postId).delete();

    showToast('Publicación eliminada exitosamente', 'success');

    // Close modal
    const viewModal = document.getElementById('view-post-modal');
    if (viewModal) viewModal.classList.add('hidden');

    // Reload profile grid if on profile view
    if (document.getElementById('profile-view') && !document.getElementById('profile-view').classList.contains('hidden')) {
      await renderProfileGrid();
      // Update posts count
      const postsStat = document.getElementById('stat-posts');
      if (postsStat) {
        const count = await getUserPostsCount(currentUser.uid);
        postsStat.textContent = count;
      }
    }

    // Reload feed if on feed view
    if (document.getElementById('feed-view') && !document.getElementById('feed-view').classList.contains('hidden')) {
      await loadFeed();
    }

  } catch (error) {
    console.error('Error deleting post:', error);
    showToast('Error al eliminar la publicación: ' + error.message, 'error');
  }
}

// Enable edit mode for post
function enablePostEditMode(post, container) {
  const postId = post.id;

  // Store original content
  const originalContent = post.content || '';
  const originalPhotos = post.photos || [];
  const originalVideo = post.video || null;

  // Create edit form
  const editFormHTML = `
    <div class="post-edit-form" style="padding: 20px;">
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #111827;">Contenido</label>
        <textarea id="edit-post-content" rows="6" style="width: 100%; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 15px; font-family: inherit; resize: vertical;" placeholder="Escribe tu publicación...">${originalContent}</textarea>
        <div style="text-align: right; margin-top: 4px; font-size: 13px; color: #6b7280;">
          <span id="edit-char-count">${originalContent.length}</span>/2000
        </div>
      </div>
      
      ${originalPhotos.length > 0 ? `
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #111827;">Fotos</label>
          <div id="edit-photos-preview" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; margin-bottom: 8px;">
            ${originalPhotos.map((photo, index) => `
              <div style="position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden;">
                <img src="${photo}" alt="Photo ${index + 1}" style="width: 100%; height: 100%; object-fit: cover;">
                <button type="button" class="remove-photo-btn" data-index="${index}" style="position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; background: rgba(0,0,0,0.6); color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px;">x”</button>
              </div>
            `).join('')}
          </div>
          <button type="button" id="add-more-photos-btn" style="padding: 8px 16px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer; font-size: 14px;">Añadir más fotos</button>
          <input type="file" id="edit-post-photos-input" accept="image/*" multiple style="display: none;">
        </div>
      ` : ''}
      
      ${originalVideo ? `
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #111827;">Video</label>
          <div style="position: relative; border-radius: 8px; overflow: hidden; background: #000; margin-bottom: 8px;">
            <video src="${originalVideo}" controls style="width: 100%; max-height: 300px; display: block;"></video>
            <button type="button" id="remove-video-btn" style="position: absolute; top: 8px; right: 8px; padding: 6px 12px; background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">Eliminar video</button>
          </div>
        </div>
      ` : ''}
      
      <div style="display: flex; gap: 12px; margin-top: 20px;">
        <button type="button" id="cancel-edit-btn" style="flex: 1; padding: 12px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer; font-weight: 600; color: #111827;">Cancelar</button>
        <button type="button" id="save-edit-btn" style="flex: 1; padding: 12px; background: #1d9bf0; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; color: white;">Guardar cambios</button>
      </div>
    </div>
  `;

  // Replace content with edit form
  const contentSection = container.querySelector('.feed-text-content, .feed-image-container, .feed-video-container');
  if (contentSection) {
    contentSection.outerHTML = editFormHTML;
  } else {
    // If no content section, insert after header
    const header = container.querySelector('.feed-card-header');
    if (header) {
      header.insertAdjacentHTML('afterend', editFormHTML);
    }
  }

  // Hide actions and footer
  const actionsBar = container.querySelector('.feed-actions-bar');
  const footer = container.querySelector('.feed-likes')?.parentElement;
  if (actionsBar) actionsBar.style.display = 'none';
  if (footer) footer.style.display = 'none';

  // Setup edit form handlers
  setupEditFormHandlers(postId, originalContent, originalPhotos, originalVideo);
}

function setupEditFormHandlers(postId, originalContent, originalPhotos, originalVideo) {
  const contentTextarea = document.getElementById('edit-post-content');
  const charCount = document.getElementById('edit-char-count');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  const saveBtn = document.getElementById('save-edit-btn');
  const addPhotosBtn = document.getElementById('add-more-photos-btn');
  const photosInput = document.getElementById('edit-post-photos-input');
  const removeVideoBtn = document.getElementById('remove-video-btn');

  let currentPhotos = [...originalPhotos];
  let currentVideo = originalVideo;
  let newPhotos = [];

  // Character counter
  contentTextarea?.addEventListener('input', (e) => {
    const count = e.target.value.length;
    if (charCount) charCount.textContent = count;

    if (count > 2000) {
      e.target.value = e.target.value.substring(0, 2000);
      if (charCount) charCount.textContent = '2000';
    }
  });

  // Cancel button
  cancelBtn?.addEventListener('click', async () => {
    // Reload post
    await openPostModal(postId);
  });

  // Add more photos
  addPhotosBtn?.addEventListener('click', () => {
    photosInput?.click();
  });

  photosInput?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      newPhotos = [...newPhotos, ...files];
      updatePhotosPreview();
    }
  });

  // Remove photo
  document.querySelectorAll('.remove-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      currentPhotos.splice(index, 1);
      updatePhotosPreview();
    });
  });

  // Remove video
  removeVideoBtn?.addEventListener('click', () => {
    currentVideo = null;
    const videoSection = removeVideoBtn.closest('div[style*="margin-bottom"]');
    if (videoSection) videoSection.remove();
  });

  function updatePhotosPreview() {
    const preview = document.getElementById('edit-photos-preview');
    if (!preview) return;

    let html = '';

    // Existing photos
    currentPhotos.forEach((photo, index) => {
      html += `
        <div style="position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden;">
          <img src="${photo}" alt="Photo ${index + 1}" style="width: 100%; height: 100%; object-fit: cover;">
          <button type="button" class="remove-photo-btn" data-index="${index}" style="position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; background: rgba(0,0,0,0.6); color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px;"x”</button>
        </div>
      `;
    });

    // New photos
    newPhotos.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      html += `
        <div style="position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden;">
          <img src="${url}" alt="New photo ${index + 1}" style="width: 100%; height: 100%; object-fit: cover;">
          <button type="button" class="remove-new-photo-btn" data-index="${index}" style="position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; background: rgba(0,0,0,0.6); color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px;"x”</button>
        </div>
      `;
    });

    preview.innerHTML = html;

    // Re-attach remove listeners
    document.querySelectorAll('.remove-photo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        currentPhotos.splice(index, 1);
        updatePhotosPreview();
      });
    });

    document.querySelectorAll('.remove-new-photo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        newPhotos.splice(index, 1);
        updatePhotosPreview();
      });
    });
  }

  // Save button
  saveBtn?.addEventListener('click', async () => {
    await savePostEdit(postId, contentTextarea?.value || '', currentPhotos, newPhotos, currentVideo);
  });
}

async function savePostEdit(postId, content, existingPhotos, newPhotos, video) {
  if (!currentUser) {
    showToast('Debes iniciar sesión para editar', 'error');
    return;
  }

  const saveBtn = document.getElementById('save-edit-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando...';

  try {
    let photoUrls = [...existingPhotos];

    // Upload new photos
    if (newPhotos.length > 0) {
      showToast('Subiendo nuevas fotos...', 'info');
      for (let i = 0; i < newPhotos.length; i++) {
        const photo = newPhotos[i];
        const timestamp = Date.now();
        const filename = `${timestamp}_${i}_${photo.name}`;
        const storageRef = storage.ref(`posts/${currentUser.uid}/${filename}`);

        await storageRef.put(photo);
        const url = await storageRef.getDownloadURL();
        photoUrls.push(url);
      }
    }

    // Determine post type
    let postType = 'text';
    if (photoUrls.length > 0) {
      postType = 'photo';
    } else if (video) {
      postType = 'video';
    }

    // Update post in Firebase
    const updateData = {
      type: postType,
      content: content.trim() || null,
      photos: photoUrls.length > 0 ? photoUrls : null,
      video: video || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('posts').doc(postId).update(updateData);

    showToast('Publicación actualizada exitosamente', 'success');

    // Reload post in modal
    await openPostModal(postId);

    // Reload profile grid if on profile view
    if (document.getElementById('profile-view') && !document.getElementById('profile-view').classList.contains('hidden')) {
      await renderProfileGrid();
    }

    // Reload feed if on feed view
    if (document.getElementById('feed-view') && !document.getElementById('feed-view').classList.contains('hidden')) {
      await loadFeed();
    }

  } catch (error) {
    console.error('Error updating post:', error);
    showToast('Error al actualizar la publicaciÃ³n: ' + error.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar cambios';
  }
}

function initViewPostModal() {
  const modal = document.getElementById('view-post-modal');
  const closeBtn = document.getElementById('close-view-post-modal');

  if (!modal) return;

  // Close button
  closeBtn?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  // Close on backdrop
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });

  // Close on ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
    }
  });
}

// ================================
// ACTIVITY VIEW
// ================================

function initActivityView() {
  // Calorie Calculator Logic
  const climbType = document.getElementById('calc-climb-type');
  const duration = document.getElementById('calc-duration');
  const intensity = document.getElementById('calc-intensity');
  const weight = document.getElementById('calc-weight');
  const caloriesResult = document.getElementById('calc-calories-result');
  const equivPizza = document.getElementById('equiv-pizza');
  const equivRunning = document.getElementById('equiv-running');
  const equivChocolate = document.getElementById('equiv-chocolate');

  // MET values for different climbing types and intensities
  const metValues = {
    boulder: { low: 5.0, medium: 7.5, high: 10.0 },
    sport: { low: 5.5, medium: 8.0, high: 11.0 },
    trad: { low: 6.0, medium: 8.5, high: 11.5 },
    indoor: { low: 4.5, medium: 7.0, high: 9.5 }
  };

  function calculateCalories() {
    if (!climbType || !duration || !intensity || !weight || !caloriesResult) return;

    const type = climbType.value;
    const mins = parseInt(duration.value) || 60;
    const level = intensity.value;
    const kg = parseInt(weight.value) || 70;

    const met = metValues[type]?.[level] || 7.0;
    const calories = Math.round((met * kg * mins) / 60);

    caloriesResult.textContent = calories;

    // Calculate equivalents
    if (equivPizza) {
      const pizzaSlices = (calories / 285).toFixed(1);
      equivPizza.textContent = `${pizzaSlices} porciones de pizza`;
    }
    if (equivRunning) {
      const runningMins = Math.round(calories / 12);
      equivRunning.textContent = `${runningMins} min corriendo`;
    }
    if (equivChocolate) {
      const chocolateBars = (calories / 210).toFixed(1);
      equivChocolate.textContent = `${chocolateBars} barras de chocolate`;
    }
  }

  // Add event listeners for calculator
  [climbType, duration, intensity, weight].forEach(el => {
    if (el) {
      el.addEventListener('change', calculateCalories);
      el.addEventListener('input', calculateCalories);
    }
  });

  // Initial calculation
  calculateCalories();

  // Chart tabs
  const chartTabs = document.querySelectorAll('.chart-tab');
  chartTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      chartTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      // Here you would update the chart based on the selected period
      const period = tab.dataset.chart;
      updateActivityChart(period);
    });
  });

  // Filter chips
  const filterChips = document.querySelectorAll('.filter-chip');
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const filter = chip.dataset.filter;
      filterActivities(filter);
    });
  });

  // Stats Carousel
  initStatsCarousel();

  // Period selector dropdown
  initPeriodSelector();

  // New ascent button
  const newAscentBtn = document.getElementById('new-ascent-btn');
  if (newAscentBtn) {
    newAscentBtn.addEventListener('click', () => {
      // Open ascent modal or redirect to ascent form
      showToast('Funcionalidad de nueva ascensión próximamente', 'info');
    });
  }

  // Load user activity data
  loadActivityData();

  // Load demo data for preview
  loadDemoStats();
}

function loadDemoStats() {
  // Demo data for testing - simulates real statistics
  const demoData = {
    // Slide 1: Rendimiento
    totalRoutes: 47,
    maxGrade: '7b+',
    avgGrade: '6c',
    flashRate: 68,
    mainStyle: 'Redpoint',

    // Slide 2: Metros
    totalMeters: 1250,
    avgMeters: 27,
    avgAleje: 3.2,
    maxAleje: 5.8,

    // Slide 3: Escuelas y Sectores
    topSchool: 'Siurana',
    schoolsCount: 8,
    topSector: 'El Pati',
    sectorsCount: 23
  };

  // Update all stats with demo data
  updateStatValue('stat-total-routes', demoData.totalRoutes);
  updateStatValue('stat-max-grade', demoData.maxGrade);
  updateStatValue('stat-avg-grade', demoData.avgGrade);
  updateStatValue('stat-flash-rate', demoData.flashRate + '%');
  updateStatValue('stat-main-style', demoData.mainStyle);

  updateStatValue('stat-total-meters', demoData.totalMeters + '<small>m</small>');
  updateStatValue('stat-avg-meters', demoData.avgMeters + '<small>m</small>');
  updateStatValue('stat-avg-aleje', demoData.avgAleje + '<small>m</small>');
  updateStatValue('stat-max-aleje', demoData.maxAleje + '<small>m</small>');

  updateStatValue('stat-top-school', demoData.topSchool);
  updateStatValue('stat-schools-count', demoData.schoolsCount);
  updateStatValue('stat-top-sector', demoData.topSector);
  updateStatValue('stat-sectors-count', demoData.sectorsCount);
}

// Stats Carousel functionality
let currentStatsSlide = 0;
let statsCarouselTouchStartX = 0;
let statsCarouselTouchEndX = 0;

function initStatsCarousel() {
  const carousel = document.getElementById('stats-carousel');
  const indicators = document.querySelectorAll('.carousel-indicator');

  if (!carousel) return;

  // Click on indicators
  indicators.forEach(indicator => {
    indicator.addEventListener('click', () => {
      const slideIndex = parseInt(indicator.dataset.slide);
      goToStatsSlide(slideIndex);
    });
  });

  // Touch/swipe support
  carousel.addEventListener('touchstart', (e) => {
    statsCarouselTouchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  carousel.addEventListener('touchend', (e) => {
    statsCarouselTouchEndX = e.changedTouches[0].screenX;
    handleStatsCarouselSwipe();
  }, { passive: true });

  // Mouse drag support for desktop
  let isDragging = false;
  let startX = 0;

  carousel.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    carousel.style.cursor = 'grabbing';
  });

  carousel.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
  });

  carousel.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    carousel.style.cursor = 'grab';
    const diff = startX - e.clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        goToStatsSlide(Math.min(currentStatsSlide + 1, 2));
      } else {
        goToStatsSlide(Math.max(currentStatsSlide - 1, 0));
      }
    }
  });

  carousel.addEventListener('mouseleave', () => {
    isDragging = false;
    carousel.style.cursor = 'grab';
  });

  carousel.style.cursor = 'grab';
}

function handleStatsCarouselSwipe() {
  const diff = statsCarouselTouchStartX - statsCarouselTouchEndX;
  const threshold = 50;

  if (Math.abs(diff) > threshold) {
    if (diff > 0) {
      // Swipe left - next slide
      goToStatsSlide(Math.min(currentStatsSlide + 1, 2));
    } else {
      // Swipe right - previous slide
      goToStatsSlide(Math.max(currentStatsSlide - 1, 0));
    }
  }
}

function goToStatsSlide(index) {
  const carousel = document.getElementById('stats-carousel');
  const indicators = document.querySelectorAll('.carousel-indicator');

  if (!carousel) return;

  currentStatsSlide = index;
  carousel.style.transform = `translateX(-${index * 100}%)`;

  // Update indicators
  indicators.forEach((indicator, i) => {
    indicator.classList.toggle('active', i === index);
  });
}

// Period selector (Día/Mes/Año)
let currentStatsPeriod = 'month'; // 'day', 'month', 'year'

function initPeriodSelector() {
  const periodBtn = document.getElementById('activity-period-btn');
  const periodText = document.getElementById('activity-period-text');

  if (!periodBtn || !periodText) return;

  // Create dropdown menu
  const dropdown = document.createElement('div');
  dropdown.className = 'period-dropdown hidden';
  dropdown.innerHTML = `
    <button class="period-option" data-period="day">Hoy</button>
    <button class="period-option active" data-period="month">Este mes</button>
    <button class="period-option" data-period="year">Este año</button>
  `;
  periodBtn.parentElement.appendChild(dropdown);

  // Toggle dropdown
  periodBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    dropdown.classList.add('hidden');
  });

  // Period selection
  dropdown.querySelectorAll('.period-option').forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const period = option.dataset.period;

      // Update active state
      dropdown.querySelectorAll('.period-option').forEach(opt => {
        opt.classList.remove('active');
      });
      option.classList.add('active');

      // Update button text
      const periodLabels = {
        day: 'Hoy',
        month: 'Este mes',
        year: 'Este año'
      };
      periodText.textContent = periodLabels[period];

      // Update current period and reload stats
      currentStatsPeriod = period;
      dropdown.classList.add('hidden');

      // Reload activity data with new period
      loadActivityData();
    });
  });
}

function updateActivityChart(period) {
  // Mock data for different periods
  const chartData = {
    week: [
      { label: 'L', value: 2 },
      { label: 'M', value: 5 },
      { label: 'X', value: 3 },
      { label: 'J', value: 7 },
      { label: 'V', value: 9 },
      { label: 'S', value: 12 },
      { label: 'D', value: 6 }
    ],
    month: [
      { label: 'S1', value: 25 },
      { label: 'S2', value: 32 },
      { label: 'S3', value: 28 },
      { label: 'S4', value: 44 }
    ],
    year: [
      { label: 'E', value: 45 },
      { label: 'F', value: 52 },
      { label: 'M', value: 48 },
      { label: 'A', value: 65 },
      { label: 'M', value: 58 },
      { label: 'J', value: 72 },
      { label: 'J', value: 85 },
      { label: 'A', value: 78 },
      { label: 'S', value: 62 },
      { label: 'O', value: 55 },
      { label: 'N', value: 68 },
      { label: 'D', value: 44 }
    ]
  };

  const data = chartData[period] || chartData.week;
  const maxValue = Math.max(...data.map(d => d.value));

  const chartContainer = document.getElementById('activity-chart');
  if (!chartContainer) return;

  chartContainer.innerHTML = data.map((item, index) => {
    const height = (item.value / maxValue) * 100;
    const isHighlight = item.value === maxValue;
    return `
      <div class="chart-bar-wrapper">
        <div class="chart-bar ${isHighlight ? 'chart-bar-highlight' : ''}" 
             style="height: ${height}%;" 
             data-value="${item.value}"></div>
        <span class="chart-label">${item.label}</span>
      </div>
    `;
  }).join('');

  // Update summary
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const avg = (total / data.length).toFixed(1);

  const chartTotal = document.getElementById('chart-total');
  const chartAvg = document.getElementById('chart-avg');

  if (chartTotal) chartTotal.textContent = total;
  if (chartAvg) chartAvg.textContent = avg;

  // Update summary labels based on period
  const summaryLabels = document.querySelectorAll('.summary-label');
  if (summaryLabels.length >= 2) {
    const periodLabels = {
      week: ['vías esta semana', 'media diaria'],
      month: ['vías este mes', 'media semanal'],
      year: ['vías este año', 'media mensual']
    };
    summaryLabels[0].textContent = periodLabels[period]?.[0] || 'total';
    summaryLabels[1].textContent = periodLabels[period]?.[1] || 'media';
  }
}

function filterActivities(filter) {
  const activityList = document.getElementById('activity-list');
  if (!activityList) return;

  // This would filter the activities based on the selected filter
  // For now, just show a message
  log('Filtering by:', filter);
}

// ========== COMBINED HISTOGRAM (Bars + Lines) ==========
let currentHistogramPeriod = 'month';
let cachedAscentsForHistogram = [];

const HISTOGRAM_GRADE_ORDER = ['4', '4+', '5', '5+', '5a', '5b', '5c', '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+', '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a'];

function getGradeIndex(grade) {
  if (!grade) return -1;
  return HISTOGRAM_GRADE_ORDER.indexOf(grade.toLowerCase().trim());
}

function getGradeFromIndex(index) {
  if (index < 0 || index >= HISTOGRAM_GRADE_ORDER.length) return null;
  return HISTOGRAM_GRADE_ORDER[index];
}

function initCombinedHistogram() {
  const histogramTabs = document.querySelectorAll('[data-histogram]');
  histogramTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      histogramTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentHistogramPeriod = tab.dataset.histogram;
      updateCombinedHistogram(cachedAscentsForHistogram);

      // Also update grade distribution chart with the new period
      updateGradeDistributionChart(cachedAscentsForHistogram);

      const title = document.getElementById('histogram-title');
      if (title) {
        const titles = { week: 'Progreso semanal', month: 'Progreso mensual', year: 'Progreso anual' };
        title.textContent = titles[currentHistogramPeriod] || 'Progreso';
      }
    });
  });

  // Render demo data on init
  renderDemoHistogram();
}

function updateCombinedHistogram(ascents) {
  cachedAscentsForHistogram = ascents || [];

  const barsContainer = document.getElementById('histogram-bars');
  const xAxisContainer = document.getElementById('histogram-x-axis');
  const svgLines = document.getElementById('histogram-lines');
  const gradeAxis = document.getElementById('histogram-grade-axis');
  const ascentAxis = document.getElementById('histogram-ascent-axis');

  if (!barsContainer || !svgLines) return;

  if (!ascents || ascents.length === 0) {
    renderDemoHistogram();
    return;
  }

  const histogramData = processHistogramData(ascents, currentHistogramPeriod);

  const maxAscents = Math.max(...histogramData.map(d => d.ascents), 1);
  const allGradeIndices = histogramData.flatMap(d => [
    getGradeIndex(d.maxGrade), getGradeIndex(d.avgGrade), getGradeIndex(d.minGrade)
  ]).filter(i => i >= 0);

  if (allGradeIndices.length === 0) {
    renderDemoHistogram();
    return;
  }

  const minGradeIdx = Math.max(0, Math.min(...allGradeIndices) - 2);
  const maxGradeIdx = Math.min(HISTOGRAM_GRADE_ORDER.length - 1, Math.max(...allGradeIndices) + 2);
  const gradeRange = maxGradeIdx - minGradeIdx || 1;

  updateGradeAxis(gradeAxis, minGradeIdx, maxGradeIdx);
  updateAscentAxis(ascentAxis, maxAscents);

  barsContainer.innerHTML = histogramData.map(item => {
    const height = (item.ascents / maxAscents) * 100;
    return `<div class="histogram-bar" style="height: ${height}%;" data-value="${item.ascents}"></div>`;
  }).join('');

  xAxisContainer.innerHTML = histogramData.map(item =>
    `<span class="histogram-x-label">${item.label}</span>`
  ).join('');

  renderHistogramLines(svgLines, histogramData, minGradeIdx, gradeRange);
}

function processHistogramData(ascents, period) {
  const now = new Date();
  let data = [];

  if (period === 'week') {
    // Mostrar los días de la semana actual (lun-dom)
    const dayLabels = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
    const currentDay = now.getDay(); // 0=domingo, 1=lunes, etc.
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dayAscents = (ascents || []).filter(a => {
        const ascentDate = a.date?.toDate?.() || new Date(a.date);
        return ascentDate.toDateString() === date.toDateString();
      });
      data.push(processAscentsForPeriod(dayAscents, dayLabels[i]));
    }
  } else if (period === 'month') {
    // Mostrar todos los días del mes actual
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayAscents = (ascents || []).filter(a => {
        const ascentDate = a.date?.toDate?.() || new Date(a.date);
        return ascentDate.toDateString() === date.toDateString();
      });
      data.push(processAscentsForPeriod(dayAscents, day.toString()));
    }
  } else {
    // Año: mostrar 12 meses (sin cambios)
    const monthLabels = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    for (let i = 0; i < 12; i++) {
      const monthAscents = (ascents || []).filter(a => {
        const ascentDate = a.date?.toDate?.() || new Date(a.date);
        return ascentDate.getFullYear() === now.getFullYear() && ascentDate.getMonth() === i;
      });
      data.push(processAscentsForPeriod(monthAscents, monthLabels[i]));
    }
  }
  return data;
}

function processAscentsForPeriod(ascents, label) {
  if (!ascents || ascents.length === 0) {
    return { label, ascents: 0, maxGrade: null, avgGrade: null, minGrade: null };
  }
  const gradeIndices = ascents.map(a => getGradeIndex(a.grade)).filter(i => i >= 0);
  let maxGrade = null, avgGrade = null, minGrade = null;
  if (gradeIndices.length > 0) {
    maxGrade = getGradeFromIndex(Math.max(...gradeIndices));
    minGrade = getGradeFromIndex(Math.min(...gradeIndices));
    avgGrade = getGradeFromIndex(Math.round(gradeIndices.reduce((a, b) => a + b, 0) / gradeIndices.length));
  }
  return { label, ascents: ascents.length, maxGrade, avgGrade, minGrade };
}

function updateGradeAxis(container, minIdx, maxIdx) {
  if (!container) return;
  const labels = [];

  // Mostrar TODOS los grados en el rango (incluyendo los +)
  for (let i = maxIdx; i >= minIdx; i--) {
    labels.push(HISTOGRAM_GRADE_ORDER[i] || '');
  }

  container.innerHTML = labels.map(l => `<span class="y-label">${l}</span>`).join('');
}

function updateAscentAxis(container, maxValue) {
  if (!container) return;
  const labels = [];

  // Calcular step "bonito" basado en el máximo
  let step;
  if (maxValue <= 5) step = 1;
  else if (maxValue <= 10) step = 2;
  else if (maxValue <= 25) step = 5;
  else if (maxValue <= 50) step = 10;
  else if (maxValue <= 100) step = 20;
  else if (maxValue <= 250) step = 50;
  else step = Math.ceil(maxValue / 5 / 10) * 10; // Múltiplos de 10

  const adjustedMax = Math.ceil(maxValue / step) * step;
  for (let i = adjustedMax; i >= 0; i -= step) {
    labels.push(i);
  }
  container.innerHTML = labels.map(l => `<span class="y-label">${l}</span>`).join('');
}

function renderHistogramLines(svg, data, minGradeIdx, gradeRange) {
  if (!svg || !data || data.length === 0) return;

  // Get dimensions from parent container
  const parent = svg.parentElement;
  let width = parent?.clientWidth || svg.clientWidth;
  let height = parent?.clientHeight || svg.clientHeight;

  // If dimensions are still 0, defer rendering to next frame
  if (!width || !height) {
    requestAnimationFrame(() => renderHistogramLines(svg, data, minGradeIdx, gradeRange));
    return;
  }
  const effectiveHeight = height - 20;

  // Match CSS: padding 8px, gap 4px, space-around distribution
  const cssPadding = 8;
  const cssGap = 4;
  const n = data.length;
  // With space-around: each bar gets equal space, with half-space at edges
  // Total available width for bars = width - 2*cssPadding - (n-1)*gap
  // Each bar occupies: (availableWidth) / n, centered in its slot
  const availableWidth = width - 2 * cssPadding;
  // space-around: space = availableWidth / n, first bar center at cssPadding + space/2
  const slotWidth = availableWidth / n;

  const topPadding = 10; // Padding for Y axis at top

  // Collect points for each line
  const maxPts = [], avgPts = [], minPts = [];

  data.forEach((item, index) => {
    const x = cssPadding + slotWidth * index + slotWidth / 2;
    if (item.maxGrade) {
      const y = effectiveHeight - ((getGradeIndex(item.maxGrade) - minGradeIdx) / gradeRange) * effectiveHeight + topPadding;
      maxPts.push({ x, y });
    }
    if (item.avgGrade) {
      const y = effectiveHeight - ((getGradeIndex(item.avgGrade) - minGradeIdx) / gradeRange) * effectiveHeight + topPadding;
      avgPts.push({ x, y });
    }
    if (item.minGrade) {
      const y = effectiveHeight - ((getGradeIndex(item.minGrade) - minGradeIdx) / gradeRange) * effectiveHeight + topPadding;
      minPts.push({ x, y });
    }
  });

  // Generate smooth spline paths and circle points
  const maxPath = smoothSplinePath(maxPts);
  const avgPath = smoothSplinePath(avgPts);
  const minPath = smoothSplinePath(minPts);

  const maxPoints = maxPts.map(p => `<circle class="histogram-point histogram-point-max" cx="${p.x}" cy="${p.y}" r="4"/>`).join('');
  const avgPoints = avgPts.map(p => `<circle class="histogram-point histogram-point-avg" cx="${p.x}" cy="${p.y}" r="4"/>`).join('');
  const minPoints = minPts.map(p => `<circle class="histogram-point histogram-point-min" cx="${p.x}" cy="${p.y}" r="4"/>`).join('');

  svg.innerHTML = `
    <path class="histogram-line histogram-line-max" d="${maxPath}"/>
    <path class="histogram-line histogram-line-avg" d="${avgPath}"/>
    <path class="histogram-line histogram-line-min" d="${minPath}"/>
    ${maxPoints}${avgPoints}${minPoints}
  `;
}

// Generate smooth cubic Bézier spline path through points (Catmull-Rom to Bézier)
function smoothSplinePath(points, tension = 0.1) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    // Control points for cubic Bézier
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return path;
}

function renderDemoHistogram() {
  let demoData = [];
  const grades = ['5c', '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a', '7a+'];

  // Función para generar datos aleatorios de demo
  function randomGrade(min, max) {
    const minIdx = grades.indexOf(min);
    const maxIdx = grades.indexOf(max);
    return grades[Math.floor(Math.random() * (maxIdx - minIdx + 1)) + minIdx];
  }

  if (currentHistogramPeriod === 'week') {
    // Semana: lun-dom
    const dayLabels = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
    demoData = dayLabels.map(label => ({
      label,
      ascents: Math.floor(Math.random() * 15) + 2,
      maxGrade: randomGrade('6b+', '7a+'),
      avgGrade: randomGrade('6a', '6b+'),
      minGrade: randomGrade('5c', '6a')
    }));
  } else if (currentHistogramPeriod === 'month') {
    // Mes: todos los días del mes actual
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      demoData.push({
        label: day.toString(),
        ascents: Math.floor(Math.random() * 12) + 1,
        maxGrade: randomGrade('6b+', '7a+'),
        avgGrade: randomGrade('6a', '6b+'),
        minGrade: randomGrade('5c', '6a')
      });
    }
  } else {
    // Año: 12 meses
    const monthLabels = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    demoData = [
      { label: 'ene', ascents: 125, maxGrade: '7a', avgGrade: '6a+', minGrade: '5c' },
      { label: 'feb', ascents: 108, maxGrade: '6c+', avgGrade: '6a', minGrade: '5c' },
      { label: 'mar', ascents: 132, maxGrade: '7a+', avgGrade: '6b', minGrade: '5c' },
      { label: 'abr', ascents: 140, maxGrade: '7a+', avgGrade: '6b+', minGrade: '5c' },
      { label: 'may', ascents: 78, maxGrade: '7a', avgGrade: '6a+', minGrade: '5b' },
      { label: 'jun', ascents: 52, maxGrade: '6b+', avgGrade: '6a', minGrade: '5b' },
      { label: 'jul', ascents: 65, maxGrade: '6c', avgGrade: '6b', minGrade: '5c' },
      { label: 'ago', ascents: 95, maxGrade: '6c+', avgGrade: '6b', minGrade: '5c' },
      { label: 'sep', ascents: 82, maxGrade: '6c', avgGrade: '6a+', minGrade: '5b' },
      { label: 'oct', ascents: 130, maxGrade: '7a', avgGrade: '6b', minGrade: '5c' },
      { label: 'nov', ascents: 148, maxGrade: '7a+', avgGrade: '6b+', minGrade: '5c' },
      { label: 'dic', ascents: 118, maxGrade: '7a', avgGrade: '6a+', minGrade: '5b' }
    ];
  }

  const barsContainer = document.getElementById('histogram-bars');
  const xAxisContainer = document.getElementById('histogram-x-axis');
  const svgLines = document.getElementById('histogram-lines');
  const gradeAxis = document.getElementById('histogram-grade-axis');
  const ascentAxis = document.getElementById('histogram-ascent-axis');

  if (!barsContainer || !svgLines) return;

  const maxAscents = Math.max(...demoData.map(d => d.ascents));

  // Calcular rango de grados adaptativo basado en los datos de demo
  const allGradeIndices = demoData.flatMap(d => [
    getGradeIndex(d.maxGrade), getGradeIndex(d.avgGrade), getGradeIndex(d.minGrade)
  ]).filter(i => i >= 0);

  const minGradeIdx = allGradeIndices.length > 0
    ? Math.max(0, Math.min(...allGradeIndices) - 1)
    : getGradeIndex('5a');
  const maxGradeIdx = allGradeIndices.length > 0
    ? Math.min(HISTOGRAM_GRADE_ORDER.length - 1, Math.max(...allGradeIndices) + 1)
    : getGradeIndex('7a+');
  const gradeRange = maxGradeIdx - minGradeIdx || 1;

  // Usar funciones adaptativas para los ejes
  updateGradeAxis(gradeAxis, minGradeIdx, maxGradeIdx);
  updateAscentAxis(ascentAxis, maxAscents);

  barsContainer.innerHTML = demoData.map(item => {
    const height = (item.ascents / maxAscents) * 100;
    return `<div class="histogram-bar" style="height: ${height}%;" data-value="${item.ascents}"></div>`;
  }).join('');

  if (xAxisContainer) {
    xAxisContainer.innerHTML = demoData.map(item =>
      `<span class="histogram-x-label">${item.label}</span>`
    ).join('');
  }

  renderHistogramLines(svgLines, demoData, minGradeIdx, gradeRange);
}

// ========== HISTOGRAM CAROUSEL ==========
let currentHistogramSlide = 0;

function initHistogramCarousel() {
  const carousel = document.getElementById('histogram-carousel');
  const indicators = document.querySelectorAll('.histogram-carousel-indicator');

  if (!carousel || indicators.length === 0) return;

  // Set up indicator clicks
  indicators.forEach(indicator => {
    indicator.addEventListener('click', () => {
      const slideIndex = parseInt(indicator.dataset.histogramSlide);
      goToHistogramSlide(slideIndex);
    });
  });

  // Set up touch/swipe support
  let startX = 0;
  let isDragging = false;

  carousel.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    isDragging = true;
  }, { passive: true });

  carousel.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
  }, { passive: true });

  carousel.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;

    const endX = e.changedTouches[0].clientX;
    const diff = startX - endX;
    const threshold = 50;

    if (Math.abs(diff) > threshold) {
      if (diff > 0 && currentHistogramSlide < 1) {
        goToHistogramSlide(currentHistogramSlide + 1);
      } else if (diff < 0 && currentHistogramSlide > 0) {
        goToHistogramSlide(currentHistogramSlide - 1);
      }
    }
  }, { passive: true });
}

function goToHistogramSlide(index) {
  const carousel = document.getElementById('histogram-carousel');
  const indicators = document.querySelectorAll('.histogram-carousel-indicator');

  if (!carousel) return;

  currentHistogramSlide = Math.max(0, Math.min(index, 1));
  carousel.style.transform = `translateX(-${currentHistogramSlide * 100}%)`;

  indicators.forEach((ind, i) => {
    ind.classList.toggle('active', i === currentHistogramSlide);
  });

  // Update grade distribution when switching to slide 1
  if (currentHistogramSlide === 1) {
    updateGradeDistributionChart(cachedAscentsForHistogram);
  }
}

// ========== GRADE DISTRIBUTION CHART ==========
function updateGradeDistributionChart(ascents) {
  const barsContainer = document.getElementById('grade-distribution-bars');
  const xAxisContainer = document.getElementById('grade-distribution-x-axis');
  const yAxisContainer = document.getElementById('grade-distribution-y-axis');

  if (!barsContainer) return;

  // Filter ascents by current period
  const filteredAscents = filterAscentsForPeriod(ascents, currentHistogramPeriod);

  if (!filteredAscents || filteredAscents.length === 0) {
    renderDemoGradeDistribution();
    return;
  }

  // Count ascents by grade
  const gradeCount = {};
  filteredAscents.forEach(ascent => {
    const grade = ascent.grade?.toLowerCase?.()?.trim?.();
    if (grade) {
      gradeCount[grade] = (gradeCount[grade] || 0) + 1;
    }
  });

  // Get sorted grades that exist in data
  const sortedGrades = Object.keys(gradeCount).sort((a, b) => {
    const indexA = HISTOGRAM_GRADE_ORDER.indexOf(a);
    const indexB = HISTOGRAM_GRADE_ORDER.indexOf(b);
    return indexA - indexB;
  });

  if (sortedGrades.length === 0) {
    renderDemoGradeDistribution();
    return;
  }

  const maxCount = Math.max(...Object.values(gradeCount));

  // Render bars
  barsContainer.innerHTML = sortedGrades.map(grade => {
    const count = gradeCount[grade];
    const height = (count / maxCount) * 100;
    return `<div class="grade-distribution-bar" style="height: ${height}%;" data-value="${count}"></div>`;
  }).join('');

  // Render X axis (grades)
  xAxisContainer.innerHTML = sortedGrades.map(grade =>
    `<span class="grade-distribution-x-label">${grade}</span>`
  ).join('');

  // Render Y axis (ascent counts)
  updateGradeDistributionYAxis(yAxisContainer, maxCount);
}

function filterAscentsForPeriod(ascents, period) {
  if (!ascents || ascents.length === 0) return [];

  const now = new Date();

  return ascents.filter(ascent => {
    const ascentDate = ascent.date?.toDate?.() || new Date(ascent.date);
    if (!ascentDate || isNaN(ascentDate.getTime())) return false;

    if (period === 'week') {
      // Current week (Monday to Sunday)
      const currentDay = now.getDay();
      const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      return ascentDate >= monday && ascentDate <= sunday;
    } else if (period === 'month') {
      // Current month
      return ascentDate.getFullYear() === now.getFullYear() &&
             ascentDate.getMonth() === now.getMonth();
    } else {
      // Current year
      return ascentDate.getFullYear() === now.getFullYear();
    }
  });
}

function updateGradeDistributionYAxis(container, maxCount) {
  if (!container) return;

  // Create nice round numbers for Y axis
  const steps = 5;
  const stepSize = Math.ceil(maxCount / steps);
  const labels = [];

  for (let i = steps; i >= 0; i--) {
    labels.push(i * stepSize);
  }

  container.innerHTML = labels.map(val =>
    `<span class="y-label">${val}</span>`
  ).join('');
}

function renderDemoGradeDistribution() {
  const barsContainer = document.getElementById('grade-distribution-bars');
  const xAxisContainer = document.getElementById('grade-distribution-x-axis');
  const yAxisContainer = document.getElementById('grade-distribution-y-axis');

  if (!barsContainer) return;

  // Demo data similar to the screenshot
  const demoData = [
    { grade: '5a', count: 1 },
    { grade: '5b', count: 2 },
    { grade: '5c', count: 5 },
    { grade: '6a', count: 11 },
    { grade: '6a+', count: 19 },
    { grade: '6b', count: 27 },
    { grade: '6b+', count: 14 },
    { grade: '6c', count: 7 },
    { grade: '6c+', count: 3 },
    { grade: '7a', count: 1 }
  ];

  const maxCount = Math.max(...demoData.map(d => d.count));

  // Render bars
  barsContainer.innerHTML = demoData.map(item => {
    const height = (item.count / maxCount) * 100;
    return `<div class="grade-distribution-bar" style="height: ${height}%;" data-value="${item.count}"></div>`;
  }).join('');

  // Render X axis (grades)
  xAxisContainer.innerHTML = demoData.map(item =>
    `<span class="grade-distribution-x-label">${item.grade}</span>`
  ).join('');

  // Render Y axis
  updateGradeDistributionYAxis(yAxisContainer, maxCount);
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initCombinedHistogram();
  initHistogramCarousel();
  renderDemoGradeDistribution();
});
// ========== END COMBINED HISTOGRAM ==========

async function loadActivityData() {
  const user = firebase.auth().currentUser;
  if (!user) return;

  try {
    // Load user's ascents from the main 'ascents' collection (same as logAscent uses)
    const ascentsRef = firebase.firestore()
      .collection('ascents')
      .where('userId', '==', user.uid)
      .orderBy('date', 'desc')
      .limit(500);

    const snapshot = await ascentsRef.get();

    if (snapshot.empty) {
      // Show empty state and reset all stats
      const emptyState = document.getElementById('activity-empty');
      if (emptyState) emptyState.style.display = 'flex';
      resetAllStats();
      return;
    }

    // Get date range based on period
    const now = new Date();
    let startDate;

    switch (currentStatsPeriod) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'month':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    // Process all ascents and filter by period
    const allAscents = [];
    const filteredAscents = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const ascentData = { id: doc.id, ...data };
      allAscents.push(ascentData);

      // Check if ascent is within the selected period
      // Handle both Firestore Timestamp and regular Date
      const ascentDate = data.date?.toDate ? data.date.toDate() : new Date(data.date);
      if (ascentDate && ascentDate >= startDate) {
        filteredAscents.push(ascentData);
      }
    });

    // Calculate stats for filtered ascents (or all if no filter matches)
    const statsAscents = filteredAscents.length > 0 ? filteredAscents : allAscents;
    calculateAndUpdateStats(statsAscents);

    // Update histogram with ALL ascents (histogram uses its own time filtering)
    requestAnimationFrame(() => {
      updateCombinedHistogram(allAscents);
    });

    // Render activity list
    renderActivityList(statsAscents.slice(0, 50));

    // Show/hide empty state
    const emptyState = document.getElementById('activity-empty');
    if (emptyState) {
      emptyState.style.display = statsAscents.length === 0 ? 'flex' : 'none';
    }

  } catch (error) {
    console.error('Error loading activity data:', error);
  }
}

function resetAllStats() {
  // Reset to empty state when user has no ascents
  // Slide 1: Rendimiento
  updateStatValue('stat-total-routes', '0');
  updateStatValue('stat-placeholder-1', '0');
  updateStatValue('stat-max-grade', '-');
  updateStatValue('stat-avg-grade', '-');
  updateStatValue('stat-flash-rate', '0%');
  updateStatValue('stat-main-style', '-');

  // Slide 2: Metros
  updateStatValue('stat-total-meters', '0<small>m</small>');
  updateStatValue('stat-avg-meters', '0<small>m</small>');
  updateStatValue('stat-avg-aleje', '0<small>m</small>');
  updateStatValue('stat-max-aleje', '0<small>m</small>');

  // Slide 3: Escuelas y Sectores
  updateStatValue('stat-top-school', '-');
  updateStatValue('stat-schools-count', '0');
  updateStatValue('stat-top-sector', '-');
  updateStatValue('stat-sectors-count', '0');
}

function calculateAndUpdateStats(ascents) {
  if (!ascents || ascents.length === 0) {
    resetAllStats();
    return;
  }

  // Grade order for comparison
  const gradeOrder = ['4', '4+', '5', '5+', '6a', '6a+', '6b', '6b+', '6c', '6c+',
    '7a', '7a+', '7b', '7b+', '7c', '7c+', '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a'];

  // Initialize counters
  const grades = [];
  const styles = {};
  const schools = {};
  const sectors = {};
  let totalMeters = 0;
  let totalAleje = 0;
  let maxAleje = 0;
  let alejeCount = 0;
  let flashCount = 0;

  // Process each ascent
  ascents.forEach(ascent => {
    // Grades
    if (ascent.grade) {
      grades.push(ascent.grade.toLowerCase());
    }

    // Styles count
    if (ascent.style) {
      styles[ascent.style] = (styles[ascent.style] || 0) + 1;
      if (ascent.style === 'flash' || ascent.style === 'onsight') {
        flashCount++;
      }
    }

    // Meters
    if (ascent.meters || ascent.height) {
      const meters = ascent.meters || ascent.height || 0;
      totalMeters += meters;
    }

    // Aleje (distance between quickdraws)
    if (ascent.aleje) {
      totalAleje += ascent.aleje;
      alejeCount++;
      if (ascent.aleje > maxAleje) {
        maxAleje = ascent.aleje;
      }
    }

    // Schools and Sectors
    if (ascent.schoolName || ascent.school) {
      const schoolName = ascent.schoolName || ascent.school;
      schools[schoolName] = (schools[schoolName] || 0) + 1;
    }

    if (ascent.sectorName || ascent.sector) {
      const sectorName = ascent.sectorName || ascent.sector;
      sectors[sectorName] = (sectors[sectorName] || 0) + 1;
    }
  });

  // === SLIDE 1: Rendimiento ===
  // Total vías
  updateStatValue('stat-total-routes', ascents.length);

  // Grado máximo
  const maxGrade = findMaxGrade(grades);
  updateStatValue('stat-max-grade', maxGrade || '-');

  // Grado medio
  const avgGrade = calculateAverageGrade(grades, gradeOrder);
  updateStatValue('stat-avg-grade', avgGrade || '-');

  // Flash rate
  const flashRate = ascents.length > 0 ? Math.round((flashCount / ascents.length) * 100) : 0;
  updateStatValue('stat-flash-rate', flashRate + '%');

  // Estilo predominante
  const mainStyle = getMainStyle(styles);
  updateStatValue('stat-main-style', mainStyle);

  // === SLIDE 2: Metros ===
  // Metros totales
  updateStatValue('stat-total-meters', totalMeters + '<small>m</small>');

  // Media metros por vía
  const avgMeters = ascents.length > 0 ? Math.round(totalMeters / ascents.length) : 0;
  updateStatValue('stat-avg-meters', avgMeters + '<small>m</small>');

  // Aleje promedio
  const avgAleje = alejeCount > 0 ? (totalAleje / alejeCount).toFixed(1) : 0;
  updateStatValue('stat-avg-aleje', avgAleje + '<small>m</small>');

  // Máximo aleje
  updateStatValue('stat-max-aleje', maxAleje.toFixed(1) + '<small>m</small>');

  // === SLIDE 3: Escuelas y Sectores ===
  // Escuela más visitada
  const topSchool = getTopItem(schools);
  updateStatValue('stat-top-school', topSchool || '-');

  // Nº de escuelas
  updateStatValue('stat-schools-count', Object.keys(schools).length);

  // Sector más visitado
  const topSector = getTopItem(sectors);
  updateStatValue('stat-top-sector', topSector || '-');

  // Nº de sectores
  updateStatValue('stat-sectors-count', Object.keys(sectors).length);
}

function calculateAverageGrade(grades, gradeOrder) {
  if (!grades || grades.length === 0) return null;

  let totalIndex = 0;
  let validGrades = 0;

  grades.forEach(grade => {
    const index = gradeOrder.indexOf(grade.toLowerCase());
    if (index !== -1) {
      totalIndex += index;
      validGrades++;
    }
  });

  if (validGrades === 0) return null;

  const avgIndex = Math.round(totalIndex / validGrades);
  return gradeOrder[avgIndex] || null;
}

function getMainStyle(styles) {
  if (!styles || Object.keys(styles).length === 0) return '-';

  const styleLabels = {
    flash: 'Flash',
    redpoint: 'Redpoint',
    onsight: 'A vista',
    project: 'Proyecto',
    toprope: 'Top rope'
  };

  let maxCount = 0;
  let mainStyle = null;

  Object.entries(styles).forEach(([style, count]) => {
    if (count > maxCount) {
      maxCount = count;
      mainStyle = style;
    }
  });

  return styleLabels[mainStyle] || mainStyle || '-';
}

function getTopItem(items) {
  if (!items || Object.keys(items).length === 0) return null;

  let maxCount = 0;
  let topItem = null;

  Object.entries(items).forEach(([item, count]) => {
    if (count > maxCount) {
      maxCount = count;
      topItem = item;
    }
  });

  return topItem;
}

function updateStatValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = value;
}

function findMaxGrade(grades) {
  // Simple grade comparison (Spanish/French grades)
  const gradeOrder = ['4', '4+', '5', '5+', '6a', '6a+', '6b', '6b+', '6c', '6c+',
    '7a', '7a+', '7b', '7b+', '7c', '7c+', '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a'];

  let maxIndex = -1;
  let maxGrade = null;

  grades.forEach(grade => {
    const index = gradeOrder.indexOf(grade.toLowerCase());
    if (index > maxIndex) {
      maxIndex = index;
      maxGrade = grade;
    }
  });

  return maxGrade;
}

function renderActivityList(ascents) {
  const activityList = document.getElementById('activity-list');
  if (!activityList) return;

  // Clear existing items except empty state
  const emptyState = activityList.querySelector('.activity-empty-state');
  activityList.innerHTML = '';

  if (ascents.length === 0) {
    if (emptyState) activityList.appendChild(emptyState);
    return;
  }

  ascents.forEach(ascent => {
    const styleIcon = {
      flash: '⚡',
      redpoint: '🔴',
      onsight: '👁️',
      project: '🎯'
    };

    const icon = styleIcon[ascent.style] || 'x”';
    const date = ascent.date?.toDate?.() || new Date();
    const formattedDate = date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short'
    });

    const itemHtml = `
      <div class="activity-item" data-id="${ascent.id}">
        <div class="activity-item-icon ${ascent.style || ''}">${icon}</div>
        <div class="activity-item-content">
          <div class="activity-item-header">
            <h4 class="activity-item-name">${ascent.routeName || 'Ví­a sin nombre'}</h4>
            <span class="activity-item-grade">${ascent.grade || '-'}</span>
          </div>
          <div class="activity-item-meta">
            <span class="activity-item-location">📍 ${ascent.location || 'Ubicación desconocida'}</span>
            <span class="activity-item-date">x¦ ${formattedDate}</span>
          </div>
          ${ascent.attempts || ascent.duration ? `
            <div class="activity-item-stats">
              ${ascent.attempts ? `<span class="activity-stat-mini">x${ascent.attempts} intentos</span>` : ''}
              ${ascent.duration ? `<span class="activity-stat-mini">x${ascent.duration} min</span>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;

    activityList.insertAdjacentHTML('beforeend', itemHtml);
  });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  initEditProfile();
  initSocialListModal(); // Initialize social list modal listeners
  initSettingsDropdown();
  initCreatePost();
  initViewPostModal();
  initActivityView();
});

// Re-initialize activity when user logs in
firebase.auth().onAuthStateChanged(user => {
  if (user) {
    setTimeout(() => loadActivityData(), 1000);
  }
});