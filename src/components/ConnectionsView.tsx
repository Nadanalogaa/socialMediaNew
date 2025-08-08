

import React, { useState, useEffect, useRef } from 'react';
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
            We're sorry you're having trouble. This issue is almost always caused by a misconfiguration in your Facebook Developer account. Please carefully check the following settings for your app.
        </p>
        <ol className="list-decimal list-inside space-y-4">
            <li>
                <strong>Check Allowed Domains:</strong>
                <ul className="list-disc list-inside pl-5 mt-2 space-y-1 text-blue-200">
                    <li>Go to your Facebook App Dashboard at <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">developers.facebook.com/apps/</a>.</li>
                    <li>Navigate to <strong>Settings → Basic</strong>.</li>
                    <li>In the <strong>App Domains</strong> field, make sure <code className="bg-dark-bg px-1 py-0.5 rounded text-white">social-media-new-omega.vercel.app</code> is listed.</li>
                    <li>Navigate to <strong>Facebook Login → Settings</strong> (under "Products" in the left sidebar).</li>
                    <li>In <strong>Allowed Domains for the JavaScript SDK</strong>, ensure <code className="bg-dark-bg px-1 py-0.5 rounded text-white">https://social-media-new-omega.vercel.app</code> is listed. Note the required <strong>https://</strong> prefix.</li>
                </ul>
            </li>
            <li>
                <strong>Check App Mode:</strong>
                 <ul className="list-disc list-inside pl-5 mt-2 space-y-1 text-blue-200">
                    <li>At the top of your App Dashboard, check the app's status toggle.</li>
                    <li>If it shows <strong>In Development</strong>, only App Admins, Developers, or Testers can connect. Ensure your Facebook account has one of these roles under the <strong>Roles → Roles</strong> section.</li>
                    <li>If it shows <strong>Live</strong>, the app is public, but the domain check (Step 1) is still mandatory.</li>
                </ul>
            </li>
             <li>
                <strong>Examine Browser Console for Clues:</strong>
                 <ul className="list-disc list-inside pl-5 mt-2 space-y-1 text-blue-200">
                    <li>Open your browser's developer console (usually with the F12 key).</li>
                    <li>Click "Connect" again and watch the console.</li>
                    <li>Find the error log starting with: <code className="bg-dark-bg px-1 py-0.5 rounded text-white">Facebook login failed. IMPORTANT...</code></li>
                    <li>Click the small triangle next to the `Object` to expand it. It might contain a more specific error like "URL Blocked" or "App Not Set Up".</li>
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
    
            // Define the callback as a standard function to ensure compatibility with the FB SDK
            function loginCallback(response: any) {
                if (response.authResponse) {
                    console.log('Facebook login successful. Received authResponse.');
                    const accessToken = response.authResponse.accessToken;
                    // Send token to our backend to verify, find the target page, and store its token.
                    connectFacebook(accessToken)
                        .then(updatedConnections => {
                            setConnections(updatedConnections);
                        })
                        .catch((err: any) => {
                             setError(`Failed to connect ${platform} on backend: ${err.message}`);
                             setShowFbTroubleshooter(true);
                        })
                        .finally(() => {
                            setLoadingPlatform(null);
                        });
                } else {
                    console.error('Facebook login failed. IMPORTANT: Please expand the object below for details from the SDK:', response);
                    setError("Facebook login failed. Please see the troubleshooter below for likely solutions.");
                    setShowFbTroubleshooter(true);
                    setLoadingPlatform(null);
                }
            }

            // Trigger the Facebook Login dialog with required permissions for page management
            window.FB.login(loginCallback, {
                scope: 'public_profile,pages_show_list,pages_manage_posts,pages_read_engagement',
                enable_profile_selector: true, // Allows user to confirm which Facebook profile to use
                auth_type: 'rerequest' // Force re-prompting for permissions to fix stale auth states
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
    
            // Poll to see if the popup is closed by the user manually
            intervalRef.current = window.setInterval(() => {
                if (popupRef.current && popupRef.current.closed) {
                    if (intervalRef.current) clearInterval(intervalRef.current);
                    setLoadingPlatform(null); // Stop loading if user closes popup
                }
            }, 500);
        }
    };

    const handleDisconnect = async (platform: Platform) => {
        setLoadingPlatform(platform);
        setError(null);
        setShowFbTroubleshooter(false);
        try {
            // For Facebook, explicitly log the user out of the app via the SDK.
            // This is more robust than checking getLoginStatus first, as it clears any
            // lingering or corrupted session on Facebook's side, which can prevent a clean reconnect.
            if (platform === PlatformEnum.Facebook && isFbSdkInitialized && window.FB) {
                console.log("Forcing logout from Facebook to ensure a clean session...");
                await new Promise<void>(resolve => {
                    window.FB.logout(() => {
                        console.log('FB.logout() callback executed. Any cached session has been cleared.');
                        resolve();
                    });
                });
            }

            // After client-side logout (if applicable), update the backend state.
            const updatedConnections = await disconnectPlatform(platform);
            setConnections(updatedConnections);

        } catch (err: any) {
            setError(`Failed to disconnect ${platform}: ${err.message}`);
        } finally {
            setLoadingPlatform(null);
        }
    };

    useEffect(() => {
        // This listener handles the message from the MOCK auth popup window.
        const handleAuthMessage = async (event: MessageEvent) => {
            // Basic security check for mock flow
            if (event.origin !== window.location.origin) return;

            const { type, success, platform } = event.data;

            if (type === 'oauth-complete') {
                if (intervalRef.current) clearInterval(intervalRef.current);
                if (popupRef.current) popupRef.current.close();
                
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
        };

        window.addEventListener('message', handleAuthMessage);

        return () => {
            window.removeEventListener('message', handleAuthMessage);
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [setConnections]);

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
                    <h3 className="font-bold text-dark-text mb-2">Connecting to Facebook</h3>
                    <p className="mb-3">
                        This application now uses the official Facebook SDK to connect to the <strong className="text-white">"Nadanaloga-chennai"</strong> page. The mock flow is still active for Instagram and YouTube for demonstration.
                    </p>
                    <ol className="list-decimal list-inside space-y-2 text-xs">
                        <li>
                            <strong>Click Connect:</strong> Use the "Connect" button for Facebook. A popup will ask you to log in to Facebook.
                        </li>
                        <li>
                            <strong>Grant Permissions:</strong> The application will request permissions to see your pages (`pages_show_list`) and publish posts (`pages_manage_posts`). You must approve these to continue.
                        </li>
                        <li>
                            <strong>Automatic Page Detection:</strong> The backend will automatically look for the "Nadanaloga-chennai" page among the pages you manage and connect to it.
                        </li>
                        <li>
                            <strong>Troubleshooting:</strong> If the connection fails, ensure (1) you are an admin of the "Nadanaloga-chennai" page on Facebook, and (2) this app's URL is listed in the "Allowed Domains for the JavaScript SDK" in your Facebook App's settings.
                        </li>
                    </ol>
                </div>
            )}
        </div>
    );
};
