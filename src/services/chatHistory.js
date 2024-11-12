import fs from 'fs';
import { log } from '../utils/logger.js';
import { StateManager } from './stateManager.js';
import OpenAI from 'openai';
import config from '../../config.json' assert { type: 'json' };

export class ChatHistoryManager {
  constructor(maxHistoryLength = 10, historyTimeout = 12 * 60 * 60 * 1000) {
    this.chatHistory = new Map();
    this.lastInteraction = new Map();
    this.maxHistoryLength = maxHistoryLength;
    this.historyTimeout = historyTimeout;
    this.stateManager = new StateManager();
    this.openai = new OpenAI({
      baseURL: config.openai.baseURL,
      apiKey: config.openai.apiKey,
    });
    this.startCleanupInterval();
    this.loadHistory();
  }

  updateHistory(chatId, role, content, username = '') {
    if (!this.chatHistory.has(chatId)) {
      this.chatHistory.set(chatId, []);
    }

    const history = this.chatHistory.get(chatId);
    const message = { role, content, timestamp: Date.now() };
    if (username) {
      message.username = username;
    }
    
    history.push(message);
    this.lastInteraction.set(chatId, Date.now());

    if (history.length > this.maxHistoryLength) {
      // Instead of removing old messages, archive them
      const archivedHistory = this.loadArchivedHistory(chatId);
      archivedHistory.push(history.shift());
      this.saveArchivedHistory(chatId, archivedHistory);
    }

    this.saveHistory();
  }

  getHistory(chatId) {
    return this.chatHistory.get(chatId) || [];
  }

  loadArchivedHistory(chatId) {
    const archived = this.stateManager.loadState(`archived_history_${chatId}`);
    return archived?.messages || [];
  }

  saveArchivedHistory(chatId, messages) {
    this.stateManager.saveState(`archived_history_${chatId}`, {
      messages,
      timestamp: Date.now()
    });
  }

  clearHistory(chatId) {
    this.chatHistory.delete(chatId);
    this.lastInteraction.delete(chatId);
    this.saveHistory();
  }

  startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      let hasChanges = false;
      for (const [chatId, timestamp] of this.lastInteraction.entries()) {
        if (now - timestamp > this.historyTimeout) {
          // Archive instead of clear when timeout
          const history = this.getHistory(chatId);
          if (history.length > 0) {
            const archivedHistory = this.loadArchivedHistory(chatId);
            archivedHistory.push(...history);
            this.saveArchivedHistory(chatId, archivedHistory);
          }
          this.clearHistory(chatId);
          hasChanges = true;
          log('info', `Archived history for chat ID: ${chatId} due to inactivity.`);
        }
      }
      if (hasChanges) {
        this.saveHistory();
      }
    }, 60 * 1000);
  }

  loadHistory() {
    const savedState = this.stateManager.loadState('chat_history');
    if (savedState && savedState.timestamp) {
      if (Date.now() - savedState.timestamp < this.historyTimeout) {
        this.chatHistory = new Map(savedState.chatHistory);
        this.lastInteraction = new Map(savedState.lastInteraction);
        log('info', 'Loaded existing chat history');
      }
    }
  }

  saveHistory() {
    const state = {
      chatHistory: Array.from(this.chatHistory.entries()),
      lastInteraction: Array.from(this.lastInteraction.entries()),
      timestamp: Date.now()
    };
    this.stateManager.saveState('chat_history', state);
  }

  async summarizeChat(chatId) {
    try {
      // Get current and archived history
      const currentHistory = this.getHistory(chatId);
      const archivedHistory = this.loadArchivedHistory(chatId);
      
      // Combine histories
      const allHistory = [...archivedHistory, ...currentHistory];
      
      if (!allHistory || allHistory.length === 0) {
        return "没有可用的聊天记录可供总结。";
      }

      // Format messages for better readability
      const formattedMessages = allHistory.map(msg => {
        const time = new Date(msg.timestamp).toLocaleString();
        const username = msg.username ? `${msg.username}` : (msg.role === 'user' ? '用户' : '助手');
        return `[${time}] ${username}: ${msg.content}`;
      }).join('\n');

      // Generate summary using OpenAI
      const response = await this.openai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: '请对以下对话进行简明扼要的总结，重点关注主要话题和关键信息。总结要分点列出，并标注时间段。'
          },
          {
            role: 'user',
            content: formattedMessages
          }
        ],
        model: config.openai.model,
      });

      const summary = response.choices[0].message.content;
      
      // Add metadata to summary
      const startTime = new Date(allHistory[0].timestamp).toLocaleString();
      const endTime = new Date(allHistory[allHistory.length - 1].timestamp).toLocaleString();
      
      return `对话时间：${startTime} 至 ${endTime}\n消息数量：${allHistory.length}\n\n${summary}`;

    } catch (error) {
      log('error', `Error generating chat summary: ${error}`);
      return "生成对话总结时发生错误，请稍后重试。";
    }
  }
}