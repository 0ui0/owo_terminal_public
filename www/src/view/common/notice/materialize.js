// 固化尺寸函数
// 自适应尺寸的窗口（width/height 为 0）在移动、拉伸、脱壳前必须固化为物理像素
export default function materialize(dom, win) {
  const isAuto = (win.width === 0 || win.height === 0)
  if (isAuto && dom) {
    const rect = dom.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return
    win.width = rect.width
    win.height = rect.height
    win.x = rect.left
    win.y = rect.top
  }
}
