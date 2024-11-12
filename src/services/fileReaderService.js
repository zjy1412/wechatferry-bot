import fs from 'fs';
import path from 'path';
import { log } from '../utils/logger.js';
import { URLReaderService } from './urlReader.js';
import OpenAI from 'openai';
import config from '../../config.json' assert { type: 'json' };
import pdfParse from 'pdf-parse';

export class FileReaderService {
  constructor() {
    this.urlReaderService = new URLReaderService();
    this.openai = new OpenAI({
      baseURL: config.openai.baseURL,
      apiKey: config.openai.apiKey,
    });
  }

  async handleFileMessage(file) {
    const filePath = path.join('./downloads', file.filename);
    await file.toFile(filePath, true);
    log('info', `File saved to: ${filePath}`);

    const fileType = path.extname(filePath).toLowerCase();
    let fileContent = '';

    if (fileType === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      fileContent = pdfData.text;
    } else {
      log('warn', `Unsupported file type: ${fileType}`);
      return '抱歉，目前不支持该文件类型。';
    }

    log('info', `File content extracted: ${fileContent}`);

    const response = await this.openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: '请根据以下文件内容回答问题。'
        },
        {
          role: 'user',
          content: fileContent
        }
      ],
      model: config.openai.model,
    });

    const answer = response.choices[0].message.content;
    log('info', `Generated answer: ${answer}`);

    return answer;
  }
}
