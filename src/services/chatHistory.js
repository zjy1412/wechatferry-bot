import fs from 'fs';
import { log } from '../utils/logger.js';
import { StateManager } from './stateManager.js';
import OpenAI from 'openai';
import { loadConfig } from '../utils/configLoader.js';
const config = loadConfig();

export class ChatHistoryManager {
  constructor(maxHistoryLength = 10, historyTimeout = 12 * 60 * 60 * 1000) {
    this.chatHistory = new Map();
    this.lastInteraction = new Map();
    this.maxHistoryLength = maxHistoryLength;
    this.historyTimeout = historyTimeout;
    this.stateManager = new StateManager();
    this.openai = new OpenAI({
      baseURL: config.openai?.baseURL || 'https://api.deepseek.com',
      apiKey: config.openai?.apiKey
    });
    this.archiveExpirationTime = config.archiveExpirationTime || 86400000;
    this.fileHistory = new Map();
    this.maxFileHistory = 5;
    
    // 启动时立即清理过期归档
    this.cleanupArchivedHistory();
    // 启动定时清理任务
    this.startCleanupInterval();
    this.startArchiveCleanupInterval();
    this.loadHistory();
  }

  async cleanupArchivedHistory() {
    try {
      const now = Date.now();
      const chatIds = this.getAllArchivedChatIds();
      let cleanupCount = 0;
      
      for (const chatId of chatIds) {
        const archived = this.loadArchivedHistory(chatId);
        if (!archived) continue;

        const validMessages = archived.filter(msg => 
          now - msg.timestamp < this.archiveExpirationTime
        );

        if (validMessages.length === 0) {
          this.stateManager.deleteState(`archived_history_${chatId}`);
          cleanupCount++;
        } else if (validMessages.length < archived.length) {
          this.saveArchivedHistory(chatId, validMessages);
          cleanupCount += archived.length - validMessages.length;
        }
      }
      
      if (cleanupCount > 0) {
        log('info', `启动时清理: 删除了${cleanupCount}条过期消息记录`);
      }
    } catch (error) {
      log('error', `启动时清理归档记录失败: ${error}`);
    }
  }

  updateHistory(chatId, role, content, username = '', messageType = 'chat') {
    if (!this.chatHistory.has(chatId)) {
      this.chatHistory.set(chatId, []);
    }

    const history = this.chatHistory.get(chatId);
    const message = {
      role,
      content,
      timestamp: Date.now(),
      username: username || (role === 'user' ? '用户' : '助手'),
      type: messageType
    };
    
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

  startArchiveCleanupInterval() {
    // 每小时检查一次归档记录
    setInterval(() => {
      try {
        const now = Date.now();
        const chatIds = this.getAllArchivedChatIds();
        
        chatIds.forEach(chatId => {
          const archived = this.loadArchivedHistory(chatId);
          if (!archived) return;

          // 过滤掉过期的消息
          const validMessages = archived.filter(msg => 
            now - msg.timestamp < this.archiveExpirationTime
          );

          if (validMessages.length === 0) {
            // 如果没有有效消息，删除整个归档文件
            this.stateManager.deleteState(`archived_history_${chatId}`);
            log('info', `Deleted expired archive for chat ID: ${chatId}`);
          } else if (validMessages.length < archived.length) {
            // 如果有消息被过滤掉，保存剩余的消息
            this.saveArchivedHistory(chatId, validMessages);
            log('info', `Cleaned up ${archived.length - validMessages.length} expired messages for chat ID: ${chatId}`);
          }
        });
      } catch (error) {
        log('error', `Error cleaning up archived history: ${error}`);
      }
    }, 60 * 60 * 1000); // 每小时执行一次
  }

  getAllArchivedChatIds() {
    try {
      const files = fs.readdirSync(this.stateManager.dataDir);
      return files
        .filter(file => file.startsWith('archived_history_'))
        .map(file => file.replace('archived_history_', '').replace('.json', ''));
    } catch (error) {
      log('error', `Error getting archived chat IDs: ${error}`);
      return [];
    }
  }

  loadHistory() {
    const savedState = this.stateManager.loadState('chat_history');
    if (savedState && savedState.timestamp) {
      if (Date.now() - savedState.timestamp < this.historyTimeout) {
        this.chatHistory = new Map(savedState.chatHistory);
        this.lastInteraction = new Map(savedState.lastInteraction);
        this.fileHistory = new Map(savedState.fileHistory || []);
        log('info', 'Loaded existing chat history');
      }
    }
  }

  saveHistory() {
    const state = {
      chatHistory: Array.from(this.chatHistory.entries()),
      lastInteraction: Array.from(this.lastInteraction.entries()),
      fileHistory: Array.from(this.fileHistory.entries()),
      timestamp: Date.now()
    };
    this.stateManager.saveState('chat_history', state);
  }

  addGroupMessage(chatId, username, content) {
    this.updateHistory(chatId, 'user', content, username, 'group_chat');
  }

  async getChatContext(chatId, purpose, keywords = []) {
    try {
      const currentHistory = this.getHistory(chatId);
      const archivedHistory = this.loadArchivedHistory(chatId);
      const allHistory = [...archivedHistory, ...currentHistory];
      
      if (!allHistory || allHistory.length === 0) {
        return "没有可用的聊天记录。";
      }

      // Filter messages if keywords provided
      let relevantHistory = allHistory;
      if (keywords && keywords.length > 0) {
        const keywordRegex = new RegExp(keywords.join('|'), 'i');
        relevantHistory = allHistory.filter(msg => 
          keywordRegex.test(msg.content)
        );
      }

      // Format messages
      const formattedMessages = relevantHistory.map(msg => {
        const time = new Date(msg.timestamp).toLocaleString();
        const username = msg.username;
        const indicator = msg.type === 'group_chat' ? '[群消息]' : '';
        return `[${time}]${indicator} ${username}: ${msg.content}`;
      }).join('\n');

      // Handle different purposes
      let systemPrompt = '';
      switch (purpose) {
        case 'summarize':
          systemPrompt = '请对以下对话进行简明扼要的总结，重点关注主要话题和关键信息。总结要分点列出，并标注时间段。';
          break;
        case 'reference':
          systemPrompt = '请分析以下对话记录，提取与当前问题最相关的上下文信息。注意保持信息的连贯性和相关性。';
          break;
        case 'analyze':
          systemPrompt = '请分析以下对话的互动模式、主要话题走向和关键讨论点。识别重要的对话模式和趋势。';
          break;
        default:
          systemPrompt = '请处理以下对话记录。';
      }

      const response = await this.openai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: formattedMessages }
        ],
        model: config.openai.model,
      });

      const result = response.choices[0].message.content;
      
      // Add context metadata
      const startTime = new Date(relevantHistory[0].timestamp).toLocaleString();
      const endTime = new Date(relevantHistory[relevantHistory.length - 1].timestamp).toLocaleString();
      const contextInfo = `时间范围：${startTime} 至 ${endTime}\n消息数量：${relevantHistory.length}`;
      
      if (keywords && keywords.length > 0) {
        return `${contextInfo}\n关键词：${keywords.join(', ')}\n\n${result}`;
      }
      
      return `${contextInfo}\n\n${result}`;

    } catch (error) {
      log('error', `Error generating chat summary: ${error}`);
      return "生成对话总结时发生错误，请稍后重试。";
    }
  }

  addFileRecord(chatId, fileInfo) {
    if (!this.fileHistory.has(chatId)) {
      this.fileHistory.set(chatId, []);
    }
    
    const files = this.fileHistory.get(chatId);
    files.push({
      ...fileInfo,
      timestamp: Date.now()
    });

    // 保持最近的文件记录
    if (files.length > this.maxFileHistory) {
      files.shift();
    }

    // 保存历史记录
    this.saveHistory();
  }

  getRecentFiles(chatId, minutes = 30, fileType = 'all') {
    const files = this.fileHistory.get(chatId) || [];
    const cutoffTime = Date.now() - (minutes * 60 * 1000);
    
    return files.filter(file => {
      const isInTimeWindow = file.timestamp > cutoffTime;
      
      if (fileType === 'all') return isInTimeWindow;
      
      if (fileType === 'image') {
        return isInTimeWindow && file.messageType === 'Image';
      }
      
      if (fileType === 'document') {
        return isInTimeWindow && file.messageType === 'Attachment';
      }

      return isInTimeWindow;
    });
  }
}
