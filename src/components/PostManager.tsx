
import React, { useState, useEffect, useCallback } from 'react';
import type { Post, ConnectionDetails, Comment } from '../types';
import { Platform } from '../types';
import { getComments, replyToComment } from '../services/geminiService';
import { timeAgo } from '../utils/time';

interface PostManagerProps {
    post: Post;
    connectionDetails: ConnectionDetails;
    onUpdatePost: (post: Post, newContent: Post['generatedContent']) => Promise<void>;
}

const LoadingSpinner: React.FC<{ size?: string }> = ({ size = 'h-5 w-5' }) => (
    <svg className={`animate-spin ${size} text-white`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
);

const EditPostTab: React.FC<{ post: Post, onSave: (newContent: Post['generatedContent']) => Promise<void> }> = ({ post, onSave }) => {
    const [editedContent, setEditedContent] = useState(post.generatedContent);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            await onSave(editedContent);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4 p-4">
            <h3 className="font-bold text-white">Edit Post Content</h3>
            <p className="text-xs text-dark-text-secondary">Note: Currently, only the Facebook post content can be updated after posting.</p>
            <div>
                <label className="text-xs font-bold text-dark-text-secondary">Facebook/Instagram Description</label>
                <textarea 
                    value={editedContent.facebook}
                    onChange={(e) => setEditedContent(c => ({...c, facebook: e.target.value, instagram: e.target.value}))}
                    className="w-full mt-1 bg-dark-bg border border-dark-border rounded-md p-2 text-sm h-24"
                />
            </div>
             <div>
                <label className="text-xs font-bold text-dark-text-secondary">Hashtags</label>
                <input 
                    type="text" 
                    value={editedContent.hashtags.join(' ')}
                    onChange={(e) => setEditedContent(c => ({...c, hashtags: e.target.value.split(' ')}))}
                    className="w-full mt-1 bg-dark-bg border border-dark-border rounded-md p-2 text-sm" 
                />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="text-right">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center justify-center gap-2 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand-primary hover:bg-brand-secondary disabled:bg-gray-500"
                >
                    {isSaving && <LoadingSpinner />}
                    Save Changes
                </button>
            </div>
        </div>
    );
};

const CommentsTab: React.FC<{ post: Post, pageAccessToken: string }> = ({ post, pageAccessToken }) => {
    const [comments, setComments] = useState<Comment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const fetchComments = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const fetchedComments = await getComments(post.id, pageAccessToken, Platform.Facebook);
            setComments(fetchedComments);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load comments.');
        } finally {
            setIsLoading(false);
        }
    }, [post.id, pageAccessToken]);

    useEffect(() => {
        fetchComments();
    }, [fetchComments]);
    
    const handleReplySubmit = async (commentId: string) => {
        if (!replyText.trim()) return;
        setIsSubmitting(true);
        try {
            await replyToComment(commentId, replyText, pageAccessToken);
            setReplyText('');
            setReplyingTo(null);
            // Refresh comments to see the new reply
            await fetchComments(); 
        } catch(err) {
            setError(err instanceof Error ? err.message : 'Failed to post reply.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center text-dark-text-secondary">Loading comments...</div>;
    }

    if (error) {
        return <div className="p-4 text-red-400">{error}</div>;
    }

    return (
        <div className="space-y-4 p-4">
            {comments.length === 0 ? (
                 <p className="text-center text-dark-text-secondary py-4">No comments on this post yet.</p>
            ) : (
                <ul className="space-y-3 max-h-96 overflow-y-auto">
                    {comments.map(comment => (
                        <li key={comment.id} className="bg-dark-card p-3 rounded-lg">
                            <div className="flex items-start gap-3">
                               <img src={comment.from.picture?.data.url} alt={comment.from.name} className="w-8 h-8 rounded-full"/>
                               <div className="flex-1">
                                    <div className="flex justify-between items-center text-xs">
                                        <p className="font-bold text-white">{comment.from.name}</p>
                                        <p className="text-dark-text-secondary">{timeAgo(comment.created_time)}</p>
                                    </div>
                                    <p className="text-sm text-dark-text mt-1">{comment.message}</p>
                                    <button onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)} className="text-xs text-brand-secondary hover:underline mt-2">
                                       {replyingTo === comment.id ? 'Cancel' : 'Reply'}
                                    </button>
                               </div>
                            </div>
                            {replyingTo === comment.id && (
                                <div className="mt-2 pl-11">
                                    <textarea 
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        className="w-full bg-dark-bg border border-dark-border rounded-md p-2 text-sm"
                                        placeholder={`Replying to ${comment.from.name}...`}
                                        rows={2}
                                    />
                                    <div className="text-right mt-1">
                                        <button 
                                            onClick={() => handleReplySubmit(comment.id)}
                                            disabled={isSubmitting}
                                            className="flex items-center justify-center gap-2 px-3 py-1 text-xs font-medium text-white bg-brand-primary hover:bg-brand-secondary rounded-md disabled:bg-gray-500">
                                            {isSubmitting ? <LoadingSpinner size="h-4 w-4"/> : 'Send'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export const PostManager: React.FC<PostManagerProps> = ({ post, connectionDetails, onUpdatePost }) => {
    const [activeTab, setActiveTab] = useState<'edit' | 'comments'>('edit');
    const pageAccessToken = connectionDetails.facebook?.pageAccessToken;

    if (!pageAccessToken) {
        return <div className="p-4 text-yellow-400">Facebook connection details are missing. Cannot manage post.</div>;
    }

    return (
        <div>
            <div className="border-b border-dark-border flex">
                <button
                    onClick={() => setActiveTab('edit')}
                    className={`px-4 py-2 text-sm font-medium ${activeTab === 'edit' ? 'text-white border-b-2 border-brand-primary' : 'text-dark-text-secondary'}`}
                >
                    Edit
                </button>
                <button
                    onClick={() => setActiveTab('comments')}
                    className={`px-4 py-2 text-sm font-medium ${activeTab === 'comments' ? 'text-white border-b-2 border-brand-primary' : 'text-dark-text-secondary'}`}
                >
                    Comments ({post.engagement?.total?.comments || 0})
                </button>
            </div>
            <div>
                {activeTab === 'edit' && <EditPostTab post={post} onSave={(newContent) => onUpdatePost(post, newContent)} />}
                {activeTab === 'comments' && <CommentsTab post={post} pageAccessToken={pageAccessToken} />}
            </div>
        </div>
    );
};
