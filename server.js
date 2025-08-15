



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
app.use(express.json({ limit: '100mb' })); // Increase limit for base64 images/videos
app.use(express.urlencoded({ extended: true, limit: '100mb' }));


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- In-memory store for MOCK DATA purposes ONLY ---
const TARGET_PAGE_NAME = 'Nadanaloga-chennai'; // The specific page we want to connect to
const TARGET_IG_USERNAME = 'nadanaloga_chennai'; // The specific IG business account we want to connect to

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
            if (igAccount.username === TARGET_IG_USERNAME) {
                instagramDetails = {
                    igUserId: igAccount.id,
                    username: igAccount.username,
                };
                console.log(`[REAL AUTH] Successfully got details for Instagram account: ${igAccount.username} (ID: ${igAccount.id})`);
            } else {
                 console.warn(`[REAL AUTH] Found Instagram account '${igAccount.username}', but it does not match target '${TARGET_IG_USERNAME}'.`);
            }
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
    const { platforms, generatedContent, imageUrl, audience, prompt, facebook, instagram } = req.body;
    
    if (!platforms || !generatedContent || !prompt) {
        return res.status(400).json({ message: 'Missing required fields for publishing.' });
    }
    
    console.log("Received publish request for platforms:", platforms);
    const publishedTo = [];
    const failedToPublish = [];

    const isVideo = imageUrl && imageUrl.startsWith('https://');
    const isImage = imageUrl && imageUrl.startsWith('data:image');

    let facebookPostId = null;
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
                    console.log(`[REAL FB] Publishing video from URL: ${imageUrl.substring(0,70)}...`);
                    const postUrl = `https://graph.facebook.com/v23.0/${facebook.pageId}/videos`;
                    const videoParams = new URLSearchParams({
                        access_token: facebook.pageAccessToken,
                        file_url: imageUrl,
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
             try {
                console.log(`[REAL IG] Publishing to Instagram account: ${instagram.username}`);
                const igCaption = (generatedContent.instagram || generatedContent.description || '') + '\n\n' + (generatedContent.hashtags || []).map(h => `#${h}`).join(' ');

                let mediaUrlForIg;
                if (isImage) {
                    if (!facebookPhotoUrl) {
                        throw new Error('To post an image to Instagram, you must also select Facebook. The Instagram post uses the photo from the Facebook post.');
                    }
                    mediaUrlForIg = facebookPhotoUrl;
                } else if (isVideo) {
                    mediaUrlForIg = imageUrl; // Use Cloudinary URL directly
                } else {
                    throw new Error('No valid media URL for Instagram.');
                }
                
                // 1. Create Media Container
                const createContainerUrl = `https://graph.facebook.com/v23.0/${instagram.igUserId}/media`;
                const createContainerParams = new URLSearchParams({
                    caption: igCaption,
                    access_token: facebook.pageAccessToken
                });

                if (isImage) {
                    createContainerParams.append('image_url', mediaUrlForIg);
                } else { // isVideo
                    createContainerParams.append('video_url', mediaUrlForIg);
                }

                const containerResponse = await fetch(createContainerUrl, { method: 'POST', body: createContainerParams });
                const containerData = await containerResponse.json();
                if (containerData.error) throw new Error(`IG container creation failed: ${containerData.error.message}`);
                const creationId = containerData.id;
                console.log(`[REAL IG] Media container created with ID: ${creationId}`);

                // 2. Poll for container status
                let containerStatus = '';
                let attempts = 0;
                while (containerStatus !== 'FINISHED' && attempts < 20) { // Increased timeout for video
                    const statusUrl = `https://graph.facebook.com/v23.0/${creationId}?fields=status_code&access_token=${facebook.pageAccessToken}`;
                    const statusRes = await fetch(statusUrl);
                    const statusData = await statusRes.json();
                    if(statusData.error) throw new Error(`IG container status check failed: ${statusData.error.message}`);
                    
                    containerStatus = statusData.status_code;
                    console.log(`[REAL IG] Container status check #${attempts + 1}: ${containerStatus}`);

                    if (containerStatus === 'ERROR') throw new Error('Instagram media container failed to process.');
                    if (containerStatus !== 'FINISHED') {
                        await new Promise(resolve => setTimeout(resolve, 3000)); // wait 3s
                        attempts++;
                    }
                }
                if (containerStatus !== 'FINISHED') throw new Error('Instagram media container processing timed out.');
                
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
                publishedTo.push(platform);
            } catch (error) {
                console.error('[REAL IG] Failed to publish to Instagram:', error);
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
        return res.status(400).json({ message: `Cannot publish to some platforms. Please check connections or permissions: ${errorDetails}` });
    }
    
    const newPost = {
        id: facebookPostId || `post_${Date.now()}`,
        platforms: publishedTo,
        audience,
        imageUrl, // This is now a data URL for images, or a Cloudinary URL for videos
        prompt,
        generatedContent,
        postedAt: new Date().toISOString(),
        engagement: { likes: 0, comments: 0, shares: 0 }, // Real engagement would be fetched later
    };

    // Simulate network delay for mock platforms if they were part of the request
    const hasMockPlatform = platforms.some(p => p === 'YouTube');
    setTimeout(() => {
        console.log(`Created new post with ID: ${newPost.id}`);
        res.status(200).json(newPost);
    }, hasMockPlatform ? 1500 : 0);
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


app.post('/api/generate-post-from-idea', async (req, res) => {
    const { title, description } = req.body;
    if (!title || !description) {
        return res.status(400).json({ message: 'Missing required fields: title, description' });
    }

    if (!hasApiKey) {
        return setTimeout(() => res.json({
            postText: `Check out our new blog post: "${title}"! We dive deep into ${description.toLowerCase()}. Learn more on our website!`,
            imagePrompt: `A mock image prompt for a blog post about "${title}"`,
            hashtags: ['mock', 'blog', 'newpost', 'nadanaloga', 'seo']
        }), 1000);
    }
    
    const systemInstruction = `You are a social media marketing expert for 'Nadanaloga' (www.nadanaloga.com), an Indian classical dance school. Your task is to turn a blog post idea into a promotional social media post.`;
    const prompt = `Blog Post Title: "${title}"\nBlog Post Description: "${description}"\n\nBased on the above, generate a short, engaging social media caption to promote this blog post. Also, create a detailed, creative prompt for an AI image generator to make a suitable visual. Finally, provide 5-7 relevant hashtags.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
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

app.post('/api/post-insights', async (req, res) => {
    const { postId, pageAccessToken } = req.body;
    if (!postId || !pageAccessToken) {
        return res.status(400).json({ message: 'Missing required fields: postId, pageAccessToken' });
    }

    try {
        console.log(`[REAL INSIGHTS] Fetching insights for post: ${postId}`);
        const insightsUrl = `https://graph.facebook.com/v23.0/${postId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${pageAccessToken}`;

        const response = await fetch(insightsUrl);
        const data = await response.json();

        if (data.error) {
            throw new Error(`Graph API error fetching insights: ${data.error.message}`);
        }

        const insights = {
            likes: data.likes?.summary?.total_count || 0,
            comments: data.comments?.summary?.total_count || 0,
            shares: data.shares?.count || 0,
        };

        console.log(`[REAL INSIGHTS] Successfully fetched insights:`, insights);
        res.json(insights);

    } catch (error) {
        console.error('[REAL INSIGHTS] Failed to fetch post insights:', error);
        res.status(500).json({ message: `Failed to fetch post insights: ${error.message}` });
    }
});

app.delete('/api/post/:postId', async (req, res) => {
    const { postId } = req.params;
    const { pageAccessToken } = req.body;

    if (!postId || !pageAccessToken) {
        return res.status(400).json({ message: 'Missing required fields: postId, pageAccessToken' });
    }

    if (postId.startsWith('post_')) {
        return res.status(400).json({ message: 'Cannot delete mock posts from the platform.' });
    }

    try {
        console.log(`[REAL DELETE] Attempting to delete post: ${postId}`);
        const deleteUrl = `https://graph.facebook.com/v23.0/${postId}?access_token=${pageAccessToken}`;

        const response = await fetch(deleteUrl, { method: 'DELETE' });
        const data = await response.json();

        if (data.error) {
            if (data.error.code === 100 && data.error.error_subcode === 33) {
                console.warn(`[REAL DELETE] Post ${postId} might have been already deleted. Message: ${data.error.message}`);
                return res.json({ success: true, message: "Post already deleted." });
            }
            throw new Error(`Graph API error deleting post: ${data.error.message}`);
        }

        if (data.success === false) {
             console.error('[REAL DELETE] Facebook API indicated failure without an error object:', data);
             throw new Error('Facebook API indicated deletion was unsuccessful.');
        }

        console.log(`[REAL DELETE] Successfully deleted post: ${postId}`);
        res.json({ success: true });

    } catch (error) {
        console.error('[REAL DELETE] Failed to delete post:', error);
        res.status(500).json({ message: `Failed to delete post: ${error.message}` });
    }
});


// Export the Express app for Vercel to use as a serverless function
export default app;