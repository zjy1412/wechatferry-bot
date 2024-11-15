# 简介

这是基于[wechatferry](https://github.com/wechatferry/wechatferry)开发的微信机器人，虽然使用的都是[wechaty](https://github.com/wechaty/wechaty)的`API`。该项目充分利用了`function calling`功能，实现了联网搜索、PDF/网页阅读、历史记录管理等多项功能。

## 目录

- [简介](#简介)
  - [目录](#目录)
  - [特性](#特性)
  - [安装](#安装)
  - [使用说明](#使用说明)
  - [配置说明](#配置说明)

## 特性

- 🔍 **智能搜索**: 使用SearXNG搜索引擎实现联网搜索
- 📄 **文档阅读**: 支持网页和PDF文档的内容提取和分析
- 💬 **上下文管理**: 
  - 自动管理对话历史
  - 支持群聊和私聊
  - 历史记录自动归档和清理
- 🎭 **角色切换**: 通过system_prompts文件夹配置多种对话角色
- 📊 **状态管理**: 自动保存和恢复会话状态
- 🔄 **自动重试**: 连接失败时自动重试机制

## 安装

先克隆仓库。
```bash
git clone https://github.com/zjy1412/wechatyferry-bot.git
```

没有安装`node.js`的可以去[这里](https://nodejs.org/en)安装。

```bash
npm install
```

另外需要使用[3.9.10.27](https://github.com/tom-snow/wechat-windows-versions/releases/tag/v3.9.10.27)这个版本的微信。（不是很推荐使用大号，请始终知晓有封号风险）

## 使用说明

先填写`config.json`。其中`openai`里可以选择使用任何提供openai格式的具有`funtion calling`功能的大语言模型，我个人测试的时候使用的是`deepseek`（想试用nextchat的插件的时候竟然只支持`openai`的模型，明明只要有`funtion calling`就能用插件了）

`searchEngineURL`处则填写`searxng`的`URL`，可以到[这里](https://searx.space/)去寻找网址，也可以选择自己部署。

```json
{
  "openai": {
    "model": "",
    "baseURL": "", 
    "apiKey": "" 
  },
  "maxHistoryLength": 5,
  "searchEngineURL": "",
    "archiveExpirationTime": 86400000,
  "features": {
    "searchEnabled": true,
    "urlReaderEnabled": true,
    "chatHistoryEnabled": true,
    "newsEnabled": true
  }
}
```

配置完后登录微信，使用下面的指令即可启动。
```bash
node index.js
```

差点忘了，使用的一个库不知道为什么有测试没删导致报错，你可以根据报错指引去注释或删掉那个if语句。

你可以在`system_prompts`文件夹下添加你自己的提示词，然后对机器人发送提示词的名字就可以切换提示词了。

搜索和读取URL的功能则是根据你说话的内容触发的，因为我的实现相当粗暴，所以请小心使用，注意token消耗。

## 配置说明

配置文件`config.json`支持以下选项：

1. OpenAI配置

- model: 使用的模型名称，支持任何兼容OpenAI API的模型
- baseURL: API接口地址
- apiKey: API访问密钥
2. 系统配置

- maxHistoryLength: 每个会话保留的最大历史消息数
- searchEngineURL: SearXNG搜索引擎的URL地址
- archiveExpirationTime: 历史记录归档的过期时间(毫秒)
3. 功能开关

- searchEnabled: 启用/禁用网络搜索功能
- urlReaderEnabled: 启用/禁用URL内容读取功能
- chatHistoryEnabled: 启用/禁用聊天历史管理
- newsEnabled: 启用/禁用新闻功能