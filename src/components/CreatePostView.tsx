

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Platform, Audience, Post, ConnectionStatus, MediaAsset } from '../types';
import { Platform as PlatformEnum, Audience as AudienceEnum } from '../types';
import { publishPost, generateAssetContent } from '../services/geminiService';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';
import { YoutubeIcon } from './icons/YoutubeIcon';

const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
});

interface CreatePostViewProps {
    connections: ConnectionStatus;
    onPostPublished: (post: Post) => void;
}

const LoadingSpinner: React.FC<{ size?: string }> = ({ size = 'h-5 w-5' }) => (
    <svg className={`animate-spin ${size} text-white`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
);

export const CreatePostView: React.FC<CreatePostViewProps> = ({ connections, onPostPublished }) => {
    const [assets, setAssets] = useState<MediaAsset[]>([]);
    const [audience, setAudience] = useState<Audience>(AudienceEnum.Global);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
    const [bulkProgress, setBulkProgress] = useState<{
        total: number;
        completed: number;
        action: 'generating' | 'publishing' | null;
        errorCount: number;
    }>({ total: 0, completed: 0, action: null, errorCount: 0 });

    const updateAsset = useCallback((id: string, updates: Partial<MediaAsset>) => {
        setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    }, []);

    const removeAsset = (assetId: string) => {
        setAssets(prev => prev.filter(a => a.id !== assetId));
        setSelectedAssetIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(assetId);
            return newSet;
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            const newAssets: MediaAsset[] = Array.from(files).map(file => ({
                id: `asset_${Date.now()}_${Math.random()}`,
                file,
                previewUrl: URL.createObjectURL(file),
                name: file.name.split('.').slice(0, -1).join('.').replace(/[\-_]/g, ' '),
                prompt: '',
                description: '',
                hashtags: [],
                platforms: [PlatformEnum.Facebook],
                status: 'idle',
            }));
            setAssets(prev => [...prev, ...newAssets]);
        }
        if (e.target) e.target.value = '';
    };
    
    const handleGenerateContent = useCallback(async (assetId: string) => {
        const asset = assets.find(a => a.id === assetId);
        if (!asset || !asset.prompt.trim()) {
            const errorMsg = 'Please enter a prompt.';
            updateAsset(assetId, { status: 'error', errorMessage: errorMsg });
            throw new Error(errorMsg);
        }
        
        updateAsset(assetId, { status: 'generating', errorMessage: undefined });
        
        try {
            const result = await generateAssetContent(asset.prompt);
            updateAsset(assetId, {
                name: result.name,
                description: result.description,
                hashtags: result.hashtags,
                status: 'idle',
            });
        } catch (err: any) {
            updateAsset(assetId, { status: 'error', errorMessage: err.message || 'Failed to generate content.' });
            throw err;
        }
    }, [assets, updateAsset]);

    const handlePublish = async (assetId: string): Promise<void> => {
        const asset = assets.find(a => a.id === assetId);
        if (!asset) throw new Error('Asset not found.');

        if (asset.platforms.length === 0) {
            const errorMsg = 'Please select at least one platform.'
            updateAsset(assetId, { status: 'error', errorMessage: errorMsg });
            throw new Error(errorMsg);
        }

        if (!asset.description || !asset.name) {
            const errorMsg = 'Please generate content (title and description) before publishing.'
            updateAsset(assetId, { status: 'error', errorMessage: errorMsg });
            throw new Error(errorMsg);
        }
        
        // Add client-side validation for Instagram dependency
        if (asset.platforms.includes(PlatformEnum.Instagram) && !asset.platforms.includes(PlatformEnum.Facebook)) {
            const errorMsg = 'To post on Instagram, Facebook must also be selected due to API requirements.';
            updateAsset(assetId, { status: 'error', errorMessage: errorMsg });
            throw new Error(errorMsg);
        }

        const unconnected = asset.platforms.filter(p => !connections[p]);
        if (unconnected.length > 0) {
            const errorMsg = `Please connect ${unconnected.join(', ')} first.`
            updateAsset(assetId, { status: 'error', errorMessage: errorMsg });
            throw new Error(errorMsg);
        }

        updateAsset(assetId, { status: 'publishing', errorMessage: undefined });
        
        try {
            const imageUrlData = await toBase64(asset.file);
            const postToCreate: Omit<Post, 'id' | 'engagement' | 'postedAt'> = {
                platforms: asset.platforms,
                audience,
                imageUrl: imageUrlData,
                prompt: asset.prompt,
                generatedContent: {
                    facebook: asset.description,
                    instagram: asset.description,
                    youtubeTitle: asset.name,
                    youtubeDescription: asset.description,
                    hashtags: asset.hashtags,
                }
            };
            const newPost = await publishPost(postToCreate);
            onPostPublished(newPost);
            updateAsset(assetId, { status: 'published' });
        } catch (err: any) {
            updateAsset(assetId, { status: 'error', errorMessage: err.message || 'Failed to publish.' });
            throw err;
        }
    };
    
    // --- Selection and Bulk Action Handlers ---
    const handleToggleSelection = (assetId: string) => {
        setSelectedAssetIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(assetId)) {
                newSet.delete(assetId);
            } else {
                newSet.add(assetId);
            }
            return newSet;
        });
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedAssetIds(new Set(assets.filter(a => a.status !== 'published').map(a => a.id)));
        } else {
            setSelectedAssetIds(new Set());
        }
    };

    const handleBulkGenerate = async () => {
        const assetsToGenerate = assets.filter(a => selectedAssetIds.has(a.id) && a.status !== 'generating');
        if (assetsToGenerate.length === 0) return;

        setBulkProgress({ total: assetsToGenerate.length, completed: 0, action: 'generating', errorCount: 0 });

        const promises = assetsToGenerate.map(asset => 
            handleGenerateContent(asset.id)
                .then(() => {
                    setBulkProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
                })
                .catch(() => {
                    setBulkProgress(prev => ({ ...prev, completed: prev.completed + 1, errorCount: prev.errorCount + 1 }));
                })
        );
        await Promise.all(promises);

        setTimeout(() => setBulkProgress({ total: 0, completed: 0, action: null, errorCount: 0 }), 2000);
    };

    const handleBulkPublish = async () => {
        const assetsToPublish = assets.filter(a => selectedAssetIds.has(a.id) && a.status !== 'publishing' && a.status !== 'published');
        if (assetsToPublish.length === 0) return;

        setBulkProgress({ total: assetsToPublish.length, completed: 0, action: 'publishing', errorCount: 0 });

        for (const asset of assetsToPublish) {
            try {
                await handlePublish(asset.id);
            } catch (error) {
                 updateAsset(asset.id, { status: 'error', errorMessage: (error as Error).message });
                 setBulkProgress(prev => ({ ...prev, errorCount: prev.errorCount + 1 }));
            } finally {
                setBulkProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
            }
        }
        
        setTimeout(() => {
            setBulkProgress({ total: 0, completed: 0, action: null, errorCount: 0 });
            // Cleanup: remove published assets and clear selection
            setAssets(prev => prev.filter(a => a.status !== 'published'));
            setSelectedAssetIds(new Set());
        }, 3000);
    };


    const togglePlatform = (assetId: string, platform: Platform) => {
        const asset = assets.find(a => a.id === assetId);
        if (!asset) return;
        
        const currentPlatforms = new Set(asset.platforms);
        if (currentPlatforms.has(platform)) {
            currentPlatforms.delete(platform);
        } else {
            currentPlatforms.add(platform);
        }
        updateAsset(assetId, { platforms: Array.from(currentPlatforms), status: 'idle', errorMessage: undefined });
    };
    
    return (
        <div className="max-w-7xl mx-auto animate-fade-in space-y-6 sm:space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white">Create Posts</h1>
                <p className="text-dark-text-secondary mt-1">Upload media, generate content with AI, and publish across your platforms.</p>
            </div>
            
            <div 
                className="relative block w-full border-2 border-dark-border border-dashed rounded-lg p-12 text-center hover:border-brand-primary transition-colors cursor-pointer bg-dark-card/50"
                onClick={() => fileInputRef.current?.click()}
            >
                <svg className="mx-auto h-12 w-12 text-dark-text-secondary" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true"><path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span className="mt-2 block text-sm font-semibold text-white">Upload Images or Videos</span>
                <span className="block text-xs text-dark-text-secondary">Drag and drop or click to select files</span>
                <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="sr-only" accept="image/*,video/*" />
            </div>

            {assets.length > 0 && (
                <div className="bg-dark-card p-4 rounded-lg border border-dark-border space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center space-x-3">
                            <input 
                                type="checkbox"
                                onChange={handleSelectAll}
                                checked={assets.length > 0 && selectedAssetIds.size === assets.filter(a => a.status !== 'published').length}
                                disabled={assets.length === 0}
                                className="h-5 w-5 rounded bg-dark-bg border-dark-border text-brand-primary focus:ring-brand-primary"
                            />
                            <label className="text-sm font-medium text-dark-text">
                                {selectedAssetIds.size} / {assets.length} selected
                            </label>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <button onClick={handleBulkGenerate} disabled={selectedAssetIds.size === 0 || bulkProgress.action !== null} className="w-full sm:w-auto flex-1 flex justify-center items-center gap-2 py-2 px-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand-primary hover:bg-brand-secondary disabled:bg-gray-500 disabled:cursor-not-allowed">
                                ✨ Generate Selected
                            </button>
                            <button onClick={handleBulkPublish} disabled={selectedAssetIds.size === 0 || bulkProgress.action !== null} className="w-full sm:w-auto flex-1 flex justify-center items-center gap-2 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed">
                                🚀 Publish Selected
                            </button>
                        </div>
                    </div>
                    
                    {bulkProgress.action && (
                        <div className="pt-2 space-y-2" aria-live="polite">
                            <div className="flex justify-between text-sm font-medium text-dark-text-secondary">
                                <span>{bulkProgress.action === 'generating' ? 'Generating Content...' : 'Publishing Posts...'}</span>
                                <span>{bulkProgress.completed} / {bulkProgress.total}</span>
                            </div>
                            <div className="w-full bg-dark-bg rounded-full h-2.5">
                                <div className="bg-brand-primary h-2.5 rounded-full transition-all duration-300" style={{ width: `${(bulkProgress.completed / bulkProgress.total) * 100}%` }}></div>
                            </div>
                            {bulkProgress.errorCount > 0 && <p className="text-xs text-red-400 text-right">{bulkProgress.errorCount} item(s) failed.</p>}
                        </div>
                    )}

                    <div>
                        <label htmlFor="audience" className="block text-sm font-medium text-dark-text-secondary mb-2">Global Target Audience</label>
                        <select id="audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience)} className="w-full md:w-1/3 bg-dark-bg border border-dark-border rounded-md p-2 focus:ring-brand-primary focus:border-brand-primary text-dark-text">
                            {Object.values(AudienceEnum).map(a => <option key={a}>{a}</option>)}
                        </select>
                    </div>
                </div>
            )}
            
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                {assets.map((asset) => {
                     const isWorking = asset.status === 'generating' || asset.status === 'publishing';
                     const isDone = asset.status === 'published';
                     return (
                        <div key={asset.id} className="relative">
                            {!isDone && (
                                <div className="absolute top-3 left-3 z-10">
                                    <input 
                                    type="checkbox"
                                    checked={selectedAssetIds.has(asset.id)}
                                    onChange={() => handleToggleSelection(asset.id)}
                                    className="h-6 w-6 rounded bg-dark-bg border-dark-border text-brand-primary focus:ring-brand-primary ring-offset-dark-card"
                                    />
                                </div>
                            )}
                            <div className={`bg-dark-card rounded-lg border flex flex-col transition-all duration-500 ${isDone ? 'border-green-500 opacity-60 scale-95' : 'border-dark-border'} ${selectedAssetIds.has(asset.id) ? 'border-brand-primary ring-2 ring-brand-primary' : ''}`}>
                                <div className="p-4 flex-grow space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-3">
                                            {asset.file.type.startsWith('image/') ? <img src={asset.previewUrl} alt="Preview" className="rounded-lg w-full object-cover aspect-video bg-dark-bg" /> : <video src={asset.previewUrl} controls className="rounded-lg w-full aspect-video bg-black"></video>}
                                            <textarea value={asset.prompt} onChange={e => updateAsset(asset.id, { prompt: e.target.value, status: 'idle' })} placeholder="e.g., A dancer in a dramatic pose" className="w-full bg-dark-bg border border-dark-border rounded-md p-2 text-sm focus:ring-brand-primary focus:border-brand-primary" rows={2}/>
                                        </div>
                                        <div className="space-y-3 flex flex-col">
                                            <div><label className="text-xs font-bold text-dark-text-secondary">Title</label><input type="text" value={asset.name} onChange={e => updateAsset(asset.id, { name: e.target.value })} className="w-full mt-1 bg-dark-bg border border-dark-border rounded-md p-2 text-sm" /></div>
                                            <div className="flex-grow"><label className="text-xs font-bold text-dark-text-secondary">Description</label><textarea rows={5} value={asset.description} onChange={e => updateAsset(asset.id, { description: e.target.value })} className="w-full mt-1 bg-dark-bg border border-dark-border rounded-md p-2 text-sm h-full"/></div>
                                            <div><label className="text-xs font-bold text-dark-text-secondary">Hashtags</label><input type="text" value={asset.hashtags.join(' ')} onChange={e => updateAsset(asset.id, { hashtags: e.target.value.split(' ').map(h => h.replace('#', '')) })} className="w-full mt-1 bg-dark-bg border border-dark-border rounded-md p-2 text-sm" placeholder="dance art inspiration"/></div>
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-dark-border space-y-3">
                                        <div>
                                            <label className="block text-xs font-medium text-dark-text-secondary mb-2">Select Platforms</label>
                                            <div className="flex flex-wrap gap-2">
                                                {Object.values(PlatformEnum).map(p => (<button key={p} onClick={() => togglePlatform(asset.id, p)} className={`flex items-center space-x-2 px-3 py-1.5 rounded-md border text-xs transition-all ${asset.platforms.includes(p) ? 'bg-brand-secondary border-brand-secondary text-white' : 'bg-dark-bg border-dark-border hover:border-brand-secondary'}`}>{p === PlatformEnum.Facebook && <FacebookIcon className="w-4 h-4" />}{p === PlatformEnum.Instagram && <InstagramIcon className="w-4 h-4" />}{p === PlatformEnum.YouTube && <YoutubeIcon className="w-4 h-4" />}<span>{p}</span></button>))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gray-900/50 p-3 flex items-center gap-3">
                                     <button onClick={() => handleGenerateContent(asset.id)} disabled={isWorking || isDone || !asset.prompt} className="flex-1 flex justify-center items-center py-2 px-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand-primary hover:bg-brand-secondary disabled:bg-gray-500 disabled:cursor-not-allowed">
                                        {asset.status === 'generating' ? <LoadingSpinner size="h-4 w-4" /> : '✨ Generate'}
                                    </button>
                                     <button onClick={() => handlePublish(asset.id)} disabled={isWorking || isDone || asset.platforms.length === 0 || !asset.description} className="flex-1 flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed">
                                        {asset.status === 'publishing' ? <LoadingSpinner size="h-4 w-4" /> : (isDone ? 'Published!' : '🚀 Publish')}
                                    </button>
                                    <button onClick={() => removeAsset(asset.id)} className="flex-shrink-0 px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 rounded-md disabled:opacity-50" aria-label="Remove asset" disabled={isWorking}>
                                        Remove
                                    </button>
                                </div>
                                {asset.status === 'error' && <div className="text-sm text-red-400 text-center bg-red-900/30 p-2">{asset.errorMessage}</div>}
                            </div>
                        </div>
                     );
                })}
            </div>
            {assets.length === 0 && (
                <div className="text-center text-dark-text-secondary py-16">
                    <p>Upload some media to get started!</p>
                </div>
            )}
        </div>
    );
};