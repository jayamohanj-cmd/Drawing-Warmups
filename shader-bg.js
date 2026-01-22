// shader-bg.js — Gyroid background with palette toggle (Warm 🔥 / Cool 🌌)
// Safe for classrooms: low-res rendering + 30fps cap + pauses when tab hidden.
// Exposes window.togglePalette() and window.getPaletteMode().

export function startShaderBackground(canvas) {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduceMotion || !canvas) return () => {};

  const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: true,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) return () => {};

  // ---------- Shaders ----------
  const vertSrc = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main(){
      v_uv = (a_pos + 1.0) * 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  // Gyroid + palette toggle, intentionally avoids magenta/pink drift
  const fragSrc = `
    precision mediump float;

    varying vec2 v_uv;
    uniform vec2 u_res;
    uniform float u_time;
    uniform int u_palette;

    float gyroid(vec3 p){
      return dot(sin(p), cos(p.yzx));
    }

    vec3 palette(float t, int mode){
      t = clamp(t, 0.0, 1.0);
      if (mode == 0) {
        // 🔥 ORANGE → RED (no pink)
        vec3 orange = vec3(1.0, 0.45, 0.15);
        vec3 red    = vec3(0.85, 0.12, 0.08);
        return mix(orange, red, smoothstep(0.1, 0.95, t));
      } else {
        // 🌌 BLUE → PURPLE (no magenta)
        vec3 blue   = vec3(0.15, 0.30, 0.85);
        vec3 purple = vec3(0.40, 0.25, 0.70);
        return mix(blue, purple, smoothstep(0.1, 0.95, t));
      }
    }

    void main(){
      vec2 uv = v_uv - 0.5;
      uv.x *= u_res.x / u_res.y;

      float t = u_time * 0.25;

      // Gyroid field (2D slice through 3D)
      vec3 p = vec3(uv * 3.0, t);
      float g = gyroid(p);
      g = smoothstep(-0.30, 0.30, g);

      // Color from selected palette
      vec3 col = palette(g, u_palette);

      // Depth + vignette
      float vignette = smoothstep(1.2, 0.35, length(uv));
      col *= vignette;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("Shader compile error:", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return () => {};

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("Program link error:", gl.getProgramInfoLog(prog));
    return () => {};
  }
  gl.useProgram(prog);

  // Fullscreen triangles
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1,
    ]),
    gl.STATIC_DRAW
  );

  const aPos = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uPalette = gl.getUniformLocation(prog, "u_palette");

  // ---------- Resolution strategy (performance) ----------
  const LOW_RES_SCALE = 0.55; // tweak 0.45–0.7 if desired
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.floor(window.innerWidth * dpr * LOW_RES_SCALE));
    const h = Math.max(2, Math.floor(window.innerHeight * dpr * LOW_RES_SCALE));
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
  }
  resize();
  window.addEventListener("resize", resize);

  // ---------- Palette toggle (persistent) ----------
  let paletteMode = Number(localStorage.getItem("dw_palette_mode")) || 0; // 0 warm, 1 cool
  gl.uniform1i(uPalette, paletteMode);

  // Expose for app.js button
  window.togglePalette = () => {
    paletteMode = (paletteMode + 1) % 2;
    gl.uniform1i(uPalette, paletteMode);
    localStorage.setItem("dw_palette_mode", String(paletteMode));
    return paletteMode;
  };
  window.getPaletteMode = () => paletteMode;

  // ---------- Animation loop (30fps cap + pause on hidden) ----------
  let running = true;
  let last = 0;
  const FPS = 30;
  const FRAME_MS = 1000 / FPS;
  const t0 = performance.now();

  function frame(now) {
    if (!running) return;

    if (now - last >= FRAME_MS) {
      last = now;
      gl.uniform1f(uTime, (now - t0) / 1000.0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    requestAnimationFrame(frame);
  }

  function onVis() {
    running = document.visibilityState === "visible";
    if (running) requestAnimationFrame(frame);
  }

  document.addEventListener("visibilitychange", onVis);
  requestAnimationFrame(frame);

  // ---------- Cleanup ----------
  return () => {
    running = false;
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("resize", resize);
    // Best-effort resource cleanup
    try {
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    } catch {}
  };
}
