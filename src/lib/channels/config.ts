/** Client-safe channel metadata. No secrets here. */

export type ChannelKind = "oauth" | "webhook" | "manual";

export interface ChannelDef {
  key: string;
  label: string;
  kind: ChannelKind;
  /** Human note shown in the connections UI. */
  note: string;
}

export const CHANNELS: ChannelDef[] = [
  {
    key: "LinkedIn",
    label: "LinkedIn",
    kind: "oauth",
    note: "Posts articles and image updates to your member or organization page.",
  },
  {
    key: "YouTube",
    label: "YouTube",
    kind: "oauth",
    note: "Uploads generated videos to your channel.",
  },
  {
    key: "Facebook",
    label: "Facebook",
    kind: "oauth",
    note: "Publishes to a Facebook Page you manage.",
  },
  {
    key: "Instagram",
    label: "Instagram",
    kind: "oauth",
    note: "Requires a Business/Creator account linked to a Facebook Page.",
  },
  { key: "X", label: "X (Twitter)", kind: "oauth", note: "Requires a paid X API tier to post." },
  {
    key: "Pinterest",
    label: "Pinterest",
    kind: "oauth",
    note: "Creates pins on your default board.",
  },
  {
    key: "TikTok",
    label: "TikTok",
    kind: "oauth",
    note: "Uploads videos. Unaudited apps can only create private drafts.",
  },
  {
    key: "Website",
    label: "Website",
    kind: "webhook",
    note: "Sends each blog to your own site endpoint, signed with a shared secret.",
  },
  {
    key: "Quora",
    label: "Quora",
    kind: "manual",
    note: "No public posting API — publishing is recorded for manual posting.",
  },
  {
    key: "Medium",
    label: "Medium",
    kind: "manual",
    note: "Medium closed its write API — publishing is recorded for manual posting.",
  },
];

export const CHANNEL_BY_KEY = Object.fromEntries(CHANNELS.map((c) => [c.key, c])) as Record<
  string,
  ChannelDef
>;

export const OAUTH_CHANNELS = CHANNELS.filter((c) => c.kind === "oauth").map((c) => c.key);

export interface ChannelConnectionStatus {
  channel: string;
  connected: boolean;
  accountName: string;
  status: string;
  expiresAt: string | null;
  meta: Record<string, string>;
}
