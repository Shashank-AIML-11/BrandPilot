export interface BrandProfileState {
  brandName: string;
  websiteUrl: string;
  industry: string;
  tagline: string;
  targetIcp: {
    personaTitle: string;
    ageRange: string;
    primaryPainPoint: string;
    dreamOutcome: string;
  };
  focusWords: string[];
  bannedWords: string[];
  brandTone: string;
  assetsUploaded: {
    websiteConnected: boolean;
    imagesCount: number;
    videoClipsCount: number;
    productCatalogLinked: boolean;
  };
  readinessScore: number;
  autopilotActive: boolean;
}

export interface AutonomousPillar {
  id: string;
  title: string;
  shortTitle: string;
  action: string;
  description: string;
  telemetryData: string;
  keyCapability: string;
  iconName: string;
  colorScheme: {
    glow: string;
    border: string;
    badge: string;
    accent: string;
  };
}

export interface AutoLearnIteration {
  iteration: number;
  contentTitle: string;
  creativeThumbnail: string;
  reach: string;
  watchTime: string;
  retentionDropPoint: string;
  aiDiagnosis: string;
  strategyEvolution: string;
  nextBatchResult: string;
  growthLift: string;
}

export interface CreativeShowcaseItem {
  id: string;
  title: string;
  brand: string;
  category: string;
  format: string;
  imageUrl: string;
  views: string;
  likes: string;
  shares: string;
  hookText: string;
  autoLearnedOptimization: string;
  platforms: ('tiktok' | 'reels' | 'shorts' | 'linkedin')[];
  audioTrack: string;
}

export interface CaseStudy {
  id: string;
  brand: string;
  category: string;
  headline: string;
  views: string;
  conversions: string;
  period: string;
  videoUrl: string;
  influencerName: string;
  personaImg: string;
  hookUsed: string;
  quote: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  description: string;
  popular?: boolean;
  badge?: string;
  creditsPerMonth?: number;
  videosPerMonth?: number;
  features: string[];
  ctaText?: string;
}
