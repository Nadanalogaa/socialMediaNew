/// <reference lib="dom" />

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Post, ConnectionDetails, Comment, FacebookUser } from '../types';
import { Platform as PlatformEnum, type Platform } from '../types';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';
import { YoutubeIcon } from './icons/YoutubeIcon';
import { EditIcon } from './icons/EditIcon';
import { TrashIcon } from './icons/TrashIcon';
import { RefreshIcon } from './icons/RefreshIcon';
import { DotsVerticalIcon } from './icons/DotsVerticalIcon';
import { timeAgo } from '../utils/time';
import { getComments, getLikes, replyToComment } from '../services/geminiService';

interface PostCardProps {
  post: Post;
  isSelected: boolean;
  connectionDetails: ConnectionDetails;
  isDeleting: boolean;
  onSelect: (postId: string) => void;
  onDelete: (postId: string) => Promise<void>;
  onEdit: (post: Post) => void; // For "Use as Template"
  onRefreshInsights: (postId: string) => Promise<void>;
}

const LoadingSpinner: React.FC<{ size?: string }> = ({ size = 'h-8 w-8' }) => (
    <svg className={`animate-spin ${size} text-white`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
);


interface EngagementModalProps {
    post: Post;
    type: 'likes' | 'comments';
    platform: Platform;
    connectionDetails: ConnectionDetails;
    onClose: () => void;
}

const EngagementModal: React.FC<EngagementModalProps> = ({ post, type, platform, connectionDetails, onClose }) => {
    const [data, setData] = useState<(Comment[] | FacebookUser[])>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // For comments logic
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

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
            await fetchData(); // Refresh comments
        } catch(err) {
            setError(err instanceof Error ? err.message : 'Failed to post reply.');
        } finally {
            setIsSubmitting(false);
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


const PlatformIcons: React.FC<{ platforms: Platform[] }> = ({ platforms }) => (
    <div className="flex space-x-2">
        {platforms.includes(PlatformEnum.Facebook) && <FacebookIcon className="w-5 h-5 text-blue-500" />}
        {platforms.includes(PlatformEnum.Instagram) && <InstagramIcon className="w-5 h-5 text-pink-500" />}
        {platforms.includes(PlatformEnum.YouTube) && <YoutubeIcon className="w-5 h-5 text-red-600" />}
    </div>
);

export const PostCard: React.FC<PostCardProps> = ({ post, isSelected, connectionDetails, isDeleting, onSelect, onDelete, onEdit, onRefreshInsights }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [modalConfig, setModalConfig] = useState<{type: 'likes' | 'comments', platform: Platform} | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isFacebookConnected = !!connectionDetails.facebook;
  const isDeletedOnPlatform = post.status === 'deleted-on-platform';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
            setIsMenuOpen(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuRef]);

  const handleDeleteClick = async () => {
    // If it's already marked as deleted, just remove it from the dashboard without platform deletion logic.
    if (isDeletedOnPlatform) {
        await onDelete(post.id);
        return;
    }

    const onFacebook = post.platforms.includes(PlatformEnum.Facebook);
    const onInstagram = post.platforms.includes(PlatformEnum.Instagram);

    let confirmMessage = 'Are you sure you want to delete this post? This will permanently remove it from your dashboard.';

    if (onInstagram) {
        confirmMessage += '\n\nNOTE: This will also attempt to delete the post from Facebook. However, due to Instagram API limitations, you must manually delete the post from the Instagram app itself.';
    } else if (onFacebook) {
        confirmMessage += '\n\nThis action will also permanently delete the post from your Facebook Page.';
    }

    const confirmDelete = window.confirm(confirmMessage);
    if (confirmDelete) {
      await onDelete(post.id);
    }
  };

  const handleRefresh = async () => {
    // Only allow refresh for posts with a real FB id, not mock ones.
    if (!isFacebookConnected || post.id.startsWith('post_') || isDeletedOnPlatform) return;
    setIsRefreshing(true);
    try {
        await onRefreshInsights(post.id);
    } catch (e) {
        // Error is handled in DashboardView, so we just stop loading here
    } finally {
        setIsRefreshing(false);
    }
  }
  
  // Defensive coding: Correct the image URL if it's a video post with a video URL in the imageUrl field.
  // This handles legacy data that might be stored in the user's IndexedDB.
  let displayImageUrl = post.imageUrl;
  if (post.mediaType === 'VIDEO' && post.imageUrl && !/\.(jpe?g|png|gif|webp)$/i.test(post.imageUrl)) {
      displayImageUrl = post.imageUrl
        .replace('/upload/', '/upload/w_400,h_300,c_pad,b_black,so_0/')
        .replace(/\.(mp4|mov|avi|wmv|flv|webm|mkv)$/i, '.jpg');
  }
  
  const mainContent = post.generatedContent.facebook || post.generatedContent.instagram || post.generatedContent.youtubeTitle || "No content available.";

  const EngagementDisplay: React.FC<{ post: Post }> = ({ post }) => {
    const fbEngagement = post.engagement?.facebook;
    const igEngagement = post.engagement?.instagram;
    const isPostInteractive = !post.id.startsWith('post_') && isFacebookConnected && !isDeletedOnPlatform;

    const handleInteractionClick = (type: 'likes' | 'comments', platform: Platform) => {
        if (!isPostInteractive) return;
        setModalConfig({ type, platform });
    };

    if (!fbEngagement && !igEngagement) {
        return (
             <div className="text-xs text-dark-text-secondary flex items-center gap-3">
                <span>❤️ {post.engagement?.total?.likes || 0}</span>
                <span>💬 {post.engagement?.total?.comments || 0}</span>
                <span>🔁 {post.engagement?.total?.shares || 0}</span>
            </div>
        );
    }
    
    const buttonClasses = isPostInteractive ? "cursor-pointer hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-70" : "cursor-default";
    
    return (
        <div className="space-y-2 text-xs text-dark-text-secondary">
            {fbEngagement && (
                <div className="flex items-center gap-2">
                    <FacebookIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <div className="flex items-center gap-3 flex-wrap">
                        <button title={isPostInteractive ? `View Facebook likes` : `Connect Facebook to view likes`} disabled={!isPostInteractive} onClick={() => handleInteractionClick('likes', PlatformEnum.Facebook)} className={buttonClasses}>
                            <span className="font-sans">❤️</span> {fbEngagement.likes}
                        </button>
                        <button title={isPostInteractive ? `View Facebook comments` : `Connect Facebook to view comments`} disabled={!isPostInteractive} onClick={() => handleInteractionClick('comments', PlatformEnum.Facebook)} className={buttonClasses}>
                            <span className="font-sans">💬</span> {fbEngagement.comments}
                        </button>
                        <span><span className="font-sans">🔁</span> {fbEngagement.shares}</span>
                    </div>
                </div>
            )}
            {igEngagement && (
                <div className="flex items-center gap-2">
                    <InstagramIcon className="w-4 h-4 text-pink-500 flex-shrink-0" />
                    <div className="flex items-center gap-3 flex-wrap">
                        <button title={isPostInteractive ? `View Instagram likes` : `Connect Facebook to view likes`} disabled={!isPostInteractive} onClick={() => handleInteractionClick('likes', PlatformEnum.Instagram)} className={buttonClasses}>
                             <span className="font-sans">❤️</span> {igEngagement.likes}
                        </button>
                        <button title={isPostInteractive ? `View Instagram comments` : `Connect Facebook to view comments`} disabled={!isPostInteractive} onClick={() => handleInteractionClick('comments', PlatformEnum.Instagram)} className={buttonClasses}>
                            <span className="font-sans">💬</span> {igEngagement.comments}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
  }

  const ActionsMenu = () => (
     <div className="relative" ref={menuRef}>
        <button
            onClick={() => setIsMenuOpen(prev => !prev)}
            className="p-1.5 rounded-full text-dark-text-secondary hover:bg-dark-bg hover:text-dark-text transition-colors"
            aria-label="Post options"
        >
            <DotsVerticalIcon className="w-5 h-5" />
        </button>
        {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-dark-card border border-dark-border rounded-md shadow-lg z-10 animate-fade-in">
                <button
                    onClick={() => { onEdit(post); setIsMenuOpen(false); }}
                    disabled={isDeletedOnPlatform}
                    className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-dark-text hover:bg-dark-bg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <EditIcon className="w-4 h-4" /> Use as Template
                </button>
                <button
                    onClick={() => { handleDeleteClick(); setIsMenuOpen(false); }}
                    className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-dark-bg"
                >
                    <TrashIcon className="w-4 h-4" /> {isDeletedOnPlatform ? "Remove" : "Delete"}
                </button>
            </div>
        )}
    </div>
  );

  return (
    <div className={`relative bg-dark-card border rounded-lg overflow-hidden transition-all duration-300 ${isSelected ? 'border-brand-primary' : 'border-dark-border'} ${isDeletedOnPlatform ? 'opacity-60' : ''}`}>
       {isDeletedOnPlatform && (
            <div className="absolute inset-0 bg-dark-card/90 backdrop-blur-sm flex flex-col items-center justify-center z-20 rounded-lg animate-fade-in text-center p-4">
                <svg className="h-10 w-10 text-yellow-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="mt-2 text-white font-semibold">Post Deleted from Platform</p>
                <p className="text-sm text-dark-text-secondary">This post could not be found online. You can remove it from your dashboard.</p>
            </div>
        )}
      {isDeleting && (
          <div className="absolute inset-0 bg-dark-card/80 backdrop-blur-sm flex flex-col items-center justify-center z-30 rounded-lg animate-fade-in">
              <LoadingSpinner />
              <p className="mt-4 text-white font-semibold">Deleting post...</p>
          </div>
        )}

      <div className="flex flex-col sm:flex-row">
        <div className="flex-shrink-0 p-3 flex items-start sm:items-center">
             <input
              type="checkbox"
              className="h-5 w-5 mt-1 sm:mt-0 rounded bg-dark-bg border-dark-border text-brand-primary focus:ring-brand-primary"
              checked={isSelected}
              onChange={() => onSelect(post.id)}
              aria-label={`Select post: ${post.prompt}`}
            />
        </div>

        <div className="sm:flex-1 sm:flex sm:min-w-0">
          {displayImageUrl && (
            <div className="px-3 sm:px-0 sm:w-32 flex-shrink-0 relative">
              <div className="w-full aspect-video sm:aspect-auto sm:h-full">
                <img
                  src={displayImageUrl}
                  alt="Post visual"
                  className="w-full h-full object-cover rounded-md sm:rounded-none"
                  onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.onerror = null; 
                      target.src = 'https://placehold.co/800x600/1f2937/9ca3af?text=Media+Not+Found';
                  }}
                />
                {post.mediaType === 'VIDEO' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white/80" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                    </div>
                )}
              </div>
            </div>
          )}

          <div className="p-3 flex flex-col flex-grow min-w-0">
            <div className="flex justify-between items-start mb-1">
                <div>
                     <PlatformIcons platforms={post.platforms} />
                     <p className="text-xs text-dark-text-secondary mt-1">Posted to <span className="font-semibold text-dark-text">{post.audience}</span> {timeAgo(post.postedAt)}</p>
                </div>
                <ActionsMenu />
            </div>
            
            <p className="text-xs text-dark-text-secondary italic mb-2 truncate">Prompt: "{post.prompt}"</p>

            <p className="text-dark-text text-sm mb-3 flex-grow break-words">{mainContent}</p>

            <div className="mt-auto pt-2 border-t border-dark-border">
                <div className="flex items-end justify-between">
                  <EngagementDisplay post={post} />
                  <div className="flex items-center">
                      <button 
                          onClick={handleRefresh} 
                          disabled={isRefreshing || !isFacebookConnected || post.id.startsWith('post_') || isDeletedOnPlatform}
                          title={isDeletedOnPlatform ? 'Post was deleted from the platform' : (post.id.startsWith('post_') ? 'Cannot refresh mock posts' : (!isFacebookConnected ? 'Connect Facebook to refresh insights' : 'Refresh insights'))}
                          className="flex items-center gap-2 text-xs text-dark-text-secondary hover:text-dark-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                          <RefreshIcon className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                          <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                      </button>
                   </div>
                </div>
            </div>
          </div>
        </div>
      </div>
      {modalConfig && (
        <EngagementModal
            post={post}
            type={modalConfig.type}
            platform={modalConfig.platform}
            connectionDetails={connectionDetails}
            onClose={() => setModalConfig(null)}
        />
      )}
    </div>
  );
};