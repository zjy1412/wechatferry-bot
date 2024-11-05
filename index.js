import { WechatferryPuppet } from '@wechatferry/puppet';
import { WechatyBuilder } from 'wechaty'
import OpenAI from 'openai';
import fs from 'fs';
import config from './config.json' assert { type: 'json' };


// 日志记录函数
function log(level, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}]: ${message}`);
}

// 读取系统提示词文件
const systemPromptContent = fs.readFileSync(config.systemPromptPath, 'utf-8');

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

const SYSTEM_PROMPT = {
  role: 'system',
  content: systemPromptContent
};

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

// 处理消息的函数，用于和 OpenAI 交互
async function processMessage(userMessage, chatId) {
  try {
    updateChatHistory(chatId, 'user', userMessage);

    const history = chatHistory.get(chatId) || [];
    const completion = await openai.chat.completions.create({
      messages: [
        SYSTEM_PROMPT,
        ...history,
        { role: 'user', content: userMessage }
      ],
      model: 'deepseek-chat',
    });

    const botReply = completion.choices[0].message.content;
    updateChatHistory(chatId, 'assistant', botReply);
    return botReply;
  } catch (error) {
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
  const botName = bot.name();
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
