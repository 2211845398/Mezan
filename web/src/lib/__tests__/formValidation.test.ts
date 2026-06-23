import { describe, expect, it } from 'vitest';

import { localizedValidationItemMessage } from '@/api/errorMessages';
import {
  collectValidationToasts,
  mapClientFieldErrorMessage,
} from '@/lib/formValidation';
import i18n from '@/i18n';

describe('localizedValidationItemMessage', () => {
  it('maps normalized required code to validation_required', () => {
    const t = i18n.getFixedT('ar', 'common');
    const msg = localizedValidationItemMessage(
      { code: 'required', field: 'email', path: 'email', msg: 'Field required', type: 'missing' },
      t,
    );
    expect(msg).toBe(t('errors.validation_required'));
  });

  it('maps normalized invalid_email code', () => {
    const t = i18n.getFixedT('en', 'common');
    const msg = localizedValidationItemMessage(
      {
        code: 'invalid_email',
        field: 'email',
        path: 'email',
        msg: 'value is not a valid email',
        type: 'value_error.email',
      },
      t,
    );
    expect(msg).toBe(t('errors.validation_email'));
  });
});

describe('formValidation helpers', () => {
  it('maps client required messages', () => {
    const t = i18n.getFixedT('ar', 'common');
    expect(mapClientFieldErrorMessage({ type: 'custom', message: 'Required' }, t)).toBe(
      t('errors.validation_required'),
    );
  });

  it('maps client email invalid messages', () => {
    const t = i18n.getFixedT('ar', 'common');
    expect(
      mapClientFieldErrorMessage({ type: 'custom', message: 'Invalid email' }, t),
    ).toBe(t('errors.validation_email_invalid'));
  });

  it('collects localized email invalid messages from schema copy', () => {
    const tc = i18n.getFixedT('ar', 'common');
    const message = tc('errors.validation_email_invalid');
    const messages = collectValidationToasts(
      { contact_email: { type: 'custom', message } },
      tc,
      ['contact_email'],
    );
    expect(messages).toEqual([message]);
  });

  it('collects unique validation messages in field order', () => {
    const t = i18n.getFixedT('en', 'common');
    const messages = collectValidationToasts(
      {
        email: { type: 'custom', message: 'Required' },
        password: { type: 'custom', message: 'Required' },
      },
      t,
      ['email', 'password'],
    );
    expect(messages).toEqual([t('errors.validation_required')]);
  });
});
