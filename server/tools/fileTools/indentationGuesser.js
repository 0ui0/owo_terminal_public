import * as strings from "./strings.js";
import { isLines } from "./editGeneration.js";
var CharCode = /* @__PURE__ */ ((CharCode2) => {
  CharCode2[CharCode2["Tab"] = 9] = "Tab";
  CharCode2[CharCode2["Space"] = 32] = "Space";
  CharCode2[CharCode2["Comma"] = 44] = "Comma";
  return CharCode2;
})(CharCode || {});
class SpacesDiffResult {
  spacesDiff = 0;
  looksLikeAlignment = false;
}
function spacesDiff(a, aLength, b, bLength, result) {
  result.spacesDiff = 0;
  result.looksLikeAlignment = false;
  let i;
  for (i = 0; i < aLength && i < bLength; i++) {
    const aCharCode = a.charCodeAt(i);
    const bCharCode = b.charCodeAt(i);
    if (aCharCode !== bCharCode) {
      break;
    }
  }
  let aSpacesCnt = 0, aTabsCount = 0;
  for (let j = i; j < aLength; j++) {
    const aCharCode = a.charCodeAt(j);
    if (aCharCode === 32 /* Space */) {
      aSpacesCnt++;
    } else {
      aTabsCount++;
    }
  }
  let bSpacesCnt = 0, bTabsCount = 0;
  for (let j = i; j < bLength; j++) {
    const bCharCode = b.charCodeAt(j);
    if (bCharCode === 32 /* Space */) {
      bSpacesCnt++;
    } else {
      bTabsCount++;
    }
  }
  if (aSpacesCnt > 0 && aTabsCount > 0) {
    return;
  }
  if (bSpacesCnt > 0 && bTabsCount > 0) {
    return;
  }
  const tabsDiff = Math.abs(aTabsCount - bTabsCount);
  const spacesDiff2 = Math.abs(aSpacesCnt - bSpacesCnt);
  if (tabsDiff === 0) {
    result.spacesDiff = spacesDiff2;
    if (spacesDiff2 > 0 && 0 <= bSpacesCnt - 1 && bSpacesCnt - 1 < a.length && bSpacesCnt < b.length) {
      if (b.charCodeAt(bSpacesCnt) !== 32 /* Space */ && a.charCodeAt(bSpacesCnt - 1) === 32 /* Space */) {
        if (a.charCodeAt(a.length - 1) === 44 /* Comma */) {
          result.looksLikeAlignment = true;
        }
      }
    }
    return;
  }
  if (spacesDiff2 % tabsDiff === 0) {
    result.spacesDiff = spacesDiff2 / tabsDiff;
    return;
  }
}
function guessFileIndentInfo(source) {
  return { ...guessIndentation(source, 4, false) };
}
function guessIndentation(source, defaultTabSize, defaultInsertSpaces) {
  const linesCount = Math.min(isLines(source) ? source.length : source.lineCount, 1e4);
  let linesIndentedWithTabsCount = 0;
  let linesIndentedWithSpacesCount = 0;
  let previousLineText = "";
  let previousLineIndentation = 0;
  const ALLOWED_TAB_SIZE_GUESSES = [2, 4, 6, 8, 3, 5, 7];
  const MAX_ALLOWED_TAB_SIZE_GUESS = 8;
  const spacesDiffCount = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const tmp = new SpacesDiffResult();
  for (let lineNumber = 0; lineNumber < linesCount; lineNumber++) {
    const currentLineText = isLines(source) ? source[lineNumber] : source.lineAt(lineNumber).text;
    const currentLineLength = currentLineText.length;
    let currentLineHasContent = false;
    let currentLineIndentation = 0;
    let currentLineSpacesCount = 0;
    let currentLineTabsCount = 0;
    for (let j = 0, lenJ = currentLineLength; j < lenJ; j++) {
      const charCode = currentLineText.charCodeAt(j);
      if (charCode === 9 /* Tab */) {
        currentLineTabsCount++;
      } else if (charCode === 32 /* Space */) {
        currentLineSpacesCount++;
      } else {
        currentLineHasContent = true;
        currentLineIndentation = j;
        break;
      }
    }
    if (!currentLineHasContent) {
      continue;
    }
    if (currentLineTabsCount > 0) {
      linesIndentedWithTabsCount++;
    } else if (currentLineSpacesCount > 1) {
      linesIndentedWithSpacesCount++;
    }
    spacesDiff(previousLineText, previousLineIndentation, currentLineText, currentLineIndentation, tmp);
    if (tmp.looksLikeAlignment) {
      if (!(defaultInsertSpaces && defaultTabSize === tmp.spacesDiff)) {
        continue;
      }
    }
    const currentSpacesDiff = tmp.spacesDiff;
    if (currentSpacesDiff <= MAX_ALLOWED_TAB_SIZE_GUESS) {
      spacesDiffCount[currentSpacesDiff]++;
    }
    previousLineText = currentLineText;
    previousLineIndentation = currentLineIndentation;
  }
  let insertSpaces = defaultInsertSpaces;
  if (linesIndentedWithTabsCount !== linesIndentedWithSpacesCount) {
    insertSpaces = linesIndentedWithTabsCount < linesIndentedWithSpacesCount;
  }
  let tabSize = defaultTabSize;
  if (insertSpaces) {
    let tabSizeScore = insertSpaces ? 0 : 0.1 * linesCount;
    ALLOWED_TAB_SIZE_GUESSES.forEach((possibleTabSize) => {
      const possibleTabSizeScore = spacesDiffCount[possibleTabSize];
      if (possibleTabSizeScore > tabSizeScore) {
        tabSizeScore = possibleTabSizeScore;
        tabSize = possibleTabSize;
      }
    });
    if (tabSize === 4 && spacesDiffCount[4] > 0 && spacesDiffCount[2] > 0 && spacesDiffCount[2] >= spacesDiffCount[4] / 2) {
      tabSize = 2;
    }
  }
  return {
    insertSpaces,
    tabSize
  };
}
function computeIndentLevel(line, tabSize) {
  let indent = 0;
  let i = 0;
  const len = line.length;
  while (i < len) {
    const chCode = line.charCodeAt(i);
    if (chCode === 32 /* Space */) {
      indent++;
    } else if (chCode === 9 /* Tab */) {
      indent = indent - indent % tabSize + tabSize;
    } else {
      break;
    }
    i++;
  }
  if (i === len) {
    return ~indent;
  }
  return indent;
}
function computeIndentLevel2(line, tabSize) {
  const result = computeIndentLevel(line, tabSize);
  if (result < 0) {
    return Math.floor(~result / tabSize);
  }
  return Math.floor(result / tabSize);
}
function nextIndentTabStop(visibleColumn, indentSize) {
  return visibleColumn + indentSize - visibleColumn % indentSize;
}
function _normalizeIndentationFromWhitespace(str, indentSize, insertSpaces) {
  let spacesCnt = 0;
  for (let i = 0; i < str.length; i++) {
    if (str.charAt(i) === "	") {
      spacesCnt = nextIndentTabStop(spacesCnt, indentSize);
    } else {
      spacesCnt++;
    }
  }
  let result = "";
  if (!insertSpaces) {
    const tabsCnt = Math.floor(spacesCnt / indentSize);
    spacesCnt = spacesCnt % indentSize;
    for (let i = 0; i < tabsCnt; i++) {
      result += "	";
    }
  }
  for (let i = 0; i < spacesCnt; i++) {
    result += " ";
  }
  return result;
}
function normalizeIndentation(str, indentSize, insertSpaces) {
  let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(str);
  if (firstNonWhitespaceIndex === -1) {
    firstNonWhitespaceIndex = str.length;
  }
  return _normalizeIndentationFromWhitespace(str.substring(0, firstNonWhitespaceIndex), indentSize, insertSpaces) + str.substring(firstNonWhitespaceIndex);
}
function getIndentationChar(indentation) {
  if (indentation.insertSpaces) {
    return " ".repeat(indentation.tabSize);
  } else {
    return "	";
  }
}
function transformIndentation(content, fromIndent, toIndent) {
  if (fromIndent.insertSpaces === toIndent.insertSpaces && fromIndent.tabSize === toIndent.tabSize) {
    return content;
  }
  const fromChr = getIndentationChar(fromIndent);
  const toChr = getIndentationChar(toIndent);
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    let k = 0;
    while (lines[i].slice(k, k + fromChr.length) === fromChr) {
      k += fromChr.length;
    }
    lines[i] = toChr.repeat(k / fromChr.length) + lines[i].slice(k);
  }
  return lines.join("\n");
}
export {
  computeIndentLevel2,
  getIndentationChar,
  guessFileIndentInfo,
  guessIndentation,
  normalizeIndentation,
  transformIndentation
};
