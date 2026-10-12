const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenAI } = require('@google/genai');
const { EdgeTTS } = require('node-edge-tts');
const ffmpegPath = require('ffmpeg-static');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8572346434:AAGsFAfy9L1GPwSdrxBRHlgktmF4bydBW1A";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6LKHvo_qm8-i50dnq7vjbVkgrVxnleBU6Dhg-AgD23PqA";

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// လက်ရှိ ရွေးချယ်ထားသော မြန်မာအသံ (Default: မိန်းကလေးအသံ Nilar)
let currentVoice = "my-MM-NilarNeural";

const MODELS_TO_TRY = [
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite"
];

async function askGemini(contentsInput) {
  let lastError = null;
  for (const modelName of MODELS_TO_TRY) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: contentsInput,
      });
      return response.text;
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  throw lastError;
}

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

// မြန်မာစာသားမှ MP3 အသံဖိုင် ထုတ်ပေးသည့် စနစ်
async function generateBurmeseAudio(text, outputAudioPath) {
  const tts = new EdgeTTS({
    voice: currentVoice,
    lang: "my-MM",
    outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    rate: "+5%",
    timeout: 30000
  });
  await tts.ttsPromise(text, outputAudioPath);
}

// FFmpeg ဖြင့် Video နှင့် မြန်မာ Recap အသံကို ပေါင်းစပ်ပေးသည့် စနစ်
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

async function mergeVideoAndAudio(videoPath, audioPath, outputPath) {
  try {
    // မူရင်းဗီဒီယိုမှ နောက်ခံအသံကို 20% လျှော့ချပြီး မြန်မာ Recap အသံကို အပေါ်မှ ထပ်ပေါင်းမည်
    await runFfmpeg([
      "-y",
      "-i", videoPath,
      "-i", audioPath,
      "-filter_complex", "[0:a]volume=0.20[bg];[1:a]volume=1.5[vo];[bg][vo]amix=inputs=2:duration=first:dropout_transition=2[a]",
      "-map", "0:v:0",
      "-map", "[a]",
      "-c:v", "copy",
      "-c:a", "aac",
      outputPath
    ]);
  } catch (err) {
    // မူရင်းဗီဒီယိုတွင် အသံလုံးဝမပါပါက မြန်မာ Recap အသံကို တိုက်ရိုက်ထည့်ပေးမည်
    await runFfmpeg([
      "-y",
      "-i", videoPath,
      "-i", audioPath,
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-c:v", "copy",
      "-c:a", "aac",
      "-shortest",
      outputPath
    ]);
  }
}

const FLOW_SYSTEM_PROMPT = `
You are an expert TikTok Viral Content Strategist, Burmese Movie/Video Recap Scriptwriter, and Google Flow (Veo 3) AI Video Prompt Engineer.
When the user gives you a topic or video idea, generate a complete production plan formatted clearly.

IMPORTANT TELEGRAM FORMATTING RULE:
Wrap EVERY copyable English video prompt, Burmese Recap Script, and TikTok Caption inside single backticks (\`...\`) so the user can copy it with ONE CLICK in Telegram. Do NOT use triple backticks or unmatched asterisks/underscores.
Also wrap the pure Burmese narration paragraph inside <voiceover>...</voiceover> tags at the very end so the bot can convert it to audio.

1. TikTok Viral Hook & Concept (in Burmese):
   Briefly explain why this idea will go viral.

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

3. 🎙️ မြန်မာလို Video Recap Script:
   \`[Write a smooth, natural Burmese voiceover script for a 24-second video here]\`

4. 📱 TikTok Caption & Viral Hashtags:
   \`[Ready-to-post engaging Burmese caption and 5-8 trending hashtags]\`

<voiceover>[Put ONLY the pure Burmese spoken narration sentences here, no English, no emojis, no timestamps]</voiceover>
`;

const VIDEO_RECAP_PROMPT = `
You are a professional Burmese TikTok Video Recap Narrator.
Watch this video carefully and write a highly engaging, viral Burmese Recap for TikTok.

CRITICAL RULE:
1. Wrap copyable text blocks inside single backticks (\`...\`) for one-click copying in Telegram. Do NOT use triple backticks or unmatched asterisks/underscores.
2. At the very end of your response, you MUST include <voiceover>...</voiceover> containing ONLY the pure Burmese spoken narration sentences (no timestamps, no emojis, no English words) timed to fit the length of this video naturally when spoken aloud.

Format your response in Burmese as follows:

1. 🎙️ အသံသွင်းထားသော မြန်မာ Recap စာသား (One-Click Copy):
   \`[ဗီဒီယိုတစ်ပုဒ်လုံးအတွက် မြန်မာ Recap Script အပြည့်အစုံ]\`

2. 📱 TikTok Caption & Hashtags (One-Click Copy):
   \`[မြန်မာလို Caption နှင့် Trending Hashtags များ]\`

<voiceover>[Pure Burmese narration text only, no emojis or symbols]</voiceover>
`;

bot.onText(/\/(start|help)/, (msg) => {
  const welcomeText = 
    "👋 မင်္ဂလာပါ! TikTok Viral, Google Flow & Auto Burmese Dubbing AI Bot မှ ကြိုဆိုပါတယ်။\n\n" +
    "📌 အသုံးပြုပုံများ -\n\n" +
    "1️⃣ 🎥 **ဗီဒီယိုထဲသို့ မြန်မာ Recap အသံ တန်းထည့်ရန်:**\n" +
    "Google Flow မှာ ပေါင်းပြီးသား Video ဖိုင်ကို ဒီ Chat ထဲသို့ တိုက်ရိုက်ပို့ပေးလိုက်ပါ။ Bot က ဗီဒီယိုကိုကြည့်ပြီး **မြန်မာ Recap အသံသွင်းပြီးသား Video** ကို ပြန်ပို့ပေးပါမယ်!\n\n" +
    "2️⃣ 🎬 **Flow Prompt + မြန်မာ Recap အသံထုတ်ရန်:**\n" +
    "`မိုးရွာထဲမှာ ကော်ဖီသောက်နေတဲ့ ကြောင်လေး`\n\n" +
    "3️⃣ 🔍 **Trend ရှာရန်:**\n" +
    "`/trend AI ဇာတ်လမ်းတို`\n\n" +
    "4️⃣ 🗣️ **မြန်မာအသံ ပြောင်းရန်:**\n" +
    "`/female` - မိန်းကလေးအသံ (Nilar)\n" +
    "`/male` - ယောက်ျားလေးအသံ (Thiha)\n" +
    "`/voice မင်္ဂလာပါ` - စာသားမှ မြန်မာအသံ MP3 သီးသန့်ထုတ်ရန်";
  
  bot.sendMessage(msg.chat.id, welcomeText, { parse_mode: "Markdown" });
});

// မိန်းကလေးအသံ ပြောင်းရန်
bot.onText(/\/female/, (msg) => {
  currentVoice = "my-MM-NilarNeural";
  bot.sendMessage(msg.chat.id, "✅ မြန်မာ Recap အသံကို **မိန်းကလေးအသံ (Nilar)** သို့ ပြောင်းလဲလိုက်ပါပြီ။", { parse_mode: "Markdown" });
});

// ယောက်ျားလေးအသံ ပြောင်းရန်
bot.onText(/\/male/, (msg) => {
  currentVoice = "my-MM-ThihaNeural";
  bot.sendMessage(msg.chat.id, "✅ မြန်မာ Recap အသံကို **ယောက်ျားလေးအသံ (Thiha)** သို့ ပြောင်းလဲလိုက်ပါပြီ။", { parse_mode: "Markdown" });
});

// /voice command ဖြင့် စာသားမှ မြန်မာ MP3 အသံဖိုင် တိုက်ရိုက်ထုတ်ရန်
bot.onText(/\/voice(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const text = match[1] ? match[1].trim() : "";
  if (!text) {
    return bot.sendMessage(chatId, "⚠️ ကျေးဇူးပြု၍ `/voice` နောက်တွင် အသံထုတ်လိုသော မြန်မာစာသား ရေးပေးပါ။", { parse_mode: "Markdown" });
  }

  const waitMsg = await bot.sendMessage(chatId, "🎙️ မြန်မာ AI အသံဖိုင် ထုတ်ပေးနေပါတယ်...");
  const audioPath = path.join(__dirname, `tts_${Date.now()}.mp3`);

  try {
    await generateBurmeseAudio(text, audioPath);
    await bot.sendAudio(chatId, audioPath, { caption: "🎙️ မြန်မာ Recap Voiceover MP3" });
    await bot.deleteMessage(chatId, waitMsg.message_id);
  } catch (error) {
    bot.editMessageText(`❌ အသံထုတ်ရာတွင် အမှားရှိနေပါသည်: ${error.message}`, {
      chat_id: chatId,
      message_id: waitMsg.message_id
    });
  } finally {
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  }
});

// /trend command
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

// ဗီဒီယိုဖိုင် ပို့လာသည့်အခါ မြန်မာ Recap စာသား + အသံသွင်းပြီးသား Video ပြန်ပို့ပေးရန်
bot.on('video', async (msg) => {
  const chatId = msg.chat.id;
  const waitMsg = await bot.sendMessage(chatId, "🎥 1/3 - သင့်ဗီဒီယိုကို ကြည့်ရှုပြီး မြန်မာ Recap Script ရေးသားနေပါတယ်...");

  const stamp = Date.now();
  const inputVideoPath = path.join(__dirname, `in_${stamp}.mp4`);
  const audioPath = path.join(__dirname, `vo_${stamp}.mp3`);
  const outputVideoPath = path.join(__dirname, `out_${stamp}.mp4`);

  try {
    const fileId = msg.video.file_id;
    const fileLink = await bot.getFileLink(fileId);
    
    const response = await fetch(fileLink);
    const arrayBuffer = await response.arrayBuffer();
    const videoBuffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(inputVideoPath, videoBuffer);

    const base64Video = videoBuffer.toString("base64");
    const mimeType = msg.video.mime_type || "video/mp4";
    const extraCaption = msg.caption ? `\nUser Note: ${msg.caption}` : "";

    const rawReply = await askGemini([
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Video
        }
      },
      {
        text: VIDEO_RECAP_PROMPT + extraCaption
      }
    ]);

    // <voiceover>...</voiceover> ထဲမှ မြန်မာစကားပြောသီးသန့်ကို ဆွဲထုတ်ခြင်း
    const voMatch = rawReply.match(/<voiceover>([\s\S]*?)<\/voiceover>/i);
    const cleanReply = rawReply.replace(/<voiceover>[\s\S]*?<\/voiceover>/gi, "").trim();
    const narrationText = voMatch ? voMatch[1].trim() : cleanReply;

    await bot.editMessageText("🎙️ 2/3 - မြန်မာ AI Recap အသံသွင်းပြီး ဗီဒီယိုထဲသို့ ပေါင်းထည့်နေပါတယ်...", {
      chat_id: chatId,
      message_id: waitMsg.message_id
    });

    await generateBurmeseAudio(narrationText, audioPath);
    await mergeVideoAndAudio(inputVideoPath, audioPath, outputVideoPath);

    await bot.editMessageText("📤 3/3 - မြန်မာ Recap အသံသွင်းပြီးသား ဗီဒီယိုကို ပို့ပေးနေပါတယ်...", {
      chat_id: chatId,
      message_id: waitMsg.message_id
    });

    // ၁။ အသံသွင်းပြီးသား Video ပို့ပေးခြင်း
    await bot.sendVideo(chatId, outputVideoPath, {
      caption: "✅ မြန်မာ Recap အသံသွင်းပြီးသား ဗီဒီယို ရပါပြီ!"
    });

    // ၂။ သီးသန့် MP3 အသံဖိုင် ပို့ပေးခြင်း
    await bot.sendAudio(chatId, audioPath, {
      caption: "🎙️ သီးသန့် မြန်မာ Voiceover MP3 (CapCut တွင် လိုသလို ပြန်ချိန်ရန်)"
    });

    // ၃။ Recap စာသားနှင့် TikTok Caption ပို့ပေးခြင်း
    await editWithOneClickCopy(chatId, waitMsg.message_id, cleanReply);

  } catch (error) {
    bot.editMessageText(`❌ လုပ်ဆောင်ရာတွင် အမှားအယွင်းရှိနေပါသည် (ဗီဒီယိုဖိုင် 20MB အောက်သာ ပို့ပေးပါ): ${error.message}`, {
      chat_id: chatId,
      message_id: waitMsg.message_id
    });
  } finally {
    if (fs.existsSync(inputVideoPath)) fs.unlinkSync(inputVideoPath);
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    if (fs.existsSync(outputVideoPath)) fs.unlinkSync(outputVideoPath);
  }
});

// ရိုးရိုးစာပို့သည့်အခါ Google Flow Prompt + မြန်မာ Recap စာသားနှင့် MP3 အသံဖိုင်ပါ ထုတ်ပေးရန်
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const userIdea = msg.text;
  const audioPath = path.join(__dirname, `idea_${Date.now()}.mp3`);

  const waitMsg = await bot.sendMessage(chatId, "🎬 Google Flow Prompt နှင့် 🎙️ မြန်မာ Recap အသံဖိုင်များကို ထုတ်ပေးနေပါတယ်...");

  try {
    const rawReply = await askGemini(`${FLOW_SYSTEM_PROMPT}\n\nUser Video Idea: ${userIdea}`);
    const voMatch = rawReply.match(/<voiceover>([\s\S]*?)<\/voiceover>/i);
    const cleanReply = rawReply.replace(/<voiceover>[\s\S]*?<\/voiceover>/gi, "").trim();

    await editWithOneClickCopy(chatId, waitMsg.message_id, cleanReply);

    if (voMatch && voMatch[1].trim()) {
      await generateBurmeseAudio(voMatch[1].trim(), audioPath);
      await bot.sendAudio(chatId, audioPath, {
        caption: "🎙️ ဤဇာတ်လမ်းအတွက် အသင့်သုံး မြန်မာ Recap Voiceover MP3"
      });
    }
  } catch (error) {
    bot.editMessageText(`❌ အမှားအယွင်းရှိနေပါသည်: ${error.message}`, {
      chat_id: chatId,
      message_id: waitMsg.message_id
    });
  } finally {
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  }
});

console.log("✅ Node.js Bot (with Auto Burmese Video Dubbing) စတင် အလုပ်လုပ်နေပါပြီ!");
