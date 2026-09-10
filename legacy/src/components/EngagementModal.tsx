import React, { useState, useCallback, useEffect } from 'react';
import type { Post, ConnectionDetails, Comment, FacebookUser, SmartReplySuggestion, Platform } from '../types';
import { Platform as PlatformEnum } from '../types';
import { getComments, getLikes, replyToComment, generateCommentReply } from '../services/geminiService';
import { timeAgo } from '../utils/time';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';

const LoadingSpinner: React.FC<{ size?: string }> = ({ size = 'h-8 w-8' }) => (
    <svg className={`animate-spin ${size} text-white`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
);

const sentimentStyles: Record<SmartReplySuggestion['sentiment'], { icon: string; classes: string }> = {
    positive: {
        icon: '👍',
        classes: 'border-green-500 text-green-300 hover:bg-green-500/20',
    },
    negative: {
        icon: '👎',
        classes: 'border-red-500 text-red-300 hover:bg-red-500/20',
    },
    question: {
        icon: '🤔',
        classes: 'border-blue-500 text-blue-300 hover:bg-blue-500/20',
    },
    neutral: {
        icon: '💬',
        classes: 'border-dark-border text-dark-text-secondary hover:border-brand-secondary hover:text-dark-text',
    }
};

export interface EngagementModalProps {
    post: Post;
    type: 'likes' | 'comments';
    platform: Platform;
    connectionDetails: ConnectionDetails;
    onClose: () => void;
}

export const EngagementModal: React.FC<EngagementModalProps> = ({ post, type, platform, connectionDetails, onClose }) => {
    const [data, setData] = useState<(Comment[] | FacebookUser[])>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // For comments logic
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [smartReplies, setSmartReplies] = useState<SmartReplySuggestion[]>([]);
    const [isLoadingReplies, setIsLoadingReplies] = useState(false);
    const [replySuggestionsFor, setReplySuggestionsFor] = useState<string | null>(null);

    const pageAccessToken = connectionDetails.facebook?.pageAccessToken;
    const postIdForPlatform = platform === 'Instagram' ? post.platformPostIds?.Instagram : post.platformPostIds?.Facebook;

    const fetchData = useCallback(async () => {
        if (!pageAccessToken || !postIdForPlatform) {
            setError('Connection details are missing or this post is not on the selected platform.');
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            let result;
            if (type === 'comments') {
                result = await getComments(postIdForPlatform, pageAccessToken, platform);
            } else {
                result = await getLikes(postIdForPlatform, pageAccessToken);
            }
            setData(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : `Failed to load ${type}.`);
        } finally {
            setIsLoading(false);
        }
    }, [type, postIdForPlatform, pageAccessToken, platform]);

    useEffect(() => {
        if (type === 'likes' && platform === PlatformEnum.Instagram) {
            setError("Viewing the list of users who liked an Instagram post is not supported by the Instagram API.");
            setIsLoading(false);
        } else {
            fetchData();
        }
    }, [fetchData, type, platform]);

    const handleReplySubmit = async (commentId: string) => {
        if (!replyText.trim() || !pageAccessToken) return;
        setIsSubmitting(true);
        setError(null);
        try {
            await replyToComment(commentId, replyText, pageAccessToken, platform);
            setReplyText('');
            setReplyingTo(null);
            setReplySuggestionsFor(null);
            await fetchData(); // Refresh comments
        } catch(err) {
            setError(err instanceof Error ? err.message : 'Failed to post reply.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGetSmartReplies = async (comment: Comment) => {
        if (replySuggestionsFor === comment.id) { // Toggle off
            setReplySuggestionsFor(null);
            setSmartReplies([]);
            return;
        }
        setIsLoadingReplies(true);
        setReplySuggestionsFor(comment.id);
        setSmartReplies([]);
        setError(null);
        try {
            const suggestions = await generateCommentReply(comment.message);
            setSmartReplies(suggestions);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate smart replies.');
            setReplySuggestionsFor(null);
        } finally {
            setIsLoadingReplies(false);
        }
    };
    
    const platformConfig = {
        Facebook: { icon: <FacebookIcon className="w-5 h-5" />, name: "Facebook" },
        Instagram: { icon: <InstagramIcon className="w-5 h-5" />, name: "Instagram" },
        YouTube: { icon: null, name: "YouTube" },
    };

    const renderContent = () => {
        if (isLoading) return <div className="p-8 text-center"><LoadingSpinner size="h-10 w-10"/></div>;
        if (error) return <div className="p-4 text-center text-red-400">{error}</div>;
        if (data.length === 0) return <p className="p-8 text-center text-dark-text-secondary">No {type} on this post yet.</p>;

        if (type === 'likes') {
            const likes = data as FacebookUser[];
            return (
                <ul className="space-y-2">
                    {likes.map(user => (
                        <li key={user.id} className="flex items-center gap-3 p-2 bg-dark-bg rounded-md">
                            <img src={user.picture?.data.url} alt={user.name} className="w-8 h-8 rounded-full" />
                            <span className="text-sm font-medium text-dark-text">{user.name}</span>
                        </li>
                    ))}
                </ul>
            );
        }

        if (type === 'comments') {
            const comments = data as Comment[];
            return (
                <ul className="space-y-3">
                    {comments.map(comment => (
                         <li key={comment.id} className="bg-dark-bg p-3 rounded-lg">
                            <div className="flex items-start gap-3">
                               <img src={comment.from.picture?.data.url} alt={comment.from.name} className="w-8 h-8 rounded-full"/>
                               <div className="flex-1">
                                    <div className="flex justify-between items-center text-xs">
                                        <p className="font-bold text-white">{comment.from.name}</p>
                                        <p className="text-dark-text-secondary">{timeAgo(comment.created_time)}</p>
                                    </div>
                                    <p className="text-sm text-dark-text mt-1">{comment.message}</p>
                                    <div className="flex items-center gap-4 mt-2">
                                        <button onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)} className="text-xs text-brand-secondary hover:underline">
                                           {replyingTo === comment.id ? 'Cancel' : 'Reply'}
                                        </button>
                                        <button
                                            onClick={() => handleGetSmartReplies(comment)}
                                            disabled={isLoadingReplies && replySuggestionsFor === comment.id}
                                            className="flex items-center gap-1 text-xs text-purple-400 hover:underline disabled:opacity-50"
                                        >
                                            {isLoadingReplies && replySuggestionsFor === comment.id ? <LoadingSpinner size="h-3 w-3" /> : '✨'}
                                            <span>Smart Reply</span>
                                        </button>
                                    </div>
                               </div>
                            </div>
                            {replySuggestionsFor === comment.id && (
                                <div className="mt-2 pl-11">
                                    {isLoadingReplies && <div className="text-xs text-dark-text-secondary flex items-center gap-2"><LoadingSpinner size="h-3 w-3"/><span>Generating ideas...</span></div>}
                                    {!isLoadingReplies && smartReplies.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {smartReplies.map((reply, index) => {
                                                const style = sentimentStyles[reply.sentiment] || sentimentStyles.neutral;
                                                return (
                                                    <button
                                                        key={index}
                                                        onClick={() => {
                                                            setReplyingTo(comment.id);
                                                            setReplyText(reply.suggestedReply);
                                                        }}
                                                        className={`flex items-center gap-1.5 bg-dark-bg border text-xs px-2 py-1 rounded-full transition-colors ${style.classes}`}
                                                        title={`Sentiment: ${reply.sentiment}`}
                                                    >
                                                        <span>{style.icon}</span>
                                                        <span>{reply.suggestedReply}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                     {!isLoadingReplies && smartReplies.length === 0 && !error && (
                                        <p className="text-xs text-dark-text-secondary">No suggestions could be generated.</p>
                                    )}
                                </div>
                            )}
                            {replyingTo === comment.id && (
                                <div className="mt-2 pl-11">
                                    <textarea 
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        className="w-full bg-dark-card border border-dark-border rounded-md p-2 text-sm"
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
            );
        }
        return null;
    };


    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 animate-fade-in" onClick={onClose} role="dialog" aria-modal="true">
            <div className="bg-dark-card border border-dark-border rounded-lg shadow-xl text-white w-full max-w-lg m-4 transform transition-all flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-dark-border flex justify-between items-center">
                    <div className="flex items-center gap-2">
                         {platformConfig[platform].icon}
                         <h3 className="text-lg font-bold capitalize">{platformConfig[platform].name} {type}</h3>
                    </div>
                    <button onClick={onClose} className="text-dark-text-secondary hover:text-white text-2xl leading-none">&times;</button>
                </div>
                <div className="p-4 overflow-y-auto max-h-[60vh]">
                    {renderContent()}
                </div>
                <div className="p-3 bg-dark-bg/50 border-t border-dark-border text-right">
                    <button onClick={onClose} className="px-4 py-2 bg-dark-bg border border-dark-border rounded-md text-sm hover:border-brand-primary">Close</button>
                </div>
            </div>
        </div>
    );
};
