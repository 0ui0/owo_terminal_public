export default function getAppIconUrl(appType, rawIcon) {
  if (!appType || appType === "undefined") {
    return "/statics/navbar/program.svg"
  }
  const icon = rawIcon || "icon.svg"
  if (!icon || icon.startsWith("http://") || icon.startsWith("https://") || icon.startsWith("/")) {
    return icon || "/statics/navbar/program.svg"
  }
  return `/api/apps/${appType}/${icon}`
}
