const fs = require('fs');
const path = require('path');

const dir = "/Users/lambda/old_lamuda/文稿和桌面/原桌面/owo_terminal/server/apps/svgEditor/svgEditor/class";

function processDir(directory) {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    if (file.endsWith('.coffee') || file.endsWith('.js')) {
      if (file === 'transformCoords.js') continue;
      
      const filePath = path.join(directory, file);
      let content = fs.readFileSync(filePath, 'utf-8');
      
      // We will perform a string replace to use local coordinate formulas
      // since the files all do something like: data.getLocalX(e.clientX, domSite)
      content = content.replace(/e\.clientX\s*-\s*domSite\.x/g, "data.getLocalX(e.clientX, domSite)");
      content = content.replace(/e\.clientY\s*-\s*domSite\.y/g, "data.getLocalY(e.clientY, domSite)");
      
      fs.writeFileSync(filePath, content);
      console.log(`Updated: ${file}`);
    }
  }
}

processDir(dir);
