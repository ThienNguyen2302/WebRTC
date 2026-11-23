import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule);
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );
    app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
    await app.listen(Number(process.env.PORT ?? 3001));
}

bootstrap().catch((error: unknown) => {
    Logger.error(
        'Failed to start the API',
        error instanceof Error ? error.stack : String(error),
    );
    process.exitCode = 1;
});