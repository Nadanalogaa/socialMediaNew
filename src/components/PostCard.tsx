/// <reference lib="dom" />

import React, { useState, useCallback, useEffect, useRef, forwardRef, memo } from 'react';
import type { Post, ConnectionDetails } from '../types';
import { Platform as PlatformEnum, type Platform } from '../types';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';
import { TrashIcon } from './icons/TrashIcon';
import { RefreshIcon } from './icons/RefreshIcon';
import { DotsVerticalIcon } from './icons/DotsVerticalIcon';
import { HeartIcon } from './icons/HeartIcon';
import { CommentBubbleIcon } from './icons/CommentBubbleIcon';
import { ShareIcon } from './icons/ShareIcon';
import { timeAgo } from '../utils/time';
import { EngagementModal } from './EngagementModal';

interface PostCardProps {
  post: Post;
  isSelected: boolean;
  connectionDetails: ConnectionDetails;
  isDeleting: boolean;
  onSelect: (postId: string) => void;
  onDelete: (postId: string) => Promise<void>;
  onRefreshInsights: (postId: string) => Promise<void>;
}

const LoadingSpinner: React.FC<{ size?: string }> = ({ size = 'h-8 w-8' }) => (
    <svg className={`animate-spin ${size} text-white`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
);

const PostCardComponent = forwardRef<HTMLDivElement, PostCardProps>(({ post, isSelected, connectionDetails, isDeleting, onSelect, onDelete, onRefreshInsights }, ref) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [modalConfig, setModalConfig] = useState<{type: 'likes' | 'comments', platform: Platform} | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
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
    if (window.confirm(confirmMessage)) {
      await onDelete(post.id);
    }
  };

  const handleRefresh = async () => {
    if (!isFacebookConnected || post.id.startsWith('post_') || isDeletedOnPlatform) return;
    setIsRefreshing(true);
    try {
        await onRefreshInsights(post.id);
    } finally {
        setIsRefreshing(false);
    }
  }
  
  const handleShare = () => {
      const isFacebookPost = post.platforms.includes(PlatformEnum.Facebook) && !!post.permalinkUrl;
      if (isFacebookPost && post.permalinkUrl) {
          if (window.FB && window.FB.ui) {
              window.FB.ui({ method: 'share', href: post.permalinkUrl }, (response: any) => {
                  if (response && !response.error_message) console.log('Posting completed via FB.ui.');
                  else if (response && response.error_message) console.error('Error while posting via FB.ui:', response.error_message);
                  else console.log('Share dialog was closed.');
              });
          } else {
              window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(post.permalinkUrl)}`, '_blank', 'noopener,noreferrer');
          }
      }
  };

  const handleInteractionClick = (type: 'likes' | 'comments') => {
    const platform = post.platforms.includes(PlatformEnum.Instagram) ? PlatformEnum.Instagram : PlatformEnum.Facebook;
    setModalConfig({ type, platform });
  };

  let displayImageUrl = post.imageUrl;
  if (post.mediaType === 'VIDEO' && post.imageUrl && !/\.(jpe?g|png|gif|webp)$/i.test(post.imageUrl)) {
      displayImageUrl = post.imageUrl
        .replace('/upload/', '/upload/w_400,h_300,c_pad,b_black,so_0/')
        .replace(/\.(mp4|mov|avi|wmv|flv|webm|mkv)$/i, '.jpg');
  }
  
  const captionText = post.generatedContent.instagram || post.generatedContent.facebook || post.prompt || "No content available.";
  const authorName = post.platforms.includes(PlatformEnum.Instagram) ? post.username : connectionDetails.facebook?.pageName;
  const showMoreButton = captionText.length > 120;
  const displayedCaption = showMoreButton && !isCaptionExpanded ? captionText.substring(0, 120) : captionText;

  const ActionsMenu = () => (
      <div className="relative" ref={menuRef}>
          <button onClick={() => setIsMenuOpen(prev => !prev)} className="p-1.5 rounded-full text-dark-text hover:bg-dark-bg transition-colors" aria-label="Post options">
              <DotsVerticalIcon className="w-5 h-5" />
          </button>
          {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-dark-card border border-dark-border rounded-md shadow-lg z-10 animate-fade-in divide-y divide-dark-border">
                  <div className="py-1">
                      <button onClick={() => { handleRefresh(); setIsMenuOpen(false); }} disabled={isRefreshing || !isFacebookConnected || isDeletedOnPlatform} className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-dark-text hover:bg-dark-bg disabled:opacity-50 disabled:cursor-not-allowed">
                          <RefreshIcon className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh Insights
                      </button>
                  </div>
                  <div className="py-1">
                      <button onClick={() => { handleDeleteClick(); setIsMenuOpen(false); }} className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-dark-bg">
                          <TrashIcon className="w-4 h-4" /> {isDeletedOnPlatform ? "Remove" : "Delete"}
                      </button>
                  </div>
              </div>
          )}
      </div>
    );

  return (
    <>
      {modalConfig && (
        <EngagementModal 
            post={post}
            type={modalConfig.type}
            platform={modalConfig.platform}
            connectionDetails={connectionDetails}
            onClose={() => setModalConfig(null)}
        />
       )}
      <div ref={ref} className={`relative bg-dark-card border rounded-lg overflow-hidden transition-all duration-300 ${isSelected ? 'border-brand-primary ring-2 ring-brand-primary' : 'border-dark-border'} ${isDeletedOnPlatform ? 'opacity-60' : ''}`}>
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

        <div className="relative aspect-[4/5]">
            <img
              src={displayImageUrl}
              alt={post.prompt}
              className="w-full h-full object-cover"
              onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.onerror = null; 
                  target.src = 'https://placehold.co/400x500/1f2937/9ca3af?text=Media+Not+Found';
              }}
            />
            <div className="absolute top-3 left-3">
              <input
                type="checkbox"
                className="h-6 w-6 rounded-md bg-white/30 border-white/50 text-brand-primary focus:ring-brand-primary backdrop-blur-sm"
                checked={isSelected}
                onChange={() => onSelect(post.id)}
                aria-label={`Select post: ${post.prompt}`}
              />
            </div>
             {post.mediaType === 'VIDEO' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                    <button className="h-16 w-16 text-white/80 backdrop-blur-sm bg-black/40 rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                    </button>
                </div>
            )}
             <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/50 text-white p-1.5 rounded-lg text-xs backdrop-blur-sm">
                {post.platforms.includes(PlatformEnum.Instagram) && <InstagramIcon className="w-4 h-4" />}
                {post.platforms.includes(PlatformEnum.Facebook) && !post.platforms.includes(PlatformEnum.Instagram) && <FacebookIcon className="w-4 h-4" />}
                <span>{timeAgo(post.postedAt)}</span>
            </div>
        </div>

        <div className="p-4 text-white">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <button onClick={() => handleInteractionClick('likes')} className="text-white hover:text-gray-300" aria-label="View likes">
                        <HeartIcon className="w-7 h-7" />
                    </button>
                    <button onClick={() => handleInteractionClick('comments')} className="text-white hover:text-gray-300" aria-label="View comments">
                        <CommentBubbleIcon className="w-7 h-7" />
                    </button>
                    <button
                      onClick={handleShare}
                      disabled={!post.platforms.includes(PlatformEnum.Facebook) || !post.permalinkUrl}
                      title={!post.platforms.includes(PlatformEnum.Facebook) ? "Sharing is only available for Facebook posts." : "Share on Facebook"}
                      className="text-white hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Share post"
                    >
                        <ShareIcon className="w-7 h-7" />
                    </button>
                </div>
                <ActionsMenu />
            </div>

            <div className="mt-3">
                <p className="font-semibold text-sm text-dark-text">{post.engagement.total.likes.toLocaleString()} likes</p>
            </div>

            <div className="mt-2 text-sm text-dark-text">
                <p>
                    <span className="font-bold mr-1">{authorName}</span>
                    {displayedCaption}
                    {showMoreButton && (
                       <button onClick={(e) => { e.stopPropagation(); setIsCaptionExpanded(!isCaptionExpanded); }} className="text-dark-text-secondary ml-1 inline">
                         {isCaptionExpanded ? 'less' : '...more'}
                       </button>
                    )}
                </p>
            </div>

            {post.engagement.total.comments > 0 && (
                 <div className="mt-2">
                    <button onClick={() => handleInteractionClick('comments')} className="text-sm text-dark-text-secondary hover:text-dark-text">
                        View all {post.engagement.total.comments} comments
                    </button>
                </div>
            )}
        </div>
      </div>
    </>
  );
});

PostCardComponent.displayName = 'PostCard';

export const PostCard = memo(PostCardComponent);
