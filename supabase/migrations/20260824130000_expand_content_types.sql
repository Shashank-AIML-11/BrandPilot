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
  'email',
  'ad_image',
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
    END
  )::public.content_type;

DROP TYPE public.content_type_old;