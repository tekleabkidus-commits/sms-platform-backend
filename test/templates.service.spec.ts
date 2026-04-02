import { BadRequestException } from '@nestjs/common';
import { TemplatesService } from '../src/templates/templates.service';

describe('TemplatesService', () => {
  const service = new TemplatesService({} as never);

  it('extracts merge fields without duplicates', () => {
    expect(service.extractMergeFields('Hi {{name}}, OTP {{code}} {{code}}')).toEqual(['name', 'code']);
  });

  it('renders a template with merge data', () => {
    expect(
      service.render('Your OTP is {{code}} and expires in {{minutes}} minutes.', {
        code: '815204',
        minutes: 5,
      }),
    ).toBe('Your OTP is 815204 and expires in 5 minutes.');
  });

  it('throws when merge fields are missing', () => {
    expect(() => service.render('Hello {{name}}', {})).toThrow(BadRequestException);
  });
});
