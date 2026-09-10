import { Router } from 'express';
import { z } from 'zod';
import { loginSchema, registerSchema } from '@socialboost/shared';
import { asyncHandler, requireAuth, validate } from '../../http/middleware.js';
import { badRequest } from '../../lib/errors.js';
import * as authService from './service.js';

const refreshSchema = z.object({ refreshToken: z.string().min(10).max(500) });

export const authRouter: Router = Router();

authRouter.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body, req.get('user-agent'));
    res.status(201).json(result);
  }),
);

authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body.email, req.body.password, req.get('user-agent'));
    res.json(result);
  }),
);

authRouter.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.refresh(req.body.refreshToken, req.get('user-agent'));
    res.json(result);
  }),
);

authRouter.post(
  '/logout',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    await authService.logout(req.body.refreshToken);
    res.status(204).end();
  }),
);

/** Confirms a token is still valid and returns who it belongs to. */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw badRequest('Not authenticated');
    res.json({ user: req.auth });
  }),
);
