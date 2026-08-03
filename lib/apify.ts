// apify-client lädt proxy-agent zur Laufzeit dynamisch via require(), wodurch
// Vercel/Turbopack das Modul nicht ins Lambda-Bundle zieht. Folge: Cron crasht
// mit "Cannot find module 'proxy-agent'". Der explizite Side-Effect-Import
// zwingt den Bundler, proxy-agent mit zu inkludieren. Niemals entfernen.
import "proxy-agent";
import { ApifyClient } from "apify-client";
import type { InstagramData, InstagramPost } from "@/types";
import { extractInstagramHandle } from "@/lib/instagram";

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN! });

interface ApifyPost {
  id?: string;
  timestamp?: string;
  type?: string;
  videoViewCount?: number | null;
  likesCount?: number;
  commentsCount?: number;
  caption?: string;
  url?: string;
  displayUrl?: string;
}

interface ApifyProfile {
  username?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  verified?: boolean;
  isVerified?: boolean;
  profilePicUrl?: string;
  externalUrl?: string;
  latestPosts?: ApifyPost[];
}

export async function scrapeInstagramProfile(handle: string): Promise<InstagramData> {
  const username = extractInstagramHandle(handle);

  const run = await client.actor("apify/instagram-profile-scraper").call({
    usernames: [username],
    resultsLimit: 12,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  if (!items || items.length === 0) {
    throw new Error(`Kein Instagram-Profil gefunden für @${username}`);
  }

  const profile = items[0] as ApifyProfile;

  const instagramData: InstagramData = {
    username: profile.username,
    fullName: profile.fullName,
    biography: profile.biography,
    followersCount: profile.followersCount,
    followsCount: profile.followsCount,
    postsCount: profile.postsCount,
    isVerified: profile.verified ?? profile.isVerified,
    profilePicUrl: profile.profilePicUrl,
    externalUrl: profile.externalUrl,
    scrapedAt: new Date().toISOString(),
    latestPosts: (profile.latestPosts ?? []).map((p): InstagramPost => ({
      id: p.id,
      timestamp: p.timestamp,
      type: p.type,
      videoViewCount: p.videoViewCount ?? null,
      likesCount: p.likesCount,
      commentsCount: p.commentsCount,
      caption: p.caption?.slice(0, 200),
      url: p.url,
      displayUrl: p.displayUrl,
    })),
  };

  return instagramData;
}
