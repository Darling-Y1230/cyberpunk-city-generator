import { el } from './minimap.js';
import { MODES } from '../core/controls.js';

/**
 * HUD, control surface, loading pipeline readout and the Agent 9 report.
 */
export class HUD {
  constructor(cfg, hooks) {
    this.cfg = cfg;
    this.hooks = hooks;
    this.root = document.getElementById('hud');
    this.state = { fps: 0, ms: 0, tris: 0, calls: 0, npc: 0, district: '', weather: '', time: '' };
    this._build();
  }

  _build() {
    const R = this.root;
    R.innerHTML = '';

    /* ---------------- brand + stats ---------------- */
    const top = el('div', 'panel topbar');
    this.brand = el('div', 'brand');
    this.brandTitle = el('div', 'brand-title', this.cfg.meta.title);
    this.brandSub = el('div', 'brand-sub', this.cfg.meta.subtitle);
    this.brand.append(this.brandTitle, this.brandSub);
    this.stats = el('div', 'stats');
    this.statsRows = {};
    for (const [k, label] of [['fps', 'FPS'], ['calls', 'DRAW'], ['tris', 'TRIS'], ['npc', 'AGENTS'], ['district', 'ZONE'], ['weather', 'WX'], ['time', 'TIME'], ['coords', 'POS']]) {
      const row = el('div', 'stat');
      const l = el('span', 'stat-l', label);
      const v = el('span', 'stat-v', '—');
      row.append(l, v);
      this.stats.append(row);
      this.statsRows[k] = v;
    }
    top.append(this.brand, this.stats);
    R.append(top);

    /* ---------------- minimap ---------------- */
    const mm = el('div', 'panel minimap-panel');
    const cv = el('canvas', 'minimap');
    cv.id = 'minimap';
    this.mmCanvas = cv;
    const legend = el('div', 'mm-legend');
    legend.innerHTML = '<span class="dot" style="background:#5ae0ff"></span>CBD'
      + '<span class="dot" style="background:#ff4fd8"></span>商业'
      + '<span class="dot" style="background:#ff5f6d"></span>贫民窟'
      + '<span class="dot" style="background:#ff9a52"></span>工业'
      + '<span class="dot" style="background:#4fd2a8"></span>港口';
    mm.append(cv, legend);
    R.append(mm);

    /* ---------------- control panel ---------------- */
    const cp = el('div', 'panel controls');
    cp.append(el('div', 'panel-title', '控制台 · CONSOLE'));

    cp.append(this._group('视角 VIEW', MODES.map((m) => ({
      label: { topdown: '俯视', fly: '飞行', fps: '第一人称', tps: '第三人称' }[m],
      active: m === this.cfg.controls.defaultMode,
      onClick: (b) => { this._activate(b); this.hooks.onMode?.(m); },
    }))));

    cp.append(this._group('画质 QUALITY', ['ultra', 'high', 'medium', 'low'].map((q) => ({
      label: q.toUpperCase(), active: q === (this.cfg.render.initialQuality || 'high'),
      onClick: (b) => { this._activate(b); this.hooks.onQuality?.(q); },
    }))));

    /* weather */
    const wg = el('div', 'group');
    wg.append(el('div', 'group-title', '天气 WEATHER'));
    const wrow = el('div', 'row');
    this.weatherSelect = el('select', 'select');
    for (const [k, v] of Object.entries(this.cfg.weather.types)) {
      const o = el('option', '', v.label);
      o.value = k;
      this.weatherSelect.append(o);
    }
    this.weatherSelect.value = this.cfg.weather.default;
    this.weatherSelect.onchange = () => this.hooks.onWeather?.(this.weatherSelect.value);
    const autoBtn = el('button', 'btn small', '自动');
    autoBtn.onclick = () => {
      this.cfg.weather.autoCycle = !this.cfg.weather.autoCycle;
      autoBtn.classList.toggle('on', this.cfg.weather.autoCycle);
      this.hooks.onWeatherAuto?.(this.cfg.weather.autoCycle);
    };
    autoBtn.classList.toggle('on', this.cfg.weather.autoCycle);
    wrow.append(this.weatherSelect, autoBtn);
    wg.append(wrow);
    cp.append(wg);

    /* time */
    const tg = el('div', 'group');
    tg.append(el('div', 'group-title', '昼夜 DAY / NIGHT'));
    const trow = el('div', 'row');
    this.timeSlider = el('input', 'slider');
    this.timeSlider.type = 'range';
    this.timeSlider.min = '0'; this.timeSlider.max = '24'; this.timeSlider.step = '0.05';
    this.timeSlider.value = String(this.cfg.lighting.defaultTime);
    this.timeSlider.oninput = () => this.hooks.onTime?.(parseFloat(this.timeSlider.value));
    this.timeLabel = el('span', 'mono', '--:--');
    trow.append(this.timeSlider, this.timeLabel);
    tg.append(trow);
    const trow2 = el('div', 'row');
    const cycleBtn = el('button', 'btn small', '时间流动');
    cycleBtn.onclick = () => {
      this._cycling = !this._cycling;
      cycleBtn.classList.toggle('on', this._cycling);
      this.hooks.onTimeCycle?.(this._cycling);
    };
    const quick = ['黎明', '正午', '黄昏', '午夜'];
    const hours = [6, 12, 18, 23.5];
    quick.forEach((q, i) => {
      const b = el('button', 'btn small', q);
      b.onclick = () => { this.timeSlider.value = String(hours[i]); this.hooks.onTime?.(hours[i]); };
      trow2.append(b);
    });
    tg.append(trow2, cycleBtn);
    cp.append(tg);

    /* toggles */
    const fg = el('div', 'group');
    fg.append(el('div', 'group-title', '特效 EFFECTS'));
    const flags = [
      ['reflection', '湿面反射'], ['bloom', '泛光'], ['rain', '降水'],
      ['fog', '雾'], ['holograms', '全息'], ['minimap', '小地图'],
      ['cables', '电缆'], ['steam', '蒸汽'], ['crowd', '人群'],
    ];
    const frow = el('div', 'row wrap');
    for (const [key, label] of flags) {
      const b = el('button', 'chip on', label);
      b.onclick = () => { b.classList.toggle('on'); this.hooks.onFlag?.(key, b.classList.contains('on')); };
      frow.append(b);
    }
    fg.append(frow);
    cp.append(fg);

    /* regenerate */
    const rg = el('div', 'group');
    rg.append(el('div', 'group-title', '重新生成 REGENERATE'));
    const r1 = el('div', 'row');
    this.seedInput = el('input', 'input');
    this.seedInput.type = 'text';
    this.seedInput.placeholder = '种子 seed (留空随机)';
    this.sizeSelect = el('select', 'select');
    for (const s of ['random', ...this.cfg.world.mapSizeChoices]) {
      const o = el('option', '', String(s));
      o.value = String(s);
      this.sizeSelect.append(o);
    }
    r1.append(this.seedInput, this.sizeSelect);
    const r2 = el('div', 'row');
    const genBtn = el('button', 'btn primary', '⟳ 生成新城市');
    genBtn.onclick = () => this.hooks.onRegenerate?.({
      seed: this.seedInput.value.trim() || null,
      size: this.sizeSelect.value,
    });
    const npcBtn = el('button', 'btn', '人群密度');
    npcBtn.onclick = () => {
      const v = prompt('NPC 数量 (1000 - 50000)', String(this.hooks.getNPC?.() ?? 9000));
      if (v) this.hooks.onNPC?.(parseInt(v, 10));
    };
    r2.append(genBtn, npcBtn);
    rg.append(r1, r2);
    cp.append(rg);

    R.append(cp);
    this.controls = cp;

    /* ---------------- validation report ---------------- */
    const rp = el('div', 'panel report collapsed');
    const head = el('div', 'panel-title clickable');
    this.reportVerdict = el('span', 'verdict', '—');
    head.append(el('span', '', 'AGENT 9 · 约束校验'), this.reportVerdict);
    head.onclick = () => rp.classList.toggle('collapsed');
    this.reportBody = el('div', 'report-body');
    rp.append(head, this.reportBody);
    R.append(rp);

    /* ---------------- key legend ---------------- */
    const help = el('div', 'panel help');
    help.innerHTML = `
      <div class="panel-title">操作 CONTROLS</div>
      <div class="help-grid">
        <kbd>W A S D</kbd><span>移动 / 平移</span>
        <kbd>MOUSE</kbd><span>视角（点击锁定指针）</span>
        <kbd>SHIFT</kbd><span>奔跑 / 加速</span>
        <kbd>SPACE</kbd><span>上升 / 跳跃</span>
        <kbd>CTRL</kbd><span>下降</span>
        <kbd>F</kbd><span>飞行模式开关</span>
        <kbd>1 2 3 4</kbd><span>切换视角</span>
        <kbd>C</kbd><span>切换天气</span>
        <kbd>L</kbd><span>时间流动</span>
        <kbd>R</kbd><span>重新生成</span>
        <kbd>H</kbd><span>隐藏界面</span>
      </div>`;
    R.append(help);
    this.help = help;

    /* ---------------- loader ---------------- */
    this.loader = el('div', 'loader');
    const li = el('div', 'loader-inner');
    li.append(el('div', 'loader-title', this.cfg.meta.title));
    li.append(el('div', 'loader-sub', '程序化生成赛博朋克超级都市 · PROCEDURAL MEGA-CITY SYNTHESIS'));
    this.loaderSteps = el('div', 'loader-steps');
    this.stepEls = [];
    for (let i = 1; i <= 10; i++) {
      const row = el('div', 'loader-step');
      row.append(el('span', 'step-n', String(i).padStart(2, '0')));
      const t = el('span', 'step-t', AGENT_LABELS[i - 1]);
      const s = el('span', 'step-s', '待机');
      row.append(t, s);
      this.loaderSteps.append(row);
      this.stepEls.push({ row, s });
    }
    this.loaderBar = el('div', 'loader-bar');
    this.loaderFill = el('div', 'loader-fill');
    this.loaderBar.append(this.loaderFill);
    this.loaderStatus = el('div', 'loader-status', '初始化…');
    li.append(this.loaderSteps, this.loaderBar, this.loaderStatus);
    this.loader.append(li);
    document.body.append(this.loader);
  }

  _group(title, buttons) {
    const g = el('div', 'group');
    g.append(el('div', 'group-title', title));
    const row = el('div', 'row wrap');
    for (const b of buttons) {
      const btn = el('button', 'chip' + (b.active ? ' on' : ''), b.label);
      btn.onclick = () => b.onClick(btn);
      row.append(btn);
    }
    g.append(row);
    return g;
  }

  _activate(btn) {
    const parent = btn.parentElement;
    for (const c of parent.children) c.classList.remove('on');
    btn.classList.add('on');
  }

  /** Light up a quality chip by name (used by the ?q= URL parameter). */
  activateQuality(name) {
    const groups = this.controls.querySelectorAll('.group');
    if (groups.length < 2) return;
    const chips = groups[1].querySelectorAll('.chip');
    const i = ['ultra', 'high', 'medium', 'low'].indexOf(name);
    if (i >= 0 && chips[i]) this._activate(chips[i]);
  }

  /* ---------------- loading pipeline ---------------- */
  step(i, status) {
    const e = this.stepEls[i];
    if (!e) return;
    e.s.textContent = status;
    e.row.classList.toggle('active', status === '运行中');
    e.row.classList.toggle('done', status === '完成');
    this.loaderFill.style.width = ((i + (status === '完成' ? 1 : 0.5)) / 10 * 100).toFixed(1) + '%';
  }
  status(text) { this.loaderStatus.textContent = text; }
  hideLoader() {
    this.loader.classList.add('gone');
  }
  showLoader() {
    for (const e of this.stepEls) { e.s.textContent = '待机'; e.row.className = 'loader-step'; }
    this.loaderFill.style.width = '0%';
    this.loader.classList.remove('gone');
  }

  /* ---------------- per-frame ---------------- */
  update(s) {
    Object.assign(this.state, s);
    const f = this.statsRows;
    f.fps.textContent = s.fps.toFixed(0);
    f.fps.className = 'stat-v ' + (s.fps > 50 ? 'good' : s.fps > 28 ? 'warn' : 'bad');
    f.calls.textContent = String(s.calls);
    f.tris.textContent = compact(s.tris);
    f.npc.textContent = compact(s.npc);
    f.district.textContent = s.district;
    f.weather.textContent = s.weather;
    f.time.textContent = s.time;
    f.coords.textContent = s.coords;
    if (document.activeElement !== this.timeSlider) this.timeSlider.value = String(s.timeRaw ?? 0);
    this.timeLabel.textContent = s.time;
  }

  setReport(report) {
    this.reportVerdict.textContent = report.verdict;
    this.reportVerdict.className = 'verdict ' + report.verdict.toLowerCase();
    this.reportBody.innerHTML = '';
    for (const c of report.checks) {
      const row = el('div', 'check ' + (c.ok ? 'ok' : 'fail'));
      row.append(el('span', 'check-icon', c.ok ? '✔' : '✖'));
      const mid = el('div', 'check-mid');
      mid.append(el('div', 'check-label', c.label));
      mid.append(el('div', 'check-detail', c.detail));
      row.append(mid);
      row.append(el('span', 'check-val', String(c.value)));
      this.reportBody.append(row);
    }
    const s = report.summary;
    const sum = el('div', 'check-sum');
    sum.innerHTML = `<b>${s.buildings.toLocaleString()}</b> 建筑 · <b>${s.roadCells.toLocaleString()}</b> 道路单元 · `
      + `<b>${s.signs.toLocaleString()}</b> 广告牌 · <b>${s.props.toLocaleString()}</b> 道具 · `
      + `<b>${s.cables.toLocaleString()}</b> 电缆 · <b>${s.particles.toLocaleString()}</b> 粒子 · `
      + `<b>${s.neonSources.toLocaleString()}</b> 光源 · 连通性 <b>${s.connectivity}</b>`;
    this.reportBody.append(sum);
  }

  toggle() { this.root.classList.toggle('hidden'); }
}

const AGENT_LABELS = [
  '地形与区域规划 TERRAIN & ZONING',
  '道路网络 ROAD NETWORK',
  '建筑布局 BUILDING STOCK',
  '立体交通 VERTICAL TRANSIT',
  '灯光系统 LIGHTING',
  '广告系统 ADVERTISING',
  'NPC 系统 POPULATION',
  '环境细节 ENVIRONMENT',
  '约束校验 VALIDATION',
  '优化与压缩 OPTIMISATION',
];

function compact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}
