import fs from "fs-extra"
import pathLib from "path"
import idTool from "../../tools/idTool.js"
import { Jimp } from "jimp"

export default async () => {
  return {
    method: 'POST',
    path: '/api/attachments/set',
    options: {
      payload: {
        output: 'stream',
        parse: true,
        allow: 'multipart/form-data',
        multipart: true,
        maxBytes: 20 * 1024 * 1024 // 20MB
      }
    },
    handler: async (request, h) => {
      const data = request.payload;
      if (!data.file) {
        return h.response({ error: 'No file uploaded' }).code(400);
      }

      const uploadDir = pathLib.resolve("./attachment");
      await fs.ensureDir(uploadDir);

      const file = data.file;
      const originalFilename = file.hapi.filename;
      const originalExt = pathLib.extname(originalFilename);
      const isImage = /\.(jpg|jpeg|png|webp)$/i.test(originalExt);

      // 统一保留原格式 (若是 WebP 则转为 JPG 兜底，PNG 与 JPG 保持原样)
      let ext = originalExt.toLowerCase();
      if (!/\.(jpg|jpeg|png)$/i.test(ext)) {
        ext = ".jpg"; // 将 webp 等兜底转为 jpg
      }
      const filename = `${idTool.get("file")}${ext}`;
      const savePath = pathLib.join(uploadDir, filename);

      if (isImage) {
        try {
          // 读取流数据到 Buffer
          const chunks = [];
          for await (const chunk of file) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);

          // 使用 Jimp v1 (原生支持 JPEG/PNG)
          const image = await Jimp.read(buffer);

          const MAX_SIZE = 1024;
          if (image.width > MAX_SIZE || image.height > MAX_SIZE) {
            if (image.width > image.height) {
              await image.resize({ w: MAX_SIZE }); // 默认使用双线性插值
            } else {
              await image.resize({ h: MAX_SIZE });
            }
            console.log(`[Jimp] Resized image: ${originalFilename} -> ${image.width}x${image.height} (to ${ext})`);
          }

          // 根据后缀名匹配正确的 MIME
          const mime = ext === ".png" ? "image/png" : "image/jpeg";
          const processedBuffer = await image.getBuffer(mime);
          await fs.writeFile(savePath, processedBuffer);

          return {
            url: `/attachment/${filename}`,
            filename: filename,
            id: filename,
            info: `optimized${ext}`
          };
        } catch (err) {
          console.error("[Jimp] Processing failed, fallback to raw save:", err);
        }
      }

      // 普通文件或处理失败后的保存逻辑
      const fileStream = fs.createWriteStream(savePath);
      return new Promise((resolve, reject) => {
        file.pipe(fileStream);
        file.on('end', () => {
          resolve({
            url: `/attachment/${filename}`,
            filename: filename,
            id: filename
          });
        });
        file.on('error', (err) => {
          reject(err);
        });
      });
    }
  };
};
