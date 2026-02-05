import { NodeHtmlMarkdown } from "node-html-markdown"

const nhm = new NodeHtmlMarkdown(
  {
    // options
    keepDataImages: false,
    useLinkReferenceDefinitions: false,
  },
  undefined, // customTransformers
  undefined // customCodeBlockTranslators
)

export default function htmlToMarkdown(html, url = "") {
  try {
    if (!html) return ""
    return nhm.translate(html)
  } catch (e) {
    console.error("HTML to Markdown conversion failed:", e)
    return "Error parsing content: " + e.message
  }
}
