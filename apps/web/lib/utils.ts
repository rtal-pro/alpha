import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines clsx and tailwind-merge for conditional class names
 * with proper Tailwind class deduplication.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a date string or Date object into a human-readable format.
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Returns Tailwind color classes for a given status string.
 */
export function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'healthy':
    case 'generated':
    case 'completed':
    case 'success':
      return 'text-green-400 bg-green-400/10 border-green-400/20';
    case 'degraded':
    case 'generating':
    case 'in_progress':
    case 'running':
      return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
    case 'broken':
    case 'failed':
    case 'error':
      return 'text-red-400 bg-red-400/10 border-red-400/20';
    case 'pending':
    case 'queued':
      return 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20';
    case 'locked':
      return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    default:
      return 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20';
  }
}

/**
 * Sanitize HTML to prevent XSS attacks.
 * Allows safe markup tags (headings, paragraphs, lists, links, code, etc.)
 * and strips all dangerous elements and attributes (script, on*, iframe, etc.).
 */
export function sanitizeHtml(html: string): string {
  // Allowed tags for rendered LLM content (markdown-like output)
  const ALLOWED_TAGS = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'strong', 'b', 'em', 'i', 'u', 's', 'del',
    'a', 'code', 'pre', 'blockquote',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span', 'sup', 'sub', 'mark',
    'img',
  ]);

  // Allowed attributes per tag
  const ALLOWED_ATTRS: Record<string, Set<string>> = {
    a: new Set(['href', 'title', 'target', 'rel']),
    img: new Set(['src', 'alt', 'width', 'height']),
    td: new Set(['colspan', 'rowspan']),
    th: new Set(['colspan', 'rowspan', 'scope']),
  };

  // Remove script tags and their content entirely
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove style tags and their content
  clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove all event handler attributes (on*)
  clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Remove javascript: and data: protocol in attributes
  clean = clean.replace(/(?:href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, '');
  clean = clean.replace(/(?:href|src|action)\s*=\s*(?:"data:[^"]*"|'data:[^']*')/gi, '');

  // Strip disallowed tags but keep their text content
  clean = clean.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tagName) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';

    // For closing tags, just return the clean closing tag
    if (match.startsWith('</')) return `</${tag}>`;

    // For opening tags, filter attributes
    const allowedAttrs = ALLOWED_ATTRS[tag];
    if (!allowedAttrs) {
      // Self-closing check
      return match.endsWith('/>') ? `<${tag} />` : `<${tag}>`;
    }

    // Parse and filter attributes
    const attrRegex = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    const attrs: string[] = [];
    let attrMatch;
    while ((attrMatch = attrRegex.exec(match)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
      if (allowedAttrs.has(attrName)) {
        // For href, ensure no javascript: protocol
        if (attrName === 'href' || attrName === 'src') {
          const trimmed = attrValue.trim().toLowerCase();
          if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) continue;
        }
        attrs.push(`${attrName}="${attrValue}"`);
      }
    }

    // For links, force rel="noopener noreferrer" and target="_blank"
    if (tag === 'a') {
      if (!attrs.some(a => a.startsWith('rel='))) {
        attrs.push('rel="noopener noreferrer"');
      }
      if (!attrs.some(a => a.startsWith('target='))) {
        attrs.push('target="_blank"');
      }
    }

    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
    return match.endsWith('/>') ? `<${tag}${attrStr} />` : `<${tag}${attrStr}>`;
  });

  return clean;
}
