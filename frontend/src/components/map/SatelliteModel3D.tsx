'use client';

import { useEffect, useRef } from 'react';

export default function SatelliteModel3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<unknown>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    (async () => {
      const THREE = await import('three');
      const { GLTFLoader } = await import(
        'three/examples/jsm/loaders/GLTFLoader.js'
      );

      if (cancelled) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      camera.position.set(0, 0.5, 2.5);
      camera.lookAt(0, 0, 0);

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
      });
      renderer.setSize(150, 150);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Lighting
      const ambient = new THREE.AmbientLight(0x404060, 2);
      scene.add(ambient);

      const key = new THREE.DirectionalLight(0xffffff, 3);
      key.position.set(5, 3, 5);
      scene.add(key);

      const fill = new THREE.DirectionalLight(0x4488ff, 1);
      fill.position.set(-3, 1, -3);
      scene.add(fill);

      const rim = new THREE.DirectionalLight(0x00ccff, 1.5);
      rim.position.set(0, -2, -5);
      scene.add(rim);

      // Load model
      const loader = new GLTFLoader();
      let model: InstanceType<typeof THREE.Group> | null = null;

      loader.load('/satellite.glb', (gltf) => {
        if (cancelled) return;
        model = gltf.scene;

        // Apply metallic material
        model.traverse((child) => {
          if ((child as InstanceType<typeof THREE.Mesh>).isMesh) {
            const mesh = child as InstanceType<typeof THREE.Mesh>;
            mesh.material = new THREE.MeshStandardMaterial({
              color: 0x8899aa,
              metalness: 0.85,
              roughness: 0.25,
            });
          }
        });

        scene.add(model);
      });

      // Animate
      let rafId: number;
      const tick = () => {
        if (cancelled) return;
        if (model) {
          model.rotation.y += 0.002;
          model.rotation.x = Math.sin(performance.now() / 5000) * 0.05;
        }
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      const r = rendererRef.current as {
        dispose: () => void;
        domElement: HTMLCanvasElement;
      } | null;
      if (r) {
        r.dispose();
        if (r.domElement.parentElement)
          r.domElement.parentElement.removeChild(r.domElement);
        rendererRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none"
      style={{ width: 150, height: 150 }}
    />
  );
}
