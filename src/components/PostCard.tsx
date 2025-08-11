/// <reference lib="dom" />

import React, { useState } from 'react';
import type { Post } from '../types';
import { Platform } from '../types';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';
import { YoutubeIcon } from './icons/YoutubeIcon';
import { EditIcon } from './icons/EditIcon';
import { TrashIcon } from './icons/TrashIcon';
import { RefreshIcon } from './icons/RefreshIcon';

interface PostCardProps {
  post: Post;
  isSelected: boolean;
  isFacebookConnected: boolean;
  isDeleting: boolean;
  onSelect: (postId: string) => void;
  onDelete: (postId: string) => Promise<void>;
  onEdit: (post: Post) => void;
  onRefreshInsights: (postId: string) => Promise<void>;
}

const LoadingSpinner: React.FC<{ size?: string }> = ({ size = 'h-8 w-8' }) => (
    <svg className={`animate-spin ${size} text-white`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
);

const PlatformIcons: React.FC<{ platforms: Platform[] }> = ({ platforms }) => (
    <div className="flex space-x-2">
        {platforms.includes(Platform.Facebook) && <FacebookIcon className="w-5 h-5 text-blue-500" />}
        {platforms.includes(Platform.Instagram) && <InstagramIcon className="w-5 h-5 text-pink-500" />}
        {platforms.includes(Platform.YouTube) && <YoutubeIcon className="w-5 h-5 text-red-600" />}
    </div>
);

const timeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
}

export const PostCard: React.FC<PostCardProps> = ({ post, isSelected, isFacebookConnected, isDeleting, onSelect, onDelete, onEdit, onRefreshInsights }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleDeleteClick = async () => {
    const onFacebook = post.platforms.includes(Platform.Facebook);
    const onInstagram = post.platforms.includes(Platform.Instagram);

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
    if (!isFacebookConnected || post.id.startsWith('post_')) return;
    setIsRefreshing(true);
    try {
        await onRefreshInsights(post.id);
    } catch (e) {
        // Error is handled in DashboardView, so we just stop loading here
    } finally {
        setIsRefreshing(false);
    }
  }

  return (
    <div className={`relative bg-dark-card border rounded-lg overflow-hidden flex flex-col md:flex-row transition-colors ${isSelected ? 'border-brand-primary' : 'border-dark-border'}`}>
      {isDeleting && (
        <div className="absolute inset-0 bg-dark-card/80 backdrop-blur-sm flex flex-col items-center justify-center z-30 rounded-lg animate-fade-in">
            <LoadingSpinner />
            <p className="mt-4 text-white font-semibold">Deleting post...</p>
        </div>
      )}
      <div className="p-2 pl-4 flex items-center justify-center bg-dark-card md:bg-gray-900/50">
        <input
            type="checkbox"
            className="h-5 w-5 rounded bg-dark-bg border-dark-border text-brand-primary focus:ring-brand-primary"
            checked={isSelected}
            onChange={() => onSelect(post.id)}
            aria-label={`Select post: ${post.prompt}`}
        />
      </div>
      {post.imageUrl && (
        <div className="md:w-1/3">
          <img
            src={post.imageUrl}
            alt="Post visual"
            className="w-full h-48 md:h-full object-cover"
          />
        </div>
      )}
      <div className={`p-6 ${post.imageUrl ? 'md:w-2/3' : 'w-full'}`}>
        <div className="flex justify-between items-start mb-3">
            <div>
                 <p className="text-sm text-dark-text-secondary">Posted to <span className="font-semibold text-dark-text">{post.audience}</span></p>
                 <p className="text-xs text-dark-text-secondary">{timeAgo(post.postedAt)}</p>
            </div>
            <div className="flex items-center gap-4">
                <PlatformIcons platforms={post.platforms} />
                <div className="flex items-center gap-1 border-l border-dark-border pl-3 ml-1">
                    <button
                        onClick={() => onEdit(post)}
                        title="Use as Template"
                        className="p-2 rounded-full text-dark-text-secondary hover:bg-dark-bg hover:text-dark-text transition-colors"
                        aria-label="Use post as template"
                    >
                        <EditIcon className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleDeleteClick}
                        title="Delete Post"
                        className="p-2 rounded-full text-dark-text-secondary hover:bg-dark-bg hover:text-red-400 transition-colors"
                        aria-label="Delete post"
                    >
                        <TrashIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
        
        <p className="text-sm text-dark-text-secondary italic mb-4">Prompt: "{post.prompt}"</p>

        <div className="space-y-4 text-sm">
            {post.platforms.includes(Platform.Facebook) && post.generatedContent.facebook && (
                <div>
                    <h4 className="font-bold text-blue-400">Facebook Post</h4>
                    <p className="text-dark-text">{post.generatedContent.facebook}</p>
                </div>
            )}
            {post.platforms.includes(Platform.Instagram) && post.generatedContent.instagram && (
                <div>
                    <h4 className="font-bold text-pink-400">Instagram Caption</h4>
                    <p className="text-dark-text">{post.generatedContent.instagram}</p>
                </div>
            )}
            {post.platforms.includes(Platform.YouTube) && post.generatedContent.youtubeTitle && (
                 <div>
                    <h4 className="font-bold text-red-500">YouTube</h4>
                    <p className="text-dark-text font-semibold">{post.generatedContent.youtubeTitle}</p>
                    <p className="text-dark-text-secondary whitespace-pre-wrap">{post.generatedContent.youtubeDescription}</p>
                </div>
            )}
             {post.generatedContent.hashtags && post.generatedContent.hashtags.length > 0 && (
                 <p className="text-brand-secondary text-xs">
                    {post.generatedContent.hashtags.map(h => `#${h}`).join(' ')}
                 </p>
             )}
        </div>

        <div className="mt-6 pt-4 border-t border-dark-border flex items-center justify-between text-sm text-dark-text-secondary">
            <div className="flex space-x-6">
                <span>❤️ {post.engagement.likes} Likes</span>
                <span>💬 {post.engagement.comments} Comments</span>
                <span>🔁 {post.engagement.shares} Shares</span>
            </div>
             <button 
                onClick={handleRefresh} 
                disabled={isRefreshing || !isFacebookConnected || post.id.startsWith('post_')}
                title={post.id.startsWith('post_') ? 'Cannot refresh mock posts' : (!isFacebookConnected ? 'Connect Facebook to refresh insights' : 'Refresh insights')}
                className="flex items-center gap-2 text-xs text-dark-text-secondary hover:text-dark-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
             >
                <RefreshIcon className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
             </button>
        </div>
      </div>
    </div>
  );
};