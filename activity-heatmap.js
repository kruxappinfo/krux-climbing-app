// ================== ACTIVITY HEATMAP ==================
// Consistencia anual: heatmap con filtros por tipo de sesión,
// intensidad por RPE y patrón semanal.
//
// USO (datos ya cargados desde app_3.js):
//   const hm = new ActivityHeatmap('contenedor-id');
//   hm.initWithData(gymAscents);   // gymAscents = array de objetos ascent
//   hm.destroy();                  // limpieza al salir de la vista
//
// USO (carga directa desde Firestore):
//   const hm = new ActivityHeatmap('contenedor-id');
//   await hm.init(uid);
// ======================================================

class ActivityHeatmap {

    // ============================================
    // CONFIG
    // ============================================
    static TYPES = ['fuerza', 'resistencia', 'bloque', 'indoor', 'tecnica', 'antagonistas'];

    static TYPE_LABELS = {
        fuerza:       'Fuerza dedos',
        resistencia:  'Resistencia',
        bloque:       'Bloque',
        indoor:       'Indoor',
        tecnica:      'Técnica',
        antagonistas: 'Antagonistas',
    };

    static TYPE_COLORS = {
        fuerza:       ['#CECBF6', '#AFA9EC', '#7F77DD', '#534AB7'],
        resistencia:  ['#B5D4F4', '#85B7EB', '#378ADD', '#185FA5'],
        bloque:       ['#F5C4B3', '#F0997B', '#D85A30', '#993C1D'],
        indoor:       ['#FAC775', '#EF9F27', '#BA7517', '#854F0B'],
        tecnica:      ['#C0DD97', '#97C459', '#639922', '#3B6D11'],
        antagonistas: ['#F4C0D1', '#ED93B1', '#D4537E', '#993556'],
    };

    static TYPE_BASE = {
        fuerza:       '#534AB7',
        resistencia:  '#185FA5',
        bloque:       '#993C1D',
        indoor:       '#854F0B',
        tecnica:      '#3B6D11',
        antagonistas: '#993556',
    };

    static MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    static DAYS   = ['L','M','X','J','V','S','D'];

    // ============================================
    // CONSTRUCTOR
    // ============================================
    constructor(containerId) {
        this.containerId  = containerId;
        this.container    = null;
        this.uid          = null;
        this.activeFilter = 'all';
        this.sessions     = {};
        this._tooltipEl   = null;
        this._unsubscribe = null;
    }

    // ============================================
    // INIT con datos ya cargados (modo principal)
    // ============================================
    initWithData(gymAscents) {
        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            console.error(`[ActivityHeatmap] No se encontró #${this.containerId}`);
            return;
        }
        this._injectStyles();
        this._render();

        const startOfYear = new Date(new Date().getFullYear(), 0, 1);
        this.sessions = {};

        gymAscents.forEach(a => {
            const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            if (!d || isNaN(d.getTime()) || d < startOfYear) return;
            const key  = d.toISOString().slice(0, 10);
            const type = this._normalizeType(a.trainingType || a.climbType || a.type || '');
            const rpe  = typeof a.rpe === 'number' ? a.rpe : 5;
            if (!this.sessions[key]) {
                this.sessions[key] = { type, rpe, level: rpe <= 5 ? 1 : rpe <= 7 ? 2 : rpe <= 8 ? 3 : 4 };
            }
        });

        this._buildAll();
    }

    // ============================================
    // INIT con carga directa desde Firestore
    // ============================================
    async init(uid) {
        this.uid       = uid;
        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            console.error(`[ActivityHeatmap] No se encontró #${this.containerId}`);
            return;
        }
        this._injectStyles();
        this._render();
        await this._loadSessions();
        this._buildAll();
    }

    destroy() {
        if (this._unsubscribe) this._unsubscribe();
        if (this._tooltipEl)   this._tooltipEl.remove();
        if (this.container)    this.container.innerHTML = '';
    }

    // ============================================
    // FIRESTORE
    // ============================================
    async _loadSessions() {
        try {
            const startOfYear = new Date(new Date().getFullYear(), 0, 1);
            const snap = await db
                .collection('ascents')
                .where('userId', '==', this.uid)
                .where('date', '>=', startOfYear)
                .get();

            this.sessions = {};
            snap.forEach(doc => {
                const data = doc.data();
                const date = data.date?.toDate?.() ?? new Date(data.date);
                const key  = date.toISOString().slice(0, 10);
                const type = this._normalizeType(data.trainingType || data.style);
                const rpe  = typeof data.rpe === 'number' ? data.rpe : 5;
                this.sessions[key] = { type, rpe, level: rpe <= 5 ? 1 : rpe <= 7 ? 2 : rpe <= 8 ? 3 : 4 };
            });
        } catch (e) {
            console.error('[ActivityHeatmap] Error cargando ascensos:', e);
        }
    }

    _normalizeType(raw) {
        const map = {
            'fuerza':        'fuerza',
            'fuerza dedos':  'fuerza',
            'resistencia':   'resistencia',
            'bloque':        'bloque',
            'boulder':       'bloque',
            'indoor':        'indoor',
            'vías indoor':   'indoor',
            'tecnica':       'tecnica',
            'técnica':       'tecnica',
            'antagonistas':  'antagonistas',
        };
        return map[(raw || '').toLowerCase().trim()] ?? 'indoor';
    }

    // ============================================
    // RENDER — esqueleto HTML (sin streak cards)
    // ============================================
    _render() {
        this.container.innerHTML = `
<div class="ahm-root">
  <div class="ahm-filters" id="ahm-filters">
    <button class="ahm-filter active" data-type="all">Todas</button>
    <button class="ahm-filter" data-type="fuerza">Fuerza dedos</button>
    <button class="ahm-filter" data-type="resistencia">Resistencia</button>
    <button class="ahm-filter" data-type="bloque">Bloque</button>
    <button class="ahm-filter" data-type="indoor">Indoor</button>
    <button class="ahm-filter" data-type="tecnica">Técnica</button>
    <button class="ahm-filter" data-type="antagonistas">Antagonistas</button>
  </div>

  <div class="ahm-month-labels" id="ahm-months"></div>
  <div class="ahm-hm-outer">
    <div class="ahm-day-labels">
      <div class="ahm-day" style="opacity:0">·</div>
      <div class="ahm-day">L</div>
      <div class="ahm-day" style="opacity:0">·</div>
      <div class="ahm-day">X</div>
      <div class="ahm-day" style="opacity:0">·</div>
      <div class="ahm-day">V</div>
      <div class="ahm-day" style="opacity:0">·</div>
    </div>
    <div class="ahm-hm-wrap">
      <div class="ahm-grid" id="ahm-grid"></div>
    </div>
  </div>

  <div class="ahm-legend-rpe" id="ahm-legend-rpe">
    <span>Menos</span>
    <div class="ahm-lcell" style="background:var(--color-background-secondary)"></div>
    <div class="ahm-lcell" id="ahm-l1"></div>
    <div class="ahm-lcell" id="ahm-l2"></div>
    <div class="ahm-lcell" id="ahm-l3"></div>
    <div class="ahm-lcell" id="ahm-l4"></div>
    <span>Más &nbsp; Intensidad (RPE)</span>
  </div>
  <div class="ahm-legend-all" id="ahm-legend-all"></div>

  <div class="ahm-weekly-section">
    <div class="ahm-subtitle">Patrón semanal</div>
    <div class="ahm-weekly-row" id="ahm-weekly"></div>
  </div>
</div>`;

        this._tooltipEl = document.createElement('div');
        this._tooltipEl.className = 'ahm-tooltip';
        this._tooltipEl.id = 'ahm-tooltip';
        document.body.appendChild(this._tooltipEl);

        this.container.querySelector('#ahm-filters').addEventListener('click', e => {
            const btn = e.target.closest('.ahm-filter');
            if (!btn) return;
            this.container.querySelectorAll('.ahm-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.activeFilter = btn.dataset.type;
            this._buildAll();
        });
    }

    // ============================================
    // BUILD
    // ============================================
    _buildAll() {
        const sessions = this._getFiltered();
        this._buildGrid(sessions);
        this._updateLegend();
        this._buildWeekly(sessions);
    }

    _getFiltered() {
        if (this.activeFilter === 'all') return this.sessions;
        const out = {};
        for (const [k, v] of Object.entries(this.sessions))
            if (v.type === this.activeFilter) out[k] = v;
        return out;
    }

    _buildGrid(sessions) {
        const now   = new Date();
        const start = new Date(now.getFullYear(), 0, 1);
        const end   = new Date(now.getFullYear(), 11, 31);

        const grid   = this.container.querySelector('#ahm-grid');
        const months = this.container.querySelector('#ahm-months');
        grid.innerHTML = ''; months.innerHTML = '';

        let ws = new Date(start);
        ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));

        let col = 0;
        const monthTrack = {};
        let d = new Date(ws);

        while (d <= end || (d.getDay() + 6) % 7 !== 0) {
            const key    = d.toISOString().slice(0, 10);
            const s      = sessions[key];
            const inYear = d >= start && d <= end;
            const inPast = d <= now;

            const cell = document.createElement('div');
            cell.className = 'ahm-cell';

            if (inYear && inPast && s) {
                cell.style.background = this._cellColor(s);
                cell.addEventListener('mousemove', e => this._showTooltip(e, key, s));
                cell.addEventListener('mouseleave', () => this._hideTooltip());
            }

            const dow = (d.getDay() + 6) % 7;
            if (dow === 0) {
                const m = d.getMonth();
                if (!monthTrack[m]) monthTrack[m] = col;
            }

            grid.appendChild(cell);
            d.setDate(d.getDate() + 1);
            if ((d.getDay() + 6) % 7 === 0) col++;
            if (d > end && (d.getDay() + 6) % 7 === 0) break;
        }

        for (const m of Object.keys(monthTrack)) {
            const lbl = document.createElement('div');
            lbl.className   = 'ahm-month-label';
            lbl.textContent = ActivityHeatmap.MONTHS[m];
            months.appendChild(lbl);
        }
    }

    _cellColor(s) {
        if (this.activeFilter === 'all') return ActivityHeatmap.TYPE_BASE[s.type];
        return ActivityHeatmap.TYPE_COLORS[s.type][s.level - 1];
    }

    _updateLegend() {
        const rpeEl = this.container.querySelector('#ahm-legend-rpe');
        const allEl = this.container.querySelector('#ahm-legend-all');

        if (this.activeFilter === 'all') {
            rpeEl.style.display = 'none';
            allEl.style.display = 'flex';
            allEl.innerHTML = ActivityHeatmap.TYPES.map(t => `
                <div class="ahm-legend-item">
                    <div class="ahm-legend-dot" style="background:${ActivityHeatmap.TYPE_BASE[t]}"></div>
                    <span>${ActivityHeatmap.TYPE_LABELS[t]}</span>
                </div>`).join('');
        } else {
            rpeEl.style.display = 'flex';
            allEl.style.display = 'none';
            const cols = ActivityHeatmap.TYPE_COLORS[this.activeFilter];
            ['l1','l2','l3','l4'].forEach((id, i) => {
                this.container.querySelector(`#ahm-${id}`).style.background = cols[i];
            });
        }
    }

    _buildWeekly(sessions) {
        const counts = [0,0,0,0,0,0,0];
        for (const k of Object.keys(sessions))
            counts[(new Date(k).getDay() + 6) % 7]++;

        const max    = Math.max(...counts, 1);
        const minIdx = counts.indexOf(Math.min(...counts));
        const color  = this.activeFilter === 'all'
            ? '#639922'
            : ActivityHeatmap.TYPE_BASE[this.activeFilter];

        const wr = this.container.querySelector('#ahm-weekly');
        wr.innerHTML = '';

        counts.forEach((c, i) => {
            const h   = Math.round((c / max) * 36);
            const col = document.createElement('div');
            col.className = 'ahm-weekly-col';
            const isWorst = i === minIdx;
            col.innerHTML = `
                <div class="ahm-wbar-wrap">
                    <div class="ahm-wbar" style="
                        height:${h}px;
                        background:${isWorst ? 'transparent' : color};
                        ${isWorst ? `border:1px dashed ${color};` : ''}
                    "></div>
                </div>
                <div class="ahm-wlabel">${ActivityHeatmap.DAYS[i]}</div>`;
            wr.appendChild(col);
        });
    }

    // ============================================
    // TOOLTIP
    // ============================================
    _showTooltip(e, key, s) {
        const t = this._tooltipEl;
        t.innerHTML = `
            <span class="ahm-tt-dot" style="background:${ActivityHeatmap.TYPE_BASE[s.type]}"></span>
            <strong>${key}</strong><br>
            ${ActivityHeatmap.TYPE_LABELS[s.type]} · RPE ${s.rpe}`;
        t.style.display = 'block';
        t.style.left    = (e.clientX + 12) + 'px';
        t.style.top     = (e.clientY - 36) + 'px';
    }

    _hideTooltip() {
        this._tooltipEl.style.display = 'none';
    }

    // ============================================
    // ESTILOS — inyectados una sola vez
    // ============================================
    _injectStyles() {
        if (document.getElementById('ahm-styles')) return;
        const style = document.createElement('style');
        style.id = 'ahm-styles';
        style.textContent = `
.ahm-root { padding: 0 0 1rem; font-family: inherit; }

/* filtros */
.ahm-filters { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.ahm-filter {
    font-size: 11px; font-weight: 500; padding: 4px 10px;
    border-radius: 20px; border: 0.5px solid var(--color-border-secondary);
    background: var(--color-background-primary); color: var(--color-text-secondary);
    cursor: pointer; transition: all 0.15s;
}
.ahm-filter.active[data-type="all"]          { background: var(--color-background-secondary); border-color: var(--color-border-primary); color: var(--color-text-primary); }
.ahm-filter.active[data-type="fuerza"]       { background: #534AB7; border-color: #534AB7; color: #EEEDFE; }
.ahm-filter.active[data-type="resistencia"]  { background: #185FA5; border-color: #185FA5; color: #E6F1FB; }
.ahm-filter.active[data-type="bloque"]       { background: #993C1D; border-color: #993C1D; color: #FAECE7; }
.ahm-filter.active[data-type="indoor"]       { background: #854F0B; border-color: #854F0B; color: #FAEEDA; }
.ahm-filter.active[data-type="tecnica"]      { background: #3B6D11; border-color: #3B6D11; color: #EAF3DE; }
.ahm-filter.active[data-type="antagonistas"] { background: #993556; border-color: #993556; color: #FBEAF0; }

/* heatmap */
.ahm-month-labels {
    display: flex; gap: 3px; width: max-content; margin-bottom: 4px; padding-left: 18px;
}
.ahm-month-label {
    font-size: 10px; color: var(--color-text-tertiary);
    width: calc((11px + 3px) * 4.3); white-space: nowrap;
}
.ahm-hm-outer { display: flex; }
.ahm-day-labels {
    display: flex; flex-direction: column; gap: 3px; margin-right: 4px;
}
.ahm-day { font-size: 10px; color: var(--color-text-tertiary); height: 11px; line-height: 11px; }
.ahm-hm-wrap { overflow-x: auto; padding-bottom: 4px; }
.ahm-grid {
    display: grid; grid-auto-flow: column;
    grid-template-rows: repeat(7, 11px); gap: 3px; width: max-content;
}
.ahm-cell {
    width: 11px; height: 11px; border-radius: 2px;
    background: var(--color-background-secondary); cursor: pointer; transition: opacity 0.1s;
}
.ahm-cell:hover { opacity: 0.7; }

/* leyenda RPE */
.ahm-legend-rpe {
    display: flex; align-items: center; gap: 4px; margin-top: 10px;
    font-size: 10px; color: var(--color-text-tertiary);
}
.ahm-lcell { width: 11px; height: 11px; border-radius: 2px; }

/* leyenda Todas */
.ahm-legend-all { display: none; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.ahm-legend-item { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--color-text-secondary); }
.ahm-legend-dot  { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }

/* patrón semanal */
.ahm-weekly-section { margin-top: 16px; }
.ahm-subtitle {
    font-size: 11px; font-weight: 500; color: var(--color-text-secondary);
    text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px;
    display: flex; align-items: center; gap: 6px;
}
.ahm-subtitle::before { content: ''; display: inline-block; width: 14px; height: 14px;
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Crect x='3' y='3' width='4' height='18'/%3E%3Crect x='10' y='8' width='4' height='13'/%3E%3Crect x='17' y='5' width='4' height='16'/%3E%3C/svg%3E") center/contain no-repeat;
}
.ahm-weekly-row { display: flex; gap: 6px; }
.ahm-weekly-col  { flex: 1; text-align: center; }
.ahm-wbar-wrap   { height: 40px; display: flex; align-items: flex-end; justify-content: center; }
.ahm-wbar        { width: 10px; border-radius: 2px 2px 0 0; transition: height 0.3s; }
.ahm-wlabel      { font-size: 10px; color: var(--color-text-tertiary); margin-top: 4px; }

/* tooltip */
.ahm-tooltip {
    position: fixed; display: none; z-index: 9999;
    background: var(--color-background-primary);
    border: 0.5px solid var(--color-border-secondary);
    border-radius: 8px; padding: 6px 10px;
    font-size: 12px; color: var(--color-text-primary);
    pointer-events: none;
}
.ahm-tt-dot {
    display: inline-block; width: 6px; height: 6px;
    border-radius: 50%; margin-right: 4px; vertical-align: middle;
}`;
        document.head.appendChild(style);
    }
}
