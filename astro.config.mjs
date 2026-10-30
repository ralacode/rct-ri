// @ts-check
import { defineConfig } from "astro/config";
import http from "node:http";
import path from "node:path";

import react from "@astrojs/react";

import tailwindcss from "@tailwindcss/vite";

const AXUM_DEV = { hostname: "127.0.0.1", port: 8080 };

/**
 * Astro の trailingSlash 検査より先に /api を Axum へ渡す。
 * @returns {import("vite").Plugin}
 */
function proxyApiBeforeTrailingSlash() {
  return {
    name: "proxy-api-before-trailing-slash",
    enforce: "pre",
    configureServer(server) {
      /** @type {import("connect").NextHandleFunction} */
      const proxyApi = (req, res, next) => {
        if (!req.url?.startsWith("/api")) {
          next();
          return;
        }

        const proxyReq = http.request(
          {
            hostname: AXUM_DEV.hostname,
            port: AXUM_DEV.port,
            path: req.url,
            method: req.method,
            headers: {
              ...req.headers,
              host: `${AXUM_DEV.hostname}:${AXUM_DEV.port}`,
            },
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
            proxyRes.pipe(res);
          },
        );

        proxyReq.on("error", (error) => {
          if (!res.headersSent) {
            res.statusCode = 502;
          }
          res.end(error.message);
        });

        req.pipe(proxyReq);
      };

      const moveToFront = () => {
        const stack = server.middlewares.stack;
        const index = stack.findIndex((layer) => layer.handle === proxyApi);
        if (index === -1) {
          server.middlewares.use(proxyApi);
          moveToFront();
          return;
        }
        if (index > 0) {
          const [entry] = stack.splice(index, 1);
          stack.unshift(entry);
        }
      };

      return () => {
        moveToFront();
        server.httpServer?.on("listening", moveToFront);
      };
    },
  };
}

// https://astro.build/config
export default defineConfig({
  vite: {
    resolve: {
      alias: {
        "@": path.resolve("./src"),
        "@components": path.resolve("./src/components"),
        "@layouts": path.resolve("./src/layouts"),
        "@lib": path.resolve("./src/lib"),
        "@styles": path.resolve("./src/styles"),
      },
    },
    plugins: [proxyApiBeforeTrailingSlash(), tailwindcss()],
    server: {
      proxy: {
        "/api": "http://127.0.0.1:8080",
      },
    },
  },
  output: "static",
  trailingSlash: "always",
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  build: {
    format: "directory",
  },
  integrations: [react()],
});
