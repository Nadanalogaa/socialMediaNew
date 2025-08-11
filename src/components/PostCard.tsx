


import React, { useState, useRef, useEffect } from 'react';
import type { Post } from '../types';
import { Platform } from '../types';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';
import { YoutubeIcon } from './icons/YoutubeIcon';
import { EditIcon } from './icons/EditIcon';
import { TrashIcon } from './icons/TrashIcon';
import { RefreshIcon } from './icons/RefreshIcon';
import { DotsVerticalIcon } from './icons/DotsVerticalIcon';

interface PostCardProps {
  post: Post;
  isSelected: boolean;
  isFacebookConnected: boolean;
  onSelect: (postId: string) => void;
  onDelete: (postId: string) => void;
  onEdit: (post: Post) => void;
  onRefreshInsights: (postId: string) => Promise<void>;
}

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

const ActionsDropdown: React.FC<{ post: Post; onDelete: () => void; onEdit: () => void; }> = ({ post, onDelete, onEdit }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [ref]);

    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setIsOpen(!isOpen)} className="p-1 rounded-full text-dark-text-secondary hover:bg-dark-bg hover:text-dark-text">
                <DotsVerticalIcon className="w-5 h-5" />
            </button>
            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-900 border border-dark-border rounded-md shadow-lg z-20 animate-fade-in-fast">
                    <div className="py-1">
                        <button onClick={() => { onEdit(); setIsOpen(false); }} className="w-full text-left flex items-center px-4 py-2 text-sm text-dark-text hover:bg-dark-card">
                            <EditIcon className="w-4 h-4 mr-3" />
                            Use as Template
                        </button>
                        <button onClick={() => { onDelete(); setIsOpen(false); }} className="w-full text-left flex items-center px-4 py-2 text-sm text-red-400 hover:bg-dark-card">
                            <TrashIcon className="w-4 h-4 mr-3" />
                            Delete
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export const PostCard: React.FC<PostCardProps> = ({ post, isSelected, isFacebookConnected, onSelect, onDelete, onEdit, onRefreshInsights }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    <div className={`bg-dark-card border rounded-lg overflow-hidden flex flex-col md:flex-row transition-colors ${isSelected ? 'border-brand-primary' : 'border-dark-border'}`}>
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
                <ActionsDropdown post={post} onEdit={() => onEdit(post)} onDelete={() => onDelete(post.id)} />
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