const fs = require('fs');
const path = require('path');
const mapData = JSON.parse(fs.readFileSync(path.join(__dirname, '../rmmz/data/Map002.json'), 'utf8'));

// RMMZ layers are 0..5, where 5 is the regions layer.
// Regions are painted on the map by the user.
console.log("Analyzing map width: " + mapData.width + ", height: " + mapData.height);
const data = mapData.data;

const regions = {};
for (let y = 0; y < mapData.height; y++) {
    for (let x = 0; x < mapData.width; x++) {
        // layer 5 is regions
        const index = (5 * mapData.height + y) * mapData.width + x;
        const regionId = data[index];
        if (regionId > 0) {
            if (!regions[regionId]) {
                regions[regionId] = {minX: x, maxX: x, minY: y, maxY: y};
            } else {
                if (x < regions[regionId].minX) regions[regionId].minX = x;
                if (x > regions[regionId].maxX) regions[regionId].maxX = x;
                if (y < regions[regionId].minY) regions[regionId].minY = y;
                if (y > regions[regionId].maxY) regions[regionId].maxY = y;
            }
        }
    }
}

console.log(JSON.stringify(regions, null, 2));
