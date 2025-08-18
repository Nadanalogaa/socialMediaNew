
import type { Platform, SeoSuggestions, Post, ConnectionStatus, GeneratedAssetContent, GeneratedPostIdea, ConnectionDetails, Comment } from '../types';

const handleResponse = async (response: Response) => {
    if (!response.ok) {
        let errorMessage = `Request failed with status: ${response.status}`;
        try {
            const errorBody = await response.json();
            errorMessage = errorBody.message || JSON.stringify(errorBody);
        } catch (e) {
            try {
                const textBody = await response.text();
                if (textBody && textBody.length < 500) {
                    errorMessage = textBody;
                } else {
                    console.error("Long non-JSON error response from server:", textBody);
                    errorMessage = `Server returned a non-JSON error (status ${response.status}). Check console for details.`;
                }
            } catch (textErr) {
                // Fallback if we can't even read the text body
            }
        }
        console.error("API Error:", errorMessage);
        throw new Error(errorMessage);
    }
    // Handle cases where the server returns a 200 OK but with an empty body
    const text = await response.text();
    return text ? JSON.parse(text) : {};
}

export const generateAssetContent = async (prompt: string): Promise<GeneratedAssetContent> => {
    const response = await fetch('/api/generate-asset-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
    });
    return handleResponse(response);
};

export const generateSeoSuggestions = async (url: string): Promise<SeoSuggestions> => {
    const response = await fetch('/api/generate-seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
    });
    return handleResponse(response);
};

export const generatePostFromIdea = async (title: string, description: string): Promise<GeneratedPostIdea> => {
    const response = await fetch('/api/generate-post-from-idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
    });
    return handleResponse(response);
};

export const getConnections = async (): Promise<ConnectionStatus> => {
    const response = await fetch('/api/connections');
    return handleResponse(response);
}

export const connectFacebook = async (accessToken: string): Promise<{ connections: ConnectionStatus, details: ConnectionDetails }> => {
    const response = await fetch('/api/connect/facebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
    });
    return handleResponse(response);
}

export const disconnectPlatform = async (platform: Platform): Promise<ConnectionStatus> => {
    const response = await fetch(`/api/connections/${platform}`, {
        method: 'DELETE',
    });
    return handleResponse(response);
};

export const publishPost = async (
    postData: Omit<Post, 'id' | 'engagement' | 'postedAt' | 'platformPostIds' | 'status'>,
    connectionDetails: ConnectionDetails
): Promise<Post> => {
    const response = await fetch('/api/publish-post', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...postData, ...connectionDetails })
    });
    return handleResponse(response);
};

export const getPostInsights = async (facebookPostId: string | undefined, instagramPostId: string | undefined, pageAccessToken: string): Promise<Post['engagement']> => {
    const response = await fetch('/api/post-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facebookPostId, instagramPostId, pageAccessToken }),
    });
    return handleResponse(response);
};

export const deletePost = async (postId: string, pageAccessToken: string): Promise<{ success: boolean }> => {
    // Mock posts are handled client-side only and don't need an API call.
    if (postId.startsWith('post_')) {
        return Promise.resolve({ success: true });
    }

    const response = await fetch(`/api/post/${postId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageAccessToken }),
    });
    return handleResponse(response);
};

export const updatePost = async (postId: string, message: string, pageAccessToken: string): Promise<{ success: boolean }> => {
    const response = await fetch(`/api/post/${postId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, pageAccessToken }),
    });
    return handleResponse(response);
};

export const getComments = async (postId: string, pageAccessToken: string): Promise<Comment[]> => {
    const response = await fetch(`/api/post/${postId}/comments?pageAccessToken=${pageAccessToken}`);
    return handleResponse(response);
};

export const replyToComment = async (commentId: string, message: string, pageAccessToken: string): Promise<{ success: boolean, id: string }> => {
    const response = await fetch(`/api/comment/${commentId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, pageAccessToken }),
    });
    return handleResponse(response);
};
