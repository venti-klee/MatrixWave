const SVG_NS = "http://www.w3.org/2000/svg";

const groups = {
  acquisition: "#3c9283",
  product: "#e19a32",
  learn: "#687fb3",
  account: "#bb6e73",
  exit: "#7d858c",
};

const steps = [
  [
    ["首页", "acquisition"], ["站内搜索", "acquisition"], ["推广活动", "acquisition"],
    ["价格方案", "product"], ["博客", "learn"], ["帮助中心", "learn"],
    ["登录", "account"], ["直接访问", "acquisition"],
  ],
  [
    ["产品", "product"], ["解决方案", "product"], ["文档", "learn"],
    ["案例展示", "product"], ["下载", "product"], ["博客", "learn"],
    ["账户", "account"], ["离开网站", "exit"],
  ],
  [
    ["产品详情", "product"], ["方案对比", "product"], ["客户案例", "learn"],
    ["API 文档", "learn"], ["使用教程", "learn"], ["结算", "product"],
    ["账户", "account"], ["离开网站", "exit"],
  ],
  [
    ["价格方案", "product"], ["购物车", "product"], ["申请演示", "product"],
    ["下载", "product"], ["文档", "learn"], ["帮助中心", "learn"],
    ["账户", "account"], ["离开网站", "exit"],
  ],
  [
    ["完成购买", "product"], ["开始试用", "product"], ["已预约演示", "product"],
    ["下载完成", "product"], ["文档", "learn"], ["帮助中心", "learn"],
    ["账户", "account"], ["离开网站", "exit"],
  ],
].map((nodes, step) => nodes.map(([name, group], index) => ({ id: `${step}-${index}`, name, group, step, index })));

const presets = {
  may11: { seed: 11, total: 12480, label: "5 月 11 日 · 基准组" },
  may04: { seed: 4, total: 11846, label: "5 月 4 日 · 基准组" },
  may12: { seed: 21, total: 13216, label: "5 月 12 日 · 活动组" },
  may18: { seed: 35, total: 14102, label: "5 月 18 日 · 活动组" },
};

const state = {
  datasetA: "may11",
  datasetB: "may12",
  nodeThreshold: 8,
  linkThreshold: 4,
  colorMode: "change",
  orderMode: "volume",
  metric: "both",
  view: "matrixwave",
  activeSteps: new Set([0, 1, 2, 3, 4]),
  viewport: { zoom: 1, x: 0, y: 0 },
  query: "",
  selected: null,
};

const els = {
  svg: document.querySelector("#matrixwave"),
  wave: document.querySelector("#wave-layer"),
  tooltip: document.querySelector("#tooltip"),
  chartStage: document.querySelector("#chart-stage"),
  visibleSummary: document.querySelector("#visible-summary"),
  totalA: document.querySelector("#total-a"),
  totalB: document.querySelector("#total-b"),
  detailEmpty: document.querySelector("#detail-empty"),
  detailContent: document.querySelector("#detail-content"),
  detailPanel: document.querySelector("#detail-panel"),
  chartTitle: document.querySelector("#chart-title"),
  chartDesc: document.querySelector("#chart-desc"),
  linkLegend: document.querySelector("#link-legend-label"),
  viewKind: document.querySelector("#view-kind"),
  detailEmptyText: document.querySelector("#detail-empty-text"),
  detailExplain: document.querySelector("#detail-explain"),
};

function hash(seed, ...parts) {
  let h = seed * 374761393;
  for (const part of parts) {
    h = Math.imul(h ^ (part + 11) * 668265263, 1274126177);
    h ^= h >>> 13;
  }
  return ((h >>> 0) % 10000) / 10000;
}

function rawLink(seed, transition, source, target) {
  const r = hash(seed, transition, source, target);
  const affinity = source === target ? 1.35 : 1;
  const exitBoost = target === 7 ? 1.25 + transition * .18 : 1;
  const campaignBoost = seed > 15 && [0, 1, 3].includes(target) ? 1.18 : 1;
  const sparse = r < .34 && source !== target && target !== 7;
  if (sparse) return 0;
  return Math.round((6 + Math.pow(r, 2.2) * 185) * affinity * exitBoost * campaignBoost);
}

function buildData(key) {
  const { seed } = presets[key];
  const links = [];
  for (let t = 0; t < 4; t++) {
    for (let s = 0; s < 8; s++) {
      for (let d = 0; d < 8; d++) {
        const value = rawLink(seed, t, s, d);
        if (value) links.push({ transition: t, source: s, target: d, value });
      }
    }
  }
  const nodeValues = steps.map((nodes, step) => nodes.map((node, i) => {
    const relevant = step === 0
      ? links.filter(l => l.transition === 0 && l.source === i)
      : links.filter(l => l.transition === step - 1 && l.target === i);
    return relevant.reduce((sum, l) => sum + l.value, 0);
  }));
  return { links, nodeValues };
}

function combinedData() {
  const a = buildData(state.datasetA);
  const b = buildData(state.datasetB);
  const mapA = new Map(a.links.map(l => [`${l.transition}-${l.source}-${l.target}`, l.value]));
  const mapB = new Map(b.links.map(l => [`${l.transition}-${l.source}-${l.target}`, l.value]));
  const keys = new Set([...mapA.keys(), ...mapB.keys()]);
  const links = [...keys].map(key => {
    const [transition, source, target] = key.split("-").map(Number);
    return { transition, source, target, a: mapA.get(key) || 0, b: mapB.get(key) || 0 };
  });
  const nodes = steps.map((step, t) => step.map((node, i) => ({
    ...node,
    a: a.nodeValues[t][i],
    b: b.nodeValues[t][i],
  })));
  return { links, nodes };
}

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  if (parent) parent.appendChild(node);
  return node;
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function change(a, b) { return a === b ? 0 : clamp((b - a) / Math.max(a, b, 1) * 100, -100, 100); }
function format(value) { return Math.round(value).toLocaleString("en-US"); }

function mix(a, b, t) {
  const pa = a.match(/\w\w/g).map(x => parseInt(x, 16));
  const pb = b.match(/\w\w/g).map(x => parseInt(x, 16));
  return `#${pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, "0")).join("")}`;
}

function changeColor(percent) {
  if (percent < 0) return mix("5e568f", "f6f4f0", (percent + 100) / 100);
  return mix("f6f4f0", "d96f0c", percent / 100);
}

function volumeColor(value, max) { return mix("eef1f2", "344450", clamp(value / max, 0, 1)); }

function colorFor(item, group, max) {
  if (state.metric === "a") return volumeColor(item.a, max);
  if (state.metric === "b") return volumeColor(item.b, max);
  if (state.colorMode === "group") return groups[group] || "#84909a";
  if (state.colorMode === "volume") return volumeColor(item.a + item.b, max * 2);
  return changeColor(change(item.a, item.b));
}

function orderFor(nodes) {
  return [...nodes].sort((x, y) => {
    if (state.orderMode === "alphabetical") return x.name.localeCompare(y.name);
    if (state.orderMode === "change") return Math.abs(change(y.a, y.b)) - Math.abs(change(x.a, x.b));
    return (y.a + y.b) - (x.a + x.b);
  });
}

function transitionIsActive(transition) {
  return state.activeSteps.has(transition) && state.activeSteps.has(transition + 1);
}

function inferSelectedPath(data) {
  if (!state.selected) return null;
  const [transition, source, target] = state.selected.split("-").map(Number);
  const path = Array(5).fill(null);
  path[transition] = source;
  path[transition + 1] = target;
  for (let t = transition - 1; t >= 0; t--) {
    const candidates = data.links.filter(link => link.transition === t && link.target === path[t + 1]);
    const best = candidates.sort((a, b) => (b.a + b.b) - (a.a + a.b))[0];
    if (!best) break;
    path[t] = best.source;
  }
  for (let t = transition + 1; t < 4; t++) {
    const candidates = data.links.filter(link => link.transition === t && link.source === path[t]);
    const best = candidates.sort((a, b) => (b.a + b.b) - (a.a + a.b))[0];
    if (!best) break;
    path[t + 1] = best.target;
  }
  return path;
}

function localToWorld(cx, cy, x, y) {
  const c = Math.SQRT1_2;
  return [cx + (x - y) * c, cy + (x + y) * c];
}

function applyViewportTransform() {
  const { zoom, x, y } = state.viewport;
  els.wave.setAttribute("transform", `translate(${560 + x} ${325 + y}) scale(${zoom}) translate(-560 -325)`);
}

function render() {
  const data = combinedData();
  if (state.view === "sankey") {
    renderSankey(data);
    return;
  }
  els.wave.replaceChildren();
  els.chartTitle.textContent = "MatrixWave 事件序列对比图";
  els.chartDesc.textContent = "由旋转的转移矩阵组成的波形链，条形表示页面，方形单元格表示页面之间的转移。";
  els.linkLegend.textContent = "内方块尺寸 = 转移量";
  els.viewKind.textContent = "矩阵视图";
  els.detailEmptyText.textContent = "点击任意矩阵单元格，查看流量及其变化。";
  els.detailExplain.textContent = "单元格背景色表示差异，内部黑方块面积表示两组数据的平均流量。";
  const maxNode = Math.max(...data.nodes.flat().map(n => n.a + n.b));
  const maxLink = Math.max(...data.links.map(l => l.a + l.b));
  const centers = [[195, 225], [435, 402], [675, 225], [915, 402]];
  const matrixSize = 154;
  const slot = matrixSize / 8;
  let visibleLinks = 0;
  const visibleNodeIds = new Set();

  const orders = data.nodes.map(orderFor);
  const positions = orders.map(order => new Map(order.map((node, i) => [node.index, i])));

  // A subtle reading path behind the matrices.
  el("path", {
    d: "M80 225 C255 225 285 402 435 402 S525 225 675 225 S765 402 1040 402",
    fill: "none", stroke: "#eef1f2", "stroke-width": 34, "stroke-linecap": "round"
  }, els.wave);

  centers.forEach(([cx, cy], t) => {
    if (!transitionIsActive(t)) return;
    const matrix = el("g", { transform: `translate(${cx} ${cy}) rotate(45)` }, els.wave);
    el("rect", { class: "matrix-frame", x: -matrixSize / 2, y: -matrixSize / 2, width: matrixSize, height: matrixSize }, matrix);
    el("line", { class: "axis-guide", x1: -matrixSize / 2 - 42, y1: -matrixSize / 2, x2: matrixSize / 2, y2: -matrixSize / 2 }, matrix);
    el("line", { class: "axis-guide", x1: matrixSize / 2, y1: -matrixSize / 2, x2: matrixSize / 2, y2: matrixSize / 2 + 42 }, matrix);

    const transitionLinks = data.links.filter(l => l.transition === t);
    transitionLinks.forEach(link => {
      const total = link.a + link.b;
      const normalized = total / maxLink * 100;
      if (normalized < state.linkThreshold) return;
      const row = positions[t].get(link.source);
      const col = positions[t + 1].get(link.target);
      const sourceNode = data.nodes[t][link.source];
      const targetNode = data.nodes[t + 1][link.target];
      const x = -matrixSize / 2 + col * slot + slot / 2;
      const y = -matrixSize / 2 + row * slot + slot / 2;
      const selectedValue = state.metric === "a" ? link.a : state.metric === "b" ? link.b : total / 2;
      const cellSize = slot - 3;
      const cell = el("rect", {
        class: `link-cell${state.selected === `${t}-${link.source}-${link.target}` ? " selected" : ""}`,
        x: x - cellSize / 2, y: y - cellSize / 2, width: cellSize, height: cellSize,
        fill: colorFor(link, targetNode.group, maxLink), rx: .6,
        "data-search": `${sourceNode.name} ${targetNode.name}`.toLowerCase(),
        "data-link-key": `${t}-${link.source}-${link.target}`,
        "data-source-node": sourceNode.id,
        "data-target-node": targetNode.id,
      }, matrix);
      const core = clamp(1.8 + Math.sqrt(selectedValue / Math.max(maxLink / 2, 1)) * 8.5, 1.8, 10.5);
      el("rect", { class: "volume-core", x: x - core / 2, y: y - core / 2, width: core, height: core, opacity: .82 }, matrix);
      cell.addEventListener("pointerenter", event => { showTooltip(event, sourceNode, targetNode, link, t); highlightLinkContext(sourceNode, targetNode, `${t}-${link.source}-${link.target}`); });
      cell.addEventListener("pointermove", moveTooltip);
      cell.addEventListener("pointerleave", () => { hideTooltip(); clearContextHighlight(); });
      cell.addEventListener("click", () => selectLink(link, sourceNode, targetNode, t));
      visibleLinks++;
    });

    const drawNode = (node, index, side) => {
      const total = node.a + node.b;
      const normalized = total / maxNode * 100;
      if (normalized < state.nodeThreshold) return;
      const length = 9 + Math.sqrt(total / maxNode) * 34;
      let x, y, width, height;
      if (side === "source") {
        x = -matrixSize / 2 - length; y = -matrixSize / 2 + index * slot + 2; width = length; height = slot - 4;
      } else {
        x = -matrixSize / 2 + index * slot + 2; y = matrixSize / 2; width = slot - 4; height = length;
      }
      const bar = el("rect", {
        class: "node-bar", x, y, width, height, rx: .8,
        fill: colorFor(node, node.group, maxNode),
        "data-search": node.name.toLowerCase(),
        "data-node-id": node.id,
      }, matrix);
      if (node.group === "exit") {
        el("rect", { class: "exit-hatch", x, y, width, height, rx: .8, fill: "url(#drop-hatch)" }, matrix);
      }
      bar.addEventListener("pointerenter", event => { showNodeTooltip(event, node); highlightNodeContext(node); });
      bar.addEventListener("pointermove", moveTooltip);
      bar.addEventListener("pointerleave", () => { hideTooltip(); clearContextHighlight(); });
      visibleNodeIds.add(node.id);
    };

    orders[t].forEach((node, i) => drawNode(node, i, "source"));
    orders[t + 1].forEach((node, i) => drawNode(node, i, "target"));

    // Sparse labels on the outer edge keep the matrix readable.
    orders[t].slice(0, 4).forEach((node, i) => {
      el("circle", { class: "node-group-dot", cx: -matrixSize / 2 - 50, cy: -matrixSize / 2 + i * slot + slot / 2, r: 3.3, fill: groups[node.group] }, matrix);
      el("text", { class: "node-label", x: -matrixSize / 2 - 57, y: -matrixSize / 2 + i * slot + slot / 2 + 2.8, "text-anchor": "end", text: node.name }, matrix);
    });

    el("text", { class: "matrix-label", x: 0, y: -matrixSize / 2 - 12, text: `交互 ${t + 1} → ${t + 2}` }, matrix);
  });

  const selectedPath = inferSelectedPath(data);
  if (selectedPath) {
    const points = [];
    centers.forEach(([cx, cy], t) => {
      if (!transitionIsActive(t) || selectedPath[t] == null || selectedPath[t + 1] == null) return;
      const row = positions[t].get(selectedPath[t]);
      const col = positions[t + 1].get(selectedPath[t + 1]);
      const localX = -matrixSize / 2 + col * slot + slot / 2;
      const localY = -matrixSize / 2 + row * slot + slot / 2;
      points.push(localToWorld(cx, cy, localX, localY));
    });
    if (points.length > 1) {
      el("polyline", { class: "path-overlay", points: points.map(point => point.join(",")).join(" ") }, els.wave);
      points.forEach(([x, y]) => el("circle", { class: "path-point", cx: x, cy: y, r: 4 }, els.wave));
      el("text", { class: "path-label", x: 560, y: 602, text: "关联主路径（按相邻最大流量推断）" }, els.wave);
    }
  }

  // Step markers are kept upright, like the original design.
  const badges = [[76, 225], [318, 514], [555, 112], [797, 514], [1042, 402]];
  badges.forEach(([x, y], i) => {
    if (!state.activeSteps.has(i)) return;
    const g = el("g", { class: "step-badge", transform: `translate(${x} ${y})` }, els.wave);
    el("circle", { r: 20 }, g);
    el("text", { y: 1, text: String(i + 1) }, g);
    el("text", { class: "step-caption", x: 0, y: 35, "text-anchor": "middle", text: i === 0 ? "入口" : i === 4 ? "结果" : `第 ${i + 1} 步` }, g);
  });

  applySearch();
  els.visibleSummary.textContent = `${visibleNodeIds.size} 个页面 / ${visibleLinks} 条转移`;
  els.totalA.textContent = format(presets[state.datasetA].total);
  els.totalB.textContent = format(presets[state.datasetB].total);
  applyViewportTransform();
}

function renderSankey(data) {
  els.wave.replaceChildren();
  els.chartTitle.textContent = "Sankey 事件序列对比图";
  els.chartDesc.textContent = "五列节点通过曲线连线连接，节点尺寸表示页面访问量，连线宽度表示页面之间的转移量。";
  els.linkLegend.textContent = "连线宽度 = 转移量";
  els.viewKind.textContent = "桑基视图";
  els.detailEmptyText.textContent = "点击任意 Sankey 连线，查看流量及其变化。";
  els.detailExplain.textContent = "连线宽度表示合计流量，颜色表示数据集 A 到 B 的相对变化。";

  const maxNode = Math.max(...data.nodes.flat().map(n => n.a + n.b));
  const maxLink = Math.max(...data.links.map(l => l.a + l.b));
  const xPositions = [82, 320, 558, 796, 1034];
  const yStart = 92;
  const yGap = 64;
  const orders = data.nodes.map(orderFor);
  const positions = orders.map(order => new Map(order.map((node, i) => [node.index, i])));
  let visibleLinks = 0;
  const visibleNodeIds = new Set();

  xPositions.forEach((x, step) => {
    if (!state.activeSteps.has(step)) return;
    el("line", { class: "sankey-column-guide", x1: x, y1: 67, x2: x, y2: 570 }, els.wave);
    el("text", { class: "sankey-step-label", x, y: 43, text: `第 ${step + 1} 步` }, els.wave);
  });

  // Draw links first, so nodes and labels remain readable above the dense flow field.
  data.links.forEach(link => {
    if (!transitionIsActive(link.transition)) return;
    const total = link.a + link.b;
    if (total / maxLink * 100 < state.linkThreshold) return;
    const sourceNode = data.nodes[link.transition][link.source];
    const targetNode = data.nodes[link.transition + 1][link.target];
    if ((sourceNode.a + sourceNode.b) / maxNode * 100 < state.nodeThreshold) return;
    if ((targetNode.a + targetNode.b) / maxNode * 100 < state.nodeThreshold) return;
    const sourceWidth = 14 + Math.sqrt((sourceNode.a + sourceNode.b) / maxNode) * 34;
    const targetWidth = 14 + Math.sqrt((targetNode.a + targetNode.b) / maxNode) * 34;
    const x1 = xPositions[link.transition] + sourceWidth / 2;
    const x2 = xPositions[link.transition + 1] - targetWidth / 2;
    const y1 = yStart + positions[link.transition].get(link.source) * yGap;
    const y2 = yStart + positions[link.transition + 1].get(link.target) * yGap;
    const bend = (x2 - x1) * .45;
    const selectedValue = state.metric === "a" ? link.a : state.metric === "b" ? link.b : total / 2;
    const width = 1.2 + Math.sqrt(selectedValue / Math.max(maxLink / 2, 1)) * 13;
    const path = el("path", {
      class: `sankey-link${state.selected === `${link.transition}-${link.source}-${link.target}` ? " selected" : ""}`,
      d: `M${x1} ${y1} C${x1 + bend} ${y1},${x2 - bend} ${y2},${x2} ${y2}`,
      stroke: colorFor(link, targetNode.group, maxLink),
      "stroke-width": width,
      opacity: .48,
      "data-search": `${sourceNode.name} ${targetNode.name}`.toLowerCase(),
      "data-link-key": `${link.transition}-${link.source}-${link.target}`,
      "data-source-node": sourceNode.id,
      "data-target-node": targetNode.id,
    }, els.wave);
    path.addEventListener("pointerenter", event => { showTooltip(event, sourceNode, targetNode, link, link.transition); highlightLinkContext(sourceNode, targetNode, `${link.transition}-${link.source}-${link.target}`); });
    path.addEventListener("pointermove", moveTooltip);
    path.addEventListener("pointerleave", () => { hideTooltip(); clearContextHighlight(); });
    path.addEventListener("click", () => selectLink(link, sourceNode, targetNode, link.transition));
    visibleLinks++;
  });

  const selectedPath = inferSelectedPath(data);
  if (selectedPath) {
    for (let t = 0; t < 4; t++) {
      if (!transitionIsActive(t) || selectedPath[t] == null || selectedPath[t + 1] == null) continue;
      const sourceNode = data.nodes[t][selectedPath[t]];
      const targetNode = data.nodes[t + 1][selectedPath[t + 1]];
      const sourceWidth = 14 + Math.sqrt((sourceNode.a + sourceNode.b) / maxNode) * 34;
      const targetWidth = 14 + Math.sqrt((targetNode.a + targetNode.b) / maxNode) * 34;
      const x1 = xPositions[t] + sourceWidth / 2;
      const x2 = xPositions[t + 1] - targetWidth / 2;
      const y1 = yStart + positions[t].get(selectedPath[t]) * yGap;
      const y2 = yStart + positions[t + 1].get(selectedPath[t + 1]) * yGap;
      const bend = (x2 - x1) * .45;
      el("path", { class: "sankey-path-overlay", d: `M${x1} ${y1} C${x1 + bend} ${y1},${x2 - bend} ${y2},${x2} ${y2}` }, els.wave);
    }
    el("text", { class: "path-label", x: 560, y: 602, text: "关联主路径（按相邻最大流量推断）" }, els.wave);
  }

  orders.forEach((order, step) => {
    if (!state.activeSteps.has(step)) return;
    order.forEach((node, index) => {
      const total = node.a + node.b;
      if (total / maxNode * 100 < state.nodeThreshold) return;
      const width = 14 + Math.sqrt(total / maxNode) * 34;
      const x = xPositions[step];
      const y = yStart + index * yGap;
      const rect = el("rect", {
        class: "sankey-node", x: x - width / 2, y: y - 7, width, height: 14, rx: 1,
        fill: colorFor(node, node.group, maxNode),
        "data-search": node.name.toLowerCase(),
        "data-node-id": node.id,
      }, els.wave);
      if (node.group === "exit") {
        el("rect", { class: "exit-hatch", x: x - width / 2, y: y - 7, width, height: 14, rx: 1, fill: "url(#drop-hatch)" }, els.wave);
      }
      rect.addEventListener("pointerenter", event => { showNodeTooltip(event, node); highlightNodeContext(node); });
      rect.addEventListener("pointermove", moveTooltip);
      rect.addEventListener("pointerleave", () => { hideTooltip(); clearContextHighlight(); });
      el("text", {
        class: "sankey-node-label",
        x,
        y: y - 12,
        "text-anchor": "middle",
        text: node.name,
      }, els.wave);
      visibleNodeIds.add(node.id);
    });
  });

  el("text", { class: "sankey-note", x: 560, y: 618, text: "连线越粗表示流量越大；颜色表示数据集 B 相对 A 的变化" }, els.wave);
  applySearch();
  els.visibleSummary.textContent = `${visibleNodeIds.size} 个页面 / ${visibleLinks} 条转移`;
  els.totalA.textContent = format(presets[state.datasetA].total);
  els.totalB.textContent = format(presets[state.datasetB].total);
  applyViewportTransform();
}

function clearContextHighlight() {
  els.svg.querySelectorAll(".context-dim,.context-hit").forEach(node => node.classList.remove("context-dim", "context-hit"));
}

function highlightNodeContext(node) {
  clearContextHighlight();
  const visualElements = els.svg.querySelectorAll("[data-node-id],[data-link-key]");
  visualElements.forEach(element => element.classList.add("context-dim"));
  els.svg.querySelectorAll(`[data-node-id="${node.id}"]`).forEach(element => element.classList.remove("context-dim"));
  const relatedLinks = els.svg.querySelectorAll(`[data-source-node="${node.id}"],[data-target-node="${node.id}"]`);
  const connected = new Set([node.id]);
  relatedLinks.forEach(link => {
    link.classList.remove("context-dim");
    link.classList.add("context-hit");
    connected.add(link.dataset.sourceNode);
    connected.add(link.dataset.targetNode);
  });
  connected.forEach(id => els.svg.querySelectorAll(`[data-node-id="${id}"]`).forEach(element => element.classList.remove("context-dim")));
}

function highlightLinkContext(source, target, key) {
  clearContextHighlight();
  els.svg.querySelectorAll("[data-node-id],[data-link-key]").forEach(element => element.classList.add("context-dim"));
  els.svg.querySelectorAll(`[data-link-key="${key}"]`).forEach(element => {
    element.classList.remove("context-dim");
    element.classList.add("context-hit");
  });
  [source.id, target.id].forEach(id => els.svg.querySelectorAll(`[data-node-id="${id}"]`).forEach(element => element.classList.remove("context-dim")));
}

function showTooltip(event, source, target, link, transition) {
  const pct = change(link.a, link.b);
  els.tooltip.innerHTML = `<strong>${source.name} → ${target.name}</strong><span>第 ${transition + 1} 步至第 ${transition + 2} 步</span><br><b>${format(link.a)}</b> 对比 <b>${format(link.b)}</b> · ${pct >= 0 ? "+" : ""}${Math.round(pct)}%`;
  els.tooltip.classList.add("visible");
  moveTooltip(event);
}

function showNodeTooltip(event, node) {
  const pct = change(node.a, node.b);
  els.tooltip.innerHTML = `<strong>${node.name}</strong><span>第 ${node.step + 1} 步交互</span><br><b>${format(node.a)}</b> 对比 <b>${format(node.b)}</b> 次访问 · ${pct >= 0 ? "+" : ""}${Math.round(pct)}%`;
  els.tooltip.classList.add("visible");
  moveTooltip(event);
}

function moveTooltip(event) {
  const bounds = els.chartStage.getBoundingClientRect();
  els.tooltip.style.left = `${event.clientX - bounds.left}px`;
  els.tooltip.style.top = `${event.clientY - bounds.top}px`;
}
function hideTooltip() { els.tooltip.classList.remove("visible"); }

function selectLink(link, source, target, transition) {
  state.selected = `${transition}-${link.source}-${link.target}`;
  els.detailEmpty.hidden = true;
  els.detailContent.hidden = false;
  document.querySelector("#detail-title").textContent = `${source.name} → ${target.name}`;
  document.querySelector("#detail-step").textContent = `第 ${transition + 1} 步至第 ${transition + 2} 步`;
  document.querySelector("#detail-a").textContent = format(link.a);
  document.querySelector("#detail-b").textContent = format(link.b);
  const pct = Math.round(change(link.a, link.b));
  document.querySelector("#detail-change").textContent = `${pct >= 0 ? "+" : ""}${pct}%`;
  const callout = document.querySelector("#change-callout");
  callout.style.background = pct < 0 ? "#f0eef8" : "#fff4e9";
  callout.style.color = pct < 0 ? "#5e568f" : "#a35412";
  const max = Math.max(link.a, link.b, 1);
  document.querySelector("#bar-a").style.height = `${Math.max(5, link.a / max * 60)}px`;
  document.querySelector("#bar-b").style.height = `${Math.max(5, link.b / max * 60)}px`;
  render();
  els.detailPanel.scrollTop = 0;
}

function closeDetail() {
  state.selected = null;
  els.detailEmpty.hidden = false;
  els.detailContent.hidden = true;
  render();
  els.detailPanel.scrollTop = 0;
}

function applySearch() {
  const query = state.query.trim().toLowerCase();
  els.svg.querySelectorAll("[data-search]").forEach(node => {
    node.classList.toggle("dimmed", Boolean(query) && !node.dataset.search.includes(query));
    node.classList.toggle("highlighted", Boolean(query) && node.dataset.search.includes(query));
  });
}

function bindControls() {
  document.querySelector("#dataset-a").addEventListener("change", e => { state.datasetA = e.target.value; closeDetail(); });
  document.querySelector("#dataset-b").addEventListener("change", e => { state.datasetB = e.target.value; closeDetail(); });

  document.querySelector("#node-filter").addEventListener("input", e => {
    state.nodeThreshold = +e.target.value;
    document.querySelector("#node-output").textContent = `${e.target.value}+`;
    render();
  });
  document.querySelector("#link-filter").addEventListener("input", e => {
    state.linkThreshold = +e.target.value;
    document.querySelector("#link-output").textContent = `${e.target.value}+`;
    render();
  });
  document.querySelector("#color-mode").addEventListener("change", e => { state.colorMode = e.target.value; render(); });
  document.querySelector("#order-mode").addEventListener("change", e => { state.orderMode = e.target.value; render(); });
  document.querySelector("#search-input").addEventListener("input", e => { state.query = e.target.value; applySearch(); });
  document.querySelectorAll("[data-metric]").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll("[data-metric]").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    state.metric = button.dataset.metric;
    render();
  }));
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll("[data-view]").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    state.view = button.dataset.view;
    hideTooltip();
    render();
  }));
  document.querySelectorAll("#step-picker button").forEach(button => button.addEventListener("click", () => {
    const step = +button.dataset.step;
    const active = [...document.querySelectorAll("#step-picker button.active")].map(b => +b.dataset.step);
    const min = Math.min(...active), max = Math.max(...active);
    if (step === min && active.length > 2) {
      document.querySelector(`#step-picker button[data-step="${min}"]`).classList.remove("active");
    } else if (step === max && active.length > 2) {
      document.querySelector(`#step-picker button[data-step="${max}"]`).classList.remove("active");
    } else if (!active.includes(step) && step < min) {
      for (let value = step; value < min; value++) document.querySelector(`#step-picker button[data-step="${value}"]`).classList.add("active");
    } else if (!active.includes(step) && step > max) {
      for (let value = max + 1; value <= step; value++) document.querySelector(`#step-picker button[data-step="${value}"]`).classList.add("active");
    }
    const next = [...document.querySelectorAll("#step-picker button.active")].map(b => +b.dataset.step);
    state.activeSteps = new Set(next.map(value => value - 1));
    document.querySelector(".hint").textContent = `正在显示第 ${Math.min(...next)}–${Math.max(...next)} 步交互`;
    render();
  }));

  document.querySelector("#detail-close").addEventListener("click", closeDetail);
  document.querySelector("#collapse-btn").addEventListener("click", () => document.querySelector(".workspace").classList.toggle("sidebar-collapsed"));
  document.querySelector("#focus-btn").addEventListener("click", () => {
    state.viewport = { zoom: 1, x: 0, y: 0 };
    applyViewportTransform();
  });
  els.svg.addEventListener("wheel", event => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : .89;
    state.viewport.zoom = clamp(state.viewport.zoom * factor, .65, 2.4);
    applyViewportTransform();
  }, { passive: false });
  let drag = null;
  els.svg.addEventListener("pointerdown", event => {
    if (event.target.closest(".link-cell,.node-bar,.sankey-link,.sankey-node")) return;
    drag = { x: event.clientX, y: event.clientY, startX: state.viewport.x, startY: state.viewport.y };
    els.svg.setPointerCapture(event.pointerId);
  });
  els.svg.addEventListener("pointermove", event => {
    if (!drag) return;
    const scaleX = 1120 / els.svg.getBoundingClientRect().width;
    const scaleY = 650 / els.svg.getBoundingClientRect().height;
    state.viewport.x = drag.startX + (event.clientX - drag.x) * scaleX;
    state.viewport.y = drag.startY + (event.clientY - drag.y) * scaleY;
    applyViewportTransform();
  });
  els.svg.addEventListener("pointerup", () => { drag = null; });
  els.svg.addEventListener("pointercancel", () => { drag = null; });
  document.querySelector("#reset-btn").addEventListener("click", reset);
  const dialog = document.querySelector("#help-dialog");
  document.querySelector("#help-btn").addEventListener("click", () => dialog.showModal());
  document.querySelector("#help-close").addEventListener("click", () => dialog.close());
  document.addEventListener("keydown", event => {
    if (event.key === "/" && document.activeElement.tagName !== "INPUT") {
      event.preventDefault();
      document.querySelector("#search-input").focus();
    }
    if (event.key === "Escape" && state.selected) closeDetail();
  });
}

function reset() {
  Object.assign(state, { nodeThreshold: 8, linkThreshold: 4, colorMode: "change", orderMode: "volume", metric: "both", query: "", selected: null, activeSteps: new Set([0, 1, 2, 3, 4]), viewport: { zoom: 1, x: 0, y: 0 } });
  document.querySelector("#node-filter").value = 8;
  document.querySelector("#node-output").textContent = "8+";
  document.querySelector("#link-filter").value = 4;
  document.querySelector("#link-output").textContent = "4+";
  document.querySelector("#color-mode").value = "change";
  document.querySelector("#order-mode").value = "volume";
  document.querySelector("#search-input").value = "";
  document.querySelectorAll("[data-metric]").forEach(b => b.classList.toggle("active", b.dataset.metric === "both"));
  document.querySelectorAll("#step-picker button").forEach(button => button.classList.add("active"));
  document.querySelector(".hint").textContent = "正在显示第 1–5 步交互";
  els.detailEmpty.hidden = false;
  els.detailContent.hidden = true;
  render();
}

bindControls();
render();
