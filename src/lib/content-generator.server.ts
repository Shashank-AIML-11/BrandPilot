import { generateCarousel } from "./carousel.server";

export type LOVIZAContentType =
  | "linkedin_post"
  | "instagram_post"
  | "instagram_reel"
  | "facebook_post"
  | "youtube_short"
  | "twitter_post"
  | "carousel"
  | "blog"
  | "tiktok_video"
  | "pinterest"
  | "product_service_video";

export interface ContentGenerationRequest {
  type: LOVIZAContentType;

  brandName: string;

  productOrService: string;

  targetAudience: string;

  topic?: string;

  objective?: string;

  offer?: string;
}

export async function generateLOVIZAContent(
  request: ContentGenerationRequest
) {

  switch (request.type) {

    case "carousel":

      return generateCarousel({
        brandName: request.brandName,
        productOrService: request.productOrService,
        targetAudience: request.targetAudience,
        topic: request.topic || "Educational content",
      });

    case "linkedin_post":
    case "instagram_post":
    case "instagram_reel":
    case "facebook_post":
    case "youtube_short":
    case "twitter_post":
    case "blog":
    case "tiktok_video":
    case "pinterest":
    case "product_service_video":

      /*
       * KEEP USING YOUR EXISTING
       * content generation implementation.
       */

      throw new Error(
        `Use existing generator for ${request.type}`
      );

    default:

      throw new Error(
        `Unsupported content type: ${request.type}`
      );
  }
}