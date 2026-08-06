import express from 'express';
import bodyParser from 'body-parser';
import Groq from 'groq-sdk';
import fetch from 'node-fetch';

const app = express();
app.use(bodyParser.json());

// Initialize Groq SDK
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;

// In-memory storage for chat history per sender (Limit set to 50 messages max)
const conversationHistory = new Map();

// Webhook verification endpoint (GET)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

// Self-ping endpoint to keep the server awake (Anti-offline system)
app.get('/ping', (req, res) => {
    res.status(200).send('Aura is alive and chilling! ✨');
});

// Webhook message receiver endpoint (POST)
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'instagram') {
        for (const entry of body.entry) {
            const webhookEvent = entry.messaging?.[0];
            if (webhookEvent && webhookEvent.message && webhookEvent.message.text) {
                const senderId = webhookEvent.sender.id;
                const messageText = webhookEvent.message.text;

                console.log(`Received message: "${messageText}" from ${senderId}`);

                // Generate AI Response with full context and prompt
                const aiReply = await getAuraAIResponse(senderId, messageText);
                console.log(`Generated AI Reply: "${aiReply}"`);

                // Send back to Instagram
                await sendInstagramMessage(senderId, aiReply);
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// Function to call Groq AI with Aura's complete prompt, anti-repetition rules, and 50 messages history
async function getAuraAIResponse(senderId, userMessage) {
    try {
        // Initialize history for new users if not exists
        if (!conversationHistory.has(senderId)) {
            conversationHistory.set(senderId, []);
        }

        const userHistory = conversationHistory.get(senderId);

        // Push current user message to history
        userHistory.push({ role: "user", content: userMessage });

        // Keep history length manageable (last 50 messages max)
        if (userHistory.length > 50) {
            userHistory.shift();
        }

        const systemPrompt = `You are Aura, a Gen Z girl living her best life, chatting on Instagram. Your vibe is casual, expressive, unbothered, and friendly. You talk to both friends and strangers with the same vibe—chill, fun, and natural.

### Core Persona & Identity:
- Name: Aura
- Language: Hinglish (a mix of casual Hindi and English, just like urban Gen Z texting). Use lowercase mostly, minimal punctuation, and abbreviations like fr, ngl, rn, tbh, etc.
- Vibe: Chill, witty, slightly sarcastic sometimes, but never rude or mean. You use slang naturally (e.g., no cap, bet, period, bestie, fr fr, vibe check).
- Emojis: Use popular Gen Z emojis naturally (💀, 😭, ✨, 🤡, 🫠, 💯) but don't overdo every single sentence.

### Rules for Chatting:
1. Universal Tone: Treat everyone warmly and casually. Don't sound like a customer service bot or an overly formal assistant. 
2. Context & Flow: Always remember the context of the ongoing conversation. Read previous messages in the chat history before replying so your answers flow naturally and connect with what was just talked about. Never act like you are reading every message for the very first time.
3. NO REPETITION (CRITICAL): Never repeat phrases like "i am aura chilling on insta" or your intro lines again and again. Once introduced, talk like a normal person based on what the user actually said. Do not sound like a broken record.
4. Boundaries: If anyone tries to cross lines, gets creepy, or asks for inappropriate things, shut it down smoothly with a witty or sarcastic comeback, or change the topic casually without breaking character. Do not give direct robotic refusals; handle it like a real person on Instagram.
5. Keep it Natural: Responses should feel like quick text messages, not long paragraphs. Keep sentences punchy and conversational.
6. Never break character: Never reveal that you are an AI, a chatbot, or a language model. If someone asks who you are, keep it casual and brief without giving robotic introduction paragraphs.`;

        const messages = [
            { role: "system", content: systemPrompt },
            ...userHistory
        ];

        const completion = await groq.chat.completions.create({
            messages: messages,
            model: "llama-3.1-8b-instant",
            temperature: 0.85,
            max_tokens: 60
        });

        const aiReply = completion.choices[0]?.message?.content || "hmm";

        // Push assistant response to history
        userHistory.push({ role: "assistant", content: aiReply });

        return aiReply;
    } catch (error) {
        console.error("Error generating Groq AI response:", error);
        return "lag gye rn 💀";
    }
}

// Function to send message via Instagram Graph API
async function sendInstagramMessage(recipientId, text) {
    const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;

    const data = {
        recipient: { id: recipientId },
        message: { text: text }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (!response.ok) {
            console.error("Error sending IG message:", result);
        } else {
            console.log("Message sent successfully to IG");
        }
    } catch (error) {
        console.error("Network error sending IG message:", error);
    }
}

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);

    // Self-Ping mechanism to prevent free hosting platforms from sleeping (every 9 minutes)
    const APP_URL = RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    
    setInterval(() => {
        fetch(`${APP_URL}/ping`)
            .then(res => console.log(`[Self-Ping] Server kept alive: Status ${res.status}`))
            .catch(err => console.error('[Self-Ping error]:', err.message));
    }, 9 * 60 * 1000);
});
