import { defineConfig } from "vite";
import pathLib from "path"

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 3000,
    https: false,
    proxy: {
      "/api": { target: "http://localhost:9501", changeOrigin: true },
      "/socket.io": { target: "http://localhost:9501", ws: true },
      "/statics": { target: "http://localhost:9501", changeOrigin: true },
      "/attachment": { target: "http://localhost:9501", changeOrigin: true }
    },
  },
  build: {
    minify: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: pathLib.resolve('./index.html')
      },
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    }
  },
  /*   esbuild: {
      keepNames: true,
      minifyIdentifiers: false,
      minifySyntax: false,
      minifyWhitespace: false,
    }, */
  plugins: [
    //splitVendorChunkPlugin()
  ]
  // Uncomment to use JSX:
  // esbuild: {
  //   jsx: "transform",
  //   jsxFactory: "m",
  //   jsxFragment: "'['",
  // },
});
