// The contour map behind the radar, ported from the app's Metal shader
// (WhatTheFlight/UI/TopographyShader.swift) to WebGL2.
//
// A height field is built once per canvas size from simplex fBm, then a fragment pass draws
// one anti-aliased line per elevation. Tide only shifts which heights get a line, so the
// animated hero costs a few texture reads a frame.
//
//   <canvas class="topo" data-topo="survey paper live"></canvas>
//
// data-topo: a style (remaster, survey, highlands, relief), a theme (auto, paper, night, dusk, teal),
// and "live" for the Tide animation. Stills are drawn by one shared WebGL context and copied in.
//
//   <canvas class="backdrop" data-backdrop="survey"></canvas>
//
// The page backdrop: one map behind the whole page, drawn into a fixed canvas as you scroll.
// The terrain moves at PARALLAX × the scroll, so it reads as ground far below. Its colors come
// from the page's bands (elements with data-band; CSS gives each --band-paper, an optional
// --band-swell, --band-ink and --band-lines). Neighbouring bands blend across their shared
// edge: the paper as a gradient on <html>, which scrolls with the page, and the line color in
// the shader.

(function () {
  'use strict';

  const LOOKS = {
    remaster:  { index: 0, levels: 7,  minor: 1.5,  major: 1.5, alpha: [0.32, 0.17], majorAlpha: [0.32, 0.17], hasIndex: 0, shade: [0, 0] },
    survey:    { index: 1, levels: 14, minor: 0.8,  major: 1.7, alpha: [0.22, 0.12], majorAlpha: [0.36, 0.20], hasIndex: 1, shade: [0, 0] },
    highlands: { index: 2, levels: 17, minor: 0.75, major: 1.6, alpha: [0.20, 0.11], majorAlpha: [0.34, 0.19], hasIndex: 1, shade: [0, 0] },
    relief:    { index: 3, levels: 13, minor: 0.8,  major: 1.6, alpha: [0.20, 0.11], majorAlpha: [0.33, 0.18], hasIndex: 1, shade: [0.08, 0.05] },
  };

  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

  // Palette.paper and the renderer's ink, light and dark. Teal is the app icon's.
  const THEMES = {
    paper: { paper: rgb('#E9E7E2'), paper2: rgb('#E9E7E2'), ink: [0.30, 0.28, 0.25], dark: 0, boost: 1 },
    night: { paper: rgb('#0A0E14'), paper2: rgb('#0A0E14'), ink: [0.66, 0.72, 0.86], dark: 1, boost: 1 },
    dusk:  { paper: rgb('#111722'), paper2: rgb('#111722'), ink: [0.66, 0.72, 0.86], dark: 1, boost: 1 },
    teal:  { paper: rgb('#1E545A'), paper2: rgb('#0D2C31'), ink: [0.86, 0.96, 0.96], dark: 1, boost: 1.25 },
  };

  const NOISE = `
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    // 3D simplex noise: Ashima Arts / Stefan Gustavson (MIT).
    float snoise(vec3 v) {
      const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(
          i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4(0.0));
      m = m * m;
      return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
    }

    float fbm(vec2 p, float z, int octaves, float gain) {
      const mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
      float a = 0.5, s = 0.0, n = 0.0;
      for (int i = 0; i < 4; i++) {
        if (i >= octaves) break;
        s += a * snoise(vec3(p, z + float(i) * 1.7));
        n += a;
        p = rot * p * 2.03 + vec2(11.3, -7.1);
        a *= gain;
      }
      return s / n;
    }

    float ridged(vec2 p, float z, int octaves) {
      const mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
      float a = 0.5, s = 0.0, n = 0.0;
      for (int i = 0; i < 3; i++) {
        if (i >= octaves) break;
        float r = 1.0 - abs(snoise(vec3(p, z + float(i) * 2.3)));
        s += a * r * r;
        n += a;
        p = rot * p * 2.03 + vec2(5.1, 3.3);
        a *= 0.5;
      }
      return s / n;
    }

    float terrainHeight(vec2 p, float z, int style) {
      if (style == 0) return fbm(p * 0.75, z, 3, 0.38);
      if (style == 1) return fbm(p * 0.8, z, 4, 0.45);
      if (style == 2) {
        vec2 w = p * 0.8;
        vec2 q = vec2(fbm(w, z, 3, 0.5), fbm(w + vec2(5.2, 1.3), z, 3, 0.5));
        return fbm(w + 0.8 * q, z, 4, 0.47);
      }
      return 0.65 * fbm(p * 0.8, z, 4, 0.45) + 0.35 * (ridged(p * 0.6, z, 3) - 0.55);
    }
  `;

  const VERTEX = `#version 300 es
    in vec2 position;
    void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

  const HEIGHT = `#version 300 es
    precision highp float;
    ${NOISE}
    uniform vec2 uOrigin;      // terrain point at texel (0, 0), y down
    uniform vec2 uSize;        // texels
    uniform float uPtPerTexel;
    uniform float uFeature;
    uniform float uSeed;
    uniform int uStyle;
    uniform float uFlip;       // 1: row 0 is the bottom (stills); 0: row 0 is the top (backdrop)
    out vec4 outColor;
    void main() {
      vec2 texel = vec2(gl_FragCoord.x, mix(gl_FragCoord.y, uSize.y - gl_FragCoord.y, uFlip));
      vec2 pt = uOrigin + texel * uPtPerTexel;
      vec2 p = pt / uFeature + vec2(uSeed * 17.17, uSeed * -9.31);
      outColor = vec4(terrainHeight(p, uSeed * 1.37, uStyle), 0.0, 0.0, 1.0);
    }`;

  const CONTOURS = `#version 300 es
    precision highp float;
    uniform highp sampler2D uHeight;
    uniform vec2 uHeightSize;
    uniform vec2 uCanvasSize;
    uniform vec3 uPaper;
    uniform vec3 uPaper2;
    uniform vec3 uInk;
    uniform float uPxPerPt;
    uniform float uPtPerTexel;
    uniform float uFeature;
    uniform float uLevels;
    uniform float uMinorWidth;
    uniform float uIndexWidth;
    uniform float uMinorAlpha;
    uniform float uIndexAlpha;
    uniform float uShift;
    uniform float uShade;
    uniform int uHasIndex;
    uniform int uDark;
    out vec4 outColor;

    float bilinear(vec2 texel) {
      vec2 t = texel - 0.5;
      vec2 f = fract(t);
      ivec2 i0 = ivec2(floor(t));
      ivec2 last = ivec2(uHeightSize) - 1;
      float a = texelFetch(uHeight, clamp(i0, ivec2(0), last), 0).r;
      float b = texelFetch(uHeight, clamp(i0 + ivec2(1, 0), ivec2(0), last), 0).r;
      float c = texelFetch(uHeight, clamp(i0 + ivec2(0, 1), ivec2(0), last), 0).r;
      float d = texelFetch(uHeight, clamp(i0 + ivec2(1, 1), ivec2(0), last), 0).r;
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    void main() {
      vec2 uv = vec2(gl_FragCoord.x, uCanvasSize.y - gl_FragCoord.y) / uCanvasSize;
      vec2 texel = uv * uHeightSize;
      float h = bilinear(texel);
      float v = h * uLevels + uShift;
      float fw = max(fwidth(v), 1e-5);
      float dist = abs(fract(v + 0.5) - 0.5) / fw;
      float n = floor(v + 0.5);
      bool isIndex = uHasIndex != 0 && (n - 5.0 * floor(n / 5.0)) < 0.5;
      float want = (isIndex ? uIndexWidth : uMinorWidth) * uPxPerPt;
      float width = max(want, 0.85);
      float cover = clamp(width * 0.5 + 0.5 - dist, 0.0, 1.0) * min(1.0, want / 0.85);
      float crowd = 1.0 - smoothstep(0.28, 0.65, fw);
      float alpha = cover * crowd * (isIndex ? uIndexAlpha : uMinorAlpha);

      vec3 color = mix(uPaper, uPaper2, clamp((uv.x * 0.45 + uv.y * 0.55), 0.0, 1.0));
      if (uShade > 0.0) {
        // Relief's hill shading, lit from the upper left.
        vec2 slope = vec2(bilinear(texel + vec2(1.0, 0.0)) - bilinear(texel - vec2(1.0, 0.0)),
                          bilinear(texel + vec2(0.0, 1.0)) - bilinear(texel - vec2(0.0, 1.0)))
                     / (2.0 * uPtPerTexel) * uFeature;
        vec3 normal = normalize(vec3(-slope * 0.55, 1.0));
        vec3 light = normalize(vec3(-1.0, -1.0, 1.25));
        float s = dot(normal, light) - light.z;
        color = uDark != 0 ? color + vec3(0.55, 0.62, 0.78) * s * uShade : color * (1.0 + s * uShade);
      }
      outColor = vec4(clamp(mix(color, uInk, alpha), 0.0, 1.0), 1.0);
    }`;

  // The page backdrop: only the lines, premultiplied, over the paper gradient on <html>.
  const MAX_STOPS = 48;
  const BACKDROP = `#version 300 es
    precision highp float;
    uniform highp sampler2D uHeight;
    uniform vec2 uHeightSize;
    uniform vec2 uCanvasSize;
    uniform float uPxPerPt;
    uniform float uTexelsPerPt;
    uniform float uTerrainTop;   // terrain row (pt) at the top of the canvas
    uniform float uDocTop;       // page y (pt) at the top of the canvas
    uniform float uLevels;
    uniform float uMinorWidth;
    uniform float uIndexWidth;
    uniform float uMinorAlpha;
    uniform float uIndexAlpha;
    uniform float uShift;
    uniform int uHasIndex;
    uniform float uStopY[${MAX_STOPS}];
    uniform vec4 uStopInk[${MAX_STOPS}];   // line color + strength
    uniform int uStopCount;
    out vec4 outColor;

    float bilinear(vec2 texel) {
      vec2 t = texel - 0.5;
      vec2 f = fract(t);
      ivec2 i0 = ivec2(floor(t));
      ivec2 last = ivec2(uHeightSize) - 1;
      float a = texelFetch(uHeight, clamp(i0, ivec2(0), last), 0).r;
      float b = texelFetch(uHeight, clamp(i0 + ivec2(1, 0), ivec2(0), last), 0).r;
      float c = texelFetch(uHeight, clamp(i0 + ivec2(0, 1), ivec2(0), last), 0).r;
      float d = texelFetch(uHeight, clamp(i0 + ivec2(1, 1), ivec2(0), last), 0).r;
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    // Stops are sorted and strictly increasing, so each smoothstep only bites between its pair.
    vec4 inkAt(float y) {
      vec4 ink = uStopInk[0];
      for (int i = 1; i < ${MAX_STOPS}; i++) {
        if (i >= uStopCount) break;
        ink = mix(ink, uStopInk[i], smoothstep(uStopY[i - 1], uStopY[i], y));
      }
      return ink;
    }

    void main() {
      vec2 pt = vec2(gl_FragCoord.x, uCanvasSize.y - gl_FragCoord.y) / uPxPerPt;
      float h = bilinear(vec2(pt.x, pt.y + uTerrainTop) * uTexelsPerPt);
      float v = h * uLevels + uShift;
      float fw = max(fwidth(v), 1e-5);
      float dist = abs(fract(v + 0.5) - 0.5) / fw;
      float n = floor(v + 0.5);
      bool isIndex = uHasIndex != 0 && (n - 5.0 * floor(n / 5.0)) < 0.5;
      float want = (isIndex ? uIndexWidth : uMinorWidth) * uPxPerPt;
      float width = max(want, 0.85);
      float cover = clamp(width * 0.5 + 0.5 - dist, 0.0, 1.0) * min(1.0, want / 0.85);
      float crowd = 1.0 - smoothstep(0.28, 0.65, fw);
      vec4 ink = inkAt(pt.y + uDocTop);
      float alpha = clamp(cover * crowd * (isIndex ? uIndexAlpha : uMinorAlpha) * ink.a, 0.0, 1.0);
      outColor = vec4(ink.rgb * alpha, alpha);
    }`;

  // ---------------------------------------------------------------------------------------

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Topography shader:', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  function program(gl, fragment) {
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'position');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
    const uniforms = {};
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(p, i).name;
      uniforms[name] = gl.getUniformLocation(p, name);
    }
    return { p, u: uniforms };
  }

  /// One WebGL2 context: builds height fields and draws contours into its own canvas.
  function Renderer(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;
    const height = program(gl, HEIGHT);
    const contours = program(gl, CONTOURS);
    if (!height || !contours) return null;

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const framebuffer = gl.createFramebuffer();
    let terrain = null; // { key, texture, w, h, ptPerTexel, feature }

    function buildTerrain(style, cssW, cssH, feature, texelsPerPt, seed) {
      const w = Math.max(1, Math.ceil(cssW * texelsPerPt));
      const h = Math.max(1, Math.ceil(cssH * texelsPerPt));
      const key = [style, w, h, feature, seed].join('|');
      if (terrain && terrain.key === key) return terrain;
      if (terrain) gl.deleteTexture(terrain.texture);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.viewport(0, 0, w, h);
      gl.useProgram(height.p);
      const ptPerTexel = 1 / texelsPerPt;
      // Centred on the canvas middle, as the app centres it on the screen.
      gl.uniform2f(height.u.uOrigin, -cssW / 2, -cssH / 2);
      gl.uniform2f(height.u.uSize, w, h);
      gl.uniform1f(height.u.uPtPerTexel, ptPerTexel);
      gl.uniform1f(height.u.uFeature, feature);
      gl.uniform1f(height.u.uSeed, seed);
      gl.uniform1i(height.u.uStyle, LOOKS[style].index);
      gl.uniform1f(height.u.uFlip, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      terrain = { key, texture, w, h, ptPerTexel, feature };
      return terrain;
    }

    function draw({ style, theme, cssW, cssH, pxW, pxH, feature, shift = 0, seed = 1, strength = 1 }) {
      const look = LOOKS[style] || LOOKS.survey;
      const colors = THEMES[theme] || THEMES.paper;
      const dpr = pxW / cssW;
      if (canvas.width !== pxW) canvas.width = pxW;
      if (canvas.height !== pxH) canvas.height = pxH;
      const t = buildTerrain(style, cssW, cssH, feature, Math.max(1, dpr / 2), seed);
      const d = colors.dark;
      gl.viewport(0, 0, pxW, pxH);
      gl.useProgram(contours.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, t.texture);
      const u = contours.u;
      gl.uniform1i(u.uHeight, 0);
      gl.uniform2f(u.uHeightSize, t.w, t.h);
      gl.uniform2f(u.uCanvasSize, pxW, pxH);
      gl.uniform3fv(u.uPaper, colors.paper);
      gl.uniform3fv(u.uPaper2, colors.paper2);
      gl.uniform3fv(u.uInk, colors.ink);
      gl.uniform1f(u.uPxPerPt, dpr);
      gl.uniform1f(u.uPtPerTexel, t.ptPerTexel);
      gl.uniform1f(u.uFeature, t.feature);
      gl.uniform1f(u.uLevels, look.levels);
      gl.uniform1f(u.uMinorWidth, look.minor);
      gl.uniform1f(u.uIndexWidth, look.major);
      gl.uniform1f(u.uMinorAlpha, look.alpha[d] * colors.boost * strength);
      gl.uniform1f(u.uIndexAlpha, look.majorAlpha[d] * colors.boost * strength);
      gl.uniform1f(u.uShift, shift);
      gl.uniform1f(u.uShade, look.shade[d]);
      gl.uniform1i(u.uHasIndex, look.hasIndex);
      gl.uniform1i(u.uDark, d);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    return { draw, canvas, gl };
  }

  // ---------------------------------------------------------------------------------------

  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function resolvedTheme(theme) {
    if (theme !== 'auto') return theme;
    const forced = document.documentElement.dataset.theme;
    if (forced === 'dark') return 'night';
    if (forced === 'light') return 'paper';
    return darkQuery.matches ? 'night' : 'paper';
  }

  /// Size of the largest hills: the app uses 340 pt on iPhone and 420 on iPad.
  function featureFor(el, cssW) {
    const given = parseFloat(el.dataset.topoFeature);
    if (given) return given;
    if (cssW < 700) return 340;
    // Wide windows get bigger hills, so the hero isn't busier than the phone.
    return Math.min(560, Math.max(420, cssW * 0.36));
  }

  function measure(el) {
    const rect = el.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    // At most 2× and 4096 px a side, and about 8 megapixels in all.
    const dpr = Math.min(window.devicePixelRatio || 1, 2, 4096 / cssW, 4096 / cssH, Math.sqrt(8e6 / (cssW * cssH)));
    return { cssW, cssH, pxW: Math.round(cssW * dpr), pxH: Math.round(cssH * dpr) };
  }

  function parse(el) {
    const words = (el.dataset.topo || '').split(/\s+/);
    return {
      style: words.find((w) => LOOKS[w]) || 'survey',
      theme: words.find((w) => THEMES[w] || w === 'auto') || 'auto',
      live: words.includes('live'),
      strength: parseFloat(el.dataset.topoStrength) || 1,
    };
  }

  // Stills share one hidden context and are copied into 2D canvases.
  let shared;
  function sharedRenderer() {
    if (shared === undefined) shared = Renderer(document.createElement('canvas'));
    return shared;
  }

  function drawStill(el) {
    const r = sharedRenderer();
    if (!r) return false;
    const opts = parse(el);
    const m = measure(el);
    r.draw({ style: opts.style, theme: resolvedTheme(opts.theme), feature: featureFor(el, m.cssW), strength: opts.strength, ...m });
    if (el.width !== m.pxW) el.width = m.pxW;
    if (el.height !== m.pxH) el.height = m.pxH;
    const ctx = el.getContext('2d');
    ctx.drawImage(r.canvas, 0, 0);
    el.classList.add('is-drawn');
    return true;
  }

  function setUpLive(el) {
    const r = Renderer(el);
    if (!r) return null;
    const opts = parse(el);
    let shift = 0;
    let last = 0;
    let visible = true;
    let frame = 0;

    function render(now) {
      frame = 0;
      const m = measure(el);
      const animate = !reduceMotion.matches && visible && !document.hidden;
      if (last && animate) {
        // 0.05 contour levels a second, as the app's Tide at 1×.
        shift = (shift + Math.min(0.1, (now - last) / 1000) * 0.05) % 5;
      }
      last = now;
      r.draw({ style: opts.style, theme: resolvedTheme(opts.theme), feature: featureFor(el, m.cssW), strength: opts.strength, shift, ...m });
      el.classList.add('is-drawn');
      if (animate) schedule();
    }

    // The tide is slow, so 24 frames a second is plenty.
    function schedule() {
      if (frame) return;
      frame = setTimeout(() => requestAnimationFrame(render), 1000 / 24);
    }

    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) { last = 0; schedule(); }
    }).observe(el);
    document.addEventListener('visibilitychange', () => { last = 0; schedule(); });

    return { redraw: () => { last = 0; schedule(); } };
  }

  // ---------------------------------------------------------------------------------------
  // The page backdrop

  /// The terrain moves this much for each point the page scrolls.
  const PARALLAX = 0.6;
  /// Terrain kept above the page and below it, for the rubber band.
  const OVERSCROLL = 320;

  function Backdrop(canvas, look) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;
    const height = program(gl, HEIGHT);
    const lines = program(gl, BACKDROP);
    if (!height || !lines) return null;
    const maxSize = Math.min(8192, gl.getParameter(gl.MAX_TEXTURE_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const framebuffer = gl.createFramebuffer();
    const stopY = new Float32Array(MAX_STOPS);
    const stopInk = new Float32Array(MAX_STOPS * 4);
    let field = null; // { texture, w, h, density, cssW, ptHeight, feature }

    /// The height field for a strip of terrain cssW wide and ptHeight tall, row 0 at the top.
    /// Rebuilt only for a new width or a taller page, with headroom so the page settling
    /// (fonts, images) doesn't rebuild it again.
    function ensureField(cssW, ptHeight, feature) {
      if (field && field.cssW === cssW && field.feature === feature && field.ptHeight >= ptHeight) return;
      const tall = ptHeight * 1.12 + 2 * OVERSCROLL;
      const density = Math.max(0.25, Math.min(1, maxSize / tall, maxSize / cssW, Math.sqrt(6e6 / (cssW * tall))));
      const w = Math.ceil(cssW * density);
      const h = Math.ceil(tall * density);
      if (field) gl.deleteTexture(field.texture);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.viewport(0, 0, w, h);
      gl.useProgram(height.p);
      gl.uniform2f(height.u.uOrigin, -cssW / 2, -OVERSCROLL);
      gl.uniform2f(height.u.uSize, w, h);
      gl.uniform1f(height.u.uPtPerTexel, 1 / density);
      gl.uniform1f(height.u.uFeature, feature);
      gl.uniform1f(height.u.uSeed, 1);
      gl.uniform1i(height.u.uStyle, look.index);
      gl.uniform1f(height.u.uFlip, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      field = { texture, w, h, density, cssW, ptHeight: tall - 2 * OVERSCROLL, feature };
    }

    function draw({ cssW, pxW, pxH, docTop, terrainTop, shift, stops }) {
      if (canvas.width !== pxW) canvas.width = pxW;
      if (canvas.height !== pxH) canvas.height = pxH;
      const count = Math.min(stops.length, MAX_STOPS);
      for (let i = 0; i < count; i++) {
        stopY[i] = stops[i].y;
        stopInk.set(stops[i].ink, i * 4);
        stopInk[i * 4 + 3] = stops[i].lines;
      }
      gl.viewport(0, 0, pxW, pxH);
      gl.useProgram(lines.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, field.texture);
      const u = lines.u;
      gl.uniform1i(u.uHeight, 0);
      gl.uniform2f(u.uHeightSize, field.w, field.h);
      gl.uniform2f(u.uCanvasSize, pxW, pxH);
      gl.uniform1f(u.uPxPerPt, pxW / cssW);
      gl.uniform1f(u.uTexelsPerPt, field.density);
      gl.uniform1f(u.uTerrainTop, Math.max(-OVERSCROLL, terrainTop) + OVERSCROLL);
      gl.uniform1f(u.uDocTop, docTop);
      gl.uniform1f(u.uLevels, look.levels);
      gl.uniform1f(u.uMinorWidth, look.minor);
      gl.uniform1f(u.uIndexWidth, look.major);
      gl.uniform1f(u.uMinorAlpha, look.alpha[0]);
      gl.uniform1f(u.uIndexAlpha, look.majorAlpha[0]);
      gl.uniform1f(u.uShift, shift);
      gl.uniform1i(u.uHasIndex, look.hasIndex);
      gl.uniform1fv(u['uStopY[0]'], stopY);
      gl.uniform4fv(u['uStopInk[0]'], stopInk);
      gl.uniform1i(u.uStopCount, count);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    return { ensureField, draw };
  }

  const colorProbe = document.createElement('canvas').getContext('2d');
  /// Any CSS color as [r, g, b], 0…1.
  function parseColor(text) {
    colorProbe.fillStyle = '#000';
    colorProbe.fillStyle = text.trim() || '#000';
    const c = colorProbe.fillStyle;
    if (c[0] === '#') return rgb(c);
    return (c.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map((x) => x / 255);
  }

  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const toGamma = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
  const luminance = (c) => { const [r, g, b] = c.map(toLinear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

  // Blends run through OKLab, so they keep their lightness even and don't go muddy.
  function oklab(c) {
    const [r, g, b] = c.map(toLinear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function fromOklab([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960771 * l - 0.7034186147 * m + 1.707614701 * s].map((c) => toGamma(Math.min(1, Math.max(0, c))));
  }
  const cssColor = (c) => `rgb(${c.map((x) => Math.round(x * 255)).join(' ')})`;
  const same = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-3);

  function readBands() {
    const scrollY = window.scrollY;
    // --backdrop-lines on <html> scales every band's lines at once.
    const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--backdrop-lines')) || 1;
    return [...document.querySelectorAll('[data-band]')].map((el) => {
      const rect = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      const prop = (name) => css.getPropertyValue(name).trim();
      const color = (name) => { const value = prop(name); return value && value !== 'none' ? parseColor(value) : null; };
      return {
        y0: rect.top + scrollY,
        y1: rect.bottom + scrollY,
        paper: parseColor(prop('--band-paper')),
        swell: color('--band-swell'),
        dusk: color('--band-dusk'),
        ink: parseColor(prop('--band-ink')),
        lines: (parseFloat(prop('--band-lines')) || 1) * scale,
      };
    }).filter((b) => b.y1 > b.y0).sort((a, b) => a.y0 - b.y0);
  }

  /// Color stops down the page. Neighbouring bands blend across the edge they share: a big
  /// change (day into night) over `blend` either side of it, inside the sections' padding, so
  /// no text sits on it; close colors over up to four times that, so the change is felt
  /// rather than seen. A band with a swell color peaks at it in its middle, fading in and out
  /// across the whole band; one with a dusk color is entered through it (day into night).
  function bandStops(bands, blend, darkLines) {
    const reaches = bands.slice(1).map((b, i) => {
      const a = bands[i];
      const la = oklab(a.swell || a.paper);
      const lb = oklab(b.swell || b.paper);
      const distance = Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
      const stretch = 1 + 3 * (1 - Math.min(1, distance / 0.3));
      return Math.min(blend * stretch, 0.4 * (a.y1 - a.y0), 0.4 * (b.y1 - b.y0));
    });
    const stops = [];
    const push = (y, paper, band, via = false) => {
      const last = stops[stops.length - 1];
      stops.push({
        y: last ? Math.max(y, last.y + 1) : y,
        paper,
        via,
        ink: band.ink,
        lines: band.lines * (luminance(paper) < 0.25 ? darkLines : 1),
      });
    };
    bands.forEach((b, i) => {
      const first = i === 0;
      const last = i === bands.length - 1;
      if (b.dusk && !first) push(b.y0, b.dusk, b, true);
      if (b.swell && !first && !last) {
        push((b.y0 + b.y1) / 2, b.swell, b);
        return;
      }
      push(first ? b.y0 : b.y0 + reaches[i - 1], b.paper, b);
      if (b.swell) push((b.y0 + b.y1) / 2, b.swell, b);
      push(last ? b.y1 : b.y1 - reaches[i], b.paper, b);
    });
    return stops;
  }

  /// The paper, as one gradient on <html>: it scrolls with the page, so color edges never lag.
  /// It reaches a screen past each end for the rubber band. A dusk stop bends the blend
  /// between its neighbours toward it (a quadratic curve in OKLab) rather than pinning a
  /// stripe of its color.
  function paintPaper(stops, docH) {
    const root = document.documentElement;
    const pad = Math.round(window.innerHeight);
    const parts = [];
    let a = null;
    let via = null;
    for (const s of stops) {
      if (s.via) { via = s; continue; }
      if (a && (via || !same(a.paper, s.paper))) {
        const la = oklab(a.paper);
        const lb = oklab(s.paper);
        const lc = via && oklab(via.paper);
        const steps = via ? 16 : 8;
        for (let k = 1; k < steps; k++) {
          const t = k / steps;
          const e = t * t * (3 - 2 * t);
          const mixed = la.map((v, j) => (lc ? (1 - e) ** 2 * v + 2 * e * (1 - e) * lc[j] + e * e * lb[j] : v + (lb[j] - v) * e));
          parts.push(`${cssColor(fromOklab(mixed))} ${(a.y + (s.y - a.y) * t + pad).toFixed(1)}px`);
        }
      }
      parts.push(`${cssColor(s.paper)} ${(s.y + pad).toFixed(1)}px`);
      a = s;
      via = null;
    }
    root.style.backgroundImage = `linear-gradient(${parts.join(', ')})`;
    root.style.backgroundSize = `100% ${docH + 2 * pad}px`;
    root.style.backgroundPosition = `0 ${-pad}px`;
    root.style.backgroundRepeat = 'no-repeat';
    root.style.backgroundColor = cssColor(stops[stops.length - 1].paper);
    root.classList.add('has-backdrop');
  }

  function setUpBackdrop(canvas) {
    const look = LOOKS[canvas.dataset.backdrop] || LOOKS.survey;
    const r = Backdrop(canvas, look);
    let stops = [];
    let docH = 0;
    let shift = 0;
    let frame = 0;

    // Colors and positions: on load, when the page changes size, and with the theme.
    function layout() {
      const bands = readBands();
      if (!bands.length) return;
      docH = document.documentElement.scrollHeight;
      stops = bandStops(bands, Math.min(145, Math.max(76, window.innerWidth * 0.1)), look.alpha[1] / look.alpha[0]);
      paintPaper(stops, docH);
      request();
    }

    function render() {
      frame = 0;
      if (!r || !stops.length) return;
      const m = measure(canvas);
      const k = reduceMotion.matches ? 1 : PARALLAX;
      const scrollY = window.scrollY;
      r.ensureField(m.cssW, Math.max(0, docH - m.cssH) * k + m.cssH, featureFor(canvas, m.cssW));
      r.draw({ ...m, docTop: scrollY, terrainTop: scrollY * k, shift, stops });
      canvas.classList.add('is-drawn');
    }
    function request() { if (!frame) frame = requestAnimationFrame(render); }

    // The tide: 0.05 contour levels a second, as the app's Tide at 1×. It's slow, so 20
    // frames a second is plenty; scrolling draws every frame.
    let tideTimer = 0;
    let tideLast = 0;
    function tide() {
      tideTimer = 0;
      if (!r || reduceMotion.matches || document.hidden) { tideLast = 0; return; }
      const now = performance.now();
      if (tideLast) shift = (shift + Math.min(0.1, (now - tideLast) / 1000) * 0.05) % 5;
      tideLast = now;
      request();
      tideTimer = setTimeout(tide, 1000 / 20);
    }

    layout();
    tide();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    let relayout = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(relayout);
      relayout = requestAnimationFrame(layout);
    }).observe(document.body);
    darkQuery.addEventListener('change', layout);
    window.addEventListener('wtf:theme', layout);
    document.addEventListener('visibilitychange', () => { if (!tideTimer) tide(); });
    reduceMotion.addEventListener('change', () => { if (!tideTimer) tide(); request(); });
  }

  function start() {
    const backdrop = document.querySelector('canvas.backdrop');
    if (backdrop) setUpBackdrop(backdrop);

    const live = [];
    const stills = [...document.querySelectorAll('canvas.topo')].filter((el) => {
      if (!parse(el).live) return true;
      const handle = setUpLive(el);
      if (handle) live.push(handle);
      return false;
    });

    // Stills are drawn as they come near the viewport, and again after a resize.
    const pending = new Set();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && pending.has(entry.target)) {
          pending.delete(entry.target);
          drawStill(entry.target);
        }
      }
    }, { rootMargin: '400px 0px' });

    function invalidate() {
      for (const el of stills) {
        pending.add(el);
        observer.unobserve(el);
        observer.observe(el);
      }
      live.forEach((l) => l.redraw());
    }

    invalidate();
    let resizeTimer = 0;
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // Mobile browsers resize the viewport height as the toolbar slides; only redraw
        // stills when the width changes.
        if (window.innerWidth !== lastWidth) { lastWidth = window.innerWidth; invalidate(); }
        else live.forEach((l) => l.redraw());
      }, 150);
    });
    darkQuery.addEventListener('change', invalidate);
    window.addEventListener('wtf:theme', invalidate);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // A still for pictures that can't hold a canvas.topo of their own: the iPhone Duo's screens
  // (js/duo.js) are drawn in 3D, where a canvas can't be measured. Sizes are in points; returns
  // a 2D canvas, or null without WebGL2.
  window.wtfTopography = {
    still({ style = 'survey', theme = 'auto', width, height, scale = 2, feature = 340 }) {
      const r = sharedRenderer();
      if (!r) return null;
      const pxW = Math.round(width * scale);
      const pxH = Math.round(height * scale);
      r.draw({ style, theme: resolvedTheme(theme), cssW: width, cssH: height, pxW, pxH, feature });
      const out = document.createElement('canvas');
      out.width = pxW;
      out.height = pxH;
      out.getContext('2d').drawImage(r.canvas, 0, 0);
      return out;
    },
  };
})();
