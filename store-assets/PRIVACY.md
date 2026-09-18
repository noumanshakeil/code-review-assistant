# Privacy Policy — Code Review Assistant (PocketMind)

**Live URL:** https://noumanshakeil.github.io/#privacy-policy  
**Publisher:** PocketMind  
**Support:** support.pocketmind@gmail.com  
**Last updated:** 2026-09-18

## Summary

Code Review Assistant is a desktop app. It does **not** operate PocketMind cloud accounts for your code. Your API keys and file contents stay on your device unless you choose to send them to a third-party AI provider.

## Data we store on your device

- API keys for providers you configure (OpenAI, Anthropic, DeepSeek, Google Gemini, Mistral, Groq)
- Optional GitHub token for private repository clones
- Provider / model preferences

Keys are stored with the operating system keychain when available, otherwise in an encrypted local file under your user profile (`~/.code-review-assistant/` on supported systems).

## Data sent over the network

When you run Review, Humanize, or Edit:

- Selected file contents and prompts are sent only to the AI provider you configured
- GitHub clone uses Git over HTTPS to GitHub (and your token if provided)

PocketMind does not receive your source code or API keys.

## Children

This product is intended for adults and developers. It is not directed at children under 13.

## Contact

Privacy questions: support.pocketmind@gmail.com
