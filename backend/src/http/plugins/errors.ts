import { IllegalTransitionError } from '@arbiter/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import { AppError } from '../../lib/errors';
import { LlmError } from '../../llm/types';
import { PayPalApiError } from '../../paypal/types';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Maps every failure to a consistent JSON shape with a message the UI can show verbatim. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError | Error>((err, req, reply) => {
    let status = 500;
    let body: ErrorBody = { error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' } };

    if (err instanceof AppError) {
      status = err.statusCode;
      body = { error: { code: err.code, message: err.message, details: err.details } };
    } else if (err instanceof IllegalTransitionError) {
      status = 409;
      body = { error: { code: 'ILLEGAL_TRANSITION', message: `This action is not allowed while the milestone is ${err.from}` } };
    } else if (err instanceof PayPalApiError) {
      status = err.status >= 500 ? 502 : 422;
      body = { error: { code: 'PAYPAL_ERROR', message: `PayPal: ${err.message}`, details: { issue: err.issue, debugId: err.debugId } } };
    } else if (err instanceof LlmError) {
      status = 502;
      body = { error: { code: 'LLM_ERROR', message: `The AI model could not complete the request: ${err.message}` } };
    } else if ('statusCode' in err && typeof err.statusCode === 'number' && err.statusCode < 500) {
      status = err.statusCode;
      body = { error: { code: (err as FastifyError).code ?? 'BAD_REQUEST', message: err.message } };
    }

    if (status >= 500) req.log.error({ err }, 'request failed');
    else req.log.info({ code: body.error.code, msg: body.error.message }, 'request rejected');
    void reply.status(status).send(body);
  });
}
