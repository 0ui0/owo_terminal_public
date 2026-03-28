const fs = require('fs');
const path = require('path');

const mapFilePath = path.join(__dirname, '../rmmz/data/Map002.json');
const outFilePath = path.join(__dirname, '../rmmz/data/prefabs.json');

const mapData = JSON.parse(fs.readFileSync(mapFilePath, 'utf8'));
const width = mapData.width; // 25
const height = mapData.height; // 20
const mapArray = mapData.data;

// 获取指定层、行列的 ID
function getTileId(x, y, z) {
    if (x < 0 || x >= width || y < 0 || y >= height || z < 0 || z >= 6) return 0;
    const index = (z * height + y) * width + x;
    return mapArray[index] || 0;
}

// 基于区域扫描找出的绝对真实位置
const prefabDefs = [
  { id: 1, name: "地面", x: 0, y: 0, w: 1, h: 1 },
  { id: 2, name: "小草", x: 0, y: 1, w: 1, h: 1 },
  { id: 3, name: "小花", x: 0, y: 2, w: 1, h: 1 },
  { id: 4, name: "大树", x: 1, y: 0, w: 2, h: 2 },
  { id: 5, name: "小树", x: 4, y: 0, w: 1, h: 2 },
  { id: 6, name: "帐篷", x: 6, y: 0, w: 3, h: 3 },
  { id: 7, name: "自动栅栏", x: 1, y: 3, w: 3, h: 3 },
  { id: 8, name: "房屋样板1", x: 10, y: 0, w: 3, h: 4 },
  { id: 9, name: "房屋样板2", x: 14, y: 0, w: 3, h: 4 },
  { id: 10, name: "房屋样板3", x: 18, y: 0, w: 5, h: 5 },
  { id: 60, name: "门_样板1", x: 7, y: 2, w: 1, h: 1 },
  { id: 80, name: "门_样板2", x: 11, y: 3, w: 1, h: 1 },
  { id: 90, name: "门_样板3", x: 15, y: 3, w: 1, h: 1 },
  { id: 100, name: "门_样板4", x: 19, y: 3, w: 1, h: 1 }
];

const prefabsOut = {};

prefabDefs.forEach(def => {
    let data = [];
    for (let z = 0; z < 6; z++) {
        for (let py = 0; py < def.h; py++) {
            for (let px = 0; px < def.w; px++) {
                const targetX = def.x + px;
                const targetY = def.y + py;
                let tileId = getTileId(targetX, targetY, z);
                
                // 第一层(z=0)特殊处理，如果没有地面则填充 2854(绿地)，避免空白透出背后的纯黑或天空
                if (z === 0 && def.name !== "地面" && tileId === 0) {
                   tileId = 2854; 
                }
                data.push(tileId);
            }
        }
    }
    prefabsOut[def.name] = {
        id: def.id,
        name: def.name,
        width: def.w,
        height: def.h,
        data: data
    };
});

fs.writeFileSync(outFilePath, JSON.stringify(prefabsOut, null, 2));
console.log("Successfully extracted exact prefabs from Map002!");
