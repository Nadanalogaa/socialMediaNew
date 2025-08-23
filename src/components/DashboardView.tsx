import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Post, ConnectionDetails, Platform as PlatformType, KpiData, TimeFilter } from '../types';
import { Platform } from '../types';
import { PostCard } from './PostCard';
import { AnalyticsChart } from './AnalyticsChart';
import { getPostInsights, fetchPlatformPosts, getKpis } from '../services/geminiService';
import { TrashIcon } from './icons/TrashIcon';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';
import { YoutubeIcon } from './icons/YoutubeIcon';
import { AllPlatformsIcon } from './icons/AllPlatformsIcon';
import { KpiCard } from './KpiCard';
import { HeartIcon } from './icons/HeartIcon';
import { CommentBubbleIcon } from './icons/CommentBubbleIcon';
import { ShareIcon } from './icons/ShareIcon';
import { UsersIcon } from './icons/UsersIcon';
import { SparklineChart } from './SparklineChart';

interface DashboardViewProps {
  posts: Post[];
  connectionDetails: ConnectionDetails;
  onDeletePost: (postId: string) => Promise<void>;
  onDeletePosts: (postIds: string[]) => Promise<void>;
  onUpdatePost: (postId: string, updates: Partial<Post>) => void;
  onError: (message: string | null) => void;
}

const LoadingSpinner: React.FC = () => (
    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
       <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
       <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
);

const timeFilters: { label: string; value: TimeFilter }[] = [
    { label: 'Today', value: 'daily' },
    { label: 'Last 7 Days', value: 'weekly' },
    { label: 'Last 30 Days', value: 'monthly' },
    { label: 'Last Year', value: 'yearly' },
];

const timeRangeFor = (f: TimeFilter) => {
    const now = new Date();
    const end = now;
    const start = new Date(now);
    if (f === 'daily') start.setHours(0, 0, 0, 0);
    else if (f === 'weekly') start.setDate(now.getDate() - 7);
    else if (f === 'monthly') start.setDate(now.getDate() - 30);
    else start.setFullYear(now.getFullYear() - 1);
    return { start, end, tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
};

export const DashboardView: React.FC<DashboardViewProps> = ({ posts, connectionDetails, onDeletePost, onDeletePosts, onUpdatePost, onError }) => {
    const [allPosts, setAllPosts] = useState<Post[]>([]);
    const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState<Set<string>>(new Set());
    const [activePlatformFilter, setActivePlatformFilter] = useState<PlatformType | 'All'>('All');
    const [activeTimeFilter, setActiveTimeFilter] = useState<TimeFilter>('monthly');
    const [isLoading, setIsLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [nextCursors, setNextCursors] = useState<{ facebook: string | null; instagram: string | null; } | null>(null);
    const [kpiData, setKpiData] = useState<KpiData | null>(null);
    const [isLoadingKpis, setIsLoadingKpis] = useState(true);

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
        const isConnected = !!connectionDetails.facebook;
        if (!isConnected) {
            setIsLoadingKpis(false);
            setKpiData(null);
            return;
        }
    
        setIsLoadingKpis(true);
        const range = timeRangeFor(activeTimeFilter);
        getKpis(connectionDetails, activeTimeFilter, range.tz)
            .then(setKpiData)
            .catch(err => {
                const message = err instanceof Error ? err.message : String(err);
                onError(`Failed to load follower data: ${message}`);
                setKpiData(null);
            })
            .finally(() => setIsLoadingKpis(false));
    }, [connectionDetails, activeTimeFilter, onError]);

    useEffect(() => {
        if (kpiData) {
            console.log('[KPI DATA]', JSON.stringify(kpiData, null, 2));
        }
    }, [kpiData]);


    useEffect(() => {
        const isConnected = !!connectionDetails.facebook;
        if (isConnected) {
            setAllPosts([]);
            setIsLoading(true);
            setNextCursors(null);
            fetchPlatformPosts(10, null, connectionDetails)
                .then(response => {
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
                    setAllPosts(posts);
                })
                .finally(() => setIsLoading(false));
        } else {
            setAllPosts([...posts].sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()));
            setIsLoading(false);
            setHasMore(false);
        }
    }, [connectionDetails.facebook?.pageId]);

    useEffect(() => {
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
            try {
                await onDeletePosts(idsToDelete);
                setSelectedPosts(new Set());
            } catch (error) {
                console.error("Bulk delete failed:", error);
            } finally {
                setIsDeleting(new Set());
            }
        }
    };

    const handleDelete = async (postId: string) => {
        setIsDeleting(prev => new Set(prev).add(postId));
        try {
            await onDeletePost(postId);
        } catch (error) {
             console.error(`Failed to delete post ${postId}:`, error);
        } finally {
            setIsDeleting(prev => {
                const newSet = new Set(prev);
                newSet.delete(postId);
                return newSet;
            });
        }
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

    const postsInTimeframe = useMemo(() => {
        const { start, end } = timeRangeFor(activeTimeFilter);
        return allPosts.filter(p => {
            const t = new Date(p.postedAt).getTime();
            return t >= start.getTime() && t <= end.getTime();
        });
    }, [allPosts, activeTimeFilter]);

    const displayedPosts = useMemo(() => {
        if (activePlatformFilter === 'All') return postsInTimeframe;
        return postsInTimeframe.filter(p => p.platforms.includes(activePlatformFilter));
    }, [postsInTimeframe, activePlatformFilter]);

    const aggregatedKpis = useMemo(() => {
        const isFb = activePlatformFilter === 'All' || activePlatformFilter === Platform.Facebook;
        const isIg = activePlatformFilter === 'All' || activePlatformFilter === Platform.Instagram;
    
        const followerDeltaForRange = (
            history: { value: number; end_time: string }[] | undefined,
            absoluteNow: number | null | undefined,
            start: Date,
            end: Date
          ) => {
            const series = [...(history || [])]
              .map(p => ({ t: new Date(p.end_time).getTime(), v: p.value }))
              .sort((a, b) => a.t - b.t);
      
            // Append "now" if today's point is missing
            if (typeof absoluteNow === 'number') {
              const last = series[series.length - 1];
              const todayUTC = new Date().toISOString().split('T')[0];
              const hasToday = last && new Date(last.t).toISOString().startsWith(todayUTC);
              if (!hasToday) series.push({ t: Date.now(), v: absoluteNow });
            }
      
            if (series.length === 0) {
              return { current: 0, startValue: 0, net: 0, data: [] };
            }
      
            const startMs = start.getTime();
            const endMs = end.getTime();
      
            const lastBeforeStartPoint = [...series].reverse().find(p => p.t < startMs);
            const lastBeforeStart = lastBeforeStartPoint?.v;
            
            const lastAtOrBeforeEndPoint = [...series].reverse().find(p => p.t <= endMs);
            const lastAtOrBeforeEnd = lastAtOrBeforeEndPoint?.v ?? (typeof absoluteNow === 'number' ? absoluteNow : 0);
      
            const startValue = lastBeforeStart ?? (series[0]?.v ?? lastAtOrBeforeEnd);
            const current = lastAtOrBeforeEnd;
            const net = current - startValue;
      
            let chartData = series
                .filter(d => d.t >= startMs && d.t <= endMs)
                .map(d => ({ name: new Date(d.t).toISOString(), value: d.v }));
      
            if (lastBeforeStartPoint && chartData.length > 0) {
                chartData.unshift({ name: new Date(lastBeforeStartPoint.t).toISOString(), value: lastBeforeStartPoint.v });
            }
      
            return { current, startValue, net, data: chartData };
        };
        
        const { start, end } = timeRangeFor(activeTimeFilter);

        const engagement = postsInTimeframe.reduce((acc, post) => {
            if (isFb && post.engagement.facebook) {
                acc.likes += post.engagement.facebook.likes;
                acc.comments += post.engagement.facebook.comments;
                acc.shares += post.engagement.facebook.shares;
            }
            if (isIg && post.engagement.instagram) {
                acc.likes += post.engagement.instagram.likes;
                acc.comments += post.engagement.instagram.comments;
            }
            return acc;
        }, { likes: 0, comments: 0, shares: 0 });
    
        const fbFollowers = isFb
            ? followerDeltaForRange(kpiData?.facebook?.followerHistory, kpiData?.facebook?.currentFollowers, start, end)
            : { current: 0, startValue: 0, net: 0, data: [] };
        const igFollowers = isIg
            ? followerDeltaForRange(kpiData?.instagram?.followerHistory, kpiData?.instagram?.currentFollowers, start, end)
            : { current: 0, startValue: 0, net: 0, data: [] };
        
        const totalStartFollowers = fbFollowers.startValue + igFollowers.startValue;
        const netFollowerChange = fbFollowers.net + igFollowers.net;
        const followerChangePercentage = totalStartFollowers > 0 
            ? ((netFollowerChange) / totalStartFollowers) * 100 
            : (netFollowerChange !== 0 ? undefined : 0);
    
        const combinedFollowerData = () => {
            const fbData = fbFollowers.data;
            const igData = igFollowers.data;
            if ((fbData.length + igData.length) === 0) return [];
            
            const dataMap = new Map<string, number>();
        
            const processData = (data: { name: string, value: number }[]) => {
                data.forEach(point => {
                    const dateKey = point.name.split('T')[0];
                    dataMap.set(dateKey, (dataMap.get(dateKey) || 0) + point.value);
                });
            };
            
            if (isFb) processData(fbData);
            if (isIg) processData(igData);
        
            const sortedData = Array.from(dataMap.entries())
                .map(([date, value]) => ({ name: date, value }))
                .sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime());
        
            return sortedData;
        };
    
        return {
            ...engagement,
            netFollowerChange,
            followerChangePercentage,
            followerChartData: combinedFollowerData()
        };
    }, [postsInTimeframe, activePlatformFilter, kpiData, activeTimeFilter]);


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

            <div className="bg-dark-card p-4 rounded-lg border border-dark-border flex flex-col md:flex-row items-center justify-between gap-4">
                 <div className="flex items-center p-1 bg-dark-bg rounded-lg border border-dark-border">
                    {timeFilters.map(filter => (
                        <button
                            key={filter.value}
                            onClick={() => setActiveTimeFilter(filter.value)}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTimeFilter === filter.value ? 'bg-brand-primary text-white' : 'text-dark-text-secondary hover:bg-dark-card'}`}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
                 <div className="flex items-center p-1 bg-dark-bg rounded-lg border border-dark-border">
                    {platformFilters.map(filter => (
                        <button
                            key={filter.name}
                            onClick={() => setActivePlatformFilter(filter.name)}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activePlatformFilter === filter.name ? 'bg-brand-primary text-white' : 'text-dark-text-secondary hover:bg-dark-card'}`}
                            aria-label={`Filter by ${filter.name}`}
                        >
                            {filter.icon}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard title="Follower Change" icon={<UsersIcon className="w-6 h-6"/>} value={aggregatedKpis.netFollowerChange} delta={aggregatedKpis.followerChangePercentage} isLoading={isLoadingKpis}>
                    {aggregatedKpis.followerChartData.length >= 1 && <SparklineChart data={aggregatedKpis.followerChartData} />}
                </KpiCard>
                <KpiCard title="Total Likes" icon={<HeartIcon className="w-6 h-6"/>} value={aggregatedKpis.likes} isLoading={isLoading} />
                <KpiCard title="Total Comments" icon={<CommentBubbleIcon className="w-6 h-6"/>} value={aggregatedKpis.comments} isLoading={isLoading} />
                <KpiCard title="Total Shares" icon={<ShareIcon className="w-6 h-6"/>} value={aggregatedKpis.shares} isLoading={isLoading} />
            </div>

            <div className="bg-dark-card p-4 sm:p-6 rounded-lg border border-dark-border">
                <h2 className="text-xl font-bold text-white mb-4">Engagement Analytics</h2>
                {postsInTimeframe.length > 0 ? (
                    <AnalyticsChart posts={postsInTimeframe} />
                ) : (
                    <p className="text-dark-text-secondary text-center py-10">No post data to display for the selected period.</p>
                )}
            </div>
            
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">Recent Posts</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {displayedPosts.map((post, index) => (
                         <div key={post.id} ref={displayedPosts.length === index + 1 ? lastPostElementRef : null}>
                            <PostCard 
                                post={post}
                                isSelected={selectedPosts.has(post.id)}
                                connectionDetails={connectionDetails}
                                isDeleting={isDeleting.has(post.id)}
                                onSelect={handleSelectPost}
                                onDelete={handleDelete}
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
                 {!isLoading && displayedPosts.length === 0 && (
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