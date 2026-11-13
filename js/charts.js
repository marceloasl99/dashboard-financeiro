// Chart.js wrappers with one visual system: thin marks, recessive grid, pt-BR tooltips, theme-aware.
import { money, moneyCompact } from './format.js';

const registry = new Map();

// light-mode category colors -> dark-mode steps (validated palette)
const DARK_MAP = {
  '#2a78d6': '#3987e5', '#eb6834': '#d95926', '#1baf7a': '#199e70', '#eda100': '#c98500',
  '#e87ba4': '#d55181', '#008300': '#2fa02f', '#6250d6': '#9085e9', '#e34948': '#e66767',
  '#7b6f5e': '#a89a86', '#5c6b73': '#8c9ba3', '#4f7f9f': '#6fa6c8', '#b08aa0': '#c9a3b9',
  '#8a9a4a': '#a9bb66', '#898781': '#a8a69f', '#1c5cab': '#5598e7', '#184f95': '#6da7ec',
  '#256abf': '#86b6ef', '#3987e5': '#9ec5f4', '#6da7ec': '#b7d3f6',
};
export const isDark = () => document.documentElement.dataset.theme === 'dark';
export const seriesColor = hex => (isDark() ? DARK_MAP[hex?.toLowerCase()] || hex : hex);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

export function theme() {
  return { ink: css('--ink-2'), muted: css('--ink-3'), grid: css('--grid'), surface: css('--surface'),
           pos: css('--pos'), neg: css('--neg'), brand: isDark() ? '#5fa3c4' : css('--brand') };
}

export function destroy(id) { registry.get(id)?.destroy(); registry.delete(id); }
export function destroyAll() { for (const c of registry.values()) c.destroy(); registry.clear(); }

export function make(canvas, config) {
  const id = canvas.id || canvas;
  destroy(id);
  const t = theme();
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = t.muted;
  const chart = new Chart(canvas, {
    ...config,
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
      interaction: { mode: 'index', intersect: false },
      ...config.options,
      plugins: {
        legend: { display: false, ...(config.options?.plugins?.legend || {}) },
        tooltip: {
          backgroundColor: isDark() ? '#0f1519' : '#15202B', titleColor: '#fff', bodyColor: '#e6e6e6',
          padding: 10, cornerRadius: 8, displayColors: true, boxPadding: 4,
          callbacks: { label: c => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${money(c.raw)}` },
          ...(config.options?.plugins?.tooltip || {}),
        },
      },
    },
  });
  registry.set(id, chart);
  return chart;
}

export const moneyAxis = (extra = {}) => ({
  grid: { color: theme().grid, drawTicks: false }, border: { display: false },
  ticks: { callback: v => moneyCompact(v), maxTicksLimit: 6, padding: 6 }, ...extra,
});
export const plainAxis = (extra = {}) => ({ grid: { display: false }, border: { color: theme().grid }, ticks: { padding: 6 }, ...extra });

// Doughnut with top-N + "Outros" folding so the categorical set never cycles.
export function donut(canvas, items, { max = 8, otherLabel = 'Outros' } = {}) {
  let sorted = [...items].sort((a, b) => b.value - a.value);
  if (sorted.length > max) {
    const rest = sorted.slice(max - 1);
    sorted = [...sorted.slice(0, max - 1), { label: otherLabel, value: rest.reduce((s, x) => s + x.value, 0), color: '#898781' }];
  }
  return make(canvas, {
    type: 'doughnut',
    data: { labels: sorted.map(x => x.label), datasets: [{ data: sorted.map(x => x.value), backgroundColor: sorted.map(x => seriesColor(x.color)), borderColor: theme().surface, borderWidth: 2, hoverOffset: 4 }] },
    options: { cutout: '68%', interaction: { mode: 'nearest', intersect: true }, plugins: { tooltip: { callbacks: { label: c => ` ${c.label}: ${money(c.raw)} (${Math.round(c.raw / sorted.reduce((s, x) => s + x.value, 0) * 100)}%)` } } } },
  });
}
