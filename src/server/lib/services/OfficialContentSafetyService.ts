import {
  assertGenericContentSafe,
  genericContentSafetyEnabled,
  GenericContentSafetyProviderError,
} from '@server/lib/contentSafety/GenericContentSafetyProvider';
import { getCurrentContext } from '@server/lib/http/context';
import { recordContentModerationEvent } from '@server/lib/services/ContentModerationAuditService';
import { textFilter } from '@server/lib/services/textFilter';

export class OfficialContentSafetyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 503,
    readonly code: 'CONTENT_REJECTED' | 'CONTENT_CHECK_UNAVAILABLE',
  ) {
    super(message);
    this.name = 'OfficialContentSafetyError';
  }
}

function compact(content: string | readonly string[]) {
  return (typeof content === 'string' ? [content] : content)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function recordSafely(input: Parameters<typeof recordContentModerationEvent>[0]) {
  try {
    await recordContentModerationEvent(input);
  } catch (error) {
    console.error('[content-moderation-audit] failed to persist event', {
      source: input.source,
      decision: input.decision,
      error,
    });
  }
}

export function collectModerationText(value: unknown, limit = 12_000): string {
  const parts: string[] = [];
  let used = 0;
  const visit = (current: unknown, depth: number) => {
    if (used >= limit || depth > 8 || current == null) return;
    if (typeof current === 'string') {
      const text = current.trim();
      if (!text) return;
      const remaining = limit - used;
      const next = text.slice(0, remaining);
      parts.push(next);
      used += next.length + 1;
      return;
    }
    if (Array.isArray(current)) {
      for (const item of current) visit(item, depth + 1);
      return;
    }
    if (typeof current === 'object') {
      for (const item of Object.values(current as Record<string, unknown>)) {
        visit(item, depth + 1);
      }
    }
  };
  visit(value, 0);
  return parts.join('\n');
}

export function shouldModerateGeneratedContent() {
  return genericContentSafetyEnabled();
}

export async function assertOfficialContentSafe(input: {
  userId: string;
  source: string;
  content: string | readonly string[];
  rejectLocal?: boolean;
}) {
  const values = compact(input.content);
  if (!values.length) return;
  const content = values.join('\n');

  if (input.rejectLocal !== false) {
    for (const value of values) {
      if (textFilter.mask(value).changed) {
        await recordSafely({
          userId: input.userId,
          source: input.source,
          provider: 'local_text_filter',
          decision: 'local_reject',
          content,
          reason: 'local_text_filter',
        });
        throw new OfficialContentSafetyError(
          '内容不符合社区规范，请修改后重试',
          400,
          'CONTENT_REJECTED',
        );
      }
    }
  }

  if (!genericContentSafetyEnabled()) return;

  const startedAt = Date.now();
  try {
    await assertGenericContentSafe({
      userId: input.userId,
      source: input.source,
      content,
    });
    if (process.env.CONTENT_SAFETY_LOG_PASSES === 'true') {
      await recordSafely({
        userId: input.userId,
        source: input.source,
        provider: 'generic_http',
        decision: 'pass',
        content,
        durationMs: Date.now() - startedAt,
      });
    }
  } catch (error) {
    if (error instanceof GenericContentSafetyProviderError) {
      const rejected = error.kind === 'rejected';
      await recordSafely({
        userId: input.userId,
        source: input.source,
        provider: 'generic_http',
        decision: rejected ? 'reject' : 'unavailable',
        content,
        reason: error.message,
        durationMs: Date.now() - startedAt,
      });
      if (rejected) {
        throw new OfficialContentSafetyError(
          error.message || '内容不符合社区规范，请修改后重试',
          400,
          'CONTENT_REJECTED',
        );
      }
      throw new OfficialContentSafetyError(
        '内容审核服务暂不可用，请稍后重试',
        503,
        'CONTENT_CHECK_UNAVAILABLE',
      );
    }
    throw error;
  }
}

export async function assertOfficialGeneratedContentSafe(input: {
  source: string;
  content: string;
}) {
  if (!input.content.trim()) return;
  let userId = 'system';
  try {
    const user = getCurrentContext().get('user') as { id?: string } | undefined;
    if (user?.id) userId = user.id;
  } catch {
    // Background generation has no Hono request context.
  }
  await assertOfficialContentSafe({
    userId,
    source: input.source,
    content: input.content,
    rejectLocal: false,
  });
}
