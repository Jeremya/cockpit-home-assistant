import { PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  fitModelCamera,
  clampModelYaw,
  MODEL_FOV,
  MODEL_ELEVATION,
  MODEL_YAW,
  MODEL_YAW_RANGE,
  MODEL_TRANSITION_MS,
  type ModelCameraInput,
  type ModelCameraPose,
} from "./modelCamera";

type Controls = Pick<
  OrbitControls,
  | "target"
  | "update"
  | "getAzimuthalAngle"
  | "enablePan"
  | "enableZoom"
  | "enableDamping"
  | "autoRotate"
  | "minPolarAngle"
  | "maxPolarAngle"
  | "minAzimuthAngle"
  | "maxAzimuthAngle"
>;
/** Owns model poses. OrbitControls only supplies azimuth; zoom has one owner.
 * No RAF/listeners here: the renderer drives tick while a transition is active.
 */
export class ModelCameraController {
  private bounds: ModelCameraInput["bounds"] | null = null;
  private viewport = { width: 0, height: 0 };
  private yaw = MODEL_YAW;
  private zoomFactor = 1;
  private applying = false;
  private destination: ModelCameraPose | null = null;
  private transition: {
    start: number;
    target: Vector3;
    distance: number;
    yaw: number;
    to: ModelCameraPose;
  } | null = null;
  constructor(
    private camera: PerspectiveCamera,
    private controls: Controls,
    private reduceMotion: () => boolean,
    private invalidate: () => void,
  ) {
    camera.fov = MODEL_FOV;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = false;
    controls.autoRotate = false;
    controls.minPolarAngle = controls.maxPolarAngle =
      Math.PI / 2 - MODEL_ELEVATION;
    controls.minAzimuthAngle = MODEL_YAW - MODEL_YAW_RANGE;
    controls.maxAzimuthAngle = MODEL_YAW + MODEL_YAW_RANGE;
  }
  get probe() {
    return {
      yaw: this.yaw,
      zoomFactor: this.zoomFactor,
      animating: this.transition !== null,
      fitDistance: this.destination?.fitDistance ?? null,
    };
  }
  setBounds(
    bounds: ModelCameraInput["bounds"],
    reset: boolean,
    animate: boolean,
    now: number,
  ) {
    this.bounds = bounds;
    if (reset) {
      this.yaw = MODEL_YAW;
      this.zoomFactor = 1;
    }
    this.refit(animate, now);
  }
  resize(width: number, height: number) {
    this.viewport = { width, height };
    this.refit(false, 0);
  }
  /** Programmatic writes emit OrbitControls change; never feed them back. */
  orbitChanged() {
    if (this.applying) return;
    this.yaw = clampModelYaw(this.controls.getAzimuthalAngle());
    this.refit(false, 0);
  }
  rotate(delta: number) {
    this.yaw = clampModelYaw(this.yaw + delta);
    this.refit(false, 0);
  }
  zoom(factor: number) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.zoomFactor = Math.min(1.25, Math.max(1, this.zoomFactor * factor));
    this.refit(false, 0);
  }
  finish() {
    this.refit(false, 0);
  }
  private refit(animate: boolean, now: number) {
    this.transition = null;
    if (!this.bounds) return;
    const to = fitModelCamera({
      bounds: this.bounds,
      viewport: this.viewport,
      yaw: this.yaw,
      zoomFactor: this.zoomFactor,
    });
    if (!to) return;
    const hadPose = this.destination !== null;
    this.destination = to;
    const unchanged =
      this.camera.position.distanceTo(new Vector3(...to.position)) < 1e-8 &&
      this.controls.target.distanceTo(new Vector3(...to.target)) < 1e-8;
    if (animate && hadPose && !unchanged && !this.reduceMotion()) {
      const delta = this.camera.position.clone().sub(this.controls.target);
      this.transition = {
        start: now,
        target: this.controls.target.clone(),
        distance: delta.length(),
        yaw: Math.atan2(delta.x, delta.z),
        to,
      };
    } else this.apply(to);
    this.invalidate();
  }
  private apply(pose: ModelCameraPose) {
    this.applying = true;
    try {
      this.camera.aspect = this.viewport.width / this.viewport.height;
      this.camera.near = pose.near;
      this.camera.far = pose.far;
      this.camera.position.fromArray(pose.position);
      this.controls.target.fromArray(pose.target);
      this.camera.lookAt(this.controls.target);
      this.camera.updateProjectionMatrix();
      this.controls.update();
    } finally {
      this.applying = false;
    }
  }
  tick(now: number): boolean {
    const transition = this.transition;
    if (!transition) return false;
    if (this.reduceMotion() || now - transition.start >= MODEL_TRANSITION_MS) {
      this.transition = null;
      this.apply(transition.to);
      return false;
    }
    const progress = Math.max(
      0,
      (now - transition.start) / MODEL_TRANSITION_MS,
    );
    const eased = progress * progress * (3 - 2 * progress);
    const to = transition.to;
    const target = transition.target
      .clone()
      .lerp(new Vector3(...to.target), eased);
    const distance =
      transition.distance +
      (to.fitDistance * to.zoomFactor - transition.distance) * eased;
    const yaw = transition.yaw + (to.yaw - transition.yaw) * eased;
    const direction = new Vector3(
      Math.sin(yaw) * Math.cos(MODEL_ELEVATION),
      Math.sin(MODEL_ELEVATION),
      Math.cos(yaw) * Math.cos(MODEL_ELEVATION),
    );
    this.apply({
      ...to,
      target: target.toArray(),
      position: target.clone().addScaledVector(direction, distance).toArray(),
      near: Math.min(this.camera.near, to.near),
      far: Math.max(this.camera.far, to.far, distance * 3),
    });
    return true;
  }
  dispose() {
    this.transition = null;
  }
}
