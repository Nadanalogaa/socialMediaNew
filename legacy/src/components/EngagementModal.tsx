import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { Post, ConnectionDetails, Comment, FacebookUser, SmartReplySuggestion, Platform, SmartBulkReply } from '../types';
import { Platform as PlatformEnum } from '../types';
import { getComments, getLikes, replyToComment, generateCommentReply, generateSmartBulkReplies, deleteComment } from '../services/geminiService';
import { timeAgo } from '../utils/time';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';
import { TrashIcon } from './icons/TrashIcon';

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
    isOwnComment: boolean;
    replyingTo: string | null;
    pageAccessToken: string;
    platform: Platform;
    connectionDetails: ConnectionDetails;
    onSelect: (commentId: string) => void;
    onToggleReply: (commentId: string) => void;
    onRefresh: () => void;
}

const CommentItem: React.FC<CommentItemProps> = ({ comment, level, isSelected, isOwnComment, replyingTo, pageAccessToken, platform, connectionDetails, onSelect, onToggleReply, onRefresh }) => {
    const [replyText, setReplyText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [smartReplies, setSmartReplies] = useState<SmartReplySuggestion[]>([]);
    const [isLoadingReplies, setIsLoadingReplies] = useState(false);
    const [replySuggestionsFor, setReplySuggestionsFor] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
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
    
    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to permanently delete this comment?')) {
            setIsDeleting(true);
            setError(null);
            try {
                await deleteComment(comment.id, pageAccessToken);
                onRefresh();
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to delete comment.');
                setIsDeleting(false); // Only set back on error to allow user retry
            }
        }
    }


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
    
    const canBeSelected = !(comment.comments && comment.comments.length > 0) && !isOwnComment;

    return (
        <li className={`bg-dark-bg p-3 rounded-lg ${level > 0 ? `ml-${level * 4}` : ''}`}>
            <div className="flex items-start gap-3">
               {!isOwnComment && (
                <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onSelect(comment.id)}
                        disabled={!canBeSelected}
                        title={!canBeSelected ? "This comment cannot be selected for bulk actions." : ""}
                        className="h-4 w-4 mt-2 rounded bg-dark-card border-dark-border text-brand-primary focus:ring-brand-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label={`Select comment from ${comment.from.name}`}
                    />
               )}
               {isOwnComment && <div className="w-4 h-4 mt-2 flex-shrink-0"></div>}
               <img src={comment.from.picture?.data.url || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.from.name)}&background=374151&color=e5e7eb&size=40`} alt={comment.from.name} className="w-8 h-8 rounded-full"/>
               <div className="flex-1">
                    <div className="flex justify-between items-center text-xs">
                        <p className={`font-bold ${isOwnComment ? 'text-brand-secondary' : 'text-white'}`}>{comment.from.name}</p>
                        <p className="text-dark-text-secondary">{timeAgo(comment.created_time)}</p>
                    </div>
                    <p className="text-sm text-dark-text mt-1 whitespace-pre-wrap">{comment.message}</p>
                    <div className="flex items-center gap-4 mt-2">
                        {!isOwnComment && (
                            <>
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
                            </>
                        )}
                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="text-xs text-red-400 hover:underline disabled:opacity-50"
                        >
                            {isDeleting ? <LoadingSpinner size="h-3 w-3"/> : <TrashIcon className="w-3 h-3 inline-block mr-1"/>}
                            <span>Delete</span>
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
            {error && <p className="text-xs text-red-400 mt-2 pl-16">{error}</p>}
             {comment.comments && comment.comments.length > 0 && (
                <ul className="mt-3 space-y-3 pl-6 border-l border-dark-border">
                    {comment.comments.map(reply => (
                        <CommentItem
                            key={reply.id}
                            comment={reply}
                            level={level + 1}
                            isOwnComment={
                                reply.from.name === connectionDetails.facebook?.pageName ||
                                reply.from.name === connectionDetails.instagram?.username
                            }
                            isSelected={false} // Replies cannot be selected
                            replyingTo={replyingTo}
                            pageAccessToken={pageAccessToken}
                            platform={platform}
                            connectionDetails={connectionDetails}
                            onSelect={() => {}} // No-op for replies
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
    const [pendingBulkReplies, setPendingBulkReplies] = useState<Map<string, string>>(new Map());
    const [isBulkReplying, setIsBulkReplying] = useState(false);
    const [isGeneratingBulkReply, setIsGeneratingBulkReply] = useState(false);
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
        setPendingBulkReplies(new Map()); // Clear generated replies if selection changes
    };
    
    const allCommentsMap = useMemo(() => {
        const map = new Map<string, { message: string; hasReplies: boolean; isOwnComment: boolean }>();
        const pageOwnerName = connectionDetails.facebook?.pageName;
        const pageOwnerUsername = connectionDetails.instagram?.username;

        const recurse = (comments: Comment[]) => {
            for (const comment of comments) {
                const hasReplies = !!(comment.comments && comment.comments.length > 0);
                const isOwnComment = comment.from.name === pageOwnerName || comment.from.name === pageOwnerUsername;
                map.set(comment.id, { message: comment.message, hasReplies, isOwnComment });
                if (comment.comments) {
                    recurse(comment.comments);
                }
            }
        }
        if (type === 'comments') recurse(data as Comment[]);
        return map;
    }, [data, type, connectionDetails]);
    
    const allSelectableCommentIds = useMemo(() => {
        return Array.from(allCommentsMap.entries())
            .filter(([, { hasReplies, isOwnComment }]) => !hasReplies && !isOwnComment)
            .map(([id]) => id);
    }, [allCommentsMap]);
    
    const handleSelectAllComments = () => {
        if (selectedComments.size === allSelectableCommentIds.length) {
            setSelectedComments(new Set());
        } else {
            setSelectedComments(new Set(allSelectableCommentIds));
        }
        setPendingBulkReplies(new Map()); // Clear generated replies if selection changes
    };
    
    const handleGenerateBulkReplies = async () => {
        if (selectedComments.size === 0) return;
        setIsGeneratingBulkReply(true);
        setError(null);
        setPendingBulkReplies(new Map());
        try {
            const commentsToProcess = Array.from(selectedComments)
                .map(id => {
                    const commentData = allCommentsMap.get(id);
                    return commentData ? { id, message: commentData.message } : null;
                })
                .filter((c): c is {id: string, message: string} => c !== null);

            if (commentsToProcess.length > 0) {
                const replies: SmartBulkReply[] = await generateSmartBulkReplies(commentsToProcess);
                setPendingBulkReplies(new Map(replies.map(r => [r.commentId, r.suggestedReply])));
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to generate smart replies.';
            setError(message);
        } finally {
            setIsGeneratingBulkReply(false);
        }
    };

    const handleSendBulkReplies = async () => {
        if (!pageAccessToken || pendingBulkReplies.size === 0) return;
        setIsBulkReplying(true);
        setError(null);
        setBulkReplyStatus({ success: 0, failed: 0 });

        const replyPromises = Array.from(pendingBulkReplies.entries()).map(([commentId, message]) => 
            replyToComment(commentId, message, pageAccessToken, platform)
                .then(() => {
                    setBulkReplyStatus(prev => ({ success: (prev?.success || 0) + 1, failed: prev?.failed || 0 }));
                    return { status: 'fulfilled' };
                })
                .catch(() => {
                    setBulkReplyStatus(prev => ({ success: prev?.success || 0, failed: (prev?.failed || 0) + 1 }));
                    return { status: 'rejected' };
                })
        );
        
        await Promise.all(replyPromises);
        
        setIsBulkReplying(false);
        setSelectedComments(new Set());
        setPendingBulkReplies(new Map());
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
        if (error && data.length === 0) return <div className="p-4 text-center text-red-400">{error}</div>;
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
            const pageOwnerName = connectionDetails.facebook?.pageName;
            const pageOwnerUsername = connectionDetails.instagram?.username;
            return (
                <>
                <div className="flex items-center gap-2 px-2 pb-2 border-b border-dark-border">
                    <input
                        type="checkbox"
                        id="select-all-comments"
                        checked={allSelectableCommentIds.length > 0 && selectedComments.size === allSelectableCommentIds.length}
                        onChange={handleSelectAllComments}
                        disabled={allSelectableCommentIds.length === 0}
                        className="h-4 w-4 rounded bg-dark-card border-dark-border text-brand-primary focus:ring-brand-primary"
                    />
                    <label htmlFor="select-all-comments" className="text-sm font-medium text-dark-text-secondary">Select All ({allSelectableCommentIds.length})</label>
                </div>
                <ul className="space-y-3 pt-2">
                    {comments.map(comment => (
                        <CommentItem
                            key={comment.id}
                            comment={comment}
                            level={0}
                            isSelected={selectedComments.has(comment.id)}
                            isOwnComment={comment.from.name === pageOwnerName || comment.from.name === pageOwnerUsername}
                            replyingTo={replyingTo}
                            pageAccessToken={pageAccessToken!}
                            platform={platform}
                            connectionDetails={connectionDetails}
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
                    {error && <p className="text-sm text-red-400 mb-2 text-center">{error}</p>}
                    {renderContent()}
                </div>
                {type === 'comments' && selectedComments.size > 0 && (
                     <div className="p-3 bg-dark-bg/80 border-t border-dark-border flex-shrink-0 backdrop-blur-sm space-y-2 animate-fade-in">
                        <div className="flex justify-between items-center">
                             <p className="text-sm font-bold text-white">Bulk Actions for {selectedComments.size} Comment(s)</p>
                              <button
                                onClick={handleGenerateBulkReplies}
                                disabled={isGeneratingBulkReply || selectedComments.size === 0 || isBulkReplying}
                                className="flex items-center justify-center gap-2 px-3 py-2 border border-transparent rounded-md shadow-sm text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
                            >
                                {isGeneratingBulkReply ? <LoadingSpinner size="h-4 w-4" /> : '✨'}
                                <span>Generate Smart Replies</span>
                            </button>
                        </div>

                        {pendingBulkReplies.size > 0 && (
                             <div className="space-y-3">
                                <div className="p-3 bg-dark-card rounded-md max-h-40 overflow-y-auto space-y-2">
                                     {Array.from(pendingBulkReplies.entries()).map(([commentId, reply]) => {
                                         const originalComment = allCommentsMap.get(commentId);
                                         return (
                                            <div key={commentId} className="text-xs border-b border-dark-border pb-1 last:border-b-0">
                                                <p className="text-dark-text-secondary">To: <span className="italic">"{originalComment?.message.substring(0, 30)}..."</span></p>
                                                <p className="text-dark-text font-medium pl-2">Reply: {reply}</p>
                                            </div>
                                         )
                                     })}
                                </div>

                                <div className="flex justify-end items-center gap-2">
                                    <div className="text-xs text-dark-text-secondary">
                                        {isBulkReplying && `Replying... ${bulkReplyStatus?.success || 0}/${pendingBulkReplies.size} sent.`}
                                        {bulkReplyStatus && !isBulkReplying && `Finished: ${bulkReplyStatus.success} succeeded, ${bulkReplyStatus.failed} failed.`}
                                    </div>
                                    <button
                                        onClick={handleSendBulkReplies}
                                        disabled={isBulkReplying}
                                        className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-brand-primary hover:bg-brand-secondary rounded-md disabled:bg-gray-500 disabled:cursor-not-allowed"
                                    >
                                        {isBulkReplying ? <LoadingSpinner size="h-4 w-4"/> : `Send All Replies`}
                                    </button>
                                </div>
                             </div>
                        )}
                     </div>
                )}
                 <div className="p-3 bg-dark-bg/50 border-t border-dark-border text-right flex-shrink-0">
                    <button onClick={onClose} className="px-4 py-2 bg-dark-bg border border-dark-border rounded-md text-sm hover:border-brand-primary">Close</button>
                </div>
            </div>
        </div>
    );
};