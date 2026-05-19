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
    const btnRouteId = checkBtn.dataset.routeId != null ? Number(checkBtn.dataset.routeId) : undefined;
    const btnRouteName = checkBtn.dataset.routeName;
    const btnGrade = checkBtn.dataset.grade;
    const btnSector = checkBtn.dataset.sector;
    openAscentModal(btnSchoolId, currentSchoolName || btnSchoolId, btnRouteId, btnRouteName, btnGrade, btnSector);
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
    const commentRouteId = commentBtn.dataset.routeId != null ? Number(commentBtn.dataset.routeId) : undefined;
    const commentRouteName = commentBtn.dataset.routeName;
    const schoolId = commentBtn.dataset.schoolId || currentSchoolId;

    log('Opening comments for routeId:', commentRouteId, 'name:', commentRouteName);
    if (typeof openCommentsModal === 'function') {
      openCommentsModal(schoolId, commentRouteId, commentRouteName);
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
    const uploadRouteId = uploadBtn.dataset.routeId != null ? Number(uploadBtn.dataset.routeId) : undefined;
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
          await uploadRoutePhoto(schoolId, uploadRouteId, routeName, file);
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
                <div class="search-result-meta">${user.id === 'akqgKt9WmQRNrpPub9xVKiPKmcn2' ? 'Administrador' : (user.bio || 'Escalador')}</div>
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
  // Expose searchUsersGlobal globally so MentionAutocomplete can use it
  window.searchUsersGlobal = searchUsersGlobal;

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
  const mentionsGrid = document.getElementById('profile-mentions-grid');
  if (postsGrid) postsGrid.innerHTML = '<div class="loading-spinner">Cargando...</div>';
  if (likedGrid) likedGrid.innerHTML = '<div class="loading-spinner">Cargando...</div>';
  if (mentionsGrid) mentionsGrid.innerHTML = '';

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
    // Mostrar "Administrador" para la cuenta de Krux, "Escalador" para el resto
    const isAdmin = userId === 'akqgKt9WmQRNrpPub9xVKiPKmcn2';
    document.getElementById('profile-category').textContent = isAdmin ? 'Administrador' : '🧗 Escalador';

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

    // Cargar posts, likes, menciones y stats en paralelo
    await Promise.all([
      loadProfilePostsForUser(userId, loadId),
      loadProfileLikedPostsForUser(userId, loadId),
      loadProfileClimbingStatsForUser(userId, loadId),
      Promise.resolve(loadProfileMentionsForUser(userId, loadId))
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

    // Update Spotter UI for the OTHER user's profile (not own profile)
    if (window.updateSpotterUIForProfile) {
      await window.updateSpotterUIForProfile(userId, false);
    }

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

  // Update Spotter UI for OWN profile (will show badge/button based on own status)
  if (window.updateSpotterUIForProfile && currentUser) {
    window.updateSpotterUIForProfile(currentUser.uid, true);
  }
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

  // Reset spotter elements synchronously to avoid flash of stale state
  const spotterBadge = document.getElementById('spotter-badge');
  if (spotterBadge) spotterBadge.classList.add('hidden');
  const spotterPoints = document.getElementById('spotter-points');
  if (spotterPoints) spotterPoints.classList.add('hidden');
  const becomeSpotterBtn = document.getElementById('become-spotter-btn');
  if (becomeSpotterBtn) becomeSpotterBtn.classList.add('hidden');
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
          <div class="empty-message" style="text-align: center; padding: 40px 20px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 16px; opacity: 0.5;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg><p style="margin: 0; color: #6b7280;">No hay publicaciones aún</p></div>
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
          <div class="empty-message" style="text-align: center; padding: 40px 20px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 16px; opacity: 0.5;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg><p style="margin: 0; color: #6b7280;">No hay me gusta aún</p></div>
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

// ================== MENTIONS TAB ==================

/**
 * Render posts that mention the current profile user.
 * Queries Firestore for posts where the user's UID is in mentionedUserIds array.
 */
async function renderMentionsPosts() {
  // Use firebase.auth().currentUser to ensure we have the most up-to-date user
  const authUser = firebase.auth().currentUser;

  const grid = document.getElementById('profile-mentions-grid');
  if (!grid) return;

  grid.innerHTML = '<div class="empty-message" style="text-align: center; padding: 20px;">Cargando menciones...</div>';

  if (!authUser || !authUser.uid) {
    grid.innerHTML = '<div class="empty-message" style="text-align: center; padding: 40px 20px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 16px; opacity: 0.5;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg><p style="margin: 0; color: #6b7280;">No se pudo determinar el usuario</p></div>';
    return;
  }

  // Use loadProfileMentionsForUser for consistency - it handles the query the same way
  // but uses the userId parameter directly instead of relying on global currentUser
  await loadProfileMentionsForUser(authUser.uid, null);
}

/**
 * Load mentions for another user's profile.
 * Queries Firestore for posts where the user's UID is in mentionedUserIds array.
 */
async function loadProfileMentionsForUser(userId, loadId = null) {
  const container = document.getElementById('profile-mentions-grid');
  if (!container) return;

  if (loadId && profileLoadingState.currentLoadId !== loadId) return;

  if (!userId) {
    container.innerHTML = '<div class="empty-message" style="text-align: center; padding: 40px 20px;"><p style="margin: 0; color: #6b7280;">No hay menciones</p></div>';
    return;
  }

  container.innerHTML = '<div class="empty-message" style="text-align: center; padding: 20px;">Cargando menciones...</div>';

  try {
    // Query posts where user is mentioned using mentionedUserIds array
    const mentionsSnapshot = await db.collection('posts')
      .where('mentionedUserIds', 'array-contains', userId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    // Check if this request is still valid
    if (loadId && profileLoadingState.currentLoadId !== loadId) return;

    const mentionedPosts = [];
    mentionsSnapshot.forEach(doc => {
      const data = doc.data();
      mentionedPosts.push({
        id: doc.id,
        ...data,
        likesCount: Array.isArray(data.likes) ? data.likes.length : (data.likesCount || 0),
        commentsCount: data.commentsCount || 0
      });
    });

    // Final check before DOM update
    if (loadId && profileLoadingState.currentLoadId !== loadId) return;

    if (mentionedPosts.length === 0) {
      container.innerHTML = `
        <div class="empty-message" style="text-align: center; padding: 40px 20px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 16px; opacity: 0.5;">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <p style="margin: 0; color: #6b7280;">No hay menciones aún</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    mentionedPosts.forEach(post => {
      renderPostCard(post, container);
    });

    attachFeedEventListeners(container);
  } catch (error) {
    console.error('Error loading mentions for user:', error);

    if (loadId && profileLoadingState.currentLoadId !== loadId) return;

    container.innerHTML = `
      <div class="empty-message" style="text-align: center; padding: 40px 20px;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 16px; opacity: 0.5;">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <p style="margin: 0; color: #6b7280;">Error al cargar menciones</p>
      </div>
    `;
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
    const grades = [];

    ascentsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.schoolId) zones.add(data.schoolId);
      if (data.grade && data.grade.trim() !== '') {
        grades.push(data.grade);
      }
    });

    if (grades.length > 0) {
      const compareFunc = typeof compareGradesLocal === 'function' ? compareGradesLocal : (a, b) => a.localeCompare(b);
      maxGrade = grades.sort(compareFunc).reverse()[0];
    }

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
            <div class="social-list-bio">${user.id === 'akqgKt9WmQRNrpPub9xVKiPKmcn2' ? 'Administrador' : (user.bio || 'Escalador')}</div>
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
          <div class="empty-message" style="text-align: center; padding: 40px 20px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 16px; opacity: 0.5;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg><p style="margin: 0; color: #6b7280;">No hay publicaciones aún</p></div>
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
      const clickHandler = n.fromUserId ? `onclick="handleNotificationClick('${n.id}', '${n.type}', '${n.fromUserId}', '${n.postId || ''}', '${n.commentId || ''}', '${n.replyId || ''}')"` : '';
      // Use notification ID directly - Firestore IDs are safe for HTML attributes
      const notificationId = String(n.id);

      return `
        <div class="notification-item ${unreadClass}" data-id="${notificationId}" data-notification-id="${notificationId}">
          <div class="notification-clickable-area" ${clickHandler} style="cursor: pointer; display: flex; align-items: center; flex: 1; min-width: 0;">
            <img src="${n.fromUserPhoto || generateAvatarFallback(n.fromUserName || 'Usuario', 44)}" class="notification-avatar" alt="" referrerPolicy="no-referrer" onerror="this.src='${generateAvatarFallback(n.fromUserName || 'Usuario', 44)}'; this.onerror=null;">
          <div class="notification-content">
            <div class="notification-text"><strong>${n.fromUserName || 'Usuario'}</strong> ${n.text}</div>
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
      case 'mention':
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"></path></svg>';
      case 'reply':
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>';
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

// Handle notification click - navigate to relevant content with deep-link to comment
window.handleNotificationClick = async function (notificationId, type, fromUserId, postId, commentId, replyId) {
  document.getElementById('notification-dropdown')?.classList.add('hidden');
  if (type === 'follow' && fromUserId) {
    openPublicProfile(fromUserId);
  } else if (postId && typeof openPostModal === 'function') {
    // For all post-related notifications (comment, reply, like, mention),
    // open the post modal with deep-link to the specific comment/reply
    switchView('feed-view');
    openPostModal(postId, commentId || '', replyId || '');
  } else if (fromUserId) {
    openPublicProfile(fromUserId);
  }
};

// Create a notification for a user (with idempotency to prevent duplicates)
window.createNotification = async function (targetUserId, type, text, additionalData = {}) {
  if (!currentUser || targetUserId === currentUser.uid) return;

  try {
    // Generate idempotency key based on notification type and context
    // This prevents duplicate notifications for the same action
    // For replies, use replyId to allow multiple reply notifications per post from the same user
    const resourceId = additionalData.replyId || additionalData.postId || additionalData.routeId || additionalData.resourceId || '';
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

  // Cerrar todos los bottom sheets al cambiar de sección
  if (typeof hideBottomSheet === 'function') hideBottomSheet();
  if (typeof hideSectorBottomSheet === 'function') hideSectorBottomSheet();
  if (typeof hideRouteBottomSheet === 'function') hideRouteBottomSheet();

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

  if (viewId === 'feed-view' || viewId === 'profile-view' || viewId === 'activity-view' || viewId === 'map-view' || viewId === 'search-view' || viewId === 'train-view') {
    if (topBar) topBar.style.display = 'none';
    if (authContainer) authContainer.style.display = 'none';
  } else {
    if (topBar) topBar.style.display = 'flex';
    if (authContainer) authContainer.style.display = 'block';
  }

  // Reload activity data when switching to activity view
  if (viewId === 'activity-view') {
    loadActivityData();
    // Re-render líneas cuando la vista esté completamente visible (fin de transición CSS)
    setTimeout(() => {
      const barsContainer = document.getElementById('histogram-bars');
      const svgLines = document.getElementById('histogram-lines');
      if (barsContainer && svgLines && cachedAscentsForHistogram.length > 0) {
        const histData = processHistogramData(cachedAscentsForHistogram, currentHistogramPeriod);
        const maxAscents = Math.max(...histData.map(d => d.ascents), 1);
        const allIdx = histData.flatMap(d => [getGradeIndex(d.maxGrade), getGradeIndex(d.avgGrade), getGradeIndex(d.minGrade)]).filter(i => i >= 0);
        if (allIdx.length > 0) {
          const minGradeIdx = Math.max(0, Math.min(...allIdx) - 2);
          const maxGradeIdx = Math.min(HISTOGRAM_GRADE_ORDER.length - 1, Math.max(...allIdx) + 2);
          measureAndRenderLines(barsContainer, svgLines, histData, minGradeIdx, maxGradeIdx - minGradeIdx || 1, 0);
        }
      }
    }, 220);
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
  const ascents = await getUserAscents();
  const projects = getProjects();

  const totalAscentsEl = document.getElementById('total-ascents');
  if (totalAscentsEl) totalAscentsEl.textContent = ascents.length || userStats.totalAscents || 0;

  // Calculate Max Grade using compareGradesLocal
  let maxGrade = '-';
  if (ascents.length > 0) {
    const grades = ascents
      .map(a => a.grade)
      .filter(g => g && g.trim() !== '');
    if (grades.length > 0) {
      const compareFunc = typeof compareGradesLocal === 'function' ? compareGradesLocal : (a, b) => a.localeCompare(b);
      maxGrade = grades.sort(compareFunc).reverse()[0];
    }
  }

  const maxGradeEl = document.getElementById('max-grade');
  if (maxGradeEl) maxGradeEl.textContent = maxGrade;

  // Unique zones (filter empty schoolNames)
  const zones = new Set(
    ascents.map(a => a.schoolName).filter(z => z && z.trim() !== '')
  );
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
      grid.innerHTML = '<div class="empty-message" style="text-align: center; padding: 40px 20px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 16px; opacity: 0.5;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg><p style="margin: 0; color: #6b7280;">No has dado me gusta a ninguna publicación</p><p style="margin: 8px 0 0; color: #9ca3af; font-size: 14px;">Explora el feed para descubrir contenido</p></div>';
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
        <div class="ascent-location">🎯 Intento</div>
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
          await loadProfileLikedPostsForUser(currentProfileUserId, profileLoadingState.currentLoadId);
        } else {
          await renderLikedPosts();
        }
      } else if (targetTab === 'posts') {
        if (currentProfileUserId) {
          await loadProfilePostsForUser(currentProfileUserId, profileLoadingState.currentLoadId);
        } else {
          await renderProfileGrid();
        }
      } else if (targetTab === 'mentions') {
        if (currentProfileUserId) {
          loadProfileMentionsForUser(currentProfileUserId, profileLoadingState.currentLoadId);
        } else {
          renderMentionsPosts();
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
              <div class="social-list-bio">${user.id === 'akqgKt9WmQRNrpPub9xVKiPKmcn2' ? 'Administrador' : (user.bio || 'Escalador')}</div>
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

      case 'settings-donate': {
        const kofiUrl = 'https://ko-fi.com/kruxx_';
        if (window.Capacitor !== undefined) {
          window.open(kofiUrl, '_system');
        } else {
          window.open(kofiUrl, '_blank', 'noopener,noreferrer');
        }
        break;
      }

      case 'settings-logout':
        const confirmLogout = await showConfirm('¿Estás seguro de que quieres cerrar sesión?', 'Cerrar sesión', 'Cerrar sesión');
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
      <button class="admin-tab" data-section="suggestions">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        Sugerencias
      </button>
      <button class="admin-tab" data-section="spotters">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
        Spotters
      </button>
      <button class="admin-tab" data-section="schools">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
        </svg>
        Escuelas
      </button>
      <button class="admin-tab" data-section="sectors">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        Sectores
      </button>
      <button class="admin-tab" data-section="poi">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        POI
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

    <!-- Sección Sugerencias -->
    <section class="admin-section" id="admin-section-suggestions">
      <h1 class="admin-page-title">Sugerencias de Usuarios</h1>
      <p class="admin-page-desc">Revisa la información sugerida por los usuarios</p>

      <div class="admin-filter-row">
        <select id="admin-filter-suggestion-status" onchange="loadAdminSuggestions()">
          <option value="pending">Pendientes</option>
          <option value="approved">Aprobadas</option>
          <option value="rejected">Rechazadas</option>
          <option value="all">Todas</option>
        </select>
        <select id="admin-filter-suggestion-field" onchange="loadAdminSuggestions()">
          <option value="all">Todos los campos</option>
          <option value="descripcion">Tipo de escalada</option>
          <option value="exp1">Express</option>
          <option value="long1">Metros</option>
        </select>
      </div>

      <div id="admin-suggestions-list">
        <div class="admin-loading">
          <div class="admin-spinner"></div>
          <p>Cargando sugerencias...</p>
        </div>
      </div>
    </section>

    <!-- Sección Spotters -->
    <section class="admin-section" id="admin-section-spotters">
      <h1 class="admin-page-title">Gestión de Spotters</h1>
      <p class="admin-page-desc">Revisa las solicitudes de Spotter</p>

      <div class="admin-card">
        <div class="admin-card-header">
          <span style="display:flex;align-items:center;gap:8px;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20" style="color:#f59e0b;">
              <circle cx="12" cy="12" r="10" stroke-width="2"/>
              <polyline points="12 6 12 12 16 14" stroke-width="2"/>
            </svg>
            Solicitudes Pendientes
          </span>
          <span class="admin-badge-pending" id="admin-pending-spotters-count">0</span>
        </div>
        <div class="admin-card-body" id="admin-spotter-requests-list">
          <div class="admin-loading">
            <div class="admin-spinner"></div>
            <p>Cargando solicitudes...</p>
          </div>
        </div>
      </div>

      <div class="admin-card" style="margin-top:16px;">
        <div class="admin-card-header">
          <span style="display:flex;align-items:center;gap:8px;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20" style="color:#10b981;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Spotters Aprobados
          </span>
        </div>
        <div class="admin-card-body" id="admin-approved-spotters-list">
          <div class="admin-loading">
            <div class="admin-spinner"></div>
            <p>Cargando spotters...</p>
          </div>
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

    <!-- Seccion Escuelas Pendientes -->
    <section class="admin-section" id="admin-section-schools">
      <h1 class="admin-page-title">Aprobar Escuelas</h1>
      <p class="admin-page-desc">Escuelas propuestas por Spotters</p>

      <div class="admin-filter-row">
        <select id="admin-filter-school-status" onchange="loadAdminPendingSchools()">
          <option value="pending">Pendientes</option>
          <option value="approved">Aprobadas</option>
          <option value="rejected">Rechazadas</option>
          <option value="all">Todas</option>
        </select>
      </div>

      <div class="admin-card">
        <div class="admin-card-body" id="admin-schools-list">
          <div class="admin-loading">
            <div class="admin-spinner"></div>
            <p>Cargando escuelas...</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Seccion Sectores Pendientes -->
    <section class="admin-section" id="admin-section-sectors">
      <h1 class="admin-page-title">Aprobar Sectores</h1>
      <p class="admin-page-desc">Sectores propuestos por Spotters</p>

      <div class="admin-filter-row">
        <select id="admin-filter-sector-status" onchange="loadAdminPendingSectors()">
          <option value="pending">Pendientes</option>
          <option value="approved">Aprobados</option>
          <option value="rejected">Rechazados</option>
          <option value="all">Todos</option>
        </select>
      </div>

      <div class="admin-card">
        <div class="admin-card-body" id="admin-sectors-list">
          <div class="admin-loading">
            <div class="admin-spinner"></div>
            <p>Cargando sectores...</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Seccion POI Pendientes -->
    <section class="admin-section" id="admin-section-poi">
      <h1 class="admin-page-title">Aprobar Puntos de Interes</h1>
      <p class="admin-page-desc">Puntos de interes propuestos por Spotters</p>

      <div class="admin-filter-row">
        <select id="admin-filter-poi-status" onchange="loadAdminPendingPOI()">
          <option value="pending">Pendientes</option>
          <option value="approved">Aprobados</option>
          <option value="rejected">Rechazados</option>
          <option value="all">Todos</option>
        </select>
      </div>

      <div class="admin-card">
        <div class="admin-card-body" id="admin-poi-list">
          <div class="admin-loading">
            <div class="admin-spinner"></div>
            <p>Cargando puntos de interes...</p>
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
  loadAdminSuggestions();
  loadAdminSpotterRequests();
  loadAdminApprovedSpotters();

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

  // Cargar datos de la seccion al cambiar
  if (section === 'schools') loadAdminPendingSchools();
  if (section === 'sectors') loadAdminPendingSectors();
  if (section === 'poi') loadAdminPendingPOI();
}

async function loadAdminStats() {
  try {
    const db = firebase.firestore();

    // Contar pendientes, aprobadas y rechazadas (todas las colecciones)
    const collections = ['pending_routes', 'pending_schools', 'pending_sectors', 'pending_poi'];
    let totalPending = 0, totalApproved = 0, totalRejected = 0;

    for (const col of collections) {
      try {
        const pSnap = await db.collection(col).where('status', '==', 'pending').get();
        const aSnap = await db.collection(col).where('status', '==', 'approved').get();
        const rSnap = await db.collection(col).where('status', '==', 'rejected').get();
        totalPending += pSnap.size;
        totalApproved += aSnap.size;
        totalRejected += rSnap.size;
      } catch (e) { /* coleccion puede no existir aun */ }
    }

    const adminsSnap = await db.collection('admins').get();

    adminData.stats = {
      pending: totalPending,
      approved: totalApproved,
      rejected: totalRejected,
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

// ============================================
// ADMIN: ESCUELAS PENDIENTES
// ============================================

async function loadAdminPendingSchools() {
  const listEl = document.getElementById('admin-schools-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div><p>Cargando escuelas...</p></div>';

  try {
    const db = firebase.firestore();
    const statusFilter = document.getElementById('admin-filter-school-status')?.value || 'pending';

    let query = db.collection('pending_schools');
    if (statusFilter !== 'all') query = query.where('status', '==', statusFilter);

    const snapshot = await query.limit(50).get();
    let items = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
    items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    if (items.length === 0) {
      listEl.innerHTML = '<div class="admin-empty-state"><p>No hay escuelas con este filtro</p></div>';
      return;
    }

    listEl.innerHTML = items.map(item => `
      <div class="admin-route-card" data-id="${item.id}">
        <div class="admin-route-name">${item.nombre || 'Sin nombre'}</div>
        <div class="admin-route-meta">
          ${item.descripcion || 'Sin descripcion'} · ${item.createdByEmail || ''}
          ${item.coordinates ? ` · [${item.coordinates[1]?.toFixed(4)}, ${item.coordinates[0]?.toFixed(4)}]` : ''}
          ${item.status === 'approved' ? ' · ✅ Aprobada' : item.status === 'rejected' ? ' · ❌ Rechazada' : ''}
        </div>
        ${item.status === 'pending' ? `
          <div class="admin-route-actions">
            <button class="admin-btn-approve" onclick="approveAdminItem('pending_schools','${item.id}','loadAdminPendingSchools')">Aprobar</button>
            <button class="admin-btn-reject" onclick="rejectAdminItem('pending_schools','${item.id}','loadAdminPendingSchools')">Rechazar</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading pending schools:', error);
    listEl.innerHTML = '<div class="admin-empty-state"><p>Error al cargar escuelas</p></div>';
  }
}

// ============================================
// ADMIN: SECTORES PENDIENTES
// ============================================

async function loadAdminPendingSectors() {
  const listEl = document.getElementById('admin-sectors-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div><p>Cargando sectores...</p></div>';

  try {
    const db = firebase.firestore();
    const statusFilter = document.getElementById('admin-filter-sector-status')?.value || 'pending';

    let query = db.collection('pending_sectors');
    if (statusFilter !== 'all') query = query.where('status', '==', statusFilter);

    const snapshot = await query.limit(50).get();
    let items = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
    items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    if (items.length === 0) {
      listEl.innerHTML = '<div class="admin-empty-state"><p>No hay sectores con este filtro</p></div>';
      return;
    }

    listEl.innerHTML = items.map(item => {
      const vertexCount = item.vertices?.length || item.geometry?.coordinates?.[0]?.length || 0;
      return `
        <div class="admin-route-card" data-id="${item.id}">
          <div class="admin-route-name">${item.nombre || 'Sin nombre'}</div>
          <div class="admin-route-meta">
            Escuela: ${item.schoolId || 'No asignada'} · Restriccion: ${item.restr || 'NO'}
            ${item.exposicion ? ` · ${item.exposicion}` : ''}
            · ${vertexCount} vertices · ${item.createdByEmail || ''}
            ${item.status === 'approved' ? ' · ✅ Aprobado' : item.status === 'rejected' ? ' · ❌ Rechazado' : ''}
          </div>
          ${item.status === 'pending' ? `
            <div class="admin-route-actions">
              <button class="admin-btn-approve" onclick="approveAdminItem('pending_sectors','${item.id}','loadAdminPendingSectors')">Aprobar</button>
              <button class="admin-btn-reject" onclick="rejectAdminItem('pending_sectors','${item.id}','loadAdminPendingSectors')">Rechazar</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading pending sectors:', error);
    listEl.innerHTML = '<div class="admin-empty-state"><p>Error al cargar sectores</p></div>';
  }
}

// ============================================
// ADMIN: PUNTOS DE INTERES PENDIENTES
// ============================================

async function loadAdminPendingPOI() {
  const listEl = document.getElementById('admin-poi-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div><p>Cargando POI...</p></div>';

  try {
    const db = firebase.firestore();
    const statusFilter = document.getElementById('admin-filter-poi-status')?.value || 'pending';

    let query = db.collection('pending_poi');
    if (statusFilter !== 'all') query = query.where('status', '==', statusFilter);

    const snapshot = await query.limit(50).get();
    let items = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
    items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    if (items.length === 0) {
      listEl.innerHTML = '<div class="admin-empty-state"><p>No hay puntos de interes con este filtro</p></div>';
      return;
    }

    listEl.innerHTML = items.map(item => {
      const emoji = (typeof getPOIEmoji === 'function') ? getPOIEmoji(item.descripcio) : '📍';
      return `
        <div class="admin-route-card" data-id="${item.id}">
          <div class="admin-route-name">${emoji} ${item.descripcio || 'Sin tipo'} ${item.nombre ? '— ' + item.nombre : ''}</div>
          <div class="admin-route-meta">
            Escuela: ${item.schoolId || 'No asignada'} · ${item.createdByEmail || ''}
            ${item.coordinates ? ` · [${item.coordinates[1]?.toFixed(4)}, ${item.coordinates[0]?.toFixed(4)}]` : ''}
            ${item.link ? ` · <a href="${item.link}" target="_blank">Link</a>` : ''}
            ${item.status === 'approved' ? ' · ✅ Aprobado' : item.status === 'rejected' ? ' · ❌ Rechazado' : ''}
          </div>
          ${item.status === 'pending' ? `
            <div class="admin-route-actions">
              <button class="admin-btn-approve" onclick="approveAdminItem('pending_poi','${item.id}','loadAdminPendingPOI')">Aprobar</button>
              <button class="admin-btn-reject" onclick="rejectAdminItem('pending_poi','${item.id}','loadAdminPendingPOI')">Rechazar</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading pending POI:', error);
    listEl.innerHTML = '<div class="admin-empty-state"><p>Error al cargar puntos de interes</p></div>';
  }
}

// ============================================
// ADMIN: APROBAR/RECHAZAR GENERICO
// ============================================

async function approveAdminItem(collection, docId, reloadFn) {
  try {
    const db = firebase.firestore();
    await db.collection(collection).doc(docId).update({
      status: 'approved',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedBy: firebase.auth().currentUser?.email
    });
    showToast('Aprobado correctamente', 'success');
    if (typeof window[reloadFn] === 'function') window[reloadFn]();
    loadAdminStats();
  } catch (error) {
    console.error('Error approving item:', error);
    showToast('Error al aprobar', 'error');
  }
}

async function rejectAdminItem(collection, docId, reloadFn) {
  const reason = prompt('Motivo del rechazo (opcional):');
  try {
    const db = firebase.firestore();
    await db.collection(collection).doc(docId).update({
      status: 'rejected',
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      rejectedBy: firebase.auth().currentUser?.email,
      rejectionReason: reason || ''
    });
    showToast('Rechazado', 'success');
    if (typeof window[reloadFn] === 'function') window[reloadFn]();
    loadAdminStats();
  } catch (error) {
    console.error('Error rejecting item:', error);
    showToast('Error al rechazar', 'error');
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

// ================== ADMIN SUGGESTIONS (Mobile) ==================
let adminSuggestions = [];

async function loadAdminSuggestions() {
  const listEl = document.getElementById('admin-suggestions-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div><p>Cargando sugerencias...</p></div>';

  try {
    const db = firebase.firestore();
    const statusFilter = document.getElementById('admin-filter-suggestion-status')?.value || 'pending';
    const fieldFilter = document.getElementById('admin-filter-suggestion-field')?.value || 'all';

    let query = db.collection('routeSuggestions');

    if (statusFilter !== 'all') {
      query = query.where('status', '==', statusFilter);
    }

    if (fieldFilter !== 'all') {
      query = query.where('field', '==', fieldFilter);
    }

    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    adminSuggestions = [];
    snapshot.forEach(doc => {
      adminSuggestions.push({ id: doc.id, ...doc.data() });
    });

    renderAdminSuggestions();

  } catch (error) {
    console.error('Error loading suggestions:', error);
    listEl.innerHTML = '<div class="admin-empty-state"><p>Error al cargar sugerencias</p></div>';
  }
}

function renderAdminSuggestions() {
  const listEl = document.getElementById('admin-suggestions-list');
  if (!listEl) return;

  if (adminSuggestions.length === 0) {
    listEl.innerHTML = `
      <div class="admin-empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>No hay sugerencias</p>
      </div>
    `;
    return;
  }

  const fieldLabels = {
    descripcion: 'Tipo de escalada',
    exp1: 'Express',
    long1: 'Metros'
  };

  const fieldUnits = {
    descripcion: '',
    exp1: ' express',
    long1: ' m'
  };

  listEl.innerHTML = adminSuggestions.map(suggestion => {
    const date = suggestion.createdAt?.toDate?.() ?
      suggestion.createdAt.toDate().toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }) : '';

    const userInitial = suggestion.userEmail ?
      suggestion.userEmail.charAt(0).toUpperCase() : '?';

    const fieldLabel = fieldLabels[suggestion.field] || suggestion.field;
    const fieldUnit = fieldUnits[suggestion.field] || '';
    const isPending = suggestion.status === 'pending';

    return `
      <div class="admin-suggestion-card ${suggestion.status}" data-id="${suggestion.id}">
        <div class="admin-suggestion-header">
          <div class="admin-suggestion-route">${escapeHtmlAdmin(suggestion.routeName || 'Vía')}</div>
          <span class="admin-suggestion-badge ${suggestion.field}">${fieldLabel}</span>
        </div>
        <div class="admin-suggestion-school">${escapeHtmlAdmin(suggestion.schoolId || '')}</div>
        <div class="admin-suggestion-value">
          <span class="admin-suggestion-label">Valor sugerido:</span>
          ${isPending ? `
            <input type="${suggestion.field === 'descripcion' ? 'text' : 'number'}"
                   class="admin-suggestion-input"
                   id="admin-sug-input-${suggestion.id}"
                   value="${escapeHtmlAdmin(suggestion.suggestedValue || '')}">
          ` : `
            <span class="admin-suggestion-text">${escapeHtmlAdmin(suggestion.suggestedValue || '')}${fieldUnit}</span>
          `}
        </div>
        <div class="admin-suggestion-meta">
          <div class="admin-suggestion-user">
            <span class="admin-suggestion-avatar">${userInitial}</span>
            <span>${escapeHtmlAdmin(suggestion.userEmail || 'Anónimo')}</span>
          </div>
          <span>${date}</span>
        </div>
        ${isPending ? `
          <div class="admin-suggestion-actions">
            <button class="admin-btn admin-btn-success" onclick="approveAdminSuggestion('${suggestion.id}')">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              Aprobar
            </button>
            <button class="admin-btn admin-btn-danger" onclick="rejectAdminSuggestion('${suggestion.id}')">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Rechazar
            </button>
          </div>
        ` : `
          <div class="admin-suggestion-status">
            <span class="admin-status-badge ${suggestion.status}">
              ${suggestion.status === 'approved' ? 'Aprobada' : 'Rechazada'}
            </span>
          </div>
        `}
      </div>
    `;
  }).join('');
}

async function approveAdminSuggestion(suggestionId) {
  const suggestion = adminSuggestions.find(s => s.id === suggestionId);
  if (!suggestion) return;

  const inputEl = document.getElementById(`admin-sug-input-${suggestionId}`);
  const finalValue = inputEl ? inputEl.value.trim() : suggestion.suggestedValue;

  if (!finalValue) {
    showToast('El valor no puede estar vacío', 'error');
    return;
  }

  if (!confirm(`¿Aprobar esta sugerencia?\n\nVía: ${suggestion.routeName}\nCampo: ${suggestion.field}\nValor: ${finalValue}`)) {
    return;
  }

  try {
    const db = firebase.firestore();
    const currentUserEmail = firebase.auth().currentUser?.email;

    await db.collection('routeSuggestions').doc(suggestionId).update({
      status: 'approved',
      approvedValue: finalValue,
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedBy: currentUserEmail
    });

    // Actualizar la vía en pending_routes
    const routeQuery = await db.collection('pending_routes')
      .where('nombre', '==', suggestion.routeName)
      .where('schoolId', '==', suggestion.schoolId)
      .get();

    if (!routeQuery.empty) {
      const routeDoc = routeQuery.docs[0];
      const updateData = {};
      updateData[suggestion.field] = finalValue;
      await db.collection('pending_routes').doc(routeDoc.id).update(updateData);
    }

    showToast('Sugerencia aprobada', 'success');
    loadAdminSuggestions();

  } catch (error) {
    console.error('Error approving suggestion:', error);
    showToast('Error al aprobar', 'error');
  }
}

async function rejectAdminSuggestion(suggestionId) {
  const suggestion = adminSuggestions.find(s => s.id === suggestionId);
  if (!suggestion) return;

  if (!confirm(`¿Rechazar esta sugerencia?\n\nVía: ${suggestion.routeName}`)) {
    return;
  }

  try {
    const db = firebase.firestore();
    const currentUserEmail = firebase.auth().currentUser?.email;

    await db.collection('routeSuggestions').doc(suggestionId).update({
      status: 'rejected',
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      rejectedBy: currentUserEmail
    });

    showToast('Sugerencia rechazada', 'info');
    loadAdminSuggestions();

  } catch (error) {
    console.error('Error rejecting suggestion:', error);
    showToast('Error al rechazar', 'error');
  }
}

// ================== ADMIN SPOTTERS (Mobile) ==================
let adminSpotterRequests = [];
let adminApprovedSpotters = [];

async function loadAdminSpotterRequests() {
  const listEl = document.getElementById('admin-spotter-requests-list');
  const countEl = document.getElementById('admin-pending-spotters-count');
  if (!listEl) return;

  listEl.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div><p>Cargando solicitudes...</p></div>';

  try {
    const db = firebase.firestore();
    const snapshot = await db.collection('spotter_requests')
      .where('status', '==', 'pending')
      .get();

    adminSpotterRequests = [];
    snapshot.forEach(doc => {
      adminSpotterRequests.push({ id: doc.id, ...doc.data() });
    });

    // Ordenar por fecha
    adminSpotterRequests.sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(0);
      const dateB = b.createdAt?.toDate?.() || new Date(0);
      return dateB - dateA;
    });

    if (countEl) {
      countEl.textContent = adminSpotterRequests.length;
    }

    renderAdminSpotterRequests();

  } catch (error) {
    console.error('Error loading spotter requests:', error);
    listEl.innerHTML = '<div class="admin-empty-state"><p>Error al cargar solicitudes</p></div>';
  }
}

function renderAdminSpotterRequests() {
  const listEl = document.getElementById('admin-spotter-requests-list');
  if (!listEl) return;

  if (adminSpotterRequests.length === 0) {
    listEl.innerHTML = `
      <div class="admin-empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>No hay solicitudes pendientes</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = adminSpotterRequests.map(request => {
    const createdAt = request.createdAt?.toDate?.() ?
      request.createdAt.toDate().toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }) : '';

    const avatarUrl = request.userPhotoURL ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent((request.firstname || '') + '+' + (request.lastname || ''))}&background=fbbf24&color=1f2937&size=48`;

    const fullName = `${escapeHtmlAdmin(request.firstname || '')} ${escapeHtmlAdmin(request.lastname || '')}`.trim() || 'Usuario';

    return `
      <div class="admin-spotter-card" data-id="${request.id}">
        <div class="admin-spotter-header">
          <img src="${avatarUrl}" alt="${fullName}" class="admin-spotter-avatar" onerror="this.src='https://ui-avatars.com/api/?name=U&background=fbbf24&color=1f2937&size=48'">
          <div class="admin-spotter-info">
            <div class="admin-spotter-name">${fullName}</div>
            <div class="admin-spotter-email">${escapeHtmlAdmin(request.email || '')}</div>
            <div class="admin-spotter-date">Solicitado: ${createdAt}</div>
          </div>
        </div>
        ${request.message ? `
          <div class="admin-spotter-message">
            <div class="admin-spotter-message-label">Motivación:</div>
            <div class="admin-spotter-message-text">${escapeHtmlAdmin(request.message)}</div>
          </div>
        ` : ''}
        <div class="admin-spotter-actions">
          <button class="admin-btn admin-btn-danger" onclick="rejectAdminSpotterRequest('${request.id}')">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Rechazar
          </button>
          <button class="admin-btn admin-btn-success" onclick="approveAdminSpotterRequest('${request.id}')">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Aprobar
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function approveAdminSpotterRequest(requestId) {
  if (!confirm('¿Aprobar esta solicitud de Spotter?')) return;

  try {
    const db = firebase.firestore();
    const currentUserId = firebase.auth().currentUser?.uid;

    const requestDoc = await db.collection('spotter_requests').doc(requestId).get();
    if (!requestDoc.exists) {
      showToast('Solicitud no encontrada', 'error');
      return;
    }

    const requestData = requestDoc.data();

    // Añadir a admins con rol spotter
    await db.collection('admins').doc(requestData.userId).set({
      email: requestData.email,
      role: 'spotter',
      name: `${requestData.firstname || ''} ${requestData.lastname || ''}`.trim(),
      addedBy: currentUserId,
      addedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedFromRequest: requestId
    });

    // Actualizar estado de la solicitud
    await db.collection('spotter_requests').doc(requestId).update({
      status: 'approved',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedBy: currentUserId
    });

    showToast('Spotter aprobado', 'success');
    loadAdminSpotterRequests();
    loadAdminApprovedSpotters();
    loadAdminStats();

  } catch (error) {
    console.error('Error approving spotter:', error);
    showToast('Error al aprobar', 'error');
  }
}

async function rejectAdminSpotterRequest(requestId) {
  const reason = prompt('Motivo del rechazo (opcional):');

  try {
    const db = firebase.firestore();
    const currentUserId = firebase.auth().currentUser?.uid;

    await db.collection('spotter_requests').doc(requestId).update({
      status: 'rejected',
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      rejectedBy: currentUserId,
      rejectionReason: reason || ''
    });

    showToast('Solicitud rechazada', 'info');
    loadAdminSpotterRequests();

  } catch (error) {
    console.error('Error rejecting spotter:', error);
    showToast('Error al rechazar', 'error');
  }
}

async function loadAdminApprovedSpotters() {
  const listEl = document.getElementById('admin-approved-spotters-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div><p>Cargando spotters...</p></div>';

  try {
    const db = firebase.firestore();
    const snapshot = await db.collection('admins')
      .where('role', '==', 'spotter')
      .get();

    adminApprovedSpotters = [];
    snapshot.forEach(doc => {
      adminApprovedSpotters.push({ id: doc.id, ...doc.data() });
    });

    renderAdminApprovedSpotters();

  } catch (error) {
    console.error('Error loading approved spotters:', error);
    listEl.innerHTML = '<div class="admin-empty-state"><p>Error al cargar spotters</p></div>';
  }
}

function renderAdminApprovedSpotters() {
  const listEl = document.getElementById('admin-approved-spotters-list');
  if (!listEl) return;

  if (adminApprovedSpotters.length === 0) {
    listEl.innerHTML = `
      <div class="admin-empty-state">
        <p>No hay spotters aprobados</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = adminApprovedSpotters.map(spotter => {
    const addedAt = spotter.addedAt?.toDate?.() ?
      spotter.addedAt.toDate().toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }) : '';

    return `
      <div class="admin-user-row">
        <div class="admin-user-info">
          <div class="admin-user-email">${escapeHtmlAdmin(spotter.email || spotter.name || 'Usuario')}</div>
          <div class="admin-user-role">Spotter desde ${addedAt}</div>
        </div>
        <div class="admin-user-actions">
          <button onclick="revokeAdminSpotter('${spotter.id}')">Revocar</button>
        </div>
      </div>
    `;
  }).join('');
}

async function revokeAdminSpotter(spotterId) {
  if (!confirm('¿Revocar el rol de Spotter a este usuario?')) return;

  try {
    const db = firebase.firestore();

    // Obtener info del spotter para actualizar la solicitud original
    const spotterDoc = await db.collection('admins').doc(spotterId).get();
    const spotterData = spotterDoc.data();

    // Eliminar de admins
    await db.collection('admins').doc(spotterId).delete();

    // Actualizar la solicitud original si existe
    if (spotterData?.approvedFromRequest) {
      await db.collection('spotter_requests').doc(spotterData.approvedFromRequest).update({
        status: 'revoked',
        revokedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    showToast('Rol de Spotter revocado', 'info');
    loadAdminApprovedSpotters();
    loadAdminStats();

  } catch (error) {
    console.error('Error revoking spotter:', error);
    showToast('Error al revocar', 'error');
  }
}

function escapeHtmlAdmin(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ================== MENTIONS SYSTEM ==================

// Escape HTML for safe rendering
function escapeHtmlMention(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Render text with clickable mention links
function renderTextWithMentions(text, mentions) {
  if (!text) return '';
  if (!mentions || mentions.length === 0) {
    return escapeHtmlMention(text).replace(/\n/g, '<br>');
  }

  // Recalculate indices for each mention to handle trim/offset issues
  const recalculated = [];
  for (const mention of mentions) {
    if (!mention.uid || !mention.displayName) continue;
    const mentionStr = '@' + mention.displayName;

    // Check if stored indices are valid
    const segment = text.slice(mention.startIndex, mention.endIndex);
    if (segment === mentionStr) {
      recalculated.push({ ...mention });
    } else {
      // Fallback: find the mention string in the text
      const idx = text.indexOf(mentionStr);
      if (idx !== -1) {
        const alreadyClaimed = recalculated.some(
          rm => idx >= rm.startIndex && idx < rm.endIndex
        );
        if (!alreadyClaimed) {
          recalculated.push({
            uid: mention.uid,
            displayName: mention.displayName,
            startIndex: idx,
            endIndex: idx + mentionStr.length
          });
        }
      }
    }
  }

  if (recalculated.length === 0) {
    return escapeHtmlMention(text).replace(/\n/g, '<br>');
  }

  // Sort mentions by startIndex ascending
  const sorted = recalculated.sort((a, b) => a.startIndex - b.startIndex);

  let result = '';
  let lastIndex = 0;

  for (const mention of sorted) {
    if (mention.startIndex < lastIndex || mention.startIndex >= text.length) continue;
    // Add escaped text before this mention
    result += escapeHtmlMention(text.slice(lastIndex, mention.startIndex));
    // Add mention link
    const mentionText = text.slice(mention.startIndex, mention.endIndex);
    result += `<span class="mention-link" data-user-id="${escapeHtmlMention(mention.uid)}" onclick="openPublicProfile('${escapeHtmlMention(mention.uid)}')">${escapeHtmlMention(mentionText)}</span>`;
    lastIndex = mention.endIndex;
  }

  // Add remaining text
  result += escapeHtmlMention(text.slice(lastIndex));

  return result.replace(/\n/g, '<br>');
}
window.renderTextWithMentions = renderTextWithMentions;

// Validate and recalculate mention indices to match actual text
// Handles trim offsets and text modifications robustly
function extractMentionsFromText(text, mentionsList) {
  if (!mentionsList || mentionsList.length === 0) return [];
  if (!text) return [];

  const validMentions = [];

  for (const m of mentionsList) {
    const mentionStr = '@' + m.displayName;

    // 1. Try exact index match first (fast path)
    const segment = text.slice(m.startIndex, m.endIndex);
    if (segment === mentionStr) {
      validMentions.push({ ...m });
      continue;
    }

    // 2. Fallback: search for the mention string in the text
    // This handles cases where .trim() shifted indices
    const idx = text.indexOf(mentionStr);
    if (idx !== -1) {
      // Verify this position isn't already claimed by another valid mention
      const alreadyClaimed = validMentions.some(
        vm => idx >= vm.startIndex && idx < vm.endIndex
      );
      if (!alreadyClaimed) {
        validMentions.push({
          uid: m.uid,
          displayName: m.displayName,
          startIndex: idx,
          endIndex: idx + mentionStr.length
        });
      }
    }
  }

  return validMentions;
}

// Send mention notifications to all mentioned users
async function sendMentionNotifications(mentions, context) {
  if (!mentions || mentions.length === 0) return;

  const notifiedUids = new Set();
  for (const mention of mentions) {
    if (notifiedUids.has(mention.uid)) continue;
    if (mention.uid === currentUser?.uid) continue; // Don't notify yourself
    notifiedUids.add(mention.uid);

    const typeText = context.type === 'post' ? 'una publicación' :
                     context.type === 'comment' ? 'un comentario' :
                     'una respuesta';

    await createNotification(
      mention.uid,
      'mention',
      `te mencionó en ${typeText}`,
      { postId: context.postId || '' }
    );
  }
}

// MentionAutocomplete class - attaches to any input or textarea
class MentionAutocomplete {
  constructor(inputElement, options = {}) {
    this.input = inputElement;
    this.mentions = [];
    this.dropdown = null;
    this.searchTimeout = null;
    this.selectedIndex = -1;
    this.isOpen = false;
    this.mentionStart = -1;
    this.results = [];
    this.positionBelow = options.positionBelow || false;

    this._init();
  }

  _init() {
    // Create dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'mention-dropdown' + (this.positionBelow ? ' mention-dropdown-below' : '');

    // Insert dropdown in the input's parent (which should have position:relative)
    const parent = this.input.closest('form') || this.input.parentElement;
    if (parent) {
      parent.appendChild(this.dropdown);
    }

    // Bind event listeners
    this._onInputBound = this._onInput.bind(this);
    this._onKeyDownBound = this._onKeyDown.bind(this);
    this._onBlurBound = this._onBlur.bind(this);

    this.input.addEventListener('input', this._onInputBound);
    this.input.addEventListener('keydown', this._onKeyDownBound);
    this.input.addEventListener('blur', this._onBlurBound);

    // Store reference on the element
    this.input._mentionAutocomplete = this;
  }

  _onInput() {
    const cursorPos = this.input.selectionStart;
    const text = this.input.value;

    // Find the last @ before cursor that isn't preceded by a word char
    let atIndex = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (text[i] === '@') {
        // Check it's at start or preceded by whitespace
        if (i === 0 || /\s/.test(text[i - 1])) {
          atIndex = i;
        }
        break;
      }
      // If we hit whitespace before finding @, stop
      if (/\s/.test(text[i]) && i < cursorPos - 1) break;
    }

    if (atIndex === -1) {
      this._hide();
      return;
    }

    const query = text.slice(atIndex + 1, cursorPos);

    // Need at least 1 character to search
    if (query.length < 1) {
      this._hide();
      return;
    }

    this.mentionStart = atIndex;

    // Debounce search
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this._searchUsers(query);
    }, 300);
  }

  _onKeyDown(e) {
    if (!this.isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.results.length - 1);
      this._updateSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this._updateSelection();
    } else if (e.key === 'Enter' && this.selectedIndex >= 0) {
      e.preventDefault();
      e.stopPropagation();
      this._selectUser(this.results[this.selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this._hide();
    }
  }

  _onBlur() {
    // Delay hide to allow click on dropdown items
    setTimeout(() => {
      this._hide();
    }, 200);
  }

  async _searchUsers(query) {
    this.dropdown.innerHTML = '<div class="mention-dropdown-loading">Buscando...</div>';
    this._show();

    try {
      const users = await searchUsersGlobal(query);
      this.results = users || [];

      if (this.results.length === 0) {
        this.dropdown.innerHTML = '<div class="mention-dropdown-empty">Sin resultados</div>';
        return;
      }

      this.selectedIndex = 0;
      this._renderResults();
    } catch (error) {
      console.error('Error searching users for mention:', error);
      this._hide();
    }
  }

  _renderResults() {
    const html = this.results.map((user, index) => {
      const photoUrl = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}&background=10b981&color=fff&size=32`;
      const name = escapeHtmlMention(user.displayName || 'Usuario');
      return `
        <div class="mention-dropdown-item ${index === this.selectedIndex ? 'selected' : ''}" data-index="${index}">
          <img src="${photoUrl}" alt="${name}" class="mention-dropdown-avatar" referrerPolicy="no-referrer" onerror="this.src='https://ui-avatars.com/api/?name=U&background=10b981&color=fff&size=32'; this.onerror=null;">
          <div class="mention-dropdown-info">
            <span class="mention-dropdown-name">${name}</span>
          </div>
        </div>
      `;
    }).join('');

    this.dropdown.innerHTML = html;

    // Attach click handlers
    this.dropdown.querySelectorAll('.mention-dropdown-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent blur
        const idx = parseInt(item.dataset.index);
        this._selectUser(this.results[idx]);
      });
    });
  }

  _updateSelection() {
    this.dropdown.querySelectorAll('.mention-dropdown-item').forEach((item, i) => {
      item.classList.toggle('selected', i === this.selectedIndex);
    });

    // Scroll selected item into view
    const selected = this.dropdown.querySelector('.mention-dropdown-item.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  _selectUser(user) {
    if (!user) return;

    const text = this.input.value;
    const cursorPos = this.input.selectionStart;
    const displayName = user.displayName || 'Usuario';

    // Replace @query with @displayName
    const before = text.slice(0, this.mentionStart);
    const after = text.slice(cursorPos);
    const mentionText = '@' + displayName;
    const newText = before + mentionText + ' ' + after;

    this.input.value = newText;

    // Set cursor position after the mention + space
    const newCursorPos = this.mentionStart + mentionText.length + 1;
    this.input.setSelectionRange(newCursorPos, newCursorPos);

    // Recalculate indices for existing mentions that come after insertion
    const insertedLength = (mentionText + ' ').length;
    const removedLength = cursorPos - this.mentionStart;
    const delta = insertedLength - removedLength;

    this.mentions.forEach(m => {
      if (m.startIndex >= this.mentionStart) {
        m.startIndex += delta;
        m.endIndex += delta;
      }
    });

    // Store mention
    this.mentions.push({
      uid: user.id,
      displayName: displayName,
      startIndex: this.mentionStart,
      endIndex: this.mentionStart + mentionText.length
    });

    this._hide();

    // Trigger input event for any listeners (like char count)
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  _show() {
    this.isOpen = true;
    this.dropdown.classList.add('active');
  }

  _hide() {
    this.isOpen = false;
    this.selectedIndex = -1;
    this.results = [];
    this.dropdown.classList.remove('active');
    clearTimeout(this.searchTimeout);
  }

  getMentions() {
    return [...this.mentions];
  }

  clearMentions() {
    this.mentions = [];
  }

  destroy() {
    this.input.removeEventListener('input', this._onInputBound);
    this.input.removeEventListener('keydown', this._onKeyDownBound);
    this.input.removeEventListener('blur', this._onBlurBound);
    if (this.dropdown && this.dropdown.parentNode) {
      this.dropdown.parentNode.removeChild(this.dropdown);
    }
    this.input._mentionAutocomplete = null;
  }
}
window.MentionAutocomplete = MentionAutocomplete;

// ================== CREATE POST ==================
let postData = {
  text: '',
  photos: [],
  video: null,
  ascent: null,
  location: null
};
let postMentionAutocomplete = null;

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

  // Attach mention autocomplete to post textarea (dropdown appears below)
  if (textarea && !textarea._mentionAutocomplete) {
    postMentionAutocomplete = new MentionAutocomplete(textarea, { positionBelow: true });
  }

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
  if (postMentionAutocomplete) postMentionAutocomplete.clearMentions();
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
      // Validate and store mentions
      if (postMentionAutocomplete) {
        const validMentions = extractMentionsFromText(postData.text.trim(), postMentionAutocomplete.getMentions());
        if (validMentions.length > 0) {
          postDataToSave.mentions = validMentions;
          // Store array of mentioned user IDs for efficient querying
          postDataToSave.mentionedUserIds = validMentions.map(m => m.uid);
        }
      }
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

    const docRef = await db.collection('posts').add(postDataToSave);

    // Send mention notifications
    if (postDataToSave.mentions && postDataToSave.mentions.length > 0) {
      sendMentionNotifications(postDataToSave.mentions, { type: 'post', postId: docRef.id });
    }

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
            <p class="feed-text-body" data-post-id="${post.id || ''}">${renderTextWithMentions(textContent, post.mentions)}</p>
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

  // If inside modal (no .feed-card), scroll to and focus the comment input
  if (!card) {
    const modalBody = button.closest('.view-post-body');
    if (modalBody) {
      const commentInput = modalBody.querySelector('.feed-comment-input');
      if (commentInput) {
        commentInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        commentInput.focus();
      }
    }
    return;
  }

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

    // Focus on input and attach mention autocomplete
    const input = commentsSection.querySelector('.feed-comment-input');
    if (input) {
      if (!input._mentionAutocomplete) {
        new MentionAutocomplete(input);
      }
      input.focus();
    }
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
              <p class="feed-comment-text" data-comment-id="${doc.id}">${renderTextWithMentions(comment.text || '', comment.mentions)}</p>
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
      input.value = '';
      // Attach mention autocomplete if not already attached
      if (!input._mentionAutocomplete) {
        new MentionAutocomplete(input);
      } else {
        input._mentionAutocomplete.clearMentions();
      }
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

    // Extract mentions from autocomplete
    const replyInput = form?.querySelector('.feed-comment-reply-input');
    const mentionAC = replyInput?._mentionAutocomplete;
    const mentions = mentionAC ? mentionAC.getMentions() : [];
    const validMentions = extractMentionsFromText(cleanText, mentions);

    // Crear objeto para guardar en Firestore
    const replyData = {
      text: cleanText,
      userId: currentUser.uid,
      userName: currentUser.displayName || 'Usuario',
      userPhoto: userPhotoURL,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      likes: []
    };
    if (validMentions.length > 0) {
      replyData.mentions = validMentions;
    }

    // AÃ±adir replyToUserName si existe
    if (replyToUserName) {
      replyData.replyToUserName = replyToUserName;
    }

    // Create reply in subcollection
    const replyRef = db.collection('posts').doc(postId).collection('comments').doc(commentId).collection('replies');
    const newReplyDoc = await replyRef.add(replyData);

    // Get parent comment data to notify its author
    const commentRef = db.collection('posts').doc(postId).collection('comments').doc(commentId);
    const commentDoc = await commentRef.get();
    const commentData = commentDoc.exists ? commentDoc.data() : null;

    // Update repliesCount on parent comment
    await commentRef.update({
      repliesCount: firebase.firestore.FieldValue.increment(1)
    });

    // Send reply notification to the comment author
    if (commentData && commentData.userId && commentData.userId !== currentUser.uid) {
      createNotification(commentData.userId, 'reply', `respondió a tu comentario`, { postId, commentId, replyId: newReplyDoc.id });
    }

    // Hide reply form and clear mentions
    form?.classList.add('hidden');
    if (mentionAC) mentionAC.clearMentions();

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

    // Send mention notifications
    if (validMentions.length > 0) {
      sendMentionNotifications(validMentions, { type: 'reply', postId });
    }
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
            <p class="feed-comment-text">${renderTextWithMentions(reply.text || '', reply.mentions)}</p>
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
      input.value = '';
      // Attach mention autocomplete if not already attached
      if (!input._mentionAutocomplete) {
        new MentionAutocomplete(input);
      } else {
        input._mentionAutocomplete.clearMentions();
      }
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

    // Extract mentions from autocomplete
    const replyInput = form?.querySelector('.feed-comment-reply-input');
    const mentionAC = replyInput?._mentionAutocomplete;
    const mentions = mentionAC ? mentionAC.getMentions() : [];
    const validMentions = extractMentionsFromText(cleanText, mentions);

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
    if (validMentions.length > 0) {
      replyData.mentions = validMentions;
    }

    // AÃ±adir replyToUserName si existe
    if (replyToUserName) {
      replyData.replyToUserName = replyToUserName;
    }

    // Save to the SAME subcollection as the parent comment's replies (no sub-sub-collections)
    const repliesRef = db.collection('posts').doc(postId).collection('comments').doc(parentCommentId).collection('replies');
    const newReplyDoc = await repliesRef.add(replyData);

    // Get the reply being responded to, to notify its author
    const replyToDoc = await db.collection('posts').doc(postId).collection('comments').doc(parentCommentId).collection('replies').doc(replyToId).get();
    const replyToData = replyToDoc.exists ? replyToDoc.data() : null;

    // Update repliesCount on parent comment
    const commentRef = db.collection('posts').doc(postId).collection('comments').doc(parentCommentId);
    await commentRef.update({
      repliesCount: firebase.firestore.FieldValue.increment(1)
    });

    // Send reply notification to the author of the reply being responded to
    if (replyToData && replyToData.userId && replyToData.userId !== currentUser.uid) {
      createNotification(replyToData.userId, 'reply', `respondió a tu comentario`, { postId, commentId: parentCommentId, replyId: newReplyDoc.id });
    }

    // Hide the reply form and clear mentions
    if (form) {
      form.classList.add('hidden');
      const input = form.querySelector('.feed-comment-reply-input');
      if (input) {
        input.value = '';
      }
      if (mentionAC) mentionAC.clearMentions();
    }

    // Reload replies to show the new one
    await loadReplies(postId, parentCommentId, container);

    showToast('Respuesta publicada', 'success');

    // Send mention notifications
    if (validMentions.length > 0) {
      sendMentionNotifications(validMentions, { type: 'reply', postId });
    }
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

    // Extract mentions from autocomplete
    const mentionAC = input?._mentionAutocomplete;
    const mentions = mentionAC ? mentionAC.getMentions() : [];
    const validMentions = extractMentionsFromText(text, mentions);

    // Build comment data
    const commentData = {
      userId: currentUser.uid,
      userName: currentUser.displayName || 'Usuario',
      userPhoto: currentUser.photoURL || '',
      text: text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (validMentions.length > 0) {
      commentData.mentions = validMentions;
    }

    // Add comment to Firestore subcollection
    const newCommentDoc = await db.collection('posts').doc(postId).collection('comments').add(commentData);

    // Atomically increment commentsCount in the parent post document
    await db.collection('posts').doc(postId).update({
      commentsCount: firebase.firestore.FieldValue.increment(1)
    });

    // Clear input and mentions
    input.value = '';
    input.disabled = false;
    if (mentionAC) mentionAC.clearMentions();

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
      createNotification(postData.userId, 'comment', `comentó en tu publicación`, { postId, commentId: newCommentDoc.id });
    }

    // Send mention notifications
    if (validMentions.length > 0) {
      sendMentionNotifications(validMentions, { type: 'comment', postId });
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
async function openPostModal(postId, targetCommentId, targetReplyId) {
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

    // Load comments section inside modal
    await loadModalComments(postId, body, targetCommentId, targetReplyId);

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

  const userName = post.userName || post.user || 'Usuario';
  const userPhoto = post.userPhoto || post.avatar || '';

  // Extract location name
  let locationName = '';
  if (post.location) {
    if (typeof post.location === 'object' && post.location.name) {
      locationName = post.location.name;
    } else if (typeof post.location === 'string') {
      locationName = post.location;
    }
  } else if (post.locationName) {
    locationName = post.locationName;
  }

  // Header - Matches feed card layout: avatar, user+time, location, three-dot menu
  const headerHTML = `
    <div class="feed-card-header" style="padding: 16px; border-bottom: 1px solid #f3f4f6; position: relative;">
      <img src="${userPhoto || generateAvatarFallback(userName, 200)}" alt="${userName}" class="feed-avatar" referrerPolicy="no-referrer" onerror="this.src='${generateAvatarFallback(userName, 200)}'; this.onerror=null;">
      <div class="feed-header-content">
        <div class="feed-header-row">
          <span class="feed-username">${userName}</span>
          <span class="feed-dot">&middot;</span>
          <span class="feed-time">${post.time || 'Ahora'}</span>
        </div>
        ${locationName ? `<div class="feed-location-text">📍 ${locationName}</div>` : ''}
      </div>
      ${currentUser ? `
        <div class="feed-post-menu-wrapper">
          <button class="feed-post-menu-btn modal-post-menu-btn"
                  data-post-id="${postId}"
                  data-is-owner="${isAuthor}"
                  title="Opciones">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="1"></circle>
              <circle cx="19" cy="12" r="1"></circle>
              <circle cx="5" cy="12" r="1"></circle>
            </svg>
          </button>
          <div class="feed-post-menu-dropdown hidden" data-post-id="${postId}">
            ${isAuthor ? `
              <button class="feed-post-menu-item modal-menu-action" data-action="edit" data-post-id="${postId}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>Editar</span>
              </button>
              <button class="feed-post-menu-item feed-post-menu-item-danger modal-menu-action" data-action="delete" data-post-id="${postId}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>Borrar</span>
              </button>
            ` : `
              <button class="feed-post-menu-item modal-menu-action" data-action="share" data-post-id="${postId}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="18" cy="5" r="3"></circle>
                  <circle cx="6" cy="12" r="3"></circle>
                  <circle cx="18" cy="19" r="3"></circle>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
                <span>Compartir</span>
              </button>
              <button class="feed-post-menu-item feed-post-menu-item-danger modal-menu-action" data-action="report" data-post-id="${postId}">
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
          <p class="feed-text-body">${renderTextWithMentions(post.content, post.mentions)}</p>
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
          <p class="feed-text-body">${renderTextWithMentions(post.content, post.mentions)}</p>
        </div>
      `;
    }
  } else if (post.type === 'text' || post.content) {
    contentHTML = `
      <div class="feed-text-content" style="padding: 24px;">
        ${post.title ? `<h3 class="feed-text-title" style="margin: 0 0 12px; font-size: 20px; font-weight: 700;">${post.title}</h3>` : ''}
        <p class="feed-text-body" style="margin: 0; font-size: 16px; line-height: 1.6; white-space: pre-wrap;">${renderTextWithMentions(post.content || '', post.mentions)}</p>
      </div>
    `;
  }

  // Support both array (new) and number (legacy) format for likes
  const likesArray = post.likes;
  const likesCount = post.likesCount || (Array.isArray(likesArray) ? likesArray.length : (typeof likesArray === 'number' ? likesArray : 0));
  const commentsCount = post.commentsCount || 0;

  const formatCount = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num > 0 ? num.toString() : '';
  };

  const likeColor = post.liked ? '#ef4444' : 'none';
  const likeStroke = post.liked ? '#ef4444' : 'currentColor';

  // Actions bar - matching feed card layout (like + count, comment + count)
  const actionsHTML = `
    <div class="feed-actions-bar modal-actions-bar">
      <button class="feed-action-btn ${post.liked ? 'liked' : ''}" data-action="like" data-post-id="${post.id || ''}">
        <svg viewBox="0 0 24 24" fill="${likeColor}" stroke="${likeStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
        <span class="feed-action-count">${likesCount > 0 ? formatCount(likesCount) : ''}</span>
      </button>
      <button class="feed-action-btn" data-action="comment" data-post-id="${post.id || ''}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
        </svg>
        <span class="feed-action-count">${commentsCount > 0 ? formatCount(commentsCount) : ''}</span>
      </button>
    </div>
  `;

  container.innerHTML = headerHTML + contentHTML + actionsHTML;

  // Attach three-dot menu listeners in modal
  const menuBtn = container.querySelector('.modal-post-menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = container.querySelector(`.feed-post-menu-dropdown[data-post-id="${postId}"]`);
      if (dropdown) {
        dropdown.classList.toggle('hidden');
      }
    });
  }

  // Attach menu action listeners (edit, delete, share, report)
  container.querySelectorAll('.modal-menu-action').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;

      // Close dropdown
      const dropdown = item.closest('.feed-post-menu-dropdown');
      if (dropdown) dropdown.classList.add('hidden');

      if (action === 'edit') {
        enablePostEditMode(post, container);
      } else if (action === 'delete') {
        confirmDeletePost(postId, post);
      } else if (action === 'share') {
        await handleFeedShare(postId);
      } else if (action === 'report') {
        await handleReportPost(postId);
      }
    });
  });

  // Close dropdown on outside click
  const closeModalDropdown = (e) => {
    if (!e.target.closest('.feed-post-menu-wrapper')) {
      container.querySelectorAll('.feed-post-menu-dropdown').forEach(dd => {
        dd.classList.add('hidden');
      });
    }
  };
  document.addEventListener('click', closeModalDropdown);

  // Clean up listener when modal is closed
  const modal = document.getElementById('view-post-modal');
  if (modal) {
    const observer = new MutationObserver(() => {
      if (modal.classList.contains('hidden')) {
        document.removeEventListener('click', closeModalDropdown);
        observer.disconnect();
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }
}

// Load comments inside the post modal with deep-link support
async function loadModalComments(postId, container, targetCommentId, targetReplyId) {
  // Create comments section container
  const commentsSection = document.createElement('div');
  commentsSection.className = 'modal-comments-section';
  commentsSection.innerHTML = `
    <div style="padding: 12px 16px 8px; border-top: 1px solid #f3f4f6;">
      <h4 style="margin: 0; font-size: 15px; font-weight: 600; color: #374151;">Comentarios</h4>
    </div>
    <div class="feed-comments-section" data-post-id="${postId}" style="display: block;">
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
  container.appendChild(commentsSection);

  // Setup comment form submission
  const form = commentsSection.querySelector('.feed-comment-form');
  const input = commentsSection.querySelector('.feed-comment-input');
  if (input && !input._mentionAutocomplete) {
    new MentionAutocomplete(input);
  }
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleInlineCommentSubmit(postId, form);
    });
  }

  // Load comments
  const commentsList = commentsSection.querySelector('.feed-comments-list');
  if (commentsList) {
    await loadInlineComments(postId, commentsList);
    commentsList.dataset.loaded = 'true';
  }

  // Deep-link: position target comment in viewport instantly (no delayed animation)
  if (targetCommentId && commentsList) {
    await scrollToTargetComment(commentsList, targetCommentId, targetReplyId);
  }
}

// Scroll to a specific comment (or reply) inside a comments list, highlight it, and expand replies if needed
async function scrollToTargetComment(commentsList, targetCommentId, targetReplyId) {
  const commentEl = commentsList.querySelector(`.feed-comment-item[data-comment-id="${targetCommentId}"]`);
  if (!commentEl) return;

  if (targetReplyId) {
    // Need to expand replies first, then position the specific reply in viewport
    const viewRepliesBtn = commentEl.querySelector('.feed-comment-view-replies');
    const repliesContainer = commentsList.querySelector(`.feed-comment-replies[data-comment-id="${targetCommentId}"]`);

    if (repliesContainer) {
      // Expand replies immediately (thread already visible)
      repliesContainer.classList.remove('hidden');
      if (viewRepliesBtn) {
        viewRepliesBtn.querySelector('svg')?.setAttribute('style', 'transform: rotate(180deg)');
      }

      // Load replies if not loaded yet
      if (!repliesContainer.dataset.loaded) {
        const postId = commentEl.dataset.postId;
        await loadReplies(postId, targetCommentId, repliesContainer);
        repliesContainer.dataset.loaded = 'true';
      }

      // Position reply in viewport instantly
      requestAnimationFrame(() => {
        const replyEl = repliesContainer.querySelector(`.feed-reply-item[data-reply-id="${targetReplyId}"]`);
        if (replyEl) {
          replyEl.scrollIntoView({ behavior: 'instant', block: 'center' });
        } else {
          commentEl.scrollIntoView({ behavior: 'instant', block: 'center' });
        }
      });
    }
  } else {
    // Position comment in viewport instantly
    commentEl.scrollIntoView({ behavior: 'instant', block: 'center' });
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
  // Toggle Roca / Rocódromo
  let currentActivityMode = 'roca';
  document.querySelectorAll('.act-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentActivityMode = btn.dataset.mode;
      document.querySelectorAll('.act-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('content-roca').style.display = currentActivityMode === 'roca' ? '' : 'none';
      document.getElementById('content-rocodromo').style.display = currentActivityMode === 'rocodromo' ? '' : 'none';
    });
  });

  // Timeline filter chips
  document.querySelectorAll('.act-tf').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.act-tf').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      filterActivitySessions(chip.dataset.filter);
    });
  });

  // FAB nueva ascensión
  const fabBtn = document.getElementById('new-ascent-btn');
  if (fabBtn) {
    fabBtn.addEventListener('click', () => {
      if (currentActivityMode === 'rocodromo') {
        openNewGymAscent();
      } else {
        showToast('Funcionalidad de nueva ascensión próximamente', 'info');
      }
    });
  }

  // Período selector (legacy, mantener por compatibilidad)
  initPeriodSelector();

  // Load user activity data
  loadActivityData();

  // Start live test header subscriptions
  initTestHeader();
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
  const chartContainer = document.getElementById('activity-chart');
  if (!chartContainer) return;

  const now = new Date();
  const nowY = now.getFullYear();
  const nowM = now.getMonth();
  const ascents = cachedAscentsForHistogram;

  let data = [];

  if (period === 'week') {
    const dayOfWeek = now.getDay(); // 0=Sun
    const mondayOffset = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() + mondayOffset);

    const dayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    data = dayLabels.map((label, i) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      const dY = day.getFullYear(), dM = day.getMonth(), dD = day.getDate();
      const count = ascents.filter(a => {
        const d = parseAscentDate(a.date);
        return d && d.getFullYear() === dY && d.getMonth() === dM && d.getDate() === dD;
      }).length;
      return { label, value: count };
    });

  } else if (period === 'month') {
    const weekRanges = [[1, 7], [8, 14], [15, 21], [22, 31]];
    data = weekRanges.map(([start, end], i) => {
      const count = ascents.filter(a => {
        const d = parseAscentDate(a.date);
        if (!d) return false;
        const dom = d.getDate();
        return d.getFullYear() === nowY && d.getMonth() === nowM && dom >= start && dom <= end;
      }).length;
      return { label: 'S' + (i + 1), value: count };
    });

  } else {
    const monthLabels = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    data = monthLabels.map((label, m) => {
      const count = ascents.filter(a => {
        const d = parseAscentDate(a.date);
        return d && d.getFullYear() === nowY && d.getMonth() === m;
      }).length;
      return { label, value: count };
    });
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const maxValue = Math.max(...data.map(d => d.value), 1);

  chartContainer.innerHTML = data.map(item => {
    const height = (item.value / maxValue) * 100;
    const isHighlight = item.value === maxValue && item.value > 0;
    return '<div class="chart-bar-wrapper">' +
      '<div class="chart-bar ' + (isHighlight ? 'chart-bar-highlight' : '') + '"' +
      ' style="height: ' + height + '%;"' +
      ' data-value="' + item.value + '"></div>' +
      '<span class="chart-label">' + item.label + '</span>' +
      '</div>';
  }).join('');

  const avg = (total / data.length).toFixed(1);
  const chartTotal = document.getElementById('chart-total');
  const chartAvg = document.getElementById('chart-avg');
  if (chartTotal) chartTotal.textContent = total;
  if (chartAvg) chartAvg.textContent = avg;

  const summaryLabels = document.querySelectorAll('.summary-label');
  if (summaryLabels.length >= 2) {
    const periodLabels = {
      week: ['vías esta semana', 'media diaria'],
      month: ['vías este mes', 'media semanal'],
      year: ['vías este año', 'media mensual']
    };
    summaryLabels[0].textContent = periodLabels[period] ? periodLabels[period][0] : 'total';
    summaryLabels[1].textContent = periodLabels[period] ? periodLabels[period][1] : 'media';
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

const HISTOGRAM_GRADE_ORDER = ['4', '4+', '5a', '5b', '5c', '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+', '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a'];

// Single canonical date parser used by ALL filtering logic
function parseAscentDate(dateField) {
  if (!dateField) return null;
  const d = dateField.toDate ? dateField.toDate() : new Date(dateField);
  return isNaN(d.getTime()) ? null : d;
}

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

  renderEmptyHistogram();
  initHistogramTooltips();
}

function updateCombinedHistogram(ascents) {
  cachedAscentsForHistogram = ascents || [];

  const barsContainer = document.getElementById('histogram-bars');
  const xAxisContainer = document.getElementById('histogram-x-axis');
  const barLabelsContainer = document.getElementById('histogram-bar-labels');
  const svgLines = document.getElementById('histogram-lines');
  const gradeAxis = document.getElementById('histogram-grade-axis');
  const ascentAxis = document.getElementById('histogram-ascent-axis');

  if (!barsContainer || !svgLines) return;

  if (!ascents || ascents.length === 0) {
    renderEmptyHistogram();
    return;
  }

  const histogramData = processHistogramData(ascents, currentHistogramPeriod);

  const maxAscents = Math.max(...histogramData.map(d => d.ascents), 1);
  const allGradeIndices = histogramData.flatMap(d => [
    getGradeIndex(d.maxGrade), getGradeIndex(d.avgGrade), getGradeIndex(d.minGrade)
  ]).filter(i => i >= 0);

  if (allGradeIndices.length === 0) {
    renderEmptyHistogram();
    return;
  }

  const minGradeIdx = Math.max(0, Math.min(...allGradeIndices) - 2);
  const maxGradeIdx = Math.min(HISTOGRAM_GRADE_ORDER.length - 1, Math.max(...allGradeIndices) + 2);
  const gradeRange = maxGradeIdx - minGradeIdx || 1;

  updateGradeAxis(gradeAxis, minGradeIdx, maxGradeIdx);
  updateAscentAxis(ascentAxis, maxAscents);

  // Escalar las barras al mismo máximo redondeado que usa el eje Y derecho
  const { adjustedMax: ascentAxisMax } = computeAscentAxisMax(maxAscents);

  barsContainer.innerHTML = histogramData.map(item => {
    const height = ascentAxisMax > 0 ? (item.ascents / ascentAxisMax) * 100 : 0;
    return `<div class="histogram-bar-wrapper">
      <div class="histogram-bar" style="height: ${height}%;"></div>
    </div>`;
  }).join('');

  if (barLabelsContainer) {
    barLabelsContainer.innerHTML = histogramData.map(item =>
      `<span class="histogram-bar-count">${item.ascents > 0 ? item.ascents : ''}</span>`
    ).join('');
  }

  // En mobile con muchas barras, mostrar solo cada N etiquetas
  const isMobile = window.innerWidth <= 640;
  const labelStep = isMobile && histogramData.length > 15 ? (histogramData.length > 20 ? 5 : 3) : 1;
  xAxisContainer.innerHTML = histogramData.map((item, i) =>
    `<span class="histogram-x-label">${i % labelStep === 0 ? item.label : ''}</span>`
  ).join('');

  renderHistogramGrid(document.getElementById('histogram-grid'), minGradeIdx, maxGradeIdx);
  measureAndRenderLines(barsContainer, svgLines, histogramData, minGradeIdx, gradeRange);
}

function measureAndRenderLines(barsContainer, svgLines, histogramData, minGradeIdx, gradeRange, attempt) {
  attempt = attempt || 0;
  const chartArea = document.getElementById('histogram-chart-area');
  if (!chartArea) return;

  const doMeasure = () => {
    const areaRect = chartArea.getBoundingClientRect();
    // Si el área no es visible todavía, reintentar (máx 10 veces, ~300ms)
    if (areaRect.width === 0 && attempt < 10) {
      setTimeout(() => measureAndRenderLines(barsContainer, svgLines, histogramData, minGradeIdx, gradeRange, attempt + 1), 30);
      return;
    }
    const barEls = barsContainer.querySelectorAll('.histogram-bar');
    const xPositions = Array.from(barEls).map(el => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2 - areaRect.left;
    });
    renderHistogramLines(svgLines, histogramData, minGradeIdx, gradeRange, xPositions);
  };

  requestAnimationFrame(doMeasure);
}

function renderHistogramGrid(svg, minGradeIdx, maxGradeIdx) {
  if (!svg) return;
  const parent = svg.parentElement;
  const width = parent?.clientWidth || svg.clientWidth || 0;
  const height = parent?.clientHeight || svg.clientHeight || 0;
  if (!width || !height) {
    requestAnimationFrame(() => renderHistogramGrid(svg, minGradeIdx, maxGradeIdx));
    return;
  }
  const topPadding = 10;
  const effectiveHeight = height - 20;
  const range = (maxGradeIdx - minGradeIdx) || 1;

  // Limit grid lines to avoid clutter when range is large
  const maxLines = 8;
  const step = Math.max(1, Math.ceil(range / maxLines));

  let lines = '';
  for (let i = minGradeIdx; i <= maxGradeIdx; i += step) {
    const y = effectiveHeight - ((i - minGradeIdx) / range) * effectiveHeight + topPadding;
    lines += `<line class="histogram-grid-line" x1="0" y1="${y.toFixed(2)}" x2="${width}" y2="${y.toFixed(2)}"/>`;
  }
  svg.innerHTML = lines;
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
      const dY = date.getFullYear(), dM = date.getMonth(), dD = date.getDate();
      const dayAscents = (ascents || []).filter(a => {
        const ad = parseAscentDate(a.date);
        return ad && ad.getFullYear() === dY && ad.getMonth() === dM && ad.getDate() === dD;
      });
      data.push(processAscentsForPeriod(dayAscents, dayLabels[i]));
    }
  } else if (period === 'month') {
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dayAscents = (ascents || []).filter(a => {
        const ad = parseAscentDate(a.date);
        return ad && ad.getFullYear() === year && ad.getMonth() === month && ad.getDate() === day;
      });
      data.push(processAscentsForPeriod(dayAscents, day.toString()));
    }
  } else {
    const monthLabels = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    for (let i = 0; i < 12; i++) {
      const monthAscents = (ascents || []).filter(a => {
        const ad = parseAscentDate(a.date);
        return ad && ad.getFullYear() === now.getFullYear() && ad.getMonth() === i;
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

function computeAscentAxisMax(maxValue) {
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
  return { adjustedMax, step };
}

function updateAscentAxis(container, maxValue) {
  if (!container) return;
  const { adjustedMax, step } = computeAscentAxisMax(maxValue);
  const labels = [];
  for (let i = adjustedMax; i >= 0; i -= step) {
    labels.push(i);
  }
  container.innerHTML = labels.map(l => `<span class="y-label">${l}</span>`).join('');
}

function renderHistogramLines(svg, data, minGradeIdx, gradeRange, xPositions) {
  if (!svg || !data || data.length === 0) return;

  const parent = svg.parentElement;
  let height = parent?.clientHeight || svg.clientHeight;
  if (!height) {
    requestAnimationFrame(() => renderHistogramLines(svg, data, minGradeIdx, gradeRange, xPositions));
    return;
  }
  const effectiveHeight = height - 20;
  const topPadding = 10;

  const maxPts = [], avgPts = [], minPts = [];

  data.forEach((item, index) => {
    const x = xPositions ? xPositions[index] : 0;
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

  const maxPoints = maxPts.map((p, i) => `<circle class="histogram-point histogram-point-max" cx="${p.x}" cy="${p.y}" r="4" data-grade="${data.filter(d => d.maxGrade)[i]?.maxGrade || ''}" data-type="max"/>`).join('');
  const avgPoints = avgPts.map((p, i) => `<circle class="histogram-point histogram-point-avg" cx="${p.x}" cy="${p.y}" r="4" data-grade="${data.filter(d => d.avgGrade)[i]?.avgGrade || ''}" data-type="avg"/>`).join('');
  const minPoints = minPts.map((p, i) => `<circle class="histogram-point histogram-point-min" cx="${p.x}" cy="${p.y}" r="4" data-grade="${data.filter(d => d.minGrade)[i]?.minGrade || ''}" data-type="min"/>`).join('');

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

function renderEmptyHistogram() {
  const now = new Date();
  let slots = [];

  if (currentHistogramPeriod === 'week') {
    const dayLabels = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
    slots = dayLabels.map(label => ({ label }));
  } else if (currentHistogramPeriod === 'month') {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) slots.push({ label: day.toString() });
  } else {
    ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
      .forEach(label => slots.push({ label }));
  }

  const barsContainer = document.getElementById('histogram-bars');
  const xAxisContainer = document.getElementById('histogram-x-axis');
  const svgLines = document.getElementById('histogram-lines');
  const gradeAxis = document.getElementById('histogram-grade-axis');
  const ascentAxis = document.getElementById('histogram-ascent-axis');

  if (!barsContainer) return;

  updateGradeAxis(gradeAxis, getGradeIndex('5c'), getGradeIndex('7a'));
  updateAscentAxis(ascentAxis, 10);

  barsContainer.innerHTML = slots.map(() =>
    `<div class="histogram-bar-wrapper"><div class="histogram-bar" style="height: 0%;"></div></div>`
  ).join('');

  if (xAxisContainer) {
    xAxisContainer.innerHTML = slots.map(s =>
      `<span class="histogram-x-label">${s.label}</span>`
    ).join('');
  }

  if (svgLines) svgLines.innerHTML = '';

  renderHistogramGrid(document.getElementById('histogram-grid'), getGradeIndex('5c'), getGradeIndex('7a'));
}

// ========== HISTOGRAM TOOLTIPS ==========
function initHistogramTooltips() {
  const container = document.getElementById('combined-histogram-container');
  const tooltip = document.getElementById('histogram-tooltip');
  if (!container || !tooltip) return;

  const typeLabels = { max: 'Grado máximo', avg: 'Grado medio', min: 'Grado mínimo' };

  function placeTooltip(e) {
    const cRect = container.getBoundingClientRect();
    let left = e.clientX - cRect.left + 12;
    let top = e.clientY - cRect.top - 36;
    const tw = tooltip.offsetWidth || 90;
    if (left + tw > container.offsetWidth - 4) left = e.clientX - cRect.left - tw - 8;
    if (top < 4) top = e.clientY - cRect.top + 10;
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function showTooltip(text, e) {
    tooltip.textContent = text;
    tooltip.classList.remove('hidden');
    placeTooltip(e);
  }

  function hideTooltip() {
    tooltip.classList.add('hidden');
  }

  container.addEventListener('mouseleave', hideTooltip);

  // SVG points — delegated on the SVG
  const svgLines = document.getElementById('histogram-lines');
  if (svgLines) {
    svgLines.addEventListener('mousemove', e => {
      const pt = e.target.closest('.histogram-point');
      if (!pt) { hideTooltip(); return; }
      const grade = pt.dataset.grade;
      const type = pt.dataset.type;
      if (!grade) { hideTooltip(); return; }
      showTooltip((typeLabels[type] || 'Grado') + ': ' + grade, e);
    });
    svgLines.addEventListener('mouseleave', hideTooltip);
  }
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
    renderEmptyGradeDistribution();
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
    renderEmptyGradeDistribution();
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

  const nowY = now.getFullYear(), nowM = now.getMonth();

  return ascents.filter(ascent => {
    const ad = parseAscentDate(ascent.date);
    if (!ad) return false;

    if (period === 'week') {
      const currentDay = now.getDay();
      const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      return ad >= monday && ad <= sunday;
    } else if (period === 'month') {
      return ad.getFullYear() === nowY && ad.getMonth() === nowM;
    } else {
      return ad.getFullYear() === nowY;
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

function renderEmptyGradeDistribution() {
  const barsContainer = document.getElementById('grade-distribution-bars');
  const xAxisContainer = document.getElementById('grade-distribution-x-axis');
  const yAxisContainer = document.getElementById('grade-distribution-y-axis');

  if (!barsContainer) return;
  barsContainer.innerHTML = '<p class="chart-empty-msg">Sin ascensiones registradas</p>';
  if (xAxisContainer) xAxisContainer.innerHTML = '';
  if (yAxisContainer) yAxisContainer.innerHTML = '';
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initCombinedHistogram();
  initHistogramCarousel();
  renderEmptyGradeDistribution();
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
      const emptyState = document.getElementById('activity-empty');
      if (emptyState) emptyState.style.display = 'flex';
      resetAllStats();
      buildGymMisRocodromos([]);
      return;
    }

    const now = new Date();
    const nowY = now.getFullYear();
    const nowM = now.getMonth();
    const nowD = now.getDate();

    // Process all ascents and filter by period using local date components
    // Build all three buckets in one pass — same parseAscentDate used everywhere
    const allAscents = [], yearAscents = [], monthAscents = [], dayAscents = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const ascentData = { id: doc.id, ...data };
      allAscents.push(ascentData);

      const d = parseAscentDate(data.date);
      if (!d) return;
      if (d.getFullYear() !== nowY) return;
      yearAscents.push(ascentData);
      if (d.getMonth() !== nowM) return;
      monthAscents.push(ascentData);
      if (d.getDate() === nowD) dayAscents.push(ascentData);
    });

    // Strict period filtering: show only data for the selected period.
    // If empty, calculateAndUpdateStats shows zeros — no fallback to a broader period.
    let statsAscents;
    switch (currentStatsPeriod) {
      case 'day':   statsAscents = dayAscents;   break;
      case 'year':  statsAscents = yearAscents;  break;
      case 'month':
      default:      statsAscents = monthAscents; break;
    }
    calculateAndUpdateStats(statsAscents);

    // Build new activity components from real data
    requestAnimationFrame(() => {
      buildActivityHeroCard(allAscents, yearAscents);
      buildActivityPyramid(allAscents);
      buildGymPyramid(allAscents);
      buildActivityHeatmap(allAscents);
      buildGymStats(allAscents);
      buildGymMisRocodromos(allAscents);
      updateActivityRecords(allAscents);
      updateCombinedHistogram(allAscents);
      renderProgressCards(_pcCurrentPeriod || 'month', allAscents);
      updatePcTimeNav(_pcCurrentPeriod || 'month');
      const activeChartTab = document.querySelector('.chart-tab.active');
      updateActivityChart(activeChartTab ? activeChartTab.dataset.chart : 'week');
    });

    // Activity list grouped by session
    renderActivityList(allAscents.slice(0, 100));

    // Show/hide empty state
    const emptyState = document.getElementById('activity-empty');
    if (emptyState) {
      emptyState.style.display = allAscents.length === 0 ? 'flex' : 'none';
    }

  } catch (error) {
    console.error('Error loading activity data:', error);
  }
}

// ========================================
// ACTIVITY REDESIGN — New builder functions
// ========================================

// GRADE_ORDER already declared at top of file — reuse it

function isGymAscent(ascent) {
  const type = (ascent.climbType || ascent.type || '').toLowerCase();
  const school = (ascent.schoolName || ascent.school || '').toLowerCase();
  return type === 'indoor' || type === 'boulder'
    || school.includes('rocódromo') || school.includes('rocodromo')
    || school.includes('gym') || school.includes('indoor')
    || school.includes('boulder') || school.includes('escalada');
}

// ============================================
// GYM PICKER — selector de rocódromo para nueva ascensión libre
// ============================================

const MIN_GYM_NEARBY_M = 1000; // metros: distancia máxima para auto-detectar gym

let _gymPickerSchoolsCache = null; // caché de pending_schools aprobados
let _gymPickerSelectedId   = null;
let _gymPickerSelectedName = null;
let _gymPickerSelectedCity = null;

function _haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function _loadPendingSchools() {
  if (_gymPickerSchoolsCache) return _gymPickerSchoolsCache;
  try {
    const snap = await db.collection('pending_schools').where('status', '==', 'approved').get();
    _gymPickerSchoolsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    _gymPickerSchoolsCache = [];
  }
  return _gymPickerSchoolsCache;
}

async function _reverseGeocodeCity(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    if (!res.ok) return '';
    const data = await res.json();
    return data.address?.city || data.address?.town || data.address?.village || data.address?.municipality || '';
  } catch {
    return '';
  }
}

function _gymGradeOptions(type) {
  const grades = type === 'boulder' ? GYM_BOULDER_GRADES : GYM_VIA_GRADES;
  return grades.map(g => `<option value="${g}">${g}</option>`).join('');
}

function _populateGymGradeSelect(type) {
  const sel = document.getElementById('gm-grade-select');
  if (!sel) return;
  sel.innerHTML = _gymGradeOptions(type);
  // Default to a mid-range grade
  const mid = type === 'boulder' ? '6B' : '6b';
  if (sel.querySelector(`option[value="${mid}"]`)) sel.value = mid;
}

function openNewGymAscent() {
  if (typeof openAscentModal !== 'function') return;

  const modal  = document.getElementById('ascent-modal');
  const form   = document.getElementById('ascent-form');
  const title  = document.getElementById('ascent-modal-title');
  if (!modal || !form) return;

  // Reset the form first via a lightweight close
  form.reset();
  delete form.dataset.ascentId;
  delete form.dataset.editMode;
  delete form.dataset.routeId;

  // Reset hidden fields
  document.getElementById('ascent-school-id').value   = '';
  document.getElementById('ascent-school-name').value  = '';
  document.getElementById('ascent-route-name').value   = '';
  document.getElementById('ascent-grade').value        = '';
  document.getElementById('ascent-sector').value       = '';
  document.getElementById('ascent-school-city').value  = '';
  document.getElementById('ascent-climb-type').value   = 'indoor';

  _gymPickerSelectedId   = null;
  _gymPickerSelectedName = null;
  _gymPickerSelectedCity = null;

  // Gym mode flag
  form.dataset.gymMode = 'true';

  // Show gym fields, hide static route display
  document.getElementById('route-display-group')?.classList.add('hidden');
  ['gm-gym-group', 'gm-type-group', 'gm-grade-group', 'gm-route-group'].forEach(id => {
    document.getElementById(id)?.classList.remove('hidden');
  });

  // Populate grade select (default: via)
  _populateGymGradeSelect('via');

  // Reset gym label
  const lbl = document.getElementById('gm-gym-label');
  if (lbl) lbl.textContent = 'Selecciona un rocódromo';

  // Pre-fill today's date
  const dateInput = document.getElementById('ascent-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.max = today;
    dateInput.value = today;
  }

  // Reset style dropdown to redpoint
  document.getElementById('ascent-style').value = 'redpoint';
  document.querySelectorAll('.style-dropdown-menu .style-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.value === 'redpoint');
  });
  const styleToggle = document.getElementById('style-dropdown-toggle');
  if (styleToggle) {
    styleToggle.querySelector('.style-icon').textContent = '🔴';
    styleToggle.querySelector('.style-dropdown-label').innerHTML = '<strong>Redpoint</strong> — Encadenada tras haberla probado antes';
  }

  if (title) title.textContent = 'Nueva sesión rocódromo';

  modal.classList.remove('hidden');

  // Wire up gym picker trigger (once)
  const trigger = document.getElementById('gm-gym-trigger');
  if (trigger && !trigger._gymPickerWired) {
    trigger._gymPickerWired = true;
    trigger.addEventListener('click', openGymPickerSheet);
  }

  // Wire up type toggle (once)
  const typeSeg = document.getElementById('gm-type-seg');
  if (typeSeg && !typeSeg._wired) {
    typeSeg._wired = true;
    typeSeg.addEventListener('click', e => {
      const btn = e.target.closest('.gm-type-btn');
      if (!btn) return;
      typeSeg.querySelectorAll('.gm-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const gtype = btn.dataset.gtype;
      document.getElementById('ascent-climb-type').value = gtype === 'boulder' ? 'boulder' : 'indoor';
      _populateGymGradeSelect(gtype);
    });
  }
}

function openGymPickerSheet() {
  const sheet = document.getElementById('gym-picker-sheet');
  if (!sheet) return;
  sheet.classList.remove('hidden');

  // Wire close button (once)
  const closeBtn = document.getElementById('gym-picker-close');
  if (closeBtn && !closeBtn._wired) {
    closeBtn._wired = true;
    closeBtn.addEventListener('click', closeGymPickerSheet);
  }
  sheet.addEventListener('click', e => {
    if (e.target === sheet) closeGymPickerSheet();
  }, { once: false });

  // Wire GPS button (once)
  const gpsBtn = document.getElementById('gym-picker-gps');
  if (gpsBtn && !gpsBtn._wired) {
    gpsBtn._wired = true;
    gpsBtn.addEventListener('click', detectGymByGPS);
  }

  // Wire search input
  const searchInput = document.getElementById('gym-picker-search');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
    if (!searchInput._wired) {
      searchInput._wired = true;
      searchInput.addEventListener('input', () => _renderGymPickerList(searchInput.value.trim()));
      searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const q = searchInput.value.trim();
          if (q) {
            selectGymFromPicker(q.toLowerCase().replace(/\s+/g, '_'), q, '');
          }
        }
      });
    }
  }

  _renderGymPickerList('');
}

function closeGymPickerSheet() {
  document.getElementById('gym-picker-sheet')?.classList.add('hidden');
}

async function _renderGymPickerList(query) {
  const listEl = document.getElementById('gym-picker-list');
  if (!listEl) return;

  // Gyms from user's own ascents
  const gymAscents = (_allActivityAscents || []).filter(a => isGymAscent(a));
  const seenIds = new Map();
  gymAscents.forEach(a => {
    const id = a.schoolId || a.schoolName?.toLowerCase().replace(/\s+/g, '_') || '';
    if (!id || seenIds.has(id)) return;
    seenIds.set(id, { id, name: a.schoolName || id, city: a.schoolCity || '' });
  });
  const pastGyms = [...seenIds.values()];

  // Schools from Firestore (load async, non-blocking)
  const schools = await _loadPendingSchools();

  // Merge: add Firestore schools not already in past gyms
  const allGyms = [...pastGyms];
  schools.forEach(s => {
    if (!allGyms.some(g => g.id === s.id)) {
      allGyms.push({ id: s.id, name: s.nombre || s.name || s.id, city: s.schoolCity || '' });
    }
  });

  // Filter by query
  const lq = query.toLowerCase();
  const filtered = query
    ? allGyms.filter(g => g.name.toLowerCase().includes(lq))
    : allGyms;

  if (filtered.length === 0 && !query) {
    listEl.innerHTML = '<div class="gym-picker-empty">Sin rocódromos visitados aún.<br>Escribe el nombre para añadir uno.</div>';
    return;
  }

  const items = filtered.map(g => {
    const citySpan = g.city ? `<span class="gym-picker-city">${g.city}</span>` : '';
    return `<div class="gym-picker-item" data-id="${g.id}" data-name="${g.name}" data-city="${g.city}">
      <div class="gym-picker-item-avatar">${g.name.slice(0, 2).toUpperCase()}</div>
      <div class="gym-picker-item-info">
        <div class="gym-picker-item-name">${g.name}</div>
        ${citySpan}
      </div>
    </div>`;
  });

  // If query doesn't match any, offer to create it
  if (query && !filtered.some(g => g.name.toLowerCase() === lq)) {
    items.push(`<div class="gym-picker-item gym-picker-add" data-id="" data-name="${query}" data-city="">
      <div class="gym-picker-item-avatar gym-picker-add-icon">+</div>
      <div class="gym-picker-item-info">
        <div class="gym-picker-item-name">Añadir "<strong>${query}</strong>"</div>
      </div>
    </div>`);
  }

  listEl.innerHTML = items.join('');
  listEl.querySelectorAll('.gym-picker-item').forEach(item => {
    item.addEventListener('click', () => {
      const id   = item.dataset.id || item.dataset.name.toLowerCase().replace(/\s+/g, '_');
      const name = item.dataset.name;
      const city = item.dataset.city;
      selectGymFromPicker(id, name, city);
    });
  });
}

function selectGymFromPicker(id, name, city) {
  _gymPickerSelectedId   = id;
  _gymPickerSelectedName = name;
  _gymPickerSelectedCity = city;

  document.getElementById('ascent-school-id').value  = id;
  document.getElementById('ascent-school-name').value = name;
  document.getElementById('ascent-school-city').value = city;

  const lbl = document.getElementById('gm-gym-label');
  if (lbl) lbl.textContent = name;

  closeGymPickerSheet();
}

async function detectGymByGPS() {
  const gpsBtn = document.getElementById('gym-picker-gps');
  if (!navigator.geolocation) {
    showToast('Geolocalización no disponible en este dispositivo', 'warning');
    return;
  }

  if (gpsBtn) {
    gpsBtn.disabled = true;
    gpsBtn.textContent = 'Obteniendo ubicación…';
  }

  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude: lat, longitude: lng } = pos.coords;

      // Reverse geocode for city
      const city = await _reverseGeocodeCity(lat, lng);

      // Find nearest school from Firestore schools
      const schools = await _loadPendingSchools();
      let nearest = null;
      let nearestDist = Infinity;
      schools.forEach(s => {
        if (!s.coordinates || s.coordinates.length < 2) return;
        const d = _haversineMeters(lat, lng, s.coordinates[1], s.coordinates[0]);
        if (d < nearestDist) { nearestDist = d; nearest = s; }
      });

      // Also check user's past gyms (no coords, skip)

      if (gpsBtn) {
        gpsBtn.disabled = false;
        gpsBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v3.5M12 19.5V23M1 12h3.5M19.5 12H23"/><circle cx="12" cy="12" r="9" opacity=".25" stroke-width="1.5"/></svg> Detectar mi ubicación`;
      }

      if (nearest && nearestDist <= MIN_GYM_NEARBY_M) {
        selectGymFromPicker(nearest.id, nearest.nombre || nearest.name || nearest.id, city || nearest.schoolCity || '');
        showToast(`Rocódromo detectado: ${nearest.nombre || nearest.name}`, 'success');
      } else {
        // Pre-fill city in search and let user type the name
        const searchInput = document.getElementById('gym-picker-search');
        if (searchInput) {
          searchInput.value = city ? `${city} ` : '';
          searchInput.focus();
          _renderGymPickerList(searchInput.value.trim());
        }
        document.getElementById('ascent-school-city').value = city;
        _gymPickerSelectedCity = city;
        if (city) showToast(`Ciudad detectada: ${city}. Elige o escribe el nombre del rocódromo`, 'info');
        else showToast('Ubicación obtenida. Elige o escribe el rocódromo', 'info');
      }
    },
    err => {
      if (gpsBtn) {
        gpsBtn.disabled = false;
        gpsBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v3.5M12 19.5V23M1 12h3.5M19.5 12H23"/><circle cx="12" cy="12" r="9" opacity=".25" stroke-width="1.5"/></svg> Detectar mi ubicación`;
      }
      const msgs = { 1: 'Permiso de ubicación denegado', 2: 'Ubicación no disponible', 3: 'Tiempo de espera agotado' };
      showToast(msgs[err.code] || 'Error al obtener ubicación', 'error');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

const HERO_MILESTONES = [
  { m: 33,    name: 'Coloso de Rodas',         emoji: '🗿' },
  { m: 93,    name: 'Estatua de la Libertad',  emoji: '🗽' },
  { m: 138,   name: 'Pirámide de Guiza',       emoji: '🔺' },
  { m: 172,   name: 'Sagrada Familia',         emoji: '⛪' },
  { m: 324,   name: 'Torre Eiffel',            emoji: '🗼' },
  { m: 443,   name: 'Empire State',            emoji: '🏙️' },
  { m: 508,   name: 'Taipei 101',              emoji: '🏢' },
  { m: 828,   name: 'Burj Khalifa',            emoji: '🏗️' },
  { m: 914,   name: 'El Capitán',              emoji: '🧗' },
  { m: 2428,  name: 'Peñalara',                emoji: '🗻' },
  { m: 2519,  name: 'Naranjo de Bulnes',       emoji: '⛰️' },
  { m: 3478,  name: 'Mulhacén',                emoji: '🏔️' },
  { m: 3718,  name: 'Teide',                   emoji: '🌋' },
  { m: 4810,  name: 'Mont Blanc',              emoji: '🏔️' },
  { m: 5895,  name: 'Kilimanjaro',             emoji: '🌍' },
  { m: 6962,  name: 'Aconcagua',               emoji: '🏔️' },
  { m: 8091,  name: 'Annapurna',               emoji: '❄️' },
  { m: 8611,  name: 'K2',                      emoji: '⛏️' },
  { m: 8848,  name: 'Everest',                 emoji: '🏔️' },
  { m: 12000, name: 'Troposfera',              emoji: '☁️' },
  { m: 50000, name: 'Estratosfera',            emoji: '🌌' },
  { m: 85000, name: 'Mesoesfera',              emoji: '🌠' },
  { m: 408000,name: 'ISS',                     emoji: '🛰️' },
];

function estimateRouteMeters(grade) {
  if (!grade) return 20;
  const g = String(grade).toLowerCase();
  if (g.startsWith('3') || g.startsWith('4')) return 15;
  if (g.startsWith('5')) return 18;
  if (g.startsWith('6')) return 22;
  if (g.startsWith('7')) return 25;
  return 28;
}

function buildActivityHeroMilestone(allAscents) {
  const rockAscents = allAscents.filter(a => !isGymAscent(a) && a.grade && a.style !== 'project');
  const totalMeters = rockAscents.reduce((sum, a) => {
    const fromRoute = parseFloat(a.routeLength || a.long1);
    const m = !isNaN(fromRoute) && fromRoute > 0 ? fromRoute : estimateRouteMeters(a.grade);
    return sum + m;
  }, 0);

  const metersEl = document.getElementById('hero-meters');
  if (metersEl) metersEl.textContent = `${Math.round(totalMeters).toLocaleString('es-ES')} m`;

  let currentIdx = -1;
  for (let i = HERO_MILESTONES.length - 1; i >= 0; i--) {
    if (totalMeters >= HERO_MILESTONES[i].m) { currentIdx = i; break; }
  }
  const current = currentIdx >= 0 ? HERO_MILESTONES[currentIdx] : null;
  const next = HERO_MILESTONES[currentIdx + 1] || null;

  const nameEl = document.getElementById('hero-milestone-name');
  const fillEl = document.getElementById('hero-progress-fill');
  const nextEl = document.getElementById('hero-milestone-next');

  if (totalMeters === 0) {
    if (nameEl) nameEl.textContent = '· registra vías para ver hitos';
    if (fillEl) fillEl.style.width = '0%';
    if (nextEl) nextEl.textContent = '';
    return;
  }

  if (nameEl) {
    nameEl.innerHTML = current
      ? `· ${current.emoji} <strong>${current.name}</strong>`
      : `· camino al primer hito`;
  }

  if (next) {
    const baseM = current ? current.m : 0;
    const pct = Math.max(0, Math.min(100, ((totalMeters - baseM) / (next.m - baseM)) * 100));
    if (fillEl) fillEl.style.width = `${pct}%`;
    const remaining = Math.max(0, Math.round(next.m - totalMeters));
    if (nextEl) nextEl.innerHTML = `Próximo: ${next.emoji} <strong>${next.name}</strong> · faltan <strong>${remaining.toLocaleString('es-ES')} m</strong>`;
  } else {
    if (fillEl) fillEl.style.width = '100%';
    if (nextEl) nextEl.innerHTML = '🎉 Todos los hitos alcanzados';
  }
}

function buildActivityHeroCard(allAscents, yearAscents) {
  buildActivityHeroMilestone(allAscents);
  const rockAscents = allAscents.filter(a => !isGymAscent(a));
  const rockYear = yearAscents.filter(a => !isGymAscent(a));

  // Max grade as "proyecto activo" (highest grade attempted this year)
  const grades = rockYear.map(a => a.grade).filter(Boolean);
  const maxGrade = findMaxGrade(grades) || '-';
  const gradeEl = document.getElementById('hero-project-grade');
  if (gradeEl) gradeEl.textContent = maxGrade;

  // Route name of that grade
  const topAscent = rockYear.find(a => a.grade && a.grade.toLowerCase() === (maxGrade || '').toLowerCase());
  const nameEl = document.getElementById('hero-project-name');
  if (nameEl) {
    const loc = [topAscent?.routeName, topAscent?.sectorName || topAscent?.sector, topAscent?.schoolName || topAscent?.school].filter(Boolean).join(' · ');
    nameEl.textContent = loc || (maxGrade !== '-' ? 'Mejor encadenamiento del año' : 'Sin ascensiones este año');
  }

  // Streak
  const streak = calculateStreak(rockAscents);
  const flashCount = rockYear.filter(a => a.style === 'flash' || a.style === 'onsight').length;
  const flashRate = rockYear.length > 0 ? Math.round((flashCount / rockYear.length) * 100) : 0;

  const badgesEl = document.getElementById('hero-badges-roca');
  if (badgesEl) {
    badgesEl.innerHTML = [
      streak > 2 ? `<span class="act-badge act-badge-orange">🔥 Racha ${streak} días</span>` : '',
      rockYear.length > 0 ? `<span class="act-badge act-badge-blue">${rockYear.length} vías este año</span>` : '',
      flashRate > 0 ? `<span class="act-badge act-badge-green">Flash ${flashRate}%</span>` : '',
    ].join('');
  }

  // Comparison vs previous year
  const now = new Date();
  const prevYear = now.getFullYear() - 1;
  const prevYearAscents = allAscents.filter(a => {
    const d = parseAscentDate(a.date);
    return d && d.getFullYear() === prevYear && !isGymAscent(a);
  });
  const compareEl = document.getElementById('hero-compare-roca');
  if (compareEl) {
    if (prevYearAscents.length > 0 && rockYear.length > 0) {
      const pct = Math.round(((rockYear.length - prevYearAscents.length) / prevYearAscents.length) * 100);
      const sign = pct >= 0 ? '+' : '';
      const prevMax = findMaxGrade(prevYearAscents.map(a => a.grade).filter(Boolean));
      compareEl.innerHTML = `Vs. ${prevYear}:<br><strong>${sign}${pct}% vías</strong><br>Grado máximo: <strong>${prevMax || '-'} → ${maxGrade}</strong>`;
    } else if (rockYear.length > 0) {
      compareEl.innerHTML = `<strong>${rockYear.length} vías</strong> este año<br>Flash rate: <strong>${flashRate}%</strong>`;
    } else {
      compareEl.innerHTML = 'Registra ascensiones<br>para ver tu progreso.';
    }
  }

  // Sparkline — últimas 30 sesiones agrupadas por día
  buildSparkline(rockAscents, 'hero-sparkline-roca', '#6366f1', '#e0e7ff');
}

function buildSparkline(ascents, svgId, strokeColor, fillColor) {
  const svgEl = document.getElementById(svgId);
  if (!svgEl) return;

  const byDay = {};
  ascents.slice(0, 210).forEach(a => {
    const d = parseAscentDate(a.date);
    if (!d) return;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    byDay[key] = (byDay[key] || 0) + 1;
  });

  const days = Object.values(byDay).slice(0, 30).reverse();
  if (days.length < 2) { svgEl.innerHTML = ''; return; }

  const maxV = Math.max(...days);
  const w = 200, h = 48, pad = 4;
  const pts = days.map((v, i) => {
    const x = (i / (days.length - 1)) * w;
    const y = h - pad - ((v / maxV) * (h - pad * 2));
    return `${x},${y}`;
  }).join(' ');

  svgEl.innerHTML = `
    <polyline points="${pts}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${pts} ${w},${h} 0,${h}" fill="${fillColor}" stroke="none" opacity="0.5"/>
  `;
}

function buildActivityPyramid(allAscents) {
  const el = document.getElementById('act-pyramid-roca');
  if (!el) return;

  const rockAscents = allAscents.filter(a => !isGymAscent(a) && a.style !== 'project' && a.grade);

  const gradeCounts = {};
  rockAscents.forEach(a => {
    const g = a.grade.toLowerCase();
    if (GRADE_ORDER.includes(g)) gradeCounts[g] = (gradeCounts[g] || 0) + 1;
  });

  const sorted = GRADE_ORDER
    .filter(g => gradeCounts[g] > 0)
    .reverse();

  if (sorted.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:1rem;font-size:12px;color:var(--text-muted)">Sin ascensiones encadenadas</div>';
    const consolidatedEl = document.getElementById('act-consolidated-grade');
    if (consolidatedEl) consolidatedEl.textContent = '-';
    return;
  }

  const maxCount = Math.max(...sorted.map(g => gradeCounts[g]));

  el.innerHTML = sorted.map(grade => {
    const count = gradeCounts[grade];
    const pct = Math.max(8, Math.round((count / maxCount) * 100));
    const bg = typeof getGradeColor === 'function' ? getGradeColor(grade) : '#818cf8';
    return `<div class="act-pyramid-row">
      <div class="act-pyramid-label">${grade}</div>
      <div class="act-pyramid-bar-wrap">
        <div class="act-pyramid-bar" style="width:${pct}%;background:${bg};"></div>
        <div class="act-pyramid-count">${count}</div>
      </div>
    </div>`;
  }).join('');

  // Consolidated grade: highest grade with ≥5 ascents
  const consolidated = sorted.find(g => gradeCounts[g] >= 5);
  const consolidatedEl = document.getElementById('act-consolidated-grade');
  if (consolidatedEl) consolidatedEl.textContent = consolidated || '-';
}

function buildActivityHeatmap(allAscents) {
  buildHeatmapFor(allAscents.filter(a => !isGymAscent(a)), 'act-heatmap-weeks-roca', 'act-heatmap-months-roca', 'hm-r');

  const gymAscents = allAscents.filter(a => isGymAscent(a));
  if (window._gymActivityHeatmap) window._gymActivityHeatmap.destroy();
  window._gymActivityHeatmap = new ActivityHeatmap('gym-activity-heatmap');
  window._gymActivityHeatmap.initWithData(gymAscents);
}

function getHmTooltip() {
  let tip = document.getElementById('hm-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'hm-tooltip';
    tip.className = 'hm-tooltip';
    document.body.appendChild(tip);
  }
  return tip;
}

function buildHeatmapFor(ascents, weeksId, monthsId, colorPrefix) {
  const weeksEl = document.getElementById(weeksId);
  const monthsEl = document.getElementById(monthsId);
  if (!weeksEl || !monthsEl) return;
  weeksEl.innerHTML = '';
  monthsEl.innerHTML = '';

  const dayCount = {};
  ascents.forEach(a => {
    const d = parseAscentDate(a.date);
    if (!d) return;
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    dayCount[key] = (dayCount[key] || 0) + 1;
  });

  const today = new Date();
  const year = today.getFullYear();
  const months = ['E','F','M','A','M','J','J','A','S','O','N','D'];
  const currentMonth = today.getMonth();

  // Render each month as its own block of week-columns, with empty cells
  // padding the start/end so each month shows EXACTLY its real days.
  for (let m = 0; m <= currentMonth; m++) {
    const firstDay = new Date(year, m, 1);
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const fdDow = firstDay.getDay();
    const fdGridDay = fdDow === 0 ? 6 : fdDow - 1; // 0=Mon..6=Sun
    const totalCells = fdGridDay + daysInMonth;
    const weeksInMonth = Math.ceil(totalCells / 7);

    for (let w = 0; w < weeksInMonth; w++) {
      const weekDiv = document.createElement('div');
      weekDiv.className = 'act-heatmap-week';
      if (w === 0 && m > 0) weekDiv.classList.add('hm-month-start');

      for (let d = 0; d < 7; d++) {
        const dayOfMonth = w * 7 + d - fdGridDay + 1;
        const inMonth = dayOfMonth >= 1 && dayOfMonth <= daysInMonth;
        const cell = document.createElement('div');

        if (!inMonth) {
          cell.className = 'act-heatmap-cell hm-empty';
        } else {
          const date = new Date(year, m, dayOfMonth);
          const afterToday = date > today;
          if (afterToday) {
            cell.className = 'act-heatmap-cell hm-empty';
          } else {
            const key = `${year}-${String(m).padStart(2,'0')}-${String(dayOfMonth).padStart(2,'0')}`;
            const count = dayCount[key] || 0;
            const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : count <= 7 ? 3 : 4;
            cell.className = `act-heatmap-cell ${level === 0 ? 'hm-0' : colorPrefix + level}`;
            if (count > 0) {
              const label = `${count} ${count === 1 ? 'vía' : 'vías'} · ${date.toLocaleDateString('es-ES', { day:'numeric', month:'short' })}`;
              cell.addEventListener('mouseenter', e => {
                const tip = getHmTooltip();
                tip.textContent = label;
                const r = cell.getBoundingClientRect();
                tip.style.left = `${r.left + r.width / 2}px`;
                tip.style.top = `${r.top - 8}px`;
                tip.style.transform = 'translateX(-50%) translateY(-100%)';
                tip.classList.add('visible');
              });
              cell.addEventListener('mouseleave', () => {
                getHmTooltip().classList.remove('visible');
              });
            }
          }
        }
        weekDiv.appendChild(cell);
      }
      weeksEl.appendChild(weekDiv);

      const span = document.createElement('div');
      span.className = 'act-heatmap-month';
      span.textContent = (w === 0) ? months[m] : '';
      monthsEl.appendChild(span);
    }
  }
}

function calculateStreak(ascents) {
  if (!ascents || ascents.length === 0) return 0;
  const days = new Set();
  ascents.forEach(a => {
    const d = parseAscentDate(a.date);
    if (d) days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  });

  const sorted = Array.from(days).sort().reverse();
  let streak = 0;
  const today = new Date();
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  for (const dayKey of sorted) {
    const [y, m, d] = dayKey.split('-').map(Number);
    const dayDate = new Date(y, m, d);
    const diff = Math.round((cursor - dayDate) / 86400000);
    if (diff <= 1) {
      streak++;
      cursor = dayDate;
    } else {
      break;
    }
  }
  return streak;
}

// ============================================
// PIRÁMIDE DE GRADOS — Rocódromo
// ============================================

const GYM_VIA_GRADES = [
  '4', '4+', '5', '5+',
  '5a', '5a+', '5b', '5b+', '5c', '5c+',
  '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+',
  '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a',
];

const GYM_BOULDER_GRADES = [
  '3', '4', '4+', '5', '5+',
  '6A', '6A+', '6B', '6B+', '6C', '6C+',
  '7A', '7A+', '7B', '7B+', '7C', '7C+',
  '8A', '8A+', '8B', '8B+', '8C', '8C+',
];

function buildGymPyramid(allAscents) {
  const wrap = document.getElementById('gym-pyramid-wrap');
  if (!wrap) return;

  const gymAscents = allAscents.filter(a => isGymAscent(a));

  function isBoulder(a) {
    return (a.climbType || a.type || '').toLowerCase() === 'boulder';
  }

  function normalizeGrade(g, view) {
    if (!g) return '';
    const s = g.trim();
    if (view === 'via') return s.toLowerCase();
    // Fontainebleau: uppercase letter suffix, e.g. "6b+" → "6B+"
    return s.replace(/([a-c])(\+?)$/i, (_, l, p) => l.toUpperCase() + p);
  }

  let activeView = 'via';

  function getViewData() {
    const grades = activeView === 'via' ? GYM_VIA_GRADES : GYM_BOULDER_GRADES;
    const viewAscents = gymAscents.filter(a =>
      activeView === 'via' ? !isBoulder(a) : isBoulder(a)
    );
    const sendAscents = viewAscents.filter(a => a.style !== 'project' && a.grade);
    const projects = viewAscents.filter(a => a.style === 'project');

    const flashMap = {}, redMap = {};
    sendAscents.forEach(a => {
      const g = normalizeGrade(a.grade, activeView);
      if (!grades.includes(g)) return;
      if (a.style === 'flash' || a.style === 'onsight') flashMap[g] = (flashMap[g] || 0) + 1;
      else redMap[g] = (redMap[g] || 0) + 1;
    });

    const activeGrades = grades.filter(g => (flashMap[g]||0)+(redMap[g]||0) > 0).reverse();
    const max = activeGrades.reduce((m, g) => Math.max(m, (flashMap[g]||0)+(redMap[g]||0)), 1);

    // Consolidation: highest grade with ≥5 combined sends
    let conso = null;
    for (let i = grades.length - 1; i >= 0; i--) {
      if ((flashMap[grades[i]]||0) + (redMap[grades[i]]||0) >= 5) { conso = grades[i]; break; }
    }

    return { activeGrades, flashMap, redMap, max, conso, projects };
  }

  function renderPyramid() {
    const { activeGrades, flashMap, redMap, max, conso, projects } = getViewData();

    const pyramidEl = wrap.querySelector('#gp-pyramid');
    const consoVal  = wrap.querySelector('#gp-conso-val');
    const projectsEl = wrap.querySelector('#gp-projects');

    if (activeGrades.length === 0) {
      pyramidEl.innerHTML = '<div class="gp-empty">Sin ascensiones registradas</div>';
      consoVal.textContent = '-';
    } else {
      pyramidEl.innerHTML = activeGrades.map(g => {
        const flash = flashMap[g] || 0;
        const red   = redMap[g]   || 0;
        const total = flash + red;
        const w     = Math.max(7, Math.round(total / max * 100));
        let bars = '';
        if (flash > 0) bars += `<div style="width:${Math.round(flash/total*100)}%;background:#1D9E75;height:100%;"></div>`;
        if (red   > 0) bars += `<div style="width:${Math.round(red/total*100)}%;background:#378ADD;height:100%;"></div>`;
        return `<div class="gp-row">
          <span class="gp-label">${g}</span>
          <div class="gp-bar-wrap"><div class="gp-bar" style="width:${w}%;">${bars}</div></div>
          <span class="gp-count">${total}</span>
        </div>`;
      }).join('');
      consoVal.textContent = conso || '-';
    }

    if (projects.length === 0) {
      projectsEl.innerHTML = '<div class="gp-empty">Sin proyectos activos</div>';
    } else {
      projectsEl.innerHTML = projects.slice(0, 10).map(p => {
        const g     = p.grade || '?';
        const name  = p.routeName || p.name || 'Sin nombre';
        const tries = p.attempts || p.tries || 0;
        const best  = p.bestAttempt || p.best_attempt || '';
        const sub   = tries > 0
          ? `${tries} pegue${tries !== 1 ? 's' : ''}${best ? ' · Mejor: ' + best : ''}`
          : 'Sin intentos registrados';
        return `<div class="gp-project">
          <span class="gp-proj-grade">${g}</span>
          <div class="gp-proj-info">
            <div class="gp-proj-name">${name}</div>
            <div class="gp-proj-sub">${sub}</div>
          </div>
          <i class="ti ti-chevron-right gp-proj-chevron" aria-hidden="true"></i>
        </div>`;
      }).join('');
    }
  }

  wrap.innerHTML = `
<div class="gp-root">
  <div class="act-section-title">Pirámide de grados</div>
  <div class="gp-seg" id="gp-seg">
    <button class="gp-tab active" data-v="via">Vías indoor</button>
    <button class="gp-tab" data-v="boulder">Boulder</button>
  </div>
  <div class="gp-legend">
    <span class="gp-legend-dot" style="background:#1D9E75;"></span><span>Flash</span>
    <span class="gp-legend-dot gp-legend-gap" style="background:#378ADD;"></span><span>Encadenada</span>
  </div>
  <div id="gp-pyramid"></div>
  <div class="gp-conso">
    <i class="ti ti-award gp-conso-icon" aria-hidden="true"></i>
    <div>
      <div class="gp-conso-label">Grado de consolidación</div>
      <div class="gp-conso-val" id="gp-conso-val">-</div>
      <div class="gp-conso-sub">≥5 vías encadenadas</div>
    </div>
  </div>
  <div class="gp-proj-section">
    <div class="gp-proj-title"><i class="ti ti-target-arrow" aria-hidden="true"></i> Proyectos activos</div>
    <div id="gp-projects"></div>
  </div>
</div>`;

  wrap.querySelector('#gp-seg').addEventListener('click', e => {
    const tab = e.target.closest('.gp-tab');
    if (!tab) return;
    activeView = tab.dataset.v;
    wrap.querySelectorAll('.gp-tab').forEach(t => t.classList.toggle('active', t === tab));
    renderPyramid();
  });

  renderPyramid();
}

function buildGymStats(allAscents) {
  const gymAscents = allAscents.filter(a => isGymAscent(a));

  // This week gym routes
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0,0,0,0);
  const weekGym = gymAscents.filter(a => {
    const d = parseAscentDate(a.date);
    return d && d >= startOfWeek;
  });

  const weekRoutesEl = document.getElementById('hero-gym-week-routes');
  if (weekRoutesEl) weekRoutesEl.textContent = weekGym.length > 0 ? `${weekGym.length} vías` : '- vías';

  const goalEl = document.getElementById('hero-gym-goal');
  if (goalEl) goalEl.textContent = gymAscents.length === 0 ? 'Registra sesiones para ver tu progreso' : `${gymAscents.length} vías totales en rocódromo`;

  // Flash rate
  const flashGym = gymAscents.filter(a => a.style === 'flash' || a.style === 'onsight').length;
  const flashRateGym = gymAscents.length > 0 ? Math.round((flashGym / gymAscents.length) * 100) + '%' : '-';

  // Sessions per week (last 8 weeks)
  const eightWeeksAgo = new Date(now);
  eightWeeksAgo.setDate(now.getDate() - 56);
  const recentGym = gymAscents.filter(a => {
    const d = parseAscentDate(a.date);
    return d && d >= eightWeeksAgo;
  });
  const gymDays = new Set(recentGym.map(a => {
    const d = parseAscentDate(a.date);
    return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : null;
  }).filter(Boolean));
  const sessionsPerWeek = gymDays.size > 0 ? (gymDays.size / 8).toFixed(1) : '-';

  // Max grade in gym
  const gymGrades = gymAscents.map(a => a.grade).filter(Boolean);
  const gymMaxGrade = findMaxGrade(gymGrades) || '-';

  // Unique gym session days total
  const allGymDays = new Set(gymAscents.map(a => {
    const d = parseAscentDate(a.date);
    return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : null;
  }).filter(Boolean));

  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setVal('gym-sessions-week', sessionsPerWeek);
  setVal('gym-flash-rate', flashRateGym);
  setVal('gym-max-grade', gymMaxGrade);
  setVal('gym-total-sessions', allGymDays.size > 0 ? allGymDays.size : '-');

  // Sparkline gym
  buildSparkline(gymAscents, 'hero-sparkline-gym', '#7c3aed', '#ede9fe');

  // Gym timeline
  renderGymTimeline(gymAscents.slice(0, 50));
}

// ============================================================
// MIS ROCÓDROMOS — sección en tab Rocódromo de Actividad
// ============================================================

// Umbral mínimo de vías en cada gym para mostrar calibración
const MIN_VIAS_CALIBRACION = 5;

// Escala unificada: via indoor + boulder (normalizado a minúsculas)
const GYM_ROCO_GRADE_SCALE = [
  '3', '4', '4+', '5', '5+',
  '5a', '5a+', '5b', '5b+', '5c', '5c+',
  '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+',
  '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a'
];

function _rocoGradeIndex(grade) {
  if (!grade) return -1;
  return GYM_ROCO_GRADE_SCALE.indexOf(grade.toLowerCase().trim());
}

function _rocoMaxGrade(grades) {
  let max = -1;
  let maxGrade = null;
  grades.forEach(g => {
    const idx = _rocoGradeIndex(g);
    if (idx > max) { max = idx; maxGrade = GYM_ROCO_GRADE_SCALE[idx]; }
  });
  return maxGrade;
}

function _rocoAvgGrade(grades) {
  const indices = grades.map(_rocoGradeIndex).filter(i => i >= 0);
  if (!indices.length) return null;
  const avg = Math.round(indices.reduce((s, i) => s + i, 0) / indices.length);
  return GYM_ROCO_GRADE_SCALE[avg] || null;
}

function _rocoRelDate(date) {
  const d = parseAscentDate(date);
  if (!d) return '–';
  const diffMs  = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0)  return 'hoy';
  if (diffDays === 1)  return 'ayer';
  if (diffDays < 7)   return `hace ${diffDays} d`;
  const weeks = Math.floor(diffDays / 7);
  if (weeks < 5)      return `hace ${weeks} sem`;
  const months = Math.floor(diffDays / 30);
  if (months < 12)    return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(diffDays / 365);
  return `hace ${years} ${years === 1 ? 'año' : 'años'}`;
}

const _ROCO_AVATAR_COLORS = ['#534AB7', '#1D9E75', '#378ADD', '#E05A5A', '#BA7517', '#6B4E9E'];
function _rocoAvatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return _ROCO_AVATAR_COLORS[h % _ROCO_AVATAR_COLORS.length];
}

function buildGymMisRocodromos(allAscents) {
  const wrap = document.getElementById('gym-mis-rocodromos');
  if (!wrap) return;

  // Solo ascensos de gym, excluir proyectos sin encadenar
  const gymSends = allAscents.filter(a => isGymAscent(a) && a.style !== 'project');

  if (gymSends.length === 0) {
    wrap.innerHTML = `
<div class="roco-section">
  <div class="roco-header">
    <span class="roco-title">Mis rocódromos</span>
    <button class="roco-map-btn" onclick="switchView('map-view')">Ver mapa</button>
  </div>
  <div class="roco-empty">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".4"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
    <p>Sin sesiones en rocódromo</p>
    <span>Registra vías para ver tus estadísticas aquí</span>
  </div>
</div>`;
    return;
  }

  // Agrupar por schoolId (fallback a nombre normalizado)
  const gyms = new Map();
  gymSends.forEach(a => {
    const id   = a.schoolId || (a.schoolName || '').toLowerCase().replace(/\s+/g, '_') || 'unknown';
    const name = a.schoolName || id;
    const city = a.schoolCity || '';
    if (!gyms.has(id)) gyms.set(id, { id, name, city, sends: [] });
    gyms.get(id).sends.push(a);
  });

  // Métricas por gym  — orden: nº vías desc (criterio principal), luego última visita desc
  const gymList = [...gyms.values()].map(g => {
    const grades = g.sends.map(a => a.grade).filter(Boolean);
    const dates  = g.sends.map(a => parseAscentDate(a.date)).filter(Boolean);
    const lastDate = dates.length ? new Date(Math.max(...dates)) : null;
    return {
      id:        g.id,
      name:      g.name,
      city:      g.city,
      count:     g.sends.length,
      maxGrade:  _rocoMaxGrade(grades),
      avgGrade:  _rocoAvgGrade(grades),
      lastDate,
      lastDateRel: _rocoRelDate(lastDate),
      grades,
    };
  }).sort((a, b) => b.count - a.count || (b.lastDate || 0) - (a.lastDate || 0));

  // Agregados globales
  const allGrades = gymSends.map(a => a.grade).filter(Boolean);
  const globalMax   = _rocoMaxGrade(allGrades) || '–';
  const favoriteGym = gymList[0];
  const totalSends  = gymSends.length;

  // ── HTML de cards ──────────────────────────────────────────
  const cards = gymList.map(g => {
    const color    = _rocoAvatarColor(g.name);
    const initials = g.name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const isFav    = g.id === favoriteGym.id;
    const subLine  = [g.city, `${g.count} vía${g.count !== 1 ? 's' : ''}`].filter(Boolean).join(' · ');
    const favStar  = isFav ? '<span class="roco-card-star" aria-label="Favorito">★</span>' : '';

    return `<div class="roco-card" data-gym-id="${g.id}" role="button" tabindex="0">
  <div class="roco-card-top">
    <div class="roco-card-avatar" style="background:${color}">${initials}</div>
    <div class="roco-card-info">
      <div class="roco-card-name">${g.name}${favStar}</div>
      <div class="roco-card-sub">${subLine}</div>
    </div>
    <svg class="roco-card-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
  </div>
  <div class="roco-card-stats">
    <div class="roco-stat"><div class="roco-stat-label">Más duro</div><div class="roco-stat-val">${g.maxGrade || '–'}</div></div>
    <div class="roco-stat"><div class="roco-stat-label">Promedio</div><div class="roco-stat-val">${g.avgGrade || '–'}</div></div>
    <div class="roco-stat"><div class="roco-stat-label">Última visita</div><div class="roco-stat-val">${g.lastDateRel}</div></div>
  </div>
</div>`;
  }).join('');

  // ── Calibración entre gimnasios ────────────────────────────
  let calibHtml = '';
  const calibGyms = gymList.filter(g => g.count >= MIN_VIAS_CALIBRACION && g.avgGrade);
  if (calibGyms.length >= 2) {
    const [a, b] = calibGyms;
    const idxA = _rocoGradeIndex(a.avgGrade);
    const idxB = _rocoGradeIndex(b.avgGrade);
    const diff = idxA - idxB; // positivo: A es más difícil
    if (Math.abs(diff) >= 1) {
      const [harder, easier, adjIdx] = diff > 0
        ? [a, b, idxA - diff]  // A más duro → un X en A = X-diff en B
        : [b, a, idxB + diff];
      const eqGrade = GYM_ROCO_GRADE_SCALE[Math.max(0, adjIdx)] || harder.avgGrade;
      calibHtml = `<div class="roco-calib">
  <div class="roco-calib-title">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
    Calibración entre gimnasios
  </div>
  <div class="roco-calib-text">Tu <strong>${harder.avgGrade}</strong> en ${harder.name} equivale a un <strong>${eqGrade}</strong> en ${easier.name}</div>
</div>`;
    }
  }

  wrap.innerHTML = `
<div class="roco-section">
  <div class="roco-header">
    <div>
      <div class="roco-title">Mis rocódromos</div>
      <div class="roco-subtitle">${gymList.length} visitado${gymList.length !== 1 ? 's' : ''} · ${totalSends} vías encadenadas</div>
    </div>
    <button class="roco-map-btn" onclick="switchView('map-view')">Ver mapa
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="11" r="3"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
    </button>
  </div>

  <div class="roco-summary">
    <div class="roco-sum-card">
      <div class="roco-sum-label">Grado tope</div>
      <div class="roco-sum-val">${globalMax}</div>
    </div>
    <div class="roco-sum-card">
      <div class="roco-sum-label">Favorito</div>
      <div class="roco-sum-fav">${favoriteGym.name}</div>
    </div>
  </div>

  <div class="roco-cards">${cards}</div>

  ${calibHtml}
</div>`;

  // Tap en card → mapa centrado en el gym
  wrap.querySelectorAll('.roco-card').forEach(card => {
    card.addEventListener('click', () => _navigateToGymOnMap(card.dataset.gymId));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') card.click();
    });
  });
}

// Navega al mapa y carga el gym. Reintenta hasta que el cache de
// pending_schools esté disponible (se rellena async al iniciar el mapa).
function _navigateToGymOnMap(gymId) {
  switchView('map-view');
  if (!gymId || typeof mlLoadSchool !== 'function') return;

  let attempts = 0;
  const MAX_ATTEMPTS = 8;   // ~2.8 s máx
  const INTERVAL_MS  = 350;

  const tryLoad = () => {
    const inCache  = window.mlPendingSchoolsCache?.has(gymId);
    const inStatic = typeof MAPLIBRE_SCHOOLS !== 'undefined' && !!MAPLIBRE_SCHOOLS[gymId];

    if (inCache || inStatic) {
      mlLoadSchool(gymId);
      return;
    }

    attempts++;
    if (attempts < MAX_ATTEMPTS) {
      setTimeout(tryLoad, INTERVAL_MS);
    }
    // Si agota reintentos: el mapa ya está abierto, el usuario puede navegar manualmente
  };

  // Pequeño delay inicial para que mlEnsureMapReady() haya arrancado
  setTimeout(tryLoad, 120);
}

// ============================================================
// GYM TEST HEADER — vanilla JS implementation
// ============================================================

let _gthUnsubDefs = null;
let _gthUnsubMeasures = null;
let _gthDefs = [];
let _gthMeasures = [];
let _gthAuthHooked = false;

// Built-in test templates (9 tests imprescindibles — Lattice/Eva López/Beastmaker)
const _GTH_TEMPLATES = [
  { key: 'max_hang',         name: 'Max Hangs',           unit: 'kg',     progressDirection: 'higher_is_better', requiredContext: ['edgeMm', 'bodyWeightKg'], defaults: { edgeMm: 20 }, description: 'Fuerza máxima de dedos en regleta de referencia' },
  { key: 'min_edge_7s',      name: 'Regleta mínima 7s',   unit: 'mm',     progressDirection: 'lower_is_better',  requiredContext: ['bodyWeightKg'],            description: 'Fuerza máxima relativa' },
  { key: 'repeaters_7_3',    name: 'Repeaters 7/3',       unit: 'reps',   progressDirection: 'higher_is_better', requiredContext: ['edgeMm', 'bodyWeightKg'], defaults: { edgeMm: 20 }, description: 'Resistencia de fuerza local' },
  { key: 'forty_sec_hang',   name: '40s en regleta',      unit: 'mm',     progressDirection: 'lower_is_better',  requiredContext: ['bodyWeightKg'],            description: 'Resistencia anaeróbica' },
  { key: 'max_pull_ups',     name: 'Dominadas máximas',   unit: 'reps',   progressDirection: 'higher_is_better', requiredContext: [],                          description: 'Fuerza tracción' },
  { key: 'weighted_pull_up', name: 'Dominada con lastre', unit: 'kg',     progressDirection: 'higher_is_better', requiredContext: ['bodyWeightKg'],            description: 'Potencia tracción' },
  { key: 'campus_1_5_9',     name: 'Campus 1-5-9',        unit: 'custom', customUnitLabel: 'listón', progressDirection: 'higher_is_better', requiredContext: [], description: 'Potencia de contacto' },
  { key: 'foot_on_campus',   name: 'Foot-on campus',      unit: 'custom', customUnitLabel: 'combo',  progressDirection: 'higher_is_better', requiredContext: [], description: 'Potencia controlada' },
  { key: 'boulder_test',     name: 'Test de bloque',      unit: 'grade',  progressDirection: 'higher_is_better', requiredContext: ['gymId'],                   description: 'Grado consolidado' },
];

function initTestHeader() {
  if (_gthAuthHooked) return;
  _gthAuthHooked = true;

  // Render an immediate skeleton/empty state so the section is visible
  _gthRender();

  firebase.auth().onAuthStateChanged((user) => {
    _gthTeardown();
    _gthDefs = [];
    _gthMeasures = [];

    if (!user) {
      _gthRender();
      return;
    }

    const db = firebase.firestore();
    const defsRef = db.collection('users').doc(user.uid).collection('test_definitions');
    const measRef = db.collection('users').doc(user.uid).collection('test_measurements');

    _gthUnsubDefs = defsRef.onSnapshot(
      async (snap) => {
        _gthDefs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Seed defaults if the user has never had any test definitions
        if (_gthDefs.length === 0) {
          await _gthSeedDefaults(defsRef);
        }
        _gthRender();
      },
      (err) => { console.error('[TestHeader] defs error', err); _gthRender(); }
    );

    _gthUnsubMeasures = measRef.onSnapshot(
      (snap) => {
        _gthMeasures = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        _gthRender();
      },
      (err) => console.error('[TestHeader] measures error', err)
    );
  });
}

async function _gthSeedDefaults(defsRef) {
  try {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const batch = firebase.firestore().batch();
    const DEFAULT_PINNED = new Set(['max_hang', 'min_edge_7s', 'forty_sec_hang']);
    _GTH_TEMPLATES.forEach((tpl, i) => {
      const docRef = defsRef.doc();
      const pinned = DEFAULT_PINNED.has(tpl.key);
      const data = {
        templateKey: tpl.key,
        name: tpl.name,
        description: tpl.description || '',
        unit: tpl.unit,
        progressDirection: tpl.progressDirection,
        requiredContext: tpl.requiredContext,
        defaults: tpl.defaults || {},
        pinned,
        order: pinned ? i : 1000 + i,
        enabledAt: now,
      };
      if (tpl.customUnitLabel) data.customUnitLabel = tpl.customUnitLabel;
      batch.set(docRef, data);
    });
    await batch.commit();
    console.log('[TestHeader] seeded default tests');
  } catch (e) {
    console.error('[TestHeader] seed failed', e);
  }
}

function _gthTeardown() {
  if (_gthUnsubDefs) { _gthUnsubDefs(); _gthUnsubDefs = null; }
  if (_gthUnsubMeasures) { _gthUnsubMeasures(); _gthUnsubMeasures = null; }
}

function _gthUnitLabel(def) {
  switch (def.unit) {
    case 'kg': return 'kg';
    case 'mm': return 'mm';
    case 'seconds': return 's';
    case 'reps': return 'reps';
    case 'percent_bw': return '% PC';
    case 'grade': return '';
    case 'custom': return def.customUnitLabel || '';
    default: return '';
  }
}

function _gthFormatDays(days) {
  if (days === null || days === undefined) return '';
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days}d`;
  if (days < 365) return `hace ${Math.floor(days / 30)}m`;
  return `hace ${Math.floor(days / 365)}a`;
}

function _gthSparkline(values) {
  if (!values || values.length < 2) return '';
  const VW = 120, VH = 28, PAD = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (VW - PAD * 2);
    const y = VH - PAD - ((v - min) / range) * (VH - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastV = values[values.length - 1];
  const dotY = (VH - PAD - ((lastV - min) / range) * (VH - PAD * 2)).toFixed(1);
  const dotX = (VW - PAD).toFixed(1);
  return `<svg class="gth-sparkline" viewBox="0 0 ${VW} ${VH}" aria-hidden="true">` +
    `<polyline points="${pts}" fill="none" stroke="var(--gym-color)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${dotX}" cy="${dotY}" r="2.2" fill="var(--gym-color)"/>` +
    `</svg>`;
}

function _gthBuildCardState(def, allMeasures) {
  const now = new Date().toISOString();
  const MS = 1000 * 60 * 60 * 24;
  const sorted = allMeasures
    .filter(m => m.testId === def.id)
    .map(m => {
      // Firestore Timestamp or ISO string
      const ts = m.measuredAt && m.measuredAt.toDate ? m.measuredAt.toDate().toISOString() : m.measuredAt;
      return { ...m, _iso: ts };
    })
    .sort((a, b) => a._iso < b._iso ? -1 : 1);

  if (sorted.length === 0) {
    return { def, latest: null, previous: null, delta: null, daysSince: null, sparkline: [] };
  }
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  let delta = null;
  if (previous !== null) {
    const raw = latest.value - previous.value;
    delta = def.progressDirection === 'higher_is_better' ? raw : -raw;
  }
  const daysSince = Math.floor((new Date(now) - new Date(latest._iso)) / MS);
  const sparkline = sorted.slice(-8).map(m => m.value);
  return { def, latest, previous, delta, daysSince, sparkline };
}

function _gthCardHTML(state) {
  const { def, latest, delta, daysSince, sparkline } = state;
  const unit = _gthUnitLabel(def);
  const ctx = def.defaults && def.defaults.edgeMm
    ? `${def.defaults.edgeMm}mm`
    : (def.requiredContext && def.requiredContext.includes('bodyWeightKg') ? 'a PC' : '');

  let numStr = '—';
  let unitStr = '';
  if (latest) {
    if (def.unit === 'grade' && latest.gradeValue) {
      numStr = latest.gradeValue;
    } else {
      numStr = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(latest.value);
      unitStr = unit;
    }
  }

  let badgeClass = 'gth-badge--neutral';
  let badgeText = '= Sin datos';
  if (delta !== null) {
    if (delta > 0)  { badgeClass = 'gth-badge--positive'; badgeText = `↑ +${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(delta)}${unit ? ' ' + unit : ''}`; }
    else if (delta < 0) { badgeClass = 'gth-badge--negative'; badgeText = `↓ ${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(delta)}${unit ? ' ' + unit : ''}`; }
    else { badgeText = `= 0${unit ? ' ' + unit : ''}`; }
  }

  const daysStr = _gthFormatDays(daysSince);

  return `<article class="gth-card" data-test-id="${def.id}" role="button" tabindex="0" aria-label="${def.name}: ${numStr} ${unitStr}">
    <div class="gth-card-top">
      <span class="gth-card-name">${def.name.toUpperCase()}</span>
      ${ctx ? `<span class="gth-card-ctx">${ctx}</span>` : ''}
    </div>
    <div class="gth-card-value">${numStr}${unitStr ? `<span class="gth-card-unit"> ${unitStr}</span>` : ''}</div>
    <div class="gth-card-meta">
      <span class="gth-badge ${badgeClass}">${badgeText}</span>
      ${daysStr ? `<span class="gth-card-days">${daysStr}</span>` : ''}
    </div>
    ${_gthSparkline(sparkline)}
  </article>`;
}

function _gthRender() {
  const root = document.getElementById('test-header-root');
  if (!root) return;

  const pinned = _gthDefs
    .filter(d => d.pinned)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const cardsHTML = pinned.map(def => {
    const state = _gthBuildCardState(def, _gthMeasures);
    return _gthCardHTML(state);
  }).join('');

  const addCardHTML = `<button class="gth-add-card" id="btn-gth-add" aria-label="Añadir test al header">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
    <span class="gth-add-card-label">Añadir test<br>al header</span>
  </button>`;

  root.innerHTML = `<div class="gth-root">
    <div class="gth-header-row">
      <p class="gth-section-title">TESTS DE RENDIMIENTO</p>
      <button class="gth-btn-outline" id="btn-gth-configure">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        Configurar tests
      </button>
    </div>
    <div class="gth-grid">
      ${pinned.length === 0 && _gthDefs.length === 0
        ? `<div class="gth-empty" style="grid-column:1/-1">Cargando tests…</div>`
        : cardsHTML + addCardHTML
      }
    </div>
    <button class="gth-btn-register" id="btn-gth-register">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      Registrar nueva medición
    </button>
  </div>`;

  // Wire up click events after DOM update
  root.querySelector('#btn-gth-configure')?.addEventListener('click', _gthOpenConfigure);
  root.querySelector('#btn-gth-add')?.addEventListener('click', _gthOpenConfigure);
  root.querySelector('#btn-gth-register')?.addEventListener('click', () => _gthOpenRecord(null));
  root.querySelectorAll('.gth-card').forEach(card => {
    card.addEventListener('click', () => _gthOpenRecord(card.dataset.testId));
  });
}

// ============================================================
// Modal: Configurar tests (pin/unpin from catalogue)
// ============================================================
function _gthOpenConfigure() {
  const user = firebase.auth().currentUser;
  if (!user) return;

  // Index existing defs by templateKey
  const byKey = {};
  _gthDefs.forEach(d => { if (d.templateKey) byKey[d.templateKey] = d; });

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay gth-modal-overlay';
  overlay.innerHTML = `
    <div class="gth-modal">
      <div class="gth-modal-header">
        <h3>Configurar tests</h3>
        <button class="gth-modal-close" aria-label="Cerrar">×</button>
      </div>
      <p class="gth-modal-sub">Activa los tests que quieres ver en tu header.</p>
      <div class="gth-modal-list">
        ${_GTH_TEMPLATES.map(tpl => {
          const def = byKey[tpl.key];
          const pinned = def ? !!def.pinned : false;
          return `<label class="gth-modal-row">
            <div>
              <div class="gth-modal-row-name">${tpl.name}</div>
              <div class="gth-modal-row-desc">${tpl.description || ''}</div>
            </div>
            <input type="checkbox" data-tpl-key="${tpl.key}" ${pinned ? 'checked' : ''}>
          </label>`;
        }).join('')}
      </div>
      <div class="gth-modal-footer">
        <button class="gth-modal-btn-secondary" id="gth-cfg-cancel">Cancelar</button>
        <button class="gth-modal-btn-primary" id="gth-cfg-save">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.gth-modal-close').onclick = close;
  overlay.querySelector('#gth-cfg-cancel').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#gth-cfg-save').onclick = async () => {
    const db = firebase.firestore();
    const defsRef = db.collection('users').doc(user.uid).collection('test_definitions');
    const batch = db.batch();
    let order = 0;

    for (const tpl of _GTH_TEMPLATES) {
      const cb = overlay.querySelector(`input[data-tpl-key="${tpl.key}"]`);
      const wantPinned = cb.checked;
      const existing = byKey[tpl.key];

      if (existing) {
        if (existing.pinned !== wantPinned) {
          batch.update(defsRef.doc(existing.id), {
            pinned: wantPinned,
            order: wantPinned ? order++ : 1000 + order++,
          });
        } else if (wantPinned) {
          order++;
        }
      } else if (wantPinned) {
        // Create new definition for a template the user never had
        const docRef = defsRef.doc();
        const data = {
          templateKey: tpl.key,
          name: tpl.name,
          description: tpl.description || '',
          unit: tpl.unit,
          progressDirection: tpl.progressDirection,
          requiredContext: tpl.requiredContext,
          defaults: tpl.defaults || {},
          pinned: true,
          order: order++,
          enabledAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
        if (tpl.customUnitLabel) data.customUnitLabel = tpl.customUnitLabel;
        batch.set(docRef, data);
      }
    }

    try {
      await batch.commit();
      close();
    } catch (e) {
      console.error('[TestHeader] save config failed', e);
      alert('Error guardando: ' + e.message);
    }
  };
}

// ============================================================
// Modal: Registrar nueva medición
// ============================================================
function _gthOpenRecord(preselectedTestId) {
  const user = firebase.auth().currentUser;
  if (!user) return;

  const pinned = _gthDefs.filter(d => d.pinned).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (pinned.length === 0) {
    alert('Primero configura algún test desde "Configurar tests"');
    return;
  }
  const selectedId = preselectedTestId && pinned.find(d => d.id === preselectedTestId)
    ? preselectedTestId
    : pinned[0].id;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay gth-modal-overlay';
  overlay.innerHTML = `
    <div class="gth-modal">
      <div class="gth-modal-header">
        <h3>Registrar medición</h3>
        <button class="gth-modal-close" aria-label="Cerrar">×</button>
      </div>
      <div class="gth-modal-body">
        <label class="gth-field">
          <span>Test</span>
          <select id="gth-rec-test">
            ${pinned.map(d => `<option value="${d.id}" ${d.id === selectedId ? 'selected' : ''}>${d.name}</option>`).join('')}
          </select>
        </label>
        <div id="gth-rec-fields"></div>
        <label class="gth-field">
          <span>Fecha</span>
          <input type="date" id="gth-rec-date" value="${new Date().toISOString().slice(0, 10)}">
        </label>
      </div>
      <div class="gth-modal-footer">
        <button class="gth-modal-btn-secondary" id="gth-rec-cancel">Cancelar</button>
        <button class="gth-modal-btn-primary" id="gth-rec-save">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.gth-modal-close').onclick = close;
  overlay.querySelector('#gth-rec-cancel').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const sel = overlay.querySelector('#gth-rec-test');
  const fieldsDiv = overlay.querySelector('#gth-rec-fields');

  function renderFields() {
    const def = pinned.find(d => d.id === sel.value);
    if (!def) return;
    const unit = _gthUnitLabel(def);
    let fieldsHTML = `<label class="gth-field">
      <span>Valor${unit ? ' (' + unit + ')' : ''}</span>
      <input type="${def.unit === 'grade' ? 'text' : 'number'}" step="any" id="gth-rec-value" required>
    </label>`;

    (def.requiredContext || []).forEach(ctx => {
      if (ctx === 'edgeMm') {
        const dflt = def.defaults && def.defaults.edgeMm ? def.defaults.edgeMm : '';
        fieldsHTML += `<label class="gth-field">
          <span>Regleta (mm)</span>
          <input type="number" step="1" id="gth-rec-ctx-edgeMm" value="${dflt}">
        </label>`;
      } else if (ctx === 'bodyWeightKg') {
        fieldsHTML += `<label class="gth-field">
          <span>Peso corporal (kg)</span>
          <input type="number" step="0.1" id="gth-rec-ctx-bodyWeightKg">
        </label>`;
      } else if (ctx === 'gymId') {
        fieldsHTML += `<label class="gth-field">
          <span>Rocódromo</span>
          <input type="text" id="gth-rec-ctx-gymId" placeholder="Nombre del rocódromo">
        </label>`;
      }
    });
    fieldsDiv.innerHTML = fieldsHTML;
  }

  sel.addEventListener('change', renderFields);
  renderFields();

  overlay.querySelector('#gth-rec-save').onclick = async () => {
    const def = pinned.find(d => d.id === sel.value);
    const valEl = overlay.querySelector('#gth-rec-value');
    const dateEl = overlay.querySelector('#gth-rec-date');
    const rawVal = valEl.value.trim();
    if (!rawVal) { valEl.focus(); return; }

    const context = {};
    (def.requiredContext || []).forEach(ctx => {
      const el = overlay.querySelector(`#gth-rec-ctx-${ctx}`);
      if (el && el.value !== '') {
        context[ctx] = ctx === 'gymId' ? el.value : parseFloat(el.value);
      }
    });

    const payload = {
      testId: def.id,
      value: def.unit === 'grade' ? 0 : parseFloat(rawVal),
      measuredAt: firebase.firestore.Timestamp.fromDate(new Date(dateEl.value)),
    };
    if (def.unit === 'grade') payload.gradeValue = rawVal;
    if (Object.keys(context).length > 0) payload.context = context;

    try {
      await firebase.firestore()
        .collection('users').doc(user.uid)
        .collection('test_measurements')
        .add(payload);
      close();
    } catch (e) {
      console.error('[TestHeader] save measurement failed', e);
      alert('Error guardando: ' + e.message);
    }
  };
}

function renderGymTimeline(ascents) {
  const listEl = document.getElementById('activity-list-gym');
  if (!listEl) return;
  if (ascents.length === 0) return;
  listEl.innerHTML = '';
  renderSessionCards(ascents, listEl, true);
}

function updateActivityRecords(allAscents) {
  const rockAscents = allAscents.filter(a => !isGymAscent(a));
  if (rockAscents.length === 0) return;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // Highest grade
  const grades = rockAscents.map(a => a.grade).filter(Boolean);
  const maxGrade = findMaxGrade(grades) || '-';
  setEl('record-highest-grade', maxGrade);
  const topAscent = rockAscents.find(a => a.grade && a.grade.toLowerCase() === maxGrade.toLowerCase());
  setEl('record-highest-route', [topAscent?.routeName, topAscent?.schoolName || topAscent?.school].filter(Boolean).join(' · ') || '-');

  // Highest flash
  const flashAscents = rockAscents.filter(a => a.style === 'flash' || a.style === 'onsight');
  const flashGrades = flashAscents.map(a => a.grade).filter(Boolean);
  const maxFlash = findMaxGrade(flashGrades) || '-';
  setEl('record-highest-flash', maxFlash);
  const topFlash = flashAscents.find(a => a.grade && a.grade.toLowerCase() === maxFlash.toLowerCase());
  setEl('record-flash-route', [topFlash?.routeName, topFlash?.schoolName || topFlash?.school].filter(Boolean).join(' · ') || '-');

  // Streak
  const streak = calculateStreak(rockAscents);
  setEl('record-streak', streak > 0 ? streak + ' días' : '-');

  // Most routes in a day
  const dayMap = {};
  rockAscents.forEach(a => {
    const d = parseAscentDate(a.date);
    if (!d) return;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!dayMap[key]) dayMap[key] = { count: 0, date: d };
    dayMap[key].count++;
  });
  const bestDay = Object.values(dayMap).sort((a, b) => b.count - a.count)[0];
  if (bestDay) {
    setEl('record-most-day', bestDay.count);
    setEl('record-most-date', bestDay.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }));
  }
}

// ========================================

function resetAllStats() {
  // Reset to empty state when user has no ascents
  // Slide 1: Rendimiento
  updateStatValue('stat-total-routes', '0');
  updateStatValue('stat-placeholder-1', '0');
  updateStatValue('stat-max-grade', '-');
  updateStatValue('stat-avg-grade', '-');
  updateStatValue('stat-flash-rate', '0%');
  updateStatValue('stat-main-style', '-');

  // Slide 2: Intentos y Valoración
  updateStatValue('stat-total-tries', '0');
  updateStatValue('stat-avg-tries', '0');
  updateStatValue('stat-rated-routes', '0');
  updateStatValue('stat-avg-rating', '-');

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
  const climbingDays = new Set();
  let totalTries = 0;
  let totalRating = 0;
  let ratedCount = 0;
  let flashCount = 0;

  // Process each ascent
  ascents.forEach(ascent => {
    // Grades
    if (ascent.grade) grades.push(ascent.grade.toLowerCase());

    // Styles count
    if (ascent.style) {
      styles[ascent.style] = (styles[ascent.style] || 0) + 1;
      if (ascent.style === 'flash' || ascent.style === 'onsight') flashCount++;
    }

    // Climbing days (unique calendar dates)
    const d = parseAscentDate(ascent.date);
    if (d) climbingDays.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);

    // Tries
    if (ascent.tries && ascent.tries > 0) totalTries += ascent.tries;

    // Rating
    if (ascent.rating && ascent.rating > 0) {
      totalRating += ascent.rating;
      ratedCount++;
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
  updateStatValue('stat-total-routes', ascents.length);
  updateStatValue('stat-placeholder-1', climbingDays.size);

  const maxGrade = findMaxGrade(grades);
  updateStatValue('stat-max-grade', maxGrade || '-');

  const avgGrade = calculateAverageGrade(grades, gradeOrder);
  updateStatValue('stat-avg-grade', avgGrade || '-');

  const flashRate = ascents.length > 0 ? Math.round((flashCount / ascents.length) * 100) : 0;
  updateStatValue('stat-flash-rate', flashRate + '%');

  const mainStyle = getMainStyle(styles);
  updateStatValue('stat-main-style', mainStyle);

  // === SLIDE 2: Intentos y Valoración ===
  updateStatValue('stat-total-tries', totalTries);

  const avgTries = ascents.length > 0 ? (totalTries / ascents.length).toFixed(1) : 0;
  updateStatValue('stat-avg-tries', avgTries);

  updateStatValue('stat-rated-routes', ratedCount);

  const avgRating = ratedCount > 0 ? (totalRating / ratedCount).toFixed(1) : '-';
  updateStatValue('stat-avg-rating', avgRating !== '-' ? avgRating + '<small>/5</small>' : '-');

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
    project: 'Intento',
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

let _allActivityAscents = [];

function filterActivitySessions(filter) {
  if (!_allActivityAscents.length) return;
  const filtered = filter === 'all'
    ? _allActivityAscents
    : _allActivityAscents.filter(a => a.style === filter);
  const listEl = document.getElementById('activity-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="activity-empty-state"><h3>Sin ascensiones para este filtro</h3></div>';
    return;
  }
  renderSessionCards(filtered, listEl, false);
}

function renderSessionCards(ascents, container, isGym) {
  const styleMap = { flash: 'F', redpoint: 'R', onsight: 'O', project: 'P', toprope: 'T' };
  const styleDot = { flash: 'act-sd-yellow', redpoint: 'act-sd-red', onsight: 'act-sd-blue', project: 'act-sd-gray', toprope: 'act-sd-gray' };

  const sessions = {};
  ascents.forEach(a => {
    const d = parseAscentDate(a.date);
    const dateKey = d
      ? d.getFullYear() + '-' + String(d.getMonth()).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
      : 'unknown';
    const sector = a.sectorName || a.sector || 'Sector desconocido';
    const key = dateKey + '__' + sector;
    if (!sessions[key]) sessions[key] = { date: d, sector, school: a.schoolName || a.school || '', ascents: [] };
    sessions[key].ascents.push(a);
  });

  Object.values(sessions).forEach(function(session) {
    const grades = session.ascents.map(a => a.grade).filter(Boolean);
    const topGrade = findMaxGrade(grades) || '-';
    const styles = [...new Set(session.ascents.map(a => a.style).filter(Boolean))];
    const dateStr = session.date
      ? session.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
      : '';
    const locationStr = [dateStr, session.school, session.sector].filter(Boolean).join(' · ');

    let avgGrade = '-';
    if (grades.length > 0) {
      const avgIdx = Math.round(grades.reduce(function(acc, g) { return acc + (GRADE_ORDER.indexOf(g.toLowerCase()) || 0); }, 0) / grades.length);
      avgGrade = GRADE_ORDER[avgIdx] || '-';
    }

    const dotsHtml = styles.map(s =>
      '<div class="act-style-dot ' + (styleDot[s] || 'act-sd-gray') + '" title="' + s + '">' + (styleMap[s] || '?') + '</div>'
    ).join('');

    const card = document.createElement('div');
    card.className = 'act-session-card';
    card.innerHTML =
      '<div class="act-session-left">' +
        '<div class="act-session-date">' + locationStr + '</div>' +
        '<div class="act-session-sector">' + session.sector + '</div>' +
        '<div class="act-session-meta">' + session.ascents.length + ' vía' + (session.ascents.length !== 1 ? 's' : '') + ' · Grado medio ' + avgGrade + '</div>' +
      '</div>' +
      '<div class="act-session-right">' +
        '<div class="act-session-grade">' + topGrade + '</div>' +
        '<div class="act-session-styles">' + dotsHtml + '</div>' +
      '</div>';
    container.appendChild(card);
  });
}

function renderActivityList(ascents) {
  _allActivityAscents = ascents.filter(a => !isGymAscent(a));
  const activityList = document.getElementById('activity-list');
  if (!activityList) return;

  const emptyState = activityList.querySelector('.activity-empty-state');
  activityList.innerHTML = '';

  if (_allActivityAscents.length === 0) {
    if (emptyState) activityList.appendChild(emptyState);
    return;
  }

  renderSessionCards(_allActivityAscents, activityList, false);
}


// ========================================
// ASCENT LOGBOOK
// ========================================

let logbookAscents = []; // Full list fetched from Firestore
let logbookFiltered = []; // Currently filtered subset

const STYLE_LABELS = {
  redpoint: 'Redpoint',
  onsight: 'A vista',
  flash: 'Flash',
  toprope: 'Top Rope',
  project: 'Intento'
};

function initLogbook() {
  // Make climbing stats card clickable
  const statsCard = document.querySelector('.profile-card-ig');
  if (statsCard) {
    statsCard.classList.add('clickable');
    const header = statsCard.querySelector('.profile-card-header-ig');
    if (header) {
      header.classList.add('clickable-header');
      // Add chevron indicator
      if (!header.querySelector('.logbook-chevron')) {
        const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        chevron.setAttribute('class', 'logbook-chevron');
        chevron.setAttribute('width', '14');
        chevron.setAttribute('height', '14');
        chevron.setAttribute('viewBox', '0 0 24 24');
        chevron.setAttribute('fill', 'none');
        chevron.setAttribute('stroke', 'currentColor');
        chevron.setAttribute('stroke-width', '2');
        chevron.setAttribute('stroke-linecap', 'round');
        chevron.setAttribute('stroke-linejoin', 'round');
        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points', '9 18 15 12 9 6');
        chevron.appendChild(polyline);
        header.appendChild(chevron);
      }
    }
    statsCard.addEventListener('click', openLogbook);
  }

  // Close button
  const closeBtn = document.getElementById('close-logbook-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeLogbook);
  }

  // Filters
  const schoolFilter = document.getElementById('logbook-filter-school');
  const sectorFilter = document.getElementById('logbook-filter-sector');
  const gradeFilter = document.getElementById('logbook-filter-grade');
  const styleFilter = document.getElementById('logbook-filter-style');
  if (schoolFilter) schoolFilter.addEventListener('change', () => {
    populateSectorFilter(logbookAscents);
    applyLogbookFilters();
  });
  if (sectorFilter) sectorFilter.addEventListener('change', applyLogbookFilters);
  if (gradeFilter) gradeFilter.addEventListener('change', applyLogbookFilters);
  if (styleFilter) styleFilter.addEventListener('change', applyLogbookFilters);

}

function showConfirmModal(title, message, onConfirm) {
  const modal = document.getElementById('confirm-modal');
  const titleEl = document.getElementById('confirm-title');
  const msgEl = document.getElementById('confirm-message');
  const okBtn = document.getElementById('confirm-ok');
  const cancelBtn = document.getElementById('confirm-cancel');
  if (!modal || !okBtn || !cancelBtn) return;

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  modal.classList.remove('hidden');

  const close = () => modal.classList.add('hidden');

  const handleOk = () => { close(); onConfirm(); cleanup(); };
  const handleCancel = () => { close(); cleanup(); };
  const handleBackdrop = (e) => { if (e.target === modal) { close(); cleanup(); } };

  const cleanup = () => {
    okBtn.removeEventListener('click', handleOk);
    cancelBtn.removeEventListener('click', handleCancel);
    modal.removeEventListener('click', handleBackdrop);
  };

  okBtn.addEventListener('click', handleOk);
  cancelBtn.addEventListener('click', handleCancel);
  modal.addEventListener('click', handleBackdrop);
}

async function openLogbook() {
  const modal = document.getElementById('ascent-logbook-modal');
  if (!modal) return;

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Show loading state
  const list = document.getElementById('logbook-list');
  if (list) {
    list.innerHTML = '<div style="display:flex;justify-content:center;padding:40px;"><div class="spinner"></div></div>';
  }

  try {
    // Fetch all ascents for the current profile user
    const userId = getCurrentProfileUserId();
    if (!userId) {
      renderLogbookEmpty('No se pudo identificar al usuario');
      return;
    }

    const ascents = await getUserAscentsByUserId(userId, 500);

    // Sort by date descending (most recent first)
    ascents.sort((a, b) => {
      const dateA = a.date instanceof Date ? a.date : new Date(a.date);
      const dateB = b.date instanceof Date ? b.date : new Date(b.date);
      return dateB - dateA;
    });

    logbookAscents = ascents;
    logbookFiltered = ascents;

    populateSchoolFilter(ascents);
    populateSectorFilter(ascents);
    populateGradeFilter(ascents);
    applyLogbookFilters();

  } catch (error) {
    console.error('Error loading logbook:', error);
    renderLogbookEmpty('Error al cargar las ascensiones');
  }
}

function closeLogbook() {
  const modal = document.getElementById('ascent-logbook-modal');
  if (modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function getCurrentProfileUserId() {
  // If viewing another user's profile, return their ID
  if (currentProfileUserId) {
    return currentProfileUserId;
  }
  // Otherwise return logged-in user's ID
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) {
    return currentUser.uid;
  }
  return null;
}

function populateSchoolFilter(ascents) {
  const select = document.getElementById('logbook-filter-school');
  if (!select) return;

  const schools = [...new Set(ascents.map(a => a.schoolName).filter(s => s && s.trim() !== ''))];
  schools.sort((a, b) => a.localeCompare(b, 'es'));

  const currentVal = select.value;
  select.innerHTML = '<option value="">Todas las escuelas</option>';
  schools.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
  if (currentVal && schools.includes(currentVal)) {
    select.value = currentVal;
  }
}

function populateSectorFilter(ascents) {
  const select = document.getElementById('logbook-filter-sector');
  if (!select) return;

  const schoolVal = document.getElementById('logbook-filter-school')?.value || '';
  const filtered = schoolVal ? ascents.filter(a => a.schoolName === schoolVal) : ascents;
  const sectors = [...new Set(filtered.map(a => a.sector).filter(s => s && s.trim() !== ''))];
  sectors.sort((a, b) => a.localeCompare(b, 'es'));

  const currentVal = select.value;
  select.innerHTML = '<option value="">Todos los sectores</option>';
  sectors.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
  if (currentVal && sectors.includes(currentVal)) {
    select.value = currentVal;
  }
}

function populateGradeFilter(ascents) {
  const gradeSelect = document.getElementById('logbook-filter-grade');
  if (!gradeSelect) return;

  const grades = [...new Set(ascents.map(a => a.grade).filter(g => g && g.trim() !== ''))];
  const compareFunc = typeof compareGradesLocal === 'function' ? compareGradesLocal : (a, b) => a.localeCompare(b);
  grades.sort(compareFunc);

  // Keep selected value if possible
  const currentVal = gradeSelect.value;
  gradeSelect.innerHTML = '<option value="">Todos los grados</option>';
  grades.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    gradeSelect.appendChild(opt);
  });
  if (currentVal && grades.includes(currentVal)) {
    gradeSelect.value = currentVal;
  }
}

function applyLogbookFilters() {
  const schoolVal = document.getElementById('logbook-filter-school')?.value || '';
  const sectorVal = document.getElementById('logbook-filter-sector')?.value || '';
  const gradeVal = document.getElementById('logbook-filter-grade')?.value || '';
  const styleVal = document.getElementById('logbook-filter-style')?.value || '';

  logbookFiltered = logbookAscents.filter(a => {
    if (schoolVal && a.schoolName !== schoolVal) return false;
    if (sectorVal && a.sector !== sectorVal) return false;
    if (gradeVal && a.grade !== gradeVal) return false;
    if (styleVal && a.style !== styleVal) return false;
    return true;
  });

  const hasFilter = schoolVal || sectorVal || gradeVal || styleVal;

  // Update result count
  const countEl = document.getElementById('logbook-result-count');
  if (countEl) {
    const total = logbookAscents.length;
    const shown = logbookFiltered.length;
    countEl.textContent = hasFilter
      ? `${shown} de ${total} ascensiones`
      : `${total} ascensiones`;
  }

  renderLogbookList(logbookFiltered);
}

function renderLogbookList(ascents) {
  const list = document.getElementById('logbook-list');
  if (!list) return;

  if (!ascents || ascents.length === 0) {
    const schoolVal = document.getElementById('logbook-filter-school')?.value || '';
    const sectorVal = document.getElementById('logbook-filter-sector')?.value || '';
    const gradeVal = document.getElementById('logbook-filter-grade')?.value || '';
    const styleVal = document.getElementById('logbook-filter-style')?.value || '';
    const isFiltered = schoolVal || sectorVal || gradeVal || styleVal;

    renderLogbookEmpty(
      isFiltered ? 'No hay ascensiones con esos filtros' : null
    );
    return;
  }

  let html = '';
  ascents.forEach(ascent => {
    const dateObj = ascent.date instanceof Date ? ascent.date : new Date(ascent.date);
    const dateStr = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

    const styleSVG = typeof getAscentStyleSVG === 'function' ? getAscentStyleSVG(ascent.style) : '';
    const styleLabel = STYLE_LABELS[ascent.style] || ascent.style || '';
    const styleClass = ascent.style ? `ascent-style-${ascent.style}` : '';
    const isProject = ascent.style === 'project';
    const isChained = !isProject && ascent.style && ascent.style !== 'project';

    const checkHtml = isChained ? `
      <span class="logbook-item-check">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </span>
    ` : '';

    html += `
      <div class="logbook-item">
        <div class="logbook-item-grade ${isProject ? 'grade-project' : ''}">${ascent.grade || '?'}</div>
        <div class="logbook-item-body">
          <div class="logbook-item-name">${ascent.routeName || 'Sin nombre'}</div>
          <div class="logbook-item-location">${ascent.schoolName || ''}${ascent.sector ? ' · ' + ascent.sector : ''}</div>
        </div>
        <div class="logbook-item-right">
          <div class="logbook-item-date">${dateStr}</div>
          <div class="logbook-item-style ${styleClass}">
            ${styleSVG}
            <span>${styleLabel}</span>
            ${checkHtml}
          </div>
        </div>
        ${!currentProfileUserId ? `<button class="logbook-item-delete" data-ascent-id="${ascent.id}" data-school-id="${ascent.schoolId || ''}" data-route-id="${ascent.routeId || ''}" title="Eliminar ascensión">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            <path d="M10 11v6M14 11v6"></path>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
          </svg>
        </button>` : ''}
      </div>
    `;
  });

  list.innerHTML = html;

  // Attach delete listeners directly to each button
  list.querySelectorAll('.logbook-item-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const { ascentId, schoolId, routeId } = btn.dataset;
      showConfirmModal('Eliminar ascensión', '¿Seguro que quieres eliminar esta ascensión?', async () => {
        const ok = await deleteAscent(ascentId, schoolId, routeId);
        if (ok) {
          logbookAscents = logbookAscents.filter(a => a.id !== ascentId);
          logbookFiltered = logbookFiltered.filter(a => a.id !== ascentId);
          const countEl = document.getElementById('logbook-result-count');
          if (countEl) {
            const total = logbookFiltered.length;
            countEl.textContent = total === 1 ? '1 ascensión' : `${total} ascensiones`;
          }
          renderLogbookList(logbookFiltered);
        }
      });
    });
  });
}

function renderLogbookEmpty(message) {
  const list = document.getElementById('logbook-list');
  if (!list) return;

  list.innerHTML = `
    <div class="logbook-empty">
      <div class="logbook-empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
        </svg>
      </div>
      <div class="logbook-empty-title">${message || 'Sin ascensiones'}</div>
      <div class="logbook-empty-text">${message ? 'Prueba a cambiar los filtros' : 'Registra tu primera ascensión desde la ficha de una vía'}</div>
    </div>
  `;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  initEditProfile();
  initSocialListModal(); // Initialize social list modal listeners
  initSettingsDropdown();
  initCreatePost();
  initViewPostModal();
  initActivityView();
  initLogbook();
  initProgressCards();
  initTrainView();
});

// ── Datos compartidos de sesión (train view ↔ session module) ──────────
window.kruxTrainData = {
  name: 'Fuerza en media llave',
  exercises: [
    { name: 'Max hang · 20mm',      sets: 4, workSec: 10, reps: 0,  weight: 20, restSec: 180, rpeTarget: 8, active: true  },
    { name: 'Campus board · 1-5-9', sets: 3, workSec: 0,  reps: 5,  weight: 0,  restSec: 120, rpeTarget: 7, active: false },
    { name: 'Pullover isométrico',  sets: 3, workSec: 7,  reps: 0,  weight: 0,  restSec: 120, rpeTarget: 6, active: false },
    { name: 'Manguito rotador',     sets: 2, workSec: 0,  reps: 15, weight: 0,  restSec: 60,  rpeTarget: 0, active: false },
  ]
};

// Genera la descripción corta a partir de los parámetros del ejercicio
function buildExDetail(ex) {
  let unit = '';
  if (ex.workSec > 0)      unit = `${ex.workSec}s`;
  else if (ex.reps > 0)    unit = `${ex.reps} rep`;

  let setStr = unit ? `${ex.sets} × ${unit}` : `${ex.sets} series`;
  if (ex.weight > 0) setStr += ` +${ex.weight}kg`;

  const parts = [setStr];
  if (ex.restSec > 0) {
    const r = ex.restSec >= 60 ? `${Math.floor(ex.restSec / 60)} min` : `${ex.restSec}s`;
    parts.push(`descanso ${r}`);
  }
  return parts.join(' — ');
}

// ================== TRAIN VIEW ==================
function initTrainView() {
  const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const session = window.kruxTrainData;

  // Per-day schedule for current week (index 0=Mon…6=Sun): 'done'|'rest'|'today'|'scheduled'
  const defaultSchedule = ['done', 'rest', 'done', 'rest', 'today', 'scheduled', 'rest'];

  let weekOffset = 0;

  function renderWeek() {
    const daysRow = document.getElementById('train-days-row');
    const weekTitle = document.getElementById('train-week-title');
    if (!daysRow || !weekTitle) return;

    const dayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const today = new Date();
    const jsDay = today.getDay(); // 0=Sun
    const mondayDelta = jsDay === 0 ? -6 : 1 - jsDay;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayDelta + weekOffset * 7);

    const weekNum = Math.ceil(monday.getDate() / 7);
    weekTitle.textContent = `Semana ${weekNum} · ${MONTH_NAMES[monday.getMonth()]}`;

    const checkSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

    daysRow.innerHTML = dayLabels.map((label, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const state = weekOffset === 0 ? defaultSchedule[i] : 'rest';
      let dotClass = 'train-day-dot ' + state;
      let content = state === 'done' ? checkSvg : (state === 'rest' ? '–' : `${d.getDate()}`);
      return `<div class="train-day-cell"><span class="train-day-name">${label}</span><div class="${dotClass}">${content}</div></div>`;
    }).join('');
  }

  function renderExercises() {
    const list = document.getElementById('train-exercise-list');
    if (!list) return;
    const playIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    const circleIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"><circle cx="12" cy="12" r="9"></circle></svg>`;
    list.innerHTML = session.exercises.map((ex, i) => `
      <div class="train-ex-row${ex.active ? ' active-ex' : ''} train-ex-editable" data-idx="${i}">
        <div class="train-ex-icon${ex.active ? ' active-icon' : ''}">${ex.active ? playIcon : circleIcon}</div>
        <div class="train-ex-info">
          <div class="train-ex-name${ex.active ? ' active-name' : ''}">${ex.name}</div>
          <div class="train-ex-detail${ex.active ? ' active-detail' : ''}">${buildExDetail(ex)}</div>
        </div>
        ${ex.rpeTarget ? `<span class="train-ex-rpe">RPE ${ex.rpeTarget}</span>` : ''}
      </div>`).join('');

    // Click handlers para edición
    list.querySelectorAll('.train-ex-editable').forEach(row => {
      row.addEventListener('click', () => openExerciseEditor(parseInt(row.dataset.idx)));
    });
  }

  // Plan chips
  const chips = document.querySelectorAll('#train-plan-chips .train-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      if (chip.dataset.plan === 'new') {
        if (typeof window.openPlanEditor === 'function') window.openPlanEditor();
        return;
      }
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  // Week navigation
  const prevBtn = document.getElementById('train-week-prev');
  const nextBtn = document.getElementById('train-week-next');
  if (prevBtn) prevBtn.addEventListener('click', () => { weekOffset--; renderWeek(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { weekOffset++; renderWeek(); });

  // Start button
  const startBtn = document.getElementById('train-start-btn');
  if (startBtn) startBtn.addEventListener('click', () => openActiveSession());

  renderWeek();
  renderExercises();
}

// ================== EXERCISE EDITOR ==================
(function () {
  let editingIdx = -1;
  const $ = id => document.getElementById(id);

  function readFields() {
    return {
      name:      $('ex-field-name').value.trim(),
      sets:      Math.max(1, parseInt($('ex-field-sets').value)   || 1),
      reps:      Math.max(0, parseInt($('ex-field-reps').value)   || 0),
      workSec:   Math.max(0, parseInt($('ex-field-work').value)   || 0),
      weight:    Math.max(0, parseInt($('ex-field-weight').value) || 0),
      restSec:   Math.max(0, parseInt($('ex-field-rest').value)   || 0),
      rpeTarget: Math.min(10, Math.max(0, parseInt($('ex-field-rpe').value) || 0)),
    };
  }

  function updatePreview() {
    const preview = $('ex-preview-text');
    if (!preview) return;
    const tmp = readFields();
    preview.textContent = buildExDetail(tmp) || '—';
  }

  function open(idx) {
    const ex = window.kruxTrainData && window.kruxTrainData.exercises[idx];
    if (!ex) return;
    editingIdx = idx;
    $('ex-field-name').value   = ex.name;
    $('ex-field-sets').value   = ex.sets;
    $('ex-field-reps').value   = ex.reps   || 0;
    $('ex-field-work').value   = ex.workSec;
    $('ex-field-weight').value = ex.weight || 0;
    $('ex-field-rest').value   = ex.restSec;
    $('ex-field-rpe').value    = ex.rpeTarget;
    updatePreview();
    $('ex-editor-sheet').classList.remove('hidden');
    setTimeout(() => $('ex-field-name').focus(), 320);
  }

  function close() {
    $('ex-editor-sheet').classList.add('hidden');
    editingIdx = -1;
  }

  function reRenderList() {
    const listEl = document.getElementById('train-exercise-list');
    if (!listEl || !window.kruxTrainData) return;
    const playIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    const circleIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"><circle cx="12" cy="12" r="9"></circle></svg>`;
    listEl.innerHTML = window.kruxTrainData.exercises.map((e, i) => `
      <div class="train-ex-row${e.active ? ' active-ex' : ''} train-ex-editable" data-idx="${i}">
        <div class="train-ex-icon${e.active ? ' active-icon' : ''}">${e.active ? playIcon : circleIcon}</div>
        <div class="train-ex-info">
          <div class="train-ex-name${e.active ? ' active-name' : ''}">${e.name}</div>
          <div class="train-ex-detail${e.active ? ' active-detail' : ''}">${buildExDetail(e)}</div>
        </div>
        ${e.rpeTarget ? `<span class="train-ex-rpe">RPE ${e.rpeTarget}</span>` : ''}
      </div>`).join('');
    listEl.querySelectorAll('.train-ex-editable').forEach(row => {
      row.addEventListener('click', () => open(parseInt(row.dataset.idx)));
    });
  }

  function save() {
    if (editingIdx < 0 || !window.kruxTrainData) return;
    const ex = window.kruxTrainData.exercises[editingIdx];
    const f  = readFields();
    if (f.name) ex.name = f.name;
    ex.sets      = f.sets;
    ex.reps      = f.reps;
    ex.workSec   = f.workSec;
    ex.weight    = f.weight;
    ex.restSec   = f.restSec;
    ex.rpeTarget = f.rpeTarget;
    close();
    reRenderList();
    if (typeof showToast === 'function') showToast('Ejercicio actualizado', 'success');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const liveFields = ['ex-field-sets','ex-field-reps','ex-field-work','ex-field-weight','ex-field-rest'];
    liveFields.forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('input', updatePreview);
    });
    const closeBtn = $('ex-editor-close');
    const backdrop = $('ex-editor-backdrop');
    const saveBtn  = $('ex-editor-save');
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', close);
    if (saveBtn)  saveBtn.addEventListener('click', save);
  });

  window.openExerciseEditor = open;
  window.closeExerciseEditor = close;
})();

// Re-initialize activity when user logs in
firebase.auth().onAuthStateChanged(user => {
  if (user) {
    setTimeout(() => loadActivityData(), 1000);
  }
});

// ========== PROGRESS CARDS ==========
let _pcAscents = [];
let _pcCurrentPeriod = 'month';
let _pcCurrentSlide = 0;
let _pcPageCount = 1;
let _pcNavContext = null; // {year} for month, {year, month} for week, {year} for year

function updatePcTimeNav(period) {
  const sel = document.getElementById('pc-time-nav');
  if (!sel) return;
  sel.innerHTML = '';

  const now = new Date();
  const monthLabels = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  if (period === 'month') {
    const years = [...new Set(_pcAscents.map(a => {
      const d = parseAscentDate(a.date);
      return d ? d.getFullYear() : null;
    }).filter(Boolean))].sort((a,b) => b - a);
    if (!years.length) years.push(now.getFullYear());
    years.forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      if (y === (_pcNavContext?.year ?? now.getFullYear())) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.style.display = '';
    _pcNavContext = { year: parseInt(sel.value) };

  } else if (period === 'week') {
    const monthsSet = new Set();
    _pcAscents.forEach(a => {
      const d = parseAscentDate(a.date);
      if (d) monthsSet.add(`${d.getFullYear()}-${String(d.getMonth()).padStart(2,'0')}`);
    });
    const sortedMonths = [...monthsSet].sort().reverse();
    if (!sortedMonths.length) sortedMonths.push(`${now.getFullYear()}-${String(now.getMonth()).padStart(2,'0')}`);
    sortedMonths.forEach(key => {
      const [y, m] = key.split('-').map(Number);
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${monthLabels[m]} ${y}`;
      const curKey = `${_pcNavContext?.year ?? now.getFullYear()}-${String(_pcNavContext?.month ?? now.getMonth()).padStart(2,'0')}`;
      if (key === curKey) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.style.display = '';
    const [y, m] = sel.value.split('-').map(Number);
    _pcNavContext = { year: y, month: m };

  } else {
    sel.style.display = 'none';
    _pcNavContext = null;
  }
}

function initProgressCards() {
  const tabs = document.querySelectorAll('[data-pc]');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const period = tab.dataset.pc;
      if (period === 'custom') {
        openProgressCardCustom();
        return;
      }
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _pcCurrentPeriod = period;
      _pcNavContext = null;
      document.getElementById('pc-custom-banner')?.classList.add('hidden');
      updatePcTimeNav(period);
      renderProgressCards(period, _pcAscents);
    });
  });

  document.getElementById('pc-time-nav')?.addEventListener('change', e => {
    const val = e.target.value;
    if (_pcCurrentPeriod === 'month') {
      _pcNavContext = val ? { year: parseInt(val) } : null;
    } else if (_pcCurrentPeriod === 'week') {
      if (val) { const [y, m] = val.split('-').map(Number); _pcNavContext = { year: y, month: m }; }
      else _pcNavContext = null;
    }
    renderProgressCards(_pcCurrentPeriod, _pcAscents);
  });

  document.getElementById('pc-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('pc-overlay')) closePcPopup();
  });
  document.getElementById('pc-btn-cancel')?.addEventListener('click', closePcPopup);
  document.getElementById('pc-btn-apply')?.addEventListener('click', applyPcCustom);
  document.getElementById('pc-banner-clear')?.addEventListener('click', clearPcCustom);

  document.querySelectorAll('.pc-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt(btn.dataset.days);
      const today = new Date();
      const from = new Date();
      from.setDate(from.getDate() - days);
      document.getElementById('pc-date-from').value = from.toISOString().split('T')[0];
      document.getElementById('pc-date-to').value = today.toISOString().split('T')[0];
    });
  });

  // Swipe support — listeners attached once, handlers read up-to-date globals
  const outer = document.getElementById('pc-carousel-outer');
  if (outer) {
    let startX = 0;
    outer.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    outer.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) {
        goPcSlide(Math.max(0, Math.min(_pcPageCount - 1, _pcCurrentSlide + (dx < 0 ? 1 : -1))));
      }
    }, { passive: true });
  }

  document.getElementById('pc-arrow-prev')?.addEventListener('click', () => {
    if (_pcCurrentSlide > 0) goPcSlide(_pcCurrentSlide - 1);
  });
  document.getElementById('pc-arrow-next')?.addEventListener('click', () => {
    if (_pcCurrentSlide < _pcPageCount - 1) goPcSlide(_pcCurrentSlide + 1);
  });
}

function openProgressCardCustom() {
  const today = new Date().toISOString().split('T')[0];
  const from = new Date(); from.setMonth(from.getMonth() - 1);
  document.getElementById('pc-date-from').value = from.toISOString().split('T')[0];
  document.getElementById('pc-date-to').value = today;
  document.getElementById('pc-overlay').classList.remove('hidden');
}

function closePcPopup() {
  document.getElementById('pc-overlay')?.classList.add('hidden');
}

function applyPcCustom() {
  const from = document.getElementById('pc-date-from').value;
  const to = document.getElementById('pc-date-to').value;
  if (!from || !to || from > to) return;
  closePcPopup();

  document.querySelectorAll('[data-pc]').forEach(t => t.classList.remove('active'));
  const banner = document.getElementById('pc-custom-banner');
  if (banner) {
    banner.classList.remove('hidden');
    document.getElementById('pc-banner-text').textContent = `${fmtPcDate(from)} – ${fmtPcDate(to)}`;
  }
  renderProgressCards('custom', _pcAscents, from, to);
}

function clearPcCustom() {
  document.getElementById('pc-custom-banner')?.classList.add('hidden');
  const monthTab = document.querySelector('[data-pc="month"]');
  if (monthTab) {
    document.querySelectorAll('[data-pc]').forEach(t => t.classList.remove('active'));
    monthTab.classList.add('active');
  }
  _pcCurrentPeriod = 'month';
  renderProgressCards('month', _pcAscents);
}

function fmtPcDate(s) {
  const [y, m, d] = s.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]}`;
}

function renderProgressCards(period, ascents, customFrom, customTo) {
  if (ascents) _pcAscents = ascents;
  const carouselEl = document.getElementById('pc-carousel');
  const dotsEl = document.getElementById('pc-carousel-dots');
  if (!carouselEl) return;

  const cards = buildPcCardData(_pcAscents, period, customFrom, customTo, _pcNavContext);

  if (!cards.length) {
    carouselEl.innerHTML = `<div class="pc-carousel-slide"><div class="pc-cards-grid"><div class="pc-empty-card" style="grid-column:1/-1">Sin ascensiones en este periodo</div></div></div>`;
    if (dotsEl) dotsEl.innerHTML = '';
    _pcPageCount = 1;
    return;
  }

  const maxIdx = Math.max(...cards.map(c => getGradeIndex(c.max)).filter(i => i >= 0));

  // Chunk cards into pages of 4
  const pages = [];
  for (let i = 0; i < cards.length; i += 4) pages.push(cards.slice(i, i + 4));
  _pcPageCount = pages.length;

  carouselEl.innerHTML = pages.map(page =>
    `<div class="pc-carousel-slide"><div class="pc-cards-grid">${
      page.map(c => makePcCard(c, getGradeIndex(c.max) === maxIdx && c.count > 0)).join('')
    }</div></div>`
  ).join('');

  if (dotsEl) {
    dotsEl.innerHTML = pages.length > 1
      ? pages.map((_, i) => `<button class="pc-carousel-dot" data-pc-slide="${i}"></button>`).join('')
      : '';
    dotsEl.querySelectorAll('.pc-carousel-dot').forEach(dot =>
      dot.addEventListener('click', () => goPcSlide(parseInt(dot.dataset.pcSlide)))
    );
  }

  const target = Math.min(getPcInitialSlide(period, cards), pages.length - 1);
  goPcSlide(target, false);
}

function getPcInitialSlide(period, cards) {
  const now = new Date();
  if (period === 'week') {
    const dow = now.getDay();
    const dayIndex = dow === 0 ? 6 : dow - 1; // 0=Mon..6=Sun
    return Math.floor(dayIndex / 4);
  }
  if (period === 'month') {
    return Math.floor(now.getMonth() / 4);
  }
  if (period === 'year') {
    const currentYear = String(now.getFullYear());
    const idx = cards.findIndex(c => c.label === currentYear);
    return idx >= 0 ? Math.floor(idx / 4) : Math.max(0, Math.floor((cards.length - 1) / 4));
  }
  return 0;
}

function goPcSlide(index, animate = true) {
  _pcCurrentSlide = index;
  const carouselEl = document.getElementById('pc-carousel');
  if (!carouselEl) return;
  if (!animate) {
    carouselEl.style.transition = 'none';
    carouselEl.style.transform = `translateX(-${index * 100}%)`;
    carouselEl.offsetHeight; // force reflow
    carouselEl.style.transition = '';
  } else {
    carouselEl.style.transform = `translateX(-${index * 100}%)`;
  }
  document.querySelectorAll('.pc-carousel-dot').forEach((d, i) =>
    d.classList.toggle('active', i === index)
  );
  const onlyOne = _pcPageCount <= 1;
  document.getElementById('pc-arrow-prev')?.classList.toggle('pc-arrow-hidden', onlyOne || index === 0);
  document.getElementById('pc-arrow-next')?.classList.toggle('pc-arrow-hidden', onlyOne || index >= _pcPageCount - 1);
}


function buildPcCardData(ascents, period, customFrom, customTo, navContext) {
  const now = new Date();
  const monthLabels = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const dayLabels = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  let groups = [];

  if (period === 'week') {
    const selYear = navContext?.year ?? now.getFullYear();
    const selMonth = navContext?.month ?? now.getMonth();
    const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();
    for (let startDay = 1; startDay <= daysInMonth; startDay += 7) {
      const endDay = Math.min(startDay + 6, daysInMonth);
      const from = new Date(selYear, selMonth, startDay, 0, 0, 0, 0);
      const to = new Date(selYear, selMonth, endDay, 23, 59, 59, 999);
      const weekAscents = ascents.filter(a => {
        const d = parseAscentDate(a.date);
        return d && d >= from && d <= to;
      });
      if (weekAscents.length) groups.push({ label: `${startDay}–${endDay} ${monthLabels[selMonth]}`, ascents: weekAscents });
    }

  } else if (period === 'month') {
    const selYear = navContext?.year ?? now.getFullYear();
    for (let m = 0; m < 12; m++) {
      const monthAscents = ascents.filter(a => {
        const d = parseAscentDate(a.date);
        return d && d.getFullYear() === selYear && d.getMonth() === m;
      });
      if (monthAscents.length) groups.push({ label: monthLabels[m], ascents: monthAscents });
    }

  } else if (period === 'year') {
    const allYears = [...new Set(ascents.map(a => {
      const d = parseAscentDate(a.date);
      return d ? d.getFullYear() : null;
    }).filter(Boolean))].sort();
    const filteredYears = navContext?.year ? allYears.filter(y => y === navContext.year) : allYears;
    filteredYears.forEach(y => {
      const yAscents = ascents.filter(a => {
        const d = parseAscentDate(a.date);
        return d && d.getFullYear() === y;
      });
      if (yAscents.length) groups.push({ label: String(y), ascents: yAscents });
    });

  } else if (period === 'custom' && customFrom && customTo) {
    const from = new Date(customFrom);
    const to = new Date(customTo);
    to.setHours(23,59,59,999);
    const rangeAscents = ascents.filter(a => {
      const d = parseAscentDate(a.date);
      return d && d >= from && d <= to;
    });
    if (rangeAscents.length) groups.push({ label: `${fmtPcDate(customFrom)} – ${fmtPcDate(customTo)}`, ascents: rangeAscents });
  }

  return groups.map(g => {
    const grades = g.ascents.map(a => getGradeIndex(a.grade)).filter(i => i >= 0);
    if (!grades.length) return null;
    const maxGrade = getGradeFromIndex(Math.max(...grades));
    const minGrade = getGradeFromIndex(Math.min(...grades));
    const avgGrade = getGradeFromIndex(Math.round(grades.reduce((a,b) => a+b,0) / grades.length));
    return { label: g.label, count: g.ascents.length, max: maxGrade, min: minGrade, avg: avgGrade };
  }).filter(Boolean);
}

function makePcCard(d, isTop) {
  const total = HISTOGRAM_GRADE_ORDER.length - 1;
  const maxI = getGradeIndex(d.max);
  const minI = getGradeIndex(d.min);
  const avgI = getGradeIndex(d.avg);
  const isPoint = maxI === minI;
  const leftPct = Math.round((minI / total) * 100);
  const widthPct = isPoint ? 0 : Math.max(4, Math.round(((maxI - minI) / total) * 100));
  const avgPct = Math.round((avgI / total) * 100);

  return `<div class="pc-card${isTop ? ' pc-card-top' : ''}">
    <div class="pc-card-head">
      <span class="pc-card-period">${d.label}</span>
      <span class="pc-card-count${isTop ? ' pc-card-count-top' : ''}">${d.count} ${d.count === 1 ? 'vía' : 'vías'}</span>
    </div>
    <div class="pc-grade-labels">
      <span class="pc-grade-min">${d.min}</span>
      <span class="pc-grade-max">${d.max}</span>
    </div>
    <div class="pc-prog-track">
      ${!isPoint ? `<div class="pc-prog-range" style="left:${leftPct}%;width:${widthPct}%"></div>` : ''}
      <div class="pc-prog-avg" style="left:${avgPct}%"></div>
    </div>
    <div class="pc-card-footer">
      <span class="pc-avg-label">Grado medio</span>
      <span class="pc-avg-val">${d.avg}</span>
    </div>
  </div>`;
}
// ========== END PROGRESS CARDS ==========

// ================== ACTIVE SESSION MODULE ==================
(function () {
  // Usa los datos compartidos para que las ediciones del train view se reflejen aquí
  function EXERCISES() { return window.kruxTrainData ? window.kruxTrainData.exercises : []; }

  const SVG = {
    play:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
    pause: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
    skip:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>`,
  };

  // ── Audio (Web Audio API, sin archivos externos) ──────────────────────
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Reanudar si fue suspendido por política de autoplay
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function beep({ freq = 880, duration = 0.08, volume = 0.4, type = 'sine', delay = 0 } = {}) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      gain.gain.setValueAtTime(volume, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + duration + 0.01);
    } catch (_) { /* silencioso si el navegador bloquea audio */ }
  }

  // Tick sutil cada segundo durante trabajo
  function soundTick()    { beep({ freq: 660, duration: 0.04, volume: 0.2 }); }
  // Pitidos urgentes en los últimos 3 segundos de trabajo
  function soundUrgent()  { beep({ freq: 1100, duration: 0.07, volume: 0.5, type: 'square' }); }
  // Triple pitido al completar una serie / fin de trabajo
  function soundDone() {
    beep({ freq: 880,  duration: 0.1, volume: 0.6, delay: 0.0 });
    beep({ freq: 1100, duration: 0.1, volume: 0.6, delay: 0.13 });
    beep({ freq: 1320, duration: 0.18, volume: 0.7, delay: 0.26 });
  }
  // Pitido suave al terminar el descanso
  function soundRestEnd() {
    beep({ freq: 660,  duration: 0.12, volume: 0.5, delay: 0.0 });
    beep({ freq: 880,  duration: 0.18, volume: 0.6, delay: 0.16 });
  }
  // ─────────────────────────────────────────────────────────────────────

  let exIdx, setsDone, mode, timerSec, targetSec, intervalId, elapsedSec, elapsedId, selectedRpe;

  function $ (id) { return document.getElementById(id); }

  function open() {
    exIdx = 0; setsDone = 0; mode = 'idle';
    timerSec = 0; targetSec = 0; intervalId = null;
    elapsedSec = 0; elapsedId = null; selectedRpe = 0;

    const modal = $('session-modal');
    if (!modal) return;

    // Restore session-screen in case it was replaced by completion
    const screen = $('session-screen');
    if (screen && !screen.querySelector('.session-topbar')) location.reload();

    modal.classList.remove('hidden');
    document.body.classList.add('session-open');

    elapsedId = setInterval(() => {
      elapsedSec++;
      const el = $('session-elapsed');
      if (el) el.textContent = fmt2(Math.floor(elapsedSec / 60)) + ':' + fmt2(elapsedSec % 60);
    }, 1000);

    // Update session name/date
    const now = new Date();
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const sub = $('session-session-sub');
    if (sub) sub.textContent = `${days[now.getDay()]} · ${months[now.getMonth()]}`;

    renderExercise();
  }

  function close() {
    clearInterval(intervalId);
    clearInterval(elapsedId);
    const modal = $('session-modal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('session-open');
  }

  function fmt2(n) { return String(n).padStart(2, '0'); }

  function renderExercise() {
    const ex = EXERCISES()[exIdx];
    $('session-ex-counter').textContent = `EJERCICIO ${exIdx + 1} DE ${EXERCISES().length}`;
    $('session-ex-name').textContent = ex.name;
    $('session-ex-detail').textContent = typeof buildExDetail === 'function' ? buildExDetail(ex) : (ex.detail || '');
    $('session-progress-bar').style.width = Math.round((exIdx / EXERCISES().length) * 100) + '%';

    const next = exIdx + 1 < EXERCISES().length ? EXERCISES()[exIdx + 1] : null;
    $('session-next-label').textContent = next ? 'SIGUIENTE' : 'ÚLTIMO EJERCICIO';
    $('session-next-name').textContent = next ? next.name : '¡Último ejercicio!';
    $('session-next-detail').textContent = next ? next.detail : 'Dale todo';

    renderDots();
    setMode('idle');
  }

  function renderDots() {
    const ex = EXERCISES()[exIdx];
    const row = $('session-sets-row');
    if (!row) return;
    let html = '';
    for (let i = 0; i < ex.sets; i++) {
      const cls = i < setsDone ? 'done' : i === setsDone ? 'current' : '';
      const label = i < setsDone
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
        : (i + 1);
      html += `<div class="session-set-dot ${cls}">${label}</div>`;
    }
    row.innerHTML = html;
  }

  function setMode(m) {
    mode = m;
    clearInterval(intervalId);
    const ex = EXERCISES()[exIdx];
    const block  = $('session-timer-block');
    const label  = $('session-timer-label');
    const btnMain  = $('session-btn-main');
    const btnLabel = $('session-btn-label');
    const btnIcon  = $('session-btn-icon');
    const ringArc  = $('session-ring-arc');
    const ringTime = $('session-ring-time');
    const ringLbl  = $('session-ring-lbl');

    block.classList.remove('rest-mode');
    ringArc.style.stroke = '#1D9E75';
    ringTime.className = 'session-ring-time';
    $('session-rpe-section').style.display = 'none';

    if (m === 'idle') {
      label.textContent = ex.workSec > 0 ? 'CRONÓMETRO DE TRABAJO' : 'LISTO';
      ringArc.style.strokeDashoffset = '314';
      ringTime.textContent = ex.workSec > 0 ? '0:' + fmt2(ex.workSec) : '—';
      ringLbl.textContent = ex.workSec > 0 ? 'objetivo' : '';
      btnIcon.innerHTML = SVG.play;
      btnLabel.textContent = ex.workSec > 0 ? 'Iniciar' : 'Marcar serie';
      btnMain.className = 'session-ctrl-btn session-ctrl-primary';

    } else if (m === 'work') {
      label.textContent = 'TRABAJANDO';
      timerSec = 0; targetSec = ex.workSec;
      btnIcon.innerHTML = SVG.pause;
      btnLabel.textContent = 'Pausar';
      intervalId = setInterval(tickWork, 1000);

    } else if (m === 'rest') {
      label.textContent = 'DESCANSO';
      block.classList.add('rest-mode');
      ringTime.className = 'session-ring-time green';
      timerSec = ex.restSec; targetSec = ex.restSec;
      ringTime.textContent = Math.floor(timerSec / 60) + ':' + fmt2(timerSec % 60);
      ringLbl.textContent = 'descanso';
      btnIcon.innerHTML = SVG.skip;
      btnLabel.textContent = 'Saltarme';
      btnMain.className = 'session-ctrl-btn';
      updateRing(timerSec, targetSec);
      intervalId = setInterval(tickRest, 1000);
      showRpe();
    }
  }

  function tickWork() {
    timerSec++;
    const pct = timerSec / targetSec;
    $('session-ring-arc').style.strokeDashoffset = Math.max(0, 314 - 314 * pct);
    const remaining = targetSec - timerSec;
    $('session-ring-time').textContent = '0:' + fmt2(remaining);
    if (remaining <= 3 && remaining > 0) {
      $('session-ring-time').className = 'session-ring-time red';
      soundUrgent();
    } else if (remaining > 3) {
      soundTick();
    }
    if (timerSec >= targetSec) completeSet();
  }

  function tickRest() {
    timerSec--;
    updateRing(timerSec, targetSec);
    $('session-ring-time').textContent = Math.floor(timerSec / 60) + ':' + fmt2(timerSec % 60);
    if (timerSec <= 3 && timerSec > 0) {
      $('session-ring-time').className = 'session-ring-time red';
      soundUrgent();
    } else if (timerSec <= 10) {
      $('session-ring-time').className = 'session-ring-time red';
    }
    if (timerSec <= 0) {
      clearInterval(intervalId);
      soundRestEnd();
      $('session-ring-time').textContent = '¡Ya!';
      setMode('idle');
    }
  }

  function updateRing(cur, total) {
    $('session-ring-arc').style.strokeDashoffset = Math.max(0, 314 - 314 * (cur / total));
  }

  function toggleTimer() {
    const ex = EXERCISES()[exIdx];
    if (mode === 'idle') {
      if (ex.workSec > 0) setMode('work'); else completeSet();
    } else if (mode === 'work') {
      clearInterval(intervalId);
      mode = 'paused';
      $('session-btn-label').textContent = 'Reanudar';
      $('session-btn-icon').innerHTML = SVG.play;
    } else if (mode === 'paused') {
      mode = 'work';
      $('session-btn-label').textContent = 'Pausar';
      $('session-btn-icon').innerHTML = SVG.pause;
      intervalId = setInterval(tickWork, 1000);
    } else if (mode === 'rest') {
      setMode('idle');
    }
  }

  function completeSet() {
    soundDone();
    setsDone++;
    renderDots();
    if (setsDone >= EXERCISES()[exIdx].sets) {
      setTimeout(nextExercise, 350);
    } else {
      setMode('rest');
    }
  }

  function nextExercise() {
    clearInterval(intervalId);
    exIdx++;
    setsDone = 0;
    selectedRpe = 0;
    if (exIdx >= EXERCISES().length) {
      showCompletion();
      return;
    }
    renderExercise();
  }

  function showCompletion() {
    clearInterval(elapsedId);
    $('session-progress-bar').style.width = '100%';
    const totalSets = EXERCISES().reduce((a, e) => a + e.sets, 0);
    const mins = Math.floor(elapsedSec / 60);
    const exCount = EXERCISES().length;
    const screen = $('session-screen');
    if (!screen) return;

    let logFeel = null, logRpe = null;
    const logTags = new Set();
    const PRESET_TAGS = ['Poleas tensas', 'Buena adherencia', 'Sin dolor', 'Hombro cargado', 'Mucho calor', 'Bien descansado', 'Sin energía'];

    function updateSaveBtn() {
      const btn = document.getElementById('plog-save-btn');
      if (btn) btn.disabled = !(logFeel && logRpe);
    }

    function buildFeel() {
      document.querySelectorAll('.plog-feel-btn').forEach(btn => {
        const f = btn.dataset.feel;
        const clsMap = { beast: 'sel-beast', great: 'sel-great', ok: 'sel-ok', bad: 'sel-bad' };
        btn.className = 'plog-feel-btn' + (f === logFeel ? ' ' + clsMap[f] : '');
        btn.onclick = () => { logFeel = f; buildFeel(); updateSaveBtn(); };
      });
    }

    function buildRpe() {
      const row = document.getElementById('plog-rpe-row');
      if (!row) return;
      row.innerHTML = '';
      [5, 6, 7, 8, 9, 10].forEach(v => {
        const btn = document.createElement('button');
        const colorCls = v >= 9 ? ' hi' : v >= 8 ? ' warn' : '';
        btn.className = 'plog-rpe-num' + colorCls + (v === logRpe ? ' sel' : '');
        btn.textContent = v;
        btn.onclick = () => {
          logRpe = v;
          const avg = document.getElementById('plog-rpe-avg');
          if (avg) avg.textContent = v;
          buildRpe();
          updateSaveBtn();
        };
        row.appendChild(btn);
      });
    }

    function buildTags() {
      const row = document.getElementById('plog-tags-row');
      if (!row) return;
      row.innerHTML = '';
      PRESET_TAGS.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'plog-tag' + (logTags.has(t) ? ' sel' : '');
        btn.textContent = t;
        btn.onclick = () => { logTags.has(t) ? logTags.delete(t) : logTags.add(t); buildTags(); };
        row.appendChild(btn);
      });
    }

    function buildHeatmap() {
      const container = document.getElementById('plog-heatmap');
      if (!container) return;
      container.innerHTML = '';
      const today = new Date();
      const dow = (today.getDay() + 6) % 7; // 0=Mon
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - dow - 49); // 8 weeks ago (Monday)
      const dummy = [0,0,1,0,2,0,0, 0,2,0,1,0,2,0, 1,0,2,0,0,1,0, 0,3,0,1,0,2,0, 1,0,2,0,1,0,0, 0,2,0,3,0,1,0, 2,0,1,0,2,0,1, 0,0,0,0,0,0,0];
      for (let i = 0; i < 56; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const isToday = d.toDateString() === today.toDateString();
        const cell = document.createElement('div');
        const lvl = isToday ? 3 : (dummy[i] || 0);
        cell.className = 'plog-hm-cell' + (lvl > 0 ? ' hm-l' + lvl : '') + (isToday ? ' hm-today' : '');
        container.appendChild(cell);
      }
    }

    function showSaved() {
      const notes = (document.getElementById('plog-notes') || {}).value || '';
      const feelLabel = { beast: 'Bestia', great: 'Bien', ok: 'Normal', bad: 'Cansado' }[logFeel] || '';
      screen.innerHTML = `
        <div class="session-topbar">
          <div class="session-topbar-left">
            <span class="plog-title">Sesión guardada</span>
          </div>
        </div>
        <div class="plog-scroll plog-done-center">
          <div class="plog-done-icon">🏆</div>
          <div class="plog-done-title">¡Bien hecho!</div>
          <div class="plog-done-sub">${mins} min · ${feelLabel} · RPE ${logRpe}</div>
          ${notes ? `<div class="plog-done-notes">"${notes}"</div>` : ''}
          <div class="plog-progress-banner">
            <div class="plog-progress-label">SUGERENCIA PARA PRÓXIMA SESIÓN</div>
            <div class="plog-progress-text">Max hang +22kg · Campus 1-5-9 mantén carga</div>
          </div>
          <button class="plog-save-btn" id="plog-close-done">Cerrar</button>
        </div>`;
      document.getElementById('plog-close-done').addEventListener('click', close);
    }

    screen.innerHTML = `
      <div class="session-topbar">
        <div class="session-topbar-left">
          <span class="plog-title">Log post-sesión</span>
        </div>
        <button class="plog-skip" id="plog-skip">Omitir</button>
      </div>
      <div class="plog-scroll">
        <div class="plog-sec">
          <div class="plog-sec-label">RESUMEN</div>
          <div class="plog-stats-grid">
            <div class="plog-stat"><div class="plog-stat-val">${mins} min</div><div class="plog-stat-lbl">Duración</div></div>
            <div class="plog-stat"><div class="plog-stat-val">${totalSets}</div><div class="plog-stat-lbl">Series completadas</div></div>
            <div class="plog-stat"><div class="plog-stat-val">${exCount} / ${exCount}</div><div class="plog-stat-lbl">Ejercicios</div></div>
            <div class="plog-stat"><div class="plog-stat-val" id="plog-rpe-avg">—</div><div class="plog-stat-lbl">RPE medio</div></div>
          </div>
        </div>
        <div class="plog-sec">
          <div class="plog-sec-label">¿CÓMO TE SIENTES?</div>
          <div class="plog-feel-row" id="plog-feel-row">
            <button class="plog-feel-btn" data-feel="beast"><span class="plog-feel-icon">🔥</span><span class="plog-feel-lbl">Bestia</span></button>
            <button class="plog-feel-btn" data-feel="great"><span class="plog-feel-icon">😊</span><span class="plog-feel-lbl">Bien</span></button>
            <button class="plog-feel-btn" data-feel="ok"><span class="plog-feel-icon">😐</span><span class="plog-feel-lbl">Normal</span></button>
            <button class="plog-feel-btn" data-feel="bad"><span class="plog-feel-icon">😔</span><span class="plog-feel-lbl">Cansado</span></button>
          </div>
        </div>
        <div class="plog-sec">
          <div class="plog-sec-label">RPE GLOBAL DE LA SESIÓN</div>
          <div class="plog-rpe-row" id="plog-rpe-row"></div>
        </div>
        <div class="plog-sec">
          <div class="plog-sec-label">NOTAS</div>
          <textarea class="plog-notes" id="plog-notes" rows="3" placeholder="Sensaciones, lesiones, contexto... (opcional)"></textarea>
          <div class="plog-tags-row" id="plog-tags-row"></div>
        </div>
        <div class="plog-sec plog-sec-last">
          <div class="plog-sec-label">ACTIVIDAD — ÚLTIMAS 8 SEMANAS</div>
          <div class="plog-day-headers"><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
          <div class="plog-heatmap" id="plog-heatmap"></div>
          <div class="plog-hm-legend">
            <span class="plog-hm-lbl">Menos</span>
            <div class="plog-hm-cell"></div><div class="plog-hm-cell hm-l1"></div><div class="plog-hm-cell hm-l2"></div><div class="plog-hm-cell hm-l3"></div><div class="plog-hm-cell hm-l4"></div>
            <span class="plog-hm-lbl">Más</span>
          </div>
        </div>
      </div>
      <div class="plog-footer">
        <button class="plog-save-btn" id="plog-save-btn" disabled>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Guardar sesión
        </button>
      </div>`;

    buildFeel();
    buildRpe();
    buildTags();
    buildHeatmap();
    document.getElementById('plog-skip').addEventListener('click', close);
    document.getElementById('plog-save-btn').addEventListener('click', () => { if (logFeel && logRpe) showSaved(); });
  }

  function showRpe() {
    const ex = EXERCISES()[exIdx];
    if (!ex.rpeTarget) return;
    const sec = $('session-rpe-section');
    sec.style.display = 'block';
    const dots = $('session-rpe-dots');
    const values = [6, 7, 8, 9, 10];
    dots.innerHTML = values.map(v => {
      const colorCls = v <= 7 ? '' : v <= 8 ? ' warn' : ' hi';
      const selCls = v === selectedRpe ? ' selected' : '';
      return `<button class="session-rpe-dot${colorCls}${selCls}" data-v="${v}">${v}</button>`;
    }).join('');
    dots.querySelectorAll('.session-rpe-dot').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedRpe = parseInt(btn.dataset.v);
        dots.querySelectorAll('.session-rpe-dot').forEach((b, i) => {
          const val = values[i];
          const cc = val <= 7 ? '' : val <= 8 ? ' warn' : ' hi';
          const sc = val === selectedRpe ? ' selected' : '';
          b.className = `session-rpe-dot${cc}${sc}`;
        });
      });
    });
  }

  // Wire up static buttons
  document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = $('session-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', close);
    const btnMain = $('session-btn-main');
    if (btnMain) btnMain.addEventListener('click', toggleTimer);
    const btnReset = $('session-btn-reset');
    if (btnReset) btnReset.addEventListener('click', () => setMode('idle'));
    const btnSet = $('session-btn-set');
    if (btnSet) btnSet.addEventListener('click', completeSet);
    const skipBtn = $('session-skip-btn');
    if (skipBtn) skipBtn.addEventListener('click', nextExercise);
  });

  window.openActiveSession = open;
  window.closeActiveSession = close;
})();

// ================== PLAN EDITOR MODULE ==================
(function () {
  const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const MIN_WEEKS = 1;
  const MAX_WEEKS = 16;

  const SVG = {
    back: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`,
    close: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    chevDown: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
    chevUp: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`,
    grip: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" opacity="0.35"><circle cx="9" cy="5" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="9" cy="19" r="1.3"/><circle cx="15" cy="5" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="15" cy="19" r="1.3"/></svg>`,
    x: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    plus: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    minus: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    save: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    edit: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  };

  const TEMPLATES = [
    {
      label: 'Fuerza máxima', name: 'Fuerza máx. 4 semanas', weeks: 4,
      activeDays: [true, false, true, false, true, false, false],
      sessions: [
        { day: 'L', name: 'Fuerza dedos', expanded: true, exercises: [
          { name: 'Max hang · 20mm', sets: 4, workSec: 10, reps: 0, weight: 20, restSec: 180, rpeTarget: 8 },
          { name: 'Campus board · 1-5-9', sets: 3, workSec: 0, reps: 5, weight: 0, restSec: 120, rpeTarget: 7 },
          { name: 'Pullover isométrico', sets: 3, workSec: 7, reps: 0, weight: 0, restSec: 120, rpeTarget: 6 },
        ]},
        { day: 'X', name: 'Potencia', expanded: false, exercises: [
          { name: 'Dynos a dedo', sets: 5, workSec: 0, reps: 3, weight: 0, restSec: 180, rpeTarget: 8 },
        ]},
        { day: 'V', name: 'Resistencia + antagonistas', expanded: false, exercises: [
          { name: 'ARC · panel 45°', sets: 2, workSec: 1200, reps: 0, weight: 0, restSec: 300, rpeTarget: 6 },
          { name: 'Manguito rotador', sets: 3, workSec: 0, reps: 15, weight: 0, restSec: 60, rpeTarget: 5 },
        ]},
      ]
    },
    {
      label: 'Resistencia', name: 'Resistencia 6 sem', weeks: 6,
      activeDays: [false, true, false, true, false, true, false],
      sessions: [
        { day: 'M', name: 'ARC largo', expanded: true, exercises: [
          { name: 'ARC · panel 30°', sets: 2, workSec: 1800, reps: 0, weight: 0, restSec: 300, rpeTarget: 5 },
        ]},
        { day: 'J', name: '4×4 bloque', expanded: false, exercises: [
          { name: '4×4 bloque', sets: 4, workSec: 0, reps: 4, weight: 0, restSec: 240, rpeTarget: 7 },
        ]},
        { day: 'S', name: 'Capacidad aeróbica', expanded: false, exercises: [
          { name: 'Travesías largas', sets: 3, workSec: 600, reps: 0, weight: 0, restSec: 300, rpeTarget: 6 },
        ]},
      ]
    },
    {
      label: 'Periodización lineal', name: 'Periodización lineal 8 sem', weeks: 8,
      activeDays: [true, true, false, true, true, false, false],
      sessions: [
        { day: 'L', name: 'Hipertrofia tracción', expanded: true, exercises: [
          { name: 'Dominadas lastradas', sets: 4, workSec: 0, reps: 8, weight: 10, restSec: 120, rpeTarget: 7 },
        ]},
        { day: 'M', name: 'Fuerza dedos', expanded: false, exercises: [
          { name: 'Max hang · 20mm', sets: 4, workSec: 10, reps: 0, weight: 15, restSec: 180, rpeTarget: 8 },
        ]},
        { day: 'J', name: 'Potencia', expanded: false, exercises: [
          { name: 'Campus 1-5-9', sets: 4, workSec: 0, reps: 4, weight: 0, restSec: 180, rpeTarget: 8 },
        ]},
        { day: 'V', name: 'Resistencia específica', expanded: false, exercises: [
          { name: '4×4', sets: 4, workSec: 0, reps: 4, weight: 0, restSec: 240, rpeTarget: 7 },
        ]},
      ]
    },
    {
      label: 'Bloque específico', name: 'Bloque proyecto', weeks: 3,
      activeDays: [true, false, true, false, true, false, false],
      sessions: [
        { day: 'L', name: 'Pegues del proyecto', expanded: true, exercises: [
          { name: 'Intentos al proyecto', sets: 5, workSec: 0, reps: 1, weight: 0, restSec: 600, rpeTarget: 9 },
        ]},
        { day: 'X', name: 'Trabajo de movimientos', expanded: false, exercises: [
          { name: 'Repetir secciones clave', sets: 4, workSec: 0, reps: 3, weight: 0, restSec: 300, rpeTarget: 8 },
        ]},
        { day: 'V', name: 'Mantenimiento + antagonistas', expanded: false, exercises: [
          { name: 'Manguito rotador', sets: 3, workSec: 0, reps: 15, weight: 0, restSec: 60, rpeTarget: 5 },
        ]},
      ]
    },
    {
      label: 'Desde cero', name: '', weeks: 4,
      activeDays: [true, false, true, false, true, false, false],
      sessions: []
    },
  ];

  const LIBRARY = [
    { name: 'Max hang', detail: 'Suspensión en media llave', cat: 'str' },
    { name: 'Campus board 1-5-9', detail: 'Explosividad de dedos', cat: 'pow' },
    { name: 'Block pull · máx', detail: 'Fuerza en bloque', cat: 'str' },
    { name: 'Dynos a dedo', detail: 'Potencia explosiva', cat: 'pow' },
    { name: 'ARC en panel', detail: 'Resistencia aeróbica', cat: 'str' },
    { name: 'Pullover isométrico', detail: 'Fuerza hombro', cat: 'str' },
    { name: 'Manguito rotador', detail: 'Antagonista hombro', cat: 'ant' },
    { name: 'Core · plancha', detail: 'Estabilización central', cat: 'ant' },
    { name: 'Estiramiento muñecas', detail: 'Flexores y extensores', cat: 'ant' },
  ];

  let planData = null;
  let templateIdx = 0;
  let libForSession = -1;
  let openDayPickerSi = -1;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function loadTemplate(idx) {
    templateIdx = idx;
    const t = clone(TEMPLATES[idx]);
    planData = {
      name: t.name,
      weeks: t.weeks,
      activeDays: t.activeDays,
      sessions: t.sessions,
    };
  }

  function open() {
    loadTemplate(0);
    const modal = document.getElementById('plan-editor-modal');
    if (!modal) return;
    renderModal();
    document.body.classList.add('plan-editor-open');
    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('pe-open'));
  }

  function close() {
    closeLibrary();
    openDayPickerSi = -1;
    const modal = document.getElementById('plan-editor-modal');
    if (!modal) return;
    modal.classList.remove('pe-open');
    document.body.classList.remove('plan-editor-open');
    setTimeout(() => modal.classList.add('hidden'), 280);
  }

  function renderModal() {
    const modal = document.getElementById('plan-editor-modal');
    modal.innerHTML = `
      <div class="pe-screen">
        <div class="pe-topbar">
          <div class="pe-topbar-left">
            <button class="pe-back-btn" id="pe-back-btn" aria-label="Volver">${SVG.back}</button>
            <span class="pe-title">Nuevo plan</span>
          </div>
          <button class="pe-save-top" id="pe-save-top">Guardar</button>
        </div>
        <div class="pe-scroll">
          <div class="pe-sec">
            <div class="pe-sec-label">NOMBRE DEL PLAN</div>
            <input class="pe-name-input" id="pe-name-input" type="text" placeholder="Ej: Fuerza máx. 4 semanas" value="${planData.name}" autocomplete="off">
          </div>

          <div class="pe-sec">
            <div class="pe-sec-label">EMPEZAR DESDE PLANTILLA</div>
            <div class="pe-tpl-row" id="pe-tpl-row">
              ${TEMPLATES.map((t, i) => `<button class="pe-tpl-chip${i === templateIdx ? ' active' : ''}" data-tidx="${i}">${t.label}</button>`).join('')}
            </div>
            <div class="pe-tpl-hint">Aplicar una plantilla reemplaza las sesiones actuales.</div>
          </div>

          <div class="pe-sec">
            <div class="pe-sec-label">DURACIÓN</div>
            <div class="pe-stepper" id="pe-stepper">
              <button class="pe-step-btn" id="pe-step-minus" aria-label="Menos">${SVG.minus}</button>
              <div class="pe-step-val">
                <span id="pe-step-num">${planData.weeks}</span>
                <span class="pe-step-unit">semanas</span>
              </div>
              <button class="pe-step-btn" id="pe-step-plus" aria-label="Más">${SVG.plus}</button>
            </div>
          </div>

          <div class="pe-sec">
            <div class="pe-sec-label">DÍAS DE ENTRENAMIENTO <span class="pe-sec-meta" id="pe-days-count"></span></div>
            <div class="pe-days-grid" id="pe-days-grid"></div>
            <div class="pe-tpl-hint">Toca un día para activarlo. Las sesiones pueden asignarse a cualquiera de estos días.</div>
          </div>

          <div class="pe-sec">
            <div class="pe-sec-label">SESIONES <span class="pe-sec-meta" id="pe-sess-count"></span></div>
            <div class="pe-session-list" id="pe-session-list"></div>
            <button class="pe-add-session-btn" id="pe-add-session-btn">${SVG.plus} Añadir sesión</button>
          </div>

          <div class="pe-sec pe-sec-last">
            <button class="pe-save-bottom" id="pe-save-bottom">${SVG.save} Guardar plan</button>
          </div>
        </div>
      </div>`;

    // Static events (rendered once)
    document.getElementById('pe-back-btn').onclick = close;
    document.getElementById('pe-save-top').onclick = savePlan;
    document.getElementById('pe-save-bottom').onclick = savePlan;
    document.getElementById('pe-name-input').oninput = e => { planData.name = e.target.value; };

    document.getElementById('pe-tpl-row').onclick = e => {
      const chip = e.target.closest('.pe-tpl-chip');
      if (!chip) return;
      const idx = parseInt(chip.dataset.tidx);
      loadTemplate(idx);
      const input = document.getElementById('pe-name-input');
      if (input) input.value = planData.name;
      document.getElementById('pe-step-num').textContent = planData.weeks;
      document.querySelectorAll('.pe-tpl-chip').forEach((c, i) => c.classList.toggle('active', i === templateIdx));
      renderDays();
      renderSessions();
    };

    document.getElementById('pe-step-minus').onclick = () => {
      if (planData.weeks > MIN_WEEKS) {
        planData.weeks--;
        document.getElementById('pe-step-num').textContent = planData.weeks;
      }
    };
    document.getElementById('pe-step-plus').onclick = () => {
      if (planData.weeks < MAX_WEEKS) {
        planData.weeks++;
        document.getElementById('pe-step-num').textContent = planData.weeks;
      }
    };

    document.getElementById('pe-add-session-btn').onclick = () => {
      const active = DAYS.filter((_, i) => planData.activeDays[i]);
      const usedSet = new Set(planData.sessions.map(s => s.day));
      const freeDay = active.find(d => !usedSet.has(d)) || active[0] || 'L';
      planData.sessions.push({ day: freeDay, name: 'Nueva sesión', expanded: true, exercises: [] });
      renderSessions();
    };

    // Single delegated handler on session list (no accumulation)
    const list = document.getElementById('pe-session-list');
    list.onclick = handleSessionListClick;

    // Close day picker on outside click
    document.getElementById('plan-editor-modal').onclick = e => {
      if (openDayPickerSi !== -1 && !e.target.closest('.pe-day-picker') && !e.target.closest('.pe-session-badge')) {
        openDayPickerSi = -1;
        renderSessions();
      }
    };

    renderDays();
    renderSessions();
  }

  function handleSessionListClick(e) {
    // Editable name input — don't bubble
    if (e.target.closest('.pe-session-name-input')) return;

    // Day picker option
    const dayOpt = e.target.closest('.pe-day-opt');
    if (dayOpt) {
      e.stopPropagation();
      const si = parseInt(dayOpt.dataset.si);
      const d = dayOpt.dataset.d;
      const dIdx = DAYS.indexOf(d);
      if (dIdx >= 0 && !planData.activeDays[dIdx]) planData.activeDays[dIdx] = true; // auto-activate
      planData.sessions[si].day = d;
      openDayPickerSi = -1;
      renderDays();
      renderSessions();
      return;
    }

    // Session day badge — toggle picker
    const badge = e.target.closest('.pe-session-badge');
    if (badge) {
      e.stopPropagation();
      const si = parseInt(badge.dataset.si);
      openDayPickerSi = openDayPickerSi === si ? -1 : si;
      renderSessions();
      return;
    }

    // Delete exercise
    const delBtn = e.target.closest('.pe-ex-del');
    if (delBtn) {
      planData.sessions[parseInt(delBtn.dataset.si)].exercises.splice(parseInt(delBtn.dataset.ei), 1);
      renderSessions();
      return;
    }

    // Add exercise
    const addBtn = e.target.closest('.pe-add-ex-btn');
    if (addBtn) {
      openLibrary(parseInt(addBtn.dataset.si));
      return;
    }

    // Delete session
    const delSess = e.target.closest('.pe-session-del');
    if (delSess) {
      e.stopPropagation();
      planData.sessions.splice(parseInt(delSess.dataset.si), 1);
      renderSessions();
      return;
    }

    // Edit session name button
    const editName = e.target.closest('.pe-session-edit');
    if (editName) {
      e.stopPropagation();
      const si = parseInt(editName.dataset.si);
      const nameEl = document.querySelector(`.pe-session-card[data-si="${si}"] .pe-session-name`);
      if (!nameEl) return;
      const current = planData.sessions[si].name;
      nameEl.innerHTML = `<input class="pe-session-name-input" type="text" value="${current.replace(/"/g, '&quot;')}" maxlength="40">`;
      const inp = nameEl.querySelector('input');
      inp.focus();
      inp.select();
      const commit = () => {
        planData.sessions[si].name = inp.value.trim() || 'Sin nombre';
        renderSessions();
      };
      inp.onblur = commit;
      inp.onkeydown = ev => { if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') { inp.value = current; inp.blur(); } };
      return;
    }

    // Header toggle expand (lowest priority — runs only if nothing above matched)
    const hdr = e.target.closest('.pe-session-header');
    if (hdr) {
      const si = parseInt(hdr.dataset.si);
      planData.sessions[si].expanded = !planData.sessions[si].expanded;
      renderSessions();
    }
  }

  function renderDays() {
    const grid = document.getElementById('pe-days-grid');
    if (!grid) return;
    grid.innerHTML = '';
    DAYS.forEach((d, i) => {
      const btn = document.createElement('button');
      btn.className = 'pe-day-pill' + (planData.activeDays[i] ? ' on' : '');
      btn.textContent = d;
      btn.onclick = () => { planData.activeDays[i] = !planData.activeDays[i]; renderDays(); renderSessions(); };
      grid.appendChild(btn);
    });
    const count = planData.activeDays.filter(Boolean).length;
    const countEl = document.getElementById('pe-days-count');
    if (countEl) countEl.textContent = `· ${count} ${count === 1 ? 'día' : 'días'}/sem`;
  }

  function renderSessions() {
    const list = document.getElementById('pe-session-list');
    if (!list) return;
    const sessCount = document.getElementById('pe-sess-count');
    if (sessCount) sessCount.textContent = `· ${planData.sessions.length}`;

    if (planData.sessions.length === 0) {
      list.innerHTML = `<div class="pe-empty">Aún no hay sesiones. Toca "Añadir sesión" para empezar.</div>`;
      return;
    }

    const rpeColorCls = rpe => rpe >= 9 ? ' hi' : rpe >= 8 ? ' warn' : '';
    const rpeTag = rpe => rpe ? `<span class="pe-ex-rpe${rpeColorCls(rpe)}">RPE ${rpe}</span>` : '';

    list.innerHTML = planData.sessions.map((s, si) => {
      const dIdx = DAYS.indexOf(s.day);
      const isOrphan = dIdx === -1 || !planData.activeDays[dIdx];
      const badgeCls = 'pe-session-badge' + (isOrphan ? ' orphan' : '');

      const picker = openDayPickerSi === si ? `
        <div class="pe-day-picker" data-si="${si}">
          ${DAYS.map(d => {
            const active = planData.activeDays[DAYS.indexOf(d)];
            const sel = d === s.day;
            return `<button class="pe-day-opt${sel ? ' sel' : ''}${active ? '' : ' inactive'}" data-si="${si}" data-d="${d}">${d}</button>`;
          }).join('')}
        </div>` : '';

      const exHTML = s.expanded ? `
        <div class="pe-ex-list">
          ${s.exercises.length === 0 ? '<div class="pe-ex-empty">Sin ejercicios todavía</div>' : s.exercises.map((ex, ei) => `
            <div class="pe-ex-row">
              <span class="pe-ex-drag">${SVG.grip}</span>
              <div class="pe-ex-info">
                <div class="pe-ex-name">${ex.name}</div>
                <div class="pe-ex-detail">${typeof buildExDetail === 'function' ? buildExDetail(ex) : ''}</div>
              </div>
              ${rpeTag(ex.rpeTarget)}
              <button class="pe-ex-del" data-si="${si}" data-ei="${ei}" aria-label="Eliminar">${SVG.x}</button>
            </div>`).join('')}
          <button class="pe-add-ex-btn" data-si="${si}">${SVG.plus} Añadir ejercicio</button>
        </div>` : '';

      return `
        <div class="pe-session-card" data-si="${si}">
          <div class="pe-session-header" data-si="${si}">
            <div class="pe-badge-wrap">
              <button class="${badgeCls}" data-si="${si}" title="Cambiar día">${s.day}</button>
              ${picker}
            </div>
            <div class="pe-session-info">
              <div class="pe-session-name">${s.name}</div>
              <div class="pe-session-count">${s.exercises.length} ejercicio${s.exercises.length !== 1 ? 's' : ''}${isOrphan ? ' · ⚠️ día inactivo' : ''}</div>
            </div>
            <button class="pe-session-edit" data-si="${si}" aria-label="Renombrar">${SVG.edit}</button>
            <button class="pe-session-del" data-si="${si}" aria-label="Eliminar sesión">${SVG.x}</button>
            <span class="pe-session-chev">${s.expanded ? SVG.chevUp : SVG.chevDown}</span>
          </div>
          ${exHTML}
        </div>`;
    }).join('');
  }

  function openLibrary(si) {
    libForSession = si;
    closeLibrary();
    const catLabel = { str: 'Fuerza', pow: 'Potencia', ant: 'Antag.' };
    const sheet = document.createElement('div');
    sheet.id = 'pe-lib-sheet';
    sheet.className = 'pe-lib-sheet';
    sheet.innerHTML = `
      <div class="pe-lib-backdrop" id="pe-lib-backdrop"></div>
      <div class="pe-lib-panel">
        <div class="pe-lib-handle"></div>
        <div class="pe-lib-head">
          <span class="pe-lib-title">Biblioteca de ejercicios</span>
          <button class="pe-lib-close" id="pe-lib-close" aria-label="Cerrar">${SVG.close}</button>
        </div>
        <div class="pe-lib-list">
          ${LIBRARY.map((ex, i) => `
            <div class="pe-lib-item" data-lidx="${i}">
              <span class="pe-lib-cat ${ex.cat}">${catLabel[ex.cat]}</span>
              <div class="pe-lib-info">
                <div class="pe-lib-name">${ex.name}</div>
                <div class="pe-lib-detail">${ex.detail}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
    document.getElementById('plan-editor-modal').appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add('pe-lib-open'));
    document.getElementById('pe-lib-backdrop').onclick = closeLibrary;
    document.getElementById('pe-lib-close').onclick = closeLibrary;
    sheet.querySelector('.pe-lib-list').onclick = e => {
      const item = e.target.closest('.pe-lib-item');
      if (!item) return;
      const ex = LIBRARY[parseInt(item.dataset.lidx)];
      planData.sessions[libForSession].exercises.push({ name: ex.name, sets: 3, workSec: 0, reps: 10, weight: 0, restSec: 120, rpeTarget: 7 });
      closeLibrary();
      renderSessions();
    };
  }

  function closeLibrary() {
    const sheet = document.getElementById('pe-lib-sheet');
    if (!sheet) return;
    sheet.classList.remove('pe-lib-open');
    setTimeout(() => { if (sheet.parentNode) sheet.remove(); }, 250);
  }

  function savePlan() {
    const name = planData.name || 'Mi plan';
    const activeDayLabels = DAYS.filter((_, i) => planData.activeDays[i]);
    const totalEx = planData.sessions.reduce((a, s) => a + s.exercises.length, 0);
    const screen = document.querySelector('#plan-editor-modal .pe-screen');
    if (!screen) return;
    screen.innerHTML = `
      <div class="pe-topbar">
        <div class="pe-topbar-left">
          <button class="pe-back-btn" id="pe-saved-back" aria-label="Cerrar">${SVG.back}</button>
        </div>
      </div>
      <div class="pe-saved-wrap">
        <div class="pe-saved-icon">✅</div>
        <div class="pe-saved-title">${name}</div>
        <div class="pe-saved-sub">${planData.weeks} semanas · ${planData.sessions.length} sesiones · ${activeDayLabels.join(', ')} · ${totalEx} ejercicios</div>
        <button class="pe-save-bottom" id="pe-saved-done">Empezar plan →</button>
      </div>`;
    document.getElementById('pe-saved-back').onclick = close;
    document.getElementById('pe-saved-done').onclick = close;
  }

  window.openPlanEditor = open;
})();
