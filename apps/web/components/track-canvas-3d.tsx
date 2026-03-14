"use client";

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import * as THREE from "three";

import type { TrackSurfaceModel } from "@/lib/session-insights";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

type Props = {
  model: TrackSurfaceModel | null;
  nextModel?: TrackSurfaceModel | null;
  interpolation?: number;
  selectedDriver?: string | null;
  onSelectDriver?: (racingNumber: string | null) => void;
};

type DriverState = {
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  marker: TrackSurfaceModel["markers"][number];
};

const TRACK_SCALE = 2.0;
const TRACK_ELEVATION = 0;
const DRIVER_SPHERE_RADIUS = 0.13;

function normalizePathPoints(points: Array<{ xPercent: number; yPercent: number }>) {
  if (points.length === 0) return [];
  const minX = Math.min(...points.map((p) => p.xPercent));
  const maxX = Math.max(...points.map((p) => p.xPercent));
  const minY = Math.min(...points.map((p) => p.yPercent));
  const maxY = Math.max(...points.map((p) => p.yPercent));
  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);
  const scale = TRACK_SCALE / Math.max(rangeX, rangeY);

  return points.map((p) => ({
    x: (p.xPercent - (minX + maxX) / 2) * scale,
    y: TRACK_ELEVATION,
    z: (p.yPercent - (minY + maxY) / 2) * scale,
  }));
}

function markerTo3D(
  marker: TrackSurfaceModel["markers"][number],
  pathBounds: { minX: number; maxX: number; minY: number; maxY: number },
) {
  if (marker.xPercent === undefined || marker.yPercent === undefined) return null;
  const rangeX = Math.max(pathBounds.maxX - pathBounds.minX, 1);
  const rangeY = Math.max(pathBounds.maxY - pathBounds.minY, 1);
  const scale = TRACK_SCALE / Math.max(rangeX, rangeY);
  const centerX = (pathBounds.minX + pathBounds.maxX) / 2;
  const centerY = (pathBounds.minY + pathBounds.maxY) / 2;
  return {
    x: (marker.xPercent - centerX) * scale,
    y: TRACK_ELEVATION + 0.08,
    z: (marker.yPercent - centerY) * scale,
  };
}

function getPathBounds(points: Array<{ xPercent: number; yPercent: number }>) {
  return {
    minX: Math.min(...points.map((p) => p.xPercent)),
    maxX: Math.max(...points.map((p) => p.xPercent)),
    minY: Math.min(...points.map((p) => p.yPercent)),
    maxY: Math.max(...points.map((p) => p.yPercent)),
  };
}

export function TrackCanvas3D({
  model,
  nextModel = null,
  interpolation = 0,
  selectedDriver = null,
  onSelectDriver,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const frameRef = useRef(0);
  const driverStatesRef = useRef<Map<string, DriverState>>(new Map());
  const driverMeshesRef = useRef<Map<string, { sphere: THREE.Mesh; label: THREE.Sprite; outline: THREE.Mesh }>>(new Map());
  const trackMeshRef = useRef<THREE.Group | null>(null);
  const latestRef = useRef({ model, nextModel, interpolation, selectedDriver });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const cameraAngle = useRef({ theta: Math.PI * 0.25, phi: Math.PI * 0.3, distance: 3.2 });
  const [size, setSize] = useState({ width: 900, height: 500 });

  useEffect(() => {
    latestRef.current = { model, nextModel, interpolation, selectedDriver };
  }, [model, nextModel, interpolation, selectedDriver]);

  // Init Three.js
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size.width, size.height);
    renderer.setClearColor(0x090b10, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x090b10, 0.12);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, size.width / size.height, 0.1, 100);
    cameraRef.current = camera;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x334466, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight.position.set(3, 8, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x00a3ff, 0.4);
    rimLight.position.set(-4, 3, -2);
    scene.add(rimLight);

    const pointLight = new THREE.PointLight(0xe10600, 0.6, 10);
    pointLight.position.set(0, 3, 0);
    scene.add(pointLight);

    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x080a0f,
      roughness: 0.95,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid
    const gridHelper = new THREE.GridHelper(16, 60, 0x111828, 0x0a1020);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    return () => {
      renderer.dispose();
      container.removeChild(renderer.domElement);
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  // Resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(320, Math.floor(entry.contentRect.width));
      const h = Math.max(200, Math.floor(entry.contentRect.height));
      setSize({ width: w, height: h });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera) return;
    renderer.setSize(size.width, size.height);
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
  }, [size]);

  // Build/update track mesh
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !model?.pathPoints?.length) return;

    // Remove old track
    if (trackMeshRef.current) {
      scene.remove(trackMeshRef.current);
      trackMeshRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      });
    }

    const group = new THREE.Group();
    const pts3d = normalizePathPoints(model.pathPoints);
    if (pts3d.length < 2) return;

    const curvePoints = pts3d.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(curvePoints, false, "catmullrom", 0.5);
    const smoothPoints = curve.getPoints(Math.max(pts3d.length * 3, 200));

    // Track road surface - extruded ribbon
    const trackWidth = 0.14;
    const positions: number[] = [];
    const indices: number[] = [];
    const colors: number[] = [];

    for (let i = 0; i < smoothPoints.length; i++) {
      const p = smoothPoints[i]!;
      const tangent = i < smoothPoints.length - 1
        ? new THREE.Vector3().subVectors(smoothPoints[i + 1]!, p).normalize()
        : new THREE.Vector3().subVectors(p, smoothPoints[i - 1]!).normalize();

      const up = new THREE.Vector3(0, 1, 0);
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

      // Sector coloring: S1 = red, S2 = cyan, S3 = yellow
      const t = i / smoothPoints.length;
      let r: number, g: number, b: number;
      if (t < 0.33) {
        r = 0.85; g = 0.12; b = 0.08; // red
      } else if (t < 0.66) {
        r = 0.0; g = 0.75; b = 0.85; // cyan
      } else {
        r = 0.92; g = 0.8; b = 0.1; // yellow
      }

      const left = p.clone().add(normal.clone().multiplyScalar(trackWidth / 2));
      const right = p.clone().add(normal.clone().multiplyScalar(-trackWidth / 2));

      positions.push(left.x, left.y, left.z);
      positions.push(right.x, right.y, right.z);
      colors.push(r, g, b);
      colors.push(r, g, b);

      if (i < smoothPoints.length - 1) {
        const vi = i * 2;
        indices.push(vi, vi + 1, vi + 2);
        indices.push(vi + 1, vi + 3, vi + 2);
      }
    }

    const trackGeometry = new THREE.BufferGeometry();
    trackGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    trackGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    trackGeometry.setIndex(indices);
    trackGeometry.computeVertexNormals();

    const trackMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.4,
      metalness: 0.3,
      emissive: 0x111111,
      emissiveIntensity: 0.3,
    });
    const trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
    trackMesh.receiveShadow = true;
    group.add(trackMesh);

    // Track edge glow - outer lines
    const edgeGlowMaterial = new THREE.LineBasicMaterial({ color: 0x00a3ff, transparent: true, opacity: 0.3 });
    const leftEdgePoints: THREE.Vector3[] = [];
    const rightEdgePoints: THREE.Vector3[] = [];

    for (let i = 0; i < smoothPoints.length; i++) {
      const p = smoothPoints[i]!;
      const tangent = i < smoothPoints.length - 1
        ? new THREE.Vector3().subVectors(smoothPoints[i + 1]!, p).normalize()
        : new THREE.Vector3().subVectors(p, smoothPoints[i - 1]!).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const outerWidth = trackWidth / 2 + 0.01;
      leftEdgePoints.push(p.clone().add(normal.clone().multiplyScalar(outerWidth)));
      rightEdgePoints.push(p.clone().add(normal.clone().multiplyScalar(-outerWidth)));
    }

    const leftEdgeGeom = new THREE.BufferGeometry().setFromPoints(leftEdgePoints);
    const rightEdgeGeom = new THREE.BufferGeometry().setFromPoints(rightEdgePoints);
    group.add(new THREE.Line(leftEdgeGeom, edgeGlowMaterial));
    group.add(new THREE.Line(rightEdgeGeom, edgeGlowMaterial));

    // Center dashed line
    const centerLineMaterial = new THREE.LineDashedMaterial({
      color: 0x334455,
      dashSize: 0.04,
      gapSize: 0.04,
      transparent: true,
      opacity: 0.5,
    });
    const centerGeom = new THREE.BufferGeometry().setFromPoints(smoothPoints);
    const centerLine = new THREE.Line(centerGeom, centerLineMaterial);
    centerLine.computeLineDistances();
    group.add(centerLine);

    // Start/finish marker
    const startPoint = smoothPoints[0];
    if (startPoint) {
      const markerGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.15, 8);
      const markerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 });
      const startMarker = new THREE.Mesh(markerGeom, markerMat);
      startMarker.position.set(startPoint.x, 0.075, startPoint.z);
      group.add(startMarker);

      // Checkered flag
      const flagGeom = new THREE.PlaneGeometry(0.12, 0.08);
      const flagCanvas = document.createElement("canvas");
      flagCanvas.width = 32;
      flagCanvas.height = 24;
      const fctx = flagCanvas.getContext("2d")!;
      const sz = 4;
      for (let fy = 0; fy < 24; fy += sz) {
        for (let fx = 0; fx < 32; fx += sz) {
          fctx.fillStyle = ((fx / sz + fy / sz) % 2 === 0) ? "#fff" : "#000";
          fctx.fillRect(fx, fy, sz, sz);
        }
      }
      const flagTex = new THREE.CanvasTexture(flagCanvas);
      const flagMat = new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide });
      const flagMesh = new THREE.Mesh(flagGeom, flagMat);
      flagMesh.position.set(startPoint.x, 0.2, startPoint.z);
      flagMesh.rotation.y = Math.PI / 4;
      group.add(flagMesh);
    }

    // Sector boundary markers
    const sectorBoundaries = [
      Math.floor(smoothPoints.length * 0.33),
      Math.floor(smoothPoints.length * 0.66),
    ];
    for (const idx of sectorBoundaries) {
      const p = smoothPoints[idx];
      if (!p) continue;
      const poleGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.2, 6);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 });
      const pole = new THREE.Mesh(poleGeom, poleMat);
      pole.position.set(p.x, 0.1, p.z);
      group.add(pole);
    }

    scene.add(group);
    trackMeshRef.current = group;
  }, [model?.pathPoints]);

  // Render loop
  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    const draw = () => {
      const { model: currentModel, nextModel: upcomingModel, interpolation: progress, selectedDriver: selected } = latestRef.current;
      const states = driverStatesRef.current;
      const meshes = driverMeshesRef.current;

      // Update camera from orbital params
      const { theta, phi, distance } = cameraAngle.current;
      camera.position.set(
        distance * Math.sin(phi) * Math.cos(theta),
        distance * Math.cos(phi),
        distance * Math.sin(phi) * Math.sin(theta),
      );
      camera.lookAt(0, 0, 0);

      if (currentModel?.pathPoints?.length) {
        const pathBounds = getPathBounds(currentModel.pathPoints);
        const nextMarkerMap = new Map(
          (upcomingModel?.markers ?? []).map((m) => [m.racingNumber, m]),
        );
        const progressVal = clamp(progress, 0, 1);

        // Update driver states
        const activeNumbers = new Set<string>();
        for (const marker of currentModel.markers) {
          const pos = markerTo3D(marker, pathBounds);
          if (!pos) continue;
          activeNumbers.add(marker.racingNumber);

          const nextMarker = nextMarkerMap.get(marker.racingNumber);
          const nextPos = nextMarker ? markerTo3D(nextMarker, pathBounds) : null;
          const targetX = nextPos ? lerp(pos.x, nextPos.x, progressVal) : pos.x;
          const targetY = nextPos ? lerp(pos.y, nextPos.y, progressVal) : pos.y;
          const targetZ = nextPos ? lerp(pos.z, nextPos.z, progressVal) : pos.z;

          const existing = states.get(marker.racingNumber);
          if (existing) {
            existing.x = lerp(existing.x, targetX, 0.25);
            existing.y = lerp(existing.y, targetY, 0.25);
            existing.z = lerp(existing.z, targetZ, 0.25);
            existing.targetX = targetX;
            existing.targetY = targetY;
            existing.targetZ = targetZ;
            existing.marker = marker;
          } else {
            states.set(marker.racingNumber, {
              x: targetX, y: targetY, z: targetZ,
              targetX, targetY, targetZ,
              marker,
            });
          }
        }

        // Remove stale
        for (const [key] of states) {
          if (!activeNumbers.has(key)) {
            states.delete(key);
            const mesh = meshes.get(key);
            if (mesh) {
              scene.remove(mesh.sphere);
              scene.remove(mesh.label);
              scene.remove(mesh.outline);
              mesh.sphere.geometry.dispose();
              (mesh.sphere.material as THREE.Material).dispose();
              mesh.label.material.dispose();
              mesh.outline.geometry.dispose();
              (mesh.outline.material as THREE.Material).dispose();
              meshes.delete(key);
            }
          }
        }

        // Update/create driver meshes
        for (const [racingNumber, state] of states) {
          const isSelected = racingNumber === selected;
          const radius = DRIVER_SPHERE_RADIUS;
          const teamColor = parseInt(state.marker.teamColor, 16);

          let entry = meshes.get(racingNumber);
          if (!entry) {
            // Sphere
            const sphereGeom = new THREE.SphereGeometry(radius, 16, 12);
            const sphereMat = new THREE.MeshStandardMaterial({
              color: teamColor,
              emissive: teamColor,
              emissiveIntensity: 0.4,
              roughness: 0.3,
              metalness: 0.6,
            });
            const sphere = new THREE.Mesh(sphereGeom, sphereMat);
            sphere.castShadow = true;
            scene.add(sphere);

            // Label sprite
            const canvas = document.createElement("canvas");
            canvas.width = 128;
            canvas.height = 48;
            const ctx = canvas.getContext("2d")!;
            ctx.clearRect(0, 0, 128, 48);
            ctx.fillStyle = "rgba(0,0,0,0.65)";
            ctx.roundRect(4, 4, 120, 40, 6);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 22px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(state.marker.shortCode ?? racingNumber, 64, 32);
            const texture = new THREE.CanvasTexture(canvas);
            texture.minFilter = THREE.LinearFilter;
            const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.scale.set(0.35, 0.13, 1);
            scene.add(sprite);

            // Selection outline
            const outlineGeom = new THREE.RingGeometry(radius + 0.04, radius + 0.07, 24);
            const outlineMat = new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0, side: THREE.DoubleSide });
            const outline = new THREE.Mesh(outlineGeom, outlineMat);
            outline.rotation.x = -Math.PI / 2;
            scene.add(outline);

            entry = { sphere, label: sprite, outline };
            meshes.set(racingNumber, entry);
          }

          // Update positions
          entry.sphere.position.set(state.x, state.y, state.z);
          entry.label.position.set(state.x, state.y + radius + 0.14, state.z);
          entry.outline.position.set(state.x, state.y - radius + 0.01, state.z);

          // Selection highlight
          const outlineMat = entry.outline.material as THREE.MeshBasicMaterial;
          outlineMat.opacity = isSelected ? 0.8 : 0;

          // Scale pulse for selected
          const scaleTarget = isSelected ? 1.3 : 1;
          const currentScale = entry.sphere.scale.x;
          const newScale = lerp(currentScale, scaleTarget, 0.15);
          entry.sphere.scale.setScalar(newScale);
        }
      }

      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  // Mouse controls (orbit)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    cameraAngle.current.theta -= dx * 0.005;
    cameraAngle.current.phi = clamp(cameraAngle.current.phi - dy * 0.005, 0.15, Math.PI / 2 - 0.05);
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.08 : 0.92;
      cameraAngle.current.distance = clamp(cameraAngle.current.distance * factor, 1.2, 12);
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);

  // Click to select driver
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!onSelectDriver || !rendererRef.current || !cameraRef.current || !sceneRef.current) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const spheres: THREE.Object3D[] = [];
    for (const [, entry] of driverMeshesRef.current) {
      spheres.push(entry.sphere);
    }
    const intersects = raycaster.intersectObjects(spheres);
    if (intersects.length > 0) {
      for (const [racingNumber, entry] of driverMeshesRef.current) {
        if (entry.sphere === intersects[0]!.object) {
          onSelectDriver(selectedDriver === racingNumber ? null : racingNumber);
          return;
        }
      }
    }
    onSelectDriver(null);
  }, [onSelectDriver, selectedDriver]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
    />
  );
}
