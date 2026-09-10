import { fetchText } from "./client.js";

/**
 * Fetch Substack theme colors for any handle/publication without LLM.
 *
 * Strategy (mirrors manual discovery):
 *  1. Try https://{handle}.substack.com/ (primary publication) — most accurate
 *  2. Fallback to https://{subdomain}.substack.com/ if handle ≠ subdomain
 *  3. Fallback to https://substack.com/@{handle} reader profile (window._preloads + app-theme-css)
 *
 * Parsing is raw HTML + regex, no DOM, no auth. Rate-safe (1 req per handle).
 */

const VAR_RE = /--([\w-]+)\s*:\s*([^;]+);/g;

function parseCssVars(cssBlock) {
  const vars = {};
  let m;
  while ((m = VAR_RE.exec(cssBlock)) !== null) {
    vars[m[1].trim()] = m[2].trim();
  }
  return vars;
}

function extractPubTheme(html) {
  const m = html.match(/<style[^>]*data-pub-theme-prefix[^>]*>(.*?)<\/style>/s);
  if (!m) return null;
  return parseCssVars(m[1]);
}

function extractAppTheme(html) {
  const m = html.match(/<style[^>]*id="app-theme-css"[^>]*>(.*?)<\/style>/s);
  if (!m) return null;
  return parseCssVars(m[1]);
}

/**
 * Extract profile.theme from window._preloads JSON blob.
 * Returns null if not found or parse fails.
 */
function extractPreloadsTheme(html) {
  const m = html.match(/window\._preloads\s*=\s*JSON\.parse\("((?:\\"|[^"])*)"\)/s);
  if (!m) return null;
  try {
    // JS string -> JSON string -> object. Handle unicode escapes + surrogates.
    let raw = m[1];
    // decode JS unicode escapes (\uXXXX) without breaking surrogate pairs
    raw = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    raw = raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    // remove lone surrogates that break JSON.parse
    raw = raw.replace(/[\uD800-\uDFFF]/g, "");
    const data = JSON.parse(raw);
    const t = data?.profile?.theme;
    if (!t?.colors) return null;
    return t;
  } catch {
    return null;
  }
}

function normalizeFromPubVars(vars, handle, url) {
  if (!vars) return null;
  // core vars — see discovery for danielloureno1: --background_pop, --web_bg_color, etc.
  const accent = vars["background_pop"] || vars["color_theme_bg_pop"] || vars["color_theme_accent"] || "#FF6719";
  const accentDarken = vars["background_pop_darken"] || vars["color_theme_bg_pop_darken"] || accent;
  const bg = vars["web_bg_color"] || vars["cover_bg_color"] || "#ffffff";
  const coverBg = vars["cover_bg_color"] || bg;
  const coverBgSecondary = vars["cover_bg_color_secondary"] || vars["background_contrast_1"] || "#f0f0f0";
  const textPrimary = vars["cover_print_primary"] || vars["print_on_web_bg_color"] || (vars["theme_bg_is_dark"] === "1" ? "#ffffff" : "#363737");
  const textSecondary = vars["cover_print_secondary"] || vars["print_secondary_on_web_bg_color"] || "#757575";
  const muted = vars["cover_print_tertiary"] || textSecondary;
  const grid = vars["background_contrast_1"] || vars["color_theme_bg_contrast_1"] || "#e6e6e6";
  const isDark = vars["theme_bg_is_dark"] === "1";
  return {
    handle,
    source: url,
    accent: normalizeHex(accent),
    accentHover: normalizeHex(accentDarken),
    accentAlpha20: vars["color_theme_bg_pop_20"] || `rgba(${hexToRgb(accent).join(", ")}, 0.2)`,
    accentAlpha30: vars["color_theme_bg_pop_30"] || `rgba(${hexToRgb(accent).join(", ")}, 0.3)`,
    bg: normalizeHex(bg),
    coverBg: normalizeHex(coverBg),
    coverBgSecondary: normalizeHex(coverBgSecondary),
    textPrimary: normalizeHex(textPrimary),
    textSecondary: normalizeHex(textSecondary),
    muted: normalizeHex(muted),
    grid: normalizeHex(grid),
    isDark,
    rawVars: vars,
  };
}

function normalizeFromPreloads(theme, handle) {
  if (!theme) return null;
  const c = theme.colors;
  const accentRgb = c.accent?.primary || c.accent;
  const accent = rgbToHex(accentRgb) || c.accent?.name || "#4f46e5";
  const accentHover = rgbToHex(c.accent?.primary_hover) || accent;
  const bgRgb = c.bg?.primary || c.bg?.tint || c.bg?.hue;
  const bg = rgbToHex(bgRgb) || c.bg?.name || "#292524";
  const fgPrimary = rgbToHex(c.fg?.primary) || "#ffffff";
  const fgSecondary = rgbToHex(c.fg?.secondary) || "#a9a8a7";
  const fgTertiary = rgbToHex(c.fg?.tertiary) || fgSecondary;
  return {
    handle,
    source: `https://substack.com/@${handle}`,
    accent: normalizeHex(accent),
    accentHover: normalizeHex(accentHover),
    accentAlpha20: `rgba(${hexToRgb(accent).join(", ")}, 0.2)`,
    accentAlpha30: `rgba(${hexToRgb(accent).join(", ")}, 0.3)`,
    bg: normalizeHex(bg),
    coverBg: normalizeHex(bg),
    coverBgSecondary: normalizeHex(rgbToHex(c.bg?.secondary) || bg),
    textPrimary: normalizeHex(fgPrimary),
    textSecondary: normalizeHex(fgSecondary),
    muted: normalizeHex(fgTertiary),
    grid: normalizeHex(rgbToHex(c.bg?.quaternary) || "#44403C"),
    isDark: !!c.is_dark,
    fonts: theme.fonts,
    rawVars: null,
  };
}

function rgbToHex(c) {
  if (!c || typeof c.r !== "number") return null;
  const toHex = (n) => Math.round(n).toString(16).padStart(2, "0");
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

function hexToRgb(hex) {
  const h = normalizeHex(hex).slice(1);
  const full = h.length === 3 ? h.split("").map((ch) => ch + ch).join("") : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function normalizeHex(v) {
  if (!v) return v;
  v = v.trim();
  // rgb(...) -> hex
  const m = v.match(/rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)/) || v.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    const toHex = (n) => parseInt(n).toString(16).padStart(2, "0");
    return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
  }
  if (v.startsWith("#")) {
    if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
    return v.toLowerCase();
  }
  return v;
}

/**
 * Public API: fetch theme for any handle.
 * @param {string} handle - e.g. "danielloureno1" or subdomain "daniellourenco"
 * @param {object} [opts]
 * @param {string} [opts.subdomain] - explicit subdomain if handle ≠ subdomain
 * @returns {Promise<object>} normalized theme (see normalizeFromPubVars)
 */
export async function fetchTheme(handle, { subdomain } = {}) {
  const candidates = [];
  const sub = subdomain || handle;
  // 1. publication subdomain
  candidates.push(`https://${sub}.substack.com/`);
  if (sub !== handle) candidates.push(`https://${handle}.substack.com/`);
  // 2. reader profile
  candidates.push(`https://substack.com/@${handle}`);

  let lastErr = null;
  for (const url of candidates) {
    try {
      const html = await fetchText(url, `theme:${handle}`);
      const pubVars = extractPubTheme(html);
      if (pubVars && pubVars["background_pop"]) {
        const t = normalizeFromPubVars(pubVars, handle, url);
        // enrich with app-theme if present
        const appVars = extractAppTheme(html);
        if (appVars) t.appVars = appVars;
        const preloads = extractPreloadsTheme(html);
        if (preloads) t.preloadsTheme = preloads;
        return t;
      }
      // fallback to preloads/app-theme on @ pages where pub prefix is default orange
      const preloads = extractPreloadsTheme(html);
      if (preloads) {
        const t = normalizeFromPreloads(preloads, handle);
        t.source = url;
        t.fallback = true;
        return t;
      }
      const appVars = extractAppTheme(html);
      if (appVars && appVars["color-app-light-accent"]) {
        // synthesize minimal theme from app vars
        return {
          handle,
          source: url,
          accent: normalizeHex(appVars["color-app-light-accent"]),
          accentHover: normalizeHex(appVars["color-app-light-accent-hover"]),
          bg: normalizeHex(appVars["color-app-light-bg-primary"] || "#292524"),
          coverBg: normalizeHex(appVars["color-app-light-bg-primary"] || "#292524"),
          textPrimary: "#ffffff",
          textSecondary: "#a9a8a7",
          muted: "#a9a8a7",
          grid: "#44403C",
          isDark: true,
          rawVars: appVars,
          fallback: true,
        };
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`No theme found for handle "${handle}"`);
}

function lightenHex(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const l = (c) => Math.min(255, Math.round(c + (255 - c) * amt));
  return `#${l(r).toString(16).padStart(2, "0")}${l(g).toString(16).padStart(2, "0")}${l(b).toString(16).padStart(2, "0")}`;
}
function darkenHex(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const d = (c) => Math.max(0, round(c * (1 - amt)));
  function round(n){return Math.round(n);}
  return `#${d(r).toString(16).padStart(2, "0")}${d(g).toString(16).padStart(2, "0")}${d(b).toString(16).padStart(2, "0")}`;
}

function _luminance(hex){
  try{
    const [r,g,b]=hexToRgb(hex);
    const lin=c=>{c=c/255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
    return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
  }catch{ return 0.5; }
}
function _contrast(a,b){
  const l1=_luminance(a), l2=_luminance(b);
  return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
}
function _adaptiveMuted(theme, bg, isDark){
  const rawMuted = theme.muted || theme.textSecondary || "#a9a8a7";
  const textSec = theme.textSecondary || "#757575";
  if(!isDark){
    if(_contrast(rawMuted, bg) < 2.8){
      const raw=theme.rawVars||{};
      const cands=[textSec];
      for(const k of ["print_secondary_on_web_bg_color","background_contrast_5","background_contrast_4","background_contrast_3"]){
        if(raw[k]) cands.push(normalizeHex(raw[k]));
      }
      for(const cand of cands){
        if(_contrast(cand, bg) >= 3.0) return normalizeHex(cand);
      }
      return darkenHex(bg, 0.45);
    }
    return normalizeHex(rawMuted);
  } else {
    if(_contrast(rawMuted, bg) < 3.5) return lightenHex(bg, 0.55);
    return normalizeHex(rawMuted);
  }
}
function _adaptiveGrid(theme, bg, isDark){
  const raw=theme.rawVars||{};
  const bgLum=_luminance(bg);
  if(isDark){
    for(const k of ["background_contrast_1","color_theme_bg_contrast_1","background_contrast_2","color_theme_bg_contrast_2"]){
      const v=raw[k]; if(v){
        const nv=normalizeHex(v);
        if(Math.abs(_luminance(nv)-bgLum) > 0.06) return nv;
      }
    }
    return lightenHex(bg, 0.12);
  } else {
    for(const k of ["background_contrast_2","color_theme_bg_contrast_2","background_contrast_3","color_theme_bg_contrast_3","background_contrast_1"]){
      const v=raw[k]; if(v){
        const nv=normalizeHex(v);
        if(Math.abs(_luminance(nv)-bgLum) > 0.07 && _contrast(nv,bg) < 6) return nv;
      }
    }
    return darkenHex(bg, 0.18);
  }
}
function _adaptivePeak(accent, isDark, bg){
  const accLum=_luminance(accent);
  if(!isDark && accLum < 0.12) return lightenHex(accent, 0.22);
  if(!isDark && accLum < 0.25) return lightenHex(accent, 0.14);
  return isDark ? lightenHex(accent,0.18) : darkenHex(accent,0.15);
}

/**
 * Derive Manim-ready palette from a normalized theme — adaptive.
 * template: "adaptive" (default), "high_contrast", "soft"
 */
export function toManimPalette(theme, template="adaptive") {
  const accent = theme.accent;
  const accentHover = theme.accentHover || accent;
  const isDark = !!theme.isDark;
  const bg = theme.bg || theme.webBg || theme.coverBg || (isDark ? "#292524" : "#ffffff");
  const peak = _adaptivePeak(accent, isDark, bg);
  let muted = _adaptiveMuted(theme, bg, isDark);
  let grid = _adaptiveGrid(theme, bg, isDark);
  let text = theme.textPrimary || (isDark ? "#ffffff" : "#363737");
  if(_contrast(text, bg) < 4.5) text = isDark ? "#ffffff" : "#1a1a1a";
  if(template==="high_contrast"){
    if(isDark){ muted=lightenHex(muted,0.15); grid=lightenHex(grid,0.08); }
    else { muted=darkenHex(muted,0.18); grid=darkenHex(grid,0.12);
      const lum=_luminance(accent);
      // for high contrast light, ensure peak distinct
      // keep existing peak logic but boost
    }
  } else if(template==="soft"){
    grid = isDark ? lightenHex(bg,0.07) : darkenHex(bg,0.08);
  }
  return {
    BG: normalizeHex(bg),
    BAR: normalizeHex(accent),
    BAR_PEAK: normalizeHex(peak),
    BAR_HOVER: normalizeHex(accentHover),
    TEXT_COLOR: normalizeHex(text),
    MUTED: normalizeHex(muted),
    GRID_COLOR: normalizeHex(grid),
    IS_DARK: isDark,
    TEMPLATE: template,
  };
}

export { parseCssVars, extractPubTheme, extractAppTheme, extractPreloadsTheme, normalizeHex, hexToRgb };
