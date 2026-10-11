const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenAI } = require('@google/genai');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8572346434:AAGsFAfy9L1GPwSdrxBRHlgktmF4bydBW1A";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6LKHvo_qm8-i50dnq7vjbVkgrVxnleBU6Dhg-AgD23PqA";

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const MODELS_TO_TRY = [
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite"
];

async function askGemini(promptText) {
  let lastError = null;
  for (const modelName of MODELS_TO_TRY) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: promptText,
      });
      return response.text;
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  throw lastError;
}

// Telegram တွင် One-Click Copy ဖြစ်စေရန် Markdown ဖြင့် ပို့ပေးသည့် စနစ်
async function editWithOneClickCopy(chatId, messageId, text) {
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown"
    });
  } catch (err) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

const FLOW_SYSTEM_PROMPT = `
You are an expert TikTok Viral Content Strategist and Google Flow (Veo 3) AI Video Prompt Engineer.
When the user gives you a topic or video idea, generate a complete production plan formatted clearly.

IMPORTANT TELEGRAM FORMATTING RULE:
Wrap EVERY English video prompt and copyable caption inside single backticks (\`...\`) so the user can copy it with ONE CLICK in Telegram. Do NOT use triple backticks or unmatched asterisks/underscores.

1. TikTok Viral Hook & Concept (in Burmese):
   Briefly explain why this idea will go viral and what happens in the video.

2. Google Flow Prompts (in English - Tap to Copy):
   Create 3 sequential 8-second scenes (Total 24 seconds).
   - Start every scene prompt with: "Vertical 9:16 format,"
   - Keep the exact same character/subject visual description in ALL 3 scenes for consistency.
   - Include camera movement, lighting, visual style, and specific audio/sound effect cues at the end.

   Format EXACTLY as:
   🎬 Scene 1 (0-8s):
   \`Vertical 9:16 format, [Full English Prompt here]\`

   🎬 Scene 2 (8-16s):
   \`Vertical 9:16 format, [Full English Prompt here]\`

   🎬 Scene 3 (16-24s):
   \`Vertical 9:16 format, [Full English Prompt here]\`

3. TikTok Caption & Viral Hashtags (Tap to Copy):
   \`[Ready-to-post engaging caption and 5-8 trending hashtags]\`
`;

bot.onText(/\/(start|help)/, (msg) => {
  const welcomeText = 
    "👋 မင်္ဂလာပါ! TikTok Viral & Google Flow AI Bot မှ ကြိုဆိုပါတယ်။\n\n" +
    "📌 အသုံးပြုပုံများ (စာသားကို တစ်ချက်နှိပ်ရုံဖြင့် Copy ကူးနိုင်သည်) -\n\n" +
    "1️⃣ Trend ရှာရန် နမူနာ -\n" +
    "`/trend AI ဇာတ်လမ်းတို`\n" +
    "`/trend ချစ်စရာကြောင်လေးများ`\n\n" +
    "2️⃣ Video Prompt ထုတ်ရန် နမူနာ -\n" +
    "`မိုးရွာထဲမှာ ကော်ဖီသောက်နေတဲ့ ကြောင်လေး`";
  
  bot.sendMessage(msg.chat.id, welcomeText, { parse_mode: "Markdown" });
});

bot.onText(/\/trend(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  let topic = match[1] ? match[1].trim() : "";
  if (!topic) {
    topic = "General AI & Funny Cute Animals";
  }

  const waitMsg = await bot.sendMessage(chatId, `🔍 '${topic}' အတွက် TikTok Viral Idea များကို ရှာဖွေပေးနေပါတယ်...`);

  const prompt = `
    Suggest 5 highly viral TikTok AI video ideas for the niche/topic: '${topic}'.
    Write the response in Burmese. For each idea, provide:
    - A catchy title
    - Why it gets high views on TikTok
    - Wrap the 1-sentence idea text inside single backticks (\`...\`) so the user can tap once to copy and send it back to the bot. Do NOT use unmatched asterisks or underscores.
  `;

  try {
    const replyText = await askGemini(prompt);
    await editWithOneClickCopy(chatId, waitMsg.message_id, replyText);
  } catch (error) {
    bot.editMessageText(`❌ အမှားအယွင်းရှိနေပါသည်: ${error.message}`, {
      chat_id: chatId,
      message_id: waitMsg.message_id
    });
  }
});

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const userIdea = msg.text;

  const waitMsg = await bot.sendMessage(chatId, "🎬 Google Flow အတွက် One-Click Copy Video Prompt များကို ရေးသားပေးနေပါတယ်...");

  try {
    const replyText = await askGemini(`${FLOW_SYSTEM_PROMPT}\n\nUser Video Idea: ${userIdea}`);
    await editWithOneClickCopy(chatId, waitMsg.message_id, replyText);
  } catch (error) {
    bot.editMessageText(`❌ အမှားအယွင်းရှိနေပါသည်: ${error.message}`, {
      chat_id: chatId,
      message_id: waitMsg.message_id
    });
  }
});

console.log("✅ Node.js Bot စတင် အလုပ်လုပ်နေပါပြီ!");
