/**
 * Pattern Library: reusable, brand-neutral patterns behind viral short-form content.
 * Patterns describe HOW a piece is built (a hook shape, a story angle, a reel format, a pacing rule).
 * They never contain another creator's actual text; the writer fills them with the brand's own facts and voice.
 *
 * This file is the seed. The same rows live in the `pattern_library` table so they can grow
 * (weekly refresh, and scores learned from each brand's own results). Pure data, no server imports.
 */

export type Dimension =
  | "hook" // how the first 1-3 seconds open
  | "format" // overall reel/post format
  | "angle" // the specific story a piece tells (generic or per industry)
  | "pacing" // retention and editing rules
  | "caption" // on-screen caption style rules
  | "cta" // how a piece ends
  | "ending" // loops and cliffhangers
  | "audio" // sound rules
  | "signal" // what the platform rewards (guides the quality gate)
  | "india"; // India and Hinglish specifics

export interface PatternRow {
  dimension: Dimension;
  key: string;
  label: string;
  /** Instruction handed to the writer, or the rule itself. */
  template: string;
  /** Why it works, one line. */
  why: string;
  /** Industry groups it suits; empty means all. */
  industries: IndustryGroup[];
  source: string;
}

export type IndustryGroup =
  | "local_service" // dental, salon, clinic, gym, repair, spa
  | "product_brand" // handicraft, jewellery, fashion, home decor, D2C
  | "food" // bakery, cafe, restaurant, cloud kitchen
  | "education" // coaching, courses, tutors
  | "b2b" // agencies, software, consultancies
  | "home_space"; // interiors, real estate, construction

/** Maps a brand's free-text industry to a group. Unknown text returns null (generic patterns only). */
export function industryGroupOf(text: string | null | undefined): IndustryGroup | null {
  const t = String(text ?? "").toLowerCase();
  if (!t) return null;
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  if (has("dental", "dentist", "clinic", "salon", "spa", "gym", "fitness", "yoga", "physio", "repair", "service", "wellness", "doctor", "beauty", "clean")) return "local_service";
  if (has("bakery", "cafe", "café", "restaurant", "food", "kitchen", "sweet", "catering", "tea", "coffee", "snack")) return "food";
  if (has("coach", "class", "course", "tutor", "school", "academy", "education", "training", "learn")) return "education";
  if (has("saas", "software", "agency", "consult", "b2b", "marketing", "app ", "tech", "startup")) return "b2b";
  if (has("interior", "real estate", "property", "builder", "construction", "architect", "furnish")) return "home_space";
  if (has("brass", "handicraft", "craft", "jewel", "fashion", "cloth", "apparel", "decor", "store", "shop", "d2c", "product", "gift", "art")) return "product_brand";
  return null;
}

const S = {
  guides: "Public 2026 reel guides (Opus Pro, UpGrow, SocialPilot, Async, Buffer)",
  refs: "Founder's reference reels and posts, Nov 2026",
  psych: "Short-form hook psychology guides (DEV Community, 2026)",
  craft: "Short-form editing practice",
  own: "LOVIZA editorial",
};

const row = (
  dimension: Dimension,
  key: string,
  label: string,
  template: string,
  why: string,
  source: string,
  industries: IndustryGroup[] = [],
): PatternRow => ({ dimension, key, label, template, why, industries, source });

const hook = (key: string, label: string, template: string, why: string, source = S.guides) => row("hook", key, label, template, why, source);

// ---------------------------------------------------------------- HOOKS
export const HOOKS: PatternRow[] = [
  hook("question", "Direct question", "open with a direct question the audience is already asking", "Mirrors the viewer's own thought, so they stay for the answer.", S.own),
  hook("stat", "Specific number", "open with one specific number or fact from the brand's own context", "Specific data feels objective and breaks expectations.", S.psych),
  hook("bold_claim", "Bold claim", "open with a confident, slightly provocative claim, then back it up in the next line", "Creates tension the viewer wants resolved.", S.own),
  hook("story", "Story moment", "open with a short real-feeling moment or scene, then the lesson", "Narrative starts at tension, so viewers engage emotionally.", S.psych),
  hook("how_to", "How-to promise", "promise a clear how-to and deliver concrete steps", "Clear scope lowers the cost of staying.", S.own),
  hook("myth_bust", "Myth bust", "name a common myth, then correct it", "Cognitive dissonance: the viewer wants to settle it.", S.guides),
  hook("list", "Numbered list", "numbered list of quick, useful points; state the count in the first line", "Odd numbers and a clear scope feel curated.", S.psych),
  hook("contrarian", "Contrarian", "challenge a common habit or belief in the industry, then give the better way", "Conflict with an existing belief drives engagement.", S.psych),
  hook("before_after", "Before and after", "contrast the problem state with the improved state, worst state first", "Fast visible payoff.", S.guides),
  hook("behind_scenes", "Behind the scenes", "show how the work actually gets done, in a human voice", "Unpolished process builds trust.", S.guides),
  hook("customer_voice", "Customer voice", "speak in the audience's own words about their problem (no invented quotes or names)", "Instant recognition.", S.own),
  hook("offer", "Offer first", "lead with the offer or next step and why now", "Clear value, clear deadline.", S.own),
  hook("pov", "POV", "open with 'POV:' and put the viewer inside a relatable moment from their day", "Relatable scenes get sent to friends.", S.guides),
  hook("mistake", "Biggest mistake", "name one common mistake people make with this product or service, then the fix (no fear tactics)", "Fear of error creates a pause.", S.guides),
  hook("if_you", "If you are...", "open with 'If you are [specific person in a specific situation]...' so the right viewer feels called out", "Personal relevance beats broad appeal.", S.guides),
  hook("unpopular_opinion", "Unpopular opinion", "state an honest, mild opinion most in this industry would not say out loud, then explain it", "Disagreement drives comments.", S.own),
  hook("one_thing", "One thing", "promise one single thing to know or do, then deliver exactly that", "Single promise, no friction.", S.own),
  hook("whats_inside", "What is inside", "show what is inside or included, piece by piece, like unboxing", "Piece-by-piece reveal holds attention.", S.own),
  hook("honest_truth", "Honest truth", "say something plainly honest about price, effort or limits that builds trust", "Honesty is rare and memorable.", S.own),
  hook("right_now", "Right now", "tie the post to this season, week or moment and why it matters now", "Timeliness raises urgency.", S.own),
  hook("curiosity_gap", "Curiosity gap", "tease a surprising answer, hold it back for a beat: 'Only people who [result] know to [action], and it is [surprise]'", "An open loop is uncomfortable until closed.", S.psych),
  hook("shocking_stat", "Shocking stat", "'[Specific %] of [group] [negative outcome]. The ones who do not [differentiating action].' Use only numbers the brand can stand behind", "Specific data forces the viewer to recalibrate.", S.psych),
  hook("transformation", "Transformation", "'[Time] ago [starting point]. Today [result]. One change made the difference.' Only real results", "Social proof plus curiosity about the path.", S.psych),
  hook("direct_command", "Direct command", "'[Verb] this [urgency cue] before [event or deadline].' Only when the deadline is real", "Authority and urgency skip evaluation.", S.psych),
  hook("list_promise", "List promise", "'[Odd number] [things] that [benefit] in [time or cost saved].'", "Expectation management lowers friction.", S.psych),
  hook("story_opener", "Story opener", "start at the dramatic point: 'I was about to [action]... then [turning point]'", "Starting in tension beats starting at the beginning.", S.psych),
  hook("stop_if", "Stop if you...", "'Stop scrolling if you want [specific goal].' The goal must be specific to this brand's audience", "Speaks to a goal, prompting a pause.", S.guides),
  hook("hidden_tip", "Hidden tip", "'The [thing] nobody tells you about [topic]...' then one real, concrete tip", "Promises insider knowledge.", S.guides),
  hook("right_way", "The right way", "'The right way to [common task]' when most people do it wrong; show the correct version", "Suggests the viewer may be doing it wrong.", S.guides),
  hook("years_lesson", "Years in seconds", "'[X] years of [work] taught me this' then one lesson, only if the brand's years are real", "Compresses experience into a quick takeaway.", S.guides),
  hook("does_this_happen", "Does this happen to you", "show a familiar annoying scene in one second, then 'Does this happen to you?'", "Instant recognition.", S.guides),
  hook("i_tested", "I tested it", "'I tested [thing] and here is what happened' only when the brand really did, with the real result", "Results build credibility.", S.guides),
  hook("must_watch_for", "Must-watch for", "'Must watch if you are a [specific audience]'", "Signals the content is made for them.", S.guides),
  hook("quick_method", "Quick method", "'A quick way to [goal] without [pain]'", "Fast, actionable promise.", S.guides),
  hook("wait_for_it", "Wait for it", "tease the payoff in one line, deliver it in the final seconds so people watch to the end", "Delayed payoff lifts completion rate.", S.guides),
  hook("what_x_gets_you", "What this price gets you", "'What Rs [amount] gets you at [brand]' then show the real items", "Concrete price framing is sendable.", S.refs),
  hook("vs_compare", "This vs that", "put two options side by side ('[A] vs [B]'), say which suits whom and why", "Comparison invites opinions.", S.own),
  hook("red_green_flag", "Red flag / green flag", "'Red flag: [bad sign]. Green flag: [good sign]' when choosing this kind of product or service", "Checklist framing is saved for later.", S.own),
  hook("signs_you_need", "Signs you need", "'3 signs you need [product or service]' with honest, non-scary signs", "Helps viewers self-diagnose.", S.own),
  hook("stop_doing", "Stop doing", "'Stop doing [common habit]. Do this instead.' Frame as a better way, not a scolding", "Flipped from how-to, increases attention.", S.guides),
  hook("ranked_picks", "Ranked picks", "'[N] [things] that replace [expensive or annoying thing]', numbered, each with one line why", "Numbered picks are saved and sent.", S.refs),
  hook("by_the_numbers", "By the numbers", "lead with the brand's real numbers (orders, years, pieces, customers) as one big figure", "A big number is a visual stop sign.", S.refs),
  hook("question_to_answer", "Answer a comment", "'Someone asked: [real customer question]' then answer in the same video", "Answering real questions builds trust and series.", S.guides),
  hook("headline_react", "Headline reaction", "put a real, relevant news or rule change in caps on the first frame, then one honest opinion", "News framing earns a stop.", S.guides),
  hook("cost_reveal", "Cost reveal", "'What it really costs to [make or do thing]' and break down real costs", "Transparency is rare and shareable.", S.own),
  hook("process_asmr", "Process close-up", "open on a satisfying close-up of the work (hands, tools, materials) with no talking for 2 seconds", "Satisfying visuals stop the scroll without words.", S.guides),
  hook("hinglish_dost", "Dost talk (Hinglish)", "open in casual Hinglish as if talking to a friend: 'Yaar, ye galti mat karna...'", "Native tone feels human, not like an ad.", S.refs),
  hook("galat_stamp", "GALAT stamp", "state the myth, then stamp it wrong ('Ye galat hai') with a visual stamp, then the right way", "Strong visual verdict inside two seconds.", S.refs),
  hook("settings_secret", "One setting", "'There is one setting/step most people skip' then show exactly where", "Specific and actionable; people screenshot it.", S.refs),
  hook("numbers_ladder", "Ladder of numbers", "show a count-up or ladder (0 to 100, Rs X to Rs Y) with the story of each step", "Progress visuals keep eyes moving.", S.craft),
];

// ---------------------------------------------------------------- FORMATS
const fmt = (key: string, label: string, template: string, why: string, source = S.guides, industries: IndustryGroup[] = []) =>
  row("format", key, label, template, why, source, industries);

export const FORMATS: PatternRow[] = [
  fmt("pov_skit", "POV micro-skit", "on-screen text names a specific relatable situation, then a short reaction; cut on the reaction", "Relatable and sendable.", S.guides),
  fmt("headline_reenact", "Headline reenactment", "a real headline in caps as first frame, play both sides with hard cuts, end with one-sentence opinion", "News hooks plus personality.", S.guides),
  fmt("serial_episode", "Serialised episode", "same shot, light and caption stem every time, numbered 'Day 12', only the subject changes", "Builds a habit and a reason to follow.", S.guides, ["product_brand", "food", "local_service"]),
  fmt("micro_lesson", "Micro-lesson", "8-12 seconds, one small idea, with text overlays; wrong version first, right version on the beat", "Short and educational is saved.", S.guides),
  fmt("before_after_reveal", "Before and after reveal", "open on the worst state with a number or question, fast process cuts, hold on the result, end with a question", "Visible transformation.", S.guides, ["local_service", "home_space", "product_brand"]),
  fmt("shop_tour", "Shop tour", "entrance to counter to workspace in 15 seconds, one line per stop", "Shows the real place; builds local trust.", S.guides, ["food", "product_brand", "local_service"]),
  fmt("day_in_life", "Day in the life", "opening, busiest hour and closing in quick cuts with timestamps", "Backstage feels personal.", S.guides),
  fmt("product_drop", "Product drop teaser", "close-ups, a countdown and a reveal; say the date", "Anticipation lifts follows.", S.guides, ["product_brand", "food"]),
  fmt("customer_story", "Customer story", "customer's problem, what we did, their result, in about 15 seconds; real, permitted stories only", "Real proof.", S.guides),
  fmt("comment_reply", "Reply to a comment", "show the real question as a sticker, answer on camera or with text scenes", "Social proof and an endless idea source.", S.guides),
  fmt("reaction", "Reaction", "react to a myth, a trend or the brand's own old post", "Opinion plus personality.", S.guides),
  fmt("mini_case", "Mini case study", "problem, solution, result with one number, about 15 seconds", "Compact proof.", S.guides, ["b2b", "education", "local_service"]),
  fmt("trend_remix", "Trend with a twist", "use a trending format with the brand's own subject; never copy the creator's words", "Rides existing demand.", S.guides),
  fmt("myth_vs_fact", "Myth vs fact", "stamp the myth as wrong, show the right way side by side, finish with what to do now", "Verdict plus utility.", S.refs),
  fmt("step_by_step", "Step by step", "3-5 steps, one screen each, works with the sound off", "Clear sequence, saved for later.", S.guides),
  fmt("settings_walkthrough", "Settings walkthrough", "one thing people get wrong, exact steps to fix it, what changes after", "Actionable and screenshot-worthy.", S.refs, ["b2b", "education"]),
  fmt("ranked_picks", "Ranked picks", "a numbered set of picks, each with one line of why; state the count in the first scene", "Lists are saved.", S.refs),
  fmt("doodle_story", "Doodle story", "one real moment as a story, a single number at the turning point, plain light scenes", "Story plus a number.", S.refs),
  fmt("unboxing_inside", "What is inside", "reveal items one by one with price or use", "Piece-by-piece reveal.", S.own, ["product_brand", "food"]),
  fmt("process_cut", "Making of", "raw material to finished piece in 8-15 seconds, hands visible, timestamped steps", "Satisfying process content is rewatched.", S.craft, ["product_brand", "food"]),
  fmt("ugc_showcase", "Customer showcase", "feature a customer's own photo or video with permission, add one line of context", "Social proof.", S.guides),
  fmt("founder_story", "Founder story", "why it started, one struggle, what keeps going; first person, plain words", "People follow people.", S.guides),
  fmt("faq_series", "FAQ series", "one real customer question per reel, numbered, same layout", "Searchable and repeatable.", S.own, ["local_service", "education", "b2b"]),
  fmt("this_or_that", "This or that", "two options on screen, pick one, ask viewers to vote", "Easy comment.", S.own),
  fmt("expert_vs_novice", "Beginner vs pro", "show the common beginner way and the pro way side by side", "Clear contrast.", S.own, ["local_service", "education", "product_brand"]),
  fmt("event_countdown", "Event countdown", "dates, what is happening, why go, with a countdown", "Urgency with a date.", S.guides),
];

// ---------------------------------------------------------------- GENERIC ANGLES
const ang = (key: string, template: string, industries: IndustryGroup[] = []) =>
  row("angle", key, key.replace(/_/g, " "), template, "A specific story to tell, so no two pieces repeat.", S.own, industries);

export const GENERIC_ANGLES: PatternRow[] = [
  ang("top_question", "answer the one question customers ask most before buying"),
  ang("hidden_cost", "what it really costs, and where people overspend"),
  ang("wrong_choice", "how people pick the wrong option and how to choose well"),
  ang("how_made", "how it is actually made or done, step by step"),
  ang("one_year_later", "what it looks like after a year of real use"),
  ang("beginner_mistake", "the first-timer mistake and how to avoid it"),
  ang("quick_compare", "this versus the usual alternative, honestly"),
  ang("customer_day", "a day in the life of the customer using it"),
  ang("tiny_detail", "one small detail most competitors skip and why it matters"),
  ang("season_prep", "how to get ready for this season"),
  ang("price_explained", "why it is priced this way, in plain numbers"),
  ang("care_tips", "how to look after it so it lasts"),
  ang("who_is_for", "who it is for and who it is not for"),
  ang("old_vs_new", "how this changed in the last few years and what it means for the customer"),
  ang("one_hour_task", "what you can finish in one hour with it"),
  ang("gift_idea", "who to give it to and what to say"),
  ang("local_pride", "something about the place or craft behind it"),
  ang("what_we_refuse", "what the brand refuses to do and why"),
  ang("bad_review_reply", "answer a common criticism openly"),
  ang("save_time", "the time it saves and what to do with that time"),
  ang("save_money", "where it saves money over time, with honest numbers"),
  ang("quiet_proof", "a real small result or moment from a real customer, with permission"),
  ang("check_before_buy", "a short checklist to run before buying anything like this"),
  ang("misunderstood_word", "explain a jargon word customers keep asking about"),
  ang("behind_price_tag", "break down what is inside the price"),
  ang("common_fear", "address the most common worry, calmly and factually"),
  ang("quick_win", "one thing the viewer can do today for a quick win"),
  ang("compare_cheap", "why the cheapest option can cost more later, without naming competitors"),
  ang("story_of_one_piece", "the story behind one specific product or job"),
  ang("trend_take", "a trend in this industry and what it means for the customer"),
];

// ---------------------------------------------------------------- INDUSTRY ANGLES
const ind = (g: IndustryGroup, key: string, template: string) => row("angle", `${g}:${key}`, key.replace(/_/g, " "), template, "Industry-specific angle drawn from what customers of this kind of business ask, fear and search for.", S.own, [g]);

export const INDUSTRY_ANGLES: PatternRow[] = [
  // local services: dental, salon, clinic, gym, repair
  ind("local_service", "first_visit", "what happens on a first visit, minute by minute, so nobody is nervous"),
  ind("local_service", "does_it_hurt", "the honest answer to 'will it hurt / take long / need a follow-up'"),
  ind("local_service", "how_often", "how often people really need this, and when it is too much"),
  ind("local_service", "myth_vs_fact_service", "a common myth about this service, corrected kindly"),
  ind("local_service", "cost_range", "what it typically costs and what changes the price"),
  ind("local_service", "aftercare", "what to do and avoid after the appointment"),
  ind("local_service", "red_flags", "signs it is time to book now and not wait"),
  ind("local_service", "emergency_vs_wait", "what can wait and what should not"),
  ind("local_service", "meet_the_team", "one person on the team, what they love about the work"),
  ind("local_service", "before_after_real", "a real before and after with the customer's permission"),
  ind("local_service", "kids_and_family", "how the service works for children, parents or seniors"),
  ind("local_service", "tools_explained", "what that tool or machine does and why it is used"),
  // product brands: handicraft, jewellery, fashion, decor
  ind("product_brand", "real_vs_fake", "how to tell the real thing from a cheap imitation"),
  ind("product_brand", "how_to_style", "three ways to use or style one product"),
  ind("product_brand", "gift_guide", "what to gift for a specific occasion and budget"),
  ind("product_brand", "making_of", "the making of one piece, from raw material to finish"),
  ind("product_brand", "care_and_polish", "how to care for it so it lasts for years"),
  ind("product_brand", "material_story", "where the material comes from and why it is chosen"),
  ind("product_brand", "size_and_fit", "how to choose the right size or fit for your space or body"),
  ind("product_brand", "festive_pick", "the pick for this festival or season"),
  ind("product_brand", "customer_corner", "where a customer put it at home, with permission"),
  ind("product_brand", "artisan_face", "the person who made it and what they say about it"),
  ind("product_brand", "returns_and_trust", "how delivery, returns and packing work, to remove doubt"),
  ind("product_brand", "bulk_and_corporate", "how to order in bulk for weddings, offices or gifting"),
  // food: bakery, cafe, restaurant
  ind("food", "todays_special", "what is fresh today and why it is worth trying"),
  ind("food", "recipe_secret", "one small technique behind the taste"),
  ind("food", "ingredient_story", "one ingredient and where it comes from"),
  ind("food", "order_hack", "the best way to order or combine items"),
  ind("food", "pairing", "what goes best with what, and why"),
  ind("food", "behind_the_counter", "what happens before the shop opens"),
  ind("food", "festival_menu", "the festival or season special, with a date"),
  ind("food", "custom_orders", "how custom or bulk orders work, step by step"),
  ind("food", "hygiene_proof", "a clean, honest look at the kitchen routine"),
  ind("food", "price_for_value", "what Rs X gets you here"),
  ind("food", "regulars_pick", "what the regulars order and why"),
  ind("food", "sold_out_story", "why the best item sells out and how to get it"),
  // education: coaching, courses, tutors
  ind("education", "study_plan", "a realistic weekly plan for one exam or skill"),
  ind("education", "common_mistake_students", "the mistake most students make and the fix"),
  ind("education", "result_story", "a real student's progress, with permission"),
  ind("education", "free_resource", "one free resource or trick, no sign-up"),
  ind("education", "parent_question", "the question parents ask most and the honest answer"),
  ind("education", "demo_minute", "one minute of a real class, one clear idea"),
  ind("education", "myth_exam", "a myth about the exam or subject, corrected"),
  ind("education", "time_management", "how to fit it into a busy day"),
  ind("education", "batch_info", "what the next batch covers and who it is for"),
  ind("education", "career_path", "where this skill leads in real jobs"),
  // b2b: agencies, software, consultancies
  ind("b2b", "mini_case_result", "a problem, what was done, one number as the result"),
  ind("b2b", "tool_vs_manual", "doing it by hand versus with the product, side by side"),
  ind("b2b", "mistake_audit", "the mistake we see most in audits and how to fix it"),
  ind("b2b", "pricing_logic", "how pricing works and what drives cost"),
  ind("b2b", "free_checklist", "a free checklist or template for one task"),
  ind("b2b", "behind_the_work", "how a project actually runs, week by week"),
  ind("b2b", "myth_in_industry", "a myth buyers believe about this category"),
  ind("b2b", "quick_demo", "a 20-second demo of one feature solving one job"),
  ind("b2b", "buyer_questions", "the question buyers ask before signing"),
  ind("b2b", "trend_react", "react to a change in the market and what to do"),
  // home and space: interiors, real estate, construction
  ind("home_space", "budget_breakdown", "where the money goes in a real project"),
  ind("home_space", "small_space_idea", "one idea for a small room, with real sizes"),
  ind("home_space", "material_choice", "which material, and when each is the wrong choice"),
  ind("home_space", "site_diary", "a week on site: what got done and what went wrong"),
  ind("home_space", "before_after_space", "a real before and after of one room"),
  ind("home_space", "timeline_truth", "how long it really takes, step by step"),
  ind("home_space", "vastu_and_light", "light, air and layout choices people ask about"),
  ind("home_space", "mistake_to_avoid_home", "the mistake that costs the most to fix later"),
  ind("home_space", "client_walkthrough", "a walkthrough of a finished space, with permission"),
  ind("home_space", "festival_refresh", "a quick refresh before the festival or guests arrive"),
];

// ---------------------------------------------------------------- PACING
const pace = (key: string, label: string, template: string, why: string, source = S.guides) => row("pacing", key, label, template, why, source);

export const PACING: PatternRow[] = [
  pace("hook_in_1_5s", "Hook inside 1.5 seconds", "the hook must be visible and readable by 1.5 seconds, before any logo or intro", "Viewers decide in about two seconds."),
  pace("cut_every_2_3s", "A change every 2-3 seconds", "a new visual, crop, zoom or text beat every 1.5-3 seconds; no static shot longer than 4 seconds", "Static shots lose viewers."),
  pace("text_1_2s", "Text beats", "one on-screen text element every 1-2 seconds; never a paragraph", "Reading time must fit the beat."),
  pace("length_by_goal", "Length by goal", "entertaining 7-15s; teaching 15-30s; anything over 45s only with exceptional value", "Shorter reels keep higher average retention."),
  pace("payoff_last_2s", "Payoff in last 2 seconds", "deliver the promised payoff or the call to action in the last 2 seconds", "Ending strong lifts completion."),
  pace("three_to_five_beats", "3-5 beats", "after the hook, 3-5 key beats with a time budget each", "Clear structure beats rambling."),
  pace("sound_off_first", "Works with sound off", "every reel must make full sense with the sound off (over 85% watch muted)", "Most viewers do not hear audio."),
  pace("open_loop", "Open loop", "promise something in the first line and pay it off later, not at once", "Curiosity keeps eyes on screen."),
  pace("pattern_interrupt", "Pattern interrupt", "change the angle, scale or colour block right before attention would drop (around 4-6 seconds)", "Resets attention.", S.craft),
  pace("one_idea", "One idea only", "one reel teaches or shows one thing", "Focus raises completion."),
];

// ---------------------------------------------------------------- CAPTIONS
const cap = (key: string, label: string, template: string, why: string, source = S.guides) => row("caption", key, label, template, why, source);

export const CAPTIONS: PatternRow[] = [
  cap("word_highlight", "Word-by-word with one highlight", "show 2-5 words at a time, synced to the voice; highlight one key word per line in the accent colour", "Every reference reel uses this.", S.refs),
  cap("size_and_contrast", "Large and high contrast", "bold sans-serif, large enough to read on a phone; white on dark or black on light; box or stroke on busy backgrounds", "Readability."),
  cap("center_third", "Centre third, safe zones", "keep captions in the centre third; stay out of the top and bottom interface areas and away from faces", "Platform UI covers the edges."),
  cap("hold_2_4s", "Hold 2-4 seconds", "keep each caption block on screen 2-4 seconds depending on word count", "Matches reading speed."),
  cap("simple_motion", "Simple motion", "a subtle pop or fade; no heavy animation", "Heavy motion distracts."),
  cap("stamp_emphasis", "Stamp for emphasis", "use a sticker or stamp (GALAT, OFF, FREE) for the single most important word of the reel", "Visual verdict reinforces the point.", S.refs),
  cap("two_tone_headline", "Two-tone headline", "static posts: label pill, big headline with one phrase in the accent colour, one big number or quote, lots of empty space", "Pattern in the founder's best posts.", S.refs),
  cap("burned_in", "Burned-in, branded", "captions are part of the video in the brand font and colours, not platform auto captions", "Consistent brand look.", S.guides),
];

// ---------------------------------------------------------------- CTAs
const cta = (key: string, label: string, template: string, why: string, source = S.guides) => row("cta", key, label, template, why, source);

export const CTAS: PatternRow[] = [
  cta("send_to_friend", "Send to someone", "'Send this to someone who [specific situation]'", "DM shares are among the strongest reach signals."),
  cta("save_for_later", "Save for later", "'Save this for when you [specific moment]'", "Saves signal lasting value."),
  cta("comment_keyword", "Comment a keyword", "'Comment [WORD] and I will send you [thing]'. Use only when the brand can really deliver the thing", "High comment rate; needs a reply path.", S.refs),
  cta("follow_part_2", "Follow for part 2", "end on a cliffhanger and promise the next part", "Brings viewers back."),
  cta("question_to_comment", "Ask a real question", "end with one easy question: 'Which would you pick?'", "Easy to answer, so more comments."),
  cta("whatsapp_us", "WhatsApp us", "'WhatsApp us on [number] to [specific next step]'", "Direct path for Indian small business."),
  cta("book_now", "Book or visit", "'Book [specific slot] on the link in bio' with a real date", "Clear conversion."),
  cta("tag_a_friend", "Tag a friend", "'Tag the one who always [relatable habit]'", "Social reach, use sparingly."),
  cta("try_today", "Try it today", "give one tiny action the viewer can do right now", "Low friction."),
  cta("soft_none", "No hard CTA", "end on the payoff with the brand name; no ask", "Avoids sales fatigue; good for trust posts."),
];

// ---------------------------------------------------------------- ENDINGS / LOOPS
const end = (key: string, label: string, template: string, why: string, source = S.guides) => row("ending", key, label, template, why, source);

export const ENDINGS: PatternRow[] = [
  end("seamless_loop", "Seamless loop", "for reels under 15 seconds, make the last frame flow into the first so it replays without a seam", "Rewatches add watch time."),
  end("cliffhanger", "Cliffhanger", "stop just before the final reveal and promise it in part 2", "Drives follows and returns."),
  end("callback", "Callback to the hook", "end by echoing the first line with a new meaning", "Satisfying close."),
  end("question_end", "Question end", "finish on a question that invites an answer in the comments", "Starts a thread."),
  end("number_end", "Number end", "end on the single number that proves the point", "Memorable."),
];

// ---------------------------------------------------------------- AUDIO
const aud = (key: string, label: string, template: string, why: string, source = S.guides) => row("audio", key, label, template, why, source);

export const AUDIO: PatternRow[] = [
  aud("always_audio", "Always include audio", "a voice-over, original audio or a licensed track is on every reel; silent reels underperform", "Reels with audio are favoured."),
  aud("voice_first", "Voice leads", "the voice-over is the main track; music sits well below it", "Clear message."),
  aud("no_watermark", "No watermarks", "never reuse clips with another app's watermark or logo", "Reposts with watermarks are deprioritised."),
  aud("original_only", "Original content", "use the brand's own footage or properly licensed stock; do not reupload other creators' videos", "Originality is rewarded."),
  aud("licensed_music", "Licensed music only", "use royalty-free or platform-licensed music; avoid copyrighted tracks in brand publishing", "Avoids takedowns."),
];

// ---------------------------------------------------------------- SIGNALS (what the platform rewards)
const sig = (key: string, label: string, template: string, why: string) => row("signal", key, label, template, why, S.guides);

export const SIGNALS: PatternRow[] = [
  sig("watch_time", "Watch time", "the top signal is how much of the reel is watched, in percent and seconds; design for completion", "Highest weight in published ranking guidance."),
  sig("sends", "Sends (DM shares)", "shares by DM are a very strong signal for reach beyond followers; write something people want to send to a specific person", "Sends drive non-follower reach."),
  sig("likes_per_reach", "Likes per reach", "likes divided by reach matters mostly for followers; make the point likeable, not just informative", "Used for connected reach."),
  sig("saves", "Saves", "saves show lasting value; checklists, steps and prices get saved", "Signals usefulness."),
  sig("originality", "Originality", "original content is favoured and reposted content is demoted", "Platform preference."),
  sig("trial_test", "Test before posting wide", "a hook can be tested on non-followers first (trial reels) before it goes to the audience", "Reduces risk."),
];

// ---------------------------------------------------------------- INDIA
const ina = (key: string, label: string, template: string, why: string, source = S.refs) => row("india", key, label, template, why, source);

export const INDIA: PatternRow[] = [
  ina("hinglish_voice", "Hinglish when the audience speaks it", "write voice-over and captions in natural Hinglish (Roman script) for B2C Indian audiences; mix Hindi and English the way people speak; avoid textbook Hindi", "Reads as a person, not an ad."),
  ina("rupee_prices", "Prices in rupees", "state prices and savings in rupees (Rs or ₹), with real numbers", "Concrete and local."),
  ina("festival_calendar", "Festival timing", "tie content to Diwali, Dhanteras, Raksha Bandhan, Eid, Holi, Navratri, Ganesh Chaturthi, wedding season and exam season, 2-3 weeks ahead", "Demand spikes before festivals."),
  ina("whatsapp_trust", "WhatsApp as the close", "give a WhatsApp number or 'DM to order' as the next step; show response time honestly", "How many Indian small businesses sell."),
  ina("cod_and_returns", "Trust signals", "mention cash on delivery, return policy, real address or years in business when true", "Reduces buying fear."),
  ina("local_city", "Name the city", "name the city or area when the business is local ('Jaipur', 'Koramangala')", "Local search and recognition."),
  ina("avoid_tiktok", "No TikTok", "TikTok is not available in India; do not suggest it", "Platform fact."),
  ina("relatable_family", "Family and festival moments", "use relatable family, wedding and festival moments, never stereotypes", "High emotional pull in India."),
];

// ---------------------------------------------------------------- ALL
export const SEED_PATTERNS: PatternRow[] = [
  ...HOOKS,
  ...FORMATS,
  ...GENERIC_ANGLES,
  ...INDUSTRY_ANGLES,
  ...PACING,
  ...CAPTIONS,
  ...CTAS,
  ...ENDINGS,
  ...AUDIO,
  ...SIGNALS,
  ...INDIA,
];

/** Angles for one brand: the generic set plus its industry group's set. */
export function anglesFor(rows: PatternRow[], group: IndustryGroup | null): string[] {
  return rows
    .filter((r) => r.dimension === "angle" && (r.industries.length === 0 || (group !== null && r.industries.includes(group))))
    .map((r) => r.template);
}

/** Hooks as the planner uses them: id plus how to write it. */
export function hooksOf(rows: PatternRow[]): Array<{ id: string; how: string }> {
  return rows.filter((r) => r.dimension === "hook").map((r) => ({ id: r.key, how: r.template }));
}

/** The reel-craft rules written for the video writer: pacing, captions, ending, audio, India. */
export function craftRules(rows: PatternRow[], opts: { india: boolean }): string {
  const pick = (d: Dimension) => rows.filter((r) => r.dimension === d).map((r) => r.template);
  const parts = [
    `Pacing: ${pick("pacing").join("; ")}.`,
    `Captions: ${pick("caption").join("; ")}.`,
    `Ending: ${pick("ending").slice(0, 3).join("; ")}.`,
  ];
  if (opts.india) parts.push(`India: ${pick("india").join("; ")}.`);
  return parts.join("\n");
}
