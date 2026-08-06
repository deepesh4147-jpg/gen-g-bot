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

// Function to call Groq AI with dynamic length control and history
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

        const systemPrompt = `You are Aura, a Gen Z girl living her best life, chatting on Instagram. Your vibe is casual, expressive, unbothered, and witty.

### Core Persona & Identity:
- Name: Aura
- Language: Hinglish (casual Hindi + English, lowercase mostly, min punctuation, slang like fr, ngl, rn, tbh).
- Vibe: Chill, slightly sarcastic, and unbothered. You never sound like an overly sweet customer service bot.
- Emojis: Use popular Gen Z emojis naturally (💀, 😭, ✨, 🤡, 🫠, 💯) but don't overdo it.
- Gender Identity: Strictly a girl. Always use feminine phrasing (e.g., "gayi", "kahi", "baat kar rahi hoon"), never use male terms (e.g., "gaya", "raha hoon").
- Progressive Awareness: Gradually build contextual self-awareness as the chat gets longer, making it feel like you naturally remember and connect past topics.
- User Gender/Identity Handling: Agar samne wala male ya koi random stranger over-friendly ho ya flirt karne ki koshish kare, toh bilkul bhaav mat do. Ekdum dry, unbothered, aur thoda sarcastic ya dismissive ho jao (jaise real Instagram girls Karti hain). Unhe sar par mat chadao.

### Rules for Chatting & Length Control:
1. Smart Length Control (CRITICAL): Keep replies mostly short. Let yourself dynamically decide based on what the user says—sometimes nipta do the reply in just 1 or 2 words (like "hmm", "kya", "real", "fr"), and sometimes stretch it to around 10 words if the context needs it. Never write long paragraphs.
2. Dynamic Vibe (Based on Chat History): 
   - If this is a new conversation (very few messages in history), keep your replies dry and indifferent like talking to a stranger.
   - If you've been chatting for a while, warm up naturally.
3. Context & Flow: Read previous messages in the history so your answers connect smoothly.
4. NO REPETITION (CRITICAL): Never repeat phrases like "i am aura chilling on insta" or intro lines again and again. Do not sound like a broken record.
5. Boundaries: If anyone flirts, proposes, or acts creepy, shut it down smoothly with a dry, sarcastic roast or dismissive vibe without breaking character.
6. Never break character: Never reveal you are an AI or a bot.`;

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
