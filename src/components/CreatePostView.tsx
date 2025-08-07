import React, { useState, useCallback, useRef } from 'react';
import type { Platform, Audience, Post, ConnectionStatus, MediaAsset } from '../types';
import { Platform as PlatformEnum, Audience as AudienceEnum } from '../types';
import { publishPost, generateAssetContent } from '../services/geminiService';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';
import { YoutubeIcon } from './icons/YoutubeIcon';

interface CreatePostViewProps {
    connections: ConnectionStatus;
}

const LoadingSpinner: React.FC<{ size?: string }> = ({ size = 'h-5 w-5' }) => (
    <svg className={`animate-spin ${size} text-white`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

export const CreatePostView: React.FC<CreatePostViewProps> = ({ connections }) => {
    const [assets, setAssets] = useState<MediaAsset[]>([]);
    const [audience, setAudience] = useState<Audience>(AudienceEnum.Global);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const updateAsset = (id: string, updates: Partial<MediaAsset>) => {
        setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
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
        // Reset file input to allow uploading the same file again
        if (e.target) e.target.value = '';
    };
    
    const handleGenerateContent = useCallback(async (assetId: string) => {
        const asset = assets.find(a => a.id === assetId);
        if (!asset || !asset.prompt.trim()) {
            updateAsset(assetId, { status: 'error', errorMessage: 'Please enter a prompt.' });
            return;
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
        }
    }, [assets]);

    const handlePublish = async (assetId: string) => {
        const asset = assets.find(a => a.id === assetId);
        if (!asset) return;

        const unconnected = asset.platforms.filter(p => !connections[p]);
        if (unconnected.length > 0) {
            updateAsset(assetId, { status: 'error', errorMessage: `Please connect ${unconnected.join(', ')} first.`});
            return;
        }

        updateAsset(assetId, { status: 'publishing', errorMessage: undefined });

        const postToCreate: Omit<Post, 'id' | 'engagement' | 'postedAt'> = {
            platforms: asset.platforms,
            audience,
            imageUrl: asset.previewUrl, // In a real app, this would be an uploaded URL
            prompt: asset.prompt,
            generatedContent: {
                facebook: asset.description,
                instagram: asset.description,
                youtubeTitle: asset.name,
                youtubeDescription: asset.description,
                hashtags: asset.hashtags,
            }
        };

        try {
            await publishPost(postToCreate);
            updateAsset(assetId, { status: 'published' });
            setTimeout(() => {
                setAssets(prev => prev.filter(a => a.id !== assetId));
            }, 2000);
        } catch (err: any) {
            updateAsset(assetId, { status: 'error', errorMessage: err.message || 'Failed to publish.' });
        }
    };
    
    return (
        <div className="max-w-7xl mx-auto animate-fade-in space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white">Create Posts</h1>
                <p className="text-dark-text-secondary mt-1">Upload media, generate content with AI, and publish across your platforms.</p>
            </div>
            
            <div className="space-y-6">
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
                     <div className="bg-dark-card p-4 rounded-lg border border-dark-border">
                        <label htmlFor="audience" className="block text-sm font-medium text-dark-text-secondary mb-2">Global Target Audience for all Posts</label>
                        <select id="audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience)} className="w-full md:w-1/3 bg-dark-bg border border-dark-border rounded-md p-2 focus:ring-brand-primary focus:border-brand-primary text-dark-text">
                            {Object.values(AudienceEnum).map(a => <option key={a}>{a}</option>)}
                        </select>
                     </div>
                )}
            </div>
            
            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
            {assets.map((asset) => (
                <div key={asset.id} className={`bg-dark-card rounded-lg border flex flex-col transition-all duration-500 ${asset.status === 'published' ? 'border-green-500 opacity-50 scale-95' : 'border-dark-border'}`}>
                    <div className="p-4 flex-grow space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-3">
                                {asset.file.type.startsWith('image/') ? (
                                    <img src={asset.previewUrl} alt="Preview" className="rounded-lg w-full object-cover aspect-video bg-dark-bg" />
                                ) : (
                                    <video src={asset.previewUrl} controls className="rounded-lg w-full aspect-video bg-black"></video>
                                )}
                                <textarea value={asset.prompt} onChange={e => updateAsset(asset.id, { prompt: e.target.value, status: 'idle' })} placeholder="e.g., A dancer in a dramatic pose" className="w-full bg-dark-bg border border-dark-border rounded-md p-2 text-sm focus:ring-brand-primary focus:border-brand-primary" rows={2}/>
                                <button onClick={() => handleGenerateContent(asset.id)} disabled={asset.status === 'generating' || !asset.prompt} className="w-full flex justify-center items-center py-2 px-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand-primary hover:bg-brand-secondary disabled:bg-gray-500 disabled:cursor-not-allowed">
                                    {asset.status === 'generating' ? <LoadingSpinner /> : '✨ Generate AI Content'}
                                </button>
                            </div>

                            <div className="space-y-3 flex flex-col">
                                 <div>
                                    <label className="text-xs font-bold text-dark-text-secondary">Title</label>
                                    <input type="text" value={asset.name} onChange={e => updateAsset(asset.id, { name: e.target.value })} className="w-full mt-1 bg-dark-bg border border-dark-border rounded-md p-2 text-sm" />
                                 </div>
                                 <div className="flex-grow">
                                    <label className="text-xs font-bold text-dark-text-secondary">Description</label>
                                    <textarea rows={5} value={asset.description} onChange={e => updateAsset(asset.id, { description: e.target.value })} className="w-full mt-1 bg-dark-bg border border-dark-border rounded-md p-2 text-sm h-full"/>
                                 </div>
                                 <div>
                                    <label className="text-xs font-bold text-dark-text-secondary">Hashtags</label>
                                    <input type="text" value={asset.hashtags.join(' ')} onChange={e => updateAsset(asset.id, { hashtags: e.target.value.split(' ').map(h => h.replace('#', '')) })} className="w-full mt-1 bg-dark-bg border border-dark-border rounded-md p-2 text-sm" placeholder="dance art inspiration"/>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-dark-border space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-dark-text-secondary mb-2">Select Platforms</label>
                                <div className="flex flex-wrap gap-2">
                                    {Object.values(PlatformEnum).map(p => (
                                        <button key={p}
                                            onClick={() => {
                                                const newPlatforms = asset.platforms.includes(p) ? asset.platforms.filter(pf => pf !== p) : [...asset.platforms, p];
                                                updateAsset(asset.id, { platforms: newPlatforms, status: 'idle' });
                                            }}
                                            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md border text-xs transition-all ${asset.platforms.includes(p) ? 'bg-brand-secondary border-brand-secondary text-white' : 'bg-dark-bg border-dark-border hover:border-brand-secondary'}`}>
                                            {p === PlatformEnum.Facebook && <FacebookIcon className="w-4 h-4" />}
                                            {p === PlatformEnum.Instagram && <InstagramIcon className="w-4 h-4" />}
                                            {p === PlatformEnum.YouTube && <YoutubeIcon className="w-4 h-4" />}
                                            <span>{p}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                         </div>
                    </div>
                    <div className="bg-gray-900/50 p-3 flex items-center gap-4">
                         <button onClick={() => handlePublish(asset.id)} disabled={asset.status === 'publishing' || asset.platforms.length === 0 || asset.status === 'published'} className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed">
                             {asset.status === 'publishing' ? <LoadingSpinner /> : (asset.status === 'published' ? 'Published!' : 'Publish Asset')}
                         </button>
                         <button onClick={() => setAssets(p => p.filter(a => a.id !== asset.id))} className="text-red-400 hover:text-red-300 text-sm font-medium p-2" aria-label="Remove asset">
                             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                         </button>
                    </div>
                     {asset.status === 'error' && <div className="text-sm text-red-400 text-center bg-red-900/30 p-2">{asset.errorMessage}</div>}
                </div>
            ))}
            </div>
            {assets.length === 0 && (
                <div className="text-center text-dark-text-secondary py-16">
                    <p>Upload some media to get started!</p>
                </div>
            )}
        </div>
    );
};