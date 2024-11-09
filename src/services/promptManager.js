import fs from 'fs';
import path from 'path';
import { log } from '../utils/logger.js';

export class PromptManager {
  constructor() {
    this.systemPrompts = new Map();
    this.userPrompts = new Map();
    this.loadSystemPrompts();
  }

  loadSystemPrompts() {
    const promptDir = './system_prompts';
    try {
      const files = fs.readdirSync(promptDir);
      files.forEach(file => {
        if (file.endsWith('.txt')) {
          const name = path.basename(file, '.txt');
          const content = fs.readFileSync(path.join(promptDir, file), 'utf-8');
          this.systemPrompts.set(name, content);
        }
      });
      log('info', `Loaded ${this.systemPrompts.size} system prompts`);
    } catch (error) {
      log('error', `Failed to load system prompts: ${error}`);
    }
  }

  getSystemPrompt(chatId, text) {
    if (!text || typeof text !== 'string') {
      return this.getDefaultPrompt();
    }

    const firstWord = text.split(/\s+/)[0];
    
    if (firstWord && firstWord.toLowerCase() === 'default') {
      this.userPrompts.delete(chatId);
      return this.getDefaultPrompt();
    }

    if (firstWord && this.systemPrompts.has(firstWord)) {
      this.userPrompts.set(chatId, firstWord);
      return {
        role: 'system',
        content: this.prependCurrentDate(this.systemPrompts.get(firstWord))
      };
    }

    const currentPrompt = this.userPrompts.get(chatId);
    return {
      role: 'system',
      content: currentPrompt ? this.prependCurrentDate(this.systemPrompts.get(currentPrompt)) : this.prependCurrentDate(this.systemPrompts.get('default') || '')
    };
  }

  getDefaultPrompt() {
    return {
      role: 'system',
      content: this.prependCurrentDate(this.systemPrompts.get('default') || '')
    };
  }

  prependCurrentDate(content) {
    const currentDate = new Date().toLocaleDateString();
    return `今天是 ${currentDate}，\n${content}`;
  }

  isPromptSwitchCommand(text) {
    if (!text || typeof text !== 'string') return false;
    const firstWord = text.split(/\s+/)[0];
    return firstWord.toLowerCase() === 'default' || this.systemPrompts.has(firstWord);
  }

  extractMessageContent(text) {
    if (!text || typeof text !== 'string') return text;
    const firstWord = text.split(/\s+/)[0];
    if (this.isPromptSwitchCommand(text)) {
      return text.substring(firstWord.length).trim();
    }
    return text;
  }
}