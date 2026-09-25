export class GenericContentSafetyProviderError extends Error {
  constructor(
    message: string,
    readonly kind: 'rejected' | 'unavailable',
  ) {
    super(message);
    this.name = 'GenericContentSafetyProviderError';
  }
}

type GenericModerationResponse = {
  approved?: boolean;
  suggest?: 'pass' | 'review' | 'risky';
  reason?: string;
};

export function genericContentSafetyEnabled() {
  return Boolean(process.env.CONTENT_SAFETY_HTTP_URL?.trim()) ||
    process.env.CONTENT_SAFETY_FAIL_CLOSED === 'true';
}

export async function assertGenericContentSafe(input: {
  userId: string;
  source: string;
  content: string;
}): Promise<void> {
  const endpoint = process.env.CONTENT_SAFETY_HTTP_URL?.trim();
  if (!endpoint) {
    if (process.env.CONTENT_SAFETY_FAIL_CLOSED === 'true') {
      throw new GenericContentSafetyProviderError(
        '内容审核服务暂不可用，请稍后重试',
        'unavailable',
      );
    }
    return;
  }

  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = process.env.CONTENT_SAFETY_HTTP_TOKEN?.trim();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GenericContentSafetyProviderError(
      '内容审核服务暂不可用，请稍后重试',
      'unavailable',
    );
  }

  if (!response.ok) {
    throw new GenericContentSafetyProviderError(
      '内容审核服务暂不可用，请稍后重试',
      'unavailable',
    );
  }

  const result = (await response.json()) as GenericModerationResponse;
  if (result.approved === true || result.suggest === 'pass') return;

  throw new GenericContentSafetyProviderError(
    result.reason || '内容不符合社区规范，请修改后重试',
    result.suggest === 'review' ? 'rejected' : 'rejected',
  );
}
