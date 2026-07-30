export default {
  getSvg(type, config = {}) {
    const size = config.size || "1.2rem"
    const color = config.fill || "currentColor"
    const strokeWidth = config.strokeWidth || 2

    const svgStyle = `width:${size};height:${size};display:inline-block;vertical-align:middle;fill:none;stroke:${color};stroke-width:${strokeWidth};stroke-linecap:round;stroke-linejoin:round;`

    switch (type) {
      case "FolderOpen":
        return `<svg style="${svgStyle}" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="2" y1="10" x2="22" y2="10"></line></svg>`

      case "ZoomIn":
        return `<svg style="${svgStyle}" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>`

      case "ZoomOut":
        return `<svg style="${svgStyle}" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>`

      case "RotateLeft":
        return `<svg style="${svgStyle}" viewBox="0 0 24 24"><path d="M2.5 2v6h6"></path><path d="M2.66 15.57a10 10 0 1 0 .57-8.38L2.5 8"></path></svg>`

      case "RotateRight":
        return `<svg style="${svgStyle}" viewBox="0 0 24 24"><path d="M21.5 2v6h-6"></path><path d="M21.34 15.57a10 10 0 1 1-.57-8.38L21.5 8"></path></svg>`

      case "FlipH":
        return `<svg style="${svgStyle}" viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="22" stroke-dasharray="2 2"></line><path d="M4 7l4 10H4z"></path><path d="M20 7l-4 10h4z"></path></svg>`

      case "FlipV":
        return `<svg style="${svgStyle}" viewBox="0 0 24 24"><line x1="2" y1="12" x2="22" y2="12" stroke-dasharray="2 2"></line><path d="M7 4l10 4V4z"></path><path d="M7 20l10-4v4z"></path></svg>`

      case "Grid":
        return `<svg style="${svgStyle}" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`

      case "Info":
        return `<svg style="${svgStyle}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`

      case "Pic":
        return `<svg style="${svgStyle}" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`

      case "Left":
        return `<svg style="${svgStyle}" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>`

      case "Right":
        return `<svg style="${svgStyle}" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>`

      default:
        return `<svg style="${svgStyle}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
    }
  }
}
