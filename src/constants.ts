

import type { Post } from './types';
import { Platform, Audience } from './types';

export const MOCK_POSTS: Post[] = [
  {
    id: 'post_1',
    platforms: [Platform.Facebook, Platform.Instagram],
    audience: Audience.India,
    imageUrl: 'https://picsum.photos/seed/dance1/800/600',
    mediaType: 'IMAGE',
    prompt: 'Announcing our new Bharatanatyam workshop series for beginners!',
    generatedContent: {
      facebook: "Join us for an immersive journey into the world of Bharatanatyam! Our new workshop series is perfect for beginners. Learn the fundamentals from renowned artists. Visit www.nadanaloga.com to register!",
      instagram: "Discover the grace of Bharatanatyam. ✨ Our new workshop for beginners starts soon! Limited spots available. #Nadanaloga #Bharatanatyam #IndianDance #ClassicalDance #Workshop #DanceClass",
      youtubeTitle: "",
      youtubeDescription: "",
      hashtags: ["Nadanaloga", "Bharatanatyam", "IndianDance", "ClassicalDance", "Workshop", "DanceClass"]
    },
    postedAt: new Date('2024-08-12T18:30:00Z').toISOString(),
    engagement: {
      likes: 0,
      comments: 0,
      shares: 0
    }
  },
  {
    id: 'post_2',
    platforms: [Platform.YouTube],
    audience: Audience.Global,
    imageUrl: 'https://picsum.photos/seed/performance1/800/600',
    mediaType: 'IMAGE',
    prompt: 'A highlight reel of our annual performance event.',
    generatedContent: {
      facebook: "",
      instagram: "",
      youtubeTitle: "Nadanaloga Annual Gala 2023 - Highlights",
      youtubeDescription: "Experience the magic of our annual performance gala. Featuring breathtaking performances from our students and faculty. \n\nLearn more about our school at www.nadanaloga.com.\n\n#Nadanaloga #DancePerformance #IndianClassicalDance #ArtandCulture",
      hashtags: ["Nadanaloga", "DancePerformance", "IndianClassicalDance", "ArtandCulture"]
    },
    postedAt: new Date('2024-08-10T09:00:00Z').toISOString(),
    engagement: {
      likes: 0,
      comments: 0,
      shares: 0
    }
  },
  {
    id: 'post_3',
    platforms: [Platform.Facebook],
    audience: Audience.Global,
    imageUrl: 'https://picsum.photos/seed/video1/800/600', // This is the video thumbnail
    videoUrl: '', // No actual video URL for mock data to prevent 404s
    mediaType: 'VIDEO',
    prompt: 'Behind the scenes footage of our dance practice.',
    generatedContent: {
      facebook: "A sneak peek into our practice sessions! See the dedication and hard work that goes into every performance. #DancePractice #BehindTheScenes #Nadanaloga",
      instagram: "Practice makes perfect! ✨ Go behind the scenes with us. #DanceLife #Rehearsal #IndianDance #Nadanaloga",
      youtubeTitle: "Nadanaloga Practice Session - Behind the Scenes",
      youtubeDescription: "Watch our talented dancers rehearse for their upcoming show.",
      hashtags: ["DancePractice", "BehindTheScenes", "Nadanaloga", "DanceLife", "Rehearsal"]
    },
    postedAt: new Date('2024-08-11T14:00:00Z').toISOString(),
    engagement: {
      likes: 0,
      comments: 0,
      shares: 0
    }
  }
];
