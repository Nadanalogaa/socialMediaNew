



import type { Platform, SeoSuggestions, Post, ConnectionStatus, GeneratedAssetContent, GeneratedPostIdea, ConnectionDetails } from '../types';

const handleResponse = async (response: Response) => {
    if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
            const errorBody = await response.json();
            errorMessage = errorBody.message || errorMessage;
        } catch (e) {
            // Ignore if the response is not JSON
        }
        throw new Error(errorMessage);
    }
    return response.json();
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
    postData: Omit<Post, 'id' | 'engagement' | 'postedAt'>,
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

export const getPostInsights = async (postId: string, pageAccessToken: string): Promise<{ likes: number; comments: number; shares: number; }> => {
    const response = await fetch('/api/post-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, pageAccessToken }),
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
