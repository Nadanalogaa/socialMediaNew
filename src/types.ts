

export enum Platform {
  Facebook = 'Facebook',
  Instagram = 'Instagram',
  YouTube = 'YouTube',
}

export enum Audience {
  Global = 'Global',
  India = 'India',
  USA = 'USA',
  TamilCommunity = 'Tamil Community',
  Europe = 'Europe',
}

export enum View {
  DASHBOARD = 'DASHBOARD',
  CREATE_POST = 'CREATE_POST',
  SEO_ASSISTANT = 'SEO_ASSISTANT',
  CONNECTIONS = 'CONNECTIONS',
}


export interface Post {
  id: string;
  platforms: Platform[];
  audience: Audience;
  imageUrl?: string;
  prompt: string;
  generatedContent: {
      facebook: string;
      instagram: string;
      youtubeTitle: string;
      youtubeDescription: string;
      hashtags: string[];
  };
  postedAt: string;
  engagement: {
    likes: number;
    comments: number;
    shares: number;
  };
}

export interface SeoSuggestions {
    keywords: string[];
    metaTitle: string;
    metaDescription: string;
    blogIdeas: { title: string; description: string }[];
}

export interface ConnectionStatus {
    [Platform.Facebook]: boolean;
    [Platform.Instagram]: boolean;
    [Platform.YouTube]: boolean;
}

export interface GeneratedAssetContent {
    name: string;
    description: string;
    hashtags: string[];
}

export interface MediaAsset {
  id: string;
  file: File;
  previewUrl: string;
  name:string;
  prompt: string;
  description: string;
  hashtags: string[];
  platforms: Platform[];
  status: 'idle' | 'generating' | 'publishing' | 'error' | 'published';
  errorMessage?: string;
}