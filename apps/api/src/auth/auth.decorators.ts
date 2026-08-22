import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY, SKIP_XSRF_KEY } from './auth.constants';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const SkipXsrf = () => SetMetadata(SKIP_XSRF_KEY, true);
