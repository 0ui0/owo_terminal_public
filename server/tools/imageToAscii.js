import { Jimp, intToRGBA } from "jimp";

/**
 * 将图片文件转为 ASCII 字符画
 * @param {string} imagePath 图片的本地绝对路径
 * @param {number} maxWidth 最大字符宽度，默认 300
 * @returns {Promise<string>} 返回生成的 ASCII 字符串
 */
export async function imageToAscii(imagePath, maxWidth = 300) {
  try {
    // 强制最低分辨率为 300，即使外部传入更低的值
    if (maxWidth < 300) {
      maxWidth = 300;
    }
    const image = await Jimp.read(imagePath);
    // 使用上下半块 (Half-Block) 方案，不需要乘以 0.45 修正长宽比
    // 因为一个半块字符恰好等于 2 个垂直排列的正方形像素
    const targetWidth = maxWidth;
    const targetHeight = Math.floor(image.bitmap.height * (targetWidth / image.bitmap.width));
    
    image.resize({ w: targetWidth, h: targetHeight });

    let asciiArt = "";
    // 每次步进 2 行像素，拼装成 1 行字符
    for (let y = 0; y < targetHeight; y += 2) {
      let row = "";
      for (let x = 0; x < targetWidth; x++) {
        // 获取上半个像素
        const colorT = intToRGBA(image.getPixelColor(x, y));
        const lumT = 0.299 * colorT.r + 0.587 * colorT.g + 0.114 * colorT.b;
        const isTopBlack = (colorT.a >= 128 && lumT < 200);

        // 获取下半个像素
        let isBottomBlack = false;
        if (y + 1 < targetHeight) {
          const colorB = intToRGBA(image.getPixelColor(x, y + 1));
          const lumB = 0.299 * colorB.r + 0.587 * colorB.g + 0.114 * colorB.b;
          isBottomBlack = (colorB.a >= 128 && lumB < 200);
        }

        // 组合上下像素，使用方块字符输出无缝点阵
        if (isTopBlack && isBottomBlack) {
          row += '█';
        } else if (isTopBlack && !isBottomBlack) {
          row += '▀';
        } else if (!isTopBlack && isBottomBlack) {
          row += '▄';
        } else {
          row += ' ';
        }
      }
      asciiArt += row + "\n";
    }
    
    return asciiArt;
  } catch (error) {
    console.error("[imageToAscii] 转换图片为 ASCII 失败:", error);
    return "";
  }
}
