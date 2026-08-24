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
    case "facebook_post":
    case "blog":

      /*
       * KEEP USING YOUR EXISTING
       * content generation implementation.
       */

      throw new Error(
        `Use existing generator for ${request.type}`
      );

    case "instagram_reel":
    case "youtube_short":
    case "product_service_video":

      throw new Error(
        "VIDEO_PROVIDER_NOT_CONFIGURED"
      );

    default:

      throw new Error(
        `Unsupported content type: ${request.type}`
      );
  }
}