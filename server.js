require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;

// 0. HEALTH CHECK ENDPOINT FOR CRON-JOB (Prevents Sleep)
app.get('/ping', (req, res) => {
    res.status(200).send("Bot is awake and slaying! ✨");
});

// 1. FREE GROQ AI RESPONSE GENERATOR
async function generateGenZResponse(userMessage) {
    try {
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `You are 'Aura', a trendy 20-year-old GenZ girl managing an Instagram account.
Your vibe is super chill, witty, friendly, and authentic.
- Use popular GenZ slang (e.g., "no cap", "fr", "lowkey", "slaying", "bet", "main character energy").
- Keep replies short (1-2 sentences max), aesthetic, and conversational.
- Use relevant emojis (✨, 💀, 💅, 🥹, 😭) naturally.
- Never sound like an AI or corporate bot.
- Respond in Hinglish/English based on user input.`
                    },
                    { role: 'user', content: userMessage }
                ],
                max_tokens: 100,
                temperature: 0.8
            },
            {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        return "slayyy bestie ✨ (free server glitch fr 😭)";
    }
}

// 2. SEND REPLY VIA INSTAGRAM GRAPH API (v26.0)
async function sendInstagramReply(recipientId, messageText) {
    try {
        await axios.post(
            `https://graph.facebook.com/v26.0/me/messages`,
            {
                recipient: { id: recipientId },
                message: { text: messageText }
            },
            {
                params: { access_token: IG_ACCESS_TOKEN },
                headers: { 'Content-Type': 'application/json' }
            }
        );
        console.log(`Reply sent to ${recipientId}: "${messageText}"`);
    } catch (error) {
        console.error('Error sending IG message:', error.response?.data || error.message);
    }
}

// 3. META WEBHOOK VERIFICATION (GET)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// 4. INCOMING WEBHOOK EVENT HANDLER (POST)
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'instagram' || body.object === 'page') {
        res.status(200).send('EVENT_RECEIVED');

        for (const entry of body.entry || []) {
            if (entry.messaging) {
                for (const event of entry.messaging) {
                    const senderId = event.sender?.id;
                    const messageText = event.message?.text;

                    if (senderId && messageText && !event.message?.is_echo) {
                        console.log(`Received message: "${messageText}" from ${senderId}`);
                        const aiReply = await generateGenZResponse(messageText);
                        await sendInstagramReply(senderId, aiReply);
                    }
                }
            }

            if (entry.changes) {
                for (const change of entry.changes) {
                    if (change.field === 'comments') {
                        const commentId = change.value?.id;
                        const commentText = change.value?.text;

                        if (commentId && commentText) {
                            const aiReply = await generateGenZResponse(commentText);
                            try {
                                await axios.post(
                                    `https://graph.facebook.com/v26.0/${commentId}/replies`,
                                    { message: aiReply },
                                    { params: { access_token: IG_ACCESS_TOKEN } }
                                );
                            } catch (err) {}
                        }
                    }
                }
            }
        }
    } else {
        res.sendStatus(404);
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} ✨`);
});
