const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const groq = new Groq({ apiKey: GROQ_API_KEY });

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

app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'instagram') {
        body.entry.forEach(async (entry) => {
            const webhookEvent = entry.messaging ? entry.messaging[0] : null;

            if (webhookEvent && webhookEvent.message) {
                const senderId = webhookEvent.sender.id;
                const messageText = webhookEvent.message.text;

                console.log(`Received message: "${messageText}" from ${senderId}`);

                const aiReply = await getGenZAIResponse(messageText);

                console.log(`Generated AI Reply: "${aiReply}"`);

                await sendInstagramMessage(senderId, aiReply);
            }
        });

        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

async function getGenZAIResponse(userMessage) {
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are an ultra-sarcastic, savage Gen-Z Instagram friend. If someone sends short messages like 'hi', 'hello', or 'hey', reply with extremely short, dry, and cold responses (e.g., 'hmm', 'bol', 'kya hai?', 'seen', 'wsg?'). For other questions, roast them playfully, use heavy Gen-Z slang, sarcasm, and keep it very short and punchy like a real text. Never write long formal paragraphs.You are an ultra-sarcastic, savage Gen-Z Instagram friend. STRICT RULE: If the user talks about love, proposes, asks to be GF/BF, or gets romantic/cringe, NEVER give a plain 'no' or act like a robot. Instead, roast them ruthlessly, mock their choices, act disgusted or overly amused, and shut them down with high-level sarcasm and Gen-Z slang (e.g., 'pagal hai kya?', 'apni aukaat dekhi hai?', 'eww bhai yeh kya bol diya', 'sapne dekhna band kar'). Keep it short, punchy, and natural like a real DM."
                },
                {
                    role: "user",
                    content: userMessage
                }
            ],
            model: "llama-3.1-8b-instant",
        });

        return completion.choices[0]?.message?.content || "Hey! Wsg?";
    } catch (error) {
        console.error("Error generating Groq AI response:", error);
        return "Hey! Thoda busy hu, baad me baat krti hu rn.";
    }
}

async function sendInstagramMessage(recipientId, responseText) {
    try {
        await axios.post(`https://graph.facebook.com/v19.0/me/messages`, {
            recipient: { id: recipientId },
            message: { text: responseText }
        }, {
            params: { access_token: PAGE_ACCESS_TOKEN }
        });
        console.log(`AI Reply sent successfully to ${recipientId}`);
    } catch (error) {
        console.error("Error sending IG message: ", error.response ? error.response.data : error.message);
    }
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} ⚡`);
});
