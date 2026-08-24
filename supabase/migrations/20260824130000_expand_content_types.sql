-- Expand the content type system from the original
-- blog / infographic / video model to the final LOVIZA model (11 formats —
-- no email, no ad_image).
ALTER TYPE public.content_type RENAME TO content_type_old;
CREATE TYPE public.content_type AS ENUM (
  'linkedin_post',
  'instagram_post',
  'instagram_reel',
  'facebook_post',
  'youtube_short',
  'twitter_post',
  'carousel',
  'blog',
  'product_service_video',
  'tiktok_video',
  'pinterest'
);
ALTER TABLE public.content_items
  ALTER COLUMN type TYPE public.content_type
  USING (
    CASE type::text
      WHEN 'blog' THEN 'blog'
      WHEN 'infographic' THEN 'carousel'
      WHEN 'video' THEN 'product_service_video'
      ELSE 'blog'
    END
  )::public.content_type;
DROP TYPE public.content_type_old;

-- Carousel needs multiple slides and multiple rendered images — neither
-- fits the single image_prompt/image_url columns every other type uses.
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS carousel_slides JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS carousel_image_urls TEXT[] NOT NULL DEFAULT '{}';
