import fs from 'fs';
import { WechatferryPuppet } from '@wechatferry/puppet';
import { WechatyBuilder } from 'wechaty';
import OpenAI from 'openai';
import { loadConfig } from './src/utils/configLoader.js';
const config = loadConfig();
import { log } from './src/utils/logger.js';
import { ChatHistoryManager } from './src/services/chatHistory.js';
import { SearchService } from './src/services/searchService.js';
import { PromptManager } from './src/services/promptManager.js';
import { URLReaderService } from './src/services/urlReader.js';
import path from 'path';

const model = config.openai?.model;
const openai = new OpenAI({
  baseURL: config.openai?.baseURL,
  apiKey: config.openai?.apiKey
});
  
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

async function initializeBot() {
  let currentRetry = 0;
  
  while (currentRetry < MAX_RETRIES) {
    try {
      const puppet = new WechatferryPuppet({
        timeout: 30000, // 30 seconds timeout
      });
      
      const bot = WechatyBuilder.build({ 
        puppet,
        puppetOptions: {
          timeout: 30000,
        }
      });

      const promptManager = new PromptManager();
      const historyManager = new ChatHistoryManager(config.maxHistoryLength);
      const searchService = new SearchService(config.searchEngineURL);
      const urlReaderService = new URLReaderService();

      // Initialize enabled tools based on config
      const tools = [];
      
      if (config.features?.searchEnabled) {
        tools.push({
          type: "function",
          function: {
            name: "search_internet",
            description: "Search the internet for current information using SearXNG",
            parameters: {
              type: "object",
              properties: {
                keywords: {
                  type: "array",
                  items: { type: "string" },
                  description: "Search keywords list"
                }
              },
              required: ["keywords"]
            }
          }
        });
      }

      if (config.features?.urlReaderEnabled) {
        tools.push({
          type: "function",
          function: {
            name: "read_url",
            description: "Read and extract content from a URL (webpage or PDF)",
            parameters: {
              type: "object",
              properties: {
                url: {
                  type: "string",
                  description: "The URL to read"
                }
              },
              required: ["url"]
            }
          }
        });
      }

      if (config.features?.chatHistoryEnabled) {
        tools.push({
          type: "function",
          function: {
            name: "get_chat_context",
            description: "Get relevant chat history context",
            parameters: {
              type: "object",
              properties: {
                purpose: {
                  type: "string",
                  enum: ["summarize", "reference", "analyze"],
                  description: "The purpose of retrieving chat context: summarize (摘要总结), reference (相关引用), analyze (互动分析)"
                },
                keywords: {
                  type: "array",
                  items: { type: "string" },
                  description: "Optional keywords to filter relevant messages"
                }
              },
              required: ["purpose"]
            }
          }
        });
      }

      if (config.features?.newsEnabled) {
        tools.push({
          type: "function",
          function: {
            name: "get_today_news",
            description: "Get today's news summary",
            parameters: {
              type: "object",
              properties: {},
              required: []
            }
          }
        });
      }

      // Start the bot first
      await bot.start();
      log('info', 'Bot started successfully');

      async function processMessage(userMessage, chatId, username = '', isGroupChat = false) {
        try {
          const systemPrompt = promptManager.getSystemPrompt(chatId, userMessage);
          const messageContent = promptManager.extractMessageContent(userMessage);

          if (promptManager.isPromptSwitchCommand(userMessage) && !messageContent) {
            return '已切换系统提示词。';
          }

          historyManager.updateHistory(chatId, 'user', messageContent, username);
          const history = historyManager.getHistory(chatId);

          const initialResponse = await openai.chat.completions.create({
            messages: [
              { role: 'user', content: messageContent }
            ],
            model: model,
            tools: tools
          });

          const responseMessage = initialResponse.choices[0].message;
          
          if (responseMessage.tool_calls) {
            const toolCall = responseMessage.tool_calls[0];
            let toolResponse;

            try {
              if (toolCall.function.name === 'get_chat_context') {
                log('info', 'Tool call: get_chat_context');
                const args = JSON.parse(toolCall.function.arguments);
                // 直接使用当前的 chatId，不再从参数中获取
                toolResponse = await historyManager.getChatContext(chatId, args.purpose, args.keywords);
              } else if (toolCall.function.name === 'search_internet') {
                log('info', 'Tool call: search_internet');
                const args = JSON.parse(toolCall.function.arguments);
                toolResponse = await searchService.search(args.keywords);
              } else if (toolCall.function.name === 'read_url') {
                log('info', 'Tool call: read_url');
                const args = JSON.parse(toolCall.function.arguments);
                toolResponse = await urlReaderService.readURL(args.url);
              } else if (toolCall.function.name === 'get_today_news') {
                log('info', 'Tool call: get_today_news');
                toolResponse = await urlReaderService.readURL('https://api.lbbb.cc/api/60miao');
              } 
            } catch (error) {
              log('error', `Tool execution failed: ${error}`);
              return `工具执行失败: ${error.message}`;
            }

            log('info', `Tool response: ${JSON.stringify(toolResponse)}`);

            const finalResponse = await openai.chat.completions.create({
              messages: [
                systemPrompt,
                ...history,
                responseMessage,
                {
                  role: 'tool',
                  content: JSON.stringify(toolResponse),
                  tool_call_id: toolCall.id
                }
              ],
              model: model,
            });

            const botReply = finalResponse.choices[0].message.content;
            historyManager.updateHistory(chatId, 'assistant', botReply);
            return botReply;
          }

          const secondResponse = await openai.chat.completions.create({
            messages: [
              systemPrompt,
              ...history,
              { role: 'user', content: messageContent }
            ],
            model: model,
          });
          
          const botReply = secondResponse.choices[0].message.content;
          historyManager.updateHistory(chatId, 'assistant', botReply);
          return botReply;
        } catch (error) {
          log('error', `Error processing message: ${error}`);
          return '抱歉，我目前无法回答您的问题。';
        }
      }

      bot.on('scan', (qrcode, status) => {
        log('info', `Scan QR Code to login: ${status}`);
      });

      bot.on('login', (user) => {
        log('info', `User ${user} logged in`);
      });

      bot.on('message', async (msg) => {
        if (msg.self()) return;

        const room = msg.room();
        const talker = msg.talker();
        const chatId = room ? room.id : talker.id;
        const text = msg.text().trim();

        const botName = bot.currentUser.name();

        if (room) {
          const roomId = room.id;
          const talkerName = talker.name();
          
          // Always record group messages for context
          historyManager.addGroupMessage(roomId, talkerName, text);
          
          if (await msg.mentionSelf()) {
            const userMessage = text.replace(new RegExp(`@${botName}\\s?`, 'g'), '').trim();
            log('info', `Message in group with @: ${userMessage}`);

            // Get room topic for better context
            const topic = await room.topic();
            log('info', `Group name: ${topic}`);

            const reply = await processMessage(userMessage, roomId, talkerName, true);
            
            // Format reply for group chat
            // const formattedReply = reply.startsWith(`@${talkerName}`) ? reply : `@${talkerName} ${reply}`;
            await room.say(reply, talker);
          }
        } else {
          log('info', `Message in private chat: ${text}`);

          const reply = await processMessage(text, talker.id, talker.name(), false);
          await msg.say(reply);
        }
      });

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        await fileReaderService.cleanup();
        log('info', 'Received SIGINT. Saving state and shutting down...');
        await bot.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await fileReaderService.cleanup();
        log('info', 'Received SIGTERM. Saving state and shutting down...');
        await bot.stop();
        process.exit(0);
      });

      return true;

    } catch (error) {
      currentRetry++;
      log('error', `Failed to start bot (attempt ${currentRetry}/${MAX_RETRIES}): ${error}`);
      
      if (currentRetry < MAX_RETRIES) {
        log('info', `Retrying in ${RETRY_DELAY/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      } else {
        log('error', 'Max retries reached. Unable to start bot.');
        throw error;
      }
    }
  }
}

// Initialize the bot with retry mechanism
initializeBot()
  .catch(error => {
    log('error', `Fatal error: ${error}`);
    process.exit(1);
  });
