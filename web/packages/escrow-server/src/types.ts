import { Request } from 'express';

import { UserType } from './db';

export type RequestWithUser = Request & { user: UserType };