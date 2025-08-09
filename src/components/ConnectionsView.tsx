

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
        <h3 className="font-bold text-lg text-white mb-3">Facebook & Instagram Connection Troubleshooter</h3>
        <p className="mb-4">
            An "Invalid Scopes" error or connection failure often indicates a misconfiguration in your Facebook Developer account. Please carefully check the following settings for your app.
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
                    <li>Ensure your app is of type <strong>Business</strong>. You can check this under <strong>App Settings → Basic → App Type</strong>. Other types may not support page management permissions.</li>
                    <li>This app requests these permissions: <code className="bg-dark-bg px-1 py-0.5 rounded text-white">pages_show_list</code>, <code className="bg-dark-bg px-1 py-0.5 rounded text-white">pages_manage_posts</code>, <code className="bg-dark-bg px-1 py-0.5 rounded text-white">pages_read_engagement</code>, <code className="bg-dark-bg px-1 py-0.5 rounded text-white">instagram_basic</code>, and <code className="bg-dark-bg px-1 py-0.5 rounded text-white">instagram_content_publish</code>.</li>
                    <li>Go to <strong>App Review → Permissions and Features</strong>. Search for these permissions. They should be available to your app. For an app "In Development", your account (as an Admin/Developer/Tester) should be able to grant them without a formal review.</li>
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
             <li>
                <strong>Examine Browser Console for Clues:</strong>
                 <ul className="list-disc list-inside pl-5 mt-2 space-y-1 text-blue-200">
                    <li>Open your browser's developer console (usually with the F12 key).</li>
                    <li>Click "Connect" again and watch the console for messages.</li>
                    <li>The console will log the full response from Facebook, which may contain a specific error like "URL Blocked" or details about the permission failure.</li>
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
        // This listener handles the message from the MOCK auth popup window (for YouTube).
        window.addEventListener('message', handleAuthMessage);

        return () => {
            window.removeEventListener('message', handleAuthMessage);
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [handleAuthMessage]);

    const handleConnect = (platform: Platform) => {
        if (platform === PlatformEnum.Facebook || platform === PlatformEnum.Instagram) {
            // --- REAL Facebook & Instagram Login using SDK ---
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
                        console.log('Access Token found:', accessToken.substring(0,15) + '...');

                        connectFacebook(accessToken)
                            .then(updatedConnections => {
                                setConnections(updatedConnections);
                                setError(null);
                                setShowFbTroubleshooter(false);
                            })
                            .catch((err: any) => {
                                 console.error(`Backend connection failed after successful FB login:`, err);
                                 setError(`Facebook login was successful, but the backend couldn't connect to the page or Instagram account. Error: ${err.message}. Please ensure you are an admin of the target page and its linked IG account.`);
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
                        failureReason = "The user is logged into Facebook, but has not authorized our app or has denied required permissions.";
                    } else if (response.status) {
                        failureReason = `Facebook status: ${response.status}. The login could not be completed.`;
                    }
                    setError(`Facebook login failed. Reason: ${failureReason} Please see the troubleshooter below for likely solutions.`);
                    setShowFbTroubleshooter(true);
                    setLoadingPlatform(null);
                }
            }

            const required_scope = 'public_profile,pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish';
            console.log(`Requesting Facebook permissions with scope: ${required_scope}`);

            window.FB.login(loginCallback, {
                scope: required_scope,
                enable_profile_selector: true,
                auth_type: 'rerequest'
            });

        } else {
            // --- MOCK OAuth Flow for other platforms (YouTube) ---
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
            if ((platform === PlatformEnum.Facebook || platform === PlatformEnum.Instagram) && isFbSdkInitialized && window.FB) {
                console.log("Forcing logout from Facebook app permissions to ensure a clean session...");
                await new Promise<void>(resolve => {
                    // FB.logout clears the session for our app, which is what we want for a clean disconnect/reconnect.
                    // It does not log the user out of facebook.com itself.
                    window.FB.logout(() => {
                        console.log('FB.logout() callback executed. App session cleared.');
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
                        const isConnected = connections[platform];
                        const isLoading = loadingPlatform === platform;
                        const config = platformConfig[platform];
                        const isRealAuth = platform === PlatformEnum.Facebook || platform === PlatformEnum.Instagram;
                        const isConnectActionDisabled = isRealAuth && !isConnected && !isFbSdkInitialized;

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
                                    title={isConnectActionDisabled ? "Facebook/Instagram connection is disabled. The VITE_FACEBOOK_APP_ID environment variable is not configured." : ""}
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
                        This application uses the official Facebook SDK to connect to the <strong className="text-white">"Nadanaloga-chennai"</strong> Facebook page and its linked <strong className="text-white">"nadanaloga_chennai"</strong> Instagram account.
                    </p>
                    <ol className="list-decimal list-inside space-y-2 text-xs">
                        <li>
                            <strong>Click Connect:</strong> Use the "Connect" button for Facebook or Instagram. A popup will ask you to log in and authorize the connection.
                        </li>
                        <li>
                            <strong>Grant Permissions:</strong> The application will request permissions to manage your pages and Instagram content. You must approve these to continue.
                        </li>
                        <li>
                            <strong>Automatic Detection:</strong> The backend will automatically look for the correct page and linked Instagram account.
                        </li>
                        <li>
                            <strong>Troubleshooting:</strong> If the connection fails, the troubleshooter guide will appear above with detailed steps to resolve common issues.
                        </li>
                    </ol>
                </div>
            )}
        </div>
    );
};