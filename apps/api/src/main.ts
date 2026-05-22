import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './shared/interface/domain-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // CORS: explicit origin + credentials so cross-origin fetches from the UI
  // (especially the tunnel-routed OAuth round-trip) carry cookies correctly.
  // `Access-Control-Allow-Origin: *` cannot be combined with credentials.
  app.enableCors({
    origin: process.env.UI_BASE_URL || 'http://localhost:3000',
    credentials: true,
  });
  app.use(cookieParser());
  app.useGlobalFilters(new DomainExceptionFilter());
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`api listening on http://localhost:${port}`);
}

bootstrap();
