class LinesEdit {
  constructor(firstLineIndex, endLineIndex, lines, prefix = "", suffix = "\n") {
    this.firstLineIndex = firstLineIndex;
    this.endLineIndex = endLineIndex;
    this.lines = lines;
    this.prefix = prefix;
    this.suffix = suffix;
  }
  toTextEdit() {
    const text = this.lines.length > 0 ? this.prefix + this.lines.join("\n") + this.suffix : "";
    return TextEdit.replace(new Range(this.firstLineIndex, 0, this.endLineIndex, 0), text);
  }
  apply(lines) {
    const before = lines.slice(0, this.firstLineIndex);
    const after = lines.slice(this.endLineIndex);
    return before.concat(this.lines, after);
  }
  static insert(line, lines) {
    return new LinesEdit(line, line, lines);
  }
  static replace(firstLineIndex, endLineIndex, lines, isLastLine = false) {
    if (isLastLine) {
      return new LinesEdit(firstLineIndex, endLineIndex, lines, "", "");
    }
    return new LinesEdit(firstLineIndex, endLineIndex, lines);
  }
}
var Lines;
((Lines2) => {
  function fromString(code) {
    if (code.length === 0) {
      return [];
    }
    return code.split(/\r\n|\r|\n/g);
  }
  Lines2.fromString = fromString;
  function fromDocument(doc) {
    if (doc.lineCount === 0) {
      return [];
    }
    const result = [];
    for (let i = 0; i < doc.lineCount; i++) {
      result.push(doc.lineAt(i).text);
    }
    return result;
  }
  Lines2.fromDocument = fromDocument;
})(Lines || (Lines = {}));
function isLines(lines) {
  return Array.isArray(lines) && typeof lines[0] === "string";
}
var EditStrategy = /* @__PURE__ */ ((EditStrategy2) => {
  EditStrategy2[EditStrategy2["FallbackToInsertAboveRange"] = 1] = "FallbackToInsertAboveRange";
  EditStrategy2[EditStrategy2["FallbackToReplaceRange"] = 2] = "FallbackToReplaceRange";
  EditStrategy2[EditStrategy2["FallbackToInsertBelowRange"] = 3] = "FallbackToInsertBelowRange";
  EditStrategy2[EditStrategy2["ForceInsertion"] = 4] = "ForceInsertion";
  return EditStrategy2;
})(EditStrategy || {});
function trimLeadingWhitespace(str) {
  return str.replace(/^\s+/g, "");
}
export {
  EditStrategy,
  Lines,
  LinesEdit,
  isLines,
  trimLeadingWhitespace
};
