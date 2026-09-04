/**
 * @file deploy-heurist-graph.mjs
 * @brief Deploys the built heurist-graph bundle.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { cp, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleName = "heurist-graph";
const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceDirectory = path.join(projectDirectory, "dist");
const distributionRoot =
  process.env.HEURIST_CLIENT_DIST_ROOT ||
  "C:/xampp/htdocs/heurist/hclient/bundles/";
const destinationDirectory = path.join(distributionRoot, moduleName);
const stagingDirectory = `${destinationDirectory}.new-${process.pid}`;
const previousDirectory = `${destinationDirectory}.old-${process.pid}`;
const requiredFiles = ["heurist-graph.js", "heurist-graph-main.css"];

async function verify(directory, label) {
  const info = await stat(directory).catch(() => null);
  if (!info?.isDirectory())
    throw new Error(`${label} directory does not exist: ${directory}`);
  for (const file of requiredFiles) {
    if (!(await stat(path.join(directory, file)).catch(() => null))?.isFile()) {
      throw new Error(`${label} does not contain ${file}`);
    }
  }
}

async function deploy() {
  await verify(sourceDirectory, "Build output");
  await mkdir(distributionRoot, { recursive: true });
  await rm(stagingDirectory, { recursive: true, force: true });
  await rm(previousDirectory, { recursive: true, force: true });
  await cp(sourceDirectory, stagingDirectory, { recursive: true, force: true });
  await verify(stagingDirectory, "Staged deployment");
  let hadPrevious = false;
  try {
    await rename(destinationDirectory, previousDirectory);
    hadPrevious = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    await rename(stagingDirectory, destinationDirectory);
  } catch (error) {
    if (hadPrevious)
      await rename(previousDirectory, destinationDirectory).catch(() => {});
    throw error;
  }
  await rm(previousDirectory, { recursive: true, force: true });
  await verify(destinationDirectory, "Deployed module");
  console.log(`Heurist Graph deployed to ${destinationDirectory}`);
}

deploy().catch(async (error) => {
  await rm(stagingDirectory, { recursive: true, force: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
});
