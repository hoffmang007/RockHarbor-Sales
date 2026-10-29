// Basswood Comps web page
// Reads the data saved by collect.js and shows the filters, summary numbers,
// price chart and sales table.

(function () {
  const YEARS_BACK = 10;

  // Chart dot color and shape for each bedroom count.
  // The colors themselves are set in styles.css (--bed1, --bed2, --bed3).
  const BED_STYLE = {
    1: { color: "var(--bed1)", shape: "circle" },
    2: { color: "var(--bed2)", shape: "square" },
    3: { color: "var(--bed3)", shape: "star" },
  };
  const OTHER_STYLE = { color: "var(--faint)", shape: "circle" };

  const data = window.BASSWOOD_DATA;
  if (!data) {
    document.querySelector("main").innerHTML =
      '<div class="card empty">No data yet. Double-click <strong>Update data.bat</strong> in this folder, then reload this page.</div>';
    return;
  }

  // ---------- Prepare the sales list ----------

  const unitsById = new Map(data.units.map((u) => [u.id, u]));
  const today = new Date();
  const cutoff = new Date(today.getFullYear() - YEARS_BACK, today.getMonth(), today.getDate())
    .toISOString().slice(0, 10);

  // The county sometimes records one sale on two deeds. Same unit + same date
  // + same price counts as one sale, so keep only the first copy.
  const seen = new Map();
  for (const s of data.sales) {
    if (!(s.price > 0) || s.date < cutoff) continue;
    const key = `${s.unitId}|${s.date}|${s.price}`;
    const existing = seen.get(key);
    if (existing) existing.multiUnit = existing.multiUnit || s.multiUnit;
    else seen.set(key, { ...s });
  }

  const allSales = [...seen.values()].map((s) => {
    const u = unitsById.get(s.unitId) || {};
    return {
      date: s.date,
      time: dateValue(s.date),
      year: Number(s.date.slice(0, 4)),
      unit: s.unit || u.parcel || "",
      beds: u.beds ?? null,
      baths: u.baths ?? null,
      sqft: u.sqft ?? null,
      price: s.price,
      ppsf: u.sqft ? s.price / u.sqft : null,
      multiUnit: !!s.multiUnit,
    };
  });

  // ---------- Table columns ----------
  // To add a column later, add an entry here.

  const columns = [
    { key: "date", label: "Sale date", render: (s) => formatDate(s.date), cls: "strong" },
    { key: "unit", label: "Unit", render: (s) => `Unit ${esc(s.unit)}` + (s.multiUnit ? '<span class="badge" title="Sold together with other units on one deed. The price is for the whole group.">Group sale</span>' : "") },
    { key: "beds", label: "Beds", num: true, render: (s) => s.beds ?? "—" },
    { key: "sqft", label: "Sq ft", num: true, render: (s) => (s.sqft ? s.sqft.toLocaleString() : "—") },
    { key: "price", label: "Sale price", num: true, render: (s) => money(s.price), cls: "strong" },
    { key: "ppsf", label: "Price / sq ft", num: true, render: (s) => (s.ppsf ? money(s.ppsf) : "—") },
  ];

  // ---------- Page state ----------
  // years: the selected years. Empty means "all years".

  const state = { beds: "all", years: new Set(), includeMulti: false, sortKey: "date", sortDir: -1 };

  // ---------- Helpers ----------

  function dateValue(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  }

  function money(n) {
    return "$" + Math.round(n).toLocaleString();
  }

  function shortMoney(n) {
    if (n >= 1e6) return "$" + +(n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return "$" + Math.round(n / 1e3) + "K";
    return "$" + n;
  }

  function formatDate(iso) {
    return new Date(dateValue(iso)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function median(values) {
    const v = values.filter((x) => x != null).sort((a, b) => a - b);
    if (!v.length) return null;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }

  function average(values) {
    const v = values.filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }

  function styleFor(beds) {
    return BED_STYLE[beds] || OTHER_STYLE;
  }

  // SVG outline for one chart dot, centered on (x, y).
  function shapePath(shape, x, y) {
    if (shape === "square") {
      const h = 4.25;
      return `M${x - h},${y - h}h${2 * h}v${2 * h}h${-2 * h}Z`;
    }
    if (shape === "star") {
      // Five-pointed star: alternate between outer and inner points.
      const outer = 8.5, inner = 3.8;
      let d = "";
      for (let k = 0; k < 10; k++) {
        const r = k % 2 ? inner : outer;
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        d += `${k ? "L" : "M"}${(x + r * Math.cos(a)).toFixed(2)},${(y + r * Math.sin(a)).toFixed(2)}`;
      }
      return d + "Z";
    }
    if (shape === "triangle") {
      const r = 5.5;
      return `M${x},${y - r}L${x + r * 0.87},${y + r * 0.5}L${x - r * 0.87},${y + r * 0.5}Z`;
    }
    const r = 4.5;
    return `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
  }

  function marker(beds) {
    const st = styleFor(beds);
    return `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="${shapePath(st.shape, 6, 6.5)}" style="fill:${st.color}"/></svg>`;
  }

  // ---------- Bedroom filter ----------

  const bedFilter = document.getElementById("bedFilter");
  const bedOptions = [...new Set(allSales.map((s) => s.beds).filter((b) => b != null))].sort((a, b) => a - b);
  bedFilter.innerHTML = ["all", ...bedOptions]
    .map((b) => `<button type="button" data-beds="${b}">${b === "all" ? "All" : b}</button>`)
    .join("");
  bedFilter.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.beds = btn.dataset.beds;
    render();
  });

  // ---------- Year filter (pick one or more) ----------

  const yearBtn = document.getElementById("yearBtn");
  const yearBtnText = document.getElementById("yearBtnText");
  const yearPanel = document.getElementById("yearPanel");
  const yearList = document.getElementById("yearList");

  const years = [];
  for (let y = today.getFullYear(); y >= today.getFullYear() - YEARS_BACK; y--) years.push(y);
  yearList.innerHTML = years
    .map((y) => `<label><input type="checkbox" value="${y}"> ${y}</label>`)
    .join("");

  function setYearPanel(open) {
    yearPanel.hidden = !open;
    yearBtn.setAttribute("aria-expanded", String(open));
  }
  yearBtn.addEventListener("click", () => setYearPanel(yearPanel.hidden));
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#yearDropdown")) setYearPanel(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !yearPanel.hidden) {
      setYearPanel(false);
      yearBtn.focus();
    }
  });
  yearList.addEventListener("change", (e) => {
    const y = Number(e.target.value);
    if (e.target.checked) state.years.add(y);
    else state.years.delete(y);
    render();
  });
  document.getElementById("yearAll").addEventListener("click", () => {
    state.years.clear();
    render();
  });

  function yearLabel() {
    const picked = [...state.years].sort();
    if (picked.length === 0) return "All years";
    if (picked.length <= 3) return picked.join(", ");
    return `${picked.length} years`;
  }

  // ---------- Group sales and reset ----------

  const multiToggle = document.getElementById("multiToggle");
  if (allSales.some((s) => s.multiUnit)) {
    document.getElementById("multiWrap").hidden = false;
    multiToggle.addEventListener("change", () => {
      state.includeMulti = multiToggle.checked;
      render();
    });
  }

  document.getElementById("resetBtn").addEventListener("click", () => {
    state.beds = "all";
    state.years.clear();
    state.includeMulti = false;
    render();
  });

  // ---------- Table header (click to sort) ----------

  const headRow = document.getElementById("headRow");
  headRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const key = btn.dataset.key;
    if (state.sortKey === key) state.sortDir *= -1;
    else {
      state.sortKey = key;
      state.sortDir = key === "unit" ? 1 : -1;
    }
    render();
  });

  // ---------- Filtering and sorting ----------

  function filteredSales() {
    return allSales.filter(
      (s) =>
        (state.beds === "all" || String(s.beds) === state.beds) &&
        (state.years.size === 0 || state.years.has(s.year)) &&
        (state.includeMulti || !s.multiUnit)
    );
  }

  function sortSales(list) {
    const { sortKey: k, sortDir: dir } = state;
    return list.slice().sort((a, b) => {
      const x = a[k], y = b[k];
      if (x == null) return 1;
      if (y == null) return -1;
      if (k === "unit") return dir * String(x).localeCompare(String(y), undefined, { numeric: true });
      return dir * (x < y ? -1 : x > y ? 1 : 0);
    });
  }

  // ---------- Summary boxes ----------

  function renderStats(list) {
    // Group sales are left out of the medians because their price covers several units.
    const single = list.filter((s) => !s.multiUnit);
    const stats = [
      { label: "Sales", value: list.length.toLocaleString() },
      { label: "Median price", value: single.length ? money(median(single.map((s) => s.price))) : "—" },
      { label: "Median price / sq ft", value: single.length ? money(median(single.map((s) => s.ppsf))) : "—" },
      { label: "Average size", value: single.length ? Math.round(average(single.map((s) => s.sqft))).toLocaleString() + " sq ft" : "—" },
    ];
    document.getElementById("stats").innerHTML = stats
      .map((s) => `<div class="stat"><div class="stat-label">${s.label}</div><div class="stat-value">${s.value}</div></div>`)
      .join("");
  }

  // ---------- Chart ----------

  const chartEl = document.getElementById("chart");
  const tooltip = document.getElementById("tooltip");
  let chartPoints = [];
  let lastList = [];

  // Round numbers for the price axis, e.g. 0, 50K, 100K...
  function priceTicks(max) {
    const rough = max / 5;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const f = rough / pow;
    const step = (f >= 7.5 ? 10 : f >= 3.5 ? 5 : f >= 1.5 ? 2 : 1) * pow;
    const top = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
    return ticks;
  }

  function renderLegend(list) {
    document.getElementById("legend").innerHTML =
      bedOptions
        .map((b) => {
          const n = list.filter((s) => s.beds === b).length;
          return `<span class="legend-item">${marker(b)}${b} bed <span class="legend-count">(${n})</span></span>`;
        })
        .join("") +
      '<span class="legend-item" title="The middle sale price of sales within 6 months either side of each point. Group sales are left out.">' +
      '<svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><line class="trend-line" x1="1" x2="17" y1="6" y2="6"/></svg>' +
      "12-month median</span>";
  }

  // Rolling median: for each month, the middle price of sales within
  // 6 months either side. Months with fewer than 3 such sales are skipped,
  // which leaves a gap in the line.
  const MIN_SALES_FOR_MEDIAN = 3;
  const HALF_WINDOW_MS = 182.5 * 24 * 3600 * 1000;

  function rollingMedian(list, start, end) {
    const sales = list.filter((s) => !s.multiUnit);
    const points = [];
    const d = new Date(start);
    let t = new Date(d.getFullYear(), d.getMonth(), 15).getTime();
    while (t <= end) {
      const near = sales.filter((s) => Math.abs(s.time - t) <= HALF_WINDOW_MS);
      points.push(near.length >= MIN_SALES_FOR_MEDIAN ? { t, v: median(near.map((s) => s.price)) } : null);
      const n = new Date(t);
      t = new Date(n.getFullYear(), n.getMonth() + 1, 15).getTime();
    }
    return points;
  }

  function renderChart(list) {
    lastList = list;
    renderLegend(list);
    hideTooltip();

    const W = chartEl.clientWidth;
    const H = chartEl.clientHeight;
    const m = { top: 12, right: 14, bottom: 30, left: 58 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;

    // Date range across the bottom: the selected years, or the last 10 years.
    let start, end;
    if (state.years.size) {
      start = new Date(Math.min(...state.years), 0, 1).getTime();
      end = new Date(Math.max(...state.years) + 1, 0, 1).getTime();
    } else {
      start = dateValue(cutoff);
      end = today.getTime();
    }

    const yTicks = priceTicks(Math.max(...list.map((s) => s.price), 100000));
    const yMax = yTicks[yTicks.length - 1];
    const x = (t) => m.left + ((t - start) / (end - start)) * iw;
    const y = (v) => m.top + ih - (v / yMax) * ih;

    // Labels across the bottom: months when one year is picked, otherwise years.
    const xTicks = [];
    const singleYear = state.years.size === 1;
    if (singleYear) {
      const yr = [...state.years][0];
      for (let mo = 0; mo < 12; mo += iw < 420 ? 3 : 1) {
        const t = new Date(yr, mo, 1).getTime();
        xTicks.push({ t, label: new Date(t).toLocaleDateString("en-US", { month: "short" }) });
      }
    } else {
      const firstYear = new Date(start).getFullYear() + (new Date(start).getMonth() > 0 || new Date(start).getDate() > 1 ? 1 : 0);
      const lastYear = new Date(end).getFullYear();
      const count = lastYear - firstYear + 1;
      const every = iw / count < 44 ? 2 : 1;
      for (let yr = firstYear; yr <= lastYear; yr += every) {
        const t = new Date(yr, 0, 1).getTime();
        if (t >= start && t <= end) xTicks.push({ t, label: String(yr) });
      }
    }

    // Draw older sales first so newer ones sit on top.
    chartPoints = list
      .slice()
      .sort((a, b) => a.time - b.time)
      .map((s) => ({ s, px: x(s.time), py: y(s.price) }));

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter chart of sale price by date, ${list.length} sales">`;
    for (const v of yTicks) {
      svg += `<line class="${v === 0 ? "axis-line" : "grid-line"}" x1="${m.left}" x2="${W - m.right}" y1="${y(v)}" y2="${y(v)}"/>`;
      svg += `<text class="tick" x="${m.left - 10}" y="${y(v)}" text-anchor="end" dominant-baseline="middle">${shortMoney(v)}</text>`;
    }
    for (const tk of xTicks) {
      svg += `<line class="grid-line" x1="${x(tk.t)}" x2="${x(tk.t)}" y1="${m.top}" y2="${m.top + ih}"/>`;
      svg += `<text class="tick" x="${x(tk.t)}" y="${H - 8}" text-anchor="middle">${tk.label}</text>`;
    }
    // Trend line (drawn under the dots).
    let pathD = "";
    let penDown = false;
    for (const pt of rollingMedian(list, start, end)) {
      if (!pt || pt.t < start) { penDown = false; continue; }
      pathD += `${penDown ? "L" : "M"}${x(pt.t).toFixed(1)},${y(pt.v).toFixed(1)}`;
      penDown = true;
    }
    if (pathD) svg += `<path class="trend-line" d="${pathD}"/>`;

    chartPoints.forEach((p, i) => {
      const st = styleFor(p.s.beds);
      svg += `<path class="dot" data-i="${i}" d="${shapePath(st.shape, p.px, p.py)}" style="fill:${st.color}"/>`;
    });
    svg += "</svg>";

    chartEl.querySelectorAll("svg, .chart-empty").forEach((n) => n.remove());
    chartEl.insertAdjacentHTML("afterbegin", svg);
    if (!list.length) chartEl.insertAdjacentHTML("beforeend", '<div class="chart-empty">No sales match these filters.</div>');
  }

  // Hover: find the closest dot to the pointer and show its details.
  function hideTooltip() {
    tooltip.hidden = true;
    chartEl.querySelectorAll(".dot.active").forEach((d) => d.classList.remove("active"));
  }

  chartEl.addEventListener("pointermove", (e) => {
    const rect = chartEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best = -1, bestDist = 18 * 18;
    chartPoints.forEach((p, i) => {
      const d = (p.px - mx) ** 2 + (p.py - my) ** 2;
      if (d < bestDist) { bestDist = d; best = i; }
    });
    if (best < 0) return hideTooltip();

    const p = chartPoints[best];
    const s = p.s;
    chartEl.querySelectorAll(".dot.active").forEach((d) => d.classList.remove("active"));
    const dot = chartEl.querySelector(`.dot[data-i="${best}"]`);
    dot.classList.add("active");
    dot.parentNode.appendChild(dot); // bring to front

    tooltip.innerHTML =
      `<div class="tooltip-title">${marker(s.beds)}Unit ${esc(s.unit)}</div>` +
      `<div class="tooltip-row"><span>Date</span><span>${formatDate(s.date)}</span></div>` +
      `<div class="tooltip-row"><span>Price</span><span>${money(s.price)}</span></div>` +
      `<div class="tooltip-row"><span>Beds</span><span>${s.beds ?? "—"}</span></div>` +
      `<div class="tooltip-row"><span>Sq ft</span><span>${s.sqft ? s.sqft.toLocaleString() : "—"}</span></div>` +
      `<div class="tooltip-row"><span>Price / sq ft</span><span>${s.ppsf ? money(s.ppsf) : "—"}</span></div>` +
      (s.multiUnit ? '<div class="tooltip-note">Group sale: price covers several units.</div>' : "");
    tooltip.hidden = false;

    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    let left = p.px + 14;
    if (left + tw > chartEl.clientWidth) left = p.px - tw - 14;
    let top = p.py - th / 2;
    top = Math.max(0, Math.min(top, chartEl.clientHeight - th));
    tooltip.style.left = Math.max(0, left) + "px";
    tooltip.style.top = top + "px";
  });
  chartEl.addEventListener("pointerleave", hideTooltip);

  let resizeQueued = false;
  window.addEventListener("resize", () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      renderChart(lastList);
    });
  });

  // ---------- Table ----------

  function renderTable(list) {
    headRow.innerHTML = columns
      .map((c) => {
        const sorted = state.sortKey === c.key;
        const aria = sorted ? ` aria-sort="${state.sortDir === 1 ? "ascending" : "descending"}"` : "";
        const arrow = sorted ? `<span class="arrow">${state.sortDir === 1 ? "▲" : "▼"}</span>` : "";
        return `<th class="${c.num ? "num" : ""}"${aria}><button type="button" data-key="${c.key}">${c.label}${arrow}</button></th>`;
      })
      .join("");

    document.getElementById("rows").innerHTML = list
      .map(
        (s) =>
          "<tr>" +
          columns.map((c) => `<td class="${[c.num && "num", c.cls].filter(Boolean).join(" ")}">${c.render(s)}</td>`).join("") +
          "</tr>"
      )
      .join("");
    document.getElementById("empty").hidden = list.length > 0;
  }

  // ---------- Draw everything ----------

  function render() {
    for (const btn of bedFilter.querySelectorAll("button")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.beds === state.beds));
    }
    for (const box of yearList.querySelectorAll("input")) {
      box.checked = state.years.has(Number(box.value));
    }
    yearBtnText.textContent = yearLabel();
    multiToggle.checked = state.includeMulti;

    const list = sortSales(filteredSales());
    renderStats(list);
    renderChart(list);
    renderTable(list);
  }

  document.getElementById("updated").textContent =
    "Updated " + new Date(data.updated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  render();
})();
