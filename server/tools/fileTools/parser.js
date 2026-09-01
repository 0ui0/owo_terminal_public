import { computeLevenshteinDistance } from "./diff.js";

function getFilepathComment(languageId, filePath) {
  return "";
}

function isFalsyOrWhitespace(str) {
  return !str || str.trim().length === 0;
}

function count(haystack, needle) {
  if (!needle) return 0;
  let cnt = 0, pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    cnt++;
    pos += needle.length;
  }
  return cnt;
}
import { Lines } from "./editGeneration.js";
import { computeIndentLevel2, getIndentationChar, guessIndentation, transformIndentation } from "./indentationGuesser.js";
import {
  ADD_FILE_PREFIX,
  DELETE_FILE_PREFIX,
  END_OF_FILE_PREFIX,
  HUNK_ADD_LINE_PREFIX,
  HUNK_DELETE_LINE_PREFIX,
  MOVE_FILE_TO_PREFIX,
  PATCH_PREFIX,
  PATCH_SUFFIX,
  UPDATE_FILE_PREFIX
} from "./parseApplyPatch.js";
const CHUNK_DELIMITER = "@@";
const EDIT_DISTANCE_ALLOWANCE_PER_LINE = 0.34;
const AVOID_EXPLICIT_TABS_REGEX = /\.(tex|latex|sty|cls|bib|bst|ins)$/i;
var ActionType = /* @__PURE__ */ ((ActionType2) => {
  ActionType2["ADD"] = "add";
  ActionType2["DELETE"] = "delete";
  ActionType2["UPDATE"] = "update";
  return ActionType2;
})(ActionType || {});
var Fuzz = /* @__PURE__ */ ((Fuzz2) => {
  Fuzz2[Fuzz2["None"] = 0] = "None";
  Fuzz2[Fuzz2["IgnoredTrailingWhitespace"] = 2] = "IgnoredTrailingWhitespace";
  Fuzz2[Fuzz2["NormalizedExplicitTab"] = 4] = "NormalizedExplicitTab";
  Fuzz2[Fuzz2["IgnoredWhitespace"] = 8] = "IgnoredWhitespace";
  Fuzz2[Fuzz2["EditDistanceMatch"] = 16] = "EditDistanceMatch";
  Fuzz2[Fuzz2["IgnoredEofSignal"] = 32] = "IgnoredEofSignal";
  Fuzz2[Fuzz2["MergedOperatorSection"] = 64] = "MergedOperatorSection";
  Fuzz2[Fuzz2["NormalizedExplicitNL"] = 128] = "NormalizedExplicitNL";
  return Fuzz2;
})(Fuzz || {});
function assemble_changes(orig, updatedFiles) {
  const commit = { changes: {} };
  for (const [p, newContent] of Object.entries(updatedFiles)) {
    const oldContent = orig[p];
    if (oldContent === newContent) {
      continue;
    }
    if (oldContent !== void 0 && newContent !== void 0) {
      commit.changes[p] = {
        type: "update" /* UPDATE */,
        oldContent,
        newContent
      };
    } else if (newContent !== void 0) {
      commit.changes[p] = {
        type: "add" /* ADD */,
        newContent
      };
    } else if (oldContent !== void 0) {
      commit.changes[p] = {
        type: "delete" /* DELETE */,
        oldContent
      };
    } else {
      throw new Error("Unexpected state in assemble_changes");
    }
  }
  return commit;
}
class DiffError extends Error {
}
class InvalidContextError extends DiffError {
  constructor(message, file, kindForTelemetry) {
    super(message);
    this.file = file;
    this.kindForTelemetry = kindForTelemetry;
  }
}
class InvalidPatchFormatError extends DiffError {
  constructor(message, kindForTelemetry) {
    super(message);
    this.kindForTelemetry = kindForTelemetry;
  }
}
class Parser {
  current_files;
  indent_styles = {};
  lines;
  index = 0;
  patch = { actions: {} };
  fuzz = 0;
  constructor(currentFiles, lines) {
    this.current_files = currentFiles;
    this.lines = lines;
    for (const [path, doc] of Object.entries(currentFiles)) {
      this.indent_styles[path] = guessIndentation(Lines.fromString(doc.getText()), 4, false);
    }
  }
  is_done(prefixes) {
    if (this.index >= this.lines.length) {
      return true;
    }
    if (prefixes && prefixes.some((p) => this.lines[this.index].startsWith(p.trim()))) {
      return true;
    }
    return false;
  }
  startswith(prefix) {
    const prefixes = Array.isArray(prefix) ? prefix : [prefix];
    return prefixes.some((p) => this.lines[this.index].startsWith(p));
  }
  read_str(prefix = "", returnEverything = false) {
    if (this.index >= this.lines.length) {
      throw new DiffError(`Index: ${this.index} >= ${this.lines.length}`);
    }
    if (this.lines[this.index].startsWith(prefix)) {
      const text = returnEverything ? this.lines[this.index] : this.lines[this.index].slice(prefix.length);
      this.index += 1;
      return text ?? "";
    }
    return "";
  }
  parse() {
    while (!this.is_done([PATCH_SUFFIX])) {
      let path = this.read_str(UPDATE_FILE_PREFIX);
      if (path) {
        if (this.patch.actions[path]) {
          throw new DiffError(`Update File Error: Duplicate Path: ${path}`);
        }
        const moveTo = this.read_str(MOVE_FILE_TO_PREFIX);
        if (!(path in this.current_files)) {
          throw new DiffError(`Update File Error: Missing File: ${path}`);
        }
        const textDocument = this.current_files[path];
        const indentStyle = this.indent_styles[path];
        const text = textDocument.getText();
        const action = this.parse_update_file(getFilepathComment(textDocument.languageId, path), text ?? "", indentStyle);
        action.movePath = moveTo || void 0;
        this.patch.actions[path] = action;
        continue;
      }
      path = this.read_str(DELETE_FILE_PREFIX);
      if (path) {
        if (this.patch.actions[path]) {
          throw new DiffError(`Delete File Error: Duplicate Path: ${path}`);
        }
        if (!(path in this.current_files)) {
          throw new DiffError(`Delete File Error: Missing File: ${path}`);
        }
        this.patch.actions[path] = { type: "delete" /* DELETE */, chunks: [] };
        continue;
      }
      path = this.read_str(ADD_FILE_PREFIX);
      if (path) {
        if (this.patch.actions[path]) {
          throw new DiffError(`Add File Error: Duplicate Path: ${path}`);
        }
        if (path in this.current_files) {
          throw new DiffError(`Add File Error: File already exists: ${path}`);
        }
        this.patch.actions[path] = this.parse_add_file();
        continue;
      }
      throw new DiffError(`Unknown Line: ${this.lines[this.index]}`);
    }
    if (!this.startswith(PATCH_SUFFIX.trim())) {
      throw new InvalidPatchFormatError("Missing End Patch", "missingEndPatch");
    }
    this.index += 1;
  }
  parse_update_file(path, text, targetIndentStyle) {
    const action = { type: "update" /* UPDATE */, chunks: [] };
    const fileLines = text.split("\n");
    const replaceExplicitTabsByDefault = !AVOID_EXPLICIT_TABS_REGEX.test(path.trimEnd());
    let index = 0;
    while (!this.is_done([
      PATCH_SUFFIX,
      UPDATE_FILE_PREFIX,
      DELETE_FILE_PREFIX,
      ADD_FILE_PREFIX,
      END_OF_FILE_PREFIX
    ])) {
      const sectionStr = this.read_str(CHUNK_DELIMITER, true);
      const defStr = sectionStr.slice(CHUNK_DELIMITER.length).trim();
      if (!(sectionStr || index === 0)) {
        throw new DiffError(`Invalid line. Consider splitting each change into individual apply_patch tool calls:
${this.lines[this.index]}`);
      }
      if (defStr) {
        let found = false;
        const canonLocal = (s) => s.normalize("NFC").replace(
          /./gu,
          (c) => ({
            "-": "-",
            "\u2010": "-",
            "\u2011": "-",
            "\u2012": "-",
            "\u2013": "-",
            "\u2014": "-",
            "\u2212": "-",
            '"': '"',
            "\u201C": '"',
            "\u201D": '"',
            "\u201E": '"',
            "\xAB": '"',
            "\xBB": '"',
            "'": `'`,
            "\u2018": `'`,
            "\u2019": `'`,
            "\u201B": `'`,
            "\xA0": " ",
            "\u202F": " "
          })[c] ?? c
        );
        if (!fileLines.slice(0, index).some((s) => canonLocal(s) === canonLocal(defStr))) {
          for (let i = index; i < fileLines.length; i++) {
            if (canonLocal(fileLines[i]) === canonLocal(defStr)) {
              index = i + 1;
              found = true;
              break;
            }
          }
        }
        if (!found && !fileLines.slice(0, index).some((s) => canonLocal(s.trim()) === canonLocal(defStr))) {
          for (let i = index; i < fileLines.length; i++) {
            if (canonLocal(fileLines[i].trim()) === canonLocal(defStr)) {
              index = i + 1;
              this.fuzz += 1;
              found = true;
              break;
            }
          }
        }
      }
      let nextSection = peek_next_section(
        this.lines,
        this.index
      );
      let match;
      for (let i = 0; i <= nextSection.fuzzMerges && !match; i++) {
        if (i > 0) {
          nextSection = peek_next_section(this.lines, this.index, i);
        }
        match = find_context(
          path,
          fileLines,
          nextSection.nextChunkContext,
          index,
          nextSection.eof
        );
        if (!match) {
          match = find_context(
            path,
            fileLines,
            nextSection.nextChunkContext,
            0,
            nextSection.eof
          );
        }
        if (i > 0 && match) {
          match.fuzz |= 64 /* MergedOperatorSection */;
        }
      }
      if (!match) {
        const ctxText = nextSection.nextChunkContext.join("\n");
        if (nextSection.eof) {
          throw new InvalidContextError(`Invalid EOF context at character ${index}:
${ctxText}`, text, "invalidContext-eof");
        } else {
          const kindForTelemetry = ctxText.match(/^\\t/) ? "invalidContext-maybeInvalidTab" : ctxText.match(/^\\\t/) ? "invalidContext-maybeEscapedTab" : "invalidContext";
          throw new InvalidContextError(`Invalid context at character ${index}:
${ctxText}`, text, kindForTelemetry);
        }
      }
      this.fuzz += match.fuzz;
      const srcIndentStyle = guessIndentation(
        nextSection.chunks.flatMap((c) => c.insLines).concat(nextSection.nextChunkContext),
        targetIndentStyle.tabSize,
        targetIndentStyle.insertSpaces
      );
      const matchedLineIndent = computeIndentLevel2(fileLines[match.line], targetIndentStyle.tabSize);
      const normalizedNextChunkContext = match.fuzz & 4 /* NormalizedExplicitTab */ ? replace_explicit_tabs(nextSection.nextChunkContext[0]) : match.fuzz & 128 /* NormalizedExplicitNL */ ? replace_explicit_nl(nextSection.nextChunkContext[0]) : nextSection.nextChunkContext[0];
      const srcLineIndent = nextSection.nextChunkContext && nextSection.nextChunkContext.length > 0 ? computeIndentLevel2(normalizedNextChunkContext, srcIndentStyle.tabSize) : 0;
      const additionalIndentation = getIndentationChar(targetIndentStyle).repeat(Math.max(0, matchedLineIndent - srcLineIndent));
      for (const ch of nextSection.chunks) {
        ch.origIndex += match.line;
        if (match.fuzz & 128 /* NormalizedExplicitNL */) {
          ch.insLines = ch.insLines.map(replace_explicit_nl);
          ch.delLines = ch.delLines.map(replace_explicit_nl);
        }
        if (replaceExplicitTabsByDefault || match.fuzz & 4 /* NormalizedExplicitTab */) {
          ch.insLines = ch.insLines.map(replace_explicit_tabs);
        }
        ch.insLines = ch.insLines.map((ins) => isFalsyOrWhitespace(ins) ? ins : additionalIndentation + transformIndentation(ins, srcIndentStyle, targetIndentStyle));
        if (match.fuzz & 4 /* NormalizedExplicitTab */) {
          ch.delLines = ch.delLines.map(replace_explicit_tabs);
        }
        action.chunks.push(ch);
      }
      index = match.line + nextSection.nextChunkContext.length;
      this.index = nextSection.endPatchIndex;
    }
    return action;
  }
  parse_add_file() {
    const lines = [];
    while (!this.is_done([
      PATCH_SUFFIX,
      UPDATE_FILE_PREFIX,
      DELETE_FILE_PREFIX,
      ADD_FILE_PREFIX
    ])) {
      const s = this.read_str();
      if (!s.startsWith(HUNK_ADD_LINE_PREFIX)) {
        throw new InvalidPatchFormatError(`Invalid Add File Line: ${s}`, "invalidAddFileLine");
      }
      lines.push(s.slice(1));
    }
    return {
      type: "add" /* ADD */,
      newFile: lines.join("\n"),
      chunks: []
    };
  }
}
function replace_explicit_tabs(s) {
  return s.replace(/^(?:\s|\\t|\/|#)*/gm, (r) => r.replaceAll("\\t", "	"));
}
function replace_explicit_nl(s) {
  return replace_explicit_tabs(s.replaceAll("\\n", "\n"));
}
function find_context_core(lines, context, start) {
  const PUNCT_EQUIV = {
    // Hyphen / dash variants --------------------------------------------------
    /* U+002D HYPHEN-MINUS */
    "-": "-",
    /* U+2010 HYPHEN */
    "\u2010": "-",
    /* U+2011 NO-BREAK HYPHEN */
    "\u2011": "-",
    /* U+2012 FIGURE DASH */
    "\u2012": "-",
    /* U+2013 EN DASH */
    "\u2013": "-",
    /* U+2014 EM DASH */
    "\u2014": "-",
    /* U+2212 MINUS SIGN */
    "\u2212": "-",
    // Double quotes -----------------------------------------------------------
    /* U+0022 QUOTATION MARK */
    '"': '"',
    /* U+201C LEFT DOUBLE QUOTATION MARK */
    "\u201C": '"',
    /* U+201D RIGHT DOUBLE QUOTATION MARK */
    "\u201D": '"',
    /* U+201E DOUBLE LOW-9 QUOTATION MARK */
    "\u201E": '"',
    /* U+00AB LEFT-POINTING DOUBLE ANGLE QUOTATION MARK */
    "\xAB": '"',
    /* U+00BB RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK */
    "\xBB": '"',
    // Single quotes -----------------------------------------------------------
    /* U+0027 APOSTROPHE */
    "'": `'`,
    /* U+2018 LEFT SINGLE QUOTATION MARK */
    "\u2018": `'`,
    /* U+2019 RIGHT SINGLE QUOTATION MARK */
    "\u2019": `'`,
    /* U+201B SINGLE HIGH-REVERSED-9 QUOTATION MARK */
    "\u201B": `'`,
    // Spaces ------------------------------------------------------------------
    /* U+00A0 NO-BREAK SPACE */
    "\xA0": " ",
    /* U+202F NARROW NO-BREAK SPACE */
    "\u202F": " "
  };
  const canon = (s) => s.normalize("NFC").replace(/./gu, (c) => PUNCT_EQUIV[c] ?? c);
  if (context.length === 0) {
    return { line: start, fuzz: 0 /* None */ };
  }
  const ctxPass1 = canon(context.join("\n"));
  const workingLines = lines.map(canon);
  for (let i = start; i < workingLines.length; i++) {
    const segment = workingLines.slice(i, i + context.length).join("\n");
    if (segment === ctxPass1) {
      return { line: i, fuzz: 0 /* None */ };
    }
  }
  const ctxPass2 = ctxPass1.split("\n").map((l) => l.trimEnd()).join("\n");
  let fuzz = 2 /* IgnoredTrailingWhitespace */;
  for (let i = start; i < workingLines.length; i++) {
    workingLines[i] = workingLines[i].trimEnd();
  }
  for (let i = start; i < lines.length; i++) {
    if (workingLines.slice(i, i + context.length).join("\n") === ctxPass2) {
      return { line: i, fuzz };
    }
  }
  const ctxPass3 = replace_explicit_tabs(ctxPass2);
  if (ctxPass3 !== ctxPass2) {
    fuzz |= 4 /* NormalizedExplicitTab */;
    for (let i = start; i < lines.length; i++) {
      if (workingLines.slice(i, i + context.length).join("\n") === ctxPass3) {
        return { line: i, fuzz };
      }
    }
  }
  if (context.length === 1) {
    const ctxPass4 = replace_explicit_nl(ctxPass3);
    if (ctxPass4 !== ctxPass3) {
      const newContextLines = count(ctxPass4, "\n") + 1;
      for (let i = start; i < lines.length; i++) {
        if (workingLines.slice(i, i + newContextLines).join("\n") === ctxPass4) {
          return { line: i, fuzz: fuzz | 128 /* NormalizedExplicitNL */ | 4 /* NormalizedExplicitTab */ };
        }
      }
    }
  }
  const ctxPass5 = ctxPass3.split("\n").map((l) => l.trim()).join("\n");
  fuzz |= 8 /* IgnoredWhitespace */;
  for (let i = start; i < workingLines.length; i++) {
    workingLines[i] = workingLines[i].trimStart();
  }
  for (let i = start; i < lines.length; i++) {
    if (workingLines.slice(i, i + context.length).join("\n") === ctxPass5) {
      return { line: i, fuzz, indent: workingLines[i] };
    }
  }
  const maxDistance = Math.floor(context.length * EDIT_DISTANCE_ALLOWANCE_PER_LINE);
  fuzz |= 16 /* EditDistanceMatch */;
  if (maxDistance > 0) {
    const ctxPass6 = ctxPass5.split("\n");
    for (let i = start; i < lines.length; i++) {
      let totalDistance = 0;
      for (let j = 0; j < ctxPass6.length && totalDistance < maxDistance; j++) {
        totalDistance += computeLevenshteinDistance(workingLines[i + j], ctxPass6[j]);
      }
      if (totalDistance <= maxDistance) {
        return { line: i, fuzz };
      }
    }
  }
}
function find_context(path, lines, context, start, eof) {
  path = path.trim();
  if (path && lines[0]?.includes(path)) {
    lines = lines.slice(1);
  }
  if (path && context[0]?.includes(path)) {
    context = context.slice(1);
  }
  if (eof) {
    const match1 = find_context_core(
      lines,
      context,
      lines.length - context.length
    );
    if (match1) {
      return match1;
    }
    const match2 = find_context_core(lines, context, start);
    if (match2) {
      match2.fuzz |= 32 /* IgnoredEofSignal */;
      return match2;
    }
  }
  return find_context_core(lines, context, start);
}
function peek_next_section(lines, initialIndex, fuzzMerge = 0) {
  let Mode;
  ((Mode2) => {
    Mode2[Mode2["Add"] = 0] = "Add";
    Mode2[Mode2["Delete"] = 1] = "Delete";
    Mode2[Mode2["Keep"] = 2] = "Keep";
  })(Mode || (Mode = {}));
  let index = initialIndex;
  const old = [];
  let delLines = [];
  let insLines = [];
  const chunks = [];
  let mode = 2 /* Keep */;
  let fuzzMergeNo = 0;
  while (index < lines.length) {
    const s = lines[index];
    if ([
      CHUNK_DELIMITER,
      PATCH_SUFFIX,
      UPDATE_FILE_PREFIX,
      DELETE_FILE_PREFIX,
      ADD_FILE_PREFIX,
      END_OF_FILE_PREFIX
    ].some((p) => s.startsWith(p.trim()))) {
      if (mode === 2 /* Keep */ && old.length && !/\S/.test(old[old.length - 1])) {
        old.pop();
      }
      break;
    }
    if (s === "***") {
      break;
    }
    if (s.startsWith("***")) {
      throw new InvalidPatchFormatError(`Invalid Line: ${s}`, "invalidLine");
    }
    index += 1;
    const lastMode = mode;
    let line = s;
    if (line[0] === HUNK_ADD_LINE_PREFIX) {
      mode = 0 /* Add */;
    } else if (line[0] === HUNK_DELETE_LINE_PREFIX) {
      mode = 1 /* Delete */;
    } else if (line[0] === " ") {
      mode = 2 /* Keep */;
    } else {
      const nextLine = lines[index];
      const nextOp = nextLine?.[0] === HUNK_ADD_LINE_PREFIX ? 0 /* Add */ : nextLine?.[0] === HUNK_DELETE_LINE_PREFIX ? 1 /* Delete */ : 2 /* Keep */;
      const canFuzz = mode !== 2 /* Keep */ && nextOp === mode;
      mode = 2 /* Keep */;
      line = " " + line;
      if (canFuzz) {
        fuzzMergeNo++;
        if (fuzzMerge === fuzzMergeNo) {
          mode = nextOp;
        }
      }
    }
    line = line.slice(1);
    if (mode === 2 /* Keep */ && lastMode !== mode) {
      if (insLines.length || delLines.length) {
        chunks.push({
          origIndex: old.length - delLines.length,
          delLines,
          insLines
        });
      }
      delLines = [];
      insLines = [];
    }
    if (mode === 1 /* Delete */) {
      delLines.push(line);
      old.push(line);
    } else if (mode === 0 /* Add */) {
      insLines.push(line);
    } else {
      old.push(line);
    }
  }
  if (insLines.length || delLines.length) {
    chunks.push({
      origIndex: old.length - delLines.length,
      delLines,
      insLines
    });
  }
  if (index < lines.length && lines[index] === END_OF_FILE_PREFIX) {
    index += 1;
    return { nextChunkContext: old, chunks, endPatchIndex: index, eof: true, fuzzMerges: fuzzMergeNo };
  }
  return { nextChunkContext: old, chunks, endPatchIndex: index, eof: false, fuzzMerges: fuzzMergeNo };
}
function text_to_patch(text, orig) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) {
    throw new InvalidPatchFormatError("Invalid patch text", "invalidPatchText");
  }
  const patchPrefix = PATCH_PREFIX.trim();
  if (!(lines[0] ?? "").startsWith(patchPrefix)) {
    throw new InvalidPatchFormatError(`Invalid patch text. Patch must start with ${patchPrefix}.`, "invalidPatchTextPrefix");
  }
  const patchSuffix = PATCH_SUFFIX.trim();
  if (lines[lines.length - 1] !== patchSuffix) {
    lines.push(patchSuffix);
  }
  const parser = new Parser(orig, lines);
  parser.index = 1;
  parser.parse();
  return [parser.patch, parser.fuzz];
}
function identify_files_affected(text) {
  const lines = text.trim().split("\n");
  const result = /* @__PURE__ */ new Set();
  for (const line of lines) {
    if (line.startsWith(UPDATE_FILE_PREFIX)) {
      result.add(line.slice(UPDATE_FILE_PREFIX.length));
    } else if (line.startsWith(DELETE_FILE_PREFIX)) {
      result.add(line.slice(DELETE_FILE_PREFIX.length));
    } else if (line.startsWith(MOVE_FILE_TO_PREFIX)) {
      result.add(line.slice(MOVE_FILE_TO_PREFIX.length));
    } else if (line.startsWith(DELETE_FILE_PREFIX)) {
      result.add(line.slice(DELETE_FILE_PREFIX.length));
    } else if (line.startsWith(ADD_FILE_PREFIX)) {
      result.add(line.slice(ADD_FILE_PREFIX.length));
    }
  }
  return [...result];
}
function identify_files_needed(text) {
  const lines = text.trim().split("\n");
  const result = /* @__PURE__ */ new Set();
  for (const line of lines) {
    if (line.startsWith(UPDATE_FILE_PREFIX)) {
      result.add(line.slice(UPDATE_FILE_PREFIX.length));
    }
    if (line.startsWith(DELETE_FILE_PREFIX)) {
      result.add(line.slice(DELETE_FILE_PREFIX.length));
    }
  }
  return [...result];
}
function identify_files_added(text) {
  const lines = text.trim().split("\n");
  const result = /* @__PURE__ */ new Set();
  for (const line of lines) {
    if (line.startsWith(ADD_FILE_PREFIX)) {
      result.add(line.slice(ADD_FILE_PREFIX.length));
    }
  }
  return [...result];
}
function _get_updated_file(text, action, path) {
  if (action.type !== "update" /* UPDATE */) {
    throw new Error("Expected UPDATE action");
  }
  const origLines = text.split("\n");
  const destLines = [];
  let origIndex = 0;
  for (const chunk of action.chunks) {
    if (chunk.origIndex > origLines.length) {
      throw new DiffError(
        `${path}: chunk.origIndex ${chunk.origIndex} > len(lines) ${origLines.length}`
      );
    }
    if (origIndex > chunk.origIndex) {
      throw new DiffError(
        `${path}: origIndex ${origIndex} > chunk.origIndex ${chunk.origIndex}`
      );
    }
    destLines.push(...origLines.slice(origIndex, chunk.origIndex));
    const delta = chunk.origIndex - origIndex;
    origIndex += delta;
    if (chunk.insLines.length) {
      for (const l of chunk.insLines) {
        destLines.push(l);
      }
    }
    origIndex += chunk.delLines.length;
  }
  destLines.push(...origLines.slice(origIndex));
  return destLines.join("\n");
}
function patch_to_commit(patch, orig) {
  const commit = { changes: {} };
  for (const [pathKey, action] of Object.entries(patch.actions)) {
    if (action.type === "delete" /* DELETE */) {
      commit.changes[pathKey] = {
        type: "delete" /* DELETE */,
        oldContent: orig[pathKey].getText()
      };
    } else if (action.type === "add" /* ADD */) {
      commit.changes[pathKey] = {
        type: "add" /* ADD */,
        newContent: action.newFile ?? ""
      };
    } else if (action.type === "update" /* UPDATE */) {
      const text = orig[pathKey]?.getText();
      const newContent = _get_updated_file(text, action, pathKey);
      commit.changes[pathKey] = {
        type: "update" /* UPDATE */,
        oldContent: text,
        newContent,
        movePath: action.movePath ?? void 0
      };
    }
  }
  return commit;
}
async function load_files(paths, openFn) {
  const orig = {};
  for (const p of paths) {
    try {
      orig[p] = await openFn(p);
    } catch {
      throw new DiffError(`File not found: ${p}`);
    }
  }
  return orig;
}
function apply_commit(commit, writeFn, removeFn) {
  for (const [p, change] of Object.entries(commit.changes)) {
    if (change.type === "delete" /* DELETE */) {
      removeFn(p);
    } else if (change.type === "add" /* ADD */) {
      writeFn(p, change.newContent ?? "");
    } else if (change.type === "update" /* UPDATE */) {
      if (change.movePath) {
        writeFn(change.movePath, change.newContent ?? "");
        removeFn(p);
      } else {
        writeFn(p, change.newContent ?? "");
      }
    }
  }
}
async function processPatch(text, openFn) {
  if (!text.startsWith(PATCH_PREFIX)) {
    throw new InvalidPatchFormatError("Patch must start with *** Begin Patch\\n", "patchMustStartWithBeginPatch");
  }
  const paths = identify_files_needed(text);
  const orig = await load_files(paths, openFn);
  const [patch, _fuzz] = text_to_patch(text, orig);
  return patch_to_commit(patch, orig);
}
export {
  processPatch
};
