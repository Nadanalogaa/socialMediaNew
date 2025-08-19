import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Post, ConnectionDetails, Platform as PlatformType } from '../types';
import { Platform } from '../types';
import { PostCard } from './PostCard';
import { AnalyticsChart } from './AnalyticsChart';
import { getPostInsights, fetchPlatformPosts } from '../services/geminiService';
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
  onUpdatePost: (postId: string, updates: Partial<Post>) => void;
  onEditPost: (post: Post) => void;
  onError: (message: string | null) => void;
}

const LoadingSpinner: React.FC = () => (
    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
       <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
       <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
);

export const DashboardView: React.FC<DashboardViewProps> = ({ posts, connectionDetails, onDeletePost, onDeletePosts, onUpdatePost, onEditPost, onError }) => {
    const [allPosts, setAllPosts] = useState<Post[]>([]);
    const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState<Set<string>>(new Set());
    const [activeFilter, setActiveFilter] = useState<PlatformType | 'All'>('All');
    const [isLoading, setIsLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [nextCursors, setNextCursors] = useState<{ facebook: string | null; instagram: string | null; } | null>(null);

    const observer = useRef<IntersectionObserver | null>(null);

    const loadMorePosts = useCallback(() => {
        if (!hasMore || isLoading || !connectionDetails.facebook) return;
        setIsLoading(true);
        fetchPlatformPosts(10, nextCursors, connectionDetails)
            .then(response => {
                setAllPosts(prev => {
                    const postMap = new Map(prev.map(p => [p.id, p]));
                    response.posts.forEach(p => postMap.set(p.id, p));
                    return Array.from(postMap.values()).sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
                });
                setNextCursors(response.nextCursors);
                setHasMore(!!(response.nextCursors?.facebook || response.nextCursors?.instagram));
            })
            .catch(err => {
                const message = err instanceof Error ? err.message : String(err);
                onError(`Failed to load more posts: ${message}`);
                setHasMore(false); // Stop trying if there's an error
            })
            .finally(() => setIsLoading(false));
    }, [hasMore, isLoading, nextCursors, connectionDetails, onError]);

    const lastPostElementRef = useCallback(node => {
        if (observer.current) observer.current.disconnect();
        if (isLoading) return;

        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                loadMorePosts();
            }
        });
        if (node) observer.current.observe(node);
    }, [isLoading, hasMore, loadMorePosts]);

    useEffect(() => {
        // This effect runs once to perform the initial fetch.
        const isConnected = !!connectionDetails.facebook;
        if (isConnected) {
            setAllPosts([]); // Clear previous posts when connection is established
            setIsLoading(true);
            setNextCursors(null);
            fetchPlatformPosts(10, null, connectionDetails)
                .then(response => {
                    // Combine fetched posts with local posts from props.
                    const uniquePosts = new Map<string, Post>();
                    posts.forEach(p => uniquePosts.set(p.id, p));
                    response.posts.forEach(p => uniquePosts.set(p.id, p));
                    const combined = Array.from(uniquePosts.values()).sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
                    setAllPosts(combined);
                    setNextCursors(response.nextCursors);
                    setHasMore(!!(response.nextCursors?.facebook || response.nextCursors?.instagram));
                })
                .catch(err => {
                    const message = err instanceof Error ? err.message : String(err);
                    onError(`Failed to fetch initial posts: ${message}`);
                    setAllPosts(posts); // Fallback to local posts
                })
                .finally(() => setIsLoading(false));
        } else {
            // Not connected, just show local posts.
            setAllPosts([...posts].sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()));
            setIsLoading(false);
            setHasMore(false);
        }
    }, [connectionDetails.facebook?.pageId]); // Re-fetch only when connection details *actually* change

    useEffect(() => {
        // This effect syncs changes from the `posts` prop (e.g., new local posts, or updates) into `allPosts`.
        const postMap = new Map(allPosts.map(p => [p.id, p]));
        let hasChanges = false;

        posts.forEach(p => {
            const existing = postMap.get(p.id);
            if (!existing || JSON.stringify(existing) !== JSON.stringify(p)) {
                postMap.set(p.id, p);
                hasChanges = true;
            }
        });

        const propPostIds = new Set(posts.map(p => p.id));
        allPosts.forEach(p => {
            if (!propPostIds.has(p.id)) {
                postMap.delete(p.id);
                hasChanges = true;
            }
        });
        
        if (hasChanges) {
            const combined = Array.from(postMap.values()).sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
            setAllPosts(combined);
        }
    }, [posts]);


    const handleSelectPost = (postId: string) => {
        setSelectedPosts(prev => {
            const newSet = new Set(prev);
            if (newSet.has(postId)) newSet.delete(postId);
            else newSet.add(postId);
            return newSet;
        });
    };

    const handleBulkDelete = async () => {
        const idsToDelete = Array.from(selectedPosts);
        if (idsToDelete.length === 0) return;
        if (window.confirm(`Are you sure you want to delete ${idsToDelete.length} selected post(s)? This action might be irreversible.`)) {
            setIsDeleting(new Set(idsToDelete));
            await onDeletePosts(idsToDelete);
            setSelectedPosts(new Set());
            setIsDeleting(new Set());
        }
    };

    const handleDelete = async (postId: string) => {
        setIsDeleting(new Set([postId]));
        await onDeletePost(postId);
        // State update will be handled by the useEffect watching `posts` prop
        setIsDeleting(new Set());
    };
    
    const handleRefreshInsights = useCallback(async (postId: string) => {
        const post = allPosts.find(p => p.id === postId);
        if (!post || !connectionDetails.facebook?.pageAccessToken) return;
        
        try {
            const result = await getPostInsights(post.platformPostIds?.Facebook, post.platformPostIds?.Instagram, connectionDetails.facebook.pageAccessToken);
            const updates: Partial<Post> = { engagement: result.engagement };
            if (result.status === 'deleted') {
                updates.status = 'deleted-on-platform';
            }
            onUpdatePost(postId, updates);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            onError(message);
        }
    }, [allPosts, connectionDetails, onUpdatePost, onError]);

    const filteredPosts = useMemo(() => {
        if (activeFilter === 'All') return allPosts;
        return allPosts.filter(p => p.platforms.includes(activeFilter));
    }, [allPosts, activeFilter]);

    const platformFilters: { name: PlatformType | 'All', icon: JSX.Element }[] = [
        { name: 'All', icon: <AllPlatformsIcon className="w-5 h-5" /> },
        { name: Platform.Facebook, icon: <FacebookIcon className="w-5 h-5" /> },
        { name: Platform.Instagram, icon: <InstagramIcon className="w-5 h-5" /> },
        { name: Platform.YouTube, icon: <YoutubeIcon className="w-5 h-5" /> },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Dashboard</h1>
                    <p className="text-dark-text-secondary mt-1">Overview of your social media performance.</p>
                </div>
                {selectedPosts.size > 0 && (
                     <button
                        onClick={handleBulkDelete}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isDeleting.size > 0}
                    >
                        <TrashIcon className="w-5 h-5" />
                        <span>Delete ({selectedPosts.size})</span>
                    </button>
                )}
            </div>

            <div className="bg-dark-card p-4 sm:p-6 rounded-lg border border-dark-border">
                <h2 className="text-xl font-bold text-white mb-4">Engagement Analytics</h2>
                {allPosts.length > 0 ? (
                    <AnalyticsChart posts={allPosts} />
                ) : (
                    <p className="text-dark-text-secondary text-center py-10">No post data to display.</p>
                )}
            </div>
            
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">Recent Posts</h2>
                    <div className="flex items-center p-1 bg-dark-card rounded-lg border border-dark-border">
                        {platformFilters.map(filter => (
                            <button
                                key={filter.name}
                                onClick={() => setActiveFilter(filter.name)}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeFilter === filter.name ? 'bg-brand-primary text-white' : 'text-dark-text-secondary hover:bg-dark-bg'}`}
                                aria-label={`Filter by ${filter.name}`}
                            >
                                {filter.icon}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredPosts.map((post, index) => (
                         <div key={post.id} ref={filteredPosts.length === index + 1 ? lastPostElementRef : null}>
                            <PostCard 
                                post={post}
                                isSelected={selectedPosts.has(post.id)}
                                connectionDetails={connectionDetails}
                                isDeleting={isDeleting.has(post.id)}
                                onSelect={handleSelectPost}
                                onDelete={handleDelete}
                                onEdit={onEditPost}
                                onRefreshInsights={handleRefreshInsights}
                            />
                        </div>
                    ))}
                </div>

                {isLoading && (
                    <div className="flex justify-center items-center p-8">
                        <LoadingSpinner />
                        <p className="ml-4 text-dark-text-secondary">Loading posts...</p>
                    </div>
                )}
                 {!isLoading && !hasMore && connectionDetails.facebook && (
                    <p className="text-center text-dark-text-secondary py-8">You've reached the end of your posts.</p>
                )}
                 {!isLoading && filteredPosts.length === 0 && (
                     <div className="text-center py-16 bg-dark-card rounded-lg border border-dark-border">
                        <p className="text-dark-text-secondary">No posts found.</p>
                        <p className="text-xs text-dark-text-secondary mt-1">
                            {connectionDetails.facebook ? "Try a different filter or create a new post." : "Connect a social media account to see your posts."}
                        </p>
                    </div>
                 )}
            </div>
        </div>
    );
};