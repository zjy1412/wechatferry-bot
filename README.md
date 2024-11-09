# 简介

这是基于[wechatyferry](https://github.com/wechatferry/wechatferry)开发的微信机器人，虽然使用的都是[wechaty](https://github.com/wechaty/wechaty)的`API`。写这个项目更多的是想试用`function calling`，这个功能比想象中要好用很多，我基于该功能和[searxng](https://github.com/searxng/searxng)搜索引擎实现了联网搜索功能，同时还实现了`URL`的读取。但是有一些由搜索引擎自身能力带来的不足，比如“每日新闻”，在网络搜索中并不会给你列出来今天发生的新闻，而全是新闻网站，并不能带来预期的信息，所以我个人认为联网应该要有更好的实现。

## 目录

- [简介](#简介)
  - [目录](#目录)
  - [安装](#安装)
  - [使用说明](#使用说明)

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
  "searchEngineURL": ""
}
```

配置完后登录微信，使用下面的指令即可启动。
```bash
node index.js
```

差点忘了，使用的一个库不知道为什么有测试没删导致报错，你可以根据报错指引去注释或删掉那个if语句。

你可以在`system_prompts`文件夹下添加你自己的提示词，然后对机器人发送提示词的名字就可以切换提示词了。

搜索和读取URL的功能则是根据你说话的内容触发的，因为我的实现相当粗暴，所以请小心使用，注意token消耗。