import { defineConfig } from "vite";
import pathLib from "path"

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 3000,
    https: false,
    /* proxy:{
      "/api":{
        target:"http://localhost:9501",
        changeOrigin:true,
        //rewrite:(path) => path.replace(/^\/api/,"")
      }
    }, */
  },
  build: {
    /*sourcemap:true,*/
    rollupOptions: {
      input: {
        main: pathLib.resolve('./index.html')
      },

      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
        //preserveModules: true,
      },
      //preserveEntrySignatures:true

    }
  },
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
