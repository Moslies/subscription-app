import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { visualizer } from 'rollup-plugin-visualizer';
// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the Vite server.
// The CLI will eventually stop passing in HOST,
// so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT!) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  server: {
    allowedHosts: [host],
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    reactRouter(),
    tsconfigPaths(),
    visualizer({
      open: true,       // 构建完成后自动在浏览器打开分析页面
      filename: 'stats.html', // 生成的分析报告文件名
      gzipSize: true,   // 显示 Gzip 后的大小
      brotliSize: true  // 显示 Brotli 后的大小
    }),
  ],
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      // 明确列出你不需要打包进扩展的依赖
      external: [
        'react-router',
        'react-router-dom',
        // 如果使用了 prisma，一定不要打包它
        '@prisma/client' 
      ],
      output: {
        manualChunks: undefined,
      }
    }
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react"],
  },
}) satisfies UserConfig;
