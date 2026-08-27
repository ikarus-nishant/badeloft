import { Environment, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, SSAO } from "@react-three/postprocessing";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box3, BoxGeometry, type BufferGeometry, Mesh, MeshStandardMaterial, type Object3D, Vector3 } from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import type { SinkConfiguration } from "../types/configurator";
import { mergedDimensions } from "../utils/calculations";

type BowlFinish = "glossy" | "matte";
type DrainFinish = "chrome" | "black" | "brushed-nickel" | "glossy-white" | "matte-white";

interface SinkAppearance {
  bowlColor: string;
  bowlFinish: BowlFinish;
  drainFinish: DrainFinish;
}

interface Dimension3DPreviewProps {
  bowlColor?: string;
  bowlFinish?: BowlFinish;
  config: SinkConfiguration;
  drainFinish?: DrainFinish;
  showDimensions?: boolean;
}

interface LightSettings {
  ambientIntensity: number;
  keyIntensity: number;
  keyX: number;
  keyY: number;
  keyZ: number;
  ssaoBias: number;
  ssaoIntensity: number;
  ssaoLuminanceInfluence: number;
  ssaoRadius: number;
  ssaoSamples: number;
  shadowBias: number;
  shadowCameraSize: number;
  shadowMapSize: number;
  shadowNormalBias: number;
  shadowOpacity: number;
  shadowRadius: number;
}

type LightSettingKey = keyof LightSettings;

interface SinkModelProps {
  appearance: SinkAppearance;
  config: SinkConfiguration;
  showDimensions: boolean;
}

interface BasinModelProps extends SinkAppearance {
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
  bowlColor: string;
  bowlFinish: BowlFinish;
}

const unit = 180;

const defaultLightSettings: LightSettings = {
  ambientIntensity: 0.6,
  keyIntensity: 1,
  keyX: -7,
  keyY: 9,
  keyZ: -1,
  ssaoBias: 0.025,
  ssaoIntensity: 1.2,
  ssaoLuminanceInfluence: 0.7,
  ssaoRadius: 0.18,
  ssaoSamples: 18,
  shadowBias: -0.000039,
  shadowCameraSize: 8,
  shadowMapSize: 1024,
  shadowNormalBias: 0.001,
  shadowOpacity: 0.29,
  shadowRadius: 4.3,
};

const drainMaterials: Record<DrainFinish, { color: string; metalness: number; roughness: number }> = {
  chrome: { color: "#d9dde0", metalness: 0.92, roughness: 0.14 },
  black: { color: "#171717", metalness: 0.55, roughness: 0.3 },
  "brushed-nickel": { color: "#b8b4aa", metalness: 0.82, roughness: 0.42 },
  "glossy-white": { color: "#f5f5f2", metalness: 0.08, roughness: 0.12 },
  "matte-white": { color: "#e8e6e1", metalness: 0.04, roughness: 0.76 },
};

const countertopMaterial = {
  color: "#050505",
  metalness: 0.08,
  roughness: 0.42,
};

function toScene(value: number) {
  return value / unit;
}

function findModelPart(object: Object3D): "connector" | "drain_cap" | "sink" | undefined {
  let current: Object3D | null = object;

  while (current) {
    const name = current.name.trim().toLowerCase();
    if (name === "connector" || name === "drain_cap" || name === "sink") return name;
    current = current.parent;
  }

  return undefined;
}

const bowlModelUrls: Record<string, string> = {
  "UB-01": "/models/UB-01.glb",
  "UB-02": "/models/UB-02.glb",
  "UB-03": "/models/UB-03.glb",
  "UB-04-M": "/models/UB-04-M.glb",
  "UB-04-L": "/models/UB-04-L.glb",
  "UB-04-RL": "/models/UB-04-RL.glb",
  "UB-04-LR": "/models/UB-04-LR.glb",
  "UB-04-32": "/models/UB-04-32.glb",
  "UB-04-40": "/models/UB-04-40.glb",
  "UB-04-XL": "/models/UB-04-XL.glb",
  "UB-04-XXL": "/models/UB-04-XxL.glb",
  "UB-05-M": "/models/UB-05-M.glb",
  "UB-05-L": "/models/UB-05-L.glb",
  "UB-05-XL": "/models/UB-05-XL.glb",
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
  const { bowlColor, bowlFinish } = props;
  const surfaceRoughness = bowlFinish === "matte" ? 0.72 : 0.2;

  return (
    <>
      <mesh castShadow geometry={geometries.base} receiveShadow>
        <meshStandardMaterial color={bowlColor} roughness={surfaceRoughness} metalness={0.04} />
      </mesh>
      <mesh geometry={geometries.cap} receiveShadow>
        <meshStandardMaterial color={bowlColor} roughness={surfaceRoughness} metalness={0.04} />
      </mesh>
    </>
  );
}

function GLBBasinModel({ bowlColor, bowlFinish, depth, drainFinish, modelUrl, sinkHeight, width, x, z }: Required<BasinModelProps>) {
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

      if (child instanceof Mesh) {
        const modelPart = findModelPart(child);
        const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
        const materials = sourceMaterials.map((sourceMaterial) => {
          const material = sourceMaterial instanceof MeshStandardMaterial
            ? sourceMaterial.clone()
            : new MeshStandardMaterial();

          if (modelPart === "sink") {
            material.color.set(bowlColor);
            material.metalness = 0.04;
            material.roughness = bowlFinish === "matte" ? 0.72 : 0.2;
          } else if (modelPart === "drain_cap") {
            const drainMaterial = drainMaterials[drainFinish];
            material.color.set(drainMaterial.color);
            material.metalness = drainMaterial.metalness;
            material.roughness = drainMaterial.roughness;
          } else if (modelPart === "connector") {
            material.color.set(bowlColor);
            material.metalness = 0.04;
            material.roughness = bowlFinish === "matte" ? 0.72 : 0.2;
          }

          return material;
        });
        child.material = Array.isArray(child.material) ? materials : materials[0];
      }
    });

    return clone;
  }, [bowlColor, bowlFinish, depth, drainFinish, scene, width]);

  useEffect(() => {
    return () => {
      object.traverse((child) => {
        if (child instanceof Mesh) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => material.dispose());
        }
      });
    };
  }, [object]);

  return (
    <group position={[x, sinkHeight + 0.045, z]}>
      <primitive object={object} />
    </group>
  );
}

function BasinModel({ bowlColor, bowlFinish, depth, drainFinish, modelUrl, sinkHeight, width, x, z }: BasinModelProps) {
  if (modelUrl) {
    return <GLBBasinModel bowlColor={bowlColor} bowlFinish={bowlFinish} depth={depth} drainFinish={drainFinish} modelUrl={modelUrl} sinkHeight={sinkHeight} width={width} x={x} z={z} />;
  }

  const rim = 0.09;
  const lipHeight = 0.045;
  const cavityHeight = Math.max(0.16, sinkHeight * 0.72);
  const innerWidth = Math.max(0.3, width - rim * 2);
  const innerDepth = Math.max(0.3, depth - rim * 2);
  const wallY = sinkHeight + lipHeight / 2 + 0.015;
  const cavityY = sinkHeight - cavityHeight / 2 + 0.035;
  const surfaceRoughness = bowlFinish === "matte" ? 0.72 : 0.2;

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, wallY, -depth / 2 + rim / 2]} castShadow receiveShadow>
        <boxGeometry args={[width, lipHeight, rim]} />
        <meshStandardMaterial color={bowlColor} roughness={surfaceRoughness} metalness={0.04} />
      </mesh>
      <mesh position={[0, wallY, depth / 2 - rim / 2]} castShadow receiveShadow>
        <boxGeometry args={[width, lipHeight, rim]} />
        <meshStandardMaterial color={bowlColor} roughness={surfaceRoughness} metalness={0.04} />
      </mesh>
      <mesh position={[-width / 2 + rim / 2, wallY, 0]} castShadow receiveShadow>
        <boxGeometry args={[rim, lipHeight, depth]} />
        <meshStandardMaterial color={bowlColor} roughness={surfaceRoughness} metalness={0.04} />
      </mesh>
      <mesh position={[width / 2 - rim / 2, wallY, 0]} castShadow receiveShadow>
        <boxGeometry args={[rim, lipHeight, depth]} />
        <meshStandardMaterial color={bowlColor} roughness={surfaceRoughness} metalness={0.04} />
      </mesh>
      <mesh position={[0, cavityY, 0]} receiveShadow>
        <boxGeometry args={[innerWidth, cavityHeight, innerDepth]} />
        <meshStandardMaterial color={bowlColor} roughness={surfaceRoughness} metalness={0.04} />
      </mesh>
      <mesh position={[0, sinkHeight + 0.054, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[innerWidth * 0.88, innerDepth * 0.88]} />
        <meshStandardMaterial color={bowlColor} roughness={surfaceRoughness} metalness={0.04} />
      </mesh>

    </group>
  );
}

function Line({ start, end, color = "#1a1a1a" }: { start: [number, number, number]; end: [number, number, number]; color?: string }) {
  const points = useMemo(() => [new Vector3(...start), new Vector3(...end)], [start, end]);
  const geoRef = useRef<BufferGeometry>(null);

  useEffect(() => {
    if (geoRef.current) {
      geoRef.current.setFromPoints(points);
    }
  }, [points]);

  return (
    <line>
      <bufferGeometry ref={geoRef} attach="geometry" />
      <lineBasicMaterial attach="material" color={color} linewidth={2} />
    </line>
  );
}

interface MeasurementsProps {
  show: boolean;
  config: SinkConfiguration;
}

function Measurements({ show, config }: MeasurementsProps) {
  if (!show) return null;

  const dims = mergedDimensions(config);
  const length = Number(dims.L || 1000);
  const depth = Number(dims.D || 500);
  const height = Number(dims.H || 150);

  const sceneLength = toScene(length);
  const sceneDepth = toScene(depth);
  const sceneHeight = Math.max(0.42, toScene(height));

  const lengthInches = (length / 25.4).toFixed(1);
  const depthInches = (depth / 25.4).toFixed(1);
  const heightInches = (height / 25.4).toFixed(1);

  const color = "#636363"; // Elegant slate gray for measurement lines

  return (
    <group>
      {/* 1. Width (Length) Measurements */}
      <group>
        {/* Main Line */}
        <Line start={[-sceneLength / 2, -0.05, sceneDepth / 2 + 0.2]} end={[sceneLength / 2, -0.05, sceneDepth / 2 + 0.2]} color={color} />
        {/* Left Tick */}
        <Line start={[-sceneLength / 2, -0.05, sceneDepth / 2 + 0.2 - 0.07]} end={[-sceneLength / 2, -0.05, sceneDepth / 2 + 0.2 + 0.07]} color={color} />
        {/* Right Tick */}
        <Line start={[sceneLength / 2, -0.05, sceneDepth / 2 + 0.2 - 0.07]} end={[sceneLength / 2, -0.05, sceneDepth / 2 + 0.2 + 0.07]} color={color} />
        {/* Label */}
        <Html position={[0, -0.05, sceneDepth / 2 + 0.2]} center>
          <div className="measurement-label">{lengthInches} in</div>
        </Html>
      </group>

      {/* 2. Depth Measurements */}
      <group>
        {/* Main Line */}
        <Line start={[sceneLength / 2 + 0.2, -0.05, -sceneDepth / 2]} end={[sceneLength / 2 + 0.2, -0.05, sceneDepth / 2]} color={color} />
        {/* Back Tick */}
        <Line start={[sceneLength / 2 + 0.12, -0.05, -sceneDepth / 2]} end={[sceneLength / 2 + 0.28, -0.05, -sceneDepth / 2]} color={color} />
        {/* Front Tick */}
        <Line start={[sceneLength / 2 + 0.12, -0.05, sceneDepth / 2]} end={[sceneLength / 2 + 0.28, -0.05, sceneDepth / 2]} color={color} />
        {/* Label */}
        <Html position={[sceneLength / 2 + 0.2, -0.05, 0]} center>
          <div className="measurement-label">{depthInches} in</div>
        </Html>
      </group>

      {/* 3. Height Measurements */}
      <group>
        {/* Main Line */}
        <Line start={[sceneLength / 2 + 0.2, 0, -sceneDepth / 2]} end={[sceneLength / 2 + 0.2, sceneHeight, -sceneDepth / 2]} color={color} />
        {/* Bottom Tick */}
        <Line start={[sceneLength / 2 + 0.12, 0, -sceneDepth / 2]} end={[sceneLength / 2 + 0.28, 0, -sceneDepth / 2]} color={color} />
        {/* Top Tick */}
        <Line start={[sceneLength / 2 + 0.12, sceneHeight, -sceneDepth / 2]} end={[sceneLength / 2 + 0.28, sceneHeight, -sceneDepth / 2]} color={color} />
        {/* Label */}
        <Html position={[sceneLength / 2 + 0.2, sceneHeight / 2, -sceneDepth / 2]} center>
          <div className="measurement-label">{heightInches} in</div>
        </Html>
      </group>
    </group>
  );
}

function SinkModel({ appearance, config, showDimensions }: SinkModelProps) {
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
  const sceneInternalGap = count > 1 ? toScene(Number(dims.bowlSpacing || 0)) : 0;
  const modelUrl = config.bowl?.id ? bowlModelUrls[config.bowl.id] : undefined;

  const bowls = Array.from({ length: count }, (_, index) => ({
    x: -sceneLength / 2 + sceneLeftInset + sceneBowlLength / 2 + index * (sceneBowlLength + sceneInternalGap),
    z: -sceneDepth / 2 + sceneTopInset + sceneBowlDepth / 2,
  }));

  return (
    <group rotation={[0, -0.18, 0]}>
      <CountertopModel
        bowlColor={appearance.bowlColor}
        bowlFinish={appearance.bowlFinish}
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
          bowlColor={appearance.bowlColor}
          bowlFinish={appearance.bowlFinish}
          depth={sceneBowlDepth}
          drainFinish={appearance.drainFinish}
          key={index}
          modelUrl={modelUrl}
          sinkHeight={sceneHeight}
          width={sceneBowlLength}
          x={bowl.x}
          z={bowl.z}
        />
      ))}
      <Measurements show={showDimensions} config={config} />
    </group>
  );
}

useGLTF.preload("/models/UB-01.glb");

interface LightControlProps {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}

function LightControl({ label, max, min, onChange, step, value }: LightControlProps) {
  return (
    <label className="light-debug-control">
      <span>{label}</span>
      <div>
        <input max={max} min={min} onChange={(event) => onChange(event.currentTarget.valueAsNumber)} step={step} type="range" value={value} />
        <input
          aria-label={`${label} value`}
          max={max}
          min={min}
          onChange={(event) => {
            const nextValue = event.currentTarget.valueAsNumber;
            if (Number.isFinite(nextValue)) onChange(nextValue);
          }}
          step={step}
          type="number"
          value={value}
        />
      </div>
    </label>
  );
}

export function Dimension3DPreview({ bowlColor = "#f7f7f5", bowlFinish = "glossy", config, drainFinish = "chrome", showDimensions }: Dimension3DPreviewProps) {
  const dims = mergedDimensions(config);
  const length = Number(dims.L || 1000);
  const depth = Number(dims.D || 500);
  const height = Number(dims.H || 150);
  const [debugOpen, setDebugOpen] = useState(false);
  const [lightSettings, setLightSettings] = useState<LightSettings>({ ...defaultLightSettings });

  const updateLightSetting = (key: LightSettingKey, value: number) => {
    setLightSettings((previous) => ({ ...previous, [key]: value }));
  };

  const maxZoomDistance = Math.max(11, toScene(length) * 2.2);

  return (
    <section className="preview-3d" aria-label="3D sink visualization">
      <div className="preview-3d-header">
        <span>3D View</span>
        <strong>{length} x {depth} x {height} mm</strong>
      </div>
      <div className="sink-viewport r3f-viewport">
        {/* slider button */}
        {/* <button
          aria-expanded={debugOpen}
          aria-label="Open light settings"
          className="light-debug-toggle"
          onClick={() => setDebugOpen((open) => !open)}
          title="Light settings"
          type="button"
        >
          <SlidersHorizontal aria-hidden="true" size={20} />
        </button> */}
        {debugOpen && (
          <aside className="light-debug-panel" aria-label="Light settings">
            <header>
              <strong>Light Debug</strong>
              <div>
                <button
                  aria-label="Reset light settings"
                  onClick={() => setLightSettings({ ...defaultLightSettings })}
                  title="Reset"
                  type="button"
                >
                  <RotateCcw aria-hidden="true" size={17} />
                </button>
                <button aria-label="Close light settings" onClick={() => setDebugOpen(false)} title="Close" type="button">
                  <X aria-hidden="true" size={18} />
                </button>
              </div>
            </header>
            <LightControl label="Ambient" max={3} min={0} onChange={(value) => updateLightSetting("ambientIntensity", value)} step={0.05} value={lightSettings.ambientIntensity} />
            <LightControl label="Key intensity" max={6} min={0} onChange={(value) => updateLightSetting("keyIntensity", value)} step={0.1} value={lightSettings.keyIntensity} />
            <LightControl label="Key X" max={10} min={-10} onChange={(value) => updateLightSetting("keyX", value)} step={0.1} value={lightSettings.keyX} />
            <LightControl label="Key Y" max={15} min={0} onChange={(value) => updateLightSetting("keyY", value)} step={0.1} value={lightSettings.keyY} />
            <LightControl label="Key Z" max={10} min={-10} onChange={(value) => updateLightSetting("keyZ", value)} step={0.1} value={lightSettings.keyZ} />
            <div className="light-debug-section-title">Shadow Settings</div>
            <LightControl label="Opacity" max={0.5} min={0} onChange={(value) => updateLightSetting("shadowOpacity", value)} step={0.01} value={lightSettings.shadowOpacity} />
            <LightControl label="Bias" max={0.0005} min={-0.0005} onChange={(value) => updateLightSetting("shadowBias", value)} step={0.000001} value={lightSettings.shadowBias} />
            <LightControl label="Normal bias" max={0.001} min={0} onChange={(value) => updateLightSetting("shadowNormalBias", value)} step={0.000001} value={lightSettings.shadowNormalBias} />
            <LightControl label="Blur radius" max={10} min={0} onChange={(value) => updateLightSetting("shadowRadius", value)} step={0.1} value={lightSettings.shadowRadius} />
            <LightControl label="Camera size" max={20} min={2} onChange={(value) => updateLightSetting("shadowCameraSize", value)} step={0.5} value={lightSettings.shadowCameraSize} />
            <label className="light-debug-select">
              <span>Map resolution</span>
              <select value={lightSettings.shadowMapSize} onChange={(event) => updateLightSetting("shadowMapSize", Number(event.currentTarget.value))}>
                <option value={512}>512 px</option>
                <option value={1024}>1024 px</option>
                <option value={2048}>2048 px</option>
                <option value={4096}>4096 px</option>
              </select>
            </label>
            <div className="light-debug-section-title">SSAO Settings</div>
            <LightControl label="Intensity" max={5} min={0} onChange={(value) => updateLightSetting("ssaoIntensity", value)} step={0.05} value={lightSettings.ssaoIntensity} />
            <LightControl label="Radius" max={1} min={0.001} onChange={(value) => updateLightSetting("ssaoRadius", value)} step={0.001} value={lightSettings.ssaoRadius} />
            <LightControl label="Bias" max={0.1} min={0} onChange={(value) => updateLightSetting("ssaoBias", value)} step={0.001} value={lightSettings.ssaoBias} />
            <LightControl label="Luminance" max={1} min={0} onChange={(value) => updateLightSetting("ssaoLuminanceInfluence", value)} step={0.01} value={lightSettings.ssaoLuminanceInfluence} />
            <label className="light-debug-select">
              <span>Samples</span>
              <select value={lightSettings.ssaoSamples} onChange={(event) => updateLightSetting("ssaoSamples", Number(event.currentTarget.value))}>
                <option value={9}>9</option>
                <option value={18}>18</option>
                <option value={30}>30</option>
                <option value={46}>46</option>
              </select>
            </label>
          </aside>
        )}
        <Canvas camera={{ position: [4.7, 4.1, 5.4], fov: 38 }} shadows>
          <ambientLight intensity={lightSettings.ambientIntensity} />
          {(() => {
            const sceneLength = toScene(length);
            const cameraSize = Math.max(lightSettings.shadowCameraSize, sceneLength * 1.25);
            return (
              <>
                <directionalLight
                  castShadow
                  intensity={lightSettings.keyIntensity}
                  position={[lightSettings.keyX, lightSettings.keyY, lightSettings.keyZ]}
                  shadow-bias={lightSettings.shadowBias}
                  shadow-camera-bottom={-cameraSize}
                  shadow-camera-left={-cameraSize}
                  shadow-camera-right={cameraSize}
                  shadow-camera-top={cameraSize}
                  shadow-intensity={lightSettings.shadowOpacity}
                  shadow-mapSize={[lightSettings.shadowMapSize, lightSettings.shadowMapSize]}
                  shadow-normalBias={lightSettings.shadowNormalBias}
                  shadow-radius={lightSettings.shadowRadius}
                />
                <SinkModel appearance={{ bowlColor, bowlFinish, drainFinish }} config={config} showDimensions={!!showDimensions} />
                <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                  <planeGeometry args={[Math.max(20, sceneLength * 2.5), 15]} />
                  <shadowMaterial opacity={1} />
                </mesh>
              </>
            );
          })()}
          <Environment files="/environment/alte_veste_station_2k.hdr" environmentIntensity={0.4} />
          <EffectComposer enableNormalPass multisampling={0}>
            <SSAO
              bias={lightSettings.ssaoBias}
              intensity={lightSettings.ssaoIntensity}
              luminanceInfluence={lightSettings.ssaoLuminanceInfluence}
              radius={lightSettings.ssaoRadius}
              rings={4}
              samples={lightSettings.ssaoSamples}
            />
          </EffectComposer>
          <OrbitControls enableDamping enablePan={false} makeDefault maxDistance={maxZoomDistance} minDistance={3} target={[0, 0.45, 0]} />
        </Canvas>
      </div>
    </section>
  );
}
