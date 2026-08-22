import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { AUTH_CONFIGURATION } from './auth.constants';
import {
  type AuthConfiguration,
  clearSessionCookieOptions,
  sessionCookieOptions,
  xsrfCookieOptions,
} from './auth.configuration';
import { Public, SkipXsrf } from './auth.decorators';
import { AuthService, authenticationRequired } from './auth.service';
import type { AuthenticatedRequest, SessionResponse } from './auth.types';
import { LoginDto } from './login.dto';
import { XsrfService } from './xsrf.service';

@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly xsrfService: XsrfService,
    @Inject(AUTH_CONFIGURATION)
    private readonly configuration: AuthConfiguration,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Public()
  @SkipXsrf()
  @UseGuards(ThrottlerGuard)
  async login(
    @Body() request: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const result = await this.authService.login(
      request.identifier,
      request.password,
    );
    response.cookie(
      this.configuration.authCookieName,
      result.token,
      sessionCookieOptions(this.configuration),
    );
    response.cookie(
      this.configuration.xsrfCookieName,
      this.xsrfService.createToken(result.token),
      xsrfCookieOptions(this.configuration),
    );
    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(
      this.configuration.authCookieName,
      clearSessionCookieOptions(this.configuration, true),
    );
    response.clearCookie(
      this.configuration.xsrfCookieName,
      clearSessionCookieOptions(this.configuration, false),
    );
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@Req() request: AuthenticatedRequest): SessionResponse {
    if (!request.authenticatedUser) {
      throw authenticationRequired();
    }
    return { user: request.authenticatedUser };
  }
}
