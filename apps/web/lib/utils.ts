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
