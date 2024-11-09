import fs from 'fs';
import { log } from '../utils/logger.js';

export class ChatHistoryManager {
  constructor(maxHistoryLength = 10, historyTimeout = 30 * 60 * 1000) {
    this.chatHistory = new Map();
    this.lastInteraction = new Map();
    this.maxHistoryLength = maxHistoryLength;
    this.historyTimeout = historyTimeout;
    this.startCleanupInterval();
    this.loadHistory();
  }

  updateHistory(chatId, role, content) {
    if (!this.chatHistory.has(chatId)) {
      this.chatHistory.set(chatId, []);
    }

    const history = this.chatHistory.get(chatId);
    history.push({ role, content });
    this.lastInteraction.set(chatId, Date.now());

    if (history.length > this.maxHistoryLength) {
      history.shift();
    }
  }

  getHistory(chatId) {
    return this.chatHistory.get(chatId) || [];
  }

  clearHistory(chatId) {
    this.chatHistory.delete(chatId);
    this.lastInteraction.delete(chatId);
  }

  startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      for (const [chatId, timestamp] of this.lastInteraction.entries()) {
        if (now - timestamp > this.historyTimeout) {
          this.clearHistory(chatId);
          log('info', `Cleared history for chat ID: ${chatId} due to inactivity.`);
        }
      }
    }, 60 * 1000);
  }

  loadHistory() {
    try {
      const savedHistory = fs.readFileSync('chatHistory.json', 'utf-8');
      const parsedHistory = JSON.parse(savedHistory);
      parsedHistory.forEach(([key, value]) => this.chatHistory.set(key, value));
      log('info', 'Loaded existing chat history.');
    } catch (error) {
      log('info', 'No existing chat history found. Starting fresh.');
    }
  }

  saveHistory() {
    fs.writeFileSync('chatHistory.json', JSON.stringify([...this.chatHistory]));
    log('info', 'Saved chat history.');
  }
}