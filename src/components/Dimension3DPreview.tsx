import { Environment, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { Box3, BoxGeometry, type BufferGeometry, type Object3D, Vector3 } from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import type { SinkConfiguration } from "../types/configurator";
import { mergedDimensions } from "../utils/calculations";

interface Dimension3DPreviewProps {
  config: SinkConfiguration;
}

interface SinkModelProps {
  config: SinkConfiguration;
}

interface BasinModelProps {
  x: number;
  z: number;
  width: number;
  depth: number;
  sinkHeight: number;
  modelUrl?: string;
}

interface BowlPlacement {
  x: number;
  z: number;
}

interface CountertopModelProps {
  bowls: BowlPlacement[];
  bowlDepth: number;
  bowlWidth: number;
  depth: number;
  height: number;
  length: number;
  modelUrl?: string;
}

const unit = 180;

function toScene(value: number) {
  return value / unit;
}

const bowlModelUrls: Record<string, string> = {
  "UB-04-M": "/models/UB-04-M.glb",
};

function cutGeometryWithBowls(baseGeometry: BoxGeometry, bowls: BowlPlacement[], bowlWidth: number, bowlDepth: number, height: number) {
  const evaluator = new Evaluator();
  evaluator.useGroups = false;

  let result = new Brush(baseGeometry);
  result.updateMatrixWorld();

  bowls.forEach((bowl) => {
    const cutter = new Brush(new BoxGeometry(bowlWidth, height * 2.4, bowlDepth));
    cutter.position.set(bowl.x, 0, bowl.z);
    cutter.updateMatrixWorld();
    result = evaluator.evaluate(result, cutter, SUBTRACTION) as Brush;
  });

  return result.geometry;
}

function getScaledModelFootprint(scene: Object3D, targetWidth: number, targetDepth: number) {
  const box = new Box3().setFromObject(scene);
  const size = new Vector3();
  box.getSize(size);

  const scale = Math.min(targetWidth / Math.max(size.x, 0.001), targetDepth / Math.max(size.z, 0.001));

  return {
    depth: size.z * scale,
    width: size.x * scale,
  };
}

function useCountertopGeometries({ bowls, bowlDepth, bowlWidth, depth, height, length, modelUrl }: CountertopModelProps) {
  const { scene } = useGLTF(modelUrl ?? bowlModelUrls["UB-04-M"]);
  const cutterFootprint = useMemo(() => {
    if (!modelUrl) {
      return {
        depth: bowlDepth,
        width: bowlWidth,
      };
    }

    return getScaledModelFootprint(scene, bowlWidth, bowlDepth);
  }, [bowlDepth, bowlWidth, modelUrl, scene]);

  return useMemo(() => {
    const baseGeometry = new BoxGeometry(length, height, depth);
    baseGeometry.translate(0, height / 2, 0);

    const capGeometry = new BoxGeometry(length + 0.04, 0.045, depth + 0.04);
    capGeometry.translate(0, height + 0.022, 0);

    return {
      base: cutGeometryWithBowls(baseGeometry, bowls, cutterFootprint.width, cutterFootprint.depth, height),
      cap: cutGeometryWithBowls(capGeometry, bowls, cutterFootprint.width, cutterFootprint.depth, height),
    } satisfies Record<"base" | "cap", BufferGeometry>;
  }, [bowls, cutterFootprint.depth, cutterFootprint.width, depth, height, length]);
}

function CountertopModel(props: CountertopModelProps) {
  const geometries = useCountertopGeometries(props);

  return (
    <>
      <mesh castShadow geometry={geometries.base} receiveShadow>
        <meshStandardMaterial color="#050505" roughness={0.42} metalness={0.08} />
      </mesh>
      <mesh geometry={geometries.cap} receiveShadow>
        <meshStandardMaterial color="#080808" roughness={0.38} metalness={0.08} />
      </mesh>
    </>
  );
}

function GLBBasinModel({ x, z, width, depth, sinkHeight, modelUrl }: Required<BasinModelProps>) {
  const { scene } = useGLTF(modelUrl);
  const object = useMemo(() => {
    const clone = scene.clone(true);
    const box = new Box3().setFromObject(clone);
    const size = new Vector3();
    const center = new Vector3();
    box.getSize(size);
    box.getCenter(center);

    clone.position.x -= center.x;
    clone.position.z -= center.z;
    const scale = Math.min(width / Math.max(size.x, 0.001), depth / Math.max(size.z, 0.001));
    clone.position.y -= box.max.y * scale;
    clone.scale.setScalar(scale);
    clone.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });

    return clone;
  }, [depth, scene, width]);

  return (
    <group position={[x, sinkHeight + 0.045, z]}>
      <primitive object={object} />
    </group>
  );
}

function BasinModel({ x, z, width, depth, sinkHeight, modelUrl }: BasinModelProps) {
  if (modelUrl) {
    return <GLBBasinModel depth={depth} modelUrl={modelUrl} sinkHeight={sinkHeight} width={width} x={x} z={z} />;
  }

  const rim = 0.09;
  const lipHeight = 0.045;
  const cavityHeight = Math.max(0.16, sinkHeight * 0.72);
  const innerWidth = Math.max(0.3, width - rim * 2);
  const innerDepth = Math.max(0.3, depth - rim * 2);
  const wallY = sinkHeight + lipHeight / 2 + 0.015;
  const cavityY = sinkHeight - cavityHeight / 2 + 0.035;

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, wallY, -depth / 2 + rim / 2]} castShadow receiveShadow>
        <boxGeometry args={[width, lipHeight, rim]} />
        <meshStandardMaterial color="#f4f1ec" roughness={0.35} metalness={0.05} />
      </mesh>
      <mesh position={[0, wallY, depth / 2 - rim / 2]} castShadow receiveShadow>
        <boxGeometry args={[width, lipHeight, rim]} />
        <meshStandardMaterial color="#f4f1ec" roughness={0.35} metalness={0.05} />
      </mesh>
      <mesh position={[-width / 2 + rim / 2, wallY, 0]} castShadow receiveShadow>
        <boxGeometry args={[rim, lipHeight, depth]} />
        <meshStandardMaterial color="#f4f1ec" roughness={0.35} metalness={0.05} />
      </mesh>
      <mesh position={[width / 2 - rim / 2, wallY, 0]} castShadow receiveShadow>
        <boxGeometry args={[rim, lipHeight, depth]} />
        <meshStandardMaterial color="#f4f1ec" roughness={0.35} metalness={0.05} />
      </mesh>
      <mesh position={[0, cavityY, 0]} receiveShadow>
        <boxGeometry args={[innerWidth, cavityHeight, innerDepth]} />
        <meshStandardMaterial color="#2d2c29" roughness={0.22} metalness={0.68} />
      </mesh>
      <mesh position={[0, sinkHeight + 0.054, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[innerWidth * 0.88, innerDepth * 0.88]} />
        <meshStandardMaterial color="#111111" roughness={0.18} metalness={0.75} />
      </mesh>
      <mesh position={[innerWidth * 0.28, sinkHeight + 0.062, innerDepth * 0.28]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, 0.035, 40]} />
        <meshStandardMaterial color="#e9e5dc" roughness={0.24} metalness={0.35} />
      </mesh>
    </group>
  );
}

function SinkModel({ config }: SinkModelProps) {
  const dims = mergedDimensions(config);
  const quantity = config.bowlQuantity ?? "single";
  const count = quantity === "triple" ? 3 : quantity === "double" ? 2 : 1;
  const length = Math.max(400, Number(dims.L || 1000));
  const depth = Math.max(300, Number(dims.D || 500));
  const height = Math.max(80, Number(dims.H || 150));
  const bowlLength = Math.max(240, Number(dims.L1 || 500));
  const bowlDepth = Math.max(220, Number(dims.D1 || 400));
  const leftInset = Math.max(0, Number(dims.L2 || 0));
  const rightInset = Math.max(0, Number(dims.L3 || 0));
  const topInset = Math.max(0, Number(dims.D2 || 0));

  const sceneLength = toScene(length);
  const sceneDepth = toScene(depth);
  const sceneHeight = Math.max(0.42, toScene(height));
  const sceneBowlLength = toScene(bowlLength);
  const sceneBowlDepth = toScene(bowlDepth);
  const sceneLeftInset = toScene(leftInset);
  const sceneRightInset = toScene(rightInset);
  const sceneTopInset = toScene(topInset);
  const sceneInternalGap = count > 1 ? Math.max(0, (sceneLength - sceneLeftInset - sceneRightInset - count * sceneBowlLength) / (count - 1)) : 0;
  const modelUrl = config.bowl?.id ? bowlModelUrls[config.bowl.id] : undefined;

  const bowls = Array.from({ length: count }, (_, index) => ({
    x: -sceneLength / 2 + sceneLeftInset + sceneBowlLength / 2 + index * (sceneBowlLength + sceneInternalGap),
    z: -sceneDepth / 2 + sceneTopInset + sceneBowlDepth / 2,
  }));

  return (
    <group rotation={[0, -0.18, 0]}>
      <CountertopModel
        bowlDepth={sceneBowlDepth}
        bowlWidth={sceneBowlLength}
        bowls={bowls}
        depth={sceneDepth}
        height={sceneHeight}
        length={sceneLength}
        modelUrl={modelUrl}
      />
      {bowls.map((bowl, index) => (
        <BasinModel
          depth={sceneBowlDepth}
          key={index}
          modelUrl={modelUrl}
          sinkHeight={sceneHeight}
          width={sceneBowlLength}
          x={bowl.x}
          z={bowl.z}
        />
      ))}
    </group>
  );
}

useGLTF.preload("/models/UB-04-M.glb");

export function Dimension3DPreview({ config }: Dimension3DPreviewProps) {
  const dims = mergedDimensions(config);
  const length = Number(dims.L || 1000);
  const depth = Number(dims.D || 500);
  const height = Number(dims.H || 150);

  return (
    <section className="preview-3d" aria-label="3D sink visualization">
      <div className="preview-3d-header">
        <span>3D View</span>
        <strong>{length} x {depth} x {height} mm</strong>
      </div>
      <div className="sink-viewport r3f-viewport">
        <Canvas camera={{ position: [4.7, 4.1, 5.4], fov: 38 }} shadows>
          <color attach="background" args={["#f1ede7"]} />
          <ambientLight intensity={0.8} />
          <directionalLight castShadow intensity={2.4} position={[4, 7, 5]} shadow-mapSize={[1024, 1024]} />
          <SinkModel config={config} />
          <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[12, 9]} />
            <shadowMaterial opacity={0.16} />
          </mesh>
          <Environment preset="apartment" />
          <OrbitControls enableDamping makeDefault maxDistance={11} minDistance={3} target={[0, 0.45, 0]} />
        </Canvas>
      </div>
    </section>
  );
}
