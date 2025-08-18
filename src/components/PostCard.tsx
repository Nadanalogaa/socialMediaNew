
/// <reference lib="dom" />

import React, { useState } from 'react';
import type { Post, ConnectionDetails } from '../types';
import { Platform } from '../types';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';
import { YoutubeIcon } from './icons/YoutubeIcon';
import { EditIcon } from './icons/EditIcon';
import { TrashIcon } from './icons/TrashIcon';
import { RefreshIcon } from './icons/RefreshIcon';
import { PostManager } from './PostManager';
import { timeAgo } from '../utils/time';

interface PostCardProps {
  post: Post;
  isSelected: boolean;
  connectionDetails: ConnectionDetails;
  isDeleting: boolean;
  onSelect: (postId: string) => void;
  onDelete: (postId: string) => Promise<void>;
  onEdit: (post: Post) => void; // For "Use as Template"
  onRefreshInsights: (postId: string) => Promise<void>;
  onUpdatePost: (post: Post, newContent: Post['generatedContent']) => Promise<void>;
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

const EngagementDisplay: React.FC<{ post: Post }> = ({ post }) => {
    const availablePlatforms = [Platform.Facebook, Platform.Instagram].filter(p => post.platforms.includes(p)) as Platform[];
    
    // Default to the first available platform, or Facebook if none (edge case)
    const [activeTab, setActiveTab] = useState<Platform>(availablePlatforms[0] || Platform.Facebook);

    if (availablePlatforms.length === 0) {
        // For platforms like YouTube with no separate engagement view
        return (
            <div className="flex space-x-4 text-xs text-dark-text-secondary">
                <span>❤️ {post.engagement.total.likes} Likes</span>
                <span>💬 {post.engagement.total.comments} Comments</span>
                <span>🔁 {post.engagement.total.shares} Shares</span>
            </div>
        );
    }
    
    const engagementData = activeTab === Platform.Facebook ? post.engagement.facebook : post.engagement.instagram;

    return (
        <div className="text-sm">
            <div className="flex border-b border-dark-border mb-2">
                {availablePlatforms.map(p => (
                    <button 
                        key={p} 
                        onClick={() => setActiveTab(p)}
                        className={`px-3 py-1 text-xs font-medium -mb-px ${activeTab === p ? 'text-white border-b-2 border-brand-primary' : 'text-dark-text-secondary border-b-2 border-transparent hover:text-white'}`}
                    >
                        {p}
                    </button>
                ))}
            </div>
            {engagementData && (
                 <div className="flex space-x-4 text-xs text-dark-text-secondary">
                    <span>❤️ {engagementData.likes} Likes</span>
                    <span>💬 {engagementData.comments} Comments</span>
                    {activeTab === Platform.Facebook && <span>🔁 {engagementData.shares} Shares</span>}
                </div>
            )}
        </div>
    );
}


export const PostCard: React.FC<PostCardProps> = ({ post, isSelected, connectionDetails, isDeleting, onSelect, onDelete, onEdit, onRefreshInsights, onUpdatePost }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const isFacebookConnected = !!connectionDetails.facebook;
  const isDeletedOnPlatform = post.status === 'deleted-on-platform';


  const handleDeleteClick = async () => {
    // If it's already marked as deleted, just remove it from the dashboard without platform deletion logic.
    if (isDeletedOnPlatform) {
        await onDelete(post.id);
        return;
    }

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
      displayImageUrl = post.imageUrl.replace(/\.(mp4|mov|avi|wmv|flv|webm|mkv)$/i, '.jpg');
  }
  
  const mainContent = post.generatedContent.facebook || post.generatedContent.instagram || post.generatedContent.youtubeTitle || "No content available.";


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
      <div className="relative flex flex-col md:flex-row">
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
        {displayImageUrl && (
          <div className="md:w-48 md:flex-shrink-0 relative">
            <img
              src={displayImageUrl}
              alt="Post visual"
              className="w-full h-48 md:h-full object-cover"
              onError={(e) => {
                  // If even the corrected URL fails, show a placeholder
                  (e.target as HTMLImageElement).src = 'https://placehold.co/800x600/1f2937/9ca3af?text=Image+Not+Found';
              }}
            />
            {post.mediaType === 'VIDEO' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white/80" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                </div>
            )}
          </div>
        )}
        <div className={`p-4 flex flex-col flex-grow min-w-0`}>
          <div className="flex justify-between items-start mb-2">
              <div>
                   <p className="text-xs text-dark-text-secondary">Posted to <span className="font-semibold text-dark-text">{post.audience}</span> {timeAgo(post.postedAt)}</p>
              </div>
              <div className="flex items-center gap-1">
                  <PlatformIcons platforms={post.platforms} />
                  <div className="flex items-center gap-0 border-l border-dark-border pl-2 ml-2">
                      <button
                          onClick={() => onEdit(post)}
                          title="Use as Template"
                          disabled={isDeletedOnPlatform}
                          className="p-1.5 rounded-full text-dark-text-secondary hover:bg-dark-bg hover:text-dark-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label="Use post as template"
                      >
                          <EditIcon className="w-4 h-4" />
                      </button>
                      <button
                          onClick={handleDeleteClick}
                          title={isDeletedOnPlatform ? "Remove from Dashboard" : "Delete Post"}
                          className="p-1.5 rounded-full text-dark-text-secondary hover:bg-dark-bg hover:text-red-400 transition-colors"
                          aria-label={isDeletedOnPlatform ? "Remove post from dashboard" : "Delete post"}
                      >
                          <TrashIcon className="w-4 h-4" />
                      </button>
                  </div>
              </div>
          </div>
          
          <p className="text-sm text-dark-text-secondary italic mb-2 truncate">Prompt: "{post.prompt}"</p>

          <p className="text-dark-text text-sm mb-3 flex-grow">{mainContent}</p>

          <div className="mt-auto pt-3 border-t border-dark-border flex items-end justify-between">
              <EngagementDisplay post={post} />
              <div className="flex items-center gap-4">
                  <button 
                      onClick={handleRefresh} 
                      disabled={isRefreshing || !isFacebookConnected || post.id.startsWith('post_') || isDeletedOnPlatform}
                      title={isDeletedOnPlatform ? 'Post was deleted from the platform' : (post.id.startsWith('post_') ? 'Cannot refresh mock posts' : (!isFacebookConnected ? 'Connect Facebook to refresh insights' : 'Refresh insights'))}
                      className="flex items-center gap-2 text-xs text-dark-text-secondary hover:text-dark-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                      <RefreshIcon className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                      {isRefreshing ? 'Refreshing...' : 'Refresh'}
                  </button>
                   <button 
                      onClick={() => setIsExpanded(!isExpanded)}
                      disabled={post.id.startsWith('post_') || !isFacebookConnected || isDeletedOnPlatform}
                      title={isDeletedOnPlatform ? 'Post was deleted from the platform' : (post.id.startsWith('post_') ? 'Cannot manage mock posts' : (!isFacebookConnected ? 'Connect Facebook to manage post' : 'Manage post'))}
                      className="flex items-center gap-2 text-xs px-3 py-1 rounded bg-dark-bg border border-dark-border hover:border-brand-primary disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                     {isExpanded ? 'Close' : 'Manage'}
                   </button>
               </div>
          </div>
        </div>
      </div>
      {isExpanded && !post.id.startsWith('post_') && isFacebookConnected && !isDeletedOnPlatform && (
        <div className="bg-dark-bg/50 border-t border-dark-border animate-fade-in">
            <PostManager 
              post={post}
              connectionDetails={connectionDetails}
              onUpdatePost={onUpdatePost}
            />
        </div>
      )}
    </div>
  );
};
