



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
}

const platformConfig = {
    [PlatformEnum.Facebook]: { icon: <FacebookIcon className="w-8 h-8" />, color: "text-blue-500" },
    [PlatformEnum.Instagram]: { icon: <InstagramIcon className="w-8 h-8" />, color: "text-pink-500" },
    [PlatformEnum.YouTube]: { icon: <YoutubeIcon className="w-8 h-8" />, color: "text-red-600" },
};

export const ConnectionsView: React.FC<ConnectionsViewProps> = ({ connections, setConnections }) => {
    const [loadingPlatform, setLoadingPlatform] = useState<Platform | null>(null);
    const [error, setError] = useState<string | null>(null);
    const popupRef = useRef<Window | null>(null);
    const intervalRef = useRef<number | null>(null);

    const handleConnect = (platform: Platform) => {
        if (platform === PlatformEnum.Facebook) {
            // --- REAL Facebook Login using SDK ---
            if (!window.FB) {
                setError('Facebook SDK not loaded yet. Please try again in a moment.');
                return;
            }
    
            setLoadingPlatform(platform);
            setError(null);
    
            // Define the callback as a standard function to ensure compatibility with the FB SDK
            function loginCallback(response: any) {
                if (response.authResponse) {
                    console.log('Facebook login successful. Received authResponse.');
                    const accessToken = response.authResponse.accessToken;
                    // Send token to our backend to verify, store, and confirm connection
                    connectFacebook(accessToken)
                        .then(updatedConnections => {
                            setConnections(updatedConnections);
                        })
                        .catch((err: any) => {
                             setError(`Failed to connect ${platform} on backend: ${err.message}`);
                        })
                        .finally(() => {
                            setLoadingPlatform(null);
                        });
                } else {
                    console.log('User cancelled login or did not fully authorize.');
                    const detailedError = 'Facebook login was cancelled or failed. This can happen if you close the login window or if popups are blocked. Please ensure popups are allowed and try again. If the issue persists, the app may not be correctly configured in the Facebook Developer dashboard.';
                    setError(detailedError);
                    setLoadingPlatform(null);
                }
            }

            // Trigger the Facebook Login dialog
            // Reduced scope to fix "Invalid Scopes" error. 
            // 'pages_manage_posts' and other advanced permissions require App Review from Facebook.
            // 'public_profile' and 'email' are standard permissions.
            window.FB.login(loginCallback, { scope: 'public_profile,email' });

        } else {
            // --- MOCK OAuth Flow for other platforms ---
            setError(null);
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
        try {
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
                    <span className="block sm:inline">{error}</span>
                </div>
            )}

            <div className="bg-dark-card border border-dark-border rounded-lg">
                <ul className="divide-y divide-dark-border">
                    {Object.values(PlatformEnum).map(platform => {
                        const isConnected = connections[platform];
                        const isLoading = loadingPlatform === platform;
                        const config = platformConfig[platform];

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
                                    disabled={isLoading}
                                    className={`relative inline-flex items-center justify-center px-6 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-card transition-colors disabled:opacity-50 min-w-[130px]
                                        ${isConnected
                                            ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                                            : 'bg-brand-primary hover:bg-brand-secondary focus:ring-brand-primary'
                                        }`}
                                >
                                    {isLoading ? (
                                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : (isConnected ? 'Disconnect' : 'Connect')}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div className="mt-8 p-6 bg-dark-bg/50 rounded-lg border border-dark-border text-sm text-dark-text-secondary">
                <h3 className="font-bold text-dark-text mb-2">Integrating a Real OAuth Connection</h3>
                <p className="mb-3">
                    This application now uses the official Facebook SDK for real authentication. The mock flow is still active for Instagram and YouTube for demonstration. To complete the real integration, follow these steps:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-xs">
                    <li>
                        <strong>Create Developer Applications:</strong> For other platforms (Instagram, YouTube), you must register your application on their respective developer portals (e.g., Google Cloud Console).
                    </li>
                    <li>
                        <strong>Obtain Credentials:</strong> After registration, the platform will provide a unique Client ID and Client Secret. These are sensitive credentials used to identify your application.
                    </li>
                    <li>
                        <strong>Configure Redirect URIs:</strong> In your developer dashboard, you must specify the exact URL on your server (e.g., `https://your-app.com/auth/youtube/callback`) where the platform should send users after they authorize your app.
                    </li>
                    <li>
                        <strong>Implement Secure Backend Flow:</strong> Your server needs to handle the full OAuth 2.0 grant flow for each service. This involves redirecting the user to the platform's login page and handling the callback to securely exchange an authorization code for a permanent access token, which should be encrypted and stored in a database.
                    </li>
                </ol>
            </div>
        </div>
    );
};