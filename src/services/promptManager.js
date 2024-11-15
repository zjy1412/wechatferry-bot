import fs from 'fs';
import path from 'path';
import { log } from '../utils/logger.js';
import { StateManager } from './stateManager.js';

export class PromptManager {
  constructor() {
    this.systemPrompts = new Map();
    this.userPrompts = new Map();
    this.stateManager = new StateManager();
    this.loadSystemPrompts();
    this.loadUserPromptState();
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

  loadUserPromptState() {
    const savedState = this.stateManager.loadState('prompt_state');
    if (savedState) {
      this.userPrompts = new Map(savedState.userPrompts);
      log('info', 'Loaded user prompt state');
    }
  }

  saveUserPromptState() {
    const state = {
      userPrompts: Array.from(this.userPrompts.entries()),
      timestamp: Date.now()
    };
    this.stateManager.saveState('prompt_state', state);
  }

  getSystemPrompt(chatId, text) {
    if (!text || typeof text !== 'string') {
      return this.getDefaultPrompt();
    }

    const firstWord = text.split(/\s+/)[0];
    
    if (firstWord && firstWord.toLowerCase() === 'default') {
      this.userPrompts.delete(chatId);
      this.saveUserPromptState();
      return this.getDefaultPrompt();
    }

    if (firstWord && this.systemPrompts.has(firstWord)) {
      this.userPrompts.set(chatId, firstWord);
      this.saveUserPromptState();
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