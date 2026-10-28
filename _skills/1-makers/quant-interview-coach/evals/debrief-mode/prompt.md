---
tags: [quant-interview-coach]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash, WebSearch, WebFetch, Agent]
---

刚面完一家量化私募的第一轮，帮我复盘。

第一题：一枚公平硬币一直抛，直到连续两次正面（HH）为止，问期望抛几次。我列了状态方程，答 6。面试官追问：换成先出现“正反”（HT）呢？我说也是 6，他没说对错。

第二题（Python）：给一个字符串列表，把互为字母异位词的分到一组。我想到把每个词排序后当 key，但 list 不能当字典的 key，卡了大概十分钟；面试官提示用 tuple，我写完了，没来得及讲复杂度。

最后面试官说，这个岗位最看重“把想法很快变成能跑的代码”。
