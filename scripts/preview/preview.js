/* One iframe throughout: changing its viewport keeps the app and session mounted. */
const sizes = document.getElementById("size");
const rotate = document.getElementById("rotate");
const stage = document.querySelector("main");
const device = document.getElementById("device");
const dimensions = document.getElementById("dimensions");
let rotated = false;

function layout() {
  const [baseWidth, baseHeight] = sizes.value.split(",").map(Number);
  const [width, height] = rotated
    ? [baseHeight, baseWidth]
    : [baseWidth, baseHeight];
  const scale = Math.min(
    1,
    Math.max(1, stage.clientWidth - 40) / (width + 26),
    Math.max(1, stage.clientHeight - 40) / (height + 26),
  );
  device.style.width = `${width}px`;
  device.style.height = `${height}px`;
  device.style.setProperty("--scale", String(scale));
  device.classList.toggle("wide", baseWidth >= 768);
  const label = `${width} × ${height} CSS px · aperçu à ${Math.round(scale * 100)} %`;
  if (dimensions.textContent !== label) dimensions.textContent = label;
}
sizes.addEventListener("change", () => {
  rotated = false;
  layout();
});
rotate.addEventListener("click", () => {
  rotated = !rotated;
  layout();
});
new ResizeObserver(layout).observe(stage);
layout();
