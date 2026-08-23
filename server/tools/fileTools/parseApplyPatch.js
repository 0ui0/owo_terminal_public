const PATCH_PREFIX = "*** Begin Patch\n";
const PATCH_SUFFIX = "\n*** End Patch";
const ADD_FILE_PREFIX = "*** Add File: ";
const DELETE_FILE_PREFIX = "*** Delete File: ";
const UPDATE_FILE_PREFIX = "*** Update File: ";
const MOVE_FILE_TO_PREFIX = "*** Move to: ";
const END_OF_FILE_PREFIX = "*** End of File";
const HUNK_ADD_LINE_PREFIX = "+";
const HUNK_DELETE_LINE_PREFIX = "-";
function parseApplyPatch(patch) {
  if (!patch.startsWith(PATCH_PREFIX)) {
    return null;
  } else if (!patch.endsWith(PATCH_SUFFIX)) {
    return null;
  }
  const patchBody = patch.slice(
    PATCH_PREFIX.length,
    patch.length - PATCH_SUFFIX.length
  );
  const lines = patchBody.split("\n");
  const ops = [];
  for (const line of lines) {
    if (line.startsWith(END_OF_FILE_PREFIX)) {
      continue;
    } else if (line.startsWith(ADD_FILE_PREFIX)) {
      ops.push({
        type: "create",
        path: line.slice(ADD_FILE_PREFIX.length).trim(),
        content: ""
      });
      continue;
    } else if (line.startsWith(DELETE_FILE_PREFIX)) {
      ops.push({
        type: "delete",
        path: line.slice(DELETE_FILE_PREFIX.length).trim()
      });
      continue;
    } else if (line.startsWith(UPDATE_FILE_PREFIX)) {
      ops.push({
        type: "update",
        path: line.slice(UPDATE_FILE_PREFIX.length).trim(),
        update: "",
        added: 0,
        deleted: 0
      });
      continue;
    }
    const lastOp = ops[ops.length - 1];
    if (lastOp?.type === "create") {
      lastOp.content = appendLine(
        lastOp.content,
        line.slice(HUNK_ADD_LINE_PREFIX.length)
      );
      continue;
    }
    if (lastOp?.type !== "update") {
      return null;
    }
    if (line.startsWith(HUNK_ADD_LINE_PREFIX)) {
      lastOp.added += 1;
    } else if (line.startsWith(HUNK_DELETE_LINE_PREFIX)) {
      lastOp.deleted += 1;
    }
    lastOp.update += lastOp.update ? "\n" + line : line;
  }
  return ops;
}
function appendLine(content, line) {
  if (!content.length) {
    return line;
  }
  return [content, line].join("\n");
}
export {
  ADD_FILE_PREFIX,
  DELETE_FILE_PREFIX,
  END_OF_FILE_PREFIX,
  HUNK_ADD_LINE_PREFIX,
  HUNK_DELETE_LINE_PREFIX,
  MOVE_FILE_TO_PREFIX,
  PATCH_PREFIX,
  PATCH_SUFFIX,
  UPDATE_FILE_PREFIX,
  parseApplyPatch
};
