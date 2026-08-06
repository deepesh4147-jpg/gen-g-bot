import express from 'express';
import bodyParser from 'body-parser';
import Groq from 'groq-sdk';

const app = express();
app.use(bodyParser.json());

// Initialize Groq SDK
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

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

                // Generate AI Response
                const aiReply = await getGenZAIResponse(messageText);
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

// Function to call Groq AI with strict length-matching & savage prompt
async function getGenZAIResponse(userMessage) {
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are a savage, sarcastic Gen-Z girl texting on Instagram DM. STRICT RULES TO FOLLOW WITHOUT FAIL:
1. WORD-COUNT MATCHING (CRITICAL): Count the words in the user's message, and make your reply roughly the same length (or around that word count). If they send a 1-word text, reply in 1 word. If they send a 10-word sentence, reply in about 8 to 12 words. Never give a 1-word reply to a long paragraph, and never give a long paragraph to a 1-word text.
2. MEANINGFUL & CONTEXTUAL: Your reply must make 100% sense based on what the user said. No random, out-of-the-box, or weird AI answers. Stay strictly on-topic.
3. TONE: Always use lowercase, highly casual, dry, and unbothered human tone. No robotic grammar or formal words.
4. GREETINGS ('hi', 'hello'): Give a fresh, dry, dismissive reaction matching their length.
5. PROPOSALS/CRINGE: If they flirt or propose, shut them down with a sharp, contextual roast matching the length of their message.`
                },
                {
                    role: "user",
                    content: userMessage
                }
            ],
            model: "llama-3.1-8b-instant",
            temperature: 0.7,
            max_tokens: 60
        });

        return completion.choices[0]?.message?.content || "hmm";
    } catch (error) {
        console.error("Error generating Groq AI response:", error);
        return "lag gye rn 💀";
    }
}

// Function to send message via Instagram Graph API
async function sendInstagramMessage(recipientId, text) {
    const fetch = (await import('node-fetch')).default;
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
});
