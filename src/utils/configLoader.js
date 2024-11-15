import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadConfig() {
  try {
    const configPath = join(__dirname, '../../config.json');
    console.log('尝试加载配置文件:', configPath); // 添加路径日志
    
    if (!existsSync(configPath)) {
      throw new Error(`配置文件不存在: ${configPath}`);
    }
    
    const configData = readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    console.log('成功加载配置文件');
    return config;
  } catch (error) {
    throw new Error(`配置文件加载失败: ${error.message}\n请确保 config.json 文件位于项目根目录下。`);
  }
}
