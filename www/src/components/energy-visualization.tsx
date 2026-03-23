import { useEffect, useRef } from "react";
import * as THREE from "three";
import { AsciiEffect } from "three/addons/effects/AsciiEffect.js";

export function EnergyVisualization() {
  const containerRef = useRef<HTMLDivElement>(null);
  const intensityRef = useRef(0.5);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    if (width === 0 || height === 0) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(70, width / height, 1, 1000);
    camera.position.set(0, 0, 300);

    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const effect = new AsciiEffect(renderer, " .:-+*=%@#", {
      invert: true,
      resolution: 0.15,
    });
    effect.setSize(width, height);
    effect.domElement.style.color = "#00bcff";
    effect.domElement.style.backgroundColor = "#0a0a0a";
    effect.domElement.style.letterSpacing = "2px";
    effect.domElement.style.lineHeight = "1";
    effect.domElement.style.fontSize = "14px";
    effect.domElement.style.fontFamily = "monospace";

    container.appendChild(effect.domElement);

    const wireGroup = new THREE.Group();
    scene.add(wireGroup);

    const wires: THREE.CatmullRomCurve3[] = [];
    const wireMeshes: THREE.Mesh[] = [];
    const originalPositions: Float32Array[] = [];

    for (let i = 0; i < 5; i++) {
      const yOffset = (i - 2) * 80;
      const points = [
        new THREE.Vector3(-400, yOffset + Math.random() * 20, 0),
        new THREE.Vector3(-300, yOffset + Math.random() * 30 - 15, 0),
        new THREE.Vector3(-200, yOffset + Math.random() * 20, 0),
        new THREE.Vector3(-100, yOffset + Math.random() * 40 - 20, 0),
        new THREE.Vector3(0, yOffset + Math.random() * 20, 0),
        new THREE.Vector3(100, yOffset + Math.random() * 40 - 20, 0),
        new THREE.Vector3(200, yOffset + Math.random() * 20, 0),
        new THREE.Vector3(300, yOffset + Math.random() * 30 - 15, 0),
        new THREE.Vector3(400, yOffset + Math.random() * 20, 0),
      ];

      const path = new THREE.CatmullRomCurve3(points);
      wires.push(path);

      const tubeGeometry = new THREE.TubeGeometry(path, 200, 3 + i * 0.5, 8, false);
      const originalPos = new Float32Array(tubeGeometry.attributes.position.array);
      originalPositions.push(originalPos);

      const wireMaterial = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x0ea5e9 : 0x06b6d4,
      });
      const wire = new THREE.Mesh(tubeGeometry, wireMaterial);
      wireGroup.add(wire);
      wireMeshes.push(wire);
    }

    const particleCount = 500;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const randoms = new Float32Array(particleCount);
    const wireIndices = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const wireIdx = Math.floor(Math.random() * wires.length);
      const t = Math.random();
      const point = wires[wireIdx].getPoint(t);
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y + (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = point.z + (Math.random() - 0.5) * 10;
      randoms[i] = Math.random();
      wireIndices[i] = wireIdx;
    }

    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));
    particleGeometry.setAttribute("aWireIdx", new THREE.BufferAttribute(wireIndices, 1));

    const particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.5 },
      },
      vertexShader: `
        attribute float aRandom;
        attribute float aWireIdx;
        uniform float uTime;
        uniform float uIntensity;

        void main() {
          float speed = 0.5 + uIntensity * 2.0;
          float t = fract(aRandom + uTime * speed * 0.1);

          int wireIdx = int(aWireIdx);
          vec3 pos = position;

          float jitter = sin(uTime * 20.0 + aRandom * 10.0) * uIntensity * 15.0;
          pos.y += jitter;
          pos.x += sin(uTime * 15.0 + aRandom * 8.0) * uIntensity * 10.0;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = (2.0 + uIntensity * 8.0) * (50.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uIntensity;

        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float alpha = (1.0 - dist * 2.0) * (0.3 + uIntensity * 0.7);
          vec3 color = mix(vec3(0.133, 0.827, 0.949), vec3(0.565, 0.910, 0.980), uIntensity);
          gl_FragColor = vec4(color * 2.0, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    const sphereGeometry = new THREE.SphereGeometry(50, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      wireframe: true,
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(0, 0, 50);
    scene.add(sphere);

    let animationId: number;
    const start = Date.now();

    animate();

    function animate() {
      const elapsed = (Date.now() - start) * 0.001;
      const t = elapsed;
      const intensity = intensityRef.current;

      particleMaterial.uniforms.uTime.value = t;
      particleMaterial.uniforms.uIntensity.value = intensity;

      wireMeshes.forEach((wire, idx) => {
        const positions = wire.geometry.attributes.position;
        const array = positions.array as Float32Array;
        const original = originalPositions[idx];

        for (let j = 0; j < array.length; j += 3) {
          const x = original[j];
          const baseY = original[j + 1];
          const baseZ = original[j + 2];

          const wave = Math.sin(x * 0.02 + t * (2 + intensity * 8)) * intensity * 20;
          array[j + 1] = baseY + wave;
          array[j + 2] = baseZ + Math.cos(x * 0.015 + t * (1 + intensity * 6)) * intensity * 10;
        }
        positions.needsUpdate = true;
      });

      sphere.position.y = Math.abs(Math.sin(t * 0.5)) * 50 + 50;
      sphere.rotation.x = t * 0.3;
      sphere.rotation.z = t * 0.2;

      const scale = 1 + intensity * 0.5 + Math.sin(t * 10) * 0.2 * intensity;
      sphere.scale.setScalar(scale);
      sphereMaterial.color.setHex(intensity > 0.7 ? 0x67e8f9 : 0x22d3ee);

      camera.position.x = Math.sin(t * 0.3) * intensity * 20;
      camera.position.y = Math.cos(t * 0.2) * intensity * 15;
      camera.lookAt(0, 0, 0);

      if (container.clientWidth > 0 && container.clientHeight > 0) {
        effect.render(scene, camera);
      }
      animationId = requestAnimationFrame(animate);
    }

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      effect.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);

      particleGeometry.dispose();
      particleMaterial.dispose();
      sphereGeometry.dispose();
      sphereMaterial.dispose();

      wireMeshes.forEach((mesh) => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });

      renderer.dispose();
      effect.domElement.remove();
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const normalized = 1 - y / rect.height;
    intensityRef.current = Math.max(0.1, Math.min(1, normalized));
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full cursor-crosshair overflow-hidden"
      onMouseMove={handleMouseMove}
    />
  );
}
