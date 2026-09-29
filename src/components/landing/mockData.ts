import { BrandProfileState, AutonomousPillar, AutoLearnIteration, CreativeShowcaseItem, CaseStudy, PricingPlan } from './types';

export const DEFAULT_BRAND_PROFILE: BrandProfileState = {
  brandName: 'Aura Luxe Skincare',
  websiteUrl: 'https://auraluxe.beauty',
  industry: 'DTC E-Commerce',
  tagline: 'Clean clinical barrier repair engineered for modern urban skin',
  targetIcp: {
    personaTitle: 'Urban Skincare Seekers (24 - 38)',
    ageRange: '24-38',
    primaryPainPoint: 'Damaged skin barrier from aggressive peels and pollution',
    dreamOutcome: 'Glass skin glow in 14 days without 10-step routines'
  },
  focusWords: ['barrier repair', 'ceramide complex', 'dermatologist tested', 'clean clinical', 'morning routine', 'glow in 14 days'],
  bannedWords: ['cheap', 'miracle cure', 'overnight miracle', 'harsh acid', 'discount'],
  brandTone: 'Minimalist Luxury',
  assetsUploaded: {
    websiteConnected: true,
    imagesCount: 24,
    videoClipsCount: 8,
    productCatalogLinked: true
  },
  readinessScore: 98,
  autopilotActive: true
};

export const PRESET_BRAND_PROFILES: BrandProfileState[] = [
  DEFAULT_BRAND_PROFILE,
  {
    brandName: 'DevStack AI',
    websiteUrl: 'https://devstack.io',
    industry: 'B2B SaaS',
    tagline: 'Autonomous code review pipelines that catch bugs before production',
    targetIcp: {
      personaTitle: 'Senior Tech Leads & Engineering Managers',
      ageRange: '28-48',
      primaryPainPoint: 'Engineers wasting 15+ hours weekly on tedious manual PR reviews',
      dreamOutcome: 'Ship 4x faster with zero regression bugs and automated PR summaries'
    },
    focusWords: ['pull request velocity', 'zero regressions', 'AI code review', 'latency', 'production ready', 'developer happiness'],
    bannedWords: ['code monkey', 'replaces junior devs', 'guaranteed no bugs'],
    brandTone: 'Authoritative & Calm',
    assetsUploaded: {
      websiteConnected: true,
      imagesCount: 18,
      videoClipsCount: 6,
      productCatalogLinked: true
    },
    readinessScore: 95,
    autopilotActive: true
  },
  {
    brandName: 'NomadFit Mobile',
    websiteUrl: 'https://nomadfit.app',
    industry: 'Mobile Consumer App',
    tagline: 'High-intensity micro-workouts for travelers and busy professionals',
    targetIcp: {
      personaTitle: 'Digital Nomads & Frequent Travelers',
      ageRange: '22-35',
      primaryPainPoint: 'No access to gyms while flying or traveling between hotels',
      dreamOutcome: 'Stay lean and energized with 12-minute room workouts'
    },
    focusWords: ['hotel room workout', 'zero equipment', '12 min fat burn', 'travel fitness', 'portable routine'],
    bannedWords: ['bulk up', 'steroids', 'bodybuilding stage'],
    brandTone: 'High-Energy Gen-Z',
    assetsUploaded: {
      websiteConnected: true,
      imagesCount: 32,
      videoClipsCount: 12,
      productCatalogLinked: false
    },
    readinessScore: 100,
    autopilotActive: true
  },
  {
    brandName: 'CyberShield Gear',
    websiteUrl: 'https://cybershield.tech',
    industry: 'Consumer Tech & Hardware',
    tagline: 'Sleek privacy-first hardware accessories for digital creatives',
    targetIcp: {
      personaTitle: 'Content Creators, Remote Workers & Tech Enthusiasts',
      ageRange: '21-42',
      primaryPainPoint: 'Public wifi eavesdropping and battery drain during mobile creation',
      dreamOutcome: 'Total privacy and infinite battery in a pocket-sized form factor'
    },
    focusWords: ['hardware encrypted', 'privacy first', 'minimal EDC', 'unboxing', 'creator gear', 'zero telemetry'],
    bannedWords: ['hacker', 'illegal', 'cheap plastic', 'spy'],
    brandTone: 'Cyberpunk Minimalist',
    assetsUploaded: {
      websiteConnected: true,
      imagesCount: 40,
      videoClipsCount: 14,
      productCatalogLinked: true
    },
    readinessScore: 99,
    autopilotActive: true
  }
];

export const AUTONOMOUS_PILLARS: AutonomousPillar[] = [
  {
    id: 'auto-generate',
    title: 'Auto-Generate',
    shortTitle: 'Generate',
    action: 'Endless Creative & Video Synthesis',
    description: 'LOVIZA synthesizes hyper-realistic AI creator UGC, viral product-in-hand showcases, kinetic motion typography, and psychological hooks directly matching your Brand Profile DNA with zero human prompt engineering.',
    telemetryData: '60+ Multiformat Creatives / Day',
    keyCapability: 'Biometric face lock, natural vocal cadence, product-in-hand physics, kinetic captions',
    iconName: 'Wand2',
    colorScheme: {
      glow: 'from-yellow-400/25 to-zinc-900/40',
      border: 'border-yellow-400/50',
      badge: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30',
      accent: 'text-yellow-400'
    }
  },
  {
    id: 'auto-post',
    title: 'Auto-Post',
    shortTitle: 'Post',
    action: 'Autonomous Omnichannel Distribution',
    description: 'Direct programmatic publishing across TikTok, Instagram Reels, YouTube Shorts, LinkedIn, and Meta at dynamically computed algorithmic peak engagement windows without manual upload friction.',
    telemetryData: 'Optimal Slot Scoring (100% Autopilot)',
    keyCapability: 'Direct partner API dispatch, warmed accounts routing, geographic tier matching',
    iconName: 'Send',
    colorScheme: {
      glow: 'from-yellow-400/20 to-zinc-900/40',
      border: 'border-yellow-400/40',
      badge: 'bg-zinc-800 text-yellow-400 border-yellow-400/25',
      accent: 'text-yellow-400'
    }
  },
  {
    id: 'auto-learn',
    title: 'Auto-Learn',
    shortTitle: 'Learn',
    action: 'Real-Time Algorithmic Closed Loop',
    description: 'Every post becomes training data. LOVIZA evaluates 3-second hook retention, average watch percentage, comment sentiment, and conversion click-throughs to diagnose exact viral catalysts.',
    telemetryData: 'Feedback Loop: < 450ms Latency',
    keyCapability: 'Sub-second hook analysis, acoustic energy analysis, visual drop-off diagnosis',
    iconName: 'Cpu',
    colorScheme: {
      glow: 'from-yellow-400/25 to-zinc-900/50',
      border: 'border-yellow-400/50',
      badge: 'bg-yellow-400/15 text-yellow-400 border-yellow-400/30',
      accent: 'text-yellow-400'
    }
  },
  {
    id: 'auto-strategy',
    title: 'Auto-Build Strategy',
    shortTitle: 'Strategy',
    action: 'Self-Evolving Marketing Brain',
    description: 'LOVIZA automatically adjusts campaign themes, audience angle permutations, seasonal narratives, and product positioning based on what proved to bring real paying customers.',
    telemetryData: 'Continuous Strategy Refinement',
    keyCapability: 'Autonomous campaign roadmap, audience angle pivoting, exponential virality compounding',
    iconName: 'TrendingUp',
    colorScheme: {
      glow: 'from-yellow-400/25 to-zinc-900/40',
      border: 'border-yellow-400/40',
      badge: 'bg-zinc-800 text-yellow-400 border-yellow-400/30',
      accent: 'text-yellow-400'
    }
  }
];

export const AUTO_LEARN_ITERATIONS: AutoLearnIteration[] = [
  {
    iteration: 1,
    contentTitle: 'Cycle 01 · Standard Feature Walkthrough',
    creativeThumbnail: '/src/assets/images/fastlane_hero_workspace_1790428612065.jpg',
    reach: '8,400 Views',
    watchTime: '12.4s Avg',
    retentionDropPoint: '2.1s (Intro too slow)',
    aiDiagnosis: 'Slow pacing; corporate tone triggered immediate user swipe. Low FYP velocity.',
    strategyEvolution: 'Auto-prune 1.5s cold opening. Inject high-conflict contrarian question into first 0.6s.',
    nextBatchResult: '142,000 Views (+1,590% Velocity)',
    growthLift: '+1,590%'
  },
  {
    iteration: 2,
    contentTitle: 'Cycle 02 · Pain-Point Contrarian Skit',
    creativeThumbnail: '/src/assets/images/loviza_viral_saas_creator_1790440812141.jpg',
    reach: '142,000 Views',
    watchTime: '24.8s Avg',
    retentionDropPoint: '18.4s (Offer pitch too formal)',
    aiDiagnosis: 'Hook retention spiked to 88%, but viewers dropped when corporate call to action started.',
    strategyEvolution: 'Transition CTA into conversational curiosity gap. Embed product directly in creator hands.',
    nextBatchResult: '890,000 Views & 3,400 Signups',
    growthLift: '+526%'
  },
  {
    iteration: 3,
    contentTitle: 'Cycle 03 · Autopilot Viral Compound Format',
    creativeThumbnail: '/src/assets/images/loviza_viral_fashion_dtc_1790440795970.jpg',
    reach: '2,450,000 Views',
    watchTime: '31.2s Avg (Loop rate 38%)',
    retentionDropPoint: '94% Completion',
    aiDiagnosis: 'Perfect alignment: Hook resonance + organic looping + product-in-hand validation achieved Tier-1 FYP status.',
    strategyEvolution: 'Locked winning DNA into master strategy. Auto-generated 14 thematic sub-variants across all channels.',
    nextBatchResult: 'Exponential Growth: 5.1M Total Ecosystem Reach',
    growthLift: '+472%'
  }
];

export const CREATIVE_SHOWCASE: CreativeShowcaseItem[] = [
  {
    id: 'creative-1',
    title: 'The "Don\'t Buy This" Reverse Psychology Hook',
    brand: 'Aura Luxe Beauty',
    category: 'DTC Skincare',
    format: 'Autonomous UGC Reel',
    imageUrl: '/src/assets/images/loviza_viral_fashion_dtc_1790440795970.jpg',
    views: '1.4M',
    likes: '142K',
    shares: '28.4K',
    hookText: '"Stop buying 8 skincare bottles until you understand what barrier starvation looks like."',
    autoLearnedOptimization: 'Optimized from Cycle 4: Elevated acoustic voice warmth by +12%, 0.4s macro zoom on product texture.',
    platforms: ['tiktok', 'reels', 'shorts'],
    audioTrack: 'Trending Audio · "Clean Girl Aesthetic #3"'
  },
  {
    id: 'creative-2',
    title: 'The "What Senior Devs Never Tell You" Breakdown',
    brand: 'DevStack AI',
    category: 'B2B Developer Tool',
    format: 'Founder Narrative',
    imageUrl: '/src/assets/images/loviza_viral_saas_creator_1790440812141.jpg',
    views: '890K',
    likes: '68K',
    shares: '19.2K',
    hookText: '"If your engineering team still takes 4 days to merge a PR, your company is burning $80k/month."',
    autoLearnedOptimization: 'Optimized from Cycle 7: Replaced terminal code text with augmented floating iPad metrics.',
    platforms: ['tiktok', 'reels', 'linkedin'],
    audioTrack: 'Original Sound · "Deep Silicon Valley Focus"'
  },
  {
    id: 'creative-3',
    title: 'The "Stop Making This Routine Mistake" Form Fix',
    brand: 'NomadFit Mobile',
    category: 'Consumer Fitness App',
    format: 'Viral Skit & Hook',
    imageUrl: '/src/assets/images/loviza_viral_fitness_creative_1790441350420.jpg',
    views: '2.8M',
    likes: '310K',
    shares: '56.2K',
    hookText: '"If you do this during your morning routine, you\'re turning off 60% of your metabolic burn."',
    autoLearnedOptimization: 'Optimized from Cycle 9: Injected immediate red/green side-by-side indicator in first 0.3 seconds.',
    platforms: ['tiktok', 'reels', 'shorts'],
    audioTrack: 'Viral Beat · "Uptempo Dopamine 128BPM"'
  },
  {
    id: 'creative-4',
    title: 'The 2026 Stealth Unboxing Experience',
    brand: 'CyberShield Gear',
    category: 'Consumer Tech',
    format: 'Product in Hand UGC',
    imageUrl: '/src/assets/images/loviza_viral_gadget_creative_1790441361917.jpg',
    views: '1.9M',
    likes: '195K',
    shares: '34.8K',
    hookText: '"The 1 thing every traveler needs in 2026 before connecting to airport Wi-Fi."',
    autoLearnedOptimization: 'Optimized from Cycle 12: ASMR magnetic snap sound trigger boosted watch completion to 91%.',
    platforms: ['tiktok', 'reels', 'shorts'],
    audioTrack: 'ASMR Studio · "Tactile Unboxing Crisp"'
  },
  {
    id: 'creative-5',
    title: 'The "I Tested 50 Formulas" Honest Reviewer',
    brand: 'Lumora Lab',
    category: 'DTC Skincare',
    format: 'UGC Creator Review',
    imageUrl: '/src/assets/images/influencer_mia_ugc_1790428624247.jpg',
    views: '3.2M',
    likes: '412K',
    shares: '78.1K',
    hookText: '"I\'m a cosmetic chemist and this $28 moisturizer beats the $320 luxury jar on 4 key metrics."',
    autoLearnedOptimization: 'Optimized from Cycle 8: Split-screen lab test result overlay doubled comment debate volume.',
    platforms: ['tiktok', 'reels', 'shorts'],
    audioTrack: 'Trending Audio · "Chemist Truths #4"'
  },
  {
    id: 'creative-6',
    title: 'The "Why 90% of Startups Fail at Marketing"',
    brand: 'GrowthOS',
    category: 'B2B SaaS',
    format: 'Founder Teardown',
    imageUrl: '/src/assets/images/influencer_alex_founder_1790428634338.jpg',
    views: '1.1M',
    likes: '94K',
    shares: '22.6K',
    hookText: '"Most founders spend $10,000 on ads before posting 30 organic TikToks. Here\'s the math why that\'s crazy."',
    autoLearnedOptimization: 'Optimized from Cycle 14: Whiteboard dynamic kinetic text kept 3s retention above 84%.',
    platforms: ['tiktok', 'reels', 'linkedin'],
    audioTrack: 'Original Sound · "Founders Masterclass"'
  }
];

export const CASE_STUDIES: CaseStudy[] = [
  {
    id: 'cs-1',
    brand: 'Aura Luxe Skincare',
    category: 'DTC E-Commerce',
    headline: '$148,000 in Revenue Generated on 100% Autopilot in 60 Days',
    views: '4.8M Organic Views',
    conversions: '4,120 Orders ($148K GMV)',
    period: '60 Days Hands-Off',
    videoUrl: '',
    influencerName: 'Mia Chen',
    personaImg: '/src/assets/images/loviza_viral_fashion_dtc_1790440795970.jpg',
    hookUsed: '"Stop buying 8 skincare bottles until you understand barrier starvation."',
    quote: 'We entered our website, uploaded 10 product photos, set our ICP, and literally never opened the app again. LOVIZA auto-generated 4 posts a day, learned which hooks converted best, and scaled our revenue 340% without us hiring a single creator.'
  },
  {
    id: 'cs-2',
    brand: 'DevStack AI',
    category: 'Developer Tools',
    headline: '18,200 Beta Signups Driven Exclusively by Autopilot TikToks & Shorts',
    views: '3.6M Views',
    conversions: '18.2K Product Signups',
    period: '45 Days Autonomous',
    videoUrl: '',
    influencerName: 'Alex Vance',
    personaImg: '/src/assets/images/loviza_viral_saas_creator_1790440812141.jpg',
    hookUsed: '"Your engineering team is burning $80k/month waiting on PR reviews."',
    quote: 'Engineers are traditionally impossible to reach through typical ads. LOVIZA auto-learned the exact cynical dev humor and tech stack terminology that developers loved. Our CAC dropped from $120 to under $0.80 per qualified lead.'
  },
  {
    id: 'cs-3',
    brand: 'CyberShield Gear',
    category: 'Consumer Hardware',
    headline: 'Sold Out Entire Kickstarter Inventory (3,500 Units) in 12 Days',
    views: '5.2M Views',
    conversions: '3,500 Units Sold ($280K)',
    period: '12 Days Post-Launch',
    videoUrl: '',
    influencerName: 'Chloe Rivera',
    personaImg: '/src/assets/images/loviza_viral_gadget_creative_1790441361917.jpg',
    hookUsed: '"The 1 thing every traveler needs in 2026 before connecting to airport Wi-Fi."',
    quote: 'As hardware founders, we have zero video production skills. LOVIZA auto-ingested our 3D product renders and spec sheet, then auto-posted 6 ASMR unboxings daily. We sold out our manufacturing run in under two weeks.'
  }
];

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Brand Autopilot Starter',
    description: 'Perfect for emerging DTC stores & early-stage bootstrapped SaaS looking for automated organic traction.',
    monthlyPrice: 79,
    annualPrice: 63,
    creditsPerMonth: 60,
    videosPerMonth: 60,
    features: [
      '1 Complete Brand Profile DNA Vault',
      'Auto-Generate: 60 high-fidelity video creatives/mo',
      'Auto-Post: TikTok & Instagram Reels autopilot',
      'Auto-Learn: 7-day algorithmic performance loop',
      'Auto-Build: Weekly updated marketing strategy',
      'Direct TikTok & Reels Publishing integration',
      'Zero manual editing or scheduling required'
    ],
    popular: false,
    badge: 'Bootstrappers'
  },
  {
    id: 'growth',
    name: 'Exponential Autopilot',
    description: 'Our flagship self-learning engine for high-growth brands that want dominant multi-channel organic presence.',
    monthlyPrice: 199,
    annualPrice: 159,
    creditsPerMonth: 180,
    videosPerMonth: 180,
    features: [
      '3 Independent Brand Profile DNA Vaults',
      'Auto-Generate: 180 viral video creatives/mo',
      'Auto-Post: Omnichannel across TikTok, Reels, Shorts & LinkedIn',
      'Auto-Learn: Real-time 24/7 hook & retention diagnostics',
      'Auto-Build: Continuous daily marketing strategy evolution',
      'Warmed Accounts network routing included',
      'Dynamic product-in-hand physics rendering',
      'Sub-second trend adaptation & sound cloning',
      'Priority viral computing queue'
    ],
    popular: true,
    badge: 'MOST POPULAR'
  },
  {
    id: 'scale',
    name: 'Brand Empire Autonomous',
    description: 'Unlimited creative synthesis and autonomous multi-brand scaling for agencies and multi-product conglomerates.',
    monthlyPrice: 499,
    annualPrice: 399,
    creditsPerMonth: 600,
    videosPerMonth: 600,
    features: [
      'Unlimited Brand Profile DNA Vaults',
      'Auto-Generate: 600+ ultra-realistic video creatives/mo',
      'Auto-Post: Enterprise multi-account distribution network',
      'Auto-Learn: Custom proprietary AI retention models',
      'Auto-Build: Autonomous multichannel brand marketing roadmap',
      'Dedicated Autonomous Campaign Strategist node',
      'Custom Biometric AI Twin synthesis',
      'API Webhooks for Shopify & Stripe sales feedback',
      'Enterprise SLA & 99.99% uptime guarantee'
    ],
    popular: false,
    badge: 'Agencies & Scale'
  }
];

export const FAQS = [
  {
    question: 'How is LOVIZA different from generic video editors or manual AI tools?',
    answer: 'Traditional tools require you to write scripts, select avatars, edit timelines, manually download files, upload to TikTok, and guess which strategies work. LOVIZA is completely autonomous: you configure your Brand Profile once (website, images, ICP, focus words), and LOVIZA takes over end-to-end. It Auto-Generates viral creatives, Auto-Posts at algorithmic peak hours, Auto-Learns by reading real retention and engagement telemetry, and Auto-Builds your entire ongoing marketing strategy.'
  },
  {
    question: 'What happens after I build my Brand Profile once?',
    answer: 'Once you enter your Brand Profile assets (your website URL, product images, raw video clips, Ideal Customer Profile, and focus words), LOVIZA activates its 4-pillar autonomous flywheel. You never need to worry about virality or daily content brainstorming ever again. LOVIZA autonomously produces, tests, publishes, and refines content 24/7 to drive compounding exponential organic reach.'
  },
  {
    question: 'How does the Auto-Learn feedback loop actually make my brand viral?',
    answer: 'Every piece of content LOVIZA publishes is instrumented with performance telemetry. LOVIZA analyzes 3-second hook retention, second-by-second drop-offs, comment sentiment, shares, and conversions. If an intro format experiences a drop at 2.1 seconds, LOVIZA automatically diagnoses the cause, prunes the weak element, tests contrarian hooks, and deploys the improved variation into the next posting cycle until viral velocity is achieved.'
  },
  {
    question: 'Do social media algorithms penalize autonomous AI content?',
    answer: 'No. Algorithms do not care who produced the video—they care exclusively about user retention, completion rate, and shares. LOVIZA creates authentic, human-grade UGC, product-in-hand demos, and native founder narratives that match the visual and auditory style of top trending human creators. Because LOVIZA auto-learns retention dropoffs, its content consistently outperforms average human creators.'
  },
  {
    question: 'Can I upload my existing brand videos and product catalog?',
    answer: 'Yes! In the Brand Profile DNA Vault, you can connect your website, upload raw B-roll clips, product photos, e-commerce catalog feeds (Shopify, WooCommerce), color palettes, and tone guidelines. LOVIZA will seamlessly incorporate your authentic product textures and brand elements into every generated creative.'
  },
  {
    question: 'Can I pause or review content before it gets auto-posted?',
    answer: 'Yes. While LOVIZA is built for 100% hands-free autonomous operation, you can toggle "Review Gate Mode" at any time. When enabled, LOVIZA generates and stages the content for a 1-tap swipe approval before programmatic dispatch.'
  }
];
