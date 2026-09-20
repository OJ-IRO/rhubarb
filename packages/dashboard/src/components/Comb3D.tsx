import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { href } from "../router";

export interface CombCell {
  id: number;
  name: string;
  /** layout position, in units where a hex has radius 1 */
  x: number;
  y: number;
  /** 0..1, how far up the ladder */
  fill: number;
  waiting: boolean;
}

interface Props {
  cells: CombCell[];
  hovered: number | null;
  onHover: (id: number | null) => void;
  onOpen: (id: number) => void;
  /** WebGL could not start; the page falls back to the flat comb. */
  onFail: () => void;
}

const WALL = 0.9; // wall height of a cell you've taken on
const WALL_WAITING = 0.32; // cells waiting on a decision sit low and pale
const OUTER = 0.965;
const INNER = 0.83;
const LIFT = 0.16;
const MARGIN = 0.9; // how much of the frame the comb may fill, in NDC

function hexShape(r: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    if (i === 0) s.moveTo(r * Math.cos(a), r * Math.sin(a));
    else s.lineTo(r * Math.cos(a), r * Math.sin(a));
  }
  s.closePath();
  return s;
}

/** A hex prism of height 1 standing on y = 0. Scale y to set its height. */
function prism(r: number, hole?: number): THREE.ExtrudeGeometry {
  const shape = hexShape(r);
  if (hole) shape.holes.push(hexShape(hole));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

function token(name: string, fallback: string): THREE.Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v || fallback);
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export default function Comb3D({ cells, hovered, onHover, onOpen, onFail }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<number, HTMLAnchorElement>());
  const hoveredRef = useRef<number | null>(hovered);
  const wake = useRef<() => void>(() => {});
  const handlers = useRef({ onHover, onOpen, onFail });
  handlers.current = { onHover, onOpen, onFail };

  useEffect(() => {
    hoveredRef.current = hovered;
    wake.current();
  }, [hovered]);

  useEffect(() => {
    const host = wrap.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      handlers.current.onFail();
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-hidden", "true");
    host.prepend(canvas);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.3;

    scene.add(new THREE.HemisphereLight(0xfff3d6, 0xc9b27a, 0.75));
    const sun = new THREE.DirectionalLight(0xfff6e6, 1.15);
    sun.position.set(-5, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 6;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    const extent = Math.max(...cells.map((c) => Math.hypot(c.x, c.y)), 0) + 1.35;
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -extent - 1;
    sc.right = sc.top = extent + 1;
    sc.far = 40;
    sc.updateProjectionMatrix();

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(extent * 6, extent * 6), new THREE.ShadowMaterial({ opacity: 0.16 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const wallGeo = prism(OUTER, INNER);
    const floorGeo = prism(OUTER);
    const honeyGeo = prism(INNER);
    const hitGeo = prism(1);

    const wax = new THREE.MeshStandardMaterial({ color: token("--comb", "#f3d78a"), roughness: 0.78 });
    const waxWaiting = new THREE.MeshStandardMaterial({ color: token("--comb-light", "#faedc8"), roughness: 0.92 });
    const edgeGeo = new THREE.EdgesGeometry(wallGeo, 30);
    const edge = new THREE.LineBasicMaterial({ color: token("--honey-deep", "#c98a0e"), transparent: true, opacity: 0.55 });
    const edgeWaiting = new THREE.LineBasicMaterial({ color: token("--honey", "#e9a825"), transparent: true, opacity: 0.45 });
    const honey = new THREE.MeshPhysicalMaterial({
      color: token("--honey", "#e9a825"),
      roughness: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      emissive: token("--honey-deep", "#c98a0e"),
      emissiveIntensity: 0.1,
    });
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    interface Live {
      cell: CombCell;
      group: THREE.Group;
      honey: THREE.Mesh | null;
      hit: THREE.Mesh;
      wall: number;
      lift: number;
      level: number;
      delay: number;
    }
    const live: Live[] = cells.map((cell, i) => {
      const group = new THREE.Group();
      group.position.set(cell.x, 0, cell.y);
      const wall = cell.waiting ? WALL_WAITING : WALL;
      const mat = cell.waiting ? waxWaiting : wax;

      const walls = new THREE.Mesh(wallGeo, mat);
      walls.scale.y = wall;
      walls.castShadow = !cell.waiting;
      walls.receiveShadow = true;
      const floor = new THREE.Mesh(floorGeo, mat);
      floor.scale.y = 0.05;
      floor.receiveShadow = true;
      const lines = new THREE.LineSegments(edgeGeo, cell.waiting ? edgeWaiting : edge);
      lines.scale.y = wall;
      group.add(walls, floor, lines);

      let honeyMesh: THREE.Mesh | null = null;
      if (cell.fill > 0) {
        honeyMesh = new THREE.Mesh(honeyGeo, honey);
        honeyMesh.position.y = 0.05;
        honeyMesh.scale.y = 0.0001;
        group.add(honeyMesh);
      }
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.scale.y = wall;
      hit.userData.id = cell.id;
      group.add(hit);
      scene.add(group);
      return { cell, group, honey: honeyMesh, hit, wall, lift: 0, level: still ? cell.fill : 0, delay: 250 + i * 110 };
    });

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
    // Every top and bottom corner of every cell (with room for a lifted cell), used to frame the comb.
    const corners: THREE.Vector3[] = [];
    for (const l of live) {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        corners.push(new THREE.Vector3(l.cell.x + Math.cos(a), 0, l.cell.y + Math.sin(a)), new THREE.Vector3(l.cell.x + Math.cos(a), l.wall + LIFT, l.cell.y + Math.sin(a)));
      }
    }
    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Frame the comb on what it really covers on screen. The tilt means the on-screen shape
      // depends on distance, so: find the distance that fits, centre vertically, and repeat once.
      const dir = new THREE.Vector3(0, 1.1, 1).normalize();
      const probe = new THREE.Vector3();
      const cover = (dist: number, target: number) => {
        camera.position.copy(dir).multiplyScalar(dist);
        camera.position.z += target;
        camera.lookAt(0, 0.2, target);
        camera.updateMatrixWorld();
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, behind = false;
        for (const c of corners) {
          probe.copy(c).applyMatrix4(camera.matrixWorldInverse);
          if (probe.z > -camera.near) behind = true;
          probe.copy(c).project(camera);
          minX = Math.min(minX, probe.x); maxX = Math.max(maxX, probe.x);
          minY = Math.min(minY, probe.y); maxY = Math.max(maxY, probe.y);
        }
        return { minX, maxX, minY, maxY, behind };
      };
      const fitDistance = (target: number) => {
        let lo = 1, hi = 300;
        for (let i = 0; i < 30; i++) {
          const mid = (lo + hi) / 2;
          const b = cover(mid, target);
          const fits = !b.behind && Math.max(-b.minX, b.maxX, -b.minY, b.maxY) <= MARGIN;
          if (fits) hi = mid;
          else lo = mid;
        }
        return hi;
      };
      const centre = (dist: number, from: number) => {
        let t = from;
        for (let i = 0; i < 6; i++) {
          const a = cover(dist, t);
          const b = cover(dist, t + 0.05);
          const slope = ((b.minY + b.maxY) / 2 - (a.minY + a.maxY) / 2) / 0.05;
          if (Math.abs(slope) < 1e-6) break;
          t -= (a.minY + a.maxY) / 2 / slope;
        }
        return t;
      };
      let target = 0;
      let dist = fitDistance(target);
      for (let pass = 0; pass < 2; pass++) {
        target = centre(dist, target);
        dist = fitDistance(target);
      }
      cover(dist, target);
      wake.current();
    };

    const point = new THREE.Vector3();
    const placeLabels = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      for (const l of live) {
        const el = labels.current.get(l.cell.id);
        if (!el) continue;
        point.set(l.cell.x, l.wall + l.lift + 0.02, l.cell.y).project(camera);
        el.style.transform = `translate(-50%, -50%) translate(${((point.x + 1) / 2) * w}px, ${((1 - point.y) / 2) * h}px)`;
      }
    };

    const start = performance.now();
    let frame = 0;
    const tick = () => {
      frame = 0;
      const t = performance.now() - start;
      let moving = false;
      for (const l of live) {
        const wantLift = hoveredRef.current === l.cell.id ? LIFT : 0;
        if (Math.abs(wantLift - l.lift) > 0.001) {
          l.lift = still ? wantLift : l.lift + (wantLift - l.lift) * 0.2;
          moving = true;
        } else l.lift = wantLift;
        l.group.position.y = l.lift;

        if (l.honey) {
          if (!still) {
            const p = Math.min(Math.max((t - l.delay) / 1300, 0), 1);
            l.level = l.cell.fill * easeOut(p);
            if (p < 1) moving = true;
          }
          // Honey stops just shy of the rim, so a full cell still reads as a cell.
          l.honey.scale.y = Math.max(l.level * (l.wall - 0.09), 0.0001);
        }
      }
      renderer.render(scene, camera);
      placeLabels();
      if (moving) frame = requestAnimationFrame(tick);
    };
    wake.current = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pick = (e: PointerEvent): number | null => {
      const b = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -(((e.clientY - b.top) / b.height) * 2 - 1));
      ray.setFromCamera(ndc, camera);
      const first = ray.intersectObjects(live.map((l) => l.hit), false)[0];
      return first ? (first.object.userData.id as number) : null;
    };
    const onMove = (e: PointerEvent) => {
      const id = pick(e);
      canvas.style.cursor = id === null ? "default" : "pointer";
      if (id !== hoveredRef.current) handlers.current.onHover(id);
    };
    const onLeave = () => handlers.current.onHover(null);
    const onClick = (e: PointerEvent) => {
      const id = pick(e);
      if (id !== null) handlers.current.onOpen(id);
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick as EventListener);

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    return () => {
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
      wake.current = () => {};
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick as EventListener);
      for (const g of [wallGeo, floorGeo, honeyGeo, hitGeo, edgeGeo, ground.geometry]) g.dispose();
      for (const m of [wax, waxWaiting, honey, hitMat, edge, edgeWaiting, ground.material as THREE.Material]) m.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [cells]);

  return (
    <div className="comb3d" ref={wrap}>
      {cells.map((c) => (
        <a
          key={c.id}
          href={href(`/skills/${c.id}`)}
          className={c.waiting ? "comb3d-label waiting" : "comb3d-label"}
          ref={(el) => {
            if (el) labels.current.set(c.id, el);
            else labels.current.delete(c.id);
          }}
          onClick={(e) => {
            e.preventDefault();
            onOpen(c.id);
          }}
          onFocus={() => onHover(c.id)}
          onBlur={() => onHover(null)}
        >
          {c.name}
        </a>
      ))}
    </div>
  );
}
