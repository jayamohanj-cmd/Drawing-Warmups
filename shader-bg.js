// shader-bg.js — lightweight WebGL background (low-res + 30fps + pause on hidden)
export function startShaderBackground(canvas) {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduceMotion) return () => {}; // no-op

  const gl = canvas.getContext("webgl", { antialias: false, alpha: true, depth: false, stencil: false, preserveDrawingBuffer: false });
  if (!gl) return () => {};

  // --- Shaders ---
  const vertSrc = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main(){
      v_uv = (a_pos + 1.0) * 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  // Smooth, moving “blob gradients” + subtle noise (cheap)
  const fragSrc = `
precision mediump float;

varying vec2 v_uv;
uniform vec2 u_res;
uniform float u_time;

/* cheap hash + noise (fast) */
float hash(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a, b, u.x) +
         (c - a) * u.y * (1.0 - u.x) +
         (d - b) * u.x * u.y;
}

/* warm orange / pink palette */
vec3 palette(float t){
  vec3 orange = vec3(1.00, 0.55, 0.20);
  vec3 coral  = vec3(1.00, 0.35, 0.45);
  vec3 pink   = vec3(0.95, 0.55, 0.75);

  return mix(
    mix(orange, coral, smoothstep(0.2, 0.6, t)),
    pink,
    smoothstep(0.6, 1.0, t)
  );
}

void main(){
  vec2 uv = v_uv;
  vec2 p = uv - 0.5;
  p.x *= u_res.x / u_res.y;

  float t = u_time * 0.10; // calm motion

  /* three soft moving halos */
  float f = 0.0;
  f += 0.70 / (length(p - vec2( 0.30*cos(t*1.1), 0.25*sin(t*0.9))) + 0.35);
  f += 0.55 / (length(p - vec2( 0.25*cos(t*0.7+2.0), 0.30*sin(t*1.0+1.3))) + 0.40);
  f += 0.45 / (length(p - vec2( 0.35*cos(t*0.9-1.7), 0.20*sin(t*0.8-2.1))) + 0.45);

  /* subtle grain */
  float g = noise(uv * u_res.xy * 0.15 + t * 12.0);
  f += (g - 0.5) * 0.08;

  /* color */
  vec3 col = palette(clamp(f, 0.0, 1.0));

  /* warm glow center */
  float glow = smoothstep(0.9, 0.2, length(p));
  col += vec3(1.0, 0.6, 0.3) * glow * 0.15;

  /* vignette */
  float vig = smoothstep(1.1, 0.4, length(p));
  col *= mix(0.85, 1.1, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;


  function compile(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(s));
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
    console.warn(gl.getProgramInfoLog(prog));
    return () => {};
  }
  gl.useProgram(prog);

  // Fullscreen triangle strip
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1,-1,  1,-1,  -1, 1,
    -1, 1,  1,-1,   1, 1
  ]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");

  // Resize with low-res strategy
  const LOW_RES_SCALE = 0.55; // tweak 0.4–0.7
  function resize(){
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(window.innerWidth * dpr * LOW_RES_SCALE);
    const h = Math.floor(window.innerHeight * dpr * LOW_RES_SCALE);
    canvas.width = Math.max(2, w);
    canvas.height = Math.max(2, h);
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener("resize", resize);

  // 30fps cap
  let running = true;
  let last = 0;
  const FPS = 30;
  const FRAME_MS = 1000 / FPS;
  const t0 = performance.now();

  function frame(now){
    if (!running) return;
    if (now - last >= FRAME_MS) {
      last = now;
      gl.uniform1f(uTime, (now - t0) / 1000.0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function onVis(){
    running = document.visibilityState === "visible";
    if (running) requestAnimationFrame(frame);
  }
  document.addEventListener("visibilitychange", onVis);

  // cleanup
  return () => {
    running = false;
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("resize", resize);
  };
}
