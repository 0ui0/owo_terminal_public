import getColor from "./getColor.js"
import getSize from "./getSize.js"

export default (themeColorName, baseBgName) => {
  const themeColor = getColor(themeColorName)
  const baseBg = getColor(baseBgName) + "99"


  // 顶部左右两个椭圆（顶点处圆心 at 0% 0% 和 100% 0%），底部正中一个椭圆（圆心 at 50% 100%）
  return `radial-gradient(ellipse 25% ${getSize(30)}rem at 0% 0%, ${themeColor + "1A"} 0%, transparent 100%), 
  radial-gradient(ellipse 35% ${getSize(15)}rem at 50% 0%, ${themeColor + "1A"} 0%, transparent 100%), 
  radial-gradient(ellipse 25% ${getSize(30)}rem at 100% 0%, ${themeColor + "1A"} 0%, transparent 100%), 
  radial-gradient(ellipse 25% ${getSize(30)}rem at 50% 100%, ${themeColor + "14"} 0%, transparent 100%)
  ${baseBg}
  `
}
