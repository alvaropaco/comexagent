import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

@Global()
@Module({
  imports: [
    ConfigModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const primary =
          config.get<string>('DB_MONGO_URI') ||
          config.get<string>('MONGODB_URI') ||
          config.get<string>('MONGO_URI');
        const fallback =
          config.get<string>('MONGODB_URI_FALLBACK') ||
          config.get<string>('MONGO_URI_FALLBACK');
        const uri = primary || fallback;

        if (!uri) {
          throw new Error(
            'Missing Mongo URI env (DB_MONGO_URI, MONGODB_URI, MONGO_URI, or fallback variants)',
          );
        }

        const maxPoolSize = Number(
          config.get<string>('MONGO_MAX_POOL_SIZE') ?? '10',
        );
        const serverSelectionTimeoutMS = Number(
          config.get<string>('MONGO_SERVER_SELECTION_TIMEOUT_MS') ?? '5000',
        );
        const socketTimeoutMS = Number(
          config.get<string>('MONGO_SOCKET_TIMEOUT_MS') ?? '45000',
        );

        const debug =
          (config.get<string>('MONGO_DEBUG') ?? '').toLowerCase() === 'true';
        if (debug) {
          Logger.log('Mongoose debug logging enabled', 'MongoModule');
        }

        return {
          uri,
          retryAttempts: Number(
            config.get<string>('MONGO_RETRY_ATTEMPTS') ?? '10',
          ),
          retryDelay: Number(
            config.get<string>('MONGO_RETRY_DELAY_MS') ?? '1000',
          ),
          maxPoolSize,
          serverSelectionTimeoutMS,
          socketTimeoutMS,
          autoIndex:
            (config.get<string>('MONGO_AUTO_INDEX') ?? 'true').toLowerCase() ===
            'true',
          connectionFactory: (connection) => {
            connection.set('debug', debug);
            return connection;
          },
        };
      },
    }),
  ],
  exports: [MongooseModule],
})
export class MongoModule {}
