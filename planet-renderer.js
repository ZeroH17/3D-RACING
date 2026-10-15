/* A small offscreen WebGL globe, composited into the orbital Canvas2D scene. */
(() => {
  "use strict";

  const VERTEX = `
    attribute vec2 aPosition;
    varying vec2 vPoint;
    void main() {
      vPoint = aPosition * 1.075;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;
  const FRAGMENT = `
    precision mediump float;
    varying vec2 vPoint;
    uniform sampler2D uSurface;
    uniform vec2 uRotation;
    uniform float uEdge;
    const float PI = 3.141592653589793;
    void main() {
      float radial = length(vPoint);
      vec3 light = normalize(vec3(-0.52, 0.51, 0.685));
      if (radial > 1.0) {
        float sunward = max(0.0, dot(normalize(vPoint), light.xy));
        float halo = exp(-(radial - 1.0) * 125.0) * (0.025 + sunward * 0.20);
        gl_FragColor = vec4(0.60, 0.59, 0.87, halo);
        return;
      }
      vec3 normal = vec3(vPoint, sqrt(max(0.0, 1.0 - radial * radial)));
      float cy = cos(uRotation.x), sy = sin(uRotation.x);
      float cp = cos(uRotation.y), sp = sin(uRotation.y);
      // Inverse orientation maps each visible normal onto the planet surface.
      vec3 local = vec3(cy * normal.x - sy * normal.z,
                        normal.y,
                        sy * normal.x + cy * normal.z);
      local = vec3(local.x, cp * local.y - sp * local.z,
                           sp * local.y + cp * local.z);
      vec2 uv = vec2(atan(local.x, local.z) / (2.0 * PI) + 0.5,
                     0.5 - asin(clamp(local.y, -1.0, 1.0)) / PI);
      vec3 clouds = texture2D(uSurface, uv).rgb;
      float diffuse = max(0.0, dot(normal, light));
      float shade = 0.025 + 0.975 * pow(diffuse, 0.68);
      float rim = pow(1.0 - normal.z, 5.0) * (0.03 + diffuse * 0.27);
      vec3 color = clouds * shade + vec3(0.435, 0.467, 0.733) * rim;
      float alpha = 1.0 - smoothstep(1.0 - uEdge, 1.0, radial);
      gl_FragColor = vec4(color, alpha);
    }
  `;

  class BirthdayPlanetRenderer {
    constructor({ textureUrl = "assets/planet-texture.png" } = {}) {
      this.isReady = false;
      this.failed = false;
      this.canvas = document.createElement("canvas");
      this.lastYaw = NaN;
      this.lastPitch = NaN;
      this.lastSize = 0;
      try {
        const gl = this.canvas.getContext("webgl", {
          alpha: true, antialias: false, depth: false, stencil: false,
          premultipliedAlpha: false, preserveDrawingBuffer: true,
          powerPreference: "low-power"
        });
        if (!gl) { this.failed = true; return; }
        this.gl = gl;
        this.canvas.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          this.isReady = false;
          this.failed = true;
        });
        const vertex = this.compile(gl.VERTEX_SHADER, VERTEX);
        const fragment = this.compile(gl.FRAGMENT_SHADER, FRAGMENT);
        if (!vertex || !fragment) { this.failed = true; return; }
        const program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          gl.deleteProgram(program);
          this.failed = true;
          return;
        }
        this.program = program;
        gl.useProgram(program);
        const vertices = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "aPosition");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        this.rotation = gl.getUniformLocation(program, "uRotation");
        this.edge = gl.getUniformLocation(program, "uEdge");
        gl.uniform1i(gl.getUniformLocation(program, "uSurface"), 0);
        this.texture = gl.createTexture();
        const image = new Image();
        image.onload = () => {
          if (this.failed || gl.isContextLost()) return;
          try {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
            const isPowerOfTwo = (n) => (n & (n - 1)) === 0;
            const periodic = isPowerOfTwo(image.naturalWidth) && isPowerOfTwo(image.naturalHeight);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, periodic ? gl.REPEAT : gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            this.isReady = gl.getError() === gl.NO_ERROR;
            this.failed = !this.isReady;
          } catch (_) { this.failed = true; }
        };
        image.onerror = () => { this.failed = true; };
        image.src = textureUrl;
      } catch (_) { this.failed = true; }
    }

    compile(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
      gl.deleteShader(shader);
      return null;
    }

    /** Draw at the actual sphere radius; yaw and pitch are measured in radians. */
    draw(ctx, { x, y, radius, yaw = 0, pitch = 0 }) {
      if (!this.isReady || this.failed || !(radius > 0)) return false;
      const gl = this.gl;
      if (gl.isContextLost()) { this.isReady = false; return false; }
      try {
        const mobile = window.matchMedia("(max-width: 640px)").matches;
        const limit = mobile ? 256 : 512;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const size = Math.max(128, Math.min(limit, Math.ceil(radius * 2.15 * pixelRatio / 64) * 64));
        if (size !== this.lastSize || yaw !== this.lastYaw || pitch !== this.lastPitch) {
          if (size !== this.lastSize) {
            this.canvas.width = size;
            this.canvas.height = size;
            gl.viewport(0, 0, size, size);
          }
          gl.useProgram(this.program);
          gl.uniform2f(this.rotation, yaw, pitch);
          gl.uniform1f(this.edge, 2.15 / size);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          this.lastYaw = yaw;
          this.lastPitch = pitch;
          this.lastSize = size;
        }
        ctx.drawImage(this.canvas, x - radius * 1.075, y - radius * 1.075,
                      radius * 2.15, radius * 2.15);
        return true;
      } catch (_) {
        this.isReady = false;
        this.failed = true;
        return false;
      }
    }
  }

  window.BirthdayPlanetRenderer = BirthdayPlanetRenderer;
})();
