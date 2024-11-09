import { WechatferryPuppet } from '@wechatferry/puppet';
import { WechatyBuilder } from 'wechaty'
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import config from './config.json' assert { type: 'json' };
import { SearxngClient } from '@agentic/searxng';

// 日志记录函数
function log(level, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}]: ${message}`);
}

const systemPrompts = new Map();
const userPrompts = new Map();

function loadSystemPrompts() {
  const promptDir = "./system_prompts";
  try{
    const files = fs.readdirSync(promptDir);
    files.forEach(file => {
      if(file.endsWith('.txt')) {
        const name = path.basename(file, '.txt');
        const content = fs.readFileSync(path.join(promptDir, file), 'utf-8');

        // // 替换 {} 为当前日期
        // if (content.includes('{}')) {
        //   const currentDate = new Date().toISOString().split('T')[0]; // 格式化为 YYYY-MM-DD
        //   content = content.replace('{}', currentDate);
        // }

        systemPrompts.set(name, content);
      }
    });
    log('info', 'Loaded ${systemPrompts.size} system prompts.');
  } catch (error) {
    log('error', `Failed to load system prompts: ${error}`);
  }
}

loadSystemPrompts();

const openai = new OpenAI({
  baseURL: config.openai.baseURL,
  apiKey: config.openai.apiKey
});

const puppet = new WechatferryPuppet();
const bot = WechatyBuilder.build({ puppet });

const MAX_HISTORY_LENGTH = config.maxHistoryLength;
const HISTORY_TIMEOUT = 30 * 60 * 1000; // 30分钟
const chatHistory = new Map();
const lastInteraction = new Map(); // 记录最后互动时间

function getSystemPrompt(chatId, text) {
  const firstWord = text.split(/\s+/)[0];

  if(firstWord.toLowerCase() === 'default') {
    userPrompts.delete(chatId);
    chatHistory.delete(chatId);
    return {
      role: 'system',
      content: systemPrompts.get('default') || ''
    }
  }

  if (systemPrompts.has(firstWord)) {
    userPrompts.set(chatId, firstWord);
    chatHistory.delete(chatId);
    return {
      role: 'system',
      content: systemPrompts.get(firstWord)
    }
  }

  const currentPrompt = userPrompts.get(chatId);
  return {
    role: 'system',
    content: currentPrompt ? systemPrompts.get(currentPrompt) : systemPrompts.get('default') || ''
  };
}

// 更新聊天记录的函数
function updateChatHistory(chatId, role, content) {
  if (!chatHistory.has(chatId)) {
    chatHistory.set(chatId, []);
  }

  const history = chatHistory.get(chatId);
  history.push({ role, content });
  lastInteraction.set(chatId, Date.now()); // 更新最后互动时间

  if (history.length > MAX_HISTORY_LENGTH) {
    history.shift();
  }
}

// 定时清理超时的历史记录
setInterval(() => {
  const now = Date.now();
  for (const [chatId, timestamp] of lastInteraction.entries()) {
    if (now - timestamp > HISTORY_TIMEOUT) {
      chatHistory.delete(chatId);
      lastInteraction.delete(chatId);
      log('info', `Cleared history for chat ID: ${chatId} due to inactivity.`);
    }
  }
}, 60 * 1000); // 每分钟检查一次

const searxngConfig = {
  apiBaseUrl: 'https://searxng2.qunqin.org'
};

const searxngClient = new SearxngClient(searxngConfig);

const tools = [
  {
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
            description: "Search keywords list. Example: ['Python', 'machine learning', 'latest developments']"
          }
        },
        required: ["keywords"]
      }
    }
  }
];

async function searchInternet(keywords) {
  try {
    log('info', `Searching the internet for: ${keywords}`);
    const query = keywords.join(' ');
    const searchResults = await searxngClient.search({
      query,
      categories: ['general', 'news'],
      engines: ['google', 'bing', 'duckduckgo']
    });

    const formattedResults = searchResults.results.slice(0, 5).map(result => ({
      title: result.title,
      url: result.url,
      content: result.content
    }));
    log('info', `Search results: ${JSON.stringify(formattedResults)}`);
    return formattedResults;
  } catch (error) {
    log('error', `Search failed: ${error}`);
    return [];
  }
}

// 处理消息的函数，用于和 OpenAI 交互
async function processMessage(userMessage, chatId) {
  try {
    const systemPrompt = getSystemPrompt(chatId, userMessage);
    
    const firstWord = userMessage.split(/\s+/)[0];
    if (systemPrompts.has(firstWord) || firstWord.toLowerCase() === 'default') {
      userMessage = userMessage.substring(firstWord.length).trim();
      if(!userMessage) return '已切换系统提示词。';
    }

    updateChatHistory(chatId, 'user', userMessage);
    const history = chatHistory.get(chatId) || [];

    const initialResponse = await openai.chat.completions.create({
      messages: [
        { role: 'user', content: userMessage }
      ],
      model: 'deepseek-chat',
      tools: tools
    });

    const responseMessage = initialResponse.choices[0].message;
    
    if(responseMessage.tool_calls) {
      const toolCall = responseMessage.tool_calls[0];
      if (toolCall.function.name === 'search_internet') {
        log('info', 'search_internet tool call detected');
        const args = JSON.parse(toolCall.function.arguments);
        const searchResults = await searchInternet(args.keywords);

        const finalResponse = await openai.chat.completions.create({
          messages: [
            systemPrompt,
            ...history,
            responseMessage,
            {
              role: 'tool',
              content: JSON.stringify(searchResults),
              tool_call_id: toolCall.id
            }
          ],
          model: 'deepseek-chat',
          max_tokens: 800,
          temperature: 0.8,
          frequency_penalty: 0.4,
        });

        const botReply = finalResponse.choices[0].message.content;
        updateChatHistory(chatId, 'assistant', botReply);
        return botReply;
      }
    }
    const SecondResponse = await openai.chat.completions.create({
      messages: [
        systemPrompt,
        ...history,
        { role: 'user', content: userMessage }
      ],
      model: 'deepseek-chat',
      max_tokens: 800,
      temperature: 0.8,
      frequency_penalty: 0.4,
    });
    const responseMessage1 = SecondResponse.choices[0].message;
    const botReply = responseMessage1.content;
    updateChatHistory(chatId, 'assistant', botReply);
    return botReply;
  }catch (error) {
    log('error', `Error processing message: ${error}`);
    return '抱歉，我目前无法回答您的问题。';
  }
}

// 在程序启动时恢复历史记录
try {
  const savedHistory = fs.readFileSync('chatHistory.json', 'utf-8');
  const parsedHistory = JSON.parse(savedHistory);
  parsedHistory.forEach(([key, value]) => chatHistory.set(key, value));
  log('info', 'Loaded existing chat history.');
} catch (error) {
  log('info', 'No existing chat history found. Starting fresh.');
}

// 在程序退出时保存历史记录
process.on('exit', () => {
  fs.writeFileSync('chatHistory.json', JSON.stringify([...chatHistory]));
  log('info', 'Saved chat history on exit.');
});

bot.on('message', async (msg) => {
  // 忽略自己发送的消息
  if (msg.self()) return;

  const room = msg.room();
  const talker = msg.talker();
  const botName = 'yjz2141';
  const text = msg.text().trim();

  // 区分群聊和私聊的逻辑
  if (room) {
    // 在群聊中，只有被 @ 时才触发
    if (await msg.mentionSelf()) {
      const userMessage = text.replace(new RegExp(`@${botName}\\s?`, 'g'), '').trim();
      log('info', `Message in group with @: ${userMessage}`);

      const reply = await processMessage(userMessage, room.id);
      await msg.say(reply);
    }
  } else {
    // 在私聊中，直接进行聊天
    log('info', `Message in private chat: ${text}`);

    const reply = await processMessage(text, talker.id);
    await msg.say(reply);
  }
});

bot.start()
  .then(() => log('info', 'Bot started'))
  .catch(error => log('error', `Failed to start bot: ${error}`));