import { mkdir, copyFile, constants } from "node:fs/promises";
await mkdir(new URL("../.local/home-assistant/", import.meta.url), {
  recursive: true,
});
try {
  await copyFile(
    new URL("../home-assistant/configuration.yaml", import.meta.url),
    new URL("../.local/home-assistant/configuration.yaml", import.meta.url),
    constants.COPYFILE_EXCL,
  );
  console.log("Created local Home Assistant demo configuration.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Existing Home Assistant configuration preserved.");
}
