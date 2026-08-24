import { generateCarousel } from "./carousel.server";
import { generatePersonalizedEmail } from "./email.server";
import { generateAdCreative } from "./ad-creative.server";

export type LOVIZAContentType =
  | "linkedin_post"
  | "instagram_post"
  | "instagram_reel"
  | "facebook_post"
  | "youtube_short"
  | "carousel"
  | "blog"
  | "email"
  | "ad_image"
  | "product_video";

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

    case "email":

      return generatePersonalizedEmail({
        brandName: request.brandName,
        productOrService: request.productOrService,
        targetAudience: request.targetAudience,
        objective: request.objective || "Generate engagement",
        offer: request.offer,
      });

    case "ad_image":

      return generateAdCreative({
        brandName: request.brandName,
        productOrService: request.productOrService,
        targetAudience: request.targetAudience,
        platform: "instagram",
        objective: request.objective || "Generate leads",
        offer: request.offer,
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
    case "product_video":

      throw new Error(
        "VIDEO_PROVIDER_NOT_CONFIGURED"
      );

    default:

      throw new Error(
        `Unsupported content type: ${request.type}`
      );
  }
}