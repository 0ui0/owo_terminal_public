const fs = require('fs');
const path = require('path');
const mapData = JSON.parse(fs.readFileSync(path.join(__dirname, '../rmmz/data/Map002.json'), 'utf8'));
const width = mapData.width;
const height = mapData.height;

// Find bounding boxes for each region ID (z=5)
const regions = {};
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const idx = (5 * height + y) * width + x;
        const regionId = mapData.data[idx];
        if (regionId > 0) {
            if (!regions[regionId]) {
                regions[regionId] = { minX: x, maxX: x, minY: y, maxY: y };
            } else {
                if (x < regions[regionId].minX) regions[regionId].minX = x;
                if (x > regions[regionId].maxX) regions[regionId].maxX = x;
                if (y < regions[regionId].minY) regions[regionId].minY = y;
                if (y > regions[regionId].maxY) regions[regionId].maxY = y;
            }
        }
    }
}

// Generate extract script with exact bounding boxes
const defs = [];
const nameMap = {
    1: "地面", 2: "小草", 3: "小花", 4: "大树", 5: "小树",
    6: "帐篷", 7: "自动栅栏", 8: "房屋样板1", 9: "房屋样板2", 10: "房屋样板3",
    60: "门_样板1", 80: "门_样板2", 90: "门_样板3", 100: "门_样板4"
};

for (const [id, r] of Object.entries(regions)) {
    const w = r.maxX - r.minX + 1;
    const h = r.maxY - r.minY + 1;
    defs.push(`{ id: ${id}, name: "${nameMap[id] || 'Unknown'}", x: ${r.minX}, y: ${r.minY}, w: ${w}, h: ${h} }`);
}
console.log("// Auto-detected Bounding Boxes from Map002 Regions:");
console.log(defs.join(",\n"));
