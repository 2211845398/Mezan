import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import i18n from '@/i18n';

describe('SupplierForm email validation', () => {
  it('rejects empty email', () => {
    const tc = i18n.getFixedT('ar', 'common');
    const schema = z.object({
      contact_email: z
        .string()
        .min(1, tc('errors.validation_email'))
        .email(tc('errors.validation_email_invalid')),
    });

    const result = schema.safeParse({ contact_email: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email with unified Arabic message', () => {
    const tc = i18n.getFixedT('ar', 'common');
    const schema = z.object({
      contact_email: z
        .string()
        .min(1, tc('errors.validation_email'))
        .email(tc('errors.validation_email_invalid')),
    });

    const result = schema.safeParse({ contact_email: 'bad@' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(tc('errors.validation_email_invalid'));
    }
  });
});
