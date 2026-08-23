import { Lazy } from "../../../util/vs/base/common/lazy";
import { Position as CorePos } from "../../../util/vs/editor/common/core/position";
import { OffsetRange } from "../../../util/vs/editor/common/core/ranges/offsetRange";
import { PositionOffsetTransformer } from "../../../util/vs/editor/common/core/text/positionToOffset";
import { Range, Position as VSCodePos } from "../../../vscodeTypes";
class AbstractDocument {
  rangeToOffsetRange(range) {
    return new OffsetRange(this.getOffsetAtPosition(range.start), this.getOffsetAtPosition(range.end));
  }
  offsetRangeToRange(offsetRange) {
    return new Range(
      this.getPositionAtOffset(offsetRange.start),
      this.getPositionAtOffset(offsetRange.endExclusive)
    );
  }
  get length() {
    return this.getText().length;
  }
}
class VsCodeTextDocument extends AbstractDocument {
  constructor(document) {
    super();
    this.document = document;
  }
  uri = this.document.uri;
  languageId = this.document.languageId;
  getLineText(lineIndex) {
    return this.document.lineAt(lineIndex).text;
  }
  getLineLength(lineIndex) {
    return this.document.lineAt(lineIndex).text.length;
  }
  getLineCount() {
    return this.document.lineCount;
  }
  getText() {
    return this.document.getText();
  }
  getTextInOffsetRange(offsetRange) {
    return offsetRange.substring(this.document.getText());
  }
  getPositionAtOffset(offset) {
    return this.document.positionAt(offset);
  }
  getOffsetAtPosition(position) {
    return this.document.offsetAt(position);
  }
  _transformer = new Lazy(() => new PositionOffsetTransformer(this.document.getText()));
  getPositionOffsetTransformer() {
    return this._transformer.value;
  }
}
class StringTextDocument extends AbstractDocument {
  constructor(value) {
    super();
    this.value = value;
  }
  _transformer = new PositionOffsetTransformer(this.value);
  getText() {
    return this.value;
  }
  getLineText(lineIndex) {
    const startOffset = this._transformer.getOffset(new CorePos(lineIndex + 1, 1));
    const endOffset = startOffset + this.getLineLength(lineIndex);
    return this.value.substring(startOffset, endOffset);
  }
  getLineLength(lineIndex) {
    return this._transformer.getLineLength(lineIndex + 1);
  }
  getLineCount() {
    return this._transformer.textLength.lineCount + 1;
  }
  getTextInOffsetRange(offsetRange) {
    return offsetRange.substring(this.value);
  }
  getPositionAtOffset(offset) {
    return corePositionToVSCodePosition(this._transformer.getPosition(offset));
  }
  getOffsetAtPosition(position) {
    position = this._validatePosition(position);
    return this._transformer.getOffset(vsCodePositionToCorePosition(position));
  }
  _validatePosition(position) {
    if (position.line < 0) {
      return new VSCodePos(0, 0);
    }
    const lineCount = this._transformer.textLength.lineCount + 1;
    if (position.line >= lineCount) {
      const lineLength2 = this._transformer.getLineLength(lineCount);
      return new VSCodePos(lineCount - 1, lineLength2);
    }
    if (position.character < 0) {
      return new VSCodePos(position.line, 0);
    }
    const lineLength = this._transformer.getLineLength(position.line + 1);
    if (position.character > lineLength) {
      return new VSCodePos(position.line, lineLength);
    }
    return position;
  }
  getPositionOffsetTransformer() {
    return this._transformer;
  }
}
class StringTextDocumentWithLanguageId extends StringTextDocument {
  constructor(value, languageId) {
    super(value);
    this.languageId = languageId;
  }
}
function corePositionToVSCodePosition(position) {
  return new VSCodePos(position.lineNumber - 1, position.column - 1);
}
function vsCodePositionToCorePosition(position) {
  return new CorePos(position.line + 1, position.character + 1);
}
export {
  AbstractDocument,
  StringTextDocument,
  StringTextDocumentWithLanguageId,
  VsCodeTextDocument
};
