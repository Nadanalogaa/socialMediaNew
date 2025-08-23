


import type { Platform, SeoSuggestions, Post, ConnectionStatus, GeneratedAssetContent, GeneratedPostIdea, ConnectionDetails, Comment, FacebookUser, PostInsightResponse, SmartReplySuggestion, SmartBulkReply, KpiData } from '../types';

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

export interface FetchPostsResponse {
    posts: Post[];
    nextCursors: {
        facebook: string | null;
        instagram: string | null;
    } | null;
}

export const fetchPlatformPosts = async (
    limit: number,
    nextCursors: { facebook?: string | null; instagram?: string | null } | null,
    connectionDetails: ConnectionDetails
): Promise<FetchPostsResponse> => {
    if (!connectionDetails.facebook) {
        throw new Error("Facebook connection details are required to fetch posts.");
    }
    
    const params = new URLSearchParams({
        limit: String(limit),
        pageAccessToken: connectionDetails.facebook.pageAccessToken,
        pageId: connectionDetails.facebook.pageId,
    });
    
    if (connectionDetails.instagram?.igUserId) {
        params.append('igUserId', connectionDetails.instagram.igUserId);
    }

    if (nextCursors?.facebook) {
        params.append('fbNext', nextCursors.facebook);
    }
    if (nextCursors?.instagram) {
        params.append('igNext', nextCursors.instagram);
    }

    const response = await fetch(`/api/posts?${params.toString()}`);
    return handleResponse(response);
};

export const getKpis = async (details: ConnectionDetails): Promise<KpiData> => {
    const body: any = {
      facebook: {
        pageId: details.facebook?.pageId,
        pageAccessToken: details.facebook?.pageAccessToken,
      }
    };
    if (details.instagram?.igUserId) {
      body.instagram = { igUserId: String(details.instagram.igUserId) };
    }

    console.log('[KPI REQ BODY]', JSON.stringify(body));
  
    const res = await fetch('/api/kpis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  
    const text = await res.text();
    let json: any;
    try { 
        json = text ? JSON.parse(text) : {}; 
    } catch { 
        // If parsing fails, the text itself is the error message.
        json = { message: text }; 
    }
  
    if (!res.ok) {
      throw new Error(json?.message || `KPIs failed with HTTP ${res.status}`);
    }
    return json as KpiData;
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

export const getPostInsights = async (facebookPostId: string | undefined, instagramPostId: string | undefined, pageAccessToken: string): Promise<PostInsightResponse> => {
    const response = await fetch('/api/post-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facebookPostId, instagramPostId, pageAccessToken }),
    });
    return handleResponse(response);
};

export const deletePost = async (postId: string, pageAccessToken: string, platform: Platform): Promise<{ success: boolean }> => {
    // Mock posts are handled client-side only and don't need an API call.
    if (postId.startsWith('post_')) {
        return Promise.resolve({ success: true });
    }

    const response = await fetch(`/api/post/${postId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageAccessToken, platform }),
    });
    return handleResponse(response);
};

export const getLikes = async (postId: string, pageAccessToken: string): Promise<FacebookUser[]> => {
    const response = await fetch(`/api/post/${postId}/likes?pageAccessToken=${pageAccessToken}`);
    return handleResponse(response);
};

export const getComments = async (postId: string, pageAccessToken: string, platform: Platform): Promise<Comment[]> => {
    const response = await fetch(`/api/post/${postId}/comments?pageAccessToken=${pageAccessToken}&platform=${platform}`);
    return handleResponse(response);
};

export const replyToComment = async (commentId: string, message: string, pageAccessToken: string, platform: Platform): Promise<{ success: boolean, id: string }> => {
    const response = await fetch(`/api/comment/${commentId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, pageAccessToken, platform }),
    });
    return handleResponse(response);
};

export const generateCommentReply = async (commentText: string): Promise<SmartReplySuggestion[]> => {
    const response = await fetch('/api/generate-comment-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentText }),
    });
    return handleResponse(response);
};

export const generateSmartBulkReplies = async (comments: {id: string; message: string}[]): Promise<SmartBulkReply[]> => {
    const response = await fetch('/api/generate-smart-bulk-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comments }),
    });
    return handleResponse(response);
};

export const deleteComment = async (commentId: string, pageAccessToken: string): Promise<{ success: boolean }> => {
    const response = await fetch(`/api/comment/${commentId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageAccessToken }),
    });
    return handleResponse(response);
};

export const getCloudinarySignature = async (paramsToSign: object): Promise<{ timestamp: number, signature: string }> => {
    const response = await fetch('/api/cloudinary-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paramsToSign),
    });
    return handleResponse(response);
};