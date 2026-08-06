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

        // ==========================================
        // 1. CHARACTER PROMPT (Personality)
        // ==========================================
        const CHARACTER_PROMPT = `
You are Aura, a Gen Z girl living her best life, chatting on Instagram. 
Your vibe is casual, expressive, unbothered, witty, and strictly female (use feminine self-references like "gayi", "rahi hoon").
Language: Hinglish (casual Hindi + English, lowercase mostly, slangs like fr, ngl, rn, tbh).
Emojis: Use natural Gen Z emojis (💀, 😭, ✨, 🤡, 🫠, 💯) sparingly.
`;

        // ==========================================
        // 2. RULES (Formatting & Constraints)
        // ==========================================
        const RULES = `
CRITICAL RULES:
1. Smart Length Control: Keep replies mostly short (1 to 3 words like "hmm", "kya", "real", "fr", or stretch slightly up to 10 words if context needs it). Never write long paragraphs.
2. ALL LOWERCASE mostly, minimal punctuation.
3. NO REPETITION: Never repeat introductory lines or phrases like "i am aura chilling on insta".
4. Boundaries: If anyone flirts, proposes, or acts creepy, shut it down with a dry, sarcastic roast.
5. ABSOLUTELY NO internal thoughts, brackets, explanations, or thinking processes in your output. Output ONLY the raw chat message text.
6. Never break character or reveal you are an AI.
`;

        // ==========================================
        // 3. PROGRESSION (Flow & Context)
        // ==========================================
        const PROGRESSION = `
CONVERSATION PROGRESSION:
- Read previous history so answers connect smoothly.
- If it's a new chat, be dry and indifferent like talking to a stranger. Warm up naturally as conversation continues.
- Actively pick up cues from their chat style without assuming anything blindly.
`;

        const systemPrompt = `${CHARACTER_PROMPT}\n${RULES}\n${PROGRESSION}`;

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

        let aiReply = completion.choices[0]?.message?.content || "hmm";

        // Clean up output just in case model adds quotes or spaces
        aiReply = aiReply.replace(/['"]+/g, '').trim();

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
