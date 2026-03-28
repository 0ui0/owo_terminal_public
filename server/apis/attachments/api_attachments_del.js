import fs from "fs-extra"
import pathLib from "path"

export default async () => {
  return {
    method: 'POST',
    path: '/api/attachments/del',
    handler: async (request, h) => {
      const { id } = request.payload || {};
      if (!id) {
        return h.response({ error: 'No ID provided' }).code(400);
      }

      // 安全性检查：只允许删除本目录下的文件，防止路径遍历
      const safeId = pathLib.basename(id);
      const uploadDir = pathLib.resolve("./attachment");
      const targetPath = pathLib.join(uploadDir, safeId);

      try {
        if (await fs.pathExists(targetPath)) {
          await fs.unlink(targetPath);
          return { success: true, message: `File ${safeId} deleted` };
        } else {
          return h.response({ error: 'File not found' }).code(404);
        }
      } catch (err) {
        console.error("删除附件失败:", err);
        return h.response({ error: 'Failed to delete file', details: err.message }).code(500);
      }
    }
  };
};
