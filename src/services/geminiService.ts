
import type { Platform, SeoSuggestions, Post, ConnectionStatus, GeneratedAssetContent } from '../types';

const handleResponse = async (response: Response) => {
    if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
            const errorBody = await response.json();
            errorMessage = errorBody.message || errorMessage;
        } catch (e) {
            // Ignore if the response body is not JSON
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

export const getConnections = async (): Promise<ConnectionStatus> => {
    const response = await fetch('/api/connections');
    return handleResponse(response);
}

export const connectFacebook = async (accessToken: string): Promise<ConnectionStatus> => {
    const response = await fetch('/api/connect/facebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
    });
    return handleResponse(response);
}

export const disconnectPlatform = async (platform: Platform): Promise<ConnectionStatus> => {
    const response = await fetch(`/api/connections/${platform}`, { method: 'DELETE' });
    return handleResponse(response);
}

export const publishPost = async (post: Omit<Post, 'id' | 'engagement' | 'postedAt'>): Promise<Post> => {
     const response = await fetch('/api/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(post),
    });
    return handleResponse(response);
}