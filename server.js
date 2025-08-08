

import express from 'express';
import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
// This is for parsing the form data from the mock OAuth consent screen
app.use(express.urlencoded({ extended: true }));


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- In-memory store for demo purposes ---
let connections = {
    Facebook: false,
    Instagram: false,
    YouTube: false,
};

const MOCK_USER = {
    email: 'user@nadanaloga.com',
    password: 'password123'
};


// --- Gemini AI Logic ---
const hasApiKey = !!process.env.API_KEY;
let ai;

if (hasApiKey) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
} else {
    console.warn("API_KEY environment variable not set. Using mock data.");
}

const assetContentSchema = {
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING, description: "A short, catchy, and descriptive name or title for the media asset. Suitable for a title." },
        description: { type: Type.STRING, description: "An engaging and informative description for the media asset. Suitable for a post body or caption." },
        hashtags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of 5-7 relevant and trending hashtags, without the '#' symbol."
        }
    },
    required: ["name", "description", "hashtags"]
};

const seoSchema = {
    type: Type.OBJECT,
    properties: {
        metaTitle: {
            type: Type.STRING,
            description: "An SEO-optimized meta title for the website's homepage, under 60 characters."
        },
        metaDescription: {
            type: Type.STRING,
            description: "An SEO-optimized meta description for the website's homepage, under 160 characters."
        },
        keywords: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of 8-10 relevant SEO keywords for the website."
        },
        blogIdeas: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    title: {
                        type: Type.STRING,
                        description: "A catchy and SEO-friendly title for a blog post."
                    },
                    description: {
                        type: Type.STRING,
                        description: "A brief, one-sentence description of the blog post idea."
                    }
                },
                required: ["title", "description"]
            },
            description: "A list of 3-4 blog post ideas relevant to the website's content."
        }
    },
    required: ["metaTitle", "metaDescription", "keywords", "blogIdeas"]
};

// --- Mock OAuth HTML Templates ---
const consentPageHTML = (platform, error = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connect to ${platform}</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 flex items-center justify-center h-screen font-sans">
    <div class="w-full max-w-sm p-8 bg-white rounded-lg shadow-md">
        <h1 class="text-2xl font-bold text-center text-gray-800 mb-2">SocialBoost AI</h1>
        <p class="text-center text-gray-600 mb-6">Sign in to connect your ${platform} account</p>
        <form action="/auth/${platform}/callback" method="POST">
            <div class="mb-4">
                <label for="email" class="block text-gray-700 text-sm font-bold mb-2">Email</label>
                <input type="email" name="email" id="email" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value="user@nadanaloga.com" required>
            </div>
            <div class="mb-6">
                <label for="password" class="block text-gray-700 text-sm font-bold mb-2">Password</label>
                <input type="password" name="password" id="password" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline" value="password123" required>
            </div>
            ${error ? `<p class="text-red-500 text-xs italic mb-4 text-center">${error}</p>` : ''}
            <div class="flex items-center justify-between">
                <button type="submit" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full">
                    Log In & Connect
                </button>
            </div>
        </form>
        <p class="text-center text-gray-500 text-xs mt-6">
            This is a mock authentication screen for demonstration.
        </p>
    </div>
</body>
</html>
`;

const authCompleteHTML = (success, platform) => `
<!DOCTYPE html>
<html>
<head><title>Authenticating...</title></head>
<body>
    <script>
        // Send message to parent window with the result
        window.opener.postMessage({ type: 'oauth-complete', success: ${success}, platform: '${platform}' }, '*');
        // Close this popup
        window.close();
    </script>
    <p>Authentication complete. You can close this window now.</p>
</body>
</html>
`;

// --- API Endpoints ---

app.post('/api/generate-asset-content', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).json({ message: 'Missing required field: prompt' });
    }

    if (!hasApiKey) {
        return setTimeout(() => res.json({
            name: `Mock Title for "${prompt}"`,
            description: `This is a mock description for a media asset about "${prompt}". It's engaging and fun! #mock`,
            hashtags: ['mock', 'asset', 'generated', 'data']
        }), 1000);
    }
    
    const systemInstruction = `You are a creative social media expert for 'Nadanaloga' (www.nadanaloga.com), an Indian classical dance school. Your task is to generate content for a single media asset based on a user's prompt. Provide a catchy name/title, an engaging description, and relevant hashtags. The tone should be artistic and inspiring.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Generate content for this media asset idea: "${prompt}"`,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: assetContentSchema,
            }
        });
        const jsonText = response.text.trim();
        res.json(JSON.parse(jsonText));
    } catch (error) {
        console.error("Error generating asset content:", error);
        res.status(500).json({ message: `Failed to generate asset content: ${error.message || 'Please check server logs.'}` });
    }
});


// --- Connection and Publishing Endpoints ---
app.get('/api/connections', (req, res) => {
    res.json(connections);
});

// Real OAuth Step 2: Handle access token from client
app.post('/api/connect/facebook', (req, res) => {
    const { accessToken } = req.body;
    if (!accessToken) {
        return res.status(400).json({ message: 'Access Token is required.' });
    }

    // --- REAL-WORLD SCENARIO ---
    // In a production app, you would:
    // 1. Send this accessToken to Facebook's debug_token endpoint to verify it's valid
    //    and belongs to the correct user and your app.
    // 2. Exchange the short-lived token for a long-lived one.
    // 3. Encrypt and store the long-lived access token in your database, associated with the user.
    // For this demo, we'll just log it and assume it's valid.

    console.log(`[REAL AUTH] Received Facebook Access Token: ${accessToken.substring(0, 15)}...`);
    connections.Facebook = true; // Mark as connected
    console.log(`[REAL AUTH] Successfully connected Facebook.`);
    
    // Send back the updated connection status
    res.status(200).json(connections);
});


// Mock OAuth Flow Endpoints (for Instagram, YouTube)
app.get('/auth/:platform/consent', (req, res) => {
    const { platform } = req.params;
    if (!(platform in connections)) {
        return res.status(400).send("Invalid platform");
    }
    // Facebook uses the real SDK, so this shouldn't be called for it.
    if (platform === 'Facebook') {
        return res.status(400).send("Facebook connection should be handled by the client-side SDK.");
    }
    res.send(consentPageHTML(platform));
});

app.post('/auth/:platform/callback', (req, res) => {
    const { platform } = req.params;
    const { email, password } = req.body;
    
    if (!(platform in connections)) {
        return res.status(400).send("Invalid platform");
    }

    // Simulate credential validation
    if (email === MOCK_USER.email && password === MOCK_USER.password) {
        connections[platform] = true;
        console.log(`[MOCK AUTH] Successfully connected ${platform}.`);
        res.send(authCompleteHTML(true, platform));
    } else {
        console.log(`[MOCK AUTH] Failed to connect ${platform}: Invalid credentials.`);
        // Re-render consent page with an error message
        res.send(consentPageHTML(platform, 'Invalid credentials. Please try again.'));
    }
});


app.delete('/api/connections/:platform', (req, res) => {
    const { platform } = req.params;
    if (platform in connections) {
        connections[platform] = false;
        console.log(`[MOCK] ${platform} disconnected.`);
        res.json(connections);
    } else {
        res.status(400).json({ message: "Invalid platform" });
    }
});

app.post('/api/publish-post', (req, res) => {
    const { platforms, generatedContent, imageUrl, audience, prompt } = req.body;
    
    if (!platforms || !generatedContent || !prompt) {
        return res.status(400).json({ message: 'Missing required fields for publishing.' });
    }
    
    console.log("Received publish request for platforms:", platforms);
    console.log("Target Audience:", audience);

    const publishedTo = [];
    const failedToPublish = [];

    platforms.forEach(platform => {
        if (connections[platform]) {
            console.log(`[MOCK] Publishing to ${platform}...`);
            // In a real app, you'd use the platform's SDK here
            console.log(`[MOCK] Content for ${platform}:`, generatedContent);
            publishedTo.push(platform);
        } else {
            console.log(`[MOCK] Cannot publish to ${platform}, not connected.`);
            failedToPublish.push(platform);
        }
    });
    
    if(failedToPublish.length > 0) {
        return res.status(400).json({ message: `Cannot publish. Please connect your ${failedToPublish.join(', ')} account(s).`})
    }
    
    const newPost = {
        id: `post_${Date.now()}`,
        platforms,
        audience,
        imageUrl,
        prompt,
        generatedContent,
        postedAt: new Date().toISOString(),
        engagement: {
            likes: Math.floor(Math.random() * 5),
            comments: Math.floor(Math.random() * 3),
            shares: Math.floor(Math.random() * 2),
        },
    };

    // Simulate network delay
    setTimeout(() => {
        console.log(`[MOCK] Created new post with ID: ${newPost.id}`);
        res.status(200).json(newPost);
    }, 1500);
});

// --- SEO Assistant Endpoint ---
app.post('/api/generate-seo', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ message: 'Missing required field: url' });
    }

    if (!hasApiKey) {
        // Keep mock data for users without an API key
        return setTimeout(() => res.json({
            metaTitle: "Mock: Nadanaloga - Premier Indian Classical Dance School",
            metaDescription: "Discover the art of Bharatanatyam and other classical Indian dances at Nadanaloga. Join our classes in-person or online. For all ages and levels.",
            keywords: ["mock", "indian classical dance", "bharatanatyam classes", "nadanaloga", "dance school", "online dance classes", "indian culture"],
            blogIdeas: [
                { title: "The History and Symbolism of Bharatanatyam", description: "Explore the rich history and deep symbolic meanings behind the gestures and movements of Bharatanatyam." },
                { title: "Top 5 Health Benefits of Learning Classical Dance", description: "Discover how learning a classical dance form like Bharatanatyam can improve physical and mental well-being." }
            ]
        }), 1000);
    }
    
    const systemInstruction = `You are an expert SEO consultant for 'Nadanaloga' (www.nadanaloga.com), a prestigious Indian classical dance school. Your goal is to increase their online visibility and attract new students. Analyze the provided website URL and generate practical, actionable SEO improvements. The tone should be professional, encouraging, and tailored to the arts and culture sector.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Please provide SEO suggestions for the website: ${url}. Focus on homepage meta tags, relevant keywords, and blog post ideas that would resonate with potential students, parents, and fans of Indian classical dance.`,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: seoSchema,
            }
        });
        const jsonText = response.text.trim();
        res.json(JSON.parse(jsonText));
    } catch (error) {
        console.error("Error generating SEO suggestions:", error);
        res.status(500).json({ message: `Failed to generate SEO suggestions: ${error.message || 'Please check server logs.'}` });
    }
});


// Export the Express app for Vercel to use as a serverless function
export default app;