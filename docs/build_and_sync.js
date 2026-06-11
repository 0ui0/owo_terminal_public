import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

try {
  console.log("【一键同步】步骤1: 开始使用 Vite 编译前端...");
  execSync('npx vite build', { cwd: path.join(projectRoot, 'www'), stdio: 'inherit' });
  console.log("【一键同步】编译成功！");

  console.log("【一键同步】步骤2: 同步静态资源到 website/assets 目录...");
  const distAssetsDir = path.join(projectRoot, 'www/dist/assets');
  const targetAssetsDir = path.join(projectRoot, 'website/assets');

  const files = fs.readdirSync(distAssetsDir);
  let copyCount = 0;
  files.forEach(file => {
    if (file.endsWith('.js') || file.endsWith('.map')) {
      const srcFile = path.join(distAssetsDir, file);
      const destFile = path.join(targetAssetsDir, file);
      fs.copyFileSync(srcFile, destFile);
      copyCount++;
    }
  });
  console.log(`【一键同步】成功同步了 ${copyCount} 个资源文件到 website/assets！`);

  console.log("【一键同步】步骤3: 执行 main.js 本地化加载补丁...");
  const mainPath = path.join(targetAssetsDir, 'main.js');
  if (fs.existsSync(mainPath)) {
    let content = fs.readFileSync(mainPath, 'utf8');
    const target = '__vitePreload(()=>import(`${window.location.origin}/api/dynamic?time=`+Date.now()),[])';
    if (content.includes(target)) {
      content = content.replace(target, `__vitePreload(()=>import('./DynamicData.js'),[])`);
      console.log("【一键同步】补丁成功：使用 string 匹配替换了加载路径！");
    } else {
      const regex = /__vitePreload\(\(\)=>import\(`\${window\.location\.origin}\/api\/dynamic\?time=`\+Date\.now\(\)\),\[\]\)/g;
      if (regex.test(content)) {
        content = content.replace(regex, `__vitePreload(()=>import('./DynamicData.js'),[])`);
        console.log("【一键同步】补丁成功：使用 regex 匹配替换了加载路径！");
      } else {
        console.warn("【一键同步】警告: 未能找到要打补丁的加载语句，可能不需要打补丁。");
      }
    }
    fs.writeFileSync(mainPath, content, 'utf8');
  } else {
    console.error("【一键同步】致命错误: website/assets/main.js 不存在！");
  }

  console.log("【一键同步】大功告成！前端编译、资源同步与本地化补丁已一键完美交付喵！");
} catch (e) {
  console.error("【一键同步】执行过程中发生错误：", e);
  process.exit(1);
}
