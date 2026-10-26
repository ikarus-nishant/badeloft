import { Environment, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { EffectComposer, SSAO } from "@react-three/postprocessing";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Box3, BoxGeometry, BufferGeometry, CylinderGeometry, DirectionalLight, Group, Line as ThreeLine, LineBasicMaterial, LineSegments, MathUtils, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type Object3D, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import type { SinkConfiguration } from "../types/configurator";
import { assetUrl, modelUrl as resolveModelUrl } from "../integrations/storefront";
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
  onArModelReady?: (model: Blob) => void;
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
  arModelRef: RefObject<Group | null>;
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
  showDimensions?: boolean;
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
  faucetHoles?: Array<{ x: number; z: number }>;
}

const unit = 180;
const countertopCapThickness = 0.045;
const connectorSeamOverlap = 1.5 / unit;

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

function toScene(value: number) {
  return value / unit;
}

type ModelPart = "connector" | "drain_cap" | "sink" | "dimension";

function isDimensionObject(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (current.name && current.name.toLowerCase().includes("dimension")) return true;
    if (current.userData && typeof current.userData === "object") {
      if (current.userData.name && String(current.userData.name).toLowerCase().includes("dimension")) return true;
    }
    current = current.parent;
  }
  if (object instanceof Mesh) {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material?.name && material.name.toLowerCase().includes("dimension")) return true;
    }
  }
  return false;
}

function modelPartFromName(name: string): ModelPart | undefined {
  const normalizedName = name.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/\.\d+$/, "");
  if (normalizedName.startsWith("dimension") || normalizedName.includes("dimension")) return "dimension";
  if (normalizedName.startsWith("connector") || normalizedName.startsWith("border")) return "connector";
  if (normalizedName.startsWith("drain_cap") || normalizedName.startsWith("draincap")) return "drain_cap";
  if (normalizedName.startsWith("sink") || normalizedName.startsWith("basin")) return "sink";
  return undefined;
}

function findModelPart(object: Object3D): ModelPart | undefined {
  if (isDimensionObject(object)) return "dimension";

  if (object instanceof Mesh) {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const materialPart = modelPartFromName(material.name);
      if (materialPart) return materialPart;
    }
  }

  let current: Object3D | null = object;

  while (current) {
    const nodePart = modelPartFromName(current.name);
    if (nodePart) return nodePart;
    current = current.parent;
  }

  if (object instanceof Mesh && object.geometry) {
    object.geometry.computeBoundingBox();
    const bounds = object.geometry.boundingBox;
    if (!bounds) return undefined;

    const size = new Vector3();
    bounds.getSize(size);
    const extents = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a, b) => a - b);

    // Recent exports use generic Maya names. Their connector is a flat,
    // full-footprint mesh while the basin has meaningful depth.
    if (extents[0] <= Math.max(extents[2] * 0.01, 0.00001)) return "connector";
    return "sink";
  }

  return undefined;
}

function conformConnectorNormals(mesh: Mesh) {
  const geometry = mesh.geometry.clone();
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) {
    geometry.dispose();
    return;
  }

  const size = new Vector3();
  bounds.getSize(size);
  const extents = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)];
  const largestExtent = Math.max(...extents);
  const thinAxis = extents.indexOf(Math.min(...extents));
  if (extents[thinAxis] > Math.max(largestExtent * 0.01, 0.00001)) {
    geometry.dispose();
    return;
  }

  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");
  const countertopNormal = new Vector3(0, 1, 0)
    .applyQuaternion(mesh.getWorldQuaternion(new Quaternion()).invert())
    .normalize();

  for (let index = 0; index < normals.count; index += 1) {
    normals.setXYZ(index, countertopNormal.x, countertopNormal.y, countertopNormal.z);
  }
  normals.needsUpdate = true;

  mesh.geometry = geometry;
  mesh.castShadow = false;
  mesh.userData.disposeGeometryOnUnmount = true;
}

function conformCountertopTopNormals(geometry: BufferGeometry) {
  const normals = geometry.getAttribute("normal");
  if (!normals) return geometry;

  for (let index = 0; index < normals.count; index += 1) {
    if (normals.getY(index) > 0.5) normals.setXYZ(index, 0, 1, 0);
  }
  normals.needsUpdate = true;
  return geometry;
}

const bowlModelUrls: Record<string, string> = {
  "UB-01": resolveModelUrl("UB-01.glb"),
  "UB-02": resolveModelUrl("UB-02.glb"),
  "UB-03": resolveModelUrl("UB-03.glb"),
  "UB-04-M": resolveModelUrl("UB-04-M.glb"),
  "UB-04-L": resolveModelUrl("UB-04-L.glb"),
  "UB-04-RL": resolveModelUrl("UB-04-RL.glb"),
  "UB-04-LR": resolveModelUrl("UB-04-LR.glb"),
  "UB-04-32": resolveModelUrl("UB-04-32.glb"),
  "UB-04-40": resolveModelUrl("UB-04-40.glb"),
  "UB-04-XL": resolveModelUrl("UB-04-XL.glb"),
  "UB-04-XXL": resolveModelUrl("UB-04-XxL.glb"),
  "UB-05-M": resolveModelUrl("UB-05-M.glb"),
  "UB-05-L": resolveModelUrl("UB-05-L.glb"),
  "UB-05-XL": resolveModelUrl("UB-05-XL.glb"),
  "SR-14": resolveModelUrl("SR-14.glb"),
  "SR-15": resolveModelUrl("SR-15.glb"),
  "SR-18": resolveModelUrl("SR-18.glb"),
  "SR-19": resolveModelUrl("SR-19.glb"),
};

function cutGeometryWithBowls(
  baseGeometry: BoxGeometry,
  bowls: BowlPlacement[],
  bowlWidth: number,
  bowlDepth: number,
  height: number
) {
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

interface DimensionNodeBox {
  dimBox: Box3;
  size: Vector3;
  center: Vector3;
}

function getDimensionNodeBox(scene: Object3D): DimensionNodeBox | null {
  let dimensionMesh: Mesh | null = null;
  scene.traverse((child: Object3D) => {
    if (!dimensionMesh && child instanceof Mesh && isDimensionObject(child)) {
      dimensionMesh = child;
    }
  });

  const targetMesh = dimensionMesh as Mesh | null;
  if (!targetMesh || !targetMesh.geometry) return null;

  const posAttr = targetMesh.geometry.attributes.position;
  if (!posAttr) return null;

  scene.updateMatrixWorld(true);

  const dimBox = new Box3();
  const meshToSceneMatrix = new Matrix4();
  meshToSceneMatrix.copy(scene.matrixWorld).invert().multiply(targetMesh.matrixWorld);

  const tempV = new Vector3();
  for (let i = 0; i < posAttr.count; i++) {
    tempV.fromBufferAttribute(posAttr, i);
    tempV.applyMatrix4(meshToSceneMatrix);
    dimBox.expandByPoint(tempV);
  }

  const size = new Vector3();
  const center = new Vector3();
  dimBox.getSize(size);
  dimBox.getCenter(center);

  return { dimBox, size, center };
}

function getScaledModelFootprint(scene: Object3D, targetWidth: number, targetDepth: number) {
  const box = new Box3().setFromObject(scene);
  const size = new Vector3();
  box.getSize(size);

  const dimInfo = getDimensionNodeBox(scene);
  const scale = dimInfo
    ? Math.min(targetWidth / Math.max(dimInfo.size.x, 0.001), targetDepth / Math.max(dimInfo.size.z, 0.001))
    : Math.min(targetWidth / Math.max(size.x, 0.001), targetDepth / Math.max(size.z, 0.001));

  return {
    depth: (dimInfo ? dimInfo.size.z : size.z) * scale,
    width: (dimInfo ? dimInfo.size.x : size.x) * scale,
  };
}

function getDimensionNodeMeasurements(
  scene: Object3D,
  targetWidth: number,
  targetDepth: number
) {
  const dimInfo = getDimensionNodeBox(scene);
  if (!dimInfo) return null;

  const scale = Math.min(
    targetWidth / Math.max(dimInfo.size.x, 0.001),
    targetDepth / Math.max(dimInfo.size.z, 0.001)
  );

  const sceneLength = dimInfo.size.x * scale;
  const sceneDepth = dimInfo.size.z * scale;
  const lengthMm = Math.round(sceneLength * unit);
  const depthMm = Math.round(sceneDepth * unit);

  return {
    sceneLength,
    sceneDepth,
    lengthMm,
    depthMm,
    lengthInches: (lengthMm / 25.4).toFixed(2),
    depthInches: (depthMm / 25.4).toFixed(2),
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
    const totalHeight = height + countertopCapThickness;
    const baseGeometry = new BoxGeometry(length, totalHeight, depth);
    baseGeometry.translate(0, totalHeight / 2, 0);

    return {
      base: conformCountertopTopNormals(
        cutGeometryWithBowls(
          baseGeometry,
          bowls,
          Math.max(0.001, cutterFootprint.width - connectorSeamOverlap * 2),
          Math.max(0.001, cutterFootprint.depth - connectorSeamOverlap * 2),
          totalHeight
        ),
      ),
    };
  }, [bowls, cutterFootprint.depth, cutterFootprint.width, depth, height, length]);
}

function CountertopModel(props: CountertopModelProps) {
  const geometries = useCountertopGeometries(props);
  const { bowlColor, bowlFinish, faucetHoles = [], height } = props;
  const surfaceRoughness = bowlFinish === "matte" ? 0.72 : 0.2;
  const totalHeight = height + countertopCapThickness;
  const holeRadius = (35 / 2) / unit;

  return (
    <group>
      <mesh castShadow geometry={geometries.base} receiveShadow>
        <meshStandardMaterial color={bowlColor} roughness={surfaceRoughness} metalness={0.04} />
      </mesh>
      {faucetHoles.map((hole, index) => (
        <group key={index} position={[hole.x, totalHeight, hole.z]}>
          {/* Top surface drilled hole disc / aperture with zero z-fighting */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0008, 0]}>
            <circleGeometry args={[holeRadius, 32]} />
            <meshStandardMaterial
              color="#181a1c"
              roughness={0.96}
              metalness={0.04}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>
          {/* Drilled inner cylinder depth lining */}
          <mesh position={[0, -totalHeight / 2, 0]}>
            <cylinderGeometry args={[holeRadius * 0.99, holeRadius * 0.99, totalHeight, 32, 1, true]} />
            <meshStandardMaterial color="#121315" roughness={0.98} metalness={0.02} side={2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function GLBBasinModel({ bowlColor, bowlFinish, depth, drainFinish, modelUrl, showDimensions, sinkHeight, width, x, z }: BasinModelProps) {
  const gltf = useGLTF(modelUrl ?? bowlModelUrls["UB-04-M"]) as any;
  const scene: Object3D = gltf.scene;
  const object = useMemo(() => {
    const surfaceRoughness = bowlFinish === "matte" ? 0.72 : 0.2;
    const clone = scene.clone(true);
    const box = new Box3().setFromObject(clone);
    const size = new Vector3();
    const center = new Vector3();
    box.getSize(size);
    box.getCenter(center);
    clone.updateMatrixWorld(true);
    const countertopTopMarker = clone.getObjectByName("countertop_top")
      ?? clone.getObjectByName("counter_top");
    const markerPosition = countertopTopMarker
      ? clone.worldToLocal(countertopTopMarker.getWorldPosition(new Vector3()))
      : undefined;

    const dimInfo = getDimensionNodeBox(clone);
    const scale = dimInfo
      ? Math.min(width / Math.max(dimInfo.size.x, 0.001), depth / Math.max(dimInfo.size.z, 0.001))
      : Math.min(width / Math.max(size.x, 0.001), depth / Math.max(size.z, 0.001));

    const centerTarget = dimInfo ? dimInfo.center : center;

    clone.position.x = -centerTarget.x * scale;
    clone.position.z = -centerTarget.z * scale;
    const anchorY = (markerPosition && markerPosition.y > 0.01) ? markerPosition.y : box.max.y;
    clone.position.y = -anchorY * scale;
    clone.scale.setScalar(scale);
    clone.updateMatrixWorld(true);
    clone.traverse((child: Object3D) => {
      if (child instanceof Mesh) {
        const modelPart = findModelPart(child);

        // Hide dimension node if found without removing from scene by making its ior 0
        if (modelPart === "dimension") {
          child.visible = false;
          child.castShadow = false;
          child.receiveShadow = false;
          const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
          const materials = sourceMaterials.map((sourceMaterial) => {
            const material = sourceMaterial instanceof MeshPhysicalMaterial
              ? sourceMaterial.clone()
              : new MeshPhysicalMaterial();

            material.ior = 0;
            material.transmission = 1;
            material.opacity = 0;
            material.transparent = true;
            material.depthWrite = false;
            material.colorWrite = false;
            material.visible = false;
            material.needsUpdate = true;
            return material;
          });
          child.material = Array.isArray(child.material) ? materials : materials[0];
          return;
        }

        child.castShadow = true;
        child.receiveShadow = true;

        if (modelPart === "connector") conformConnectorNormals(child);
        const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
        const materials = sourceMaterials.map((sourceMaterial) => {
          if (modelPart === "connector") {
            return new MeshStandardMaterial({
              color: bowlColor,
              metalness: 0.04,
              roughness: surfaceRoughness,
            });
          }

          const material = sourceMaterial instanceof MeshStandardMaterial
            ? sourceMaterial.clone()
            : new MeshStandardMaterial();

          if (modelPart === "sink") {
            material.color.set(bowlColor);
            material.metalness = 0.04;
            material.roughness = surfaceRoughness;
          } else if (modelPart === "drain_cap") {
            const drainMaterial = drainMaterials[drainFinish] ?? drainMaterials.chrome;
            material.color.set(drainMaterial.color);
            material.metalness = drainMaterial.metalness;
            material.roughness = drainMaterial.roughness;
          }

          material.needsUpdate = true;
          return material;
        });
        child.material = Array.isArray(child.material) ? materials : materials[0];
      }
    });

    return clone;
  }, [bowlColor, bowlFinish, depth, drainFinish, scene, width]);

  useEffect(() => {
    return () => {
      object.traverse((child: Object3D) => {
        if (child instanceof Mesh) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => material.dispose());
          if (child.userData.disposeGeometryOnUnmount) child.geometry.dispose();
        }
      });
    };
  }, [object]);

  return (
    <group position={[x, sinkHeight + countertopCapThickness, z]}>
      <primitive object={object} />
    </group>
  );
}

function BasinModel({ bowlColor, bowlFinish, depth, drainFinish, modelUrl, showDimensions, sinkHeight, width, x, z }: BasinModelProps) {
  if (modelUrl) {
    return <GLBBasinModel bowlColor={bowlColor} bowlFinish={bowlFinish} depth={depth} drainFinish={drainFinish} modelUrl={modelUrl} showDimensions={showDimensions} sinkHeight={sinkHeight} width={width} x={x} z={z} />;
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
  const line = useMemo(() => {
    const geometry = new BufferGeometry().setFromPoints(points);
    const material = new LineBasicMaterial({ color });
    const object = new ThreeLine(geometry, material);
    object.renderOrder = 10;
    return object;
  }, [color, points]);

  useEffect(() => {
    return () => {
      line.geometry.dispose();
      line.material.dispose();
    };
  }, [line]);

  return <primitive object={line} />;
}

interface MeasurementsProps {
  show: boolean;
  config: SinkConfiguration;
  modelUrl?: string;
}

function Measurements({ show, config, modelUrl }: MeasurementsProps) {
  if (!show) return null;

  const { scene } = useGLTF(modelUrl ?? bowlModelUrls["UB-04-M"]);

  const dims = mergedDimensions(config);
  const length = Number(dims.L || 1000);
  const depth = Number(dims.D || 500);
  const height = Number(dims.H || 150);

  const leftInset = Math.max(0, Number(dims.L2 || 0));
  const rightInset = Math.max(0, Number(dims.L3 || 0));
  const rearInset = Math.max(0, Number(dims.D2 || 0));
  const frontInset = Math.max(0, Number(dims.D3 || 0));

  const sinkLength = Math.max(0, length - leftInset - rightInset);
  const sinkDepth = Math.max(0, depth - rearInset - frontInset);

  const sceneLength = toScene(length);
  const sceneDepth = toScene(depth);
  const sceneHeight = Math.max(0.42, toScene(height));

  const lengthInches = (length / 25.4).toFixed(2);
  const depthInches = (depth / 25.4).toFixed(2);
  const heightInches = (height / 25.4).toFixed(2);

  const sinkLengthInches = (sinkLength / 25.4).toFixed(2);
  const sinkDepthInches = (sinkDepth / 25.4).toFixed(2);

  const sceneLeftInset = toScene(leftInset);
  const sceneRightInset = toScene(rightInset);
  const sceneRearInset = toScene(rearInset);
  const sceneFrontInset = toScene(frontInset);

  const sinkStartX = -sceneLength / 2 + sceneLeftInset;
  const sinkEndX = sceneLength / 2 - sceneRightInset;
  const sinkCenterX = (sinkStartX + sinkEndX) / 2;

  const sinkStartZ = -sceneDepth / 2 + sceneRearInset;
  const sinkEndZ = sceneDepth / 2 - sceneFrontInset;
  const sinkCenterZ = (sinkStartZ + sinkEndZ) / 2;

  // Measurement lines and styling (categorized: Overall, Sink, Faucets)
  const colorOverall = "#df2727";
  const colorSink = "#0055ff";
  const colorFaucet = "#00d664";
  const hasCountertopSupport = config.mountingType === "countertop";
  const floorY = hasCountertopSupport ? 0.01 : -0.05;
  const floorLabelY = hasCountertopSupport ? 0.015 : -0.05;
  const bottomTickY = hasCountertopSupport ? 0.01 : 0;
  const zOverall = sceneDepth / 2 + 0.2;
  const xOverall = sceneLength / 2 + 0.2;

  // Inner sink measurement lines inside the basin opening (placed along rear and left inner walls)
  const topY = sceneHeight + countertopCapThickness;
  const rimLineY = topY + 0.003;
  const rimLabelY = topY + 0.01;

  const quantity = config.bowlQuantity ?? "single";
  const bowlCount = quantity === "triple" ? 3 : quantity === "double" ? 2 : 1;
  const singleBowlLengthMm = Math.max(240, Number(dims.L1 || 500));
  const singleBowlSceneLength = toScene(singleBowlLengthMm);
  const bowlInternalGap = bowlCount > 1 ? toScene(Number(dims.bowlSpacing || 0)) : 0;

  const singleBowlDepthMm = Math.max(220, Number(dims.D1 || 400));
  const singleBowlSceneDepth = toScene(singleBowlDepthMm);

  const dimensionNodeBounds = useMemo(() => {
    if (!modelUrl) return null;
    return getDimensionNodeMeasurements(scene, singleBowlSceneLength, singleBowlSceneDepth);
  }, [modelUrl, scene, singleBowlSceneDepth, singleBowlSceneLength]);

  const effectiveBowlLengthMm = dimensionNodeBounds ? dimensionNodeBounds.lengthMm : singleBowlLengthMm;
  const effectiveBowlDepthMm = dimensionNodeBounds ? dimensionNodeBounds.depthMm : singleBowlDepthMm;
  const effectiveBowlSceneLength = dimensionNodeBounds ? dimensionNodeBounds.sceneLength : singleBowlSceneLength;
  const effectiveBowlSceneDepth = dimensionNodeBounds ? dimensionNodeBounds.sceneDepth : singleBowlSceneDepth;

  const singleBowlLengthInches = (effectiveBowlLengthMm / 25.4).toFixed(2);
  const singleBowlDepthInches = (effectiveBowlDepthMm / 25.4).toFixed(2);
  const leftInsetInches = (leftInset / 25.4).toFixed(2);
  const rightInsetInches = (rightInset / 25.4).toFixed(2);
  const rearInsetInches = (rearInset / 25.4).toFixed(2);
  const frontInsetInches = (frontInset / 25.4).toFixed(2);
  const bowlSpacingInches = (Number(dims.bowlSpacing || 0) / 25.4).toFixed(2);
  const drainDistanceInches = ((rearInset + singleBowlDepthMm / 2) / 25.4).toFixed(2);
  const bottomToCenterInches = ((frontInset + singleBowlDepthMm / 2) / 25.4).toFixed(2);

  const faucetHolesType = config.faucetHoles ?? "none";
  const hasFaucetHoles = faucetHolesType !== "none";

  const leftToFirstCenterIn = ((leftInset + singleBowlLengthMm / 2) / 25.4).toFixed(2);
  const rightToLastCenterIn = ((rightInset + singleBowlLengthMm / 2) / 25.4).toFixed(2);

  const spacingInches = (faucetHolesType === "4_inch_centerset" || faucetHolesType === "centerset" || faucetHolesType === "3_hole_2in")
    ? 4
    : (faucetHolesType === "widespread" || faucetHolesType === "3_hole_3in" ? 8 : 0);
  const spacingMm = spacingInches * 25.4;

  const topEdgeZ = -sceneDepth / 2;

  const bowls = Array.from({ length: bowlCount }, (_, index) => {
    const startX = -sceneLength / 2 + sceneLeftInset + index * (effectiveBowlSceneLength + bowlInternalGap);
    const endX = startX + effectiveBowlSceneLength;
    const centerX = (startX + endX) / 2;
    const startZ = -sceneDepth / 2 + sceneRearInset;
    const endZ = startZ + effectiveBowlSceneDepth;
    const centerZ = (startZ + endZ) / 2;
    return { startX, endX, centerX, startZ, endZ, centerZ };
  });

  const firstBowl = bowls[0];
  const lastBowl = bowls[bowls.length - 1];

  const innerStartX = firstBowl.startX;
  const innerEndX = firstBowl.endX;
  const innerStartZ = firstBowl.startZ;
  const innerEndZ = firstBowl.endZ;

  const lastInnerEndX = lastBowl.endX;
  const lastInnerEndZ = lastBowl.endZ;

  const faucetDeckZ = (topEdgeZ + innerStartZ) / 2;
  const faucetToTopInches = (((innerStartZ - topEdgeZ) * unit / 2) / 25.4).toFixed(2);
  const basinToFaucetInches = faucetToTopInches;

  // First bowl inner measurements - placed inside the basin, offset away from walls/rims with clean clearance so lines do not join
  const clearanceX = dimensionNodeBounds ? 0 : Math.min(0.04, Math.max(0.02, singleBowlSceneLength * 0.012));
  const clearanceZ = dimensionNodeBounds ? 0 : Math.min(0.04, Math.max(0.02, singleBowlSceneDepth * 0.015));

  const firstLineStartX = innerStartX + clearanceX;
  const firstLineEndX = innerEndX - clearanceX;
  const lineOffsetFromRearZ = Math.min(0.24, Math.max(0.16, singleBowlSceneDepth * 0.12));
  const lineOffsetFromLeftX = Math.min(0.26, Math.max(0.18, singleBowlSceneLength * 0.10));
  const firstInnerRearZ = innerStartZ + lineOffsetFromRearZ;
  const firstInnerLeftX = innerStartX + lineOffsetFromLeftX;
  const firstLineStartZ = innerStartZ + clearanceZ;
  const firstLineEndZ = innerEndZ - clearanceZ;
  const tickSize = Math.min(0.018, singleBowlSceneDepth * 0.025);

  const isOval = config.bowl?.id === "UB-02" || config.bowl?.id === "UB-03" || config.bowl?.id === "SR-14" || config.bowl?.id === "SR-18" || config.bowl?.name?.toLowerCase().includes("oval") || false;

  // Positions for rear inset, front inset, top to center, bottom to center, faucet deck
  const rearInsetLineX = -sceneLength / 2 - 0.05;
  const frontInsetLineX = sceneLength / 2 + 0.05;
  const topToCenterLineX = lastBowl.endX - Math.min(0.26, singleBowlSceneLength * 0.22);
  const bottomToCenterLineX = lastBowl.centerX + Math.min(0.14, singleBowlSceneLength * 0.18);

  const faucetDeckLineX = lastBowl.centerX + 0.14;
  const faucetLineOffsetFromTop = Math.min(0.12, Math.max(0.06, sceneHeight * 0.15));
  const faucetLineY = topY - faucetLineOffsetFromTop;
  const faucetLineZ = topEdgeZ - 0.012;
  const faucetLabelY = faucetLineY;
  const faucetLabelZ = faucetLineZ - 0.02;
  const faucetTickSize = Math.max(0.022, tickSize * 1.2);

  return (
    <group>
      {/* 1. Left Inset (L2): Left countertop edge to first bowl rim */}
      <group>
        <Line start={[-sceneLength / 2, rimLineY, firstBowl.centerZ]} end={[innerStartX, rimLineY, firstBowl.centerZ]} color={colorSink} />
        <Line start={[-sceneLength / 2, rimLineY, firstBowl.centerZ - tickSize]} end={[-sceneLength / 2, rimLineY, firstBowl.centerZ + tickSize]} color={colorSink} />
        <Line start={[innerStartX, rimLineY, firstBowl.centerZ - tickSize]} end={[innerStartX, rimLineY, firstBowl.centerZ + tickSize]} color={colorSink} />
        <Html position={[(-sceneLength / 2 + innerStartX) / 2, rimLabelY, firstBowl.centerZ - 0.05]} center>
          <div className="measurement-label">{leftInsetInches} in</div>
        </Html>
      </group>

      {/* 2. Left Bowl Interior Dimensions (L1 & D1) - Only on the first bowl */}
      {isOval ? (
        <group>
          {/* Oval Width (Major Axis) across center */}
          <group>
            <Line start={[innerStartX + clearanceX, rimLineY, firstBowl.centerZ]} end={[innerEndX - clearanceX, rimLineY, firstBowl.centerZ]} color={colorSink} />
            <Line start={[innerStartX + clearanceX, rimLineY, firstBowl.centerZ - tickSize]} end={[innerStartX + clearanceX, rimLineY, firstBowl.centerZ + tickSize]} color={colorSink} />
            <Line start={[innerEndX - clearanceX, rimLineY, firstBowl.centerZ - tickSize]} end={[innerEndX - clearanceX, rimLineY, firstBowl.centerZ + tickSize]} color={colorSink} />
            <Html position={[firstBowl.centerX - effectiveBowlSceneLength * 0.22, rimLabelY, firstBowl.centerZ + 0.05]} center>
              <div className="measurement-label">{singleBowlLengthInches} in</div>
            </Html>
          </group>

          {/* Oval Depth (Minor Axis) across center */}
          <group>
            <Line start={[firstBowl.centerX, rimLineY, innerStartZ + clearanceZ]} end={[firstBowl.centerX, rimLineY, innerEndZ - clearanceZ]} color={colorSink} />
            <Line start={[firstBowl.centerX - tickSize, rimLineY, innerStartZ + clearanceZ]} end={[firstBowl.centerX + tickSize, rimLineY, innerStartZ + clearanceZ]} color={colorSink} />
            <Line start={[firstBowl.centerX - tickSize, rimLineY, innerEndZ - clearanceZ]} end={[firstBowl.centerX + tickSize, rimLineY, innerEndZ - clearanceZ]} color={colorSink} />
            <Html position={[firstBowl.centerX + 0.08, rimLabelY, firstBowl.centerZ - effectiveBowlSceneDepth * 0.22]} center>
              <div className="measurement-label">{singleBowlDepthInches} in</div>
            </Html>
          </group>
        </group>
      ) : (
        <group>
          {/* Bowl Width along the rear inside wall of the first basin */}
          <group>
            <Line start={[firstLineStartX, rimLineY, firstInnerRearZ]} end={[firstLineEndX, rimLineY, firstInnerRearZ]} color={colorSink} />
            <Line start={[firstLineStartX, rimLineY, firstInnerRearZ - tickSize]} end={[firstLineStartX, rimLineY, firstInnerRearZ + tickSize]} color={colorSink} />
            <Line start={[firstLineEndX, rimLineY, firstInnerRearZ - tickSize]} end={[firstLineEndX, rimLineY, firstInnerRearZ + tickSize]} color={colorSink} />
            <Html position={[firstBowl.centerX, rimLabelY, firstInnerRearZ + 0.05]} center>
              <div className="measurement-label">{singleBowlLengthInches} in</div>
            </Html>
          </group>

          {/* Bowl Depth along the left inside wall of the first basin */}
          <group>
            <Line start={[firstInnerLeftX, rimLineY, firstLineStartZ]} end={[firstInnerLeftX, rimLineY, firstLineEndZ]} color={colorSink} />
            <Line start={[firstInnerLeftX - tickSize, rimLineY, firstLineStartZ]} end={[firstInnerLeftX + tickSize, rimLineY, firstLineStartZ]} color={colorSink} />
            <Line start={[firstInnerLeftX - tickSize, rimLineY, firstLineEndZ]} end={[firstInnerLeftX + tickSize, rimLineY, firstLineEndZ]} color={colorSink} />
            <Html position={[firstInnerLeftX + 0.06, rimLabelY, firstBowl.centerZ]} center>
              <div className="measurement-label">{singleBowlDepthInches} in</div>
            </Html>
          </group>
        </group>
      )}

      {/* 3. Rear Inset (D2): Top/Back edge of countertop to rear bowl rim - moved to left outer edge as indicated */}
      <group>
        <Line start={[rearInsetLineX, rimLineY, topEdgeZ]} end={[rearInsetLineX, rimLineY, innerStartZ]} color={colorSink} />
        <Line start={[-sceneLength / 2, rimLineY, topEdgeZ]} end={[rearInsetLineX - tickSize, rimLineY, topEdgeZ]} color={colorSink} />
        <Line start={[-sceneLength / 2, rimLineY, innerStartZ]} end={[rearInsetLineX - tickSize, rimLineY, innerStartZ]} color={colorSink} />
        <Html position={[rearInsetLineX - 0.07, rimLabelY, (topEdgeZ + innerStartZ) / 2]} center>
          <div className="measurement-label">{rearInsetInches} in</div>
        </Html>
      </group>

      {/* 4. Distance between bowls (Gap) - only if more than 1 bowl */}
      {bowlCount > 1 &&
        Array.from({ length: bowlCount - 1 }, (_, index) => {
          const gapStartX = bowls[index].endX;
          const gapEndX = bowls[index + 1].startX;
          return (
            <group key={`bowl-gap-${index}`}>
              <Line start={[gapStartX, rimLineY, firstBowl.centerZ]} end={[gapEndX, rimLineY, firstBowl.centerZ]} color={colorSink} />
              <Line start={[gapStartX, rimLineY, firstBowl.centerZ - tickSize]} end={[gapStartX, rimLineY, firstBowl.centerZ + tickSize]} color={colorSink} />
              <Line start={[gapEndX, rimLineY, firstBowl.centerZ - tickSize]} end={[gapEndX, rimLineY, firstBowl.centerZ + tickSize]} color={colorSink} />
              <Html position={[(gapStartX + gapEndX) / 2, rimLabelY, firstBowl.centerZ - 0.05]} center>
                <div className="measurement-label">{bowlSpacingInches} in</div>
              </Html>
            </group>
          );
        })}

      {/* 5. Right Inset (L3): Last bowl right rim to countertop right edge */}
      <group>
        <Line start={[lastInnerEndX, rimLineY, lastBowl.centerZ]} end={[sceneLength / 2, rimLineY, lastBowl.centerZ]} color={colorSink} />
        <Line start={[lastInnerEndX, rimLineY, lastBowl.centerZ - tickSize]} end={[lastInnerEndX, rimLineY, lastBowl.centerZ + tickSize]} color={colorSink} />
        <Line start={[sceneLength / 2, rimLineY, lastBowl.centerZ - tickSize]} end={[sceneLength / 2, rimLineY, lastBowl.centerZ + tickSize]} color={colorSink} />
        <Html position={[(lastInnerEndX + sceneLength / 2) / 2, rimLabelY, lastBowl.centerZ - 0.05]} center>
          <div className="measurement-label">{rightInsetInches} in</div>
        </Html>
      </group>

      {/* 6. Back Edge to Center (Top to Center, shown on right/last bowl) */}
      <group>
        <Line start={[topToCenterLineX, rimLineY, topEdgeZ]} end={[topToCenterLineX, rimLineY, lastBowl.centerZ]} color={colorSink} />
        <Line start={[topToCenterLineX - tickSize, rimLineY, topEdgeZ]} end={[topToCenterLineX + tickSize, rimLineY, topEdgeZ]} color={colorSink} />
        <Line start={[topToCenterLineX - tickSize, rimLineY, lastBowl.centerZ]} end={[topToCenterLineX + tickSize, rimLineY, lastBowl.centerZ]} color={colorSink} />
        <Html position={[topToCenterLineX + 0.06, rimLabelY, (topEdgeZ + lastBowl.centerZ) / 2]} center>
          <div className="measurement-label">{drainDistanceInches} in</div>
        </Html>
      </group>

      {/* 7. Front Edge to Center (Bottom to Center, shown on right/last bowl, offset on different vertical line) */}
      <group>
        <Line start={[bottomToCenterLineX, rimLineY, lastBowl.centerZ]} end={[bottomToCenterLineX, rimLineY, sceneDepth / 2]} color={colorSink} />
        <Line start={[bottomToCenterLineX - tickSize, rimLineY, lastBowl.centerZ]} end={[bottomToCenterLineX + tickSize, rimLineY, lastBowl.centerZ]} color={colorSink} />
        <Line start={[bottomToCenterLineX - tickSize, rimLineY, sceneDepth / 2]} end={[bottomToCenterLineX + tickSize, rimLineY, sceneDepth / 2]} color={colorSink} />
        <Html position={[bottomToCenterLineX + 0.06, rimLabelY, (lastBowl.centerZ + sceneDepth / 2) / 2]} center>
          <div className="measurement-label">{bottomToCenterInches} in</div>
        </Html>
      </group>

      {/* 8. Front Inset (D3): Front edge of right/last bowl to countertop front edge - moved to right outer edge as indicated */}
      <group>
        <Line start={[frontInsetLineX, rimLineY, lastInnerEndZ]} end={[frontInsetLineX, rimLineY, sceneDepth / 2]} color={colorSink} />
        <Line start={[sceneLength / 2, rimLineY, lastInnerEndZ]} end={[frontInsetLineX + tickSize, rimLineY, lastInnerEndZ]} color={colorSink} />
        <Line start={[sceneLength / 2, rimLineY, sceneDepth / 2]} end={[frontInsetLineX + tickSize, rimLineY, sceneDepth / 2]} color={colorSink} />
        <Html position={[frontInsetLineX + 0.07, rimLabelY, (lastInnerEndZ + sceneDepth / 2) / 2]} center>
          <div className="measurement-label">{frontInsetInches} in</div>
        </Html>
      </group>

      {/* 9. Faucet Holes Measurements - moved to right side of faucet hole with labels offset */}
      {hasFaucetHoles && (
        <group>
          {/* Faucet to Top (Back edge to faucet center) */}
          <group>
            <Line start={[faucetDeckLineX, rimLineY, topEdgeZ]} end={[faucetDeckLineX, rimLineY, faucetDeckZ]} color={colorFaucet} />
            <Line start={[faucetDeckLineX - tickSize, rimLineY, topEdgeZ]} end={[faucetDeckLineX + tickSize, rimLineY, topEdgeZ]} color={colorFaucet} />
            <Line start={[faucetDeckLineX - tickSize, rimLineY, faucetDeckZ]} end={[faucetDeckLineX + tickSize, rimLineY, faucetDeckZ]} color={colorFaucet} />
            <Html position={[faucetDeckLineX + 0.08, rimLabelY, (topEdgeZ + faucetDeckZ) / 2]} center>
              <div className="measurement-label">{faucetToTopInches} in</div>
            </Html>
          </group>

          {/* Basin to Faucet (Faucet center to basin inner opening) */}
          <group>
            <Line start={[faucetDeckLineX, rimLineY, faucetDeckZ]} end={[faucetDeckLineX, rimLineY, innerStartZ]} color={colorFaucet} />
            <Line start={[faucetDeckLineX - tickSize, rimLineY, faucetDeckZ]} end={[faucetDeckLineX + tickSize, rimLineY, faucetDeckZ]} color={colorFaucet} />
            <Line start={[faucetDeckLineX - tickSize, rimLineY, innerStartZ]} end={[faucetDeckLineX + tickSize, rimLineY, innerStartZ]} color={colorFaucet} />
            <Html position={[faucetDeckLineX + 0.08, rimLabelY, (faucetDeckZ + innerStartZ) / 2]} center>
              <div className="measurement-label">{basinToFaucetInches} in</div>
            </Html>
          </group>

          {/* Left Edge to First Faucet Center - placed along the outer vertical face where red line is */}
          <group>
            <Line start={[-sceneLength / 2, faucetLineY, faucetLineZ]} end={[firstBowl.centerX, faucetLineY, faucetLineZ]} color={colorFaucet} />
            <Line start={[-sceneLength / 2, faucetLineY - faucetTickSize, faucetLineZ]} end={[-sceneLength / 2, faucetLineY + faucetTickSize, faucetLineZ]} color={colorFaucet} />
            <Line start={[firstBowl.centerX, faucetLineY - faucetTickSize, faucetLineZ]} end={[firstBowl.centerX, faucetLineY + faucetTickSize, faucetLineZ]} color={colorFaucet} />
            <Html position={[(-sceneLength / 2 + firstBowl.centerX) / 2, faucetLineY - 0.06, faucetLabelZ]} center>
              <div className="measurement-label">Left to Faucet: {leftToFirstCenterIn} in</div>
            </Html>
          </group>

          {/* Right Edge to Last Faucet Center - placed along the outer vertical face where red line is */}
          <group>
            <Line start={[lastBowl.centerX, faucetLineY, faucetLineZ]} end={[sceneLength / 2, faucetLineY, faucetLineZ]} color={colorFaucet} />
            <Line start={[lastBowl.centerX, faucetLineY - faucetTickSize, faucetLineZ]} end={[lastBowl.centerX, faucetLineY + faucetTickSize, faucetLineZ]} color={colorFaucet} />
            <Line start={[sceneLength / 2, faucetLineY - faucetTickSize, faucetLineZ]} end={[sceneLength / 2, faucetLineY + faucetTickSize, faucetLineZ]} color={colorFaucet} />
            <Html position={[(lastBowl.centerX + sceneLength / 2) / 2, faucetLineY - 0.06, faucetLabelZ]} center>
              <div className="measurement-label">Right to Faucet: {rightToLastCenterIn} in</div>
            </Html>
          </group>

          {/* Distance between 2 adjacent faucet holes */}
          {faucetHolesType !== "single" && (
            <group>
              <Line
                start={[lastBowl.centerX - toScene(spacingMm), rimLineY, faucetDeckZ]}
                end={[lastBowl.centerX, rimLineY, faucetDeckZ]}
                color={colorFaucet}
              />
              <Line
                start={[lastBowl.centerX - toScene(spacingMm), rimLineY, faucetDeckZ - tickSize]}
                end={[lastBowl.centerX - toScene(spacingMm), rimLineY, faucetDeckZ + tickSize]}
                color={colorFaucet}
              />
              <Line
                start={[lastBowl.centerX, rimLineY, faucetDeckZ - tickSize]}
                end={[lastBowl.centerX, rimLineY, faucetDeckZ + tickSize]}
                color={colorFaucet}
              />
              <Html position={[lastBowl.centerX - toScene(spacingMm) / 2, rimLabelY, faucetDeckZ + 0.05]} center>
                <div className="measurement-label">
                  {spacingInches} in
                </div>
              </Html>
            </group>
          )}
        </group>
      )}

      {/* 10. Overall Width (Length) on floor or countertop */}
      <group>
        <Line start={[-sceneLength / 2, floorY, zOverall]} end={[sceneLength / 2, floorY, zOverall]} color={colorOverall} />
        <Line start={[-sceneLength / 2, floorY, zOverall - 0.07]} end={[-sceneLength / 2, floorY, zOverall + 0.07]} color={colorOverall} />
        <Line start={[sceneLength / 2, floorY, zOverall - 0.07]} end={[sceneLength / 2, floorY, zOverall + 0.07]} color={colorOverall} />
        <Html position={[0, floorLabelY, zOverall + 0.06]} center>
          <div className="measurement-label">{lengthInches} in</div>
        </Html>
      </group>

      {/* 11. Overall Depth on floor or countertop */}
      <group>
        <Line start={[xOverall, floorY, -sceneDepth / 2]} end={[xOverall, floorY, sceneDepth / 2]} color={colorOverall} />
        <Line start={[xOverall - 0.07, floorY, -sceneDepth / 2]} end={[xOverall + 0.07, floorY, -sceneDepth / 2]} color={colorOverall} />
        <Line start={[xOverall - 0.07, floorY, sceneDepth / 2]} end={[xOverall + 0.07, floorY, sceneDepth / 2]} color={colorOverall} />
        <Html position={[xOverall + 0.06, floorLabelY, 0]} center>
          <div className="measurement-label">{depthInches} in</div>
        </Html>
      </group>

      {/* 12. Overall Height - moved to front right corner as indicated */}
      <group>
        <Line start={[xOverall, bottomTickY, sceneDepth / 2]} end={[xOverall, sceneHeight, sceneDepth / 2]} color={colorOverall} />
        <Line start={[xOverall - 0.07, bottomTickY, sceneDepth / 2]} end={[xOverall + 0.07, bottomTickY, sceneDepth / 2]} color={colorOverall} />
        <Line start={[xOverall - 0.07, sceneHeight, sceneDepth / 2]} end={[xOverall + 0.07, sceneHeight, sceneDepth / 2]} color={colorOverall} />
        <Html position={[xOverall + 0.07, sceneHeight / 2, sceneDepth / 2]} center>
          <div className="measurement-label">{heightInches} in</div>
        </Html>
      </group>
    </group>
  );
}

function SinkModel({ appearance, arModelRef, config, showDimensions }: SinkModelProps) {
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
  const hasCountertopSupport = config.mountingType === "countertop";
  const supportThickness = toScene(45);
  const supportOverhang = toScene(75);
  const productElevation = hasCountertopSupport ? supportThickness : 0;
  const modelUrl = config.bowl?.id ? bowlModelUrls[config.bowl.id] : undefined;

  const { scene } = useGLTF(modelUrl ?? bowlModelUrls["UB-04-M"]);
  const dimBounds = useMemo(() => {
    if (!modelUrl) return null;
    return getDimensionNodeMeasurements(scene, sceneBowlLength, sceneBowlDepth);
  }, [modelUrl, scene, sceneBowlDepth, sceneBowlLength]);

  const effBowlLength = dimBounds ? dimBounds.sceneLength : sceneBowlLength;
  const effBowlDepth = dimBounds ? dimBounds.sceneDepth : sceneBowlDepth;

  const bowls = Array.from({ length: count }, (_, index) => ({
    x: -sceneLength / 2 + sceneLeftInset + effBowlLength / 2 + index * (effBowlLength + sceneInternalGap),
    z: -sceneDepth / 2 + sceneTopInset + effBowlDepth / 2,
  }));

  const faucetDeckZ = -sceneDepth / 2 + sceneTopInset / 2;
  const faucetHoleType = config.faucetHoles ?? "none";
  const faucetHoles = useMemo(() => {
    if (faucetHoleType === "none") return [];

    const spacingCenterset = toScene(4 * 25.4);
    const spacingWidespread = toScene(8 * 25.4);
    const holes: Array<{ x: number; z: number }> = [];

    bowls.forEach((bowl) => {
      if (faucetHoleType === "single") {
        holes.push({ x: bowl.x, z: faucetDeckZ });
      } else if (faucetHoleType === "4_inch_centerset" || faucetHoleType === "centerset" || faucetHoleType === "3_hole_2in") {
        holes.push({ x: bowl.x - spacingCenterset, z: faucetDeckZ });
        holes.push({ x: bowl.x, z: faucetDeckZ });
        holes.push({ x: bowl.x + spacingCenterset, z: faucetDeckZ });
      } else if (faucetHoleType === "widespread" || faucetHoleType === "3_hole_3in") {
        holes.push({ x: bowl.x - spacingWidespread, z: faucetDeckZ });
        holes.push({ x: bowl.x, z: faucetDeckZ });
        holes.push({ x: bowl.x + spacingWidespread, z: faucetDeckZ });
      }
    });

    return holes;
  }, [bowls, faucetDeckZ, faucetHoleType]);

  return (
    <>
      <group ref={arModelRef} rotation={[0, -0.18, 0]}>
      {hasCountertopSupport && (
        <mesh castShadow position={[0, supportThickness / 2, 0]} receiveShadow>
          <boxGeometry args={[
            sceneLength + supportOverhang * 2,
            supportThickness,
            sceneDepth + supportOverhang * 2,
          ]} />
          <meshStandardMaterial color="#b49b72" metalness={0} roughness={0.82} />
        </mesh>
      )}
      <group position={[0, productElevation, 0]}>
        <CountertopModel
          bowlColor={appearance.bowlColor}
          bowlFinish={appearance.bowlFinish}
          bowlDepth={effBowlDepth}
          bowlWidth={effBowlLength}
          bowls={bowls}
          depth={sceneDepth}
          faucetHoles={faucetHoles}
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
            showDimensions={showDimensions}
            sinkHeight={sceneHeight}
            width={sceneBowlLength}
            x={bowl.x}
            z={bowl.z}
          />
        ))}
      </group>
      </group>
      <group position={[0, productElevation, 0]} rotation={[0, -0.18, 0]}>
        <Measurements show={showDimensions} config={config} modelUrl={modelUrl} />
      </group>
    </>
  );
}

useGLTF.preload(bowlModelUrls["UB-01"]);

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

interface AutoFitCameraProps {
  depth: number;
  height: number;
  length: number;
}

interface OrbitControlsLike {
  target: Vector3;
  update: () => void;
}

function AutoFitCamera({ depth, height, length }: AutoFitCameraProps) {
  const { camera, controls, size } = useThree();

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera) || size.height <= 0) return;

    const sceneLength = toScene(length);
    const sceneDepth = toScene(depth);
    const sceneHeight = Math.max(0.42, toScene(height));
    const target = new Vector3(0, sceneHeight / 2, 0);
    const orbitControls = controls ? controls as unknown as OrbitControlsLike : undefined;
    const previousTarget = orbitControls?.target ?? target;
    const viewDirection = camera.position.clone().sub(previousTarget).normalize();
    const verticalFov = MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * (size.width / size.height));
    const limitingFov = Math.min(verticalFov, horizontalFov);
    const boundingRadius = Math.sqrt(
      sceneLength * sceneLength + sceneDepth * sceneDepth + sceneHeight * sceneHeight,
    ) / 2;
    const requiredDistance = (boundingRadius / Math.sin(limitingFov / 2)) * 1.12;
    const currentDistance = camera.position.distanceTo(target);

    orbitControls?.target.copy(target);
    if (currentDistance < requiredDistance) {
      camera.position.copy(target).addScaledVector(viewDirection, requiredDistance);
    }

    camera.updateProjectionMatrix();
    orbitControls?.update();
  }, [camera, controls, depth, height, length, size.height, size.width]);

  return null;
}

interface ArModelExporterProps {
  modelRef: RefObject<Group | null>;
  onModelReady?: (model: Blob) => void;
  revision: string;
}

function ArModelExporter({ modelRef, onModelReady, revision }: ArModelExporterProps) {
  useEffect(() => {
    if (!onModelReady) return;

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      const source = modelRef.current;
      if (!source) return;

      const exportRoot = source.clone(true);
      exportRoot.scale.multiplyScalar(unit / 1000);
      exportRoot.updateMatrixWorld(true);

      try {
        const result = await new GLTFExporter().parseAsync(exportRoot, {
          binary: true,
          onlyVisible: true,
          trs: false,
        });
        if (!cancelled && result instanceof ArrayBuffer) {
          onModelReady(new Blob([result], { type: "model/gltf-binary" }));
        }
      } catch {
        // Keep the previous AR model if an intermediate configuration cannot be exported.
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [modelRef, onModelReady, revision]);

  return null;
}

interface SceneLightingProps {
  depth: number;
  length: number;
  lightSettings: LightSettings;
}

function SceneLighting({ depth, length, lightSettings }: SceneLightingProps) {
  const lightRef = useRef<DirectionalLight>(null);
  const sceneLength = toScene(length);
  const sceneDepth = toScene(depth);
  const cameraSize = Math.max(lightSettings.shadowCameraSize, sceneLength * 1.8 + sceneDepth);

  useEffect(() => {
    if (lightRef.current) {
      const cam = lightRef.current.shadow.camera;
      cam.left = -cameraSize;
      cam.right = cameraSize;
      cam.top = cameraSize;
      cam.bottom = -cameraSize;
      cam.near = 0.5;
      cam.far = Math.max(60, cameraSize * 4);
      cam.updateProjectionMatrix();
      lightRef.current.shadow.needsUpdate = true;
    }
  }, [cameraSize, lightSettings]);

  const planeWidth = Math.max(40, sceneLength * 3.5);
  const planeHeight = Math.max(40, (sceneDepth + sceneLength * 0.5) * 3);

  return (
    <>
      <ambientLight intensity={lightSettings.ambientIntensity} />
      <directionalLight
        ref={lightRef}
        castShadow
        intensity={lightSettings.keyIntensity}
        position={[lightSettings.keyX, lightSettings.keyY, lightSettings.keyZ]}
        shadow-bias={lightSettings.shadowBias}
        shadow-camera-bottom={-cameraSize}
        shadow-camera-left={-cameraSize}
        shadow-camera-right={cameraSize}
        shadow-camera-top={cameraSize}
        shadow-camera-near={0.5}
        shadow-camera-far={Math.max(60, cameraSize * 4)}
        shadow-intensity={lightSettings.shadowOpacity}
        shadow-mapSize={[lightSettings.shadowMapSize, lightSettings.shadowMapSize]}
        shadow-normalBias={lightSettings.shadowNormalBias}
        shadow-radius={lightSettings.shadowRadius}
      />
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry key={`${planeWidth.toFixed(1)}-${planeHeight.toFixed(1)}`} args={[planeWidth, planeHeight]} />
        <shadowMaterial opacity={1} />
      </mesh>
    </>
  );
}

export function Dimension3DPreview({ bowlColor = "#f7f7f5", bowlFinish = "glossy", config, drainFinish = "chrome", onArModelReady, showDimensions }: Dimension3DPreviewProps) {
  const dims = mergedDimensions(config);
  const length = Number(dims.L || 1000);
  const depth = Number(dims.D || 500);
  const height = Number(dims.H || 150);
  const hasCountertopSupport = config.mountingType === "countertop";
  const fittedLength = hasCountertopSupport ? length + 150 : length;
  const fittedDepth = hasCountertopSupport ? depth + 150 : depth;
  const fittedHeight = hasCountertopSupport ? height + 45 : height;
  const [debugOpen, setDebugOpen] = useState(false);
  const [lightSettings, setLightSettings] = useState<LightSettings>({ ...defaultLightSettings });
  const arModelRef = useRef<Group>(null);
  const arRevision = JSON.stringify({ bowlColor, bowlFinish, config, drainFinish });

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
        <Canvas
          camera={{ position: [4.7, 4.1, 5.4], fov: 38 }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
          shadows
        >
          <SceneLighting depth={fittedDepth} length={fittedLength} lightSettings={lightSettings} />
          <SinkModel appearance={{ bowlColor, bowlFinish, drainFinish: drainFinish ?? "chrome" }} arModelRef={arModelRef} config={config} showDimensions={!!showDimensions} />
          <ArModelExporter modelRef={arModelRef} onModelReady={onArModelReady} revision={arRevision} />
          <Environment files={assetUrl("environment/alte_veste_station_2k.hdr")} environmentIntensity={0.4} />
          <EffectComposer enableNormalPass multisampling={4}>
            <SSAO
              bias={lightSettings.ssaoBias}
              intensity={lightSettings.ssaoIntensity}
              luminanceInfluence={lightSettings.ssaoLuminanceInfluence}
              radius={lightSettings.ssaoRadius}
              rings={4}
              samples={lightSettings.ssaoSamples}
            />
          </EffectComposer>
          <OrbitControls
            enableDamping
            enablePan={false}
            makeDefault
            maxDistance={maxZoomDistance}
            maxPolarAngle={Math.PI / 2 - 0.03}
            minDistance={3}
            target={[0, 0.45, 0]}
          />
          <AutoFitCamera depth={fittedDepth} height={fittedHeight} length={fittedLength} />
        </Canvas>
        {showDimensions && (
          <div className="dimension-legend" aria-label="Measurement categories">
            <div className="dimension-legend-item">
              <span className="dimension-legend-color overall" />
              <span>Overall</span>
            </div>
            <div className="dimension-legend-item">
              <span className="dimension-legend-color sink" />
              <span>Sink</span>
            </div>
            <div className="dimension-legend-item">
              <span className="dimension-legend-color faucets" />
              <span>Faucets</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
