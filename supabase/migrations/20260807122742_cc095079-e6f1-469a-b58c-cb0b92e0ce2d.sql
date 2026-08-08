ALTER TABLE public.content_items
  ALTER COLUMN summary SET DEFAULT '',
  ALTER COLUMN body SET DEFAULT '',
  ALTER COLUMN caption SET DEFAULT '',
  ALTER COLUMN hashtags SET DEFAULT '',
  ALTER COLUMN image_prompt SET DEFAULT '',
  ALTER COLUMN video_script SET DEFAULT '';

UPDATE public.content_items SET
  summary = COALESCE(summary,''),
  body = COALESCE(body,''),
  caption = COALESCE(caption,''),
  hashtags = COALESCE(hashtags,''),
  image_prompt = COALESCE(image_prompt,''),
  video_script = COALESCE(video_script,'');

ALTER TABLE public.content_items
  ALTER COLUMN summary DROP NOT NULL,
  ALTER COLUMN body DROP NOT NULL,
  ALTER COLUMN caption DROP NOT NULL,
  ALTER COLUMN hashtags DROP NOT NULL,
  ALTER COLUMN image_prompt DROP NOT NULL,
  ALTER COLUMN video_script DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.content_items_fill_text_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.summary := COALESCE(NEW.summary, '');
  NEW.body := COALESCE(NEW.body, '');
  NEW.caption := COALESCE(NEW.caption, '');
  NEW.hashtags := COALESCE(NEW.hashtags, '');
  NEW.image_prompt := COALESCE(NEW.image_prompt, '');
  NEW.video_script := COALESCE(NEW.video_script, '');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.content_items_fill_text_defaults() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS content_items_fill_text_defaults ON public.content_items;
CREATE TRIGGER content_items_fill_text_defaults
BEFORE INSERT OR UPDATE ON public.content_items
FOR EACH ROW EXECUTE FUNCTION public.content_items_fill_text_defaults();