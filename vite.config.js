/**
 * @file vite.config.js
 * @brief Heurist Graph Vite build configuration.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { defineConfig } from "vite";
import packageJson from "./package.json" with { type: "json" };

export default defineConfig({
  base: "./",
  define: {
    HEURIST_MODULE_VERSION: JSON.stringify(packageJson.version),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: "src/main.js",
      output: {
        entryFileNames: "heurist-graph.js",
        chunkFileNames: "heurist-graph-[name].js",
        assetFileNames: "heurist-graph-[name][extname]",
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5175,
    proxy: {
      "/heurist": {
        target: "http://127.0.0.1",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
