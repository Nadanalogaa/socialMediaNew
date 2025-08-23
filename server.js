



import express from 'express';
import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const addCloudinaryVideoTransformation = (url) => {
    if (!url || !url.includes('res.cloudinary.com') || !url.includes('/video/upload')) {
        return url;
    }
    // Do not transform if a transformation is already present.
    // Simple check: look for common transformation parameters like c_, w_, h_, q_.
    if (url.match(/\/upload\/.*(c_|w_|h_|q_|vc_).*\//)) {
        console.log('[CLOUDINARY] URL already has transformation, skipping.');
        return url;
    }

    // A robust transformation for social media:
    // w_1920,h_1080: limit resolution to 1080p.
    // c_limit: fit within dimensions without cropping.
    // vc_auto: automatically choose the best video codec.
    // q_auto:good: automatically select a good quality level for compression.
    const transformation = "w_1920,h_1080,c_limit,vc_auto,q_auto:good";
    
    // Replace "/upload/" with "/upload/<transformation>/"
    const transformedUrl = url.replace('/upload/', `/upload/${transformation}/`);
    console.log(`[CLOUDINARY] Transformed video URL to ${transformedUrl.substring(0,120)}...`);
    return transformedUrl;
};

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' })); // Increase limit for base64 images/videos
app.use(express.urlencoded({ extended: true, limit: '100mb' }));


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- In-memory store for MOCK DATA purposes ONLY ---
const TARGET_PAGE_NAME = 'Nadanaloga-chennai'; // The specific page we want to connect to
const TARGET_IG_USER_ID = '17841405756443727'; // The specific IG business account we want to connect to
const WEBHOOK_VERIFY_TOKEN = 'IGAAK89cKmt51BZAE9WdFIFRGI0Wnd2YnZAYT0QwTzVwbWx1VUlRkJZAdXZA2ZAGJDcjNyc2dxNzE1VUJSVFh3QThHaHhYMWdiSFdibeE5qa1hoWDh4M';

let mockState = {
    YouTube: { connected: false },
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

const postFromIdeaSchema = {
    type: Type.OBJECT,
    properties: {
        postText: { type: Type.STRING, description: "A short, engaging social media caption or post body based on the blog idea. It should be written to generate interest and encourage clicks." },
        imagePrompt: { type: Type.STRING, description: "A descriptive and creative prompt for an AI image generator to create a visually appealing and relevant image for the social media post. E.g., 'A vibrant illustration of a dancer surrounded by musical notes and cultural symbols'." },
        hashtags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of 5-7 relevant and trending hashtags for the social media post, without the '#' symbol."
        }
    },
    required: ["postText", "imagePrompt", "hashtags"]
};

const commentReplySchema = {
    type: Type.ARRAY,
    description: "A list of 1 to 3 suggested replies to the user's comment.",
    items: {
        type: Type.OBJECT,
        properties: {
            sentiment: {
                type: Type.STRING,
                description: "The analyzed sentiment of the user's comment. Can be 'positive', 'neutral', 'negative', or 'question'."
            },
            suggestedReply: {
                type: Type.STRING,
                description: "A concise, engaging, and context-aware reply. It should be friendly, appreciative, and maintain the brand's voice."
            }
        },
        required: ["sentiment", "suggestedReply"]
    }
};

const smartBulkReplySchema = {
    type: Type.ARRAY,
    description: "An array of suggested replies, one for each of the user comments provided in the prompt. The order of replies must match the order of the input comments.",
    items: {
        type: Type.OBJECT,
        properties: {
            suggestedReply: {
                type: Type.STRING,
                description: "A unique, concise, and context-aware reply for a single user comment. It should be friendly and maintain the brand's voice."
            }
        },
        required: ["suggestedReply"]
    }
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

// --- Webhook Verification and Event Handling ---
// This endpoint is for Facebook/Instagram to verify the webhook URL.
app.get('/callback', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Checks if a token and mode is in the query string of the request
    if (mode && token) {
        // Checks the mode and token sent are correct
        if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
            // Responds with the challenge token from the request
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            // Responds with '403 Forbidden' if verify tokens do not match
            console.error('Webhook verification failed: Tokens do not match.');
            console.log(`Received Token: ${token}`);
            console.log(`Expected Token: ${WEBHOOK_VERIFY_TOKEN}`);
            res.sendStatus(403);
        }
    } else {
        console.error('Webhook verification failed: Missing mode or token.');
        res.sendStatus(400);
    }
});

// This endpoint is for receiving webhook events from Facebook/Instagram.
app.post('/callback', (req, res) => {
    const body = req.body;

    console.log('Webhook event received:', JSON.stringify(body, null, 2));

    // Checks this is an event from a page subscription
    if (body.object === 'page') {
        // Here you would process the webhook event.
        // For example, you could check body.entry[0].changes[0].field for 'feed'
        // and then process the comment or like.

        // For now, we'll just log it and send a 200 OK
        res.status(200).send('EVENT_RECEIVED');
    } else {
        // Returns a '404 Not Found' if event is not from a page subscription
        res.sendStatus(404);
    }
});

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

app.post('/api/generate-seo', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ message: 'Missing required field: url' });
    }

    if (!hasApiKey) {
        return setTimeout(() => res.json({
            metaTitle: `Mock SEO Title for ${url}`,
            metaDescription: `This is a mock SEO meta description for ${url}. It's optimized for search engines.`,
            keywords: ['mock', 'seo', 'keywords', 'for', url.split('.')[0]],
            blogIdeas: [
                { title: `Mock Blog Idea 1 about ${url}`, description: 'A great blog post to attract visitors.' },
                { title: `Mock Blog Idea 2 about ${url}`, description: 'Another engaging topic for your audience.' }
            ]
        }), 1000);
    }

    const systemInstruction = `You are an SEO expert for a website. Analyze the provided URL and generate SEO suggestions. The tone should be professional and data-driven. The target business is 'Nadanaloga' (www.nadanaloga.com), an Indian classical dance school. Tailor suggestions accordingly.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Generate SEO suggestions for the website: "${url}"`,
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

app.post('/api/generate-post-from-idea', async (req, res) => {
    const { title, description } = req.body;
    if (!title || !description) {
        return res.status(400).json({ message: 'Missing required fields: title and description' });
    }
    if (!hasApiKey) {
        return setTimeout(() => res.json({
            postText: `This is a mock social media post based on the blog idea: "${title}". It's designed to be engaging!`,
            imagePrompt: `A vibrant mock illustration related to "${title}"`,
            hashtags: ['mock', 'socialmedia', 'generated', 'post']
        }), 1000);
    }
    
    const systemInstruction = `You are a social media manager for 'Nadanaloga', an Indian classical dance school. Your task is to take a blog post idea (title and description) and turn it into a short, engaging social media post. Provide the post text, a creative prompt for an AI image generator, and relevant hashtags.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Generate a social media post from this blog idea:\nTitle: ${title}\nDescription: ${description}`,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: postFromIdeaSchema,
            }
        });
        const jsonText = response.text.trim();
        res.json(JSON.parse(jsonText));
    } catch (error) {
        console.error("Error generating post from idea:", error);
        res.status(500).json({ message: `Failed to generate post from idea: ${error.message || 'Please check server logs.'}` });
    }
});

app.post('/api/generate-comment-reply', async (req, res) => {
    const { commentText } = req.body;
    if (!commentText) {
        return res.status(400).json({ message: 'Missing required field: commentText' });
    }

    if (!hasApiKey) {
        return setTimeout(() => res.json([
            { sentiment: 'positive', suggestedReply: 'Thank you so much! 😊' },
            { sentiment: 'neutral', suggestedReply: 'Thanks for sharing your thoughts.' }
        ]), 1000);
    }
    
    const systemInstruction = `You are a helpful and friendly social media assistant for 'Nadanaloga', an Indian classical dance school. Analyze the user's comment for sentiment and generate 1-3 concise, engaging, and context-aware replies. The tone should be positive and appreciative.`;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Generate suggested replies for this comment: "${commentText}"`,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: commentReplySchema,
            }
        });
        const jsonText = response.text.trim();
        res.json(JSON.parse(jsonText));
    } catch (error) {
        console.error("Error generating comment reply:", error);
        res.status(500).json({ message: `Failed to generate comment reply: ${error.message || 'Please check server logs.'}` });
    }
});

app.post('/api/generate-smart-bulk-replies', async (req, res) => {
    const { comments } = req.body; // Expects [{ id: string, message: string }]
    if (!comments || !Array.isArray(comments) || comments.length === 0) {
        return res.status(400).json({ message: 'Missing required field: comments array with id and message.' });
    }

    if (!hasApiKey) {
        // Mock response for development
        const mockReplies = comments.map(c => ({
            commentId: c.id,
            suggestedReply: `Thank you for your comment: "${c.message.substring(0, 20)}..."! We appreciate it.`
        }));
        return setTimeout(() => res.json(mockReplies), 1000);
    }
    
    const systemInstruction = `You are a helpful and friendly social media assistant for 'Nadanaloga', an Indian classical dance school. Your task is to generate a unique, short, and positive reply for EACH of the user comments provided. The reply should be context-aware and appreciative. Return a JSON array of objects, where each object contains a single key 'suggestedReply'. The order of your replies in the array MUST exactly match the order of the input comments.`;
    
    try {
        const formattedComments = comments.map((c, index) => `${index + 1}. "${c.message}"`).join('\n');
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Generate a unique reply for each of the following comments. Maintain the original order in your response:\n${formattedComments}`,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: smartBulkReplySchema,
            }
        });
        
        const jsonText = response.text.trim();
        const generatedReplies = JSON.parse(jsonText);

        if (generatedReplies.length !== comments.length) {
            throw new Error(`AI returned ${generatedReplies.length} replies, but ${comments.length} were expected. Mismatch occurred.`);
        }

        // Map the generated replies back to their original comment IDs
        const finalResponse = comments.map((originalComment, index) => ({
            commentId: originalComment.id,
            suggestedReply: generatedReplies[index].suggestedReply,
        }));

        res.json(finalResponse);

    } catch (error) {
        console.error("Error generating smart bulk replies:", error);
        res.status(500).json({ message: `Failed to generate smart bulk replies: ${error.message || 'Please check server logs.'}` });
    }
});


// --- Helper Functions for Post Fetching ---
const transformFbPostToStandard = (post) => {
    const isVideo = post.attachments?.data?.[0]?.type === 'video_inline';
    return {
        id: post.id,
        platforms: ['Facebook'],
        platformPostIds: { Facebook: post.id },
        audience: 'Global', // Cannot determine audience from API
        imageUrl: post.full_picture, // This works as a thumbnail for videos too
        videoUrl: isVideo ? post.attachments.data[0].url : undefined,
        mediaType: isVideo ? 'VIDEO' : 'IMAGE',
        prompt: post.message || 'Post from Facebook',
        permalinkUrl: post.permalink_url,
        generatedContent: {
            facebook: post.message || '',
            instagram: '',
            youtubeTitle: '',
            youtubeDescription: '',
            hashtags: (post.message || '').match(/#\w+/g)?.map(h => h.substring(1)) || []
        },
        postedAt: post.created_time,
        engagement: {
            total: {
                likes: post.likes?.summary?.total_count || 0,
                comments: post.comments?.summary?.total_count || 0,
                shares: post.shares?.count || 0,
            },
            facebook: {
                likes: post.likes?.summary?.total_count || 0,
                comments: post.comments?.summary?.total_count || 0,
                shares: post.shares?.count || 0,
            }
        },
        status: 'active',
    };
};

const transformIgPostToStandard = (post) => {
    return {
        id: post.id,
        platforms: ['Instagram'],
        platformPostIds: { Instagram: post.id },
        audience: 'Global',
        imageUrl: post.media_type === 'VIDEO' ? post.thumbnail_url : post.media_url,
        videoUrl: post.media_type === 'VIDEO' ? post.media_url : undefined,
        mediaType: post.media_type === 'VIDEO' ? 'VIDEO' : 'IMAGE',
        prompt: post.caption || `Post from ${post.username}`,
        username: post.username,
        permalinkUrl: post.permalink, // Instagram calls it permalink
        generatedContent: {
            facebook: '',
            instagram: post.caption || '',
            youtubeTitle: '',
            youtubeDescription: '',
            hashtags: (post.caption || '').match(/#\w+/g)?.map(h => h.substring(1)) || []
        },
        postedAt: post.timestamp,
        engagement: {
            total: {
                likes: post.like_count || 0,
                comments: post.comments_count || 0,
                shares: 0,
            },
            instagram: {
                likes: post.like_count || 0,
                comments: post.comments_count || 0,
                shares: 0,
            }
        },
        status: 'active',
    };
};

app.get('/api/posts', async (req, res) => {
    const { limit = '10', fbNext, igNext, pageAccessToken, pageId, igUserId } = req.query;

    if (!pageAccessToken || !pageId) {
        return res.status(400).json({ message: 'Missing required connection details: pageAccessToken and pageId.' });
    }

    const platformPromises = [];

    // Facebook Promise
    const fbFields = 'id,message,created_time,full_picture,attachments,likes.summary(true),comments.summary(true),shares,permalink_url';
    const fbUrl = fbNext ?
        decodeURIComponent(fbNext) :
        `https://graph.facebook.com/v23.0/${pageId}/posts?fields=${fbFields}&limit=${limit}&access_token=${pageAccessToken}`;
    platformPromises.push(fetch(fbUrl).then(r => r.json()).catch(e => ({ error: { message: `Facebook fetch failed: ${e.message}` } })));

    // Instagram Promise (only if igUserId is provided)
    if (igUserId) {
        const igFields = 'id,caption,timestamp,media_url,media_type,thumbnail_url,like_count,comments_count,username,permalink';
        const igUrl = igNext ?
            decodeURIComponent(igNext) :
            `https://graph.facebook.com/v23.0/${igUserId}/media?fields=${igFields}&limit=${limit}&access_token=${pageAccessToken}`;
        platformPromises.push(fetch(igUrl).then(r => r.json()).catch(e => ({ error: { message: `Instagram fetch failed: ${e.message}` } })));
    } else {
        platformPromises.push(Promise.resolve({ data: [] })); // Resolve with empty if no IG account
    }

    try {
        const [fbResult, igResult] = await Promise.all(platformPromises);
        
        if (fbResult.error) console.error("Facebook API Error:", fbResult.error.message);
        if (igResult.error) console.error("Instagram API Error:", igResult.error.message);

        const fbPosts = (fbResult.data || []).map(transformFbPostToStandard);
        const igPosts = (igResult.data || []).map(transformIgPostToStandard);
        
        // --- Merge Posts Logic ---
        const finalPosts = [...igPosts]; // Start with all IG posts
        const matchedFbPostIds = new Set();

        for (const igPost of finalPosts) {
            // Find a matching FB post that hasn't been matched yet
            const matchingFbPost = fbPosts.find(fbPost => {
                if (matchedFbPostIds.has(fbPost.id)) return false;

                const timeDiff = Math.abs(new Date(fbPost.postedAt).getTime() - new Date(igPost.postedAt).getTime());
                const isCloseInTime = timeDiff < 60000; // 1 minute window
                const isSameMediaType = fbPost.mediaType === igPost.mediaType;

                return isCloseInTime && isSameMediaType;
            });

            if (matchingFbPost) {
                // Merge FB data into the IG post
                igPost.platforms.push('Facebook');
                if (!igPost.platformPostIds) igPost.platformPostIds = { Instagram: igPost.id };
                igPost.platformPostIds.Facebook = matchingFbPost.id;

                // Merge engagement
                igPost.engagement.total.likes += matchingFbPost.engagement.total.likes;
                igPost.engagement.total.comments += matchingFbPost.engagement.total.comments;
                igPost.engagement.total.shares += matchingFbPost.engagement.total.shares;
                igPost.engagement.facebook = matchingFbPost.engagement.facebook;
                
                // Add the fb post ID to the matched set
                matchedFbPostIds.add(matchingFbPost.id);
            }
        }

        // Add any Facebook posts that didn't have a match
        const unmatchedFbPosts = fbPosts.filter(fbPost => !matchedFbPostIds.has(fbPost.id));
        finalPosts.push(...unmatchedFbPosts);

        // Sort the final combined list by date
        finalPosts.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
        
        const nextCursors = {
            facebook: fbResult.paging?.next ? encodeURIComponent(fbResult.paging.next) : null,
            instagram: igResult.paging?.next ? encodeURIComponent(igResult.paging.next) : null,
        };

        res.json({
            posts: finalPosts,
            nextCursors,
        });

    } catch (error) {
        console.error("Failed to fetch platform posts:", error);
        res.status(500).json({ message: `Failed to fetch posts: ${error.message}` });
    }
});

app.post('/api/kpis', async (req, res) => {
    const { facebook, instagram } = req.body;
    const pageAccessToken = facebook?.pageAccessToken;

    if (!pageAccessToken) {
        return res.status(401).json({ message: 'Missing page access token.' });
    }

    console.log("[KPIS] pageId:", facebook?.pageId, "igUserId:", instagram?.igUserId?.toString());
    console.log('[KPI CALL] token looks like:', (pageAccessToken||'').slice(0,12)+'...');

    try {
        const until = new Date();
        const since = new Date();
        since.setDate(until.getDate() - 30); // 30 days ago

        const untilTimestamp = Math.floor(until.getTime() / 1000);
        const sinceTimestamp = Math.floor(since.getTime() / 1000);

        const kpis = {
            facebook: { followerHistory: [], currentFollowers: null },
            instagram: { followerHistory: [], currentFollowers: null }
        };

        // --- FETCH FACEBOOK DATA ---
        if (facebook?.pageId) {
            const histUrl = `https://graph.facebook.com/v23.0/${facebook.pageId}/insights?metric=page_fans&period=day&since=${sinceTimestamp}&until=${untilTimestamp}&access_token=${pageAccessToken}`;
            const histRes = await fetch(histUrl);
            const hist = await histRes.json();

            if (hist.error) {
                console.warn("Facebook insights error:", hist.error.message);
            }
            if (Array.isArray(hist.data) && hist.data[0]?.values) {
                kpis.facebook.followerHistory = hist.data[0].values.map(v => ({ value: v.value, end_time: v.end_time }));
            }
            
            // Always fetch current fan_count
            const curUrl = `https://graph.facebook.com/v23.0/${facebook.pageId}?fields=fan_count&access_token=${pageAccessToken}`;
            const curRes = await fetch(curUrl);
            const cur = await curRes.json();
            if (cur.error) {
                console.warn(`Facebook fan_count error: ${cur.error.message}`);
            }
            if (typeof cur.fan_count === 'number') {
                kpis.facebook.currentFollowers = cur.fan_count;
                if (kpis.facebook.followerHistory.length === 0) {
                    kpis.facebook.followerHistory.push({ value: cur.fan_count, end_time: new Date().toISOString() });
                }
            }
        }
        
        // --- FETCH INSTAGRAM DATA ---
        if (instagram?.igUserId) {
            const igUserId = String(instagram.igUserId);
            const token = pageAccessToken;
            console.log('[KPIS IG] Using igUserId:', igUserId);
            console.log('[KPIS IG] Token starts with:', (token||'').slice(0,12)+'...');

            // Try to fetch history first (daily net change)
            const histUrl = `https://graph.facebook.com/v23.0/${igUserId}/insights?metric=follower_count&period=day&since=${sinceTimestamp}&until=${untilTimestamp}&access_token=${token}`;
            try {
                const histRes = await fetch(histUrl);
                const hist = await histRes.json();
                if (hist.error) {
                    console.warn("Instagram insights error:", hist.error.message, "This metric provides daily net change.");
                } else if (Array.isArray(hist.data) && hist.data[0]?.values) {
                    kpis.instagram.followerHistory = hist.data[0].values.map(v => ({ value: v.value, end_time: v.end_time }));
                }
            } catch (e) {
                console.warn("Instagram insights fetch failed:", e.message);
            }
            
            // Always fetch absolute followers_count
            const igCurrentUrl =
              `https://graph.facebook.com/v23.0/${igUserId}` +
              `?fields=followers_count&access_token=${token}`;
            try {
              const igCurRes = await fetch(igCurrentUrl);
              const igCur = await igCurRes.json();
              if (typeof igCur.followers_count === 'number') {
                kpis.instagram.currentFollowers = igCur.followers_count;
                if (kpis.instagram.followerHistory.length === 0) {
                  kpis.instagram.followerHistory.push({
                    value: igCur.followers_count,
                    end_time: new Date().toISOString()
                  });
                }
              } else if (igCur.error) {
                console.warn('IG followers_count error:', igCur.error.message);
              }
            } catch (e) {
              console.warn('IG followers_count fetch failed', e);
            }
        }

        res.json(kpis);

    } catch (error) {
        console.error("Failed to fetch KPIs:", error);
        res.status(500).json({ message: `Failed to fetch KPIs: ${error.message}` });
    }
});

app.get('/api/debug/tokens', async (req, res) => {
    const { userAccessToken, pageAccessToken } = req.query;
    try {
        const appId = process.env.FACEBOOK_APP_ID;
        const appSecret = process.env.FACEBOOK_APP_SECRET;

        if (!appId || !appSecret) {
            return res.status(500).json({ message: 'Facebook App ID or Secret is not configured on the server. Please set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in your .env file.' });
        }

        const appTokenRes = await fetch(`https://graph.facebook.com/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&grant_type=client_credentials`);
        const appToken = await appTokenRes.json();

        if (appToken.error) {
            throw new Error(`Failed to get app token: ${appToken.error.message}`);
        }

        const debugUser = userAccessToken
            ? await (await fetch(`https://graph.facebook.com/debug_token?input_token=${userAccessToken}&access_token=${appToken.access_token}`)).json()
            : null;

        const debugPage = pageAccessToken
            ? await (await fetch(`https://graph.facebook.com/debug_token?input_token=${pageAccessToken}&access_token=${appToken.access_token}`)).json()
            : null;

        res.json({ debugUser, debugPage });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});


// --- Connection and Publishing Endpoints ---
app.get('/api/connections', (req, res) => {
    // Return a simplified view for the client for initial state
    res.json({
        Facebook: false,
        Instagram: false,
        YouTube: mockState.YouTube.connected,
    });
});

// Real OAuth Step 2: Handle access token from client
app.post('/api/connect/facebook', async (req, res) => {
    const { accessToken } = req.body; // This is the User Access Token from the client
    if (!accessToken) {
        return res.status(400).json({ message: 'User Access Token is required.' });
    }

    try {
        // 1. Use the User Access Token to get a list of pages the user manages
        const pagesResponse = await fetch(`https://graph.facebook.com/v23.0/me/accounts?access_token=${accessToken}`);
        const pagesData = await pagesResponse.json();

        if (pagesData.error) {
            throw new Error(`Graph API error (me/accounts): ${pagesData.error.message}`);
        }

        // 2. Find the specific page we want to connect to
        const targetPage = pagesData.data?.find(page => page.name === TARGET_PAGE_NAME);

        if (!targetPage) {
            return res.status(404).json({ message: `Could not find a page named '${TARGET_PAGE_NAME}'. Please ensure you have admin rights to this page and have granted the 'pages_show_list' permission.` });
        }

        // 3. We found the page. Prepare its ID and its own Page Access Token.
        const facebookDetails = {
            pageId: targetPage.id,
            pageAccessToken: targetPage.access_token,
            pageName: targetPage.name
        };
        console.log(`[REAL AUTH] Successfully got details for Facebook Page: ${targetPage.name} (ID: ${targetPage.id})`);

        // 4. Check for a linked Instagram account
        let instagramDetails = { igUserId: null, username: null };
        const igResponse = await fetch(`https://graph.facebook.com/v23.0/${targetPage.id}?fields=instagram_business_account{id,username}&access_token=${targetPage.access_token}`);
        const igData = await igResponse.json();

        if (igData.error) {
            console.warn(`[REAL AUTH] Could not fetch linked Instagram account: ${igData.error.message}`);
        } else if (igData.instagram_business_account) {
            const igAccount = igData.instagram_business_account;
            instagramDetails = {
                igUserId: igAccount.id,
                username: igAccount.username,
            };
            console.log(`[REAL AUTH] Successfully got details for Instagram account: ${igAccount.username} (ID: ${igAccount.id})`);
        } else {
            console.log('[REAL AUTH] No Instagram Business Account linked to this Facebook page.');
        }

        // 5. Send back the connection status and the details (tokens) to the client
        res.status(200).json({
            connections: {
                Facebook: true,
                Instagram: !!instagramDetails.igUserId,
                YouTube: mockState.YouTube.connected,
            },
            details: {
                facebook: facebookDetails,
                instagram: instagramDetails
            }
        });

    } catch (error) {
        console.error('[REAL AUTH] Failed to connect Facebook page:', error);
        res.status(500).json({ message: `Failed to connect Facebook page: ${error.message}` });
    }
});


// Mock OAuth Flow Endpoints (for YouTube)
app.get('/auth/:platform/consent', (req, res) => {
    const { platform } = req.params;
    if (platform !== 'YouTube') {
        return res.status(400).send("This authentication flow is only for mock connections.");
    }
    res.send(consentPageHTML(platform));
});

app.post('/auth/:platform/callback', (req, res) => {
    const { platform } = req.params;
    const { email, password } = req.body;

    if (platform !== 'YouTube') {
        return res.status(400).send("This authentication flow is only for mock connections.");
    }

    // Simulate credential validation
    if (email === MOCK_USER.email && password === MOCK_USER.password) {
        mockState.YouTube.connected = true;
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

    if (platform === 'Facebook' || platform === 'Instagram') {
        // For real auth, the client handles logout. The server is stateless.
        console.log(`[REAL AUTH] Disconnect request for ${platform}. Client will clear tokens.`);
    } else if (platform === 'YouTube') { // Mock logic for YouTube
        mockState.YouTube.connected = false;
        console.log(`[MOCK] ${platform} disconnected.`);
    } else {
        return res.status(400).json({ message: "Invalid platform" });
    }

    // Return the new 'disconnected' state for all platforms
    res.json({
        Facebook: false,
        Instagram: false,
        YouTube: mockState.YouTube.connected,
    });
});

app.post('/api/publish-post', async (req, res) => {
    const { platforms, generatedContent, imageUrl, videoUrl, audience, prompt, facebook, instagram, mediaType } = req.body;

    if (!platforms || !generatedContent || !prompt) {
        return res.status(400).json({ message: 'Missing required fields for publishing.' });
    }

    console.log(`Received publish request for platforms: ${platforms}, mediaType: ${mediaType}`);
    const publishedTo = [];
    const failedToPublish = [];

    // Use explicit mediaType from client instead of inferring from URL
    const isImage = mediaType === 'IMAGE';
    const isVideo = mediaType === 'VIDEO';

    let transformedVideoUrl = videoUrl;
    if (isVideo && videoUrl) {
        transformedVideoUrl = addCloudinaryVideoTransformation(videoUrl);
    }

    let facebookPostId = null;
    let instagramPostId = null;
    let facebookPhotoUrl = null;

    // Ensure Facebook is processed first if present, as Instagram depends on it for IMAGE posts
    const orderedPlatforms = [...platforms].sort((a) => a === 'Facebook' ? -1 : 1);

    for (const platform of orderedPlatforms) {
        if (platform === 'Facebook') {
            if (!facebook?.pageId || !facebook?.pageAccessToken) {
                failedToPublish.push({ platform, reason: 'Connection details not provided.' });
                continue;
            }
            try {
                console.log(`[REAL FB] Publishing to Facebook page: ${facebook.pageName}`);
                const description = generatedContent.facebook || '';
                const hashtags = (generatedContent.hashtags || []).map(h => `#${h}`).join(' ');
                const caption = `${description}\n\n${hashtags}`.trim();

                if (isImage) {
                    console.log(`[REAL FB] Preparing multipart/form-data upload from data URL.`);
                    const parts = imageUrl.split(',');
                    const meta = parts[0].split(';');
                    const mimeType = meta[0].split(':')[1];
                    const base64Data = parts[1];
                    const imageBuffer = Buffer.from(base64Data, 'base64');

                    const formData = new FormData();
                    formData.append('access_token', facebook.pageAccessToken);
                    formData.append('caption', caption);
                    formData.append('source', new Blob([imageBuffer], { type: mimeType }), 'upload.jpg');

                    const postUrl = `https://graph.facebook.com/v23.0/${facebook.pageId}/photos`;
                    const fbResponse = await fetch(postUrl, { method: 'POST', body: formData });
                    const fbData = await fbResponse.json();
                    if (fbData.error) throw new Error(`Graph API post error: ${fbData.error.message}`);

                    console.log('[REAL FB] Successfully posted photo to Facebook. Post ID:', fbData.post_id);
                    facebookPostId = fbData.post_id;

                    // Fetch the public URL of the just-posted photo for Instagram
                    const photoDetailsResp = await fetch(`https://graph.facebook.com/v23.0/${fbData.post_id}?fields=full_picture&access_token=${facebook.pageAccessToken}`);
                    const photoDetailsData = await photoDetailsResp.json();
                    if (photoDetailsData.full_picture) {
                        facebookPhotoUrl = photoDetailsData.full_picture;
                        console.log(`[REAL FB] Retrieved public photo URL for IG: ${facebookPhotoUrl.substring(0, 70)}...`);
                    } else {
                        console.warn('[REAL FB] Could not retrieve public photo URL after posting.');
                    }

                } else if (isVideo) {
                    console.log(`[REAL FB] Publishing video from URL: ${transformedVideoUrl.substring(0, 70)}...`);
                    const postUrl = `https://graph.facebook.com/v23.0/${facebook.pageId}/videos`;
                    const videoParams = new URLSearchParams({
                        access_token: facebook.pageAccessToken,
                        file_url: transformedVideoUrl,
                        description: caption
                    });
                    const fbResponse = await fetch(postUrl, { method: 'POST', body: videoParams });
                    const fbData = await fbResponse.json();
                    if (fbData.error) throw new Error(`Graph API video post error: ${fbData.error.message}`);
                    console.log('[REAL FB] Successfully posted video to Facebook. Video ID:', fbData.id);
                    facebookPostId = fbData.id; // video posts return 'id'
                } else {
                    throw new Error('A valid image or video was not provided for the Facebook post.');
                }
                publishedTo.push(platform);
            } catch (error) {
                console.error('[REAL FB] Failed to publish to Facebook:', error);
                failedToPublish.push({ platform, reason: error.message });
            }
        } else if (platform === 'Instagram') {
            if (!instagram?.igUserId || !facebook?.pageAccessToken) {
                failedToPublish.push({ platform, reason: 'Connection details not provided.' });
                continue;
            }
            let mediaUrlForIg;
            try {
                console.log(`[REAL IG] Publishing to Instagram account: ${instagram.username}`);

                let baseCaption = (generatedContent.instagram || generatedContent.description || '');
                const hashtags = (generatedContent.hashtags || []).map(h => `#${h}`).join(' ');
                let fullCaption = `${baseCaption}\n\n${hashtags}`.trim();

                // Enforce Instagram's 2200 character limit
                if (fullCaption.length > 2200) {
                    console.warn(`[REAL IG] Caption is too long (${fullCaption.length} chars). Truncating.`);
                    const maxBaseCaptionLength = 2200 - hashtags.length - 5; // -5 for newline and ellipsis
                    if (maxBaseCaptionLength > 0) {
                        baseCaption = baseCaption.substring(0, maxBaseCaptionLength) + '...';
                        fullCaption = `${baseCaption}\n\n${hashtags}`.trim();
                    } else {
                        // This case is unlikely, but handles if hashtags alone are too long
                        fullCaption = hashtags.substring(0, 2197) + '...';
                    }
                    console.log(`[REAL IG] Truncated caption length: ${fullCaption.length}`);
                }
                const igCaption = fullCaption;


                if (isImage) {
                    if (!facebookPhotoUrl) {
                        throw new Error('To post an image to Instagram, you must also select Facebook. The Instagram post uses the photo from the Facebook post.');
                    }
                    console.log('[REAL IG] Waiting 2 seconds for Facebook photo URL to propagate...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    mediaUrlForIg = facebookPhotoUrl;
                } else if (isVideo) {
                    mediaUrlForIg = transformedVideoUrl; // Use transformed Cloudinary URL directly
                    // Pre-flight check for video URL accessibility
                    console.log(`[REAL IG] Verifying accessibility of video URL: ${mediaUrlForIg.substring(0, 70)}...`);
                    try {
                        const videoCheckResponse = await fetch(mediaUrlForIg, { method: 'HEAD' });
                        if (!videoCheckResponse.ok) {
                            throw new Error(`The provided video URL is not accessible. Status: ${videoCheckResponse.status}. The URL may be invalid, private, or not yet available on the CDN.`);
                        }
                        console.log('[REAL IG] Video URL is accessible (Status 200 OK).');
                    } catch (headError) {
                        console.error('[REAL IG] Video URL verification failed.', headError);
                        throw new Error(`Video URL Check Failed: ${headError.message}`);
                    }
                } else {
                    throw new Error(`No valid media or mediaType provided. Received mediaType: ${mediaType}`);
                }

                // 1. Create Media Container
                let containerRequestUrl;
                let containerRequestParamsBody;

                if (isImage) {
                    containerRequestUrl = `https://graph.facebook.com/v23.0/${instagram.igUserId}/media`;
                    containerRequestParamsBody = new URLSearchParams({
                        caption: igCaption,
                        access_token: facebook.pageAccessToken,
                        image_url: mediaUrlForIg,
                    });
                } else { // isVideo is the only other option here
                    // Send all parameters in the request body for video uploads.
                    // Using mixed query/body params was causing IG to reject the request with
                    // "Invalid parameter" errors.
                    containerRequestUrl = `https://graph.facebook.com/v23.0/${instagram.igUserId}/media`;
                    containerRequestParamsBody = new URLSearchParams({
                        caption: igCaption,
                        access_token: facebook.pageAccessToken,
                        media_type: 'REELS',
                        video_url: mediaUrlForIg,
                        // Optional: set this to 'true' if you want the reel to be visible on the feed
                        share_to_feed: 'true',
                    });
                }

                const loggedBodyParams = {};
                containerRequestParamsBody.forEach((value, key) => {
                    if (key !== 'access_token') loggedBodyParams[key] = value;
                });
                console.log('[REAL IG] Creating container with URL:', containerRequestUrl);
                console.log('[REAL IG] Creating container with body parameters:', JSON.stringify(loggedBodyParams, null, 2));

                const containerResponse = await fetch(containerRequestUrl, { method: 'POST', body: containerRequestParamsBody });
                const containerData = await containerResponse.json();
                if (containerData.error) throw new Error(`IG container creation failed: ${containerData.error.message}`);
                const creationId = containerData.id;
                console.log(`[REAL IG] Media container created with ID: ${creationId}`);

                // 2. Poll for container status (only for videos)
                if (isVideo) {
                    let containerStatus = '';
                    let lastStatusText = '';
                    let attempts = 0;
                    const maxAttempts = 20; // 20 attempts * 4s = 80 seconds timeout
                    
                    while (containerStatus !== 'FINISHED' && attempts < maxAttempts) {
                        const statusUrl = `https://graph.facebook.com/v23.0/${creationId}?fields=status_code,status&access_token=${facebook.pageAccessToken}`;
                        const statusRes = await fetch(statusUrl);
                        const statusData = await statusRes.json();
    
                        if (statusData.error) {
                            throw new Error(`IG container status check failed: ${statusData.error.message}`);
                        }
    
                        containerStatus = statusData.status_code;
                        lastStatusText = statusData.status || '';
                        console.log(`[REAL IG] Container status check #${attempts + 1}: ${containerStatus} (Status: ${lastStatusText})`);
    
                        if (containerStatus === 'ERROR') {
                            const errorMessage = lastStatusText || 'Instagram media container failed to process with an unknown error.';
                            console.error(`[REAL IG] Container processing failed. Status: ${containerStatus}, Message: "${errorMessage}"`);
                            // The 'status' field contains the human-readable error. No need for a second, unreliable request.
                            throw new Error(errorMessage);
                        }
    
                        if (containerStatus !== 'FINISHED') {
                            await new Promise(resolve => setTimeout(resolve, 4000));
                            attempts++;
                        }
                    }
    
                    if (containerStatus !== 'FINISHED') {
                        throw new Error(`Instagram media container processing timed out after ${attempts * 4} seconds. Last status: ${containerStatus} - ${lastStatusText}`);
                    }
                }


                // 3. Publish container
                const publishUrl = `https://graph.facebook.com/v23.0/${instagram.igUserId}/media_publish`;
                const publishParams = new URLSearchParams({
                    creation_id: creationId,
                    access_token: facebook.pageAccessToken
                });
                const publishResponse = await fetch(publishUrl, { method: 'POST', body: publishParams });
                const publishData = await publishResponse.json();

                if (publishData.error) throw new Error(`IG publish failed: ${publishData.error.message}`);
                console.log('[REAL IG] Successfully posted to Instagram. Media ID:', publishData.id);
                instagramPostId = publishData.id;
                publishedTo.push(platform);
            } catch (error) {
                console.error('[REAL IG] Failed to publish to Instagram. Details:', {
                    errorMessage: error.message,
                    username: instagram.username,
                    isImage,
                    isVideo,
                    errorStack: error.stack
                });
                failedToPublish.push({ platform, reason: error.message });
            }
        } else if (platform === 'YouTube') { // Mock logic for YouTube
            if (mockState.YouTube.connected) {
                console.log(`[MOCK] Publishing to ${platform}...`);
                publishedTo.push(platform);
            } else {
                failedToPublish.push({ platform, reason: 'Not connected.' });
            }
        }
    }

    if (failedToPublish.length > 0) {
        const errorDetails = failedToPublish.map(p => `${p.platform} (${p.reason})`).join(', ');
        return res.status(400).json({
            message: `Failed to publish to some platforms: ${errorDetails}`,
            publishedTo,
            failedToPublish
        });
    }

    // All successful, construct the Post object for the client
    const newPost = {
        id: facebookPostId || instagramPostId || `post_${Date.now()}`,
        platforms: publishedTo,
        platformPostIds: {
            Facebook: facebookPostId,
            Instagram: instagramPostId,
        },
        audience: req.body.audience,
        imageUrl: req.body.imageUrl,
        videoUrl: transformedVideoUrl,
        mediaType: req.body.mediaType,
        prompt: req.body.prompt,
        generatedContent: req.body.generatedContent,
        postedAt: new Date().toISOString(),
        engagement: {
            total: { likes: 0, comments: 0, shares: 0 },
        },
        status: 'active',
    };

    res.status(201).json(newPost);
});

app.post('/api/post-insights', async (req, res) => {
    const { facebookPostId, instagramPostId, pageAccessToken } = req.body;
    if (!pageAccessToken || (!facebookPostId && !instagramPostId)) {
        return res.status(400).json({ message: 'Missing required parameters.' });
    }

    try {
        const insights = {
            engagement: { total: { likes: 0, comments: 0, shares: 0 } },
            activePlatforms: [],
            status: 'active'
        };
        let anyPostFound = false;

        if (facebookPostId) {
            const fields = 'likes.summary(true),comments.summary(true),shares';
            const url = `https://graph.facebook.com/v23.0/${facebookPostId}?fields=${fields}&access_token=${pageAccessToken}`;
            const fbResponse = await fetch(url);
            const fbData = await fbResponse.json();

            if (fbData.error) {
                // Common error when a post is deleted
                if (fbData.error.code === 100 || fbData.error.code === 803) {
                     console.log(`Facebook post ${facebookPostId} not found, likely deleted.`);
                } else {
                    console.error('FB Insight Error:', fbData.error);
                }
            } else {
                anyPostFound = true;
                const likes = fbData.likes?.summary?.total_count || 0;
                const comments = fbData.comments?.summary?.total_count || 0;
                const shares = fbData.shares?.count || 0;
                insights.engagement.total.likes += likes;
                insights.engagement.total.comments += comments;
                insights.engagement.total.shares += shares;
                insights.engagement.facebook = { likes, comments, shares };
                insights.activePlatforms.push('Facebook');
            }
        }
        
        if (instagramPostId) {
            const fields = 'like_count,comments_count';
            const url = `https://graph.facebook.com/v23.0/${instagramPostId}?fields=${fields}&access_token=${pageAccessToken}`;
            const igResponse = await fetch(url);
            const igData = await igResponse.json();

             if (igData.error) {
                if (igData.error.code === 100 || igData.error.code === 10) {
                    console.log(`Instagram post ${instagramPostId} not found, likely deleted.`);
                } else {
                    console.error('IG Insight Error:', igData.error);
                }
            } else {
                anyPostFound = true;
                const likes = igData.like_count || 0;
                const comments = igData.comments_count || 0;
                insights.engagement.total.likes += likes;
                insights.engagement.total.comments += comments;
                insights.engagement.instagram = { likes, comments, shares: 0 };
                insights.activePlatforms.push('Instagram');
            }
        }
        
        if (!anyPostFound) {
            insights.status = 'deleted';
        }

        res.json(insights);
    } catch (error) {
        console.error('Failed to get post insights:', error);
        res.status(500).json({ message: `Failed to get post insights: ${error.message}` });
    }
});

app.delete('/api/post/:postId', async (req, res) => {
    const { postId } = req.params;
    const { pageAccessToken, platform } = req.body;

    if (!pageAccessToken) {
        return res.status(401).json({ message: 'Missing access token.' });
    }

    try {
        if (platform === 'Instagram') {
            return res.status(405).json({ message: "Instagram Graph API does not support deleting published media. Please delete it from the Instagram app." });
        }
        
        const url = `https://graph.facebook.com/v23.0/${postId}?access_token=${pageAccessToken}`;
        const response = await fetch(url, { method: 'DELETE' });
        const data = await response.json();

        if (data.error) {
            if (data.error.code === 100) { // Post already deleted
                 return res.json({ success: true });
            }
            throw new Error(`Graph API error: ${data.error.message}`);
        }

        res.json({ success: data.success || false });
    } catch (error) {
        console.error(`Failed to delete post ${postId}:`, error);
        res.status(500).json({ message: error.message });
    }
});

app.get('/api/post/:postId/likes', async (req, res) => {
    const { postId } = req.params;
    const { pageAccessToken } = req.query;
    
    if (!pageAccessToken) return res.status(400).json({ message: 'Missing pageAccessToken' });

    try {
        const url = `https://graph.facebook.com/v23.0/${postId}/likes?fields=id,name,picture&limit=100&access_token=${pageAccessToken}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        res.json(data.data || []);
    } catch (error) {
        console.error(`Failed to get likes for post ${postId}:`, error);
        res.status(500).json({ message: `Failed to get likes: ${error.message}` });
    }
});

app.get('/api/post/:postId/comments', async (req, res) => {
    const { postId } = req.params;
    const { pageAccessToken, platform } = req.query;

    if (!pageAccessToken) return res.status(400).json({ message: 'Missing pageAccessToken' });

    try {
        let fields;
        if (platform === 'Instagram') {
            // Instagram Comment: 'text', 'timestamp', 'username', and nested 'replies'
            fields = 'id,text,from{id,username},timestamp,replies{id,text,from{id,username},timestamp}';
        } else {
            // Facebook Comment: 'message', 'created_time', 'name', and nested 'comments'
            fields = 'id,message,from{id,name,picture},created_time,comments{id,message,from{id,name,picture},created_time}';
        }

        const url = `https://graph.facebook.com/v23.0/${postId}/comments?fields=${fields}&limit=100&access_token=${pageAccessToken}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
             console.error(`Graph API error fetching comments for ${platform} post ${postId}:`, data.error);
             throw new Error(data.error.message);
        }

        let comments = data.data || [];

        // Transform the response to match the client's expected unified `Comment` structure.
        if (platform === 'Instagram') {
            const transformIgComment = (comment) => ({
                id: comment.id,
                message: comment.text,
                created_time: comment.timestamp,
                from: {
                    id: comment.from.id,
                    name: comment.from.username,
                    picture: {
                        data: {
                            url: `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.from.username)}&background=374151&color=e5e7eb&size=40`
                        }
                    }
                },
                // Recursively transform replies into the unified 'comments' array
                comments: (comment.replies && comment.replies.data) ? comment.replies.data.map(transformIgComment) : []
            });
            comments = comments.map(transformIgComment);
        } else { // Facebook
            // Normalize FB's `comments.data` structure into a simple array.
            const normalizeFbComments = (comment) => ({
                ...comment,
                comments: (comment.comments && comment.comments.data) ? comment.comments.data.map(normalizeFbComments) : []
            });
            comments = comments.map(normalizeFbComments);
        }

        res.json(comments);
    } catch (error) {
        console.error(`Failed to get comments for post ${postId} (Platform: ${platform}):`, error);
        res.status(500).json({ message: `Failed to get comments: ${error.message}` });
    }
});

app.post('/api/comment/:commentId/reply', async (req, res) => {
    const { commentId } = req.params;
    const { message, pageAccessToken } = req.body;

    if (!message || !pageAccessToken) return res.status(400).json({ message: 'Missing required parameters.' });

    try {
        const url = `https://graph.facebook.com/v23.0/${commentId}/replies`;
        const params = new URLSearchParams({
            message: message,
            access_token: pageAccessToken
        });
        const response = await fetch(url, { method: 'POST', body: params });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        res.json({ success: true, id: data.id });
    } catch (error) {
        console.error(`Failed to reply to comment ${commentId}:`, error);
        res.status(500).json({ message: `Failed to reply: ${error.message}` });
    }
});

app.delete('/api/comment/:commentId', async (req, res) => {
    const { commentId } = req.params;
    const { pageAccessToken } = req.body;

    if (!pageAccessToken) return res.status(400).json({ message: 'Missing pageAccessToken.' });

    try {
        const url = `https://graph.facebook.com/v23.0/${commentId}?access_token=${pageAccessToken}`;
        const response = await fetch(url, { method: 'DELETE' });
        const data = await response.json();

        if (data.error) throw new Error(data.error.message);

        res.json({ success: data.success || false });
    } catch (error) {
        console.error(`Failed to delete comment ${commentId}:`, error);
        res.status(500).json({ message: `Failed to delete comment: ${error.message}` });
    }
});

app.post('/api/cloudinary-signature', (req, res) => {
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!apiSecret) {
        return res.status(500).json({ message: "Cloudinary API secret is not configured on the server." });
    }
    const timestamp = Math.round((new Date()).getTime() / 1000);
    const paramsToSign = {
        folder: 'nadanaloga/uploads',
        timestamp: timestamp,
    };

    const paramsString = Object.entries(paramsToSign)
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, value]) => `${key}=${value}`)
        .join('&');

    const signature = crypto.createHash('sha1').update(paramsString + apiSecret).digest('hex');

    res.json({ timestamp, signature });
});


// --- Serve static files from React build in production ---
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));

    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
}

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});