(() => {
  "use strict";

  const canvas = document.querySelector("#starfield");
  const context = canvas.getContext("2d", { alpha: true });
  const surprise = document.querySelector("#surprise");
  const heroArt = document.querySelector(".hero-art");
  const hero = document.querySelector(".hero");
  const orbitCanvas = document.querySelector("#orbit-scene");
  const orbitContext = orbitCanvas.getContext("2d", { alpha: true });
  const wishButton = document.querySelector("#wish-button");
  const soundButton = document.querySelector("#sound-toggle");
  const feedback = document.querySelector(".wish-feedback");
  const planetControl = document.querySelector("#planet-control");
  const planetHint = document.querySelector("#planet-hint");
  const music = document.querySelector("#birthday-music");
  const wishDialog = document.querySelector("#wish-dialog");
  const wishCount = document.querySelector("#wish-count");
  const wishInstruction = document.querySelector("#wish-instruction");
  const wishReturn = document.querySelector("#wish-return");
  const wishTitle = document.querySelector("#wish-title");
  const wishNudge = document.querySelector("#wish-nudge");
  const introCurtain = document.querySelector("#intro-curtain");
  const introButton = document.querySelector("#intro-open");
  const globe = window.BirthdayPlanetRenderer ? new window.BirthdayPlanetRenderer() : null;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const state = { stars: [], particles: [], meteors: [], width: 0, height: 0, scroll: window.scrollY, introPending: true, introOpening: false, revealed: false, hasBurst: false, wishPending: false, wishTimer: null, raf: 0, running: false, lastFrame: 0, nextMeteor: 1.8, time: 0 };
  const orbital = { width: 0, height: 0, visible: true, particles: [], arrivalAt: 0, pointerX: 0, pointerY: 0, targetX: 0, targetY: 0,
    yaw: 0, pitch: 0, spin: 0, tumble: 0, dragging: false, pointerId: null, lastX: 0, lastY: 0, lastAt: 0,
    planes: [{ tilt: .32, rotation: -.42 }, { tilt: .5, rotation: .61 }, { tilt: .24, rotation: 1.28 }] };
  const planet = new Image();
  planet.src = "assets/planet.png";
  planet.addEventListener("load", () => drawOrbits(state.time));

  // Cache soft light once; hundreds of orbiting stars reuse this tiny bitmap.
  const glow = document.createElement("canvas");
  glow.width = glow.height = 48;
  const glowContext = glow.getContext("2d");
  if (glowContext) {
    const light = glowContext.createRadialGradient(24, 24, 0, 24, 24, 24);
    light.addColorStop(0, "#fff8ff"); light.addColorStop(.1, "#ede1ffdc");
    light.addColorStop(.3, "#c0a0f34d"); light.addColorStop(1, "#a485e000");
    glowContext.fillStyle = light; glowContext.fillRect(0, 0, 48, 48);
  }

  // A deterministic fallback keeps the scene alive even when opened from disk.
  function randomGenerator(seed) {
    return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  }
  const random = randomGenerator(271828);
  orbital.particles = Array.from({ length: 430 }, (_, index) => [1.42 + random() * 1.73, random() * Math.PI * 2, (.08 + random() * .16) * (index % 3 === 1 ? -1 : 1), .5 + random() * 1.6, .25 + random() * .75, index % 3]);
  state.stars = Array.from({ length: 260 }, () => [random(), random(), .35 + random() * 1.15, .15 + random() * .6, random() * Math.PI * 2, .2 + random() * .6]);
  fetch("assets/universe.json").then(response => {
    if (!response.ok) throw new Error("Using local star map");
    return response.json();
  }).then(data => {
    if (Array.isArray(data.stars) && data.stars.length) state.stars = data.stars;
    if (motionQuery.matches) drawScene(state.time);
  }).catch(() => { /* The fallback uses the same compact star schema. */ });
  fetch("assets/orbits.json").then(response => {
    if (!response.ok) throw new Error("Using local orbit map");
    return response.json();
  }).then(data => {
    if (Array.isArray(data.particles) && data.particles.length) orbital.particles = data.particles;
    if (Array.isArray(data.planes) && data.planes.length === 3) orbital.planes = data.planes;
    drawOrbits(state.time);
  }).catch(() => { /* Identical fallback schema supports direct file previews. */ });

  function resize() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    // Capping DPR avoids drawing millions of unnecessary pixels on phones.
    const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(state.width * ratio);
    canvas.height = Math.round(state.height * ratio);
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    orbital.width = heroArt.clientWidth;
    orbital.height = heroArt.clientHeight;
    const orbitRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    orbitCanvas.width = Math.round(orbital.width * orbitRatio);
    orbitCanvas.height = Math.round(orbital.height * orbitRatio);
    orbitContext?.setTransform(orbitRatio, 0, 0, orbitRatio, 0, 0);
    updateScroll();
    drawScene(state.time);
    drawOrbits(state.time);
  }

  function burst(count, originX = .5, originY = .48, slow = false) {
    if (motionQuery.matches || !context) return;
    const budget = state.width < 760 ? 220 : 440;
    const cappedCount = Math.min(count, state.width < 760 ? 140 : 240, Math.max(0, budget - state.particles.length));
    for (let i = 0; i < cappedCount; i++) {
      const angle = random() * Math.PI * 2;
      const speed = (slow ? 18 : 45) + random() * (slow ? 95 : 210);
      state.particles.push({ x: state.width * originX, y: state.height * originY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * .7, life: 0, maxLife: 2.4 + random() * 2.4, size: .6 + random() * 1.6, warm: random() > .6 });
    }
  }

  function updateScroll() {
    state.scroll = window.scrollY;
    orbital.visible = state.scroll < hero.offsetTop + hero.offsetHeight;
    const bounds = surprise.getBoundingClientRect();
    const shouldReveal = bounds.top < -state.height * .12;
    // Keep the greeting revealed once discovered, including scroll-back visits.
    if (shouldReveal && !state.introPending && !state.introOpening && !state.revealed) {
      state.revealed = true;
      document.body.classList.add("birthday-revealed");
      document.querySelector(".birthday-content").inert = false;
      if (!state.hasBurst) { burst(240); state.hasBurst = true; }
    }
    if (!motionQuery.matches && state.scroll < state.height * 1.2) {
      heroArt.style.setProperty("--hero-y", `${Math.min(state.scroll * .16, 120).toFixed(1)}px`);
    }
    if (orbital.visible) syncPlanetControl();
    if (motionQuery.matches) { drawScene(state.time); drawOrbits(state.time); }
  }

  function planetGeometry() {
    const mobile = state.width < 760;
    return {
      radius: Math.min(orbital.width * (mobile ? .113 : .116), orbital.height * .165),
      x: orbital.width * (mobile ? .39 : .53),
      y: orbital.height * (mobile ? (state.height < 720 ? .38 : .45) : .51)
    };
  }

  function syncPlanetControl() {
    const geometry = planetGeometry();
    const artBounds = heroArt.getBoundingClientRect();
    const heroBounds = hero.getBoundingClientRect();
    const x = artBounds.left - heroBounds.left + geometry.x;
    const y = artBounds.top - heroBounds.top + geometry.y;
    const diameter = Math.max(100, geometry.radius * 2.2);
    Object.assign(planetControl.style, { left: `${x}px`, top: `${y}px`, width: `${diameter}px`, height: `${diameter}px` });
    const hintY = Math.min(y + geometry.radius + 17, state.height - 67);
    Object.assign(planetHint.style, { left: `${x}px`, top: `${hintY}px` });
  }

  function updatePlanetValue() {
    const degrees = Math.round(((orbital.yaw * 180 / Math.PI) % 360 + 360) % 360);
    planetControl.setAttribute("aria-valuenow", String(degrees));
    planetControl.setAttribute("aria-valuetext", `Góc xoay ${degrees} độ`);
  }

  function advancePlanet(delta) {
    if (orbital.dragging || motionQuery.matches) return;
    if (Math.abs(orbital.spin) < .003 && Math.abs(orbital.tumble) < .003) {
      orbital.spin = orbital.tumble = 0;
      return;
    }
    orbital.yaw += orbital.spin * delta;
    orbital.pitch = Math.max(-1.1, Math.min(1.1, orbital.pitch + orbital.tumble * delta));
    const decay = Math.exp(-delta * 3.4);
    orbital.spin *= decay; orbital.tumble *= decay;
    updatePlanetValue();
  }

  function orbitPoint(radius, angle, plane, centerX, centerY) {
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * plane.tilt;
    return [centerX + x * plane.cosine - y * plane.sine, centerY + x * plane.sine + y * plane.cosine];
  }

  function drawOrbits(time) {
    if (!orbitContext || !orbital.visible) return;
    const ctx = orbitContext;
    const { width, height } = orbital;
    if (!width || !height) return;
    const mobile = state.width < 760;
    const geometry = planetGeometry();
    const radius = geometry.radius;
    orbital.pointerX += (orbital.targetX - orbital.pointerX) * .045;
    orbital.pointerY += (orbital.targetY - orbital.pointerY) * .045;
    const centerX = geometry.x + (motionQuery.matches ? 0 : orbital.pointerX * 12);
    const centerY = geometry.y + (motionQuery.matches ? 0 : orbital.pointerY * 9);
    const arrival = motionQuery.matches ? 1 : Math.min(1, Math.max(0, (time - orbital.arrivalAt) / 3.8));
    const capture = 1 - Math.pow(1 - arrival, 3);
    const planes = orbital.planes.map(plane => {
      const rotation = plane.rotation + orbital.pitch * .22;
      return { ...plane, rotation, cosine: Math.cos(rotation), sine: Math.sin(rotation) };
    });
    ctx.clearRect(0, 0, width, height);

    // Draw rear halves, then the opaque planet, then front halves. This gives
    // genuine occlusion as each star passes behind and in front of the sphere.
    function drawHalf(front) {
      planes.forEach((plane, index) => {
        const start = front ? 0 : Math.PI;
        ctx.lineWidth = .65;
        ctx.strokeStyle = front ? "#bba4d52b" : "#bba4d514";
        for (let band = 0; band < 2; band++) {
          const ringRadius = radius * (1.65 + index * .42 + band * .23);
          ctx.beginPath();
          ctx.ellipse(centerX, centerY, ringRadius, ringRadius * plane.tilt, plane.rotation, start, start + Math.PI);
          ctx.stroke();
        }
      });
      const step = mobile ? 2 : 1;
      for (let i = 0; i < orbital.particles.length; i += step) {
        const [distance, phase, speed, size, brightness, planeIndex] = orbital.particles[i];
        const angle = phase + orbital.yaw * .22 + (motionQuery.matches ? 0 : time * speed + (1 - capture) * .65);
        if ((Math.sin(angle) >= 0) !== front) continue;
        const plane = planes[planeIndex];
        const r = distance * radius * (1 + (1 - capture) * 1.8);
        const [x, y] = orbitPoint(r, angle, plane, centerX, centerY);
        const perspective = .84 + Math.sin(angle) * .17;
        const alpha = brightness * (front ? .95 : .5) * (.35 + capture * .65);
        const accent = i % 37 === 0;
        ctx.globalAlpha = alpha;
        // Short arc trails make the direction of travel clear at a glance.
        if (size > 1.45 || accent) {
          const length = accent ? .24 : .075;
          ctx.beginPath();
          for (let part = 0; part <= 5; part++) {
            const a = angle - Math.sign(speed) * length * (1 - part / 5);
            const point = orbitPoint(r, a, plane, centerX, centerY);
            if (part === 0) ctx.moveTo(...point); else ctx.lineTo(...point);
          }
          ctx.lineWidth = accent ? 1.2 : .65;
          ctx.strokeStyle = accent ? "#d8c5f27a" : "#ac91d137";
          ctx.stroke();
        }
        if (accent || size > 1.65) {
          const extent = (accent ? 22 : 12) * perspective;
          ctx.drawImage(glow, x - extent / 2, y - extent / 2, extent, extent);
        }
        ctx.fillStyle = i % 8 === 0 ? "#e5cea1" : "#e2d6ef";
        const pointSize = (accent ? 2.3 : size * .9) * perspective;
        ctx.beginPath(); ctx.arc(x, y, pointSize, 0, Math.PI * 2); ctx.fill();
        if (accent) {
          ctx.globalAlpha *= .7;
          ctx.fillRect(x - 4, y - .35, 8, .7); ctx.fillRect(x - .35, y - 4, .7, 8);
        }
      }
      ctx.globalAlpha = 1;
    }
    drawHalf(false);

    // A cached Python surface supplies all expensive texture and lighting.
    const atmosphere = ctx.createRadialGradient(centerX, centerY, radius * .92, centerX, centerY, radius * 1.25);
    atmosphere.addColorStop(0, "#af8fd01a"); atmosphere.addColorStop(.48, "#b39bea16"); atmosphere.addColorStop(1, "#9e80d900");
    ctx.fillStyle = atmosphere; ctx.fillRect(centerX - radius * 1.25, centerY - radius * 1.25, radius * 2.5, radius * 2.5);
    const rendered = globe?.draw(ctx, { x: centerX, y: centerY, radius, yaw: orbital.yaw, pitch: orbital.pitch });
    if (!rendered && planet.complete && planet.naturalWidth) {
      const extent = radius * 2.25;
      ctx.save(); ctx.translate(centerX, centerY); ctx.rotate(-.28 + orbital.yaw);
      ctx.drawImage(planet, -extent / 2, -extent / 2, extent, extent); ctx.restore();
    } else if (!rendered) {
      const surface = ctx.createRadialGradient(centerX - radius * .4, centerY - radius * .45, 0, centerX, centerY, radius);
      surface.addColorStop(0, "#c2b3ce"); surface.addColorStop(.55, "#786586"); surface.addColorStop(1, "#100d18");
      ctx.fillStyle = surface; ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.fill();
    }
    drawHalf(true);
  }

  function drawScene(time, delta = 0) {
    if (!context) return;
    const { width, height } = state;
    context.clearRect(0, 0, width, height);
    const starLimit = width < 760 ? Math.min(190, state.stars.length) : state.stars.length;
    const parallax = motionQuery.matches ? 0 : state.scroll * .018;
    for (let i = 0; i < starLimit; i++) {
      const [nx, ny, radius, brightness, phase, speed] = state.stars[i];
      const drift = motionQuery.matches ? 0 : time * (1.6 + radius * 2.8);
      const x = ((nx * width + drift * .32 + (motionQuery.matches ? 0 : Math.sin(time * .12 + phase) * 8)) % width + width) % width;
      const y = ((ny * height + drift - parallax * (radius + .2)) % height + height) % height;
      const flicker = motionQuery.matches ? .8 : .65 + .35 * Math.sin(time * speed + phase);
      context.globalAlpha = Math.min(.88, brightness * flicker);
      context.fillStyle = i % 5 === 0 ? "#d0bce9" : "#eee7f7";
      context.beginPath(); context.arc(x, y, Math.min(radius, 1.5), 0, Math.PI * 2); context.fill();
      if (radius > 1.2 && i % 7 === 0) {
        context.globalAlpha *= .32;
        context.fillRect(x - 3.2, y - .3, 6.4, .6);
        context.fillRect(x - .3, y - 3.2, .6, 6.4);
      }
    }
    context.globalAlpha = 1;
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life += delta;
      if (p.life >= p.maxLife) { state.particles.splice(i, 1); continue; }
      const drag = Math.exp(-delta * .55);
      p.vx *= drag; p.vy *= drag; p.x += p.vx * delta; p.y += p.vy * delta;
      context.globalAlpha = Math.pow(1 - p.life / p.maxLife, 1.4);
      context.fillStyle = p.warm ? "#ead9b4" : "#d6b8fa";
      context.beginPath(); context.arc(p.x, p.y, p.size, 0, Math.PI * 2); context.fill();
    }
    for (let i = state.meteors.length - 1; i >= 0; i--) {
      const m = state.meteors[i];
      m.life += delta;
      if (m.life > 1.2) { state.meteors.splice(i, 1); continue; }
      m.x -= delta * 270; m.y += delta * 125;
      const trail = context.createLinearGradient(m.x, m.y, m.x + 105, m.y - 49);
      trail.addColorStop(0, "#d7c5eb"); trail.addColorStop(1, "#d7c5eb00");
      context.globalAlpha = Math.sin(m.life / 1.2 * Math.PI) * .55;
      context.strokeStyle = trail; context.lineWidth = 1;
      context.beginPath(); context.moveTo(m.x, m.y); context.lineTo(m.x + 105, m.y - 49); context.stroke();
    }
    context.globalAlpha = 1;
  }

  function animate(timestamp) {
    if (!state.running) return;
    // One loop for both canvases; the orbital scene stops drawing offscreen.
    const elapsed = timestamp - state.lastFrame;
    const interval = 1000 / (orbital.visible ? 60 : 30);
    if (elapsed >= interval - .5) {
      const delta = Math.min(elapsed / 1000, .07);
      state.lastFrame = timestamp;
      state.time += delta;
      advancePlanet(delta);
      if (state.time > state.nextMeteor) {
        state.meteors.push({ x: state.width * (.5 + random() * .45), y: state.height * (.08 + random() * .4), life: 0 });
        state.nextMeteor = state.time + 2.5 + random() * 3.5;
      }
      drawScene(state.time, delta);
      drawOrbits(state.time);
    }
    state.raf = requestAnimationFrame(animate);
  }

  function startAnimation() {
    if (state.introPending || document.hidden || motionQuery.matches || state.running) return;
    state.running = true; state.lastFrame = performance.now(); state.raf = requestAnimationFrame(animate);
  }
  function stopAnimation() { state.running = false; cancelAnimationFrame(state.raf); }

  let scrollQueued = false;
  window.addEventListener("scroll", () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => { updateScroll(); scrollQueued = false; });
  }, { passive: true });
  let resizeQueued = false;
  window.addEventListener("resize", () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resize(); resizeQueued = false; });
  }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { stopAnimation(); audio.pause(); }
    else { startAnimation(); audio.resume(); }
  });
  motionQuery.addEventListener("change", () => {
    if (motionQuery.matches) { stopAnimation(); orbital.spin = orbital.tumble = 0; state.particles.length = 0; state.meteors.length = 0; heroArt.style.removeProperty("--hero-y"); syncPlanetControl(); drawScene(state.time); drawOrbits(state.time); }
    else startAnimation();
  });

  hero.addEventListener("pointermove", event => {
    if (motionQuery.matches || event.pointerType === "touch" || orbital.dragging) return;
    orbital.targetX = (event.clientX / state.width - .5) * 2;
    orbital.targetY = (event.clientY / state.height - .5) * 2;
  }, { passive: true });
  hero.addEventListener("pointerleave", () => { orbital.targetX = orbital.targetY = 0; });
  hero.addEventListener("pointerdown", event => {
    if (event.target.closest("a, button, #planet-control")) return;
    burst(45, event.clientX / state.width, event.clientY / state.height, true);
  }, { passive: true });

  planetControl.addEventListener("pointerdown", event => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    orbital.dragging = true; orbital.pointerId = event.pointerId;
    orbital.lastX = event.clientX; orbital.lastY = event.clientY; orbital.lastAt = performance.now();
    orbital.spin = orbital.tumble = 0;
    planetControl.setPointerCapture(event.pointerId);
    planetControl.classList.add("is-dragging");
    planetControl.focus({ preventScroll: true });
  });
  planetControl.addEventListener("pointermove", event => {
    if (!orbital.dragging || event.pointerId !== orbital.pointerId) return;
    const now = performance.now();
    const elapsed = Math.max(.008, (now - orbital.lastAt) / 1000);
    const diameter = Math.max(100, planetGeometry().radius * 2.2);
    const yawDelta = (event.clientX - orbital.lastX) / diameter * 2.8;
    const pitchDelta = (event.clientY - orbital.lastY) / diameter * 1.6;
    orbital.yaw += yawDelta;
    orbital.pitch = Math.max(-1.1, Math.min(1.1, orbital.pitch + pitchDelta));
    orbital.spin = Math.max(-4, Math.min(4, orbital.spin * .35 + yawDelta / elapsed * .65));
    orbital.tumble = Math.max(-2, Math.min(2, orbital.tumble * .35 + pitchDelta / elapsed * .65));
    orbital.lastX = event.clientX; orbital.lastY = event.clientY; orbital.lastAt = now;
    updatePlanetValue();
    planetHint.querySelector("span:last-child").textContent = "Thả tay để hành tinh xoay tiếp";
    if (motionQuery.matches) drawOrbits(state.time);
  });
  function releasePlanet(event) {
    if (event.pointerId !== orbital.pointerId) return;
    orbital.dragging = false; orbital.pointerId = null;
    if (event.type === "pointercancel" || performance.now() - orbital.lastAt > 140 || motionQuery.matches) orbital.spin = orbital.tumble = 0;
    else { orbital.spin *= .75; orbital.tumble *= .75; }
    planetControl.classList.remove("is-dragging");
    planetHint.querySelector("span:last-child").textContent = "Chạm & kéo để xoay hành tinh";
    if (planetControl.hasPointerCapture(event.pointerId)) planetControl.releasePointerCapture(event.pointerId);
  }
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(name => planetControl.addEventListener(name, releasePlanet));
  planetControl.addEventListener("keydown", event => {
    const step = event.shiftKey ? .32 : .13;
    if (event.key === "ArrowLeft") orbital.yaw -= step;
    else if (event.key === "ArrowRight") orbital.yaw += step;
    else if (event.key === "ArrowUp") orbital.pitch = Math.max(-1.1, orbital.pitch - step);
    else if (event.key === "ArrowDown") orbital.pitch = Math.min(1.1, orbital.pitch + step);
    else if (event.key === "Home") orbital.yaw = orbital.pitch = 0;
    else return;
    event.preventDefault(); orbital.spin = orbital.tumble = 0;
    updatePlanetValue(); drawOrbits(state.time);
  });

  document.querySelectorAll('a[href="#surprise"]').forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      window.scrollTo({
        top: surprise.offsetTop + state.height * .22,
        behavior: motionQuery.matches ? "instant" : "smooth"
      });
    });
  });

  // Use the supplied local song. Playback begins only after a visitor's click.
  const audio = {
    enabled: false,
    quiet: false,
    busy: false,
    sync() {
      soundButton.setAttribute("aria-pressed", String(this.enabled));
      soundButton.setAttribute("aria-label", this.enabled ? "Tạm dừng nhạc COME MY WAY" : "Phát nhạc COME MY WAY");
      soundButton.querySelector(".sound-label").textContent = this.enabled ? "Tắt nhạc" : "Bật nhạc";
    },
    async toggle() {
      if (this.busy) return;
      this.busy = true;
      soundButton.disabled = true;
      try {
        if (this.enabled) {
          this.enabled = false;
          music.pause();
        } else {
          music.volume = this.quiet ? .16 : .5;
          await music.play();
          this.enabled = true;
        }
        this.sync();
      } catch {
        this.enabled = false;
        this.sync();
        soundButton.querySelector(".sound-label").textContent = "Thử bật lại nhạc";
      } finally {
        this.busy = false;
        soundButton.disabled = false;
      }
    },
    pause() { music.pause(); },
    resume() {
      if (this.enabled) music.play().catch(() => { this.enabled = false; this.sync(); });
    },
    setQuiet(value) {
      this.quiet = value;
      music.volume = value ? .16 : .5;
    }
  };
  soundButton.addEventListener("click", () => audio.toggle());
  music.addEventListener("error", () => {
    audio.enabled = false;
    audio.sync();
    soundButton.querySelector(".sound-label").textContent = "Thử bật lại nhạc";
  });

  let savedOverflow = "";
  function setWishCount(value) {
    wishCount.classList.remove("count-tick");
    wishCount.textContent = value;
    // Restart a short, gentle transition once per countdown step.
    void wishCount.offsetWidth;
    wishCount.classList.add("count-tick");
  }

  function showWishMoment() {
    if (!state.wishPending || !wishDialog.open) return;
    state.wishTimer = null;
    wishDialog.dataset.phase = "wish";
    setWishCount("✦");
    wishTitle.textContent = "Ước một điều nha.";
    wishInstruction.textContent = "Nhắm mắt lại một chút. Giữ điều ước này cho riêng bạn nhé.";
    wishReturn.hidden = false;
    wishReturn.focus({ preventScroll: true });
  }

  function countWish(number) {
    if (!state.wishPending || !wishDialog.open) return;
    setWishCount(String(number));
    wishInstruction.textContent = number === 3
      ? "3… Hít thật sâu. Nghĩ về điều bạn đang mong chờ."
      : number === 2 ? "2… Thả lỏng một chút, sắp đến lúc ước rồi."
      : "1… Chuẩn bị gửi điều ước vào vũ trụ nha.";
    state.wishTimer = window.setTimeout(() => {
      if (number > 1) countWish(number - 1);
      else showWishMoment();
    }, 1000);
  }

  function settleWish(completed = false, restoreFocus = true) {
    if (!state.wishPending) return;
    window.clearTimeout(state.wishTimer);
    state.wishTimer = null;
    state.wishPending = false;
    wishButton.disabled = false;
    document.body.classList.remove("is-wishing", "wish-modal-open");
    document.body.style.overflow = savedOverflow;
    audio.setQuiet(false);
    if (wishDialog.open) wishDialog.close(completed ? "complete" : "cancel");
    if (completed) {
      feedback.textContent = "Điều ước đã vào quỹ đạo. Chúc Thúy sớm biến nó thành hiện thực! ✧";
      wishButton.querySelector("span:nth-child(2)").textContent = "Ước thêm một điều nữa";
      wishNudge.innerHTML = 'Thêm một điều ước nữa cũng được! <span aria-hidden="true">↙</span>';
      burst(240, .5, .42, true);
    }
    if (restoreFocus) wishButton.focus({ preventScroll: true });
  }

  wishButton.addEventListener("click", () => {
    if (state.wishPending) return;
    state.wishPending = true;
    wishButton.disabled = true;
    feedback.textContent = "";
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("is-wishing", "wish-modal-open");
    wishDialog.dataset.phase = "countdown";
    wishDialog.returnValue = "";
    wishReturn.hidden = true;
    wishTitle.textContent = "Chuẩn bị ước nha…";
    audio.setQuiet(true);
    wishDialog.showModal();
    document.querySelector("#wish-close").focus({ preventScroll: true });
    countWish(3);
  });
  document.querySelector("#wish-close").addEventListener("click", () => settleWish(false));
  wishReturn.addEventListener("click", () => {
    if (wishDialog.dataset.phase === "wish") settleWish(true);
  });
  wishDialog.addEventListener("cancel", event => { event.preventDefault(); settleWish(false); });
  wishDialog.addEventListener("close", () => { if (!wishDialog.open) settleWish(false); });
  wishDialog.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      settleWish(false);
    } else if (event.key === "Tab") {
      const buttons = [...wishDialog.querySelectorAll("button")].filter(button => !button.hidden && !button.disabled);
      const current = buttons.indexOf(document.activeElement);
      const next = (current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      event.preventDefault();
      buttons[next]?.focus({ preventScroll: true });
    }
  });

  document.querySelector("#replay-button").addEventListener("click", () => {
    settleWish(false, false);
    window.clearTimeout(state.wishTimer); state.wishPending = false; wishButton.disabled = false;
    feedback.textContent = ""; wishButton.querySelector("span:nth-child(2)").textContent = "Ước một điều cho tuổi mới";
    document.body.classList.remove("birthday-revealed", "is-wishing");
    document.querySelector(".birthday-content").inert = true;
    state.revealed = false; state.hasBurst = false; state.particles.length = 0;
    orbital.arrivalAt = state.time;
    orbital.yaw = orbital.pitch = orbital.spin = orbital.tumble = 0;
    updatePlanetValue();
    wishNudge.innerHTML = 'Đến lượt Thúy ước rồi nè <span aria-hidden="true">↙</span>';
    window.scrollTo({ top: 0, behavior: "instant" });
    updateScroll();
    document.querySelector(".discover-link").focus({ preventScroll: true });
  });

  function setupIntro() {
    const leftPanel = introCurtain.querySelector(".curtain-panel-left");
    const introForm = document.querySelector("#intro-form");
    const previousOverflow = document.body.style.overflow;
    const previousRestoration = history.scrollRestoration;
    let finished = false;
    let fallbackTimer = null;
    document.body.classList.add("intro-is-open");
    document.body.style.overflow = "hidden";
    history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, behavior: "instant" });

    // Initial HTML covers the page; the native modal keeps its content inert.
    if (introCurtain.open) introCurtain.close();
    introCurtain.showModal();
    introButton.focus({ preventScroll: true });

    function finishIntro() {
      if (finished) return;
      finished = true;
      window.clearTimeout(fallbackTimer);
      leftPanel.removeEventListener("transitionend", onCurtainEnd);
      if (introCurtain.open) introCurtain.close();
      introCurtain.remove();
      state.introPending = state.introOpening = false;
      document.body.classList.remove("intro-is-open");
      document.body.style.overflow = previousOverflow;
      history.scrollRestoration = previousRestoration;
      window.scrollTo({ top: 0, behavior: "instant" });
      resize();
      document.querySelector("#hero-heading").focus({ preventScroll: true });
      startAnimation();
    }

    function onCurtainEnd(event) {
      if (event.target === leftPanel && event.propertyName === "transform") finishIntro();
    }

    introForm.addEventListener("submit", event => {
      event.preventDefault();
      if (!state.introPending || state.introOpening) return;
      state.introPending = false;
      state.introOpening = true;
      introButton.disabled = true;
      introButton.querySelector("span").textContent = "Đang kéo rèm…";
      leftPanel.addEventListener("transitionend", onCurtainEnd);
      introCurtain.classList.add("is-opening");
      startAnimation();
      // Complete reliably if a CSS transition is interrupted or reduced.
      if (motionQuery.matches) requestAnimationFrame(finishIntro);
      else fallbackTimer = window.setTimeout(finishIntro, 2600);
    });
    introCurtain.querySelector(".curtain-stage").addEventListener("click", () => {
      if (state.introPending && !state.introOpening) introForm.requestSubmit();
    });
    introCurtain.addEventListener("cancel", event => event.preventDefault());
    introCurtain.addEventListener("keydown", event => {
      if (event.key === "Escape") event.preventDefault();
      else if (event.key === "Tab") {
        event.preventDefault();
        if (!introButton.disabled) introButton.focus({ preventScroll: true });
      }
    });
  }

  setupIntro();
  resize(); startAnimation();
})();
