function getFenceForCodeBlock(code, minNumberOfBackticks = 3) {
  const backticks = code.matchAll(/^\s*(```+)/gm);
  const backticksNeeded = Math.max(minNumberOfBackticks, ...Array.from(backticks, (d) => d[1].length + 1));
  return "`".repeat(backticksNeeded);
}
const filepathCodeBlockMarker = "filepath:";
function createFilepathRegexp(languageId) {
  const language = getLanguage(languageId);
  const prefixes = ["#", "\\/\\/"];
  const suffixes = [];
  function add(lineComment) {
    prefixes.push(escapeRegExpCharacters(lineComment.start));
    if (lineComment.end) {
      suffixes.push(escapeRegExpCharacters(lineComment.end));
    }
  }
  add(language.lineComment);
  language.alternativeLineComments?.forEach(add);
  const startMatch = `(?:${prefixes.join("|")})`;
  const optionalEndMatch = suffixes.length ? `(?:\\s*${suffixes.join("|")})?` : "";
  return new RegExp(`^\\s*${startMatch}\\s*${filepathCodeBlockMarker}\\s*(.*?)${optionalEndMatch}\\s*$`);
}
function createFencedCodeBlock(languageId, code, shouldTrim = true, filePath, minNumberOfBackticksOrStyle = 3) {
  const fence = typeof minNumberOfBackticksOrStyle === "number" ? getFenceForCodeBlock(code, minNumberOfBackticksOrStyle) : minNumberOfBackticksOrStyle;
  let filepathComment = "";
  if (filePath) {
    filepathComment = getFilepathComment(languageId, filePath);
  }
  return `${fence}${fence && languageIdToMDCodeBlockLang(languageId) + "\n"}${filepathComment}${shouldTrim ? code.trim() : code}${fence && "\n" + fence}`;
}
function getFilepathComment(languageId, filePath) {
  const language = getLanguage(languageId);
  const { start, end } = language.lineComment;
  return end ? `${start} ${filepathCodeBlockMarker} ${filePath} ${end}
` : `${start} ${filepathCodeBlockMarker} ${filePath}
`;
}
function removeLeadingFilepathComment(codeblock, languageId, filepath) {
  const filepathComment = getFilepathComment(languageId, filepath);
  if (codeblock.startsWith(filepathComment)) {
    return codeblock.substring(filepathComment.length);
  }
  return codeblock;
}
function languageIdToMDCodeBlockLang(languageId) {
  const language = getLanguage(languageId);
  return language?.markdownLanguageIds?.[0] ?? languageId;
}
const mdLanguageIdToLanguageId = new Lazy(() => {
  const result = /* @__PURE__ */ new Map();
  wellKnownLanguages.forEach((language, languageId) => {
    if (language.markdownLanguageIds) {
      language.markdownLanguageIds.forEach((mdLanguageId) => {
        result.set(mdLanguageId, languageId);
      });
    } else {
      result.set(languageId, languageId);
    }
  });
  return result;
});
function mdCodeBlockLangToLanguageId(mdLanguageId) {
  return mdLanguageIdToLanguageId.value.get(mdLanguageId);
}
function getLanguageId(uri) {
  const ext = extname(uri).toLowerCase();
  return Object.keys(wellKnownLanguages).find((id) => {
    return wellKnownLanguages.get(id)?.extensions?.includes(ext);
  }) || ext.replace(/^\./, "");
}
function getMdCodeBlockLanguage(uri) {
  const languageId = getLanguageId(uri);
  return languageIdToMDCodeBlockLang(languageId);
}
function extractCodeBlocks(text) {
  const out = [];
  const md = new MarkdownIt();
  const tokens = md.parse(text, {});
  for (const token of flattenTokensLists(tokens)) {
    if (token.map && token.type === "fence") {
      out.push({
        startMarkup: token.markup,
        // Trim trailing newline since this is always included
        code: token.content.replace(/\n$/, ""),
        language: token.info.trim(),
        startLine: token.map[0],
        endLine: token.map[1]
      });
    }
  }
  return out;
}
function extractInlineCode(text) {
  const out = [];
  const md = new MarkdownIt();
  const tokens = md.parse(text, {});
  for (const token of flattenTokensLists(tokens)) {
    if (token.type === "code_inline") {
      out.push(token.content.replace(/\n$/, ""));
    }
  }
  return out;
}
function* flattenTokensLists(tokensList) {
  for (const entry of tokensList) {
    if (entry.children) {
      yield* flattenTokensLists(entry.children);
    }
    yield entry;
  }
}
export {
  createFencedCodeBlock,
  createFilepathRegexp,
  extractCodeBlocks,
  extractInlineCode,
  filepathCodeBlockMarker,
  getFenceForCodeBlock,
  getFilepathComment,
  getLanguageId,
  getMdCodeBlockLanguage,
  languageIdToMDCodeBlockLang,
  mdCodeBlockLangToLanguageId,
  removeLeadingFilepathComment
};
