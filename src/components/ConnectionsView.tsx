

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ConnectionStatus, Platform } from '../types';
import { Platform as PlatformEnum } from '../types';
import { getConnections, disconnectPlatform, connectFacebook } from '../services/geminiService';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';
import { YoutubeIcon } from './icons/YoutubeIcon';

interface ConnectionsViewProps {
    connections: ConnectionStatus;
    setConnections: React.Dispatch<React.SetStateAction<ConnectionStatus>>;
    isFbSdkInitialized: boolean;
}

const platformConfig = {
    [PlatformEnum.Facebook]: { icon: <FacebookIcon className="w-8 h-8" />, color: "text-blue-500" },
    [PlatformEnum.Instagram]: { icon: <InstagramIcon className="w-8 h-8" />, color: "text-pink-500" },
    [PlatformEnum.YouTube]: { icon: <YoutubeIcon className="w-8 h-8" />, color: "text-red-600" },
};

const FacebookTroubleshooter: React.FC = () => (
    <div className="mt-8 p-6 bg-blue-900/30 rounded-lg border border-blue-600 text-sm text-blue-100 animate-fade-in">
        <h3 className="font-bold text-lg text-white mb-3">Facebook Connection Troubleshooter</h3>
        <p className="mb-4">
            If you encounter errors, please carefully check the following settings in your Facebook Developer account.
        </p>
        <ol className="list-decimal list-inside space-y-4">
            <li>
                <strong>Check Allowed Domains:</strong>
                <ul className="list-disc list-inside pl-5 mt-2 space-y-1 text-blue-200">
                    <li>Go to your Facebook App Dashboard at <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">developers.facebook.com/apps/</a>.</li>
                    <li>Navigate to <strong>Settings → Basic</strong>.</li>
                    <li>In the <strong>App Domains</strong> field, make sure your app's domain is listed (e.g., <code className="bg-dark-bg px-1 py-0.5 rounded text-white">social-media-new-omega.vercel.app</code>).</li>
                    <li>Navigate to <strong>Facebook Login → Settings</strong> (under "Products" in the left sidebar).</li>
                    <li>In <strong>Allowed Domains for the JavaScript SDK</strong>, ensure your full app URL is listed (e.g., <code className="bg-dark-bg px-1 py-0.5 rounded text-white">https://social-media-new-omega.vercel.app</code>). Note the required <strong>https://</strong> prefix.</li>
                </ul>
            </li>
            <li>
                <strong>Verify Permissions & App Type:</strong>
                 <ul className="list-disc list-inside pl-5 mt-2 space-y-1 text-blue-200">
                    <li>Ensure your app is of type <strong>Business</strong>. You can check this under <strong>App Settings → Basic → App Type</strong>.</li>
                    <li>This app requests the following permissions: <code className="bg-dark-bg px-1 py-0.5 rounded text-white">pages_show_list</code>, <code className="bg-dark-bg px-1 py-0.5 rounded text-white">pages_manage_posts</code>, <code className="bg-dark-bg px-1 py-0.5 rounded text-white">pages_read_engagement</code>, <code className="bg-dark-bg px-1 py-0.5 rounded text-white">instagram_basic</code>, and <code className="bg-dark-bg px-1 py-0.5 rounded text-white">instagram_manage_content_publish</code>.</li>
                    <li>Go to <strong>App Review → Permissions and Features</strong>. Search for these permissions. For an app "In Development", your account (as an Admin/Developer/Tester) should be able to grant them without a formal review.</li>
                 </ul>
            </li>
            <li>
                <strong>Check App Mode:</strong>
                 <ul className="list-disc list-inside pl-5 mt-2 space-y-1 text-blue-200">
                    <li>At the top of your App Dashboard, check the app's status toggle.</li>
                    <li>If it shows <strong>In Development</strong>, only App Admins, Developers, or Testers can connect. Ensure your Facebook account has one of these roles under the <strong>Roles → Roles</strong> section.</li>
                    <li>If it shows <strong>Live</strong>, the permissions mentioned above will require "Advanced Access", which must be granted through Facebook's App Review process.</li>
                </ul>
            </li>
        </ol>
    </div>
);


export const ConnectionsView: React.FC<ConnectionsViewProps> = ({ connections, setConnections, isFbSdkInitialized }) => {
    const [loadingPlatform, setLoadingPlatform] = useState<Platform | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showFbTroubleshooter, setShowFbTroubleshooter] = useState(false);
    const popupRef = useRef<Window | null>(null);
    const intervalRef = useRef<number | null>(null);

    const handleAuthMessage = useCallback(async (event: MessageEvent) => {
        // Basic security check for mock flow
        if (event.origin !== window.location.origin) return;

        const { type, success, platform } = event.data;

        if (type === 'oauth-complete') {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            if (popupRef.current) {
                popupRef.current.close();
            }
            
            if (success) {
                try {
                    const updatedConnections = await getConnections();
                    setConnections(updatedConnections);
                } catch (err: any) {
                    setError(`Failed to refresh connections after auth for ${platform}. Details: ${err.message}`);
                }
            } else {
                setError(`Authentication for ${platform} failed or was cancelled.`);
            }
            setLoadingPlatform(null);
        }
    }, [setConnections, setError, setLoadingPlatform]);

    useEffect(() => {
        // This listener handles the message from the MOCK auth popup window.
        window.addEventListener('message', handleAuthMessage);

        return () => {
            window.removeEventListener('message', handleAuthMessage);
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [handleAuthMessage]);

    const handleConnect = (platform: Platform) => {
        if (platform === PlatformEnum.Facebook) {
            // --- REAL Facebook Login using SDK ---
            if (!isFbSdkInitialized || !window.FB) {
                setError('Facebook integration is not available. Please ensure the VITE_FACEBOOK_APP_ID is correctly configured in your environment variables.');
                setShowFbTroubleshooter(true);
                return;
            }
    
            setLoadingPlatform(platform);
            setError(null);
            setShowFbTroubleshooter(false);
    
            function loginCallback(response: any) {
                console.log('FB.login callback triggered. Full response:', response);

                if (response.status === 'connected') {
                    console.log('Facebook status is "connected". Proceeding to connect backend.');
                    if (response.authResponse) {
                        const accessToken = response.authResponse.accessToken;
                        connectFacebook(accessToken)
                            .then(updatedConnections => {
                                setConnections(updatedConnections);
                                setError(null);
                                setShowFbTroubleshooter(false);
                            })
                            .catch((err: any) => {
                                 console.error(`Backend connection failed after successful FB login:`, err);
                                 setError(`Facebook login was successful, but the backend couldn't connect to the page. Error: ${err.message}. See troubleshooter below.`);
                                 setShowFbTroubleshooter(true);
                            })
                            .finally(() => {
                                setLoadingPlatform(null);
                            });
                    } else {
                        console.error('Facebook login status is "connected" but no authResponse was found.', response);
                        setError('Facebook login returned an inconsistent state. Please try again.');
                        setShowFbTroubleshooter(true);
                        setLoadingPlatform(null);
                    }
                } else {
                    console.error('Facebook login failed or was cancelled by the user. Status:', response.status);
                    let failureReason = "The user cancelled the login or did not fully authorize the application.";
                    if (response.status === 'not_authorized') {
                        failureReason = "The user has not authorized our app or has denied required permissions.";
                    }
                    setError(`Facebook login failed. Reason: ${failureReason} Please see the troubleshooter below for likely solutions.`);
                    setShowFbTroubleshooter(true);
                    setLoadingPlatform(null);
                }
            }

            const required_scope = 'public_profile,pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_manage_content_publish';
            console.log(`Requesting Facebook permissions with scope: ${required_scope}`);

            window.FB.login(loginCallback, {
                scope: required_scope,
                enable_profile_selector: true,
                auth_type: 'rerequest'
            });

        } else {
            // --- MOCK OAuth Flow for other platforms ---
            setError(null);
            setShowFbTroubleshooter(false);
            setLoadingPlatform(platform);
    
            const width = 600;
            const height = 700;
            const left = (window.screen.width / 2) - (width / 2);
            const top = (window.screen.height / 2) - (height / 2);
            const url = `/auth/${platform}/consent`;
    
            popupRef.current = window.open(url, 'oauth', `width=${width},height=${height},left=${left},top=${top}`);
            
            if (!popupRef.current) {
                setError("Popup was blocked. Please allow popups for this site.");
                setLoadingPlatform(null);
                return;
            }
    
            intervalRef.current = window.setInterval(() => {
                if (popupRef.current && popupRef.current.closed) {
                    if (intervalRef.current) clearInterval(intervalRef.current);
                    setLoadingPlatform(null);
                }
            }, 500);
        }
    };

    const handleDisconnect = async (platform: Platform) => {
        setLoadingPlatform(platform);
        setError(null);
        setShowFbTroubleshooter(false);
        try {
            if (platform === PlatformEnum.Facebook && isFbSdkInitialized && window.FB) {
                console.log("Forcing logout from Facebook to ensure a clean session...");
                await new Promise<void>(resolve => {
                    window.FB.logout(() => {
                        console.log('FB.logout() callback executed. Any cached session has been cleared.');
                        resolve();
                    });
                });
            }

            const updatedConnections = await disconnectPlatform(platform);
            setConnections(updatedConnections);

        } catch (err: any) {
            setError(`Failed to disconnect ${platform}: ${err.message}`);
        } finally {
            setLoadingPlatform(null);
        }
    };

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white">Manage Connections</h1>
                <p className="text-dark-text-secondary mt-1">Connect your social media accounts to publish content directly.</p>
            </div>

            {error && (
                 <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg relative mb-6" role="alert">
                    <strong className="font-bold">Error: </strong>
                    <span className="block sm:inline whitespace-pre-wrap">{error}</span>
                </div>
            )}

            <div className="bg-dark-card border border-dark-border rounded-lg">
                <ul className="divide-y divide-dark-border">
                    {Object.values(PlatformEnum).map(platform => {
                        const config = platformConfig[platform];
                        const isLoading = loadingPlatform === platform;

                        if (platform === PlatformEnum.Instagram) {
                            const isFbConnected = connections[PlatformEnum.Facebook];
                            const isIgConnected = connections[PlatformEnum.Instagram];
                             return (
                                <li key={platform} className="p-6 flex items-center justify-between">
                                    <div className="flex items-center">
                                        <div className={config.color}>{config.icon}</div>
                                        <div className="ml-4">
                                            <p className="text-lg font-bold text-white">{platform}</p>
                                            <p className={`text-sm ${isIgConnected ? 'text-green-400' : 'text-dark-text-secondary'}`}>
                                                {isIgConnected ? 'Connected' : 'Not Connected'}
                                            </p>
                                            {!isIgConnected && (
                                                <p className="text-xs text-amber-400 mt-1">
                                                    {isFbConnected 
                                                        ? 'No Instagram Business Account found for the connected Page.'
                                                        : 'Connect Facebook to link your Instagram account.'
                                                    }
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <span className="px-4 py-2 text-sm font-medium rounded-md text-dark-text-secondary bg-gray-900/80 border border-dark-border">
                                        Managed via Facebook
                                    </span>
                                </li>
                            );
                        }

                        // Logic for Facebook and YouTube
                        const isConnected = connections[platform];
                        const isFacebook = platform === PlatformEnum.Facebook;
                        const isConnectActionDisabled = isFacebook && !isConnected && !isFbSdkInitialized;

                        return (
                            <li key={platform} className="p-6 flex items-center justify-between">
                                <div className="flex items-center">
                                    <div className={config.color}>{config.icon}</div>
                                    <div className="ml-4">
                                        <p className="text-lg font-bold text-white">{platform}</p>
                                        <p className={`text-sm ${isConnected ? 'text-green-400' : 'text-dark-text-secondary'}`}>
                                            {isConnected ? 'Connected' : 'Not Connected'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => isConnected ? handleDisconnect(platform) : handleConnect(platform)}
                                    disabled={isLoading || isConnectActionDisabled}
                                    title={isConnectActionDisabled ? "Facebook connection is disabled. The VITE_FACEBOOK_APP_ID environment variable is not configured." : ""}
                                    className={`relative inline-flex items-center justify-center px-6 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-card transition-colors disabled:opacity-50 min-w-[130px]
                                        ${isConnected
                                            ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                                            : 'bg-brand-primary hover:bg-brand-secondary focus:ring-brand-primary'
                                        }`}
                                >
                                    {isLoading ? (
                                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                    ) : (isConnected ? 'Disconnect' : 'Connect')}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {showFbTroubleshooter ? (
                <FacebookTroubleshooter />
            ) : (
                <div className="mt-8 p-6 bg-dark-bg/50 rounded-lg border border-dark-border text-sm text-dark-text-secondary">
                    <h3 className="font-bold text-dark-text mb-2">Connecting to Facebook & Instagram</h3>
                    <p className="mb-3">
                       This application connects to the <strong className="text-white">"Nadanaloga-chennai"</strong> page and its linked Instagram Business Account. The mock flow is active for YouTube.
                    </p>
                    <ol className="list-decimal list-inside space-y-2 text-xs">
                        <li>
                            <strong>Click "Connect" for Facebook:</strong> A popup will ask you to log in and grant permissions.
                        </li>
                        <li>
                            <strong>Grant Permissions:</strong> You must approve permissions for both Facebook (<code className="text-white/80">pages_manage_posts</code>, etc.) and Instagram (<code className="text-white/80">instagram_basic</code>, <code className="text-white/80">instagram_manage_content_publish</code>).
                        </li>
                        <li>
                            <strong>Automatic Linking:</strong> The app will connect to the Facebook Page and automatically detect its linked Instagram Business Account.
                        </li>
                        <li>
                            <strong>Troubleshooting:</strong> If the connection fails, the troubleshooter guide will appear with detailed steps to resolve common issues.
                        </li>
                    </ol>
                </div>
            )}
        </div>
    );
};