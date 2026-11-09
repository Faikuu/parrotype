import { BadRequestException, PipeTransform } from '@nestjs/common';
import { z, ZodError, ZodTypeAny } from 'zod';

/** Turns zod issues into "field: problem" strings. */
export function formatZodError(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path.join('.') : 'body';
    return `${field}: ${issue.message}`;
  });
}

/** Validates a request value with a zod schema. Failures become a 400 with a message array. */
export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(formatZodError(result.error));
    }
    return result.data;
  }
}
