import { QuoteCategory, QuoteItem, QuoteToneProfile } from '../types';

interface ArchiveDoc {
  identifier?: string;
  title?: string | string[];
  description?: string | string[];
  year?: string | number;
  creator?: string | string[];
  subject?: string | string[];
}

interface ArchiveFileEntry {
  name?: string;
  format?: string;
  size?: string;
  length?: string;
}

const stripHtml = (raw: string): string =>
  raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeTextField = (val: string | string[] | undefined): string => {
  if (!val) return '';
  if (Array.isArray(val)) return stripHtml(val.join(' '));
  return stripHtml(String(val));
};

const parseTags = (
  subject: string | string[] | undefined,
  category: Exclude<QuoteCategory, 'All Quotes'>,
  year: number
): string[] => {
  const rawList = Array.isArray(subject)
    ? subject
    : typeof subject === 'string'
      ? subject.split(/[;,]/)
      : [];

  const cleaned = rawList
    .map((s) => stripHtml(s).trim())
    .filter((s) => s.length >= 3 && s.length <= 26)
    .slice(0, 4);

  const decade = year >= 1900 && year <= 2030 ? `${Math.floor(year / 10) * 10}s` : null;
  const fallbackTag = category.replace(' Quotes', '');
  const merged = Array.from(new Set([...cleaned, ...(decade ? [decade] : []), fallbackTag]));
  return merged.slice(0, 5);
};

const inferToneProfile = (
  category: Exclude<QuoteCategory, 'All Quotes'>,
  text: string
): QuoteToneProfile => {
  const lower = text.toLowerCase();
  if (lower.includes('nasa') || lower.includes('apollo') || lower.includes('space') || lower.includes('moon')) {
    return 'space';
  }
  if (category === 'Movie Quotes') return 'cinema';
  if (lower.includes('radio') || lower.includes('broadcast') || lower.includes('newsreel')) {
    return 'radio';
  }
  return 'speech';
};

export const extractArchiveIdentifier = (urlOrId: string): string | null => {
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;

  const detailsMatch = trimmed.match(/archive\.org\/(?:details|embed|download)\/([^/?#]+)/i);
  if (detailsMatch?.[1]) {
    return decodeURIComponent(detailsMatch[1]);
  }

  if (/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
};

export const resolveArchiveMediaUrls = async (
  archiveId: string
): Promise<{ videoUrl?: string; duration?: number }> => {
  try {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(archiveId)}`);
    if (!res.ok) return {};
    const data = await res.json();
    const files: ArchiveFileEntry[] = Array.isArray(data?.files) ? data.files : [];

    // Prefer streaming-friendly MPEG4 derivatives (_512kb.mp4 or standard .mp4)
    const mp4Files = files.filter(
      (f) => typeof f.name === 'string' && f.name.toLowerCase().endsWith('.mp4')
    );

    if (mp4Files.length === 0) return {};

    const preferred =
      mp4Files.find((f) => f.name?.toLowerCase().includes('512kb.mp4')) ||
      mp4Files.sort((a, b) => Number(a.size || 0) - Number(b.size || 0))[0];

    if (!preferred?.name) return {};

    const encodedFile = preferred.name
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');

    const parsedDuration = preferred.length ? Math.round(parseFloat(preferred.length)) : undefined;

    return {
      videoUrl: `https://archive.org/download/${encodeURIComponent(archiveId)}/${encodedFile}`,
      duration: parsedDuration && Number.isFinite(parsedDuration) && parsedDuration > 2 ? parsedDuration : undefined,
    };
  } catch {
    return {};
  }
};

export const fetchArchiveVideoQuotes = async (
  query: string,
  category: Exclude<QuoteCategory, 'All Quotes'> = 'Historical Quotes',
  rows: number = 6
): Promise<QuoteItem[]> => {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const searchExpression = `mediatype:movies AND format:"MPEG4" AND (${cleanQuery})`;
  const params = new URLSearchParams({
    q: searchExpression,
    rows: String(rows),
    output: 'json',
  });
  ['identifier', 'title', 'description', 'year', 'creator', 'subject'].forEach((field) => {
    params.append('fl[]', field);
  });

  const res = await fetch(`https://archive.org/advancedsearch.php?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Internet Archive returned status ${res.status}`);
  }

  const json = await res.json();
  const docs: ArchiveDoc[] = Array.isArray(json?.response?.docs) ? json.response.docs : [];

  const items: QuoteItem[] = [];
  for (const doc of docs) {
    if (!doc.identifier) continue;
    const title = normalizeTextField(doc.title) || doc.identifier;
    const desc = normalizeTextField(doc.description);
    const creator = normalizeTextField(doc.creator) || 'Internet Archive Contributor';
    const yearNum = Number.parseInt(String(doc.year || ''), 10);
    const safeYear = Number.isFinite(yearNum) && yearNum > 1890 ? yearNum : 1965;

    // Extract clean spoken-style excerpt from description or fallback to title
    const excerpt =
      desc.length > 24
        ? desc.length > 210
          ? `${desc.slice(0, 207).trim()}...`
          : desc
        : `Archival film sample: "${title}". Ready for looping, speed control, and tape scratching.`;

    const slug = `ia-${doc.identifier.toLowerCase().replace(/[^a-z0-9-_]+/g, '-')}`;

    items.push({
      id: `ia-${doc.identifier}`,
      slug,
      title,
      speaker: creator,
      year: safeYear,
      sourcePlatform: 'Internet Archive',
      sourceName: 'Internet Archive · Live Video Fetch',
      sourceUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
      archiveId: doc.identifier,
      category,
      duration: 24,
      tags: parseTags(doc.subject, category, safeYear),
      quoteText: excerpt,
      context: desc || `Fetched live from Internet Archive (${doc.identifier}).`,
      toneProfile: inferToneProfile(category, `${title} ${desc}`),
    });
  }

  // Pre-resolve direct MP4 video streams for the first batch in parallel
  await Promise.all(
    items.map(async (item) => {
      if (!item.archiveId) return;
      const resolved = await resolveArchiveMediaUrls(item.archiveId);
      if (resolved.videoUrl) {
        item.videoUrl = resolved.videoUrl;
      }
      if (resolved.duration) {
        item.duration = Math.min(180, Math.max(10, resolved.duration));
      }
    })
  );

  return items;
};
