import fs from "fs";
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function hanaAssetsPlugin() {
  return {
    name: "hana-assets-plugin",
    configureServer(server) {
      server.middlewares.use("/__hana_assets__", (req, res) => {
        const target = decodeURIComponent(req.url || "").replace(/^\//, "");
        const filePath = path.resolve(process.cwd(), "..", "assets", target);

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          res.statusCode = 404;
          res.end();
          return;
        }

        fs.createReadStream(filePath).pipe(res);
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), hanaAssetsPlugin()]
});
