(() => {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  let currentTheme = savedTheme || (prefersDark ? 'dark' : 'light');

  const applyTheme = (t) => {
    currentTheme = t;
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
    localStorage.setItem('theme', t);
  };
  applyTheme(currentTheme);

  const sunIco = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
  const moonIco = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  const themeBtn = document.getElementById('worldThemeToggle');
  const updateIcon = () => { themeBtn.innerHTML = currentTheme === 'dark' ? sunIco : moonIco; };
  updateIcon();
  themeBtn.addEventListener('click', () => {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
    updateIcon();
  });

  // Mini 3D Earth preview
  const stage = document.getElementById('worldSphereStage');
  if (stage && typeof THREE !== 'undefined') {
    const size = 280;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.z = 2.6;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    stage.insertBefore(renderer.domElement, stage.firstChild);

    const sun = new THREE.DirectionalLight(0xffffff, 1.35);
    sun.position.set(5, 3, 5);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x88aaff, 0.35));

    const loader = new THREE.TextureLoader();
    loader.load('/images/earth_atmos_2048.jpg?v=1', (texture) => {
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const geometry = new THREE.SphereGeometry(1, 48, 48);
      const material = new THREE.MeshPhongMaterial({
        map: texture,
        specular: new THREE.Color(0x223355),
        shininess: 12,
      });
      const earth = new THREE.Mesh(geometry, material);
      earth.rotation.z = THREE.MathUtils.degToRad(23.5); // fixed axial tilt
      scene.add(earth);

      let isHovering = false;
      const canvas = renderer.domElement;
      canvas.addEventListener('mouseenter', () => { isHovering = true; });
      canvas.addEventListener('mouseleave', () => { isHovering = false; });

      const animate = () => {
        requestAnimationFrame(animate);
        const speed = isHovering ? 0.008 : 0.003;
        earth.rotation.y += speed;
        earth.rotation.x += 0.001;
        renderer.render(scene, camera);
      };
      animate();
    });
  }

  // Mini 3D Moon preview — real lunar surface
  const moonStage = document.getElementById('moonSphereStage');
  if (moonStage && typeof THREE !== 'undefined') {
    const size = 220;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.z = 2.6;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    moonStage.insertBefore(renderer.domElement, moonStage.firstChild);

    // Key light low from the left-front → long crescent terminator + crater relief
    const key = new THREE.DirectionalLight(0xfff3e2, 1.55);
    key.position.set(4.5, 1.6, 3.2);
    scene.add(key);

    // Cool earthshine fill so the dark limb stays faintly readable
    const fill = new THREE.DirectionalLight(0x9fb4d6, 0.32);
    fill.position.set(-3, 1.5, 4.5);
    scene.add(fill);

    scene.add(new THREE.AmbientLight(0x2a2c33, 0.22));

    const geometry = new THREE.SphereGeometry(1, 64, 64);
    const moon = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.96, metalness: 0.0
    }));
    moon.rotation.z = 0.41; // gentle axial tilt
    scene.add(moon);

    function buildNormalMapFromAlbedo(img, targetSize) {
      const W = targetSize;
      const H = targetSize / 2;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H).data;
      const height = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) {
        const o = i * 4;
        const lum = (d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114) / 255;
        height[i] = Math.pow(lum, 1.55) * 0.65;
      }
      const out = ctx.createImageData(W, H);
      const od = out.data;
      const getH = (x, y) => {
        x = ((x % W) + W) % W;
        y = y < 0 ? 0 : (y >= H ? H - 1 : y);
        return height[y * W + x];
      };
      const strength = 3.6;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const hl = getH(x - 1, y), hr = getH(x + 1, y);
          const hu = getH(x, y - 1), hd = getH(x, y + 1);
          let nx = (hl - hr) * strength, ny = (hu - hd) * strength, nz = 1.0;
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
          nx /= len; ny /= len; nz /= len;
          const o = (y * W + x) * 4;
          od[o] = (nx * 0.5 + 0.5) * 255;
          od[o + 1] = (ny * 0.5 + 0.5) * 255;
          od[o + 2] = (nz * 0.5 + 0.5) * 255;
          od[o + 3] = 255;
        }
      }
      ctx.putImageData(out, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    }

    const loader = new THREE.TextureLoader();
    loader.load('/images/moon_2k.jpg?v=1', (colorMap) => {
      colorMap.wrapS = THREE.RepeatWrapping;
      colorMap.wrapT = THREE.ClampToEdgeWrapping;
      colorMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
      if (THREE.SRGBColorSpace) colorMap.colorSpace = THREE.SRGBColorSpace;
      else colorMap.encoding = THREE.sRGBEncoding;

      const normalMap = buildNormalMapFromAlbedo(colorMap.image, 512);
      normalMap.anisotropy = renderer.capabilities.getMaxAnisotropy();

      moon.material.map = colorMap;
      moon.material.normalMap = normalMap;
      moon.material.normalScale = new THREE.Vector2(0.7, 0.7);
      moon.material.needsUpdate = true;
    });

    let isHovering = false;
    const canvas = renderer.domElement;
    canvas.addEventListener('mouseenter', () => { isHovering = true; });
    canvas.addEventListener('mouseleave', () => { isHovering = false; });

    const animate = () => {
      requestAnimationFrame(animate);
      const speed = isHovering ? 0.005 : 0.0012;
      moon.rotation.y += speed;
      renderer.render(scene, camera);
    };
    animate();
  }
})();
