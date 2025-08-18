
import React, { useState } from 'react';
import type { Post, ConnectionDetails } from '../types';
import { Platform } from '../types';
import { PostCard } from './PostCard';
import { AnalyticsChart } from './AnalyticsChart';
import { getPostInsights, updatePost } from '../services/geminiService';
import { TrashIcon } from './icons/TrashIcon';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';
import { YoutubeIcon } from './icons/YoutubeIcon';
import { AllPlatformsIcon } from './icons/AllPlatformsIcon';

interface DashboardViewProps {
  posts: Post[];
  connectionDetails: ConnectionDetails;
  onDeletePost: (postId: string) => Promise<void>;
  onDeletePosts: (postIds: string[]) => Promise<void>;
  onUpdatePostEngagement: (postId: string, engagement: { likes: number, comments: number, shares: number }) => void;
  onUpdatePostContent: (postId: string, newContent: Partial<Post['generatedContent']>) => void;
  onEditPost: (post: Post) => void;
  onMarkPostAsDeleted: (postId: string) => void;
  onError: (message: string | null) => void;
}

const LoadingSpinner: React.FC = () => (
    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
       <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
       <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
);

export const DashboardView: React.FC<DashboardViewProps> = ({ posts, connectionDetails, onDeletePost, onDeletePosts, onUpdatePostEngagement, onUpdatePostContent, onEditPost, onMarkPostAsDeleted, onError }) => {
  const [platformFilter, setPlatformFilter] = useState<Platform | 'All'>('All');
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [deletingPosts, setDeletingPosts] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const filteredPosts = posts.filter(post => {
    if (platformFilter === 'All') return true;
    return post.platforms.includes(platformFilter);
  });
  
  const totalLikes = filteredPosts.reduce((sum, post) => sum + post.engagement.likes, 0);
  const totalComments = filteredPosts.reduce((sum, post) => sum + post.engagement.comments, 0);
  const totalShares = filteredPosts.reduce((sum, post) => sum + post.engagement.shares, 0);

  const handleSelectPost = (postId: string) => {
    setSelectedPosts(prev => {
        const newSet = new Set(prev);
        if (newSet.has(postId)) {
            newSet.delete(postId);
        } else {
            newSet.add(postId);
        }
        return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedPosts.size === filteredPosts.length) {
        setSelectedPosts(new Set());
    } else {
        setSelectedPosts(new Set(filteredPosts.map(p => p.id)));
    }
  };
  
  const handleDeleteSelected = async () => {
    onError(null);
    setIsBulkDeleting(true);
    try {
        await onDeletePosts(Array.from(selectedPosts));
        setSelectedPosts(new Set());
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onError(message);
    } finally {
        setIsBulkDeleting(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
      setDeletingPosts(prev => new Set(prev).add(postId));
      onError(null);
      try {
          await onDeletePost(postId);
          // PostCard will be unmounted, no need to clear state here
      } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          onError(message);
          // If deletion failed, remove loading state from the specific post
          setDeletingPosts(prev => {
              const newSet = new Set(prev);
              newSet.delete(postId);
              return newSet;
          });
      }
  };
  
  const handleRefreshInsights = async (postId: string) => {
    if (!connectionDetails?.facebook?.pageAccessToken) {
        onError("Cannot refresh insights: Facebook not connected or token missing.");
        throw new Error("Facebook connection details not found.");
    }
    const postToRefresh = posts.find(p => p.id === postId);
    if (!postToRefresh) {
        const errorMessage = `Could not find post with ID ${postId} to refresh its insights.`;
        console.error(errorMessage);
        onError(errorMessage);
        throw new Error(errorMessage);
    }
    
    onError(null);
    try {
        const newEngagement = await getPostInsights(
            postToRefresh.platformPostIds?.Facebook, 
            postToRefresh.platformPostIds?.Instagram, 
            connectionDetails.facebook.pageAccessToken
        );
        onUpdatePostEngagement(postId, newEngagement);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("not found on the platform")) {
            console.warn(`Post ${postId} not found on platform. Marking as deleted.`);
            onMarkPostAsDeleted(postId);
        } else if (message.toLowerCase().includes('permission')) {
            const userFriendlyMessage = `Could not get insights due to missing permissions.\n\nPlease go to the 'Connections' page, 'Disconnect' Facebook, and then 'Connect' again to grant the required permissions (e.g., 'pages_read_engagement').`;
            onError(userFriendlyMessage);
        } else {
            console.error(`Failed to refresh insights for post ${postId}:`, message);
            onError(`Failed to refresh insights for post ${postId}: ${message}`);
        }
        throw err; // Re-throw to be caught in PostCard
    }
  };

  const handleUpdatePost = async (post: Post, newContent: Post['generatedContent']) => {
    if (!connectionDetails?.facebook?.pageAccessToken) {
        onError("Cannot update post: Facebook not connected or token missing.");
        throw new Error("Facebook connection details not found.");
    }
     if (post.id.startsWith('post_')) {
        onError("Cannot update mock posts on the platform.");
        throw new Error("Cannot update mock posts.");
    }
    onError(null);
    try {
        const fullMessage = `${newContent.facebook}\n\n${(newContent.hashtags || []).map(h => `#${h}`).join(' ')}`.trim();
        await updatePost(post.id, fullMessage, connectionDetails.facebook.pageAccessToken);
        onUpdatePostContent(post.id, newContent);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Failed to update post ${post.id}:`, message);
        onError(`Failed to update post: ${message}`);
        throw err;
    }
  };

  const filterOptions: { value: Platform | 'All'; label: string; icon: React.ReactNode }[] = [
    { value: 'All', label: 'All', icon: <AllPlatformsIcon className="w-5 h-5" /> },
    { value: Platform.Facebook, label: 'Facebook', icon: <FacebookIcon className="w-5 h-5" /> },
    { value: Platform.Instagram, label: 'Instagram', icon: <InstagramIcon className="w-5 h-5" /> },
    { value: Platform.YouTube, label: 'YouTube', icon: <YoutubeIcon className="w-5 h-5" /> },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-dark-text-secondary mt-1">
          Welcome back! Here's a summary of your recent activity.
        </p>
      </div>

      <div className="mb-6">
        <div className="flex items-center space-x-2 rounded-lg bg-dark-card p-1 border border-dark-border w-full md:w-auto">
          {filterOptions.map(option => (
            <button
              key={option.value}
              onClick={() => setPlatformFilter(option.value)}
              className={`flex items-center gap-2 w-full justify-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${platformFilter === option.value ? 'bg-brand-primary text-white' : 'text-dark-text-secondary hover:bg-dark-bg hover:text-dark-text'}`}
              aria-label={`Filter by ${option.label}`}
            >
              {option.icon}
              <span className="hidden sm:inline">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-dark-card p-6 rounded-lg border border-dark-border">
          <h3 className="text-dark-text-secondary text-sm font-medium">Total Likes</h3>
          <p className="text-3xl font-bold text-white mt-1">{totalLikes}</p>
        </div>
        <div className="bg-dark-card p-6 rounded-lg border border-dark-border">
          <h3 className="text-dark-text-secondary text-sm font-medium">Total Comments</h3>
          <p className="text-3xl font-bold text-white mt-1">{totalComments}</p>
        </div>
        <div className="bg-dark-card p-6 rounded-lg border border-dark-border">
          <h3 className="text-dark-text-secondary text-sm font-medium">Total Shares</h3>
          <p className="text-3xl font-bold text-white mt-1">{totalShares}</p>
        </div>
      </div>

      <div className="bg-dark-card p-6 rounded-lg border border-dark-border">
         <h2 className="text-xl font-bold text-white mb-4">Engagement Over Time</h2>
         <AnalyticsChart posts={filteredPosts} />
      </div>

      <div>
        <h2 className="text-2xl font-bold text-white mb-4">Post History</h2>
        {filteredPosts.length > 0 && (
             <div className="bg-dark-card p-3 rounded-lg border border-dark-border mb-4 flex items-center justify-between sticky top-4 z-10 backdrop-blur-sm bg-opacity-80">
                <div className="flex items-center gap-4">
                    <input
                        id="select-all"
                        type="checkbox"
                        className="h-5 w-5 rounded bg-dark-bg border-dark-border text-brand-primary focus:ring-brand-primary"
                        checked={filteredPosts.length > 0 && selectedPosts.size === filteredPosts.length}
                        onChange={handleSelectAll}
                        aria-label="Select all posts"
                    />
                    <label htmlFor="select-all" className="text-sm font-medium text-dark-text whitespace-nowrap">
                       {selectedPosts.size > 0 ? `${selectedPosts.size} selected` : "Select All"}
                    </label>
                </div>
                {selectedPosts.size > 0 && (
                    <button 
                      onClick={handleDeleteSelected} 
                      disabled={isBulkDeleting}
                      className="flex items-center justify-center gap-2 px-3 py-1.5 border border-red-500/50 text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-wait"
                    >
                        {isBulkDeleting ? <LoadingSpinner /> : <TrashIcon className="w-4 h-4" />}
                        {isBulkDeleting ? 'Deleting...' : 'Delete Selected'}
                    </button>
                )}
            </div>
        )}
        <div className="space-y-6">
          {filteredPosts.length > 0 ? (
            filteredPosts.map(post => 
                <PostCard 
                    key={post.id} 
                    post={post}
                    isSelected={selectedPosts.has(post.id)}
                    connectionDetails={connectionDetails}
                    onSelect={handleSelectPost}
                    onDelete={handleDeletePost}
                    onEdit={onEditPost}
                    onRefreshInsights={handleRefreshInsights}
                    onUpdatePost={handleUpdatePost}
                    isDeleting={deletingPosts.has(post.id)}
                />
            )
          ) : (
            <p className="text-dark-text-secondary text-center py-8">No posts found for this filter. Create one to get started!</p>
          )}
        </div>
      </div>
    </div>
  );
};
