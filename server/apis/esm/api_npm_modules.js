import { createRequire } from "module"
import { fileURLToPath } from "url"
import pathLib from "path"
import fs from "fs-extra"
import { rolldown } from "rolldown"
import { resolve } from "resolve.exports"

const require = createRequire(import.meta.url)
const cacheMap = new Map()

// 🌟 物理锚定工程根目录与 node_modules（彻底免疫 process.chdir 的影响）
const rootDir = pathLib.resolve(pathLib.dirname(fileURLToPath(import.meta.url)), "../../../")
const nodeModulesDir = pathLib.join(rootDir, "node_modules")

// 🌟 对齐 Vite 核心源码算法：从 node_modules 寻找包并按浏览器规范解析入口
function resolveVitePackageEntry(pkgPath) {
  // 1. 如果物理文件直接存在（支持深路径如 katex/dist/katex.min.js，css 文件等）
  const directPath = pathLib.resolve(nodeModulesDir, pkgPath)
  if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
    return directPath
  }

  // 2. 分离包名与子路径 (兼容 @scope/pkg 与普通 pkg)
  let pkgName = ""
  let subpath = "."
  if (pkgPath.startsWith("@")) {
    const parts = pkgPath.split("/")
    pkgName = parts.slice(0, 2).join("/")
    if (parts.length > 2) subpath = "./" + parts.slice(2).join("/")
  } else {
    const parts = pkgPath.split("/")
    pkgName = parts[0]
    if (parts.length > 1) subpath = "./" + parts.slice(1).join("/")
  }

  // 3. 定位真实包目录 (直接以工程根目录下的 node_modules 为基准)
  let pkgDir = pathLib.resolve(nodeModulesDir, pkgName)
  if (!fs.existsSync(pkgDir)) {
    pkgName = pkgName.replace(/\.js$/, "")
    pkgDir = pathLib.resolve(nodeModulesDir, pkgName)
  }

  const pkgJsonPath = pathLib.join(pkgDir, "package.json")
  if (!fs.existsSync(pkgJsonPath)) {
    throw new Error(`找不到模块 package.json: ${pkgName} -> ${pkgJsonPath}`)
  }

  const pkgData = fs.readJsonSync(pkgJsonPath)

  // 4. 解析入口 (完全对齐 Vite resolvePackageEntry: exports -> browser -> module -> main)
  let entry = ""
  if (pkgData.exports) {
    try {
      const res = resolve(pkgData, subpath === "." ? "." : subpath.replace(/\.js$/, ""), {
        conditions: ["browser", "import", "default", "development"],
        unsafe: true
      })
      if (res) entry = Array.isArray(res) ? res[0] : res
    } catch {}
  }

  if (!entry) {
    entry = (typeof pkgData.browser === "string" ? pkgData.browser : null)
      || pkgData.module
      || pkgData.main
      || "index.js"
  }

  const finalPath = pathLib.resolve(pkgDir, entry)
  if (!fs.existsSync(finalPath)) {
    throw new Error(`解析出的模块文件不存在: ${pkgPath} -> ${finalPath}`)
  }
  return finalPath
}

export default async () => {
  return {
    method: "GET",
    path: "/@npm/{pkgPath*}",
    handler: async (req, h) => {
      const pkgPath = req.params.pkgPath
      try {
        if (!cacheMap.has(pkgPath)) {
          // 1. CSS 资源：直接读取纯文本包装为 export default 模块 (替代原 ?raw)
          if (pkgPath.endsWith(".css")) {
            let cssPath = pathLib.resolve(nodeModulesDir, pkgPath)
            if (!fs.existsSync(cssPath)) cssPath = require.resolve(pkgPath)
            const cssModule = `export default ${JSON.stringify(fs.readFileSync(cssPath, "utf-8"))};`
            cacheMap.set(pkgPath, cssModule)
            return h.response(cssModule).type("application/javascript; charset=utf-8")
          }

          // 2. 对齐 Vite 官方算法定位浏览器入口
          const entryPath = resolveVitePackageEntry(pkgPath)

          // 3. Rolldown 内存转译为纯 ESM (禁用代码分割，确保单包完全内联自洽)
          const bundle = await rolldown({
            input: entryPath,
            platform: "browser",
            logLevel: "silent"
          })
          const { output } = await bundle.generate({
            format: "esm",
            codeSplitting: false
          })
          await bundle.close()

          for (const item of output) {
            if (item.code) {
              let chunkSource = item.code
              // 4. CJS 具名解构桥接：补齐 import { FitAddon, Terminal } 等解构导出
              if (chunkSource.includes("export default require_")) {
                const raw = fs.readFileSync(entryPath, "utf-8")
                const names = [...new Set([...raw.matchAll(/(?:exports\.|\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:void 0|class|function))/g)].map(m => m[1]).filter(Boolean))]
                chunkSource = chunkSource.replace(/export default (require_[a-zA-Z0-9_$]+)\(\);?\s*$/, (m, fn) => {
                  return `const __mod = ${fn}();\nexport default __mod;\n${names.length ? `export const { ${names.join(", ")} } = __mod;\n` : ""}`
                })
              }
              cacheMap.set(item.fileName, chunkSource)
              if (item.isEntry || item === output[0]) {
                cacheMap.set(pkgPath, chunkSource)
              }
            }
          }
        }
        return h.response(cacheMap.get(pkgPath)).type("application/javascript; charset=utf-8")
      } catch (err) {
        console.error("[@npm] 转译失败:", err)
        return h.response(`console.error("[@npm] 转译失败: " + ${JSON.stringify(err.message)});\nthrow new Error("[@npm] 转译失败: " + ${JSON.stringify(err.message)});`)
          .code(500)
          .type("application/javascript; charset=utf-8")
      }
    }
  }
}
