export default function getAppIconUrl(appType, rawIcon) {
  const icon = rawIcon || "icon.svg"
  if (!icon || icon.startsWith("http://") || icon.startsWith("https://") || icon.startsWith("/")) {
    return icon || "/statics/navbar/program.svg"
  }
  return `/api/apps/${appType}/${icon}`
}
