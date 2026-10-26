import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createTower } from './tower';
import { COMPONENTS, PART_IDS, type PartId } from './components-data';

export type SceneState = { selected: PartId | null; removed: PartId[]; hidden: PartId[]; explode: number; isolate: boolean; labels: boolean; autoRotate: boolean };
export type SceneController = { setState: (state: SceneState) => void; view: (name: string) => void; zoom: (factor: number) => void; fit: () => void; dispose: () => void };
export const EXPLODE_OFFSETS: Record<PartId, [number, number, number]> = {
  case: [0, 0, 0], panel: [4.5, 0, 0.4], motherboard: [-2.8, .45, -.8],
  cpu: [.3, 3.15, -1.6], cooler: [2.15, 1.65, -1.2], ram: [1.25, 1.4, 1.7],
  gpu: [2.6, -.15, .25], ssd: [2.95, .95, -2.4], psu: [1.2, 0, -3.1], fans: [0, .1, 2.7],
};

export function createPCScene(host: HTMLDivElement, onSelect: (id: PartId | null) => void, onContextLost: () => void): SceneController {
  let state: SceneState = { selected: null, removed: [], hidden: [], explode: 0, isolate: false, labels: false, autoRotate: false };
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery.matches;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f6f3);
  const camera = new THREE.PerspectiveCamera(35, 1, .05, 150);
  camera.position.set(9, 6.4, 8);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Interactive 3D desktop computer. Drag to rotate, scroll to zoom, arrow keys to pan, or select components using the component list.');
  host.appendChild(canvas);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 2.3, 0);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = .085;
  controls.minDistance = .5;
  controls.maxDistance = 48;
  controls.maxPolarAngle = Math.PI * .94;
  controls.rotateSpeed = .65;
  controls.zoomSpeed = .7;
  controls.panSpeed = .7;
  controls.autoRotateSpeed = .55;
  controls.listenToKeyEvents(canvas);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .62;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb4b9ac, 1.65));
  const key = new THREE.DirectionalLight(0xfff7ee, 3.2);
  key.position.set(5, 10, 5); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: .5, far: 35 });
  key.shadow.bias = -.00015; key.shadow.normalBias = .025;
  key.shadow.radius = 4;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe7efff, 1.8); fill.position.set(-5, 5, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 2.2); rim.position.set(1, 6, -7); scene.add(rim);

  const { root, parts, anchors } = createTower();
  scene.add(root);
  const origins = Object.fromEntries(PART_IDS.map((id) => [id, parts[id].position.clone()])) as Record<PartId, THREE.Vector3>;
  const offsets = Object.fromEntries(PART_IDS.map((id) => [id, new THREE.Vector3(...EXPLODE_OFFSETS[id])])) as Record<PartId, THREE.Vector3>;
  const targets = Object.fromEntries(PART_IDS.map((id) => [id, origins[id].clone()])) as Record<PartId, THREE.Vector3>;
  const localBounds = {} as Record<PartId, THREE.Box3>;
  root.updateMatrixWorld(true);
  for (const id of PART_IDS) {
    const partBounds = new THREE.Box3();
    parts[id].traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      let parent: THREE.Object3D | null = object;
      while (parent && !parent.userData.isCable) parent = parent.parent;
      if (!parent) partBounds.union(new THREE.Box3().setFromObject(object));
    });
    localBounds[id] = partBounds.translate(origins[id].clone().negate());
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.ShadowMaterial({ opacity: .13 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = .015; ground.receiveShadow = true; scene.add(ground);
  // A restrained measurement grid grounds the model on a virtual work surface.
  const grid = new THREE.GridHelper(30, 60, 0xc0c9bf, 0xd9dfd7);
  grid.position.y = .01;
  const gridMat = grid.material as THREE.Material; gridMat.transparent = true; gridMat.opacity = .19;
  scene.add(grid);

  const highlight = new THREE.Box3Helper(new THREE.Box3(), 0x658856);
  (highlight.material as THREE.LineBasicMaterial).transparent = true;
  (highlight.material as THREE.LineBasicMaterial).opacity = .55;
  highlight.visible = false;
  scene.add(highlight);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const meshes: THREE.Object3D[] = [];
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) meshes.push(object);
  });
  const labelsHost = document.createElement('div');
  labelsHost.className = 'scene-labels';
  host.appendChild(labelsHost);
  const labelElements = {} as Record<PartId, HTMLButtonElement>;
  for (const info of COMPONENTS) {
    const label = document.createElement('button');
    label.className = 'scene-label'; label.textContent = info.short; label.style.display = 'none';
    label.setAttribute('aria-label', `Explore ${info.name.toLowerCase()}`);
    label.addEventListener('click', () => onSelect(info.id));
    labelsHost.appendChild(label); labelElements[info.id] = label;
  }

  let cameraGoal: THREE.Vector3 | null = null;
  let targetGoal: THREE.Vector3 | null = null;
  let width = 1, height = 1;
  let disposed = false;
  let frameId = 0;
  let previousTime = performance.now();
  let dirty = true;
  let settleFrames = 0;
  const tempBox = new THREE.Box3();
  const bounds = new THREE.Box3();
  const targetPoint = new THREE.Vector3();
  const desiredDirection = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const corners: THREE.Vector3[] = Array.from({ length: 8 }, () => new THREE.Vector3());

  function fittedBounds() {
    bounds.makeEmpty();
    for (const id of PART_IDS) {
      if (state.hidden.includes(id) || (state.isolate && state.selected && id !== state.selected)) continue;
      tempBox.copy(localBounds[id]).translate(targets[id]); bounds.union(tempBox);
    }
    if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-1, .2, -2), new THREE.Vector3(1, 4.6, 2));
    return bounds;
  }
  function fit(direction?: THREE.Vector3, snap = false) {
    const box = fittedBounds();
    box.getCenter(targetPoint);
    desiredDirection.copy(direction || camera.position.clone().sub(controls.target)).normalize();
    right.crossVectors(new THREE.Vector3(0, 1, 0), desiredDirection).normalize();
    up.crossVectors(desiredDirection, right).normalize();
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let distance = 0;
    for (let i = 0; i < 8; i++) {
      corners[i].set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(targetPoint);
      const depth = corners[i].dot(desiredDirection);
      distance = Math.max(distance, depth + Math.abs(corners[i].dot(right)) / (tan * camera.aspect), depth + Math.abs(corners[i].dot(up)) / tan);
    }
    distance = Math.max(.75, distance * 1.19);
    cameraGoal = targetPoint.clone().addScaledVector(desiredDirection, distance);
    targetGoal = targetPoint.clone();
    if (snap || reducedMotion) { camera.position.copy(cameraGoal); controls.target.copy(targetGoal); cameraGoal = null; targetGoal = null; controls.update(); }
    dirty = true;
  }
  const resizeObserver = new ResizeObserver(() => {
    width = host.clientWidth; height = host.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    fit(undefined, true);
  });
  resizeObserver.observe(host);

  function pick(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(meshes, false);
    for (const hit of hits) {
      const id = hit.object.userData.partId as PartId | undefined;
      if (!id || !parts[id].visible) continue;
      let ancestor: THREE.Object3D | null = hit.object;
      while (ancestor && ancestor.visible) ancestor = ancestor.parent;
      if (ancestor) continue;
      const material = (hit.object as THREE.Mesh).material;
      if (!Array.isArray(material) && material.transparent && material.opacity < .35) continue;
      return id;
    }
    return null;
  }
  let downX = 0, downY = 0, dragged = false, multiTouch = false;
  const activePointers = new Set<number>();
  const pointerDown = (event: PointerEvent) => {
    activePointers.add(event.pointerId);
    if (activePointers.size === 1) { downX = event.clientX; downY = event.clientY; dragged = false; multiTouch = false; }
    else multiTouch = true;
    cameraGoal = null; targetGoal = null;
  };
  const pointerMove = (event: PointerEvent) => {
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) dragged = true;
    if (!event.buttons) canvas.style.cursor = pick(event) ? 'pointer' : 'grab';
  };
  const pointerUp = (event: PointerEvent) => {
    if (activePointers.has(event.pointerId) && activePointers.size === 1 && !multiTouch && !dragged && event.button === 0) { const id = pick(event); if (id) onSelect(id); }
    activePointers.delete(event.pointerId);
  };
  const pointerCancel = (event: PointerEvent) => { activePointers.delete(event.pointerId); dragged = true; };
  const keyDown = (event: KeyboardEvent) => {
    if (event.key.startsWith('Arrow')) { cameraGoal = null; targetGoal = null; dirty = true; }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(.8); }
    else if (event.key === '-') { event.preventDefault(); zoom(1.25); }
  };
  const interruptCamera = () => { cameraGoal = null; targetGoal = null; dirty = true; };
  const onControlChange = () => { dirty = true; };
  const contextLost = (event: Event) => { event.preventDefault(); onContextLost(); };
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerCancel);
  canvas.addEventListener('keydown', keyDown); canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('wheel', interruptCamera, { passive: true });
  controls.addEventListener('change', onControlChange);
  const motionChange = () => { reducedMotion = motionQuery.matches; controls.enableDamping = !reducedMotion; dirty = true; };
  motionQuery.addEventListener('change', motionChange);

  const labelPoint = new THREE.Vector3();
  function updateLabels() {
    const occupied: { x: number; y: number; width: number }[] = [];
    // Keep the selected label first, so collision culling never hides it.
    const ordered = state.selected ? [state.selected, ...PART_IDS.filter((id) => id !== state.selected)] : PART_IDS;
    for (const id of ordered) {
      const label = labelElements[id];
      if (!parts[id].visible || (!state.labels && state.selected !== id)) { label.style.display = 'none'; continue; }
      labelPoint.copy(anchors[id]); parts[id].localToWorld(labelPoint); labelPoint.project(camera);
      if (labelPoint.z > 1 || labelPoint.z < -1) { label.style.display = 'none'; continue; }
      let x = (labelPoint.x * .5 + .5) * width;
      let y = (-labelPoint.y * .5 + .5) * height - 14;
      const labelWidth = COMPONENTS.find((part) => part.id === id)!.short.length * 6 + 29;
      x = Math.max(labelWidth / 2 + 8, Math.min(width - labelWidth / 2 - 8, x));
      y = Math.max(30, Math.min(height - 28, y));
      for (const other of occupied) {
        if (Math.abs(other.x - x) < (other.width + labelWidth) / 2 + 5 && Math.abs(other.y - y) < 28) y = other.y + 29;
      }
      if (y > height - 20) { label.style.display = 'none'; continue; }
      occupied.push({ x, y, width: labelWidth });
      label.style.display = 'block'; label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      label.classList.toggle('selected', id === state.selected);
    }
  }
  function animate(time: number) {
    if (disposed) return;
    frameId = requestAnimationFrame(animate);
    if (document.hidden) { previousTime = time; return; }
    const dt = Math.min((time - previousTime) / 1000, .05); previousTime = time;
    const alpha = reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    let changing = false;
    for (const id of PART_IDS) {
      if (parts[id].position.distanceToSquared(targets[id]) > .000001) { parts[id].position.lerp(targets[id], alpha); changing = true; }
      else parts[id].position.copy(targets[id]);
    }
    if (cameraGoal && targetGoal) {
      camera.position.lerp(cameraGoal, alpha); controls.target.lerp(targetGoal, alpha); changing = true;
      if (camera.position.distanceToSquared(cameraGoal) < .00001 && controls.target.distanceToSquared(targetGoal) < .00001) { cameraGoal = null; targetGoal = null; }
    }
    controls.autoRotate = state.autoRotate && !reducedMotion;
    controls.update(dt);
    if (changing || dirty || controls.autoRotate || settleFrames > 0) {
      root.updateMatrixWorld(true);
      if (state.selected && parts[state.selected].visible && !state.isolate) {
        highlight.box.copy(localBounds[state.selected]).translate(parts[state.selected].position).expandByScalar(.025); highlight.visible = true;
      } else highlight.visible = false;
      updateLabels(); renderer.render(scene, camera);
      dirty = false; settleFrames = changing ? 3 : Math.max(0, settleFrames - 1);
    }
  }
  function zoom(factor: number) {
    cameraGoal = camera.position.clone().sub(controls.target).multiplyScalar(factor);
    const distance = THREE.MathUtils.clamp(cameraGoal.length(), controls.minDistance, controls.maxDistance);
    cameraGoal.setLength(distance).add(controls.target);
    targetGoal = controls.target.clone(); dirty = true;
  }
  function setState(next: SceneState) {
    const shouldFit = state.explode !== next.explode || state.isolate !== next.isolate || (next.isolate && state.selected !== next.selected) || state.removed.join() !== next.removed.join() || state.hidden.join() !== next.hidden.join();
    state = { ...next };
    for (const id of PART_IDS) {
      const amount = state.removed.includes(id) ? 1 : state.explode;
      targets[id].copy(origins[id]).addScaledVector(offsets[id], amount);
      parts[id].visible = !state.hidden.includes(id) && (!state.isolate || !state.selected || id === state.selected);
      // Cables disappear while parts separate: connector routing is intentionally schematic.
      parts[id].traverse((object) => { if (object.userData.isCable) object.visible = amount < .02 && state.removed.length === 0 && !state.isolate; });
    }
    ground.visible = !state.isolate; grid.visible = !state.isolate;
    if (shouldFit) fit();
    dirty = true;
  }
  fit(new THREE.Vector3(1.2, .54, 1), true);
  frameId = requestAnimationFrame(animate);
  return {
    setState, fit: () => fit(), zoom,
    view: (name) => { const directions: Record<string, THREE.Vector3> = { perspective: new THREE.Vector3(1.2, .54, 1), side: new THREE.Vector3(1, .05, 0), front: new THREE.Vector3(.02, .03, 1) }; fit(directions[name] || directions.perspective); },
    dispose: () => {
      disposed = true; cancelAnimationFrame(frameId); resizeObserver.disconnect();
      motionQuery.removeEventListener('change', motionChange);
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerCancel);
      canvas.removeEventListener('keydown', keyDown); canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('wheel', interruptCamera);
      controls.removeEventListener('change', onControlChange); controls.dispose();
      const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(); const textures = new Set<THREE.Texture>();
      scene.traverse((object) => { const mesh = object as THREE.Mesh; if (mesh.geometry) geometries.add(mesh.geometry); if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { materials.add(material); for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); } });
      geometries.forEach((geometry) => geometry.dispose()); textures.forEach((texture) => texture.dispose()); materials.forEach((material) => material.dispose());
      environment.dispose(); key.shadow.dispose(); renderer.dispose(); canvas.remove(); labelsHost.remove();
    },
  };
}
