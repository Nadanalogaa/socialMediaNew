import React, { useState, useCallback, useEffect, useMemo } from 'react';
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

interface CommentItemProps {
    comment: Comment;
    level: number;
    isSelected: boolean;
    replyingTo: string | null;
    pageAccessToken: string;
    platform: Platform;
    onSelect: (commentId: string) => void;
    onToggleReply: (commentId: string) => void;
    onRefresh: () => void;
}

const CommentItem: React.FC<CommentItemProps> = ({ comment, level, isSelected, replyingTo, pageAccessToken, platform, onSelect, onToggleReply, onRefresh }) => {
    const [replyText, setReplyText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [smartReplies, setSmartReplies] = useState<SmartReplySuggestion[]>([]);
    const [isLoadingReplies, setIsLoadingReplies] = useState(false);
    const [replySuggestionsFor, setReplySuggestionsFor] = useState<string | null>(null);
    const [error, setError] = useState<string|null>(null);

    const handleReplySubmit = async (commentId: string) => {
        if (!replyText.trim() || !pageAccessToken) return;
        setIsSubmitting(true);
        setError(null);
        try {
            await replyToComment(commentId, replyText, pageAccessToken, platform);
            setReplyText('');
            onToggleReply(commentId);
            onRefresh();
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

    return (
        <li className={`bg-dark-bg p-3 rounded-lg ${level > 0 ? `ml-${level * 4}` : ''}`}>
            <div className="flex items-start gap-3">
               <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onSelect(comment.id)}
                    className="h-4 w-4 mt-2 rounded bg-dark-card border-dark-border text-brand-primary focus:ring-brand-primary"
                    aria-label={`Select comment from ${comment.from.name}`}
                />
               <img src={comment.from.picture?.data.url} alt={comment.from.name} className="w-8 h-8 rounded-full"/>
               <div className="flex-1">
                    <div className="flex justify-between items-center text-xs">
                        <p className="font-bold text-white">{comment.from.name}</p>
                        <p className="text-dark-text-secondary">{timeAgo(comment.created_time)}</p>
                    </div>
                    <p className="text-sm text-dark-text mt-1">{comment.message}</p>
                    <div className="flex items-center gap-4 mt-2">
                        <button onClick={() => onToggleReply(comment.id)} className="text-xs text-brand-secondary hover:underline">
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
                <div className="mt-2 pl-16">
                    {isLoadingReplies && <div className="text-xs text-dark-text-secondary flex items-center gap-2"><LoadingSpinner size="h-3 w-3"/><span>Generating ideas...</span></div>}
                    {!isLoadingReplies && smartReplies.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {smartReplies.map((reply, index) => {
                                const style = sentimentStyles[reply.sentiment] || sentimentStyles.neutral;
                                return (
                                    <button
                                        key={index}
                                        onClick={() => {
                                            onToggleReply(comment.id);
                                            setReplyText(reply.suggestedReply);
                                        }}
                                        className={`flex items-center gap-1.5 bg-dark-card border text-xs px-2 py-1 rounded-full transition-colors ${style.classes}`}
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
                <div className="mt-2 pl-16">
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
             {comment.comments && comment.comments.length > 0 && (
                <ul className="mt-3 space-y-3 pl-6 border-l border-dark-border">
                    {comment.comments.map(reply => (
                        <CommentItem
                            key={reply.id}
                            comment={reply}
                            level={level + 1}
                            isSelected={isSelected}
                            replyingTo={replyingTo}
                            pageAccessToken={pageAccessToken}
                            platform={platform}
                            onSelect={onSelect}
                            onToggleReply={onToggleReply}
                            onRefresh={onRefresh}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
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
    const [selectedComments, setSelectedComments] = useState<Set<string>>(new Set());
    const [bulkReplyText, setBulkReplyText] = useState('');
    const [isBulkReplying, setIsBulkReplying] = useState(false);
    const [bulkReplyStatus, setBulkReplyStatus] = useState<{success: number, failed: number} | null>(null);

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

    const handleSelectComment = (commentId: string) => {
        setSelectedComments(prev => {
            const newSet = new Set(prev);
            if (newSet.has(commentId)) newSet.delete(commentId);
            else newSet.add(commentId);
            return newSet;
        });
    };
    
    const allCommentIds = useMemo(() => {
        const ids: string[] = [];
        const recurse = (comments: Comment[]) => {
            for (const comment of comments) {
                ids.push(comment.id);
                if (comment.comments) {
                    recurse(comment.comments);
                }
            }
        }
        if (type === 'comments') recurse(data as Comment[]);
        return ids;
    }, [data, type]);
    
    const handleSelectAllComments = () => {
        if (selectedComments.size === allCommentIds.length) {
            setSelectedComments(new Set());
        } else {
            setSelectedComments(new Set(allCommentIds));
        }
    };

    const handleBulkReply = async () => {
        if (!bulkReplyText.trim() || !pageAccessToken || selectedComments.size === 0) return;
        setIsBulkReplying(true);
        setError(null);
        setBulkReplyStatus({ success: 0, failed: 0 });

        const replies = Array.from(selectedComments).map(commentId => 
            replyToComment(commentId, bulkReplyText, pageAccessToken, platform)
                .then(() => {
                    setBulkReplyStatus(prev => ({ success: (prev?.success || 0) + 1, failed: prev?.failed || 0 }));
                    return { status: 'fulfilled' };
                })
                .catch(() => {
                    setBulkReplyStatus(prev => ({ success: prev?.success || 0, failed: (prev?.failed || 0) + 1 }));
                    return { status: 'rejected' };
                })
        );
        
        await Promise.all(replies);
        
        setIsBulkReplying(false);
        setSelectedComments(new Set());
        setBulkReplyText('');
        setTimeout(() => setBulkReplyStatus(null), 5000);
        await fetchData(); // Refresh comments
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
                <>
                <div className="flex items-center gap-2 px-2 pb-2 border-b border-dark-border">
                    <input
                        type="checkbox"
                        id="select-all-comments"
                        checked={allCommentIds.length > 0 && selectedComments.size === allCommentIds.length}
                        onChange={handleSelectAllComments}
                        className="h-4 w-4 rounded bg-dark-card border-dark-border text-brand-primary focus:ring-brand-primary"
                    />
                    <label htmlFor="select-all-comments" className="text-sm font-medium text-dark-text-secondary">Select All</label>
                </div>
                <ul className="space-y-3 pt-2">
                    {comments.map(comment => (
                        <CommentItem
                            key={comment.id}
                            comment={comment}
                            level={0}
                            isSelected={selectedComments.has(comment.id)}
                            replyingTo={replyingTo}
                            pageAccessToken={pageAccessToken!}
                            platform={platform}
                            onSelect={handleSelectComment}
                            onToggleReply={(id) => setReplyingTo(prev => (prev === id ? null : id))}
                            onRefresh={fetchData}
                        />
                    ))}
                </ul>
                </>
            );
        }
        return null;
    };


    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 animate-fade-in" onClick={onClose} role="dialog" aria-modal="true">
            <div className="bg-dark-card border border-dark-border rounded-lg shadow-xl text-white w-full max-w-2xl m-4 transform transition-all flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-dark-border flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-2">
                         {platformConfig[platform].icon}
                         <h3 className="text-lg font-bold capitalize">{platformConfig[platform].name} {type}</h3>
                    </div>
                    <button onClick={onClose} className="text-dark-text-secondary hover:text-white text-2xl leading-none">&times;</button>
                </div>
                <div className="p-4 overflow-y-auto min-h-[200px] max-h-[60vh] flex-grow">
                    {renderContent()}
                </div>
                {type === 'comments' && selectedComments.size > 0 && (
                     <div className="p-3 bg-dark-bg/80 border-t border-dark-border flex-shrink-0 backdrop-blur-sm space-y-2 animate-fade-in">
                        <p className="text-sm font-bold text-white">Bulk Reply to {selectedComments.size} Comment(s)</p>
                        <textarea 
                            value={bulkReplyText}
                            onChange={(e) => setBulkReplyText(e.target.value)}
                            className="w-full bg-dark-card border border-dark-border rounded-md p-2 text-sm"
                            placeholder="Write a single reply for all selected comments..."
                            rows={2}
                        />
                        <div className="flex justify-between items-center">
                            <div className="text-xs text-dark-text-secondary">
                                {isBulkReplying && `Replying... ${bulkReplyStatus?.success || 0}/${selectedComments.size} sent.`}
                                {bulkReplyStatus && !isBulkReplying && `Finished: ${bulkReplyStatus.success} succeeded, ${bulkReplyStatus.failed} failed.`}
                            </div>
                            <button
                                onClick={handleBulkReply}
                                disabled={isBulkReplying || !bulkReplyText.trim()}
                                className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-brand-primary hover:bg-brand-secondary rounded-md disabled:bg-gray-500 disabled:cursor-not-allowed"
                            >
                                {isBulkReplying ? <LoadingSpinner size="h-4 w-4"/> : `Send Reply`}
                            </button>
                        </div>
                     </div>
                )}
                 <div className="p-3 bg-dark-bg/50 border-t border-dark-border text-right flex-shrink-0">
                    <button onClick={onClose} className="px-4 py-2 bg-dark-bg border border-dark-border rounded-md text-sm hover:border-brand-primary">Close</button>
                </div>
            </div>
        </div>
    );
};